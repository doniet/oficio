import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from './Search';
import { AuthProvider } from '../hooks/useAuth';
import { ToastProvider } from '../hooks/useToast';
import { catalogApi, categoryApi, configApi, mapaApi, providerApi, provinceApi, serviceApi, tasaApi } from '../services/api';

// Igual que usarMapa.test.ts / HojaPunto.test.tsx: solo se sustituyen las funciones que
// `Search` (y lo que monta: AuthProvider, useTasa, MapaExplorar/usarMapa) dispara solas al
// montar, con vi.importActual de por medio para no dejar el resto del módulo (apiError,
// tokenStore...) undefined. Sin mockear configApi/tasaApi, AuthProvider y useTasa intentarían
// una petición real a `/api` contra un jsdom sin servidor detrás.
vi.mock('../services/api', async () => {
  const real = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...real,
    provinceApi: { ...real.provinceApi, getAll: vi.fn(), getMunicipalities: vi.fn() },
    categoryApi: { ...real.categoryApi, getAll: vi.fn() },
    serviceApi: { ...real.serviceApi, getAll: vi.fn() },
    providerApi: { ...real.providerApi, getAll: vi.fn() },
    catalogApi: { ...real.catalogApi, search: vi.fn() },
    mapaApi: { ...real.mapaApi, buscar: vi.fn() },
    configApi: { ...real.configApi, get: vi.fn() },
    tasaApi: { ...real.tasaApi, get: vi.fn() },
  };
});

const PAGINA_VACIA = { page: 1, limit: 12, total: 0, totalPages: 1 };

// Un espía de la URL real dentro del mismo Router que usa Search: leer `window.location`
// no sirve con MemoryRouter (no toca el DOM), y comparar el location de `useSearchParams`
// es justo lo que `update()` decide.
function EspiaDeUrl() {
  const [params] = useSearchParams();
  return <div data-testid="url">{params.toString()}</div>;
}

function montar(entradaInicial: string) {
  const utils = render(
    <MemoryRouter initialEntries={[entradaInicial]}>
      <ToastProvider>
        <AuthProvider>
          <Search />
          <EspiaDeUrl />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return utils;
}

function urlActual() {
  return new URLSearchParams(screen.getByTestId('url').textContent ?? '');
}

import { darTamanoAlMapa, fijarAncho } from '../components/mapa/probarAncho';

describe('Search — el switch lista/mapa conserva la URL', () => {
  beforeEach(() => {
    // jsdom no trae matchMedia y Search monta PanelMapa, que la consulta. 390 px = móvil,
    // que es donde esta app se usa de verdad.
    fijarAncho(390);
    darTamanoAlMapa();
    vi.mocked(provinceApi.getAll).mockResolvedValue({ data: { provinces: [] } } as never);
    vi.mocked(provinceApi.getMunicipalities).mockResolvedValue({ data: { municipalities: [] } } as never);
    vi.mocked(categoryApi.getAll).mockResolvedValue({ data: { categories: [] } } as never);
    vi.mocked(serviceApi.getAll).mockResolvedValue({ data: { services: [], pagination: PAGINA_VACIA } } as never);
    vi.mocked(providerApi.getAll).mockResolvedValue({ data: { providers: [], pagination: PAGINA_VACIA } } as never);
    vi.mocked(catalogApi.search).mockResolvedValue({ data: { items: [], total: 0, page: 1, pages: 1 } } as never);
    vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [], celda: 0.01, hay_mas: false });
    vi.mocked(configApi.get).mockResolvedValue({ data: { demo: false, google: null, google_client_id: null } } as never);
    vi.mocked(tasaApi.get).mockResolvedValue({ data: { usd: 1 } } as never);
  });

  afterEach(() => {
    // Igual que en HojaPunto.test.tsx: sin `test.globals`, RTL no limpia sola entre pruebas.
    cleanup();
    vi.restoreAllMocks();
  });

  // Va primero a propósito: `MapaExplorar = lazy(() => import(...))` en Search.tsx es un único
  // cierre a nivel de módulo, compartido por las cuatro pruebas de este archivo. Una vez que
  // React resuelve esa promesa (a partir de la primera prueba que monta el mapa), las
  // siguientes ya no suspenden — el "primer render" que esta prueba necesita observar solo
  // existe antes de que cualquier otra prueba haya montado MapaExplorar una vez.
  it('4. montar con ?vista=mapa&tab=negocios&q=pan pasa tab/q a MapaExplorar en el primer render, sin destello de lista', async () => {
    montar('/explorar?vista=mapa&tab=negocios&q=pan');

    // Sincrónico, antes de esperar nada: la propia estructura del render (el ternario
    // `enMapa ? <mapa> : <lista...>`) hace que la lista no pueda haberse pintado ni un
    // instante — es el chunk lazy de MapaExplorar el que aún no resolvió, no la lista.
    // Lanza si no está: basta con que no reviente para probar que el fallback de Suspense
    // (el mapa cargando), no la lista, es lo que hay en pantalla.
    screen.getByRole('status', { name: 'Cargando' });
    expect(screen.queryByText(/encontrados/)).toBeNull();
    expect(providerApi.getAll).not.toHaveBeenCalled();

    await waitFor(() => expect(mapaApi.buscar).toHaveBeenCalled(), { timeout: 2000 });

    const [, parametros] = vi.mocked(mapaApi.buscar).mock.calls[0];
    expect(parametros).toMatchObject({ tab: 'negocios', q: 'pan' });
  });

  it('1. sin `vista` en la URL se ve la lista, no el mapa', async () => {
    montar('/explorar?tab=negocios');

    await waitFor(() => expect(providerApi.getAll).toHaveBeenCalled());

    // El mapa (usarMapa/MapaExplorar) nunca llega a pedir su primera zona: si la lista fuera
    // en realidad el mapa disfrazado, esto fallaría solo.
    expect(mapaApi.buscar).not.toHaveBeenCalled();
    // Sin jest-dom en este proyecto (ver los otros *.test.tsx): se lee `aria-selected` a mano.
    expect(screen.getByRole('tab', { name: /^Lista$/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^Mapa$/ }).getAttribute('aria-selected')).toBe('false');
  });

  it('2. pulsar «Mapa» desde ?tab=negocios&q=pan&province=X añade vista=mapa sin perder nada', async () => {
    montar('/explorar?tab=negocios&q=pan&province=X');

    await waitFor(() => expect(providerApi.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('tab', { name: /^Mapa$/ }));

    const url = urlActual();
    expect(url.get('vista')).toBe('mapa');
    expect(url.get('tab')).toBe('negocios');
    expect(url.get('q')).toBe('pan');
    expect(url.get('province')).toBe('X');
  });

  it('3. pulsar «Lista» desde ?vista=mapa&tab=negocios&q=pan quita vista y conserva tab/q', async () => {
    montar('/explorar?vista=mapa&tab=negocios&q=pan');

    // Entra en mapa: espera a que MapaExplorar (chunk lazy) pida su primera zona antes de
    // interactuar, para no pulsar «Lista» a mitad del montaje asíncrono del mapa.
    await waitFor(() => expect(mapaApi.buscar).toHaveBeenCalled(), { timeout: 2000 });

    // En el mapa a pantalla completa ya no hay conmutador Lista/Mapa en el flujo de la página:
    // «Ver en lista» vive detrás del botón de filtros de la barra flotante. Lo que esta prueba
    // protege —que volver a la lista conserve tab y q— no cambia; solo el control que lo dispara.
    fireEvent.click(screen.getByRole('button', { name: /Más filtros/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ver en lista/ }));

    const url = urlActual();
    expect(url.get('vista')).toBeNull();
    expect(url.get('tab')).toBe('negocios');
    expect(url.get('q')).toBe('pan');
  });
});
