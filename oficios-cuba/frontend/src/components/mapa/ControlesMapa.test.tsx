import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ControlesMapa from './ControlesMapa';
import type { Category } from '../../types';

const categorias: Category[] = [
  { id: 'c1', name: 'Plomería', slug: 'plomeria', icon: '🔧', sort_order: 1, subcategories: [] },
];

function montar(props: Partial<Parameters<typeof ControlesMapa>[0]> = {}) {
  const onBuscar = props.onBuscar ?? vi.fn();
  const onCambiar = props.onCambiar ?? vi.fn();
  render(createElement(ControlesMapa, {
    q: '', tab: 'servicios', category: '', categorias, ...props, onBuscar, onCambiar,
  }));
  return { onBuscar, onCambiar };
}

describe('ControlesMapa', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  // Buscar en cada tecla sería una consulta al mapa por letra, en la conexión que esta app
  // apunta a servir.
  it('buscar envía el texto solo al enviar el formulario, no en cada tecla', () => {
    const { onBuscar } = montar();
    const campo = screen.getByRole('searchbox');
    fireEvent.change(campo, { target: { value: 'plomero' } });
    expect(onBuscar).not.toHaveBeenCalled();
    fireEvent.submit(campo.closest('form')!);
    expect(onBuscar).toHaveBeenCalledWith('plomero');
  });

  it('cambiar de pestaña avisa con el valor nuevo, sin traducirlo', () => {
    const { onCambiar } = montar();
    fireEvent.click(screen.getByRole('tab', { name: /Negocios/ }));
    expect(onCambiar).toHaveBeenCalledWith({ tab: 'negocios' });
  });

  it('elegir categoría avisa con el slug; «todas» la limpia', () => {
    const { onCambiar } = montar();
    // Categoría y «Ver en lista» viven detrás del botón de filtros a propósito: en 390 px, tenerlo
    // todo desplegado se come la franja de mapa que este rediseño existe para recuperar.
    fireEvent.click(screen.getByRole('button', { name: /Más filtros/ }));
    const select = screen.getByLabelText('Categoría');
    fireEvent.change(select, { target: { value: 'plomeria' } });
    expect(onCambiar).toHaveBeenCalledWith({ category: 'plomeria' });
    fireEvent.change(select, { target: { value: '' } });
    expect(onCambiar).toHaveBeenCalledWith({ category: null });
  });

  it('«Ver en lista» quita vista de la URL', () => {
    const { onCambiar } = montar();
    fireEvent.click(screen.getByRole('button', { name: /Más filtros/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ver en lista/ }));
    expect(onCambiar).toHaveBeenCalledWith({ vista: null });
  });
});
