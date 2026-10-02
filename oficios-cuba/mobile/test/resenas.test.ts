import type { Pagination, Review } from '@oficio/shared';
import { RESENAS_POR_PAGINA, resumenEstrellas, siguientePaginaResenas, tituloServicioResena } from '../src/lib/resenas';

const paginacion = (page: number, totalPages: number): Pagination => ({ page, limit: RESENAS_POR_PAGINA, total: totalPages * RESENAS_POR_PAGINA, totalPages });

const resena = (extra: Partial<Review> = {}): Review => ({
  id: 'r1', rating: 5, created_at: '2026-10-01T00:00:00.000Z', client_name: 'Yoandra', ...extra,
});

describe('siguientePaginaResenas', () => {
  it('hay más páginas: devuelve la siguiente', () => {
    expect(siguientePaginaResenas(paginacion(1, 3))).toBe(2);
  });

  it('en la última página: undefined, para que getNextPageParam corte ahí', () => {
    expect(siguientePaginaResenas(paginacion(3, 3))).toBeUndefined();
  });

  it('una sola página: undefined desde el principio', () => {
    expect(siguientePaginaResenas(paginacion(1, 1))).toBeUndefined();
  });
});

describe('resumenEstrellas', () => {
  it('con las cinco filas completas, los porcentajes salen de la suma de distribution', () => {
    const filas = resumenEstrellas([
      { rating: 5, count: 6 }, { rating: 4, count: 2 }, { rating: 3, count: 1 },
      { rating: 2, count: 1 }, { rating: 1, count: 0 },
    ]);
    expect(filas.map((f) => f.rating)).toEqual([5, 4, 3, 2, 1]);
    expect(filas.find((f) => f.rating === 5)).toEqual({ rating: 5, count: 6, porcentaje: 60 });
    expect(filas.find((f) => f.rating === 1)).toEqual({ rating: 1, count: 0, porcentaje: 0 });
  });

  it('con valores faltantes (nadie puso 2 estrellas): esa fila sale en 0, no se omite', () => {
    const filas = resumenEstrellas([{ rating: 5, count: 3 }, { rating: 4, count: 1 }]);
    expect(filas).toHaveLength(5);
    expect(filas.find((f) => f.rating === 2)).toEqual({ rating: 2, count: 0, porcentaje: 0 });
    expect(filas.find((f) => f.rating === 1)).toEqual({ rating: 1, count: 0, porcentaje: 0 });
  });

  it('sin ninguna reseña: cinco filas en cero, sin NaN por dividir entre cero', () => {
    const filas = resumenEstrellas([]);
    expect(filas).toEqual([
      { rating: 5, count: 0, porcentaje: 0 }, { rating: 4, count: 0, porcentaje: 0 },
      { rating: 3, count: 0, porcentaje: 0 }, { rating: 2, count: 0, porcentaje: 0 },
      { rating: 1, count: 0, porcentaje: 0 },
    ]);
  });
});

describe('tituloServicioResena', () => {
  it('con service_title: «Servicio: X»', () => {
    expect(tituloServicioResena(resena({ service_title: 'Arreglo de neveras' }))).toBe('Servicio: Arreglo de neveras');
  });

  it('service_title null (el servicio se borró): no hay línea que pintar', () => {
    expect(tituloServicioResena(resena({ service_title: null }))).toBeNull();
  });

  it('service_title ausente: tampoco', () => {
    expect(tituloServicioResena(resena())).toBeNull();
  });
});
