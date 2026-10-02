import type { CatalogItem, CatalogPage } from '@oficio/shared';
import { ANTIRREBOTE_BUSQUEDA_MS, articulosDeCatalogo, montarCatalogo, siguientePagina } from '../src/lib/catalogo';

const articulo = (id: string, overrides: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  name: id,
  description: null,
  price: 100,
  price_type: 'fixed',
  price_currency: 'CUP',
  image: null,
  section: null,
  available: true,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const pagina = (overrides: Partial<CatalogPage> = {}): CatalogPage => ({
  items: [],
  sections: [],
  total: 0,
  total_all: 0,
  page: 1,
  pages: 1,
  ...overrides,
});

describe('montarCatalogo', () => {
  it('sin catálogo (total_all === 0) no se monta', () => {
    expect(montarCatalogo(pagina({ total_all: 0, total: 0 }))).toBe(false);
  });

  it('con catálogo pero el filtro no encontró nada (total_all > 0, total === 0) SÍ se monta', () => {
    expect(montarCatalogo(pagina({ total_all: 5, total: 0 }))).toBe(true);
  });

  it('con catálogo y resultados se monta', () => {
    expect(montarCatalogo(pagina({ total_all: 5, total: 3 }))).toBe(true);
  });

  it('sin página todavía (cargando) no se monta', () => {
    expect(montarCatalogo(undefined)).toBe(false);
  });
});

describe('siguientePagina', () => {
  it('devuelve la página siguiente mientras queden', () => {
    expect(siguientePagina(pagina({ page: 1, pages: 3 }))).toBe(2);
  });

  it('corta en la última página', () => {
    expect(siguientePagina(pagina({ page: 3, pages: 3 }))).toBeUndefined();
  });

  it('una sola página no tiene siguiente', () => {
    expect(siguientePagina(pagina({ page: 1, pages: 1 }))).toBeUndefined();
  });
});

describe('articulosDeCatalogo', () => {
  it('encadena los artículos de varias páginas en orden', () => {
    const paginas = [
      pagina({ items: [articulo('a'), articulo('b')] }),
      pagina({ items: [articulo('c')] }),
    ];
    expect(articulosDeCatalogo(paginas).map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('sin páginas todavía, lista vacía', () => {
    expect(articulosDeCatalogo(undefined)).toEqual([]);
  });

  // La trampa: un agotado NUNCA se filtra aquí, se pinta atenuado con la insignia «Agotado».
  it('los artículos agotados se quedan en la lista', () => {
    const paginas = [pagina({ items: [articulo('a', { available: false }), articulo('b')] })];
    expect(articulosDeCatalogo(paginas).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

it('el antirrebote de búsqueda es 400 ms, igual que la web', () => {
  expect(ANTIRREBOTE_BUSQUEDA_MS).toBe(400);
});
