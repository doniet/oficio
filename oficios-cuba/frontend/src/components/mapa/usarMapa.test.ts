import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acotarACuba, usarMapa } from './usarMapa';
import { mapaApi } from '../../services/api';
import type { Bbox, MapaRespuesta, PuntoMapa } from '../../types';

vi.mock('../../services/api', () => ({
  mapaApi: { buscar: vi.fn() },
}));

const bbox: Bbox = { sur: 22, oeste: -83, norte: 23, este: -82 };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const puntoZona: PuntoMapa = { id: 'zona', tipo: 'oficio', nombre: 'De la zona', lat: 22.5, lng: -82.5, plan: 'free', detras: 0, resumen: '' };
    const puntoTexto: PuntoMapa = { id: 'texto', tipo: 'oficio', nombre: 'Del texto', lat: 22.5, lng: -82.5, plan: 'free', detras: 0, resumen: '' };

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
});
