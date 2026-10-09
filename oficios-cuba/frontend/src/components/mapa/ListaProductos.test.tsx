import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ListaProductos, { type PropsListaProductos } from './ListaProductos';
import type { ProductoMapa } from '../../types';

function prod(id: string, extra: Partial<ProductoMapa> = {}): ProductoMapa {
  return {
    id, name: `Producto ${id}`, description: null, price: 1800, price_type: 'fixed', price_currency: 'CUP', image: null, section: null,
    available: true, created_at: '2026-10-01T00:00:00Z', provider_id: `n-${id}`, provider_name: `Negocio ${id}`, provider_avatar: null,
    subscription_plan: 'basic', contact_mode: 'whatsapp', whatsapp: null, province_name: 'La Habana', municipality_name: 'Cerro',
    lat: 22.05, lng: -79.95, tipo: 'oficio', aproximado: false, ...extra,
  } as ProductoMapa;
}

function montar(over: Partial<PropsListaProductos> = {}) {
  const props: PropsListaProductos = {
    dentro: [prod('a'), prod('b', { price_type: 'ask', price: null })], total: 2, fuera: [],
    orden: 'relevance', onOrden: vi.fn(), cargando: false, error: '', onReintentar: vi.fn(),
    hayMas: false, cargandoMas: false, onVerMas: vi.fn(), onElegir: vi.fn(), ...over,
  };
  render(<ListaProductos {...props} tituloId="t" onCerrar={vi.fn()} />);
  return props;
}

describe('ListaProductos', () => {
  // vitest no registra el afterEach de limpieza automática de RTL: sin esto, cada test ve el DOM del anterior.
  afterEach(() => cleanup());

  it('el botón de cerrar mide al menos 44 px de objetivo táctil', () => {
    montar();
    const boton = screen.getByRole('button', { name: 'Cerrar la lista de productos' });
    expect(boton.className).toContain('min-h-11');
    expect(boton.className).toContain('min-w-11');
  });

  it('cuenta los productos de la zona y pinta producto, negocio y precio', () => {
    montar();
    expect(screen.getByRole('heading', { name: '2 productos en esta zona' })).toBeTruthy();
    expect(screen.getByText('Producto a')).toBeTruthy();
    expect(screen.getByText('Negocio a')).toBeTruthy();
    expect(screen.getByText('A consultar')).toBeTruthy();
  });

  it('en singular dice «1 producto»', () => {
    montar({ dentro: [prod('a')], total: 1 });
    expect(screen.getByRole('heading', { name: '1 producto en esta zona' })).toBeTruthy();
  });

  it('los botones de orden marcan el activo y avisan del nuevo', () => {
    const p = montar({ orden: 'price_asc' });
    expect(screen.getByRole('button', { name: 'Menor precio' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Mayor precio' }));
    expect(p.onOrden).toHaveBeenCalledWith('price_desc');
    expect(screen.getByText(/tasa de referencia/)).toBeTruthy();
  });

  it('sin orden de precio no pinta la nota de la tasa', () => {
    montar();
    expect(screen.queryByText(/tasa de referencia/)).toBeNull();
  });

  it('tocar un producto de la zona avisa con deFuera = false', () => {
    const p = montar();
    fireEvent.click(screen.getByText('Producto a'));
    expect(p.onElegir).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), false);
  });

  it('los de fuera van aparte, con municipio y distancia, y avisan con deFuera = true', () => {
    const p = montar({ fuera: [prod('f', { distancia_km: 4.1 })] });
    const seccion = screen.getByRole('region', { name: /Fuera de esta zona/ });
    expect(within(seccion).getByText(/Cerro, 4,1 km/)).toBeTruthy();
    fireEvent.click(within(seccion).getByText('Producto f'));
    expect(p.onElegir).toHaveBeenCalledWith(expect.objectContaining({ id: 'f' }), true);
  });

  it('vacía en la zona lo dice, y aun así enseña los de fuera', () => {
    montar({ dentro: [], total: 0, fuera: [prod('f', { distancia_km: 2 })] });
    expect(screen.getByText('No hay productos en esta zona.')).toBeTruthy();
    expect(screen.getByText('Producto f')).toBeTruthy();
  });

  it('con error enseña el mensaje y reintentar', () => {
    const p = montar({ dentro: [], error: 'No pudimos cargar los productos de esta zona.' });
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(p.onReintentar).toHaveBeenCalled();
  });

  it('cargando enseña esqueletos, no la lista', () => {
    montar({ cargando: true });
    expect(screen.getByRole('status', { name: 'Buscando productos' })).toBeTruthy();
    expect(screen.queryByText('Producto a')).toBeNull();
  });

  it('«Ver más productos» aparece con hayMas y avisa', () => {
    const p = montar({ hayMas: true });
    fireEvent.click(screen.getByRole('button', { name: 'Ver más productos' }));
    expect(p.onVerMas).toHaveBeenCalled();
  });

  it('pasar el ratón por una fila la resalta y salir la suelta', () => {
    const onResaltar = vi.fn();
    montar({ onResaltar });
    const fila = screen.getByText('Producto a').closest('button')!;
    fireEvent.mouseEnter(fila);
    expect(onResaltar).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }));
    fireEvent.mouseLeave(fila);
    expect(onResaltar).toHaveBeenLastCalledWith(null);
  });

  it('al montarse con ultimoElegidoId se desplaza hasta esa fila', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    montar({ ultimoElegidoId: 'b' });
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
  });
});
