import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PuntoMapa } from '@oficio/shared';
import { acotarACuba, acotarBbox, usarMapa } from '../src/lib/mapa';

// El archivo es .ts (no .tsx: `jest.config.js` solo mira `test/**/*.test.ts`), así que se monta
// el hook con `createElement` en vez de JSX — el mismo truco que un `renderHook` casero.
function montarHook(props: { tab: string; q: string; category: string }) {
  let actual!: ReturnType<typeof usarMapa>;
  function Prueba(p: typeof props) {
    actual = usarMapa(p);
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(createElement(Prueba, props)); });
  return {
    get estado() { return actual; },
    actualizar(p: typeof props) { act(() => { renderer.update(createElement(Prueba, p)); }); },
    desmontar() { act(() => { renderer.unmount(); }); },
  };
}

type LlamadaFetch = { url: string; signal: AbortSignal; resolver: (r: Response) => void; rechazar: (e: unknown) => void };

// Un fetch controlable a mano: cada llamada queda pendiente hasta que el test decida resolverla o
// rechazarla, y se rechaza sola (como el fetch real) en cuanto se aborta su señal.
function fetchControlable() {
  const llamadas: LlamadaFetch[] = [];
  const fetchMock = jest.fn((url: string, opts: { signal: AbortSignal }) => new Promise<Response>((resolver, rechazar) => {
    llamadas.push({ url, signal: opts.signal, resolver, rechazar });
    opts.signal.addEventListener('abort', () => rechazar(Object.assign(new Error('Abortado'), { name: 'AbortError' })));
  }));
  return { fetchMock, llamadas };
}

function respuestaFalsa(puntos: PuntoMapa[], hayMas = false): Response {
  return { ok: true, json: async () => ({ puntos, celda: 0.01, hay_mas: hayMas }) } as unknown as Response;
}

const puntoFalso = (id: string): PuntoMapa => ({ id, tipo: 'oficio', nombre: 'Ana', lat: 20, lng: -79, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: 'x' });
const BBOX_A = { sur: 20, oeste: -80, norte: 21, este: -79 };
const BBOX_B = { sur: 22, oeste: -78, norte: 23, este: -77 };

// Flush de las promesas encoladas por el mock de fetch tras avanzar el reloj falso: `act` async
// espera un tick, y como el mock resuelve en microtareas, dos son suficientes para que el
// `.then`/`.catch` de `cargar()` corra y actualice el estado antes de que el test lo lea.
async function avanzarYVaciar(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('acotarBbox', () => {
  // Un teléfono en vertical a zoom 6,3 ve más latitud que la isla: sin recortar, /api/mapa
  // responde 400 y el mapa se abre vacío (pasó en la web, 29-sep).
  it('recorta un rectángulo que se sale de Cuba', () => {
    expect(acotarBbox({ sur: 17.2, oeste: -86.1, norte: 25.9, este: -72.9 })).toEqual({ sur: 19, oeste: -85.5, norte: 24, este: -73.5 });
  });
  it('deja intacto lo que ya cabe', () => {
    expect(acotarBbox(BBOX_A)).toEqual(BBOX_A);
  });
});

describe('acotarACuba', () => {
  it('deja pasar una coordenada ya dentro de Cuba', () => {
    expect(acotarACuba(21, -79)).toEqual({ lat: 21, lng: -79 });
  });

  it('un cubano en Miami (fuera por el norte) se acota al borde norte de Cuba', () => {
    expect(acotarACuba(25.76, -80.19)).toEqual({ lat: 24, lng: -80.19 });
  });

  it('acota por los cuatro bordes a la vez con una VPN lejana', () => {
    expect(acotarACuba(40, -60)).toEqual({ lat: 24, lng: -73.5 });
    expect(acotarACuba(10, -90)).toEqual({ lat: 19, lng: -85.5 });
  });
});

describe('usarMapa', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('el zoom recarga solo a los 250 ms, ni un ms antes', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    expect(fetchMock).not.toHaveBeenCalled();
    await avanzarYVaciar(249);
    expect(fetchMock).not.toHaveBeenCalled();
    await avanzarYVaciar(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(llamadas[0].url).searchParams.get('bbox')).toBe('20,-80,21,-79');

    h.desmontar();
  });

  it('arrastrar recarga solo a los 500 ms de soltar, ni un ms antes (decisión de Dariel, 29-sep)', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, false); });
    await avanzarYVaciar(499);
    expect(fetchMock).not.toHaveBeenCalled();
    await avanzarYVaciar(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(llamadas[0].url).searchParams.get('bbox')).toBe('20,-80,21,-79');

    h.desmontar();
  });

  it('varios arrastres seguidos hacen UNA petición, con la última zona', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, false); });
    await avanzarYVaciar(300);
    act(() => { h.estado.alMoverMapa(BBOX_B, false); });
    await avanzarYVaciar(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(llamadas[0].url).searchParams.get('bbox')).toBe('22,-78,23,-77');

    h.desmontar();
  });

  it('«Reintentar» (buscarZonaVisible) carga de inmediato, sin esperar el antirrebote', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.buscarZonaVisible(BBOX_A); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { llamadas[0].resolver(respuestaFalsa([puntoFalso('p1')])); await Promise.resolve(); await Promise.resolve(); });
    expect(h.estado.puntos.map((p) => p.id)).toEqual(['p1']);

    h.desmontar();
  });

  it('escribir (q/category/tab) recarga sola a los 300 ms, reusando el último bbox visible', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    // Primero hace falta un bbox conocido — como si el mapa ya hubiera cargado una vez.
    act(() => { h.estado.buscarZonaVisible(BBOX_A); });
    await act(async () => { llamadas[0].resolver(respuestaFalsa([])); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    h.actualizar({ tab: 'servicios', q: 'electricista', category: '' });
    await avanzarYVaciar(299);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await avanzarYVaciar(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(llamadas[1].url).searchParams.get('q')).toBe('electricista');
    // El texto reusa el bbox que ya se conocía — no hace falta que el usuario vuelva a mover el mapa.
    expect(new URL(llamadas[1].url).searchParams.get('bbox')).toBe('20,-80,21,-79');

    h.desmontar();
  });

  it('una petición en vuelo se cancela con la siguiente y su respuesta tardía se descarta', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.buscarZonaVisible(BBOX_A); });
    const primera = llamadas[0];
    act(() => { h.estado.buscarZonaVisible(BBOX_B); });
    expect(primera.signal.aborted).toBe(true);

    await act(async () => {
      llamadas[1].resolver(respuestaFalsa([puntoFalso('fresco')]));
      // La primera llega tarde, con datos distintos: si no se descartara, pintaría esto encima.
      primera.resolver(respuestaFalsa([puntoFalso('viejo')]));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(h.estado.puntos.map((p) => p.id)).toEqual(['fresco']);
    // Cancelada porque llegó otra petición (no por tiempo de espera): no es un error que mostrar.
    expect(h.estado.error).toBe(false);
    expect(h.estado.cargando).toBe(false);

    h.desmontar();
  });

  it('si el servidor no responde en 20 s, se cancela, se suelta `cargando` y se puede reintentar', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.buscarZonaVisible(BBOX_A); });
    expect(h.estado.cargando).toBe(true);

    await avanzarYVaciar(19999);
    expect(llamadas[0].signal.aborted).toBe(false);
    expect(h.estado.cargando).toBe(true);

    await avanzarYVaciar(1);
    expect(llamadas[0].signal.aborted).toBe(true);
    expect(h.estado.cargando).toBe(false);
    expect(h.estado.error).toBe(true);

    h.desmontar();
  });
});
