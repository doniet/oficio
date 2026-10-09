import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usarProductosMapa } from './usarProductosMapa';
import { mapaApi } from '../../services/api';
import type { Bbox, MapaProductosRespuesta, OrdenProductos, ProductoMapa } from '../../types';

vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...real, mapaApi: { ...real.mapaApi, productos: vi.fn() } };
});

const Z1: Bbox = { sur: 22, oeste: -80, norte: 22.1, este: -79.9 };
const Z2: Bbox = { sur: 23, oeste: -82.5, norte: 23.2, este: -82.3 };

function prod(id: string): ProductoMapa {
  return {
    id, name: `Producto ${id}`, description: null, price: 100, price_type: 'fixed', price_currency: 'CUP', image: null, section: null,
    available: true, created_at: '2026-10-01T00:00:00Z', provider_id: 'n1', provider_name: 'Negocio', provider_avatar: null,
    subscription_plan: 'basic', contact_mode: 'whatsapp', whatsapp: null, province_name: null, municipality_name: null,
    lat: 22.05, lng: -79.95, tipo: 'oficio', aproximado: false,
  } as ProductoMapa;
}

function resp(ids: string[], page = 1, pages = 1, fuera: string[] = []): MapaProductosRespuesta {
  return { dentro: { items: ids.map(prod), total: pages * 20, page, pages }, fuera: fuera.map(prod) };
}

type Props = { zona: Bbox | null; q: string; category: string; sort: OrdenProductos; activo: boolean };
const base: Props = { zona: Z1, q: 'cake', category: '', sort: 'relevance', activo: true };

describe('usarProductosMapa', () => {
  beforeEach(() => vi.mocked(mapaApi.productos).mockReset());

  it('no pide nada si no está activo o no hay zona', () => {
    renderHook((p: Props) => usarProductosMapa(p), { initialProps: { ...base, activo: false } });
    renderHook((p: Props) => usarProductosMapa(p), { initialProps: { ...base, zona: null } });
    expect(mapaApi.productos).not.toHaveBeenCalled();
  });

  it('pide la página 1 de la zona con el orden y guarda dentro y fuera', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(resp(['a', 'b'], 1, 2, ['f']));
    const { result } = renderHook((p: Props) => usarProductosMapa(p), { initialProps: { ...base, sort: 'price_asc' } });
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(mapaApi.productos).toHaveBeenCalledWith(Z1, { q: 'cake', category: undefined, sort: 'price_asc', page: 1 }, expect.any(AbortSignal));
    expect(result.current.dentro.map((p) => p.id)).toEqual(['a', 'b']);
    expect(result.current.fuera.map((p) => p.id)).toEqual(['f']);
    expect(result.current.hayMas).toBe(true);
  });

  it('verMas añade la página siguiente', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValueOnce(resp(['a'], 1, 2)).mockResolvedValueOnce(resp(['b'], 2, 2));
    const { result } = renderHook((p: Props) => usarProductosMapa(p), { initialProps: base });
    await waitFor(() => expect(result.current.dentro).toHaveLength(1));
    act(() => result.current.verMas());
    await waitFor(() => expect(result.current.dentro.map((p) => p.id)).toEqual(['a', 'b']));
    expect(result.current.hayMas).toBe(false);
  });

  // Review Focus 1: la página que llega tarde es de la zona vieja.
  it('una página de «Ver más» que llega tras mover el mapa no se pega a la zona nueva', async () => {
    let soltarPagina2!: (r: MapaProductosRespuesta) => void;
    vi.mocked(mapaApi.productos)
      .mockResolvedValueOnce(resp(['a'], 1, 2))
      .mockImplementationOnce(() => new Promise((r) => { soltarPagina2 = r; }))
      .mockResolvedValueOnce(resp(['z'], 1, 1));
    const { result, rerender } = renderHook((p: Props) => usarProductosMapa(p), { initialProps: base });
    await waitFor(() => expect(result.current.dentro).toHaveLength(1));
    act(() => result.current.verMas());
    rerender({ ...base, zona: Z2 });
    await waitFor(() => expect(result.current.dentro.map((p) => p.id)).toEqual(['z']));
    await act(async () => { soltarPagina2(resp(['b'], 2, 2)); });
    expect(result.current.dentro.map((p) => p.id)).toEqual(['z']);
  });

  it('un error deja el mensaje y reintentar vuelve a pedir', async () => {
    vi.mocked(mapaApi.productos).mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(resp(['a']));
    const { result } = renderHook((p: Props) => usarProductosMapa(p), { initialProps: base });
    await waitFor(() => expect(result.current.error).not.toBe(''));
    act(() => result.current.reintentar());
    await waitFor(() => expect(result.current.dentro).toHaveLength(1));
    expect(result.current.error).toBe('');
  });
});
