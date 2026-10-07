import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VincularDardoVentas, { ESPERA } from './VincularDardoVentas';
import { dardoventasApi } from '../services/api';

const auth = { user: null as null | { user_type: 'client' | 'provider' }, isLoading: false };
vi.mock('../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../hooks/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../services/api', async () => {
  const real = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...real, dardoventasApi: { vincular: vi.fn(), estado: vi.fn(), desvincular: vi.fn() } };
});

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{l.pathname + l.search}</p>;
}

function montar(url = '/vincular/dardoventas?code=abcdefgh123') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/vincular/dardoventas" element={<VincularDardoVentas />} />
        <Route path="*" element={<Donde />} />
      </Routes>
    </MemoryRouter>,
  );
}

const estado = (canje: { status: 'pendiente' | 'ok' | 'error'; error?: string | null }) => ({
  data: { vinculado: canje.status === 'ok', linked_at: null, synced_at: null, articulos: 0, canje: { id: 'k1', error: null, ...canje } },
});

beforeEach(() => {
  ESPERA.intervaloMs = 5;
  ESPERA.maxMs = 200;
  vi.mocked(dardoventasApi.vincular).mockResolvedValue({ data: { id: 'k1' } } as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.user = null; });

describe('VincularDardoVentas', () => {
  it('sin sesión manda a crear una cuenta de negocio y conserva el código', () => {
    montar();
    const next = encodeURIComponent('/vincular/dardoventas?code=abcdefgh123');
    expect(screen.getByTestId('donde').textContent).toBe(`/registro?tipo=provider&next=${next}`);
  });

  it('sin código explica de dónde se saca', () => {
    auth.user = { user_type: 'provider' };
    montar('/vincular/dardoventas');
    expect(screen.getByText(/mi\.dardoventas\.com/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /conectar/i })).toBeNull();
  });

  it('con una cuenta de cliente no deja conectar', () => {
    auth.user = { user_type: 'client' };
    montar();
    expect(screen.getByText(/cuenta de cliente/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /conectar/i })).toBeNull();
  });

  it('conecta, espera al canje y lleva a completar la ficha', async () => {
    auth.user = { user_type: 'provider' };
    vi.mocked(dardoventasApi.estado)
      .mockResolvedValueOnce(estado({ status: 'pendiente' }) as never)
      .mockResolvedValue(estado({ status: 'ok' }) as never);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /conectar mi catálogo/i }));
    await waitFor(() => expect(screen.getByTestId('donde').textContent).toBe('/dashboard/perfil'));
    expect(dardoventasApi.vincular).toHaveBeenCalledWith('abcdefgh123');
  });

  it('enseña el error que dio el canje', async () => {
    auth.user = { user_type: 'provider' };
    vi.mocked(dardoventasApi.estado).mockResolvedValue(estado({ status: 'error', error: 'El código caducó.' }) as never);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /conectar mi catálogo/i }));
    expect(await screen.findByText('El código caducó.')).toBeTruthy();
  });

  it('si tarda demasiado, lo dice en vez de quedarse girando', async () => {
    auth.user = { user_type: 'provider' };
    vi.mocked(dardoventasApi.estado).mockResolvedValue(estado({ status: 'pendiente' }) as never);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /conectar mi catálogo/i }));
    expect(await screen.findByText(/está tardando/i)).toBeTruthy();
  });
});
