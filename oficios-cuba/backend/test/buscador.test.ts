import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { api, ponerPlan, registrar } from './helpers.js';
import { qOne } from '../src/db/acceso.js';

async function conArticulo(nombre: string, descripcion = '') {
  const { auth, providerId } = await registrar('provider');
  await ponerPlan(providerId!, 'basic');
  await api.post('/api/catalog').set(auth)
    .send({ name: nombre, description: descripcion, price: 100, price_type: 'fixed' });
}

// Una subcategoría real de la siembra, con su id y su slug juntos (no dos consultas separadas:
// así el test compara siempre la MISMA fila, no dos subcategorías distintas por azar de orden).
async function categoriaConSlug() {
  return (await qOne<{ id: string; slug: string }>(
    'SELECT id, slug FROM categories WHERE parent_id IS NOT NULL ORDER BY id LIMIT 1',
  ))!;
}

describe('búsqueda por tsvector', () => {
  it('encuentra por una palabra del nombre', async () => {
    await conArticulo('Arroz importado');
    const { body } = await api.get('/api/catalog/search?q=arroz');
    expect(body.items.map((i: { name: string }) => i.name)).toContain('Arroz importado');
  });

  it('no distingue mayúsculas (Review Focus 5)', async () => {
    await conArticulo('Cemento gris');
    for (const t of ['cemento', 'CEMENTO', 'Cemento']) {
      const { body } = await api.get(`/api/catalog/search?q=${t}`);
      expect(body.items.length, `falló con "${t}"`).toBeGreaterThan(0);
    }
  });

  it('no distingue acentos', async () => {
    await conArticulo('Jabón de baño');
    for (const t of ['jabon', 'jabón', 'JABON']) {
      const { body } = await api.get(`/api/catalog/search?q=${t}`);
      expect(body.items.length, `falló con "${t}"`).toBeGreaterThan(0);
    }
  });

  it('encuentra por la descripción', async () => {
    await conArticulo('Producto X', 'ventilador de techo silencioso');
    const { body } = await api.get('/api/catalog/search?q=ventilador');
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('un término sin coincidencias devuelve lista vacía, no error', async () => {
    const res = await api.get('/api/catalog/search?q=xyzzyqwerty');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('el término del mapa encuentra lo mismo que el de la lista', async () => {
    await conArticulo('Malanga fresca');
    const lista = await api.get('/api/catalog/search?q=malanga');
    const mapa = await api.get('/api/mapa?bbox=19,-85,24,-74&tab=productos&q=malanga');
    expect(lista.body.items.length).toBeGreaterThan(0);
    // El mapa solo muestra quien marcó show_on_map, así que puede traer menos;
    // lo que no puede es fallar ni vaciarse por interpretar el término distinto.
    expect(mapa.status).toBe(200);
  });
});

describe('LIKE no vuelve', () => {
  it("no queda ningún LIKE '%…%' en las rutas", () => {
    const base = resolve(__dirname, '../src/routes');
    const archivos = ['providers.ts', 'services.ts', 'catalog.ts', 'mapa.ts'];
    for (const f of archivos) {
      expect(readFileSync(resolve(base, f), 'utf8'), f).not.toMatch(/LIKE \?|LIKE '%/);
    }
  });

  it('tampoco queda ningún ILIKE de búsqueda (la Tarea 7 lo dejó temporal)', () => {
    const base = resolve(__dirname, '../src/routes');
    const archivos = ['providers.ts', 'services.ts', 'catalog.ts', 'mapa.ts'];
    for (const f of archivos) {
      expect(readFileSync(resolve(base, f), 'utf8'), f).not.toMatch(/ILIKE/);
    }
  });
});

// Bug de la migración (pendiente desde la Tarea 7/8): `category` acepta un uuid o un slug, y
// comparar un valor sin forma de uuid contra la columna `c.id` lanza 22P02, que errorHandler
// traduce a 404 sobre el listado entero en vez de 200 con lista vacía.
describe('filtro category: uuid o slug, nunca 404 por un valor que no calza', () => {
  it('/api/services con un valor que no es uuid ni slug real da 200 con lista vacía', async () => {
    const res = await api.get('/api/services?category=esto-no-existe-de-verdad');
    expect(res.status).toBe(200);
    expect(res.body.services).toEqual([]);
  });

  it('/api/providers con un valor que no es uuid ni slug real da 200 con lista vacía', async () => {
    const res = await api.get('/api/providers?category=esto-no-existe-de-verdad');
    expect(res.status).toBe(200);
    expect(res.body.providers).toEqual([]);
  });

  it('/api/mapa con un valor que no es uuid ni slug real da 200 (no 404)', async () => {
    const res = await api.get('/api/mapa?bbox=19,-85,24,-74&tab=servicios&category=esto-no-existe-de-verdad');
    expect(res.status).toBe(200);
  });

  it('la búsqueda por slug legítima de categoría sigue funcionando en /api/services', async () => {
    const cat = await categoriaConSlug();
    const { auth } = await registrar('provider');
    await api.post('/api/services').set(auth).send({
      category_id: cat.id, title: 'Oficio de la categoría de prueba', price_type: 'negotiable',
    });
    const res = await api.get(`/api/services?category=${cat.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.services.length).toBeGreaterThan(0);
  });

  it('la búsqueda por slug legítima de categoría sigue funcionando en /api/providers', async () => {
    const cat = await categoriaConSlug();
    const { auth } = await registrar('provider');
    await api.post('/api/services').set(auth).send({
      category_id: cat.id, title: 'Oficio de la categoría de prueba (providers)', price_type: 'negotiable',
    });
    const res = await api.get(`/api/providers?category=${cat.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.providers.length).toBeGreaterThan(0);
  });
});
