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
  beforeEach(() => {
    fijarAncho(390);
    // window.scrollY es global y no se resetea solo entre pruebas: sin esto, un test que deja la
    // página "scrolleada" contaminaba el `ultimoY` inicial del siguiente — con el MISMO valor de
    // scroll que el anterior, el delta daba 0 y nunca se consideraba "bajando".
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
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

  // El fondo transparente no basta: backdrop-blur-md sigue difuminando lo que pasa por debajo
  // aunque no tenga color, así que es un rastro de "barra" tan visible como el fondo mismo.
  it('recogido, el header no deja ni el desenfoque como rastro de la barra', async () => {
    montar();
    const header = screen.getByRole('banner');
    expect(header.className).toContain('backdrop-blur-md');

    await act(async () => { await scrollearA(300); });
    expect(header.className).not.toContain('backdrop-blur-md');
    expect(header.className).toContain('backdrop-blur-none');
  });

  it('al recogerse el banner, la barra inferior traslúcida también se oculta', async () => {
    montar();
    const tabBar = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(tabBar.getAttribute('aria-hidden')).toBe('false');

    await act(async () => { await scrollearA(300); });
    expect(tabBar.getAttribute('aria-hidden')).toBe('true');

    await act(async () => { await scrollearA(100); });
    expect(tabBar.getAttribute('aria-hidden')).toBe('false');
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

  // El mapa no tiene scroll de página del que depender, así que ahí el banner se recoge SIEMPRE
  // en móvil, de entrada: le deja más alto útil al mapa, que ya trae sus propios controles
  // flotantes (ControlesMapa.tsx). La barra inferior, en cambio, sigue visible — en el mapa ES
  // la navegación (ver el comentario de `enMapa` en Layout.tsx).
  it('en la vista de mapa el banner arranca ya recogido, pero la barra inferior se queda', () => {
    montar('/explorar?vista=mapa');
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).getAttribute('aria-hidden')).toBe('false');
  });

  it('en la vista de mapa, en escritorio, el banner no se recoge', () => {
    fijarAncho(1280);
    montar('/explorar?vista=mapa');
    expect(contenedorResto().getAttribute('aria-hidden')).toBe('false');
  });
});
