import { createElement } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acotarACuba, acotarBbox, usarMapa } from './usarMapa';
import MapaExplorar from './MapaExplorar';
import { mapaApi } from '../../services/api';
import type { Bbox, MapaRespuesta, PuntoMapa } from '../../types';

// Solo se sustituye mapaApi.buscar: con vi.importActual el resto del módulo (apiError,
// tokenStore, api...) sigue siendo el real. Reemplazar el módulo entero dejaba `apiError`
// en undefined — nada lo notaba porque ninguna prueba forzaba el `.catch` del hook, pero la
// próxima que sí lo haga habría fallado con «apiError is not a function» en vez de probar el error.
vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...real, mapaApi: { buscar: vi.fn(), celda: vi.fn() } };
});

const bbox: Bbox = { sur: 22, oeste: -83, norte: 23, este: -82 };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('acotarBbox', () => {
  // Móvil en vertical a zoom 7: el rectángulo visible es alto y se sale de los 19–24° que acepta
  // /api/mapa (18,48–24,50 medido en producción). El servidor responde 400 y el mapa se quedaba
  // vacío con «Área del mapa no válida». Fuera de Cuba no hay nada que mostrar: se recorta.
  it('recorta un rectángulo que se sale de Cuba', () => {
    expect(acotarBbox({ sur: 18.48, oeste: -81.47, norte: 24.5, este: -77.73 }))
      .toEqual({ sur: 19, oeste: -81.47, norte: 24, este: -77.73 });
  });
  it('deja intacto lo que ya cabe', () => {
    const b = { sur: 22.9, oeste: -82.6, norte: 23.3, este: -82.1 };
    expect(acotarBbox(b)).toEqual(b);
  });
  it('recorta también en longitud', () => {
    expect(acotarBbox({ sur: 21, oeste: -86.2, norte: 22, este: -73.0 }))
      .toEqual({ sur: 21, oeste: -85.5, norte: 22, este: -73.5 });
  });
});

describe('acotarACuba', () => {
  it('deja una posición cubana como está', () => {
    expect(acotarACuba(23.1, -82.38)).toEqual({ lat: 23.1, lng: -82.38 });
  });
  it('acota una posición de Miami al borde de Cuba', () => {
    // Un cubano en Miami, o detrás de una VPN: centrar ahí daría un bbox que el
    // endpoint rechaza con 400, y el usuario vería un error en vez de un mapa.
    const p = acotarACuba(25.77, -80.19);
    expect(p.lat).toBeLessThanOrEqual(24);
    expect(p.lat).toBeGreaterThanOrEqual(19);
  });
  it('acota una posición al oeste de Cuba', () => {
    expect(acotarACuba(23, -90).lng).toBeGreaterThanOrEqual(-85.5);
  });
});

describe('usarMapa', () => {
  beforeEach(() => {
    vi.mocked(mapaApi.buscar).mockReset();
  });

  it('descarta la respuesta de una petición cancelada', async () => {
    // Lanza una carga de zona lenta, luego una de texto rápida, y comprueba que
    // los puntos que quedan son los del texto, no los de la zona.
    let resolverZona!: (v: MapaRespuesta) => void;
    const zonaPromise = new Promise<MapaRespuesta>((res) => { resolverZona = res; });
    const puntoZona: PuntoMapa = { id: 'zona', tipo: 'oficio', nombre: 'De la zona', lat: 22.5, lng: -82.5, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: '' };
    const puntoTexto: PuntoMapa = { id: 'texto', tipo: 'oficio', nombre: 'Del texto', lat: 22.5, lng: -82.5, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: '' };

    vi.mocked(mapaApi.buscar)
      .mockImplementationOnce(() => zonaPromise) // primera llamada: carga de zona, lenta
      .mockImplementationOnce(() => Promise.resolve({ puntos: [puntoTexto], celda: 0.01, hay_mas: false })); // segunda: texto, rápida

    const { result, rerender } = renderHook(
      ({ q }) => usarMapa({ tab: 'servicios', q, category: '' }),
      { initialProps: { q: '' } },
    );

    act(() => { result.current.alMover(bbox, true); }); // zoom: recarga sola con antirrebote de 250 ms
    await espera(280); // pasa el antirrebote: sale la carga (lenta) de zona

    expect(mapaApi.buscar).toHaveBeenCalledTimes(1);

    rerender({ q: 'plomero' }); // escribir: recarga sola con antirrebote de 300 ms
    await espera(330); // pasa el antirrebote de texto; su respuesta (rápida) ya volvió

    expect(mapaApi.buscar).toHaveBeenCalledTimes(2);
    expect(result.current.puntos).toEqual([puntoTexto]);

    await act(async () => {
      resolverZona({ puntos: [puntoZona], celda: 0.01, hay_mas: false }); // la de zona llega tarde
      await espera(10);
    });

    // La petición de zona fue cancelada antes de lanzar la de texto: su respuesta tardía se descarta.
    expect(result.current.puntos).toEqual([puntoTexto]);
  });

  it('arrastrar el mapa recarga solo, con su antirrebote, sin botón de por medio', async () => {
    vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [], celda: 0.01, hay_mas: false });

    const { result } = renderHook(() => usarMapa({ tab: 'servicios', q: '', category: '' }));

    act(() => { result.current.alMover(bbox, false); });
    await act(async () => { await espera(280); });
    // Aún dentro del antirrebote del paneo (500 ms): un arrastre no debe pedir a cada movimiento.
    expect(mapaApi.buscar).toHaveBeenCalledTimes(0);

    await act(async () => { await espera(300); });
    expect(mapaApi.buscar).toHaveBeenCalledTimes(1);
  });

  it('varios arrastres seguidos hacen una sola petición, con la última zona', async () => {
    vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [], celda: 0.01, hay_mas: false });

    const { result } = renderHook(() => usarMapa({ tab: 'servicios', q: '', category: '' }));
    const ultima = { sur: 21, oeste: -80, norte: 21.4, este: -79.5 };

    act(() => { result.current.alMover({ ...bbox, sur: 20 }, false); });
    await act(async () => { await espera(200); });
    act(() => { result.current.alMover(ultima, false); });
    await act(async () => { await espera(600); });

    expect(mapaApi.buscar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mapaApi.buscar).mock.calls[0][0]).toEqual(ultima);
  });

  it('cargarCelda pide con la zona que se PINTÓ, no con la que el mapa lleva ahora', async () => {
    // Tras arrastrar, el mapa ya reportó otra zona pero los «+N» en pantalla siguen siendo los de
    // la anterior: pedir la celda con el rectángulo nuevo cambiaría el tamaño de celda que el
    // servidor deduce y la lista no cuadraría con el número que el usuario tocó.
    vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [], celda: 0.01, hay_mas: false });
    vi.mocked(mapaApi.celda).mockResolvedValue({ puntos: [], hay_mas: false } as never);

    const { result } = renderHook(() => usarMapa({ tab: 'servicios', q: '', category: '' }));
    const pintada = { sur: 22.9, oeste: -82.6, norte: 23.3, este: -82.1 };

    act(() => { result.current.alMover(pintada, true); });
    await act(async () => { await espera(280); });
    expect(mapaApi.buscar).toHaveBeenCalledTimes(1);

    act(() => { result.current.alMover({ sur: 21, oeste: -80, norte: 21.4, este: -79.5 }, false); }); // arrastre, aún sin recargar
    await act(async () => { await result.current.cargarCelda(3, 4); });

    expect(vi.mocked(mapaApi.celda).mock.calls[0][0]).toEqual(pintada);
  });
});

describe('MapaExplorar', () => {
  beforeEach(() => {
    vi.mocked(mapaApi.buscar).mockReset();
  });

  it('pide el área inicial al montar, cuenta como zoom y no dobla la carga', async () => {
    // `MapContainer` (react-leaflet) llama a `map.setView()` de forma síncrona dentro del
    // callback de ref del propio div, en un punto en que `context` todavía es null y `children`
    // (con nuestro <Eventos>) aún no se montó. Ese `setView` dispara `moveend`/`zoomend` en el
    // acto (Leaflet: `_resetView` → `fire('load')` con `_loaded` ya en true), así que el
    // `useMapEvents` de `Eventos` — que engancha sus listeners en un `useEffect`, siempre
    // posterior al primer commit — nunca los ve. Sin un efecto de montaje aparte, el mapa se
    // abre sin haber pedido nunca su primera área. Esta prueba monta el componente real (no el
    // hook) para probar justo esa costura entre React y Leaflet, la única parte que las pruebas
    // del hook no pueden ver.
    vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [], celda: 0.01, hay_mas: false });

    render(createElement(MapaExplorar, { tab: 'servicios', q: '', category: '', onAbrir: () => {}, onAbrirLista: () => {} }));

    await act(async () => { await espera(280); }); // pasa el antirrebote de zoom (250 ms)

    expect(mapaApi.buscar).toHaveBeenCalledTimes(1); // una sola carga: whenReady/zoomend real no la dobla
    // Si la carga inicial hubiera entrado por la rama de paneo (regla 2), el mapa se abriría sin
    // datos y con el botón puesto en vez de con la zona ya pedida.
    expect(screen.queryByText('Buscar en esta zona')).toBeNull();
  });

  // Hasta ahora `cargarCelda` no tenía `.catch` ni en el hook ni en quien lo llamaba: un fallo de
  // red era un rechazo no capturado y el usuario tocaba un grupo sin que pasara NADA — ni panel,
  // ni mensaje. En la conexión que esta app apunta a servir, eso no es el caso raro.
  it('si /mapa/celda falla, se abre la lista con el error en vez de no pasar nada', async () => {
    vi.mocked(mapaApi.buscar).mockResolvedValue({
      puntos: [{ id: 'p1', tipo: 'oficio', nombre: 'Grupo', lat: 23, lng: -82, plan: 'free', aproximado: false, cy: 1, cx: 1, detras: 2, resumen: 'Varios negocios' }],
      celda: 0.01,
      hay_mas: false,
    });
    vi.mocked(mapaApi.celda).mockRejectedValue(new Error('red caída'));
    const onAbrirLista = vi.fn();

    const { container } = render(createElement(MapaExplorar, {
      tab: 'servicios', q: '', category: '', onAbrir: () => {}, onAbrirLista,
    }));
    await act(async () => { await espera(280); });

    const pin = container.querySelector('.leaflet-marker-icon');
    expect(pin).toBeTruthy();
    await act(async () => { (pin as HTMLElement).click(); await espera(10); });

    expect(onAbrirLista).toHaveBeenCalledWith([], expect.stringContaining('No pudimos'));
  });

  // El contrato que HojaPunto dejó escrito y que nunca llegó a cumplirse: con la hoja abierta,
  // este botón quedaba debajo de ella.
  it('«Cerca de mí» se coloca leyendo --hoja-punto-alto, para no quedar bajo la hoja', async () => {
    vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [], celda: 0.01, hay_mas: false });
    // Acotado a su propio contenedor: este fichero no limpia el DOM entre pruebas, así que una
    // búsqueda global encontraría también los mapas de las pruebas anteriores.
    const { container } = render(createElement(MapaExplorar, { tab: 'servicios', q: '', category: '', onAbrir: () => {}, onAbrirLista: () => {} }));
    await act(async () => { await espera(280); });

    const boton = Array.from(container.querySelectorAll('button')).find((b) => /Cerca de mí/.test(b.textContent ?? ''))!;
    expect(boton).toBeTruthy();
    expect(boton.getAttribute('style')).toContain('--hoja-punto-alto');
  });
});
