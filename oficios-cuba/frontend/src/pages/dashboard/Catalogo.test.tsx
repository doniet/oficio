import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Catalogo from './Catalogo';
import { catalogApi, dardoventasApi, providerApi } from '../../services/api';

vi.mock('../../hooks/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../hooks/useTasa', () => ({ useTasa: () => 500 }));
vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...real,
    catalogApi: { ...real.catalogApi, mine: vi.fn() },
    providerApi: { ...real.providerApi, getMyProfile: vi.fn() },
    dardoventasApi: { vincular: vi.fn(), estado: vi.fn(), desvincular: vi.fn() },
  };
});

const item = (name: string, origen: 'propio' | 'dardoventas') => ({
  id: name, name, description: null, price: 250, price_type: 'fixed', price_currency: 'CUP', image: null, section: null,
  available: true, created_at: '2026-10-07T00:00:00Z', origen, convertible: origen === 'propio', hidden_by_plan: false,
});

beforeEach(() => {
  vi.mocked(catalogApi.mine).mockResolvedValue({ data: { items: [item('Importado', 'dardoventas'), item('Propio', 'propio')], max: 1000, plan: 'Profesional' } } as never);
  vi.mocked(providerApi.getMyProfile).mockResolvedValue({ data: { provider: { id: 'p1' } } } as never);
  vi.mocked(dardoventasApi.estado).mockResolvedValue({ data: { vinculado: true, linked_at: '2026-10-07T00:00:00Z', synced_at: new Date().toISOString(), articulos: 1, canje: null } } as never);
  vi.mocked(dardoventasApi.desvincular).mockResolvedValue({ data: { ok: true } } as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const fila = (nombre: string) => screen.getByText(nombre).closest('li')!;

describe('Catálogo del panel con artículos importados', () => {
  it('lo importado no tiene editar, borrar ni interruptor, y no enseña equivalente en USD', async () => {
    render(<MemoryRouter><Catalogo /></MemoryRouter>);
    await screen.findByText('Importado');
    const imp = within(fila('Importado'));
    expect(imp.queryByRole('button', { name: /editar/i })).toBeNull();
    expect(imp.queryByRole('button', { name: /borrar/i })).toBeNull();
    expect(imp.queryByRole('checkbox')).toBeNull();
    expect(imp.getByText(/DardoVentas/)).toBeTruthy();
    expect(imp.queryByText(/≈/)).toBeNull();
    const prop = within(fila('Propio'));
    expect(prop.getByRole('button', { name: /editar/i })).toBeTruthy();
  });

  it('desconectar pide confirmación y recarga', async () => {
    render(<MemoryRouter><Catalogo /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /desconectar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /sí, desconectar/i }));
    await waitFor(() => expect(dardoventasApi.desvincular).toHaveBeenCalled());
    await waitFor(() => expect(catalogApi.mine).toHaveBeenCalledTimes(2));
  });
});
