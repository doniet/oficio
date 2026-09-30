import { createElement, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import L from 'leaflet';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ExplorarMapa, { ANCHO_PANEL_PX } from './ExplorarMapa';
import { darTamanoAlMapa, fijarAncho } from './probarAncho';
import { mapaApi, providerApi } from '../../services/api';
import type { PuntoMapa } from '../../types';

vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...real,
    mapaApi: { buscar: vi.fn(), celda: vi.fn() },
    providerApi: { ...real.providerApi, getById: vi.fn(), contact: vi.fn(() => Promise.resolve()) },
  };
});

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function punto(id: string, lng: number): PuntoMapa {
  return { id, tipo: 'oficio', nombre: `Negocio ${id}`, lat: 21.6, lng, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: '' };
}

beforeAll(() => {
  darTamanoAlMapa(800, 600);
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
    configurable: true, get() { return this.parentNode as Element | null; },
  });
});

function montar(puntos: PuntoMapa[], get: (k: string) => string = () => '') {
  const update = vi.fn();
  vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos, celda: 0.01, hay_mas: false });
  const utils = render(createElement(MemoryRouter, null,
    createElement(ExplorarMapa, { get, update, categorias: [] })));
  return { update, ...utils };
}

describe('ExplorarMapa', () => {
  beforeEach(() => {
    vi.mocked(mapaApi.buscar).mockReset();
    // Devuelve un perfil con el id pedido: con `provider: null` el efecto de carga no vuelve a
    // dispararse y la duplicidad que esta suite busca quedaría escondida.
    vi.mocked(providerApi.getById).mockImplementation((id: string) => Promise.resolve({
      data: { provider: { id, business_name: `Negocio ${id}`, categories: [], rating: 0, review_count: 0, contact_mode: 'both', whatsapp: null } },
    }) as never);
    fijarAncho(1280);
    window.history.replaceState(null, '');
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('la región del mapa ocupa el alto de la página y no genera scroll', async () => {
    const { container } = montar([]);
    await act(async () => { await espera(320); });
    const region = container.querySelector('.region-mapa');
    expect(region).toBeTruthy();
    expect(region!.className).toContain('overflow-hidden');
  });

  // El control de zoom de Leaflet vive abajo a la IZQUIERDA, que en escritorio es justo donde
  // aterriza el panel lateral: con el panel abierto el clic caía en el panel y no se podía hacer
  // zoom. Medido en produccion el 30-sep-2026 con elementFromPoint.
  it('con el panel abierto en escritorio, la región se marca para apartar el zoom', async () => {
    const { container } = montar([punto('a', -76)]);
    await act(async () => { await espera(320); });
    const region = () => container.querySelector('.region-mapa')!;
    expect(region().className).not.toContain('region-mapa--con-panel');

    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(30); });

    expect(region().className).toContain('region-mapa--con-panel');
  });

  // En móvil no hay panel lateral: la hoja sube por abajo y el zoom ya la esquiva con
  // --hoja-punto-alto. Marcar la región ahí desplazaría el zoom fuera de la pantalla.
  it('en móvil no se marca: ahí el zoom lo esquiva la hoja, no el panel', async () => {
    fijarAncho(390);
    const { container } = montar([punto('a', -76)]);
    await act(async () => { await espera(320); });

    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(30); });

    expect(container.querySelector('.region-mapa')!.className).not.toContain('region-mapa--con-panel');
  });

  // El punto se toca a la izquierda, donde va el panel: si el mapa no se aparta, el usuario
  // abre una ficha y el marcador que acaba de tocar queda debajo de ella.
  it('un punto que cae bajo el panel hace que el mapa se aparte', async () => {
    const panBy = vi.spyOn(L.Map.prototype, 'panBy');
    const { container } = montar([punto('izq', -83)]);
    await act(async () => { await espera(320); });

    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    expect(pin).toBeTruthy();
    await act(async () => { pin.click(); await espera(20); });

    await waitFor(() => expect(screen.getByTestId('panel-lateral')).toBeTruthy());
    expect(panBy).toHaveBeenCalled();
    const [dx] = panBy.mock.calls[0][0] as [number, number];
    // Negativo: el mapa se mueve a la izquierda para que el punto se vea a la derecha del panel.
    expect(dx).toBeLessThan(0);
    expect(Math.abs(dx)).toBeLessThanOrEqual(ANCHO_PANEL_PX + 32);
  });

  it('un punto que ya se ve a la derecha del panel no mueve el mapa', async () => {
    const panBy = vi.spyOn(L.Map.prototype, 'panBy');
    const { container } = montar([punto('der', -76)]);
    await act(async () => { await espera(320); });

    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(20); });

    await waitFor(() => expect(screen.getByTestId('panel-lateral')).toBeTruthy());
    expect(panBy).not.toHaveBeenCalled();
  });

  // El botón existía y no hacía nada: ExplorarMapa no sabe pedir celdas (eso vive en usarMapa),
  // así que «Reintentar» copiaba un array y dejaba el error en pantalla. La prueba de PanelMapa
  // no lo veía porque le inyecta su propio onReintentar: comprueba el cableado de ListaCelda.
  it('«Reintentar» tras un fallo de celda vuelve a pedirla de verdad', async () => {
    const agrupado = { ...punto('g', -76), detras: 2 };
    vi.mocked(mapaApi.celda).mockRejectedValue(new Error('red caída'));
    const { container } = montar([agrupado]);
    await act(async () => { await espera(320); });

    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(30); });
    await waitFor(() => expect(screen.getByText(/No pudimos cargar los negocios/)).toBeTruthy());
    expect(vi.mocked(mapaApi.celda)).toHaveBeenCalledTimes(1);

    vi.mocked(mapaApi.celda).mockResolvedValue({ puntos: [punto('a', -76)], hay_mas: false } as never);
    await act(async () => { fireEvent.click(screen.getByText('Reintentar')); await espera(30); });

    expect(vi.mocked(mapaApi.celda)).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText(/No pudimos cargar los negocios/)).toBeNull());
  });

  // Al cambiar de punto con el panel abierto se pedía el perfil DOS veces: el efecto de carga
  // corría con el punto nuevo y el perfil viejo, y el reset del perfil volvía a dispararlo.
  it('cambiar de punto pide el perfil una sola vez', async () => {
    const { container } = montar([punto('a', -76), punto('b', -77)]);
    await act(async () => { await espera(320); });
    const pines = container.querySelectorAll('.leaflet-marker-icon');

    await act(async () => { (pines[0] as HTMLElement).click(); await espera(60); });
    await act(async () => { (pines[1] as HTMLElement).click(); await espera(60); });

    const ids = vi.mocked(providerApi.getById).mock.calls.map((c) => c[0]);
    expect(ids).toEqual(['a', 'b']);
  });

  // El punto con la ficha abierta se distingue en el mapa con la silueta del logo (un pin de
  // ubicación), no con el círculo genérico del resto — y solo ESE, no los demás ni el que se dejó.
  it('el punto con la ficha abierta cambia de círculo a pin, y vuelve a círculo al soltarlo', async () => {
    const { container } = montar([punto('a', -76), punto('b', -75)]);
    await act(async () => { await espera(320); });
    const pines = () => container.querySelectorAll('.leaflet-marker-icon');

    expect(pines()[0].className).not.toContain('map-pin--seleccionado');
    expect(pines()[1].className).not.toContain('map-pin--seleccionado');

    await act(async () => { (pines()[0] as HTMLElement).click(); await espera(30); });
    expect(pines()[0].className).toContain('map-pin--seleccionado');
    expect(pines()[1].className).not.toContain('map-pin--seleccionado');

    // Elegir el otro punto mueve el pin, no lo duplica: el primero suelta la forma de pin.
    await act(async () => { (pines()[1] as HTMLElement).click(); await espera(30); });
    expect(pines()[0].className).not.toContain('map-pin--seleccionado');
    expect(pines()[1].className).toContain('map-pin--seleccionado');

    // Cerrar el panel no debe dejar ningún pin "pegado" en forma de gota.
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    await waitFor(() => expect(pines()[1].className).not.toContain('map-pin--seleccionado'));
  });

  // El color dice el TIPO de perfil (negocio o servicio suelto), no el plan: un oficio Profesional
  // sigue en ink-700, y un negocio Gratis ya sale en brand-600.
  it('el color del marcador es por tipo (negocio en naranja, oficio en oscuro), no por plan', async () => {
    const negocio = { ...punto('n', -76), tipo: 'negocio' as const, plan: 'free' as const };
    const oficio = { ...punto('o', -75), tipo: 'oficio' as const, plan: 'pro' as const };
    const { container } = montar([negocio, oficio]);
    await act(async () => { await espera(320); });
    const pines = () => container.querySelectorAll('.leaflet-marker-icon');

    expect(pines()[0].innerHTML).toContain('bg-brand-600');
    expect(pines()[1].innerHTML).toContain('bg-ink-700');

    // Seleccionado (pin en forma de gota) sigue el mismo criterio.
    await act(async () => { (pines()[0] as HTMLElement).click(); await espera(30); });
    expect(pines()[0].innerHTML).toContain('text-brand-600');
  });

  it('cambiar de pestaña con el panel abierto lo cierra', async () => {
    // Anfitrión con estado de verdad: con un `update` de mentira, `get('tab')` nunca cambiaría y
    // la prueba no ejercitaría nada.
    function Anfitrion() {
      const [params, setParams] = useState<Record<string, string>>({});
      return createElement(ExplorarMapa, {
        get: (k: string) => params[k] ?? '',
        update: (patch: Record<string, string | null>) => setParams((p) => {
          const siguiente = { ...p };
          for (const [k, v] of Object.entries(patch)) { if (v) siguiente[k] = v; else delete siguiente[k]; }
          return siguiente;
        }),
        categorias: [],
      });
    }
    vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [punto('x', -76)], celda: 0.01, hay_mas: false });
    const { container } = render(createElement(MemoryRouter, null, createElement(Anfitrion)));
    await act(async () => { await espera(320); });
    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(20); });
    await waitFor(() => expect(screen.getByTestId('panel-lateral')).toBeTruthy());

    fireEvent.click(screen.getByRole('tab', { name: /Negocios/ }));
    await waitFor(() => expect(screen.queryByTestId('panel-lateral')).toBeNull());
  });
});
