import { createElement, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import L from 'leaflet';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ExplorarMapa, { ANCHO_PANEL_PX } from './ExplorarMapa';
import { darTamanoAlMapa, fijarAncho } from './probarAncho';
import { configApi, mapaApi, providerApi } from '../../services/api';
import { AuthProvider } from '../../hooks/useAuth';
import type { MapaProductosRespuesta, ProductoMapa, PuntoMapa } from '../../types';

// configApi.get: AuthProvider la llama sola al montar. providerApi.contact/getById: mockeadas
// para no pegarle a la red de verdad. Necesario desde que FichaPunto puede montar BookingModal
// y CatalogItemModal, los dos con useAuth() incondicional — ver PanelMapa.test.tsx.
vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...real,
    configApi: { ...real.configApi, get: vi.fn() },
    mapaApi: { buscar: vi.fn(), celda: vi.fn(), productos: vi.fn() },
    catalogApi: { ...real.catalogApi, ofProvider: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })) },
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
  const utils = render(createElement(MemoryRouter, null, createElement(AuthProvider, null,
    createElement(ExplorarMapa, { get, update, categorias: [] }))));
  return { update, ...utils };
}

describe('ExplorarMapa', () => {
  beforeEach(() => {
    vi.mocked(mapaApi.buscar).mockReset();
    vi.mocked(configApi.get).mockResolvedValue({ data: { demo: false, google: null, google_client_id: null } } as never);
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

  // Como en Google Maps: tocar un sitio sin ningún negocio cierra la ficha, igual que el botón
  // «Cerrar». Leaflet no deja que este clic llegue aquí si fue sobre un Marker (ver el comentario
  // de MapaExplorar.tsx), así que no hace falta comprobar aparte que un clic EN el pin no cierre.
  it('tocar el mapa donde no hay ningún punto cierra la ficha abierta', async () => {
    const { container } = montar([punto('a', -76)]);
    await act(async () => { await espera(320); });

    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(20); });
    await waitFor(() => expect(screen.getByTestId('panel-lateral')).toBeTruthy());

    const mapa = container.querySelector('.leaflet-container') as HTMLElement;
    await act(async () => { mapa.click(); });

    await waitFor(() => expect(screen.queryByTestId('panel-lateral')).toBeNull());
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
  // sigue en naranja claro (brand-400), y un negocio Gratis ya sale en naranja fuerte (brand-600).
  it('el color del marcador es por tipo (negocio en naranja fuerte, oficio en naranja claro), no por plan', async () => {
    const negocio = { ...punto('n', -76), tipo: 'negocio' as const, plan: 'free' as const };
    const oficio = { ...punto('o', -75), tipo: 'oficio' as const, plan: 'pro' as const };
    const { container } = montar([negocio, oficio]);
    await act(async () => { await espera(320); });
    const pines = () => container.querySelectorAll('.leaflet-marker-icon');

    expect(pines()[0].innerHTML).toContain('bg-brand-600');
    expect(pines()[1].innerHTML).toContain('bg-brand-400');

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
    const { container } = render(createElement(MemoryRouter, null, createElement(AuthProvider, null, createElement(Anfitrion))));
    await act(async () => { await espera(320); });
    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(20); });
    await waitFor(() => expect(screen.getByTestId('panel-lateral')).toBeTruthy());

    fireEvent.click(screen.getByRole('tab', { name: /Negocios/ }));
    await waitFor(() => expect(screen.queryByTestId('panel-lateral')).toBeNull());
  });
});

function producto(id: string, extra: Partial<ProductoMapa> = {}): ProductoMapa {
  return {
    id, name: `Producto ${id}`, description: null, price: 100, price_type: 'fixed', price_currency: 'CUP', image: null, section: null,
    available: true, created_at: '2026-10-01T00:00:00Z', provider_id: `neg-${id}`, provider_name: `Negocio ${id}`, provider_avatar: null,
    subscription_plan: 'basic', contact_mode: 'whatsapp', whatsapp: null, province_name: null, municipality_name: 'Cerro',
    lat: 21.6, lng: -79.6, tipo: 'oficio', aproximado: false, ...extra,
  } as ProductoMapa;
}

function respuesta(dentro: ProductoMapa[], fuera: ProductoMapa[] = []): MapaProductosRespuesta {
  return { dentro: { items: dentro, total: dentro.length, page: 1, pages: 1 }, fuera };
}

const enProductos = (extra: Record<string, string> = {}) => (k: string) => ({ tab: 'productos', q: 'cake', ...extra } as Record<string, string>)[k] ?? '';

describe('ExplorarMapa — lista de productos', () => {
  beforeEach(() => {
    vi.mocked(mapaApi.productos).mockReset();
    vi.mocked(configApi.get).mockResolvedValue({ data: { demo: false, google: null, google_client_id: null } } as never);
    vi.mocked(providerApi.getById).mockImplementation((id: string) => Promise.resolve({
      data: { provider: { id, business_name: `Negocio ${id}`, categories: [], rating: 0, review_count: 0, contact_mode: 'both', whatsapp: null } },
    }) as never);
    fijarAncho(1280);
    window.history.replaceState(null, '');
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('en Productos la lista se abre sola con los productos de la zona', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a'), producto('b')]));
    montar([], enProductos());
    expect(await screen.findByRole('heading', { name: '2 productos en esta zona' })).toBeTruthy();
    expect(vi.mocked(mapaApi.productos).mock.calls[0][1]).toMatchObject({ q: 'cake', sort: 'relevance', page: 1 });
  });

  it('en Servicios no pide productos', async () => {
    montar([], () => '');
    await act(async () => { await espera(400); });
    expect(mapaApi.productos).not.toHaveBeenCalled();
  });

  it('el orden sale de la URL y elegir otro la cambia', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')]));
    const { update } = montar([], enProductos({ orden: 'price_desc' }));
    await screen.findByRole('heading', { name: '1 producto en esta zona' });
    expect(vi.mocked(mapaApi.productos).mock.calls[0][1]).toMatchObject({ sort: 'price_desc' });
    fireEvent.click(screen.getByRole('button', { name: 'Relevancia' }));
    expect(update).toHaveBeenCalledWith({ orden: null });
    fireEvent.click(screen.getByRole('button', { name: 'Menor precio' }));
    expect(update).toHaveBeenCalledWith({ orden: 'price_asc' });
  });

  it('un orden inventado en la URL se trata como relevancia', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')]));
    montar([], enProductos({ orden: 'barato' }));
    await screen.findByRole('heading', { name: '1 producto en esta zona' });
    expect(vi.mocked(mapaApi.productos).mock.calls[0][1]).toMatchObject({ sort: 'relevance' });
  });

  it('tocar un producto abre su negocio con el producto marcado, y «N productos» vuelve', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a'), producto('b')]));
    montar([], enProductos());
    fireEvent.click(await screen.findByText('Producto b'));
    expect(await screen.findByText('Lo que tocaste')).toBeTruthy();
    expect(providerApi.getById).toHaveBeenCalledWith('neg-b');
    fireEvent.click(screen.getByRole('button', { name: /2 productos/ }));
    expect(await screen.findByRole('heading', { name: '2 productos en esta zona' })).toBeTruthy();
    expect(mapaApi.productos).toHaveBeenCalledTimes(1); // volver no vuelve a pedir
  });

  it('tocar uno de fuera amplía el mapa hasta incluir su negocio', async () => {
    const lejos = producto('f', { lat: 23.1, lng: -82.4, distancia_km: 300 });
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')], [lejos]));
    const volar = vi.spyOn(L.Map.prototype, 'flyToBounds').mockImplementation(function (this: L.Map) { return this; });
    montar([], enProductos());
    fireEvent.click(await screen.findByText('Producto f'));
    expect(volar).toHaveBeenCalled();
    const caja = volar.mock.calls[0][0] as L.LatLngBounds;
    expect(caja.contains(L.latLng(23.1, -82.4))).toBe(true);
    expect(await screen.findByText('Lo que tocaste')).toBeTruthy();
  });

  it('cerrar la lista deja «Ver N productos», que la reabre', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a'), producto('b'), producto('c')]));
    montar([], enProductos());
    await screen.findByRole('heading', { name: '3 productos en esta zona' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la lista de productos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ver 3 productos' }));
    expect(await screen.findByRole('heading', { name: '3 productos en esta zona' })).toBeTruthy();
  });

  it('una ficha abierta desde una celda no ofrece volver a productos aunque el producto tocado sea de ese negocio', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a'), producto('b')]));
    const agrupado = { ...punto('neg-x', -76), detras: 2 };
    vi.mocked(mapaApi.celda).mockResolvedValue({ puntos: [punto('neg-b', -76), punto('neg-c', -76)], hay_mas: false } as never);
    const { container } = montar([agrupado], enProductos());
    fireEvent.click(await screen.findByText('Producto b'));
    fireEvent.click(await screen.findByRole('button', { name: /2 productos/ }));
    await screen.findByRole('heading', { name: '2 productos en esta zona' });

    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(30); });
    fireEvent.click(await screen.findByText('Negocio neg-b'));

    expect(await screen.findByRole('button', { name: /Volver a la lista/ })).toBeTruthy();
    expect(screen.queryByText('Lo que tocaste')).toBeNull();
    expect(screen.queryByRole('button', { name: /2 productos/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Volver a la lista/ }));
    expect(await screen.findByText('Negocio neg-c')).toBeTruthy();
  });

  // Review Focus 5.
  it('tocar un pin con la lista abierta y cerrar su ficha deja «Ver N productos», no un panel vacío', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')]));
    const { container } = montar([punto('p', -76)], enProductos());
    await screen.findByRole('heading', { name: '1 producto en esta zona' });
    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(30); });
    expect(screen.queryByRole('button', { name: /1 productos?$/ })).toBeNull(); // la ficha de un pin no ofrece volver a productos
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Ver 1 producto' })).toBeTruthy();
    expect(container.querySelector('[data-testid="panel-lateral"]')).toBeNull();
  });
});
