import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './Layout';
import { AuthProvider } from '../hooks/useAuth';
import { configApi } from '../services/api';
import { fijarAncho } from './mapa/probarAncho';

// AuthProvider llama a configApi.get() sola al montar — mismo patrón que Search.test.tsx.
vi.mock('../services/api', async () => {
  const real = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...real, configApi: { ...real.configApi, get: vi.fn() } };
});

function montar(ruta = '/') {
  vi.mocked(configApi.get).mockResolvedValue({ data: { demo: false, google: null, google_client_id: null } } as never);
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<div style={{ height: '4000px' }}>Contenido</div>} />
            <Route path="/explorar" element={<div>Mapa</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** jsdom no actualiza scrollY por sí solo: se fija a mano y se dispara el 'scroll' que escucha
 *  useDireccionScroll (ver components/Layout.tsx) — que debounea con requestAnimationFrame, de
 *  ahí el frame extra de espera antes de que el estado quede puesto. */
async function scrollearA(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
  await new Promise((r) => requestAnimationFrame(r));
}

const contenedorResto = () => screen.getByTestId('banner-resto');

describe('Layout — banner móvil que se recoge al bajar', () => {
  beforeEach(() => { fijarAncho(390); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('al bajar la página se recoge a un círculo con el logo, y al subir vuelve a ser barra', async () => {
    montar();
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('false');

    const cabecera = within(screen.getByRole('banner'));

    await act(async () => { await scrollearA(300); });
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('true');
    // El logo pierde el texto "Encuentrauno": solo queda el glifo circular.
    expect(cabecera.queryByText('Encuentrauno', { exact: false })).toBeNull();

    await act(async () => { await scrollearA(100); });
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('false');
    expect(cabecera.getByText('uno', { exact: false })).toBeTruthy();
  });

  it('cerca del tope de la página se queda desplegado aunque el delta diera "bajando"', async () => {
    montar();
    await act(async () => { await scrollearA(20); }); // por debajo del umbral de inicio
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('false');
  });

  it('en escritorio no se recoge aunque la página baje', async () => {
    fijarAncho(1280);
    montar();
    await act(async () => { await scrollearA(300); });
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('false');
  });

  it('en la vista de mapa no se recoge (ahí la página no hace scroll)', async () => {
    montar('/explorar?vista=mapa');
    await act(async () => { await scrollearA(300); });
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('false');
  });
});
