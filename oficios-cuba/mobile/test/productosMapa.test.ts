import type { ProductoMapa } from '@oficio/shared';
import {
  ORDENES_PRODUCTOS, articulosConMarcado, cajaQueIncluye, claveProductos, lugarYDistancia, pedirProductos,
  puntoDesdeProducto, qsProductos, textoVerProductos, tituloProductos,
} from '../src/lib/productosMapa';

const base = { sur: 22, oeste: -80, norte: 22.1, este: -79.9 };

const producto = (extra: Partial<ProductoMapa> = {}): ProductoMapa => ({
  id: 'p1', provider_id: 'u1', provider_name: 'Ana', provider_avatar: null, subscription_plan: 'pro',
  contact_mode: 'whatsapp', whatsapp: null, province_name: null, municipality_name: null,
  lat: 22.05, lng: -79.95, tipo: 'negocio', aproximado: true, ...extra,
} as ProductoMapa);

describe('textos', () => {
  it('tituloProductos', () => {
    expect(tituloProductos(1)).toBe('1 producto en esta zona');
    expect(tituloProductos(0)).toBe('0 productos en esta zona');
    expect(tituloProductos(7)).toBe('7 productos en esta zona');
  });
  it('textoVerProductos', () => {
    expect(textoVerProductos(3, 0)).toBe('Ver 3 productos');
    expect(textoVerProductos(1, 0)).toBe('Ver 1 producto');
    expect(textoVerProductos(0, 4)).toBe('Ver productos cercanos');
    expect(textoVerProductos(0, 0)).toBeNull();
  });
  it('órdenes', () => {
    expect(ORDENES_PRODUCTOS.map((o) => o.valor)).toEqual(['relevance', 'price_asc', 'price_desc']);
  });
});

describe('lugarYDistancia', () => {
  it('municipio, provincia o solo distancia', () => {
    expect(lugarYDistancia(producto({ municipality_name: 'Cerro', distancia_km: 4.1 }))).toBe('Cerro, 4,1 km');
    expect(lugarYDistancia(producto({ municipality_name: 'Cerro', distancia_km: 2 }))).toBe('Cerro, 2,0 km');
    expect(lugarYDistancia(producto({ province_name: 'La Habana', distancia_km: 4.1 }))).toBe('La Habana, 4,1 km');
    expect(lugarYDistancia(producto({ distancia_km: 4.1 }))).toBe('4,1 km');
  });
});

it('puntoDesdeProducto', () => {
  expect(puntoDesdeProducto(producto())).toEqual({
    id: 'u1', nombre: 'Ana', tipo: 'negocio', lat: 22.05, lng: -79.95, aproximado: true, plan: 'pro',
    detras: 0, cy: 0, cx: 0, resumen: '',
  });
});

describe('qsProductos', () => {
  it('incluye lo dado y omite category vacía', () => {
    const qs = new URLSearchParams(qsProductos(base, { q: 'cake', sort: 'price_asc', page: 2 }));
    expect(qs.get('bbox')).toBe('22,-80,22.1,-79.9');
    expect(qs.get('q')).toBe('cake');
    expect(qs.get('sort')).toBe('price_asc');
    expect(qs.get('page')).toBe('2');
    expect(qs.has('category')).toBe(false);
  });
});

describe('pedirProductos', () => {
  afterEach(() => { delete (global as { fetch?: unknown }).fetch; });
  it('pide con la señal y devuelve el JSON', async () => {
    const cuerpo = { dentro: { items: [], total: 0, page: 1, pages: 0 }, fuera: [] };
    const f = jest.fn(async () => ({ ok: true, json: async () => cuerpo }));
    (global as { fetch?: unknown }).fetch = f;
    const señal = new AbortController().signal;
    await expect(pedirProductos(base, { sort: 'relevance', page: 1 }, señal)).resolves.toEqual(cuerpo);
    const [url, opts] = f.mock.calls[0] as unknown as [string, { signal: AbortSignal }];
    expect(url).toContain('/mapa/productos?');
    expect(opts.signal).toBe(señal);
  });
  it('rechaza si !ok', async () => {
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false }));
    await expect(pedirProductos(base, { sort: 'relevance', page: 1 }, new AbortController().signal)).rejects.toThrow();
  });
});

describe('cajaQueIncluye', () => {
  it('amplía lo justo', () => {
    expect(cajaQueIncluye(base, { lat: 22.5, lng: -79.95 })).toEqual({ ...base, norte: 22.5 });
    expect(cajaQueIncluye(base, { lat: 21, lng: -81 })).toEqual({ ...base, sur: 21, oeste: -81 });
  });
  it('punto dentro: igual', () => {
    expect(cajaQueIncluye(base, { lat: 22.05, lng: -79.95 })).toEqual(base);
  });
});

describe('claveProductos', () => {
  it('vacía sin zona; distinta por sort', () => {
    expect(claveProductos(null, 'a', '', 'relevance')).toBe('');
    expect(claveProductos(base, 'a', '', 'relevance')).not.toBe(claveProductos(base, 'a', '', 'price_asc'));
    expect(claveProductos(base, 'a', '', 'relevance')).toBe(claveProductos({ ...base }, 'a', '', 'relevance'));
  });
});

describe('articulosConMarcado', () => {
  const a = producto({ id: 'a' });
  const b = producto({ id: 'b' });
  const c = producto({ id: 'c' });

  it('sin marcado deja la lista igual', () => {
    expect(articulosConMarcado([a, b], null)).toEqual([a, b]);
  });
  it('pone el marcado primero', () => {
    expect(articulosConMarcado([a, b, c], c).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('no duplica si el catálogo ya lo trae', () => {
    expect(articulosConMarcado([a, b], a).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('lo incluye aunque el catálogo filtrado venga vacío', () => {
    expect(articulosConMarcado([], b).map((x) => x.id)).toEqual(['b']);
  });
});
