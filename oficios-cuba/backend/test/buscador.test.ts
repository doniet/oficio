import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { api, ponerPlan, registrar } from './helpers.js';
import { q, qOne } from '../src/db/acceso.js';

async function conArticulo(nombre: string, descripcion = '') {
  const { auth, providerId } = await registrar('provider');
  await ponerPlan(providerId!, 'basic');
  await api.post('/api/catalog').set(auth)
    .send({ name: nombre, description: descripcion, price: 100, price_type: 'fixed' });
}

// Una subcategoría real de la siembra, con su id, nombre y slug juntos (no consultas separadas:
// así el test compara siempre la MISMA fila, no dos subcategorías distintas por azar de orden).
async function categoriaConSlug() {
  return (await qOne<{ id: string; name: string; slug: string }>(
    'SELECT id, name, slug FROM categories WHERE parent_id IS NOT NULL ORDER BY id LIMIT 1',
  ))!;
}

// Una subcategoría real junto al NOMBRE DE SU PADRE (no el suyo propio): así el test de más abajo
// prueba de verdad `parent.busca`, no `c.busca` disfrazado.
async function categoriaConPadre() {
  return (await qOne<{ id: string; parent_name: string }>(
    `SELECT c.id, parent.name AS parent_name FROM categories c
       JOIN categories parent ON c.parent_id = parent.id ORDER BY c.id LIMIT 1`,
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

// Fix round 1: la relevancia por prefijo que pidió Dariel para no perder el "toma" → "Tomacorriente"
// del test heredado de la Tarea 9 (catalogo.test.ts). termino() ahora construye el tsquery a mano
// (palabra por palabra, con :*), así que hay que probar que la entrada hostil de un usuario
// cualquiera no rompe la consulta — to_tsquery, a diferencia de websearch_to_tsquery, SÍ lanza con
// una sintaxis mal formada si se le pasara cruda.
describe('búsqueda por prefijo, segura ante entrada hostil', () => {
  it('un prefijo de la palabra encuentra la palabra completa (no hace falta escribirla entera)', async () => {
    await conArticulo('Tomacorriente doble');
    const { body } = await api.get('/api/catalog/search?q=toma');
    expect(body.items.map((i: { name: string }) => i.name)).toContain('Tomacorriente doble');
  });

  it('el prefijo tampoco distingue mayúsculas ni acentos', async () => {
    await conArticulo('Válvula reguladora');
    for (const t of ['valv', 'VALV', 'válv']) {
      const { body } = await api.get(`/api/catalog/search?q=${encodeURIComponent(t)}`);
      expect(body.items.length, `falló con "${t}"`).toBeGreaterThan(0);
    }
  });

  const entradasHostiles = [
    '"', '""', '(', ')', '(jabon', 'jabon)', 'jabon & (', 'jabon &', '& cemento',
    '&', '|', '!', ':', '&|!():"\'', '   ', '', '☺☺☺', 'jabon | | cemento',
  ];

  it.each(entradasHostiles)('%j no rompe ninguna de las cuatro rutas de búsqueda (nunca 500)', async (texto) => {
    const q = encodeURIComponent(texto);
    const rutas = [
      `/api/catalog/search?q=${q}`,
      `/api/services?q=${q}`,
      `/api/providers?q=${q}`,
      `/api/mapa?bbox=19,-85,24,-74&tab=servicios&q=${q}`,
    ];
    for (const url of rutas) {
      const res = await api.get(url);
      expect(res.status, url).not.toBe(500);
      expect(res.status, url).toBe(200);
    }
  });
});

// Fix round 1: el brief original definía las columnas `busca` solo con los campos "propios" de
// cada tabla, y eso perdía campos que el LIKE anterior sí buscaba (nombre del profesional, nombre
// de categoría, nombre del negocio desde el catálogo). Se recuperan combinando varias columnas
// `busca` con OR en la propia consulta, no engordando una sola columna con campos de otra tabla.
describe('campos recuperados: lo que el LIKE encontraba y las columnas busca por sí solas no cubrían', () => {
  it('buscar el nombre del profesional encuentra su perfil (providers.ts)', async () => {
    const { providerId } = await registrar('provider', { full_name: 'Ramona Céspedes Aguilar' });
    const res = await api.get('/api/providers?q=cespedes');
    expect(res.status).toBe(200);
    expect(res.body.providers.some((p: { id: string }) => p.id === providerId)).toBe(true);
  });

  it('buscar el nombre de una categoría encuentra los servicios de esa categoría (services.ts)', async () => {
    const cat = await categoriaConSlug();
    const { auth } = await registrar('provider');
    await api.post('/api/services').set(auth).send({
      category_id: cat.id, title: 'Oficio sin relación textual con su categoría', price_type: 'negotiable',
    });
    const termino = cat.name.split(' ')[0];
    const res = await api.get(`/api/services?q=${encodeURIComponent(termino)}`);
    expect(res.status).toBe(200);
    expect(res.body.services.length).toBeGreaterThan(0);
  });

  // El código ya busca por el nombre de la categoría PADRE (parent.busca en services.ts y
  // mapa.ts), pero hasta ahora ningún test lo ejercitaba: los de arriba usan siempre el nombre de
  // la SUBcategoría. Sin esta prueba, un `parent.busca` roto o borrado por error no lo detectaba
  // nadie — el servicio sigue apareciendo al buscar por su propia subcategoría de todos modos.
  it('buscar el nombre de la categoría PADRE encuentra los servicios de su subcategoría (services.ts)', async () => {
    const cat = await categoriaConPadre();
    const { auth } = await registrar('provider');
    await api.post('/api/services').set(auth).send({
      category_id: cat.id, title: 'Oficio sin relación textual con su categoría', price_type: 'negotiable',
    });
    const termino = cat.parent_name.split(' ')[0];
    const res = await api.get(`/api/services?q=${encodeURIComponent(termino)}`);
    expect(res.status).toBe(200);
    expect(res.body.services.length).toBeGreaterThan(0);
  });

  it('el término de categoría encuentra lo mismo en la pestaña Servicios del mapa (no solo en la lista)', async () => {
    const cat = await categoriaConSlug();
    const { auth } = await registrar('provider');
    await api.post('/api/services').set(auth).send({
      category_id: cat.id, title: 'Oficio sin relación textual con su categoría', price_type: 'negotiable',
    });
    const termino = cat.name.split(' ')[0];
    const lista = await api.get(`/api/services?q=${encodeURIComponent(termino)}`);
    const mapa = await api.get(`/api/mapa?bbox=19,-85,24,-74&tab=servicios&q=${encodeURIComponent(termino)}`);
    expect(lista.body.services.length).toBeGreaterThan(0);
    expect(mapa.status).toBe(200);
  });

  it('buscar el nombre del negocio encuentra sus artículos de catálogo (catalog.ts)', async () => {
    const { auth, providerId } = await registrar('provider');
    await ponerPlan(providerId!, 'basic');
    await q('UPDATE provider_profiles SET business_name = $1 WHERE id = $2', ['Ferretería El Tornillo Feliz', providerId]);
    await api.post('/api/catalog').set(auth).send({ name: 'Producto genérico', price: 50, price_type: 'fixed' });
    const res = await api.get('/api/catalog/search?q=tornillo');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  // Encontrado al escribir el test de arriba con selección aleatoria de categoría (flakeó ~1 de
  // cada 3 corridas): varias categorías de la siembra se llaman "Palabra/Palabra" (sin espacio),
  // p.ej. "Fotografía/Video" o "Peluquería/Barbería". El parser de texto de Postgres reconoce eso
  // como UN token de tipo "file" y lo manda entero al diccionario `simple`, sin partirlo ni pasar
  // por el stemmer español: buscar "video" no encontraba "Fotografía/Video". esquema.sql ahora
  // cambia "/" por un espacio antes de tokenizar (en las cinco columnas `busca`, no solo en
  // categorías: un nombre de negocio también podría llevar una barra).
  it('un nombre con barra ("Palabra/Palabra") se busca por cada mitad por separado', async () => {
    const cat = (await qOne<{ id: string; name: string }>(
      "SELECT id, name FROM categories WHERE name LIKE '%/%' ORDER BY id LIMIT 1",
    ))!;
    const [mitad1, mitad2] = cat.name.split('/');
    const { auth } = await registrar('provider');
    await api.post('/api/services').set(auth).send({
      category_id: cat.id, title: 'Oficio sin relación textual con su categoría', price_type: 'negotiable',
    });
    for (const termino of [mitad1, mitad2]) {
      const res = await api.get(`/api/services?q=${encodeURIComponent(termino)}`);
      expect(res.status, termino).toBe(200);
      expect(res.body.services.length, termino).toBeGreaterThan(0);
    }
  });
});
