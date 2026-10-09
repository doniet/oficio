import { beforeAll, describe, expect, it } from 'vitest';
import { api, ponerPlan, registrar } from './helpers.js';
import { q, qOne } from '../src/db/acceso.js';

// Zona visible de las pruebas, lejos de cualquier otro sembrado. Centro (22.05, -79.95).
const VISIBLE = '22.00,-80.00,22.10,-79.90';

async function provinciaId() {
  return (await qOne<{ id: string }>('SELECT id FROM provinces LIMIT 1'))!.id;
}

// Un negocio con catálogo (plan Básico) y ubicación publicada. La precisión va en el PUT: el
// punto publicado se calcula al guardar, tocar map_precision por detrás no lo recalcula.
async function negocio(nombre: string, lat: number, lng: number, opts: { showOnMap?: boolean; precision?: 'exacta' | 'zona' } = {}) {
  const p = await registrar('provider');
  await ponerPlan(p.providerId!, 'basic');
  const r = await api.put('/api/providers/me/profile').set(p.auth).send({
    business_name: nombre, province_id: await provinciaId(), contact_mode: 'whatsapp',
    lat, lng, show_on_map: opts.showOnMap ?? true, map_precision: opts.precision ?? 'exacta',
  });
  expect(r.status).toBe(200);
  return p;
}

async function articulo(auth: Record<string, string>, name: string, extra: Record<string, unknown> = {}) {
  const r = await api.post('/api/catalog').set(auth).send({ name, price_type: 'fixed', price: 100, ...extra });
  expect(r.status).toBe(201);
  return r.body.item.id as string;
}

const pedir = (params: Record<string, string>) => api.get('/api/mapa/productos').query({ bbox: VISIBLE, ...params });
const nombres = (items: { name: string }[]) => items.map((i) => i.name);

let D1: string; let D2: string;
let LAT_ZONA_EXACTA: number; let LNG_ZONA_EXACTA: number;
let LAT_ZONA_PUB: number; let LNG_ZONA_PUB: number;

beforeAll(async () => {
  // Dentro de VISIBLE. Los precios están elegidos para que el orden sea el mismo con
  // cualquier tasa razonable (200-1800 CUP por USD): 1 USD > 200 CUP, 1 USD < 1800 CUP, 20 USD > 3500 CUP.
  const d1 = await negocio('Dulcería Uno', 22.03, -79.97);
  D1 = d1.providerId!;
  await articulo(d1.auth, 'Cake de chocolate', { price: 1800 });
  await articulo(d1.auth, 'Cake de fresa', { price_type: 'ask', price: null });
  await articulo(d1.auth, 'Cake helado', { price: 1, price_currency: 'USD' });
  await articulo(d1.auth, 'Pan de flauta', { price: 50 });

  const d2 = await negocio('Repostería Dos', 22.07, -79.93);
  D2 = d2.providerId!;
  await articulo(d2.auth, 'Cake de guayaba', { price: 2600 });
  await articulo(d2.auth, 'Mini cake de coco', { price: 200 });
  await articulo(d2.auth, 'Cake personalizado', { price_type: 'from', price: 3500 });
  await articulo(d2.auth, 'Cake grande', { price: 20, price_currency: 'USD' });
  const agotado = await articulo(d2.auth, 'Cake agotado', { price: 10 });
  expect((await api.patch(`/api/catalog/${agotado}/available`).set(d2.auth).send({ available: false })).status).toBe(200);

  // Fuera de VISIBLE pero dentro del margen del 50 % que infla /mapa (norte 22.10 + 0.05).
  const margen = await negocio('Pastelería Margen', 22.12, -79.95);
  await articulo(margen.auth, 'Cake marquesina', { price: 900 });

  // Dentro de VISIBLE pero sin mostrarse en el mapa: nunca sale.
  const oculto = await negocio('Negocio Oculto', 22.05, -79.95, { showOnMap: false });
  await articulo(oculto.auth, 'Cake secreto');

  // Dentro de VISIBLE, pero bajó a Gratis: su catálogo deja de ser público.
  const gratis = await negocio('Negocio Gratis', 22.05, -79.96);
  await articulo(gratis.auth, 'Cake gratis');
  await ponerPlan(gratis.providerId!, 'free');

  // Perfil «zona», lejos: su punto publicado está a 100-300 m de la casa.
  LAT_ZONA_EXACTA = 22.5; LNG_ZONA_EXACTA = -79.5;
  const zona = await negocio('Dulces Zona', LAT_ZONA_EXACTA, LNG_ZONA_EXACTA, { precision: 'zona' });
  await articulo(zona.auth, 'Pastel escondido');
  const pub = (await qOne<{ lat: number; lng: number }>(
    'SELECT ST_Y(punto_pub::geometry) AS lat, ST_X(punto_pub::geometry) AS lng FROM provider_profiles WHERE id = $1',
    [zona.providerId],
  ))!;
  LAT_ZONA_PUB = pub.lat; LNG_ZONA_PUB = pub.lng;
});

describe('GET /api/mapa/productos — dentro', () => {
  it('trae los productos de la zona visible que coinciden, sin agotados, ocultos ni de plan Gratis', async () => {
    const r = await pedir({ q: 'cake' });
    expect(r.status).toBe(200);
    expect(nombres(r.body.dentro.items).sort()).toEqual([
      'Cake de chocolate', 'Cake de fresa', 'Cake de guayaba', 'Cake grande', 'Cake helado', 'Cake personalizado', 'Mini cake de coco',
    ]);
    expect(r.body.dentro.total).toBe(7);
    expect(r.body.dentro.pages).toBe(1);
  });

  it('sin texto trae todo lo de la zona', async () => {
    const r = await pedir({});
    expect(nombres(r.body.dentro.items)).toContain('Pan de flauta');
    expect(r.body.dentro.total).toBe(8);
  });

  it('un negocio en el margen del 50 % de /mapa NO cuenta como de la zona', async () => {
    const r = await pedir({ q: 'cake' });
    expect(nombres(r.body.dentro.items)).not.toContain('Cake marquesina');
  });

  it('cada item trae el negocio y su punto publicado', async () => {
    const r = await pedir({ q: 'chocolate' });
    const [it0] = r.body.dentro.items;
    expect(it0).toMatchObject({ name: 'Cake de chocolate', provider_id: D1, provider_name: 'Dulcería Uno', tipo: 'oficio', aproximado: false });
    expect(it0.lat).toBeCloseTo(22.03, 5);
    expect(it0.lng).toBeCloseTo(-79.97, 5);
    expect(it0).not.toHaveProperty('map_precision');
    expect(it0).not.toHaveProperty('precio_cup');
  });

  it('price_asc compara el USD convertido a CUP y deja «A consultar» al final', async () => {
    const r = await pedir({ q: 'cake', sort: 'price_asc' });
    expect(nombres(r.body.dentro.items)).toEqual([
      'Mini cake de coco', 'Cake helado', 'Cake de chocolate', 'Cake de guayaba', 'Cake personalizado', 'Cake grande', 'Cake de fresa',
    ]);
  });

  it('price_desc también deja «A consultar» al final', async () => {
    const r = await pedir({ q: 'cake', sort: 'price_desc' });
    expect(nombres(r.body.dentro.items)).toEqual([
      'Cake grande', 'Cake personalizado', 'Cake de guayaba', 'Cake de chocolate', 'Cake helado', 'Mini cake de coco', 'Cake de fresa',
    ]);
  });

  it('relevance intercala negocios: los dos primeros son de negocios distintos', async () => {
    const r = await pedir({ q: 'cake' });
    const [a, b] = r.body.dentro.items;
    expect(new Set([a.provider_id, b.provider_id])).toEqual(new Set([D1, D2]));
  });

  it('page = 2 sin más resultados devuelve listas vacías', async () => {
    const r = await pedir({ q: 'cake', page: '2' });
    expect(r.status).toBe(200);
    expect(r.body.dentro.items).toEqual([]);
    expect(r.body.fuera).toEqual([]);
  });

  it('un perfil «zona» se filtra por su punto publicado, no por su casa', async () => {
    const d = 0.0003; // ~33 × 31 m: la esquina queda a ~45 m, muy por debajo de los 100 m mínimos del desplazamiento
    const casa = `${LAT_ZONA_EXACTA - d},${LNG_ZONA_EXACTA - d},${LAT_ZONA_EXACTA + d},${LNG_ZONA_EXACTA + d}`;
    const publicado = `${LAT_ZONA_PUB - d},${LNG_ZONA_PUB - d},${LAT_ZONA_PUB + d},${LNG_ZONA_PUB + d}`;
    const enCasa = await api.get('/api/mapa/productos').query({ bbox: casa, q: 'escondido' });
    expect(nombres(enCasa.body.dentro.items)).toEqual([]);
    const enPublicado = await api.get('/api/mapa/productos').query({ bbox: publicado, q: 'escondido' });
    expect(nombres(enPublicado.body.dentro.items)).toEqual(['Pastel escondido']);
    expect(enPublicado.body.dentro.items[0].aproximado).toBe(true);
  });

  it('rechaza un sort inventado y un bbox inválido', async () => {
    expect((await pedir({ sort: 'barato' })).status).toBe(400);
    expect((await api.get('/api/mapa/productos').query({ bbox: '25,-82,26,-81' })).status).toBe(400);
    expect((await api.get('/api/mapa/productos')).status).toBe(400);
  });
});
