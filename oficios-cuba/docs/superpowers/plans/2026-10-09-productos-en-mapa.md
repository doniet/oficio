# Productos en el mapa (entrega 1: servidor + web) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al buscar en la pestaña Productos del mapa de `/explorar` aparezca una lista compacta de los productos de la zona visible, ordenable por precio, con los más cercanos de fuera aparte, y que tocar uno abra encima la ficha del negocio con ese producto marcado.

**Architecture:** Un endpoint nuevo, `GET /api/mapa/productos`, en `routes/mapa.ts`, que reutiliza la validación del bbox y las piezas de artículo de `catalog.ts`, y filtra y mide solo sobre `punto_pub`. En la web, `usarMapa` avisa de la zona con que pintó los pines; un hook nuevo, `usarProductosMapa`, pide la lista para esa misma zona; `ListaProductos` es un tercer contenido de `PanelMapa` (junto a `FichaPunto` y `ListaCelda`), y `ExplorarMapa` coordina abrir, volver, resaltar y ampliar el mapa.

**Tech Stack:** Node 22 · Express 4 · TypeScript (`strict:false` en el backend) · Postgres 18 + PostGIS 3.6 vía `pg` · vitest + supertest · React 18 + Vite + Tailwind 3 + react-leaflet · vitest + Testing Library.

**Spec:** `oficios-cuba/docs/superpowers/specs/2026-10-09-productos-en-mapa-design.md`. Renders: https://claude.ai/artifact/VBEYXFb7WkX2aCSUe2HxFM

## Global Constraints

- **Rama y sitio.** Rama `productos-en-mapa` desde `master` (que ya trae `3b38524` y el spec `1a5ead8`, aún sin push), en un worktree propio: desde `/home/wajir0/docker/oficio`, `git worktree add /home/wajir0/worktrees/oficio-productos-mapa -b productos-en-mapa master`. **Nunca** se edita en `/home/wajir0/docker/oficio`: es el checkout de producción.
- **Base de pruebas.** Los tests del backend usan el contenedor `oficio_db_test` (`127.0.0.1:55432`). Copiar el `.env` del worktree `oficio-postgres`, que ya apunta ahí y fija `COMPOSE_PROJECT_NAME`: `cp /home/wajir0/worktrees/oficio-postgres/oficios-cuba/.env /home/wajir0/worktrees/oficio-productos-mapa/oficios-cuba/.env && chmod 600 /home/wajir0/worktrees/oficio-productos-mapa/oficios-cuba/.env`. **No imprimir** su contenido. Después `npm ci` en `backend/` y `frontend/`.
- **Comandos de verificación.** Backend: `cd oficios-cuba/backend && npx vitest run <archivo>` y, al cerrar cada tarea de backend, `npm test && npm run typecheck`. Web: `cd oficios-cuba/frontend && npx vitest run <archivo>`, y al cerrar cada tarea de web `npx tsc --noEmit && npx vitest run && npm run build`.
- **Privacidad.** Todo filtro, orden o medida de ubicación en esta entrega usa `pp.punto_pub` (o `LAT_SERVIDA`/`LNG_SERVIDA`), **nunca** `pp.lat`/`pp.lng`.
- **Endpoint.** `GET /api/mapa/productos?bbox=sur,oeste,norte,este&q=&category=&sort=relevance|price_asc|price_desc&page=`. Respuesta `{ dentro: { items, total, page, pages }, fuera }`. 20 por página. `fuera`: hasta 10, solo en `page = 1`. `sort` inventado → 400.
- **Precio para ordenar.** CUP; USD × `TASA_CUP_USD` (`config.ts`); `price_type = 'ask'` o precio nulo → `NULL` y `NULLS LAST` en los dos sentidos. Desempate por `id`.
- **URL.** El orden va en `&orden=`; `relevance` no se escribe (`null`), igual que `servicios` en `tab`.
- **Textos de la UI** en español de Cuba, con tuteo: «N productos en esta zona» / «1 producto en esta zona», «Mueve el mapa para ver otros», «Relevancia», «Menor precio», «Mayor precio», «Fuera de esta zona · N», «Toca uno y el mapa se amplía para incluirlo», «Los precios en USD se comparan a la tasa de referencia. «A consultar» va al final.», «No hay productos en esta zona.», «Ver más productos», «Ver N productos», «Ver productos cercanos», «Lo que tocaste».
- **Commits** en español, imperativo, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Nada se despliega.** Este plan no toca `~/docker/oficio` ni su `.env`, ni el túnel, ni Traefik. Desplegar exige el OK de Dariel (skill `oficio-deploy-vps2`). Tampoco toca `mobile/` ni `shared/`: eso es la entrega 2.

## Review Focus

Cinco entradas que una persona real va a provocar y que ninguna prueba cubriría si no se añade a propósito. Cada línea lleva su prueba en la tarea dueña del código:

1. **Mover el mapa mientras «Ver más» está cargando** → la página que llega tarde pertenece a la zona vieja y no puede pegarse a la lista de la zona nueva. → Tarea 3.
2. **Buscar por el nombre del negocio** («Mimi») → el producto sale en la lista porque el negocio coincide, pero `/catalog/provider/:id?q=Mimi` no devuelve artículos: la ficha tiene que enseñar al menos el producto tocado, no «No encontramos productos». → Tarea 5.
3. **Un negocio justo fuera de la zona visible pero dentro del margen del 50 % que usa `/mapa`** → sale en `fuera`, no en `dentro`; si no, la cuenta «N en esta zona» miente. → Tarea 1.
4. **Un perfil «zona» buscado con un rectángulo minúsculo sobre su casa real** → no aparece en `dentro`: lo decide `punto_pub`. → Tarea 1.
5. **Tocar un pin cuando la lista de productos está abierta y luego cerrar la ficha** → no queda el panel vacío ni un «Volver» que no lleva a nada; queda el botón «Ver N productos». → Tarea 6.

---

### Task 1: Endpoint `/api/mapa/productos` — `dentro`, validación y privacidad

**Files:**
- Modify: `oficios-cuba/backend/src/routes/catalog.ts:17,31-33` (exportar `CON_CATALOGO` y `COLUMNAS`)
- Modify: `oficios-cuba/backend/src/routes/mapa.ts` (imports, constantes y ruta nueva antes de `export default router`)
- Create: `oficios-cuba/backend/test/mapa-productos.test.ts`

**Interfaces:**
- Produces: `GET /api/mapa/productos` con `dentro` completo y `fuera: []` (la Tarea 2 lo rellena). Cada item:
  `CatalogItem` (columnas de `COLUMNAS`) + `provider_id, provider_name, provider_avatar, subscription_plan, contact_mode, whatsapp, province_name, municipality_name, lat, lng, tipo: 'oficio'|'negocio', aproximado: boolean`.
- Produces (helpers en `mapa.ts`, los usa la Tarea 2): `filtroProductos(texto, category) → { where, params, coincide }`, `PRECIO_CUP_ARTICULO`, `JOINS_PRODUCTOS`, `COLUMNAS_PRODUCTO_MAPA`, `aProductoMapa(fila)`, `ORDEN_PRECIO: Record<'price_asc'|'price_desc', string>`.

- [ ] **Step 1: Crear el worktree, el `.env` y las dependencias** (ver Global Constraints). Comprobar que la suite base pasa: `cd oficios-cuba/backend && npm test` → todo verde (los «Unhandled Errors» `57P01` ocasionales de `mapa.test.ts` son conocidos y no son fallos).

- [ ] **Step 2: Escribir los tests que fallan**

`oficios-cuba/backend/test/mapa-productos.test.ts`:

```ts
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
```

La Tarea 2 añade su sembrado y su `describe` en este mismo archivo.

- [ ] **Step 3: Correr y ver que fallan**

Run: `cd oficios-cuba/backend && npx vitest run test/mapa-productos.test.ts`
Expected: FAIL — `/api/mapa/productos` responde 404 (o 400 por `Celda`/ruta inexistente), no 200.

- [ ] **Step 4: Exportar las piezas de artículo de `catalog.ts`**

En `oficios-cuba/backend/src/routes/catalog.ts`, añadir `export` a las dos constantes (sin cambiar su valor):

```ts
export const CON_CATALOGO = `pp.is_active = true AND ${CON_CATALOGO_SQL}`;
```
```ts
export const COLUMNAS = "ci.id, ci.name, ci.description, ci.price, ci.price_type, ci.price_currency, ci.image, ci.section, ci.available, ci.created_at, ci.origen, ci.origen <> 'dardoventas' AS convertible";
```

- [ ] **Step 5: Implementar la ruta en `mapa.ts`**

Imports nuevos arriba de `oficios-cuba/backend/src/routes/mapa.ts`:

```ts
import { TASA_CUP_USD } from '../config.js';
import { COLUMNAS as COLUMNAS_ARTICULO, CON_CATALOGO } from './catalog.js';
```

Antes de `export default router;`:

```ts
// ── Productos de la zona visible ───────────────────────────────────────────────────────────────
// La lista de la pestaña Productos del mapa. A diferencia de `/` y `/celda`, NO infla el bbox con
// conMargen: la lista dice «N productos en esta zona» y tiene que ser verdad para lo que se ve.

const ORDENES_PRODUCTOS = ['relevance', 'price_asc', 'price_desc'] as const;
type OrdenProductos = (typeof ORDENES_PRODUCTOS)[number];
const POR_PAGINA_PRODUCTOS = 20;

// En CUP para poder comparar monedas. Con la tasa de RESPALDO, como el filtro de precio de
// /services: la del día vive en nginx (/api/tasas) y la API no tiene salida para pedirla.
// NULL para «A consultar»: con NULLS LAST va al final en los dos sentidos.
export const PRECIO_CUP_ARTICULO = `(CASE WHEN ci.price_type = 'ask' OR ci.price IS NULL THEN NULL
  WHEN ci.price_currency = 'USD' THEN ci.price * ${Number(TASA_CUP_USD)} ELSE ci.price END)`;

export const ORDEN_PRECIO: Record<'price_asc' | 'price_desc', string> = {
  price_asc: 'precio_cup ASC NULLS LAST, id',
  price_desc: 'precio_cup DESC NULLS LAST, id',
};

export const JOINS_PRODUCTOS = `FROM catalog_items ci
  JOIN provider_profiles pp ON ci.provider_id = pp.id
  JOIN users u ON pp.user_id = u.id
  LEFT JOIN provinces p ON pp.province_id = p.id
  LEFT JOIN municipalities m ON pp.municipality_id = m.id`;

// Las mismas columnas que /catalog/search (para que la web reuse CatalogSearchItem) más el punto
// PUBLICADO. kind y map_precision se leen para decidir `tipo` y `aproximado`, y no se devuelven.
export const COLUMNAS_PRODUCTO_MAPA = `${COLUMNAS_ARTICULO}, pp.id AS provider_id,
  COALESCE(pp.business_name, u.full_name) AS provider_name, u.avatar_url AS provider_avatar,
  pp.subscription_plan, pp.contact_mode, pp.whatsapp, p.name AS province_name, m.name AS municipality_name,
  pp.kind, pp.map_precision, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng`;

// Lo común a `dentro` y `fuera`: visibilidad del artículo y del perfil, texto y categoría. Sin la
// condición de zona: cada consulta añade la suya. Parámetros desde $1, como filtroDeVisibles.
export function filtroProductos(texto: string | undefined, category: string | undefined) {
  let where = `WHERE ${CON_CATALOGO} AND ci.available = true AND pp.show_on_map = true AND pp.punto_pub IS NOT NULL`;
  const params: unknown[] = [];
  let coincide = '0';
  const idx = params.length + 1;
  const t = termino(texto, 'ci.busca', idx);
  if (t) {
    // pp.busca igual que /catalog/search: el nombre del negocio también es un término válido.
    where += ` AND (${t.sql} OR pp.busca @@ ${consultaSQL(idx)})`;
    params.push(...t.params);
    coincide = `ts_rank(ci.busca, ${consultaSQL(idx)})`;
  }
  if (category) {
    const campo = categoriaColumna(category);
    params.push(category);
    const n = params.length;
    where += ` AND pp.id IN (SELECT s.provider_id FROM services s JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true AND (c.${campo} = $${n} OR c.parent_id IN (SELECT id FROM categories WHERE ${campo} = $${n})))`;
  }
  return { where, params, coincide };
}

// Fila de SQL → lo que viaja. Se quitan las columnas de trabajo; `tipo` sale de segunPlan(), la
// única fuente de «qué kind se le muestra a la gente» (ver el comentario en GET /).
export function aProductoMapa(f: any) {
  const { peso: _p, coincide: _c, turno: _t, precio_cup: _pc, distancia_m, kind: _k, map_precision, ...r } = f;
  const plan = segunPlan(f);
  return {
    ...r,
    subscription_plan: plan.subscription_plan,
    tipo: plan.kind as 'oficio' | 'negocio',
    aproximado: map_precision === 'zona',
    ...(distancia_m != null ? { distancia_km: Math.round(Number(distancia_m) / 100) / 10 } : {}),
  };
}

router.get('/productos', asyncHandler(async (req, res) => {
  if (req.query.sort !== undefined && typeof req.query.sort !== 'string') throw new AppError('Orden no válido', 400);
  const { q: texto, category, sort = 'relevance' } = queryTextos(req.query, ['q', 'category', 'sort'] as const);
  if (!ORDENES_PRODUCTOS.includes(sort as OrdenProductos)) throw new AppError('Orden no válido', 400);
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const page = Math.max(1, Number(req.query.page) || 1);

  const { where, params, coincide } = filtroProductos(texto, category);
  // ST_MakeEnvelope toma (oeste, sur, este, norte): OTRO orden que el bbox de la API.
  const e = params.length;
  params.push(visible.oeste, visible.sur, visible.este, visible.norte);
  const caja = `ST_MakeEnvelope($${e + 1}, $${e + 2}, $${e + 3}, $${e + 4}, 4326)::geography`;
  const dentroWhere = `${where} AND ST_Intersects(pp.punto_pub, ${caja})`;

  const total = Number((await qOne<{ n: string }>(`SELECT COUNT(*) AS n ${JOINS_PRODUCTOS} ${dentroWhere}`, params))!.n);

  const orden = sort === 'relevance'
    ? 'turno, peso DESC, coincide DESC, created_at DESC, id'
    : ORDEN_PRECIO[sort as 'price_asc' | 'price_desc'];
  const conPagina = [...params, POR_PAGINA_PRODUCTOS, (page - 1) * POR_PAGINA_PRODUCTOS];
  const filas = await q<any>(`
    SELECT * FROM (
      SELECT ${COLUMNAS_PRODUCTO_MAPA}, ${PLAN_WEIGHT_SQL} AS peso, ${coincide} AS coincide, ${PRECIO_CUP_ARTICULO} AS precio_cup,
        -- Mismo intercalado que /catalog/search: primero el mejor artículo de cada negocio, luego el segundo…
        ROW_NUMBER() OVER (PARTITION BY ci.provider_id ORDER BY ${coincide} DESC, ci.image IS NULL ASC, ci.created_at DESC) AS turno
      ${JOINS_PRODUCTOS} ${dentroWhere}
    ) x ORDER BY ${orden} LIMIT $${conPagina.length - 1} OFFSET $${conPagina.length}
  `, conPagina);

  res.json({
    dentro: { items: filas.map(aProductoMapa), total, page, pages: Math.max(1, Math.ceil(total / POR_PAGINA_PRODUCTOS)) },
    fuera: [],
  });
}));
```

- [ ] **Step 6: Correr los tests**

Run: `npx vitest run test/mapa-productos.test.ts`
Expected: PASS los 10.

Si `price_asc` falla con «Cake helado» fuera de sitio, revisar que `TASA_CUP_USD` del entorno de test está entre 200 y 1800 (`node -e "require('dotenv').config({path:'../.env'});console.log(process.env.TASA_CUP_USD ?? 'sin definir: 730')"` — imprime solo esa variable).

- [ ] **Step 7: Suite completa y typecheck**

Run: `npm test && npm run typecheck`
Expected: todo verde; `catalogo.test.ts` sigue pasando (solo se añadió `export`).

- [ ] **Step 8: Commit**

```bash
git add oficios-cuba/backend/src/routes/catalog.ts oficios-cuba/backend/src/routes/mapa.ts oficios-cuba/backend/test/mapa-productos.test.ts
git commit -m "Mapa: GET /mapa/productos con los productos de la zona visible y orden por precio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `fuera` — los más cercanos que no caben en la zona

**Files:**
- Modify: `oficios-cuba/backend/src/routes/mapa.ts` (dentro de la ruta `/productos`)
- Modify: `oficios-cuba/backend/test/mapa-productos.test.ts` (sembrado y `describe` nuevo)

**Interfaces:**
- Consumes: de la Tarea 1, `filtroProductos`, `JOINS_PRODUCTOS`, `COLUMNAS_PRODUCTO_MAPA`, `PRECIO_CUP_ARTICULO`, `ORDEN_PRECIO`, `aProductoMapa`.
- Produces: `fuera: ProductoMapa[]` con `distancia_km: number` (1 decimal) en `page = 1`.

- [ ] **Step 1: Ampliar el sembrado**

En el `beforeAll` de `mapa-productos.test.ts`, al final:

```ts
  // Fuera de VISIBLE, a distintas distancias del centro (22.05, -79.95).
  const f1 = await negocio('Pastelería Cerca', 22.15, -79.95); // ~11 km
  await articulo(f1.auth, 'Cake de Oreo', { price: 25, price_currency: 'USD' }); // ≥ 5000 CUP con cualquier tasa ≥ 200
  const f2 = await negocio('Pastelería Lejos', 22.40, -79.95); // ~39 km
  await articulo(f2.auth, 'Cake tres leches', { price: 2800 });
  for (let i = 1; i <= 9; i++) await articulo(f2.auth, `Cake extra ${i}`, { price: 3000 + i });
```

Con esto quedan fuera (para `q=cake`): «Cake marquesina» (~7,8 km), «Cake de Oreo» (~11 km) y los 10 de «Pastelería Lejos»: 12 candidatos. Los 10 más cercanos son los dos primeros y **8 cualesquiera** de «Pastelería Lejos» (empatan en distancia y desempata `ci.id`, un uuid al azar): ningún test puede contar con un producto concreto de esa tienda. «Pastel escondido» no coincide con «cake».

- [ ] **Step 2: Escribir los tests que fallan**

Al final de `mapa-productos.test.ts`:

```ts
describe('GET /api/mapa/productos — fuera', () => {
  it('trae como máximo 10, los más cercanos, y por distancia con relevance', async () => {
    const r = await pedir({ q: 'cake' });
    const fuera = r.body.fuera;
    expect(fuera).toHaveLength(10);
    expect(nombres(fuera).slice(0, 2)).toEqual(['Cake marquesina', 'Cake de Oreo']);
    const km = fuera.map((p: { distancia_km: number }) => p.distancia_km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    expect(fuera[0].distancia_km).toBeCloseTo(7.8, 0);
  });

  it('nunca repite nada de dentro', async () => {
    const r = await pedir({ q: 'cake' });
    const ids = new Set(r.body.dentro.items.map((p: { id: string }) => p.id));
    expect(r.body.fuera.some((p: { id: string }) => ids.has(p.id))).toBe(false);
  });

  it('con price_asc se ordena por precio en CUP entre los 10 más cercanos', async () => {
    const r = await pedir({ q: 'cake', sort: 'price_asc' });
    const n = nombres(r.body.fuera);
    expect(n).toHaveLength(10);
    // 900 CUP el más barato; 25 USD (≥ 5000 CUP) el más caro, por encima de los 2800-3009 CUP de la tienda lejana.
    expect(n[0]).toBe('Cake marquesina');
    expect(n[n.length - 1]).toBe('Cake de Oreo');
  });

  it('no trae ocultos, agotados ni de plan Gratis', async () => {
    const r = await pedir({ q: 'cake' });
    expect(nombres(r.body.fuera)).not.toContain('Cake secreto');
    expect(nombres(r.body.fuera)).not.toContain('Cake gratis');
    expect(nombres(r.body.fuera)).not.toContain('Cake agotado');
  });

  it('la distancia se mide hasta el punto publicado de un perfil «zona»', async () => {
    const r = await pedir({ q: 'escondido' });
    const [p] = r.body.fuera;
    const esperado = (await qOne<{ m: number }>(
      `SELECT ST_Distance(punto_pub, ST_SetSRID(ST_MakePoint(-79.95, 22.05), 4326)::geography) AS m
         FROM provider_profiles WHERE business_name = 'Dulces Zona'`,
    ))!.m;
    expect(p.distancia_km).toBe(Math.round(esperado / 100) / 10);
  });
});
```

Y en el `describe` de la Tarea 1, el test «page = 2…» ya exige `fuera: []` en la página 2.

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run test/mapa-productos.test.ts`
Expected: FAIL — `fuera` llega `[]` (los de la Tarea 1 siguen pasando).

- [ ] **Step 4: Implementar**

En la ruta `/productos`, sustituir el `res.json({...})` final por:

```ts
  // `fuera` solo en la primera página: «Ver más» pagina lo de la zona, no lo de alrededor.
  let fuera: ReturnType<typeof aProductoMapa>[] = [];
  if (page === 1) {
    const conCentro = [...params, (visible.oeste + visible.este) / 2, (visible.sur + visible.norte) / 2, TOPE_FUERA];
    const n = conCentro.length;
    const centro = `ST_SetSRID(ST_MakePoint($${n - 2}, $${n - 1}), 4326)::geography`;
    // Primero los TOPE_FUERA más cercanos (KNN `<->`, que usa el GiST de punto_pub); después, entre
    // esos, el orden pedido. Así «Menor precio» no trae un producto barato de la otra punta de Cuba.
    const ordenFuera = sort === 'relevance' ? 'distancia_m, id' : ORDEN_PRECIO[sort as 'price_asc' | 'price_desc'];
    const filasFuera = await q<any>(`
      SELECT * FROM (
        SELECT ${COLUMNAS_PRODUCTO_MAPA}, ${PRECIO_CUP_ARTICULO} AS precio_cup, ST_Distance(pp.punto_pub, ${centro}) AS distancia_m
        ${JOINS_PRODUCTOS} ${where} AND NOT ST_Intersects(pp.punto_pub, ${caja})
        ORDER BY pp.punto_pub <-> ${centro}, ci.id LIMIT $${n}
      ) x ORDER BY ${ordenFuera}
    `, conCentro);
    fuera = filasFuera.map(aProductoMapa);
  }

  res.json({
    dentro: { items: filas.map(aProductoMapa), total, page, pages: Math.max(1, Math.ceil(total / POR_PAGINA_PRODUCTOS)) },
    fuera,
  });
```

Y junto a `POR_PAGINA_PRODUCTOS`:

```ts
const TOPE_FUERA = 10;
```

- [ ] **Step 5: Correr los tests**

Run: `npx vitest run test/mapa-productos.test.ts`
Expected: PASS los 15.

- [ ] **Step 6: Suite completa y typecheck**

Run: `npm test && npm run typecheck`
Expected: todo verde.

- [ ] **Step 7: Commit**

```bash
git add oficios-cuba/backend/src/routes/mapa.ts oficios-cuba/backend/test/mapa-productos.test.ts
git commit -m "Mapa: /mapa/productos añade los diez más cercanos fuera de la zona

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web — tipos, cliente, `onZona` en `usarMapa` y hook `usarProductosMapa`

**Files:**
- Modify: `oficios-cuba/frontend/src/types/index.ts` (tras `MapaRespuesta`, ~línea 518)
- Modify: `oficios-cuba/frontend/src/services/api.ts` (`mapaApi`, ~línea 193)
- Modify: `oficios-cuba/frontend/src/components/mapa/usarMapa.ts` (firma, ref y aviso tras pintar)
- Modify: `oficios-cuba/frontend/src/components/mapa/MapaExplorar.tsx` (prop `onZona`)
- Create: `oficios-cuba/frontend/src/components/mapa/usarProductosMapa.ts`
- Create: `oficios-cuba/frontend/src/components/mapa/usarProductosMapa.test.ts`
- Modify: `oficios-cuba/frontend/src/components/mapa/usarMapa.test.ts` (un test de `onZona`)

**Interfaces:**
- Produces (tipos):
  ```ts
  export type OrdenProductos = 'relevance' | 'price_asc' | 'price_desc';
  export type ProductoMapa = CatalogSearchItem & { lat: number; lng: number; tipo: 'oficio' | 'negocio'; aproximado: boolean; distancia_km?: number };
  export interface MapaProductosRespuesta { dentro: { items: ProductoMapa[]; total: number; page: number; pages: number }; fuera: ProductoMapa[] }
  ```
- Produces: `mapaApi.productos(bbox: Bbox, params: { q?: string; category?: string; sort?: OrdenProductos; page?: number }, signal?: AbortSignal): Promise<MapaProductosRespuesta>`
- Produces: `usarMapa(params, onAgotada?, onZona?: (b: Bbox) => void)` y `MapaExplorar` prop `onZona?: (b: Bbox) => void` — se llama con el bbox con que se pintaron los pines, cada vez que llegan.
- Produces: `usarProductosMapa({ zona, q, category, sort, activo }: { zona: Bbox | null; q: string; category: string; sort: OrdenProductos; activo: boolean })` → `{ dentro: ProductoMapa[]; total: number; fuera: ProductoMapa[]; hayMas: boolean; cargando: boolean; cargandoMas: boolean; error: string; verMas(): void; reintentar(): void }`.

- [ ] **Step 1: Tipos y cliente**

En `types/index.ts`, después de `export type MapaRespuesta = …`:

```ts
/** Orden de la lista de productos del mapa (GET /mapa/productos). */
export type OrdenProductos = 'relevance' | 'price_asc' | 'price_desc';

/** Un artículo de la lista de productos del mapa: lo de /catalog/search más el punto PUBLICADO del negocio. */
export type ProductoMapa = CatalogSearchItem & {
  lat: number;
  lng: number;
  tipo: 'oficio' | 'negocio';
  aproximado: boolean;
  /** Solo en `fuera`: desde el centro de la zona visible, en km con un decimal. */
  distancia_km?: number;
};

export interface MapaProductosRespuesta {
  dentro: { items: ProductoMapa[]; total: number; page: number; pages: number };
  fuera: ProductoMapa[];
}
```

En `services/api.ts`, añadir `MapaProductosRespuesta, OrdenProductos` al `import type` de la línea 2 y, dentro de `mapaApi`, tras `celda`:

```ts
  /** Los productos de la zona visible (`dentro`, paginado) y los más cercanos de fuera (`fuera`, solo en la página 1). */
  productos: (bbox: Bbox, params: { q?: string; category?: string; sort?: OrdenProductos; page?: number }, signal?: AbortSignal) =>
    api.get<MapaProductosRespuesta>('/mapa/productos', {
      params: { bbox: `${bbox.sur},${bbox.oeste},${bbox.norte},${bbox.este}`, ...params },
      signal,
    }).then((r) => r.data),
```

- [ ] **Step 2: Test que falla para `onZona`**

En `usarMapa.test.ts`, mirar cómo los tests existentes montan el hook (con `renderHook`, `mapaApi.buscar` mockeado y temporizadores) y añadir uno con ese mismo andamiaje:

```ts
it('avisa con onZona del bbox con que pintó los pines', async () => {
  const onZona = vi.fn();
  vi.mocked(mapaApi.buscar).mockResolvedValue({ puntos: [], celda: 0.01, hay_mas: false });
  const { result } = renderHook(() => usarMapa({ tab: 'productos', q: '', category: '' }, undefined, onZona));
  const b = { sur: 22, oeste: -80, norte: 22.1, este: -79.9 };
  act(() => { result.current.alMover(b, true); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(onZona).toHaveBeenCalledWith(b);
});
```

Run: `cd oficios-cuba/frontend && npx vitest run src/components/mapa/usarMapa.test.ts`
Expected: FAIL — `onZona` nunca se llama.

- [ ] **Step 3: Implementar `onZona`**

En `usarMapa.ts`, la firma:

```ts
export function usarMapa(
  params: { tab: string; q: string; category: string },
  onAgotada?: (siguiente: string) => void,
  onZona?: (b: Bbox) => void,
) {
```

Junto a `onAgotadaRef`:

```ts
  // La zona con que se pintaron los pines, para quien tenga que pedir algo de ESA misma zona (la
  // lista de productos): pedirla con el bbox del último arrastre la desfasaría del mapa.
  const onZonaRef = useRef(onZona);
  onZonaRef.current = onZona;
```

En `cargar()`, justo después de `bboxPintadoRef.current = bbox;`:

```ts
        onZonaRef.current?.(bbox);
```

En `MapaExplorar.tsx`, añadir la prop (con su JSDoc) y pasarla:

```ts
  /** Llega cada vez que se pintan pines, con el bbox con que se pidieron. */
  onZona?: (b: Bbox) => void;
```
```ts
  const mapa = usarMapa({ tab, q, category }, onAgotada, onZona);
```

Run: `npx vitest run src/components/mapa/usarMapa.test.ts` → PASS.

- [ ] **Step 4: Tests que fallan para `usarProductosMapa`**

`oficios-cuba/frontend/src/components/mapa/usarProductosMapa.test.ts`:

```ts
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
```

Run: `npx vitest run src/components/mapa/usarProductosMapa.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 5: Implementar el hook**

`oficios-cuba/frontend/src/components/mapa/usarProductosMapa.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError, mapaApi } from '../../services/api';
import type { Bbox, OrdenProductos, ProductoMapa } from '../../types';

/**
 * La lista de productos de la pestaña Productos del mapa. La zona NO la decide este hook: llega de
 * `usarMapa` (vía `onZona`) cuando se pintan los pines, así lista y pines cuentan siempre la misma
 * zona y comparten su antirrebote en vez de llevar uno cada uno.
 */
export function usarProductosMapa({ zona, q, category, sort, activo }: {
  zona: Bbox | null; q: string; category: string; sort: OrdenProductos; activo: boolean;
}) {
  const [dentro, setDentro] = useState<ProductoMapa[]>([]);
  const [total, setTotal] = useState(0);
  const [fuera, setFuera] = useState<ProductoMapa[]>([]);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  const clave = zona ? `${zona.sur},${zona.oeste},${zona.norte},${zona.este}|${q}|${category}|${sort}` : '';
  // Lo que se está mirando AHORA. «Ver más» lo compara al llegar: si cambió, su página es de otra
  // búsqueda o de otra zona y pegarla mezclaría dos listas.
  const claveRef = useRef(clave);
  claveRef.current = clave;
  const zonaRef = useRef(zona);
  zonaRef.current = zona;

  useEffect(() => {
    if (!activo || !zona) return;
    const controlador = new AbortController();
    setCargando(true);
    setError('');
    mapaApi.productos(zona, { q: q || undefined, category: category || undefined, sort, page: 1 }, controlador.signal)
      .then((r) => {
        if (controlador.signal.aborted) return;
        setDentro(r.dentro.items);
        setTotal(r.dentro.total);
        setPagina(1);
        setPaginas(r.dentro.pages);
        setFuera(r.fuera);
        setCargando(false);
      })
      .catch((err) => {
        if (controlador.signal.aborted) return;
        setError(apiError(err, 'No pudimos cargar los productos de esta zona.'));
        setCargando(false);
      });
    return () => controlador.abort();
    // `zona` va por `clave`: llega como objeto nuevo en cada pintado aunque sea el mismo rectángulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, clave, intento]);

  const verMas = useCallback(() => {
    const z = zonaRef.current;
    if (!z || cargandoMas) return;
    const claveAlPedir = claveRef.current;
    setCargandoMas(true);
    mapaApi.productos(z, { q: q || undefined, category: category || undefined, sort, page: pagina + 1 })
      .then((r) => {
        if (claveRef.current !== claveAlPedir) return;
        setDentro((d) => [...d, ...r.dentro.items]);
        setPagina(r.dentro.page);
        setPaginas(r.dentro.pages);
        setCargandoMas(false);
      })
      .catch((err) => {
        if (claveRef.current !== claveAlPedir) return;
        setError(apiError(err, 'No pudimos cargar más productos.'));
        setCargandoMas(false);
      });
  }, [cargandoMas, q, category, sort, pagina]);

  // Una zona nueva cancela un «Ver más» a medias: su respuesta se descartará arriba, pero el
  // indicador tiene que apagarse ya.
  useEffect(() => { setCargandoMas(false); }, [clave]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { dentro, total, fuera, hayMas: pagina < paginas, cargando, cargandoMas, error, verMas, reintentar };
}
```

- [ ] **Step 6: Correr los tests**

Run: `npx vitest run src/components/mapa/usarProductosMapa.test.ts src/components/mapa/usarMapa.test.ts`
Expected: PASS.

- [ ] **Step 7: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: sin errores; 92 + los nuevos pasan.

- [ ] **Step 8: Commit**

```bash
git add oficios-cuba/frontend/src/types/index.ts oficios-cuba/frontend/src/services/api.ts oficios-cuba/frontend/src/components/mapa/usarMapa.ts oficios-cuba/frontend/src/components/mapa/usarMapa.test.ts oficios-cuba/frontend/src/components/mapa/MapaExplorar.tsx oficios-cuba/frontend/src/components/mapa/usarProductosMapa.ts oficios-cuba/frontend/src/components/mapa/usarProductosMapa.test.ts
git commit -m "Web: hook de productos del mapa atado a la zona con que se pintan los pines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web — componente `ListaProductos`

**Files:**
- Create: `oficios-cuba/frontend/src/components/mapa/ListaProductos.tsx`
- Create: `oficios-cuba/frontend/src/components/mapa/ListaProductos.test.tsx`

**Interfaces:**
- Consumes: `ProductoMapa`, `OrdenProductos` (Tarea 3); `CatalogImage`, `PrecioArticulo` (`../catalog/CatalogCard`); `Avatar`, `ErrorState`, `cn` (`../ui`).
- Produces:
  ```ts
  export type PropsListaProductos = {
    dentro: ProductoMapa[]; total: number; fuera: ProductoMapa[];
    orden: OrdenProductos; onOrden(o: OrdenProductos): void;
    cargando: boolean; error: string; onReintentar(): void;
    hayMas: boolean; cargandoMas: boolean; onVerMas(): void;
    onElegir(p: ProductoMapa, deFuera: boolean): void;
    onResaltar?(p: ProductoMapa | null): void;
    /** El último producto tocado: al volver de su ficha, la lista se desplaza hasta él. */
    ultimoElegidoId?: string | null;
  };
  export default function ListaProductos(props: PropsListaProductos & { tituloId: string; onCerrar(): void }): JSX.Element;
  ```

- [ ] **Step 1: Tests que fallan**

`oficios-cuba/frontend/src/components/mapa/ListaProductos.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
```

Run: `npx vitest run src/components/mapa/ListaProductos.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 2: Implementar**

`oficios-cuba/frontend/src/components/mapa/ListaProductos.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Avatar, cn, ErrorState } from '../ui';
import { CatalogImage, PrecioArticulo } from '../catalog/CatalogCard';
import type { OrdenProductos, ProductoMapa } from '../../types';

export type PropsListaProductos = {
  dentro: ProductoMapa[];
  total: number;
  fuera: ProductoMapa[];
  orden: OrdenProductos;
  onOrden(o: OrdenProductos): void;
  cargando: boolean;
  error: string;
  onReintentar(): void;
  hayMas: boolean;
  cargandoMas: boolean;
  onVerMas(): void;
  onElegir(p: ProductoMapa, deFuera: boolean): void;
  onResaltar?(p: ProductoMapa | null): void;
  /** El último producto tocado: al volver de su ficha, la lista se desplaza hasta él. */
  ultimoElegidoId?: string | null;
};

const ORDENES: [OrdenProductos, string][] = [
  ['relevance', 'Relevancia'],
  ['price_asc', 'Menor precio'],
  ['price_desc', 'Mayor precio'],
];

function Fila({ p, deFuera, onElegir, onResaltar }: {
  p: ProductoMapa; deFuera: boolean; onElegir: PropsListaProductos['onElegir']; onResaltar?: PropsListaProductos['onResaltar'];
}) {
  const lugar = p.municipality_name || p.province_name;
  return (
    <button
      type="button"
      data-producto-id={p.id}
      onClick={() => onElegir(p, deFuera)}
      onMouseEnter={() => onResaltar?.(p)}
      onMouseLeave={() => onResaltar?.(null)}
      className="grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 px-5 py-2 text-left transition hover:bg-brand-50"
    >
      <span className="h-12 w-12 overflow-hidden rounded-lg bg-sand-100"><CatalogImage item={p} /></span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{p.name}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-500">
          {/* El logo de 16 px: Avatar no tiene ese tamaño, se lo fuerza la clase. */}
          <Avatar src={p.provider_avatar} name={p.provider_name} size="xs" className="!h-4 !w-4 !text-[8px]" />
          <span className="truncate">{p.provider_name}</span>
          {deFuera && p.distancia_km != null && (
            <span className="shrink-0 text-ink-400">· {lugar ? `${lugar}, ` : ''}{String(p.distancia_km).replace('.', ',')} km</span>
          )}
        </span>
      </span>
      <span className="text-right tabular-nums"><PrecioArticulo item={p} /></span>
    </button>
  );
}

/**
 * Los productos de la zona visible, como CONTENIDO del panel del mapa (hermano de `ListaCelda` y
 * `FichaPunto`; el envoltorio lo pone `PanelMapa`). Fila compacta: lo que se compara es el precio,
 * así que va solo y alineado a la derecha; el negocio va pequeño debajo del nombre.
 */
export default function ListaProductos({
  tituloId, onCerrar, dentro, total, fuera, orden, onOrden, cargando, error, onReintentar,
  hayMas, cargandoMas, onVerMas, onElegir, onResaltar, ultimoElegidoId,
}: PropsListaProductos & { tituloId: string; onCerrar(): void }) {
  const raiz = useRef<HTMLDivElement>(null);

  // Al volver de la ficha, la lista se monta de nuevo dentro de un contenedor que ya no recuerda
  // su scroll (es del envoltorio, no de aquí): llevarla a la fila tocada es lo que la persona espera.
  useEffect(() => {
    if (!ultimoElegidoId) return;
    raiz.current?.querySelector(`[data-producto-id="${CSS.escape(ultimoElegidoId)}"]`)?.scrollIntoView?.({ block: 'center' });
    // Solo al montar: con cada «Ver más» no hay que volver a saltar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={raiz}>
      <div className="-mx-5 mb-1 border-b border-sand-200 px-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={tituloId} className="font-sans text-base font-bold text-ink-900">
              {total === 1 ? '1 producto en esta zona' : `${total} productos en esta zona`}
            </h2>
            <p className="text-xs text-ink-400">Mueve el mapa para ver otros</p>
          </div>
          <button type="button" onClick={onCerrar} className="btn-ghost btn-sm rounded-full p-1.5" aria-label="Cerrar la lista de productos">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="Ordenar productos">
          {ORDENES.map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={orden === valor}
              onClick={() => onOrden(valor)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition',
                orden === valor ? 'border-ink-900 bg-ink-900 text-white' : 'border-sand-300 bg-white text-ink-500 hover:border-ink-300',
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="py-2"><ErrorState message={error} onRetry={onReintentar} /></div>}

      {cargando ? (
        <div className="space-y-3 py-2" role="status" aria-label="Buscando productos">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-12 w-12 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2"><div className="skeleton h-4 w-4/5 rounded" /><div className="skeleton h-3 w-1/3 rounded" /></div>
              <div className="skeleton h-4 w-14 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {dentro.length === 0 && !error && <p className="py-3 text-sm text-ink-500">No hay productos en esta zona.</p>}
          <ul className="-mx-5 divide-y divide-sand-200">
            {dentro.map((p) => <li key={p.id}><Fila p={p} deFuera={false} onElegir={onElegir} onResaltar={onResaltar} /></li>)}
          </ul>
          {hayMas && (
            <button type="button" onClick={onVerMas} disabled={cargandoMas} className="btn-secondary btn-sm mt-3 w-full">
              Ver más productos
            </button>
          )}

          {fuera.length > 0 && (
            <section aria-label={`Fuera de esta zona · ${fuera.length}`} className="-mx-5 mt-3">
              <div className="border-y border-sand-200 bg-sand-100 px-5 py-2.5">
                <p className="text-sm font-bold text-ink-900">Fuera de esta zona · {fuera.length}</p>
                <p className="text-xs text-ink-400">Toca uno y el mapa se amplía para incluirlo</p>
              </div>
              <ul className="divide-y divide-sand-200">
                {fuera.map((p) => <li key={p.id}><Fila p={p} deFuera onElegir={onElegir} onResaltar={onResaltar} /></li>)}
              </ul>
            </section>
          )}

          {orden !== 'relevance' && (dentro.length > 0 || fuera.length > 0) && (
            <p className="pt-3 text-xs text-ink-400">Los precios en USD se comparan a la tasa de referencia. «A consultar» va al final.</p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Correr los tests**

Run: `npx vitest run src/components/mapa/ListaProductos.test.tsx`
Expected: PASS los 12. Si `CSS.escape` no existe en jsdom, sustituirlo por el id tal cual (son uuid: sin comillas ni corchetes).

- [ ] **Step 4: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/frontend/src/components/mapa/ListaProductos.tsx oficios-cuba/frontend/src/components/mapa/ListaProductos.test.tsx
git commit -m "Web: lista compacta de productos del mapa con orden por precio y fuera de zona

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Web — `FichaPunto` con el producto tocado marcado y «‹ N productos»

**Files:**
- Modify: `oficios-cuba/frontend/src/components/mapa/FichaPunto.tsx` (`ProductoMiniCard` ~59, `SeccionProductos` ~108, props ~194, botón volver ~357, uso ~446)
- Modify: `oficios-cuba/frontend/src/components/mapa/PanelMapa.test.tsx` (tests nuevos, con su andamiaje)

**Interfaces:**
- Produces: props nuevas de `FichaPunto`: `productoMarcado?: CatalogItem | null` y `etiquetaVolver?: string` (por defecto «Volver a la lista»).

- [ ] **Step 1: Tests que fallan**

`PanelMapa.test.tsx` ya tiene los helpers `panel(props)` (crea el elemento), `montar(props)` (lo monta con router y auth) y `catalogItem(overrides)`, y un `describe('PanelMapa — catálogo filtrado en la pestaña Productos')` a 390 px donde hay que pulsar «Ver la ficha completa» para desplegar la hoja. Primero, ampliar los tipos de `props` de `panel` y `montar` con `productoMarcado?: CatalogItem | null; etiquetaVolver?: string; onVolverALista?: () => void` y pasarlos en `panel` a `createElement(PanelMapa, { …, productoMarcado: props.productoMarcado, etiquetaVolver: props.etiquetaVolver, onVolverALista: props.onVolverALista })`.

Después, dentro de ese `describe`:

```tsx
  it('con productoMarcado, ese producto va primero y marcado', async () => {
    vi.mocked(catalogApi.ofProvider).mockResolvedValue({
      data: { items: [catalogItem({ id: 'x', name: 'Tornillos surtidos' }), catalogItem({ id: 'm', name: 'Tuercas' })], sections: [], total: 2, total_all: 2, page: 1, pages: 1 },
    } as any);
    montar({ tab: 'productos', q: 'tornillos', productoMarcado: catalogItem({ id: 'm', name: 'Tuercas' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Ver la ficha completa' }));
    const marcado = await screen.findByText('Lo que tocaste');
    expect(marcado.closest('button')!.textContent).toContain('Tuercas');
    const nombresEnOrden = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(nombresEnOrden).toEqual(['Tuercas', 'Tornillos surtidos']);
  });

  // Review Focus 2: la búsqueda coincidió por el nombre del negocio.
  it('si el catálogo filtrado no trae el producto tocado, igual lo enseña', async () => {
    vi.mocked(catalogApi.ofProvider).mockResolvedValue({
      data: { items: [], sections: [], total: 0, total_all: 4, page: 1, pages: 1 },
    } as any);
    montar({ tab: 'productos', q: 'Ferretería', productoMarcado: catalogItem({ id: 'm', name: 'Tuercas' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Ver la ficha completa' }));
    expect(await screen.findByText('Tuercas')).toBeTruthy();
    expect(screen.queryByText(/No encontramos productos/)).toBeNull();
    expect(screen.getByText('(1)')).toBeTruthy();
  });

  it('etiquetaVolver cambia el texto del botón de volver', async () => {
    vi.mocked(catalogApi.ofProvider).mockResolvedValue({ data: { items: [], sections: [], total: 0, total_all: 0, page: 1, pages: 1 } } as any);
    montar({ tab: 'productos', q: '', onVolverALista: vi.fn(), etiquetaVolver: '7 productos' });
    expect(await screen.findByRole('button', { name: /7 productos/ })).toBeTruthy();
  });
```

En esta tarea `PanelMapa` solo hace de cable: añadir a sus props `productoMarcado?: CatalogItem | null; etiquetaVolver?: string;` y pasarlas tal cual a `FichaPunto` (ver Step 2).

Run: `npx vitest run src/components/mapa/PanelMapa.test.tsx`
Expected: FAIL — no existe «Lo que tocaste» ni `etiquetaVolver`.

- [ ] **Step 2: Implementar en `FichaPunto.tsx`**

`ProductoMiniCard` con `marcado`:

```tsx
function ProductoMiniCard({ item, onAbrir, marcado = false }: { item: CatalogItem; onAbrir: () => void; marcado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        'group flex w-full gap-3 rounded-xl border p-2 text-left transition hover:border-brand-300 hover:shadow-card',
        marcado ? 'border-brand-400 bg-brand-50' : 'border-sand-200',
        !item.available && 'opacity-60',
      )}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-sand-100">
        <CatalogImage item={item} />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        {marcado && <span className="mb-0.5 inline-block rounded-full bg-brand-100 px-2 text-[11px] font-bold text-brand-700">Lo que tocaste</span>}
        <h4 className="line-clamp-2 text-sm font-bold leading-snug text-ink-900 group-hover:text-brand-700">{item.name}</h4>
        <div className="mt-0.5"><PrecioArticulo item={item} /></div>
      </div>
    </button>
  );
}
```

`SeccionProductos`: añadir `marcadoId?: string` a sus props y pasar `marcado={p.id === marcadoId}` a cada `ProductoMiniCard`.

En la firma de `FichaPunto`, añadir:

```tsx
  /** El producto que se tocó en la lista de productos del mapa: va primero y marcado. */
  productoMarcado?: CatalogItem | null;
  /** Texto del botón de volver. Por defecto «Volver a la lista» (la de una celda). */
  etiquetaVolver?: string;
```

Antes del `return` de `FichaPunto`:

```tsx
  // El tocado va primero aunque el catálogo filtrado no lo traiga: si la búsqueda coincidió por el
  // nombre del negocio, /catalog/provider/:id?q= (que solo mira el artículo) no lo devuelve.
  const productosVistos = productoMarcado
    ? [productoMarcado, ...productos.filter((p) => p.id !== productoMarcado.id)]
    : productos;
```

En el uso de `SeccionProductos`: `productos={productosVistos}`, `total={Math.max(totalProductos, productosVistos.length)}`, `marcadoId={productoMarcado?.id}`.

Botón volver: `<ArrowLeft className="h-4 w-4" /> {etiquetaVolver ?? 'Volver a la lista'}` y el JSDoc de `onVolverALista` pasa a «Presente = pinta el botón de volver (a la lista de una celda o a la de productos)».

En `PanelMapa.tsx`, añadir a sus props `productoMarcado?: CatalogItem | null; etiquetaVolver?: string;` (importar `CatalogItem` de `../../types`) y pasarlas a `FichaPunto`.

- [ ] **Step 3: Correr los tests**

Run: `npx vitest run src/components/mapa/PanelMapa.test.tsx`
Expected: PASS, incluidos los existentes («Volver a la lista» sigue igual por defecto).

- [ ] **Step 4: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run && npm run build`

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/frontend/src/components/mapa/FichaPunto.tsx oficios-cuba/frontend/src/components/mapa/PanelMapa.tsx oficios-cuba/frontend/src/components/mapa/PanelMapa.test.tsx
git commit -m "Web: la ficha del mapa marca el producto tocado y acepta otro texto para volver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web — integrar en el mapa: panel, URL, volver, resaltar y ampliar

**Files:**
- Modify: `oficios-cuba/frontend/src/components/mapa/PanelMapa.tsx` (tercer contenido)
- Modify: `oficios-cuba/frontend/src/components/mapa/MapaExplorar.tsx` (prop `seleccionado` en vez de `seleccionadoId`; marcador suelto)
- Modify: `oficios-cuba/frontend/src/components/mapa/ExplorarMapa.tsx` (estado y coordinación)
- Modify: `oficios-cuba/frontend/src/components/mapa/ExplorarMapa.test.tsx` (tests nuevos)

**Interfaces:**
- Consumes: `usarProductosMapa` y `onZona` (Tarea 3), `ListaProductos` + `PropsListaProductos` (Tarea 4), `productoMarcado`/`etiquetaVolver` (Tarea 5).
- Produces: `PanelMapa` prop `productos?: PropsListaProductos | null`; `MapaExplorar` prop `seleccionado?: { id: string; lat: number; lng: number } | null` (sustituye a `seleccionadoId`).

- [ ] **Step 1: Tests que fallan**

En `ExplorarMapa.test.tsx`: añadir `catalogApi` al import de `../../services/api`, y al `vi.mock`:

```ts
    mapaApi: { buscar: vi.fn(), celda: vi.fn(), productos: vi.fn() },
    catalogApi: { ...real.catalogApi, ofProvider: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })) },
```

Helpers y `describe` nuevos al final del archivo:

```ts
import type { MapaProductosRespuesta, ProductoMapa } from '../../types';

function producto(id: string, extra: Partial<ProductoMapa> = {}): ProductoMapa {
  return {
    id, name: `Producto ${id}`, description: null, price: 100, price_type: 'fixed', price_currency: 'CUP', image: null, section: null,
    available: true, created_at: '2026-10-01T00:00:00Z', provider_id: `neg-${id}`, provider_name: `Negocio ${id}`, provider_avatar: null,
    subscription_plan: 'basic', contact_mode: 'whatsapp', whatsapp: null, province_name: null, municipality_name: 'Cerro',
    lat: 21.6, lng: -79.6, tipo: 'oficio', aproximado: false, ...extra,
  } as ProductoMapa;
}

function respuesta(dentro: ProductoMapa[], fuera: ProductoMapa[] = []): MapaProductosRespuesta {
  return { dentro: { items: dentro, total: dentro.length, page: 1, pages: 1 }, fuera };
}

const enProductos = (extra: Record<string, string> = {}) => (k: string) => ({ tab: 'productos', q: 'cake', ...extra } as Record<string, string>)[k] ?? '';

describe('ExplorarMapa — lista de productos', () => {
  beforeEach(() => {
    vi.mocked(mapaApi.productos).mockReset();
    vi.mocked(configApi.get).mockResolvedValue({ data: { demo: false, google: null, google_client_id: null } } as never);
    vi.mocked(providerApi.getById).mockImplementation((id: string) => Promise.resolve({
      data: { provider: { id, business_name: `Negocio ${id}`, categories: [], rating: 0, review_count: 0, contact_mode: 'both', whatsapp: null } },
    }) as never);
    fijarAncho(1280);
    window.history.replaceState(null, '');
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('en Productos la lista se abre sola con los productos de la zona', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a'), producto('b')]));
    montar([], enProductos());
    expect(await screen.findByRole('heading', { name: '2 productos en esta zona' })).toBeTruthy();
    expect(vi.mocked(mapaApi.productos).mock.calls[0][1]).toMatchObject({ q: 'cake', sort: 'relevance', page: 1 });
  });

  it('en Servicios no pide productos', async () => {
    montar([], () => '');
    await act(async () => { await espera(400); });
    expect(mapaApi.productos).not.toHaveBeenCalled();
  });

  it('el orden sale de la URL y elegir otro la cambia', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')]));
    const { update } = montar([], enProductos({ orden: 'price_desc' }));
    await screen.findByRole('heading', { name: '1 producto en esta zona' });
    expect(vi.mocked(mapaApi.productos).mock.calls[0][1]).toMatchObject({ sort: 'price_desc' });
    fireEvent.click(screen.getByRole('button', { name: 'Relevancia' }));
    expect(update).toHaveBeenCalledWith({ orden: null });
    fireEvent.click(screen.getByRole('button', { name: 'Menor precio' }));
    expect(update).toHaveBeenCalledWith({ orden: 'price_asc' });
  });

  it('un orden inventado en la URL se trata como relevancia', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')]));
    montar([], enProductos({ orden: 'barato' }));
    await screen.findByRole('heading', { name: '1 producto en esta zona' });
    expect(vi.mocked(mapaApi.productos).mock.calls[0][1]).toMatchObject({ sort: 'relevance' });
  });

  it('tocar un producto abre su negocio con el producto marcado, y «N productos» vuelve', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a'), producto('b')]));
    montar([], enProductos());
    fireEvent.click(await screen.findByText('Producto b'));
    expect(await screen.findByText('Lo que tocaste')).toBeTruthy();
    expect(providerApi.getById).toHaveBeenCalledWith('neg-b');
    fireEvent.click(screen.getByRole('button', { name: /2 productos/ }));
    expect(await screen.findByRole('heading', { name: '2 productos en esta zona' })).toBeTruthy();
    expect(mapaApi.productos).toHaveBeenCalledTimes(1); // volver no vuelve a pedir
  });

  it('tocar uno de fuera amplía el mapa hasta incluir su negocio', async () => {
    const lejos = producto('f', { lat: 23.1, lng: -82.4, distancia_km: 300 });
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')], [lejos]));
    const volar = vi.spyOn(L.Map.prototype, 'flyToBounds');
    montar([], enProductos());
    fireEvent.click(await screen.findByText('Producto f'));
    expect(volar).toHaveBeenCalled();
    const caja = volar.mock.calls[0][0] as L.LatLngBounds;
    expect(caja.contains(L.latLng(23.1, -82.4))).toBe(true);
    expect(await screen.findByText('Lo que tocaste')).toBeTruthy();
  });

  it('cerrar la lista deja «Ver N productos», que la reabre', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a'), producto('b'), producto('c')]));
    montar([], enProductos());
    await screen.findByRole('heading', { name: '3 productos en esta zona' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la lista de productos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ver 3 productos' }));
    expect(await screen.findByRole('heading', { name: '3 productos en esta zona' })).toBeTruthy();
  });

  // Review Focus 5.
  it('tocar un pin con la lista abierta y cerrar su ficha deja «Ver N productos», no un panel vacío', async () => {
    vi.mocked(mapaApi.productos).mockResolvedValue(respuesta([producto('a')]));
    const { container } = montar([punto('p', -76)], enProductos());
    await screen.findByRole('heading', { name: '1 producto en esta zona' });
    const pin = container.querySelector('.leaflet-marker-icon') as HTMLElement;
    await act(async () => { pin.click(); await espera(30); });
    expect(screen.queryByRole('button', { name: /1 productos?$/ })).toBeNull(); // la ficha de un pin no ofrece volver a productos
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Ver 1 producto' })).toBeTruthy();
    expect(container.querySelector('[data-testid="panel-lateral"]')).toBeNull();
  });
});
```

Comprobar cómo cierra hoy la ficha la suite existente (Esc vía `usarPanel` o el botón «Cerrar»): si no es Esc, usar ese mismo gesto en el último test.

Run: `npx vitest run src/components/mapa/ExplorarMapa.test.tsx`
Expected: FAIL en los nuevos.

- [ ] **Step 2: `PanelMapa` — tercer contenido**

En `PanelMapa.tsx`: importar `ListaProductos, { type PropsListaProductos }` y añadir la prop:

```tsx
  /** Presente = la lista de productos de la pestaña Productos. Cede ante un punto o una celda. */
  productos?: PropsListaProductos | null;
```

La clave pasa a:

```tsx
  const abierta = punto ? `punto:${punto.id}` : lista ? 'lista' : productos ? 'productos' : null;
```

y el contenido a tres ramas:

```tsx
      {({ expandida, onAntesDeNavegar, cerrar }) => (punto ? (
        <FichaPunto …lo de hoy… productoMarcado={productoMarcado} etiquetaVolver={etiquetaVolver} />
      ) : lista ? (
        <ListaCelda …lo de hoy… />
      ) : productos ? (
        <ListaProductos {...productos} tituloId={tituloId} onCerrar={cerrar} />
      ) : null)}
```

(`lista ?? []` deja de hacer falta en `ListaCelda` porque la rama ya garantiza `lista`.)

- [ ] **Step 3: `MapaExplorar` — `seleccionado` y marcador suelto**

Sustituir la prop `seleccionadoId?: string | null` por:

```tsx
  /** El negocio con su ficha abierta o resaltado desde la lista de productos. Si su pin no está
   *  pintado (agrupado detrás de otro en su celda), se pinta uno suelto en su punto publicado. */
  seleccionado?: { id: string; lat: number; lng: number } | null;
```

Al principio del cuerpo: `const seleccionadoId = seleccionado?.id;` (el resto del archivo sigue usando `seleccionadoId`). Tras el último `{mapa.puntos.map(...)}` dentro de `MapContainer`:

```tsx
        {seleccionado && !mapa.puntos.some((p) => p.id === seleccionado.id) && (
          <Marker
            key={`suelto-${seleccionado.id}`}
            position={[seleccionado.lat, seleccionado.lng]}
            icon={pinSeleccionadoIcon('negocio', 0)}
            zIndexOffset={1000}
            interactive={false}
          />
        )}
```

- [ ] **Step 4: `ExplorarMapa` — estado y coordinación**

Imports nuevos: `usarProductosMapa` (`./usarProductosMapa`), `type PropsListaProductos` (`./ListaProductos`), tipos `Bbox, OrdenProductos, ProductoMapa`.

Junto a los estados existentes:

```tsx
  const [zona, setZona] = useState<Bbox | null>(null);
  const [verProductos, setVerProductos] = useState(false);
  // El producto tocado: marca su fila al volver y va primero en la ficha de su negocio.
  const [productoMarcado, setProductoMarcado] = useState<ProductoMapa | null>(null);
  const [resaltado, setResaltado] = useState<{ id: string; lat: number; lng: number } | null>(null);

  const q = get('q');
  const ORDENES: OrdenProductos[] = ['relevance', 'price_asc', 'price_desc'];
  const orden = (ORDENES as string[]).includes(get('orden')) ? (get('orden') as OrdenProductos) : 'relevance';
  const productos = usarProductosMapa({ zona, q, category, sort: orden, activo: tab === 'productos' });
```

(`ORDENES` va mejor como constante de módulo, fuera del componente.)

El efecto existente de `[tab, category]` añade, al final:

```tsx
    setVerProductos(tab === 'productos');
    setProductoMarcado(null);
    setResaltado(null);
```

Y uno nuevo para el texto (una búsqueda nueva vuelve a la lista aunque hubiera una ficha abierta):

```tsx
  useEffect(() => {
    if (tab !== 'productos') return;
    setPunto(null);
    setLista(null);
    setListaPrevia(null);
    setProductoMarcado(null);
    setVerProductos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
```

Ampliar el mapa hasta un punto:

```tsx
  // Para un producto de fuera: alejar lo justo para que su negocio entre, sin perder lo que se
  // veía. Aquí SÍ cambia el zoom (a diferencia de apartarDelPanel): la zona tiene que crecer.
  const ampliarHasta = useCallback((p: { lat: number; lng: number }) => {
    const m = mapRef.current;
    if (!m) return;
    const altoHoja = esEscritorio ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hoja-punto-alto')) || 0;
    m.flyToBounds(m.getBounds().extend([p.lat, p.lng]), {
      paddingTopLeft: [esEscritorio ? ANCHO_PANEL_PX + MARGEN_PANEL_PX : 16, 120],
      paddingBottomRight: [16, altoHoja + 16],
      duration: 0.6,
    });
  }, [esEscritorio]);
```

Elegir un producto:

```tsx
  const elegirProducto = useCallback((p: ProductoMapa, deFuera: boolean) => {
    const negocio: PuntoMapa = {
      id: p.provider_id, tipo: p.tipo, nombre: p.provider_name, lat: p.lat, lng: p.lng,
      plan: (p.subscription_plan === 'premium' ? 'pro' : p.subscription_plan) as PuntoMapa['plan'],
      aproximado: p.aproximado, detras: 0, cy: 0, cx: 0, resumen: '',
    };
    setResaltado(null);
    setProductoMarcado(p);
    setLista(null);
    setListaPrevia(null);
    setPunto(negocio);
    if (deFuera) ampliarHasta(negocio); else apartarDelPanel(negocio);
  }, [ampliarHasta, apartarDelPanel]);

  const volverAProductos = useCallback(() => { setPunto(null); }, []);
```

`abrirPunto` (tocar un pin) añade `setProductoMarcado(null);` — la ficha de un pin no ofrece volver a productos.

`cerrarPanel` añade `setVerProductos(false); setResaltado(null);` (mantiene `productoMarcado` para el desplazamiento si se reabre; se limpia con la búsqueda).

Derivados para el render:

```tsx
  const desdeProductos = Boolean(punto && productoMarcado && punto.id === productoMarcado.provider_id);
  const panelProductos: PropsListaProductos | null = tab === 'productos' && verProductos ? {
    dentro: productos.dentro, total: productos.total, fuera: productos.fuera,
    orden, onOrden: (o) => update({ orden: o === 'relevance' ? null : o }),
    cargando: productos.cargando, error: productos.error, onReintentar: productos.reintentar,
    hayMas: productos.hayMas, cargandoMas: productos.cargandoMas, onVerMas: productos.verMas,
    onElegir: elegirProducto,
    onResaltar: esEscritorio ? (p) => setResaltado(p ? { id: p.provider_id, lat: p.lat, lng: p.lng } : null) : undefined,
    ultimoElegidoId: productoMarcado?.id ?? null,
  } : null;
  const hayProductos = productos.total > 0 || productos.fuera.length > 0;
```

`conPanel` pasa a `esEscritorio && Boolean(punto || lista || panelProductos)`.

En el JSX: `MapaExplorar` recibe `seleccionado={punto ?? resaltado}` (en vez de `seleccionadoId`) y `onZona={setZona}`. `PanelMapa` recibe:

```tsx
        productos={panelProductos}
        productoMarcado={desdeProductos ? productoMarcado : null}
        etiquetaVolver={desdeProductos ? `${productos.total} ${productos.total === 1 ? 'producto' : 'productos'}` : undefined}
        onVolverALista={desdeProductos ? volverAProductos : listaPrevia ? volverALista : undefined}
```

Y el botón flotante, después de `PanelMapa`:

```tsx
      {/* Cerrada la lista, que no se pierda: en móvil la hoja tapa medio mapa y es normal cerrarla
          para mirar; reabrirla no puede exigir volver a buscar. */}
      {tab === 'productos' && !verProductos && !punto && !lista && hayProductos && (
        <button
          type="button"
          onClick={() => setVerProductos(true)}
          className="btn-primary btn-sm absolute bottom-4 left-1/2 z-[1015] -translate-x-1/2 shadow-lift"
        >
          {productos.total > 0 ? `Ver ${productos.total} ${productos.total === 1 ? 'producto' : 'productos'}` : 'Ver productos cercanos'}
        </button>
      )}
```

Nota de comportamiento: con la ficha abierta desde la lista, `verProductos` sigue en `true`, así que al volver (`setPunto(null)`) `PanelMapa` pasa de `punto:` a `productos` sin empujar historial, igual que hoy entre celda y ficha.

- [ ] **Step 5: Correr los tests**

Run: `npx vitest run src/components/mapa/`
Expected: PASS todos, nuevos y existentes (los existentes de `ExplorarMapa` montan con `get = () => ''`: pestaña Servicios, sin lista de productos).

- [ ] **Step 6: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
git add oficios-cuba/frontend/src/components/mapa/PanelMapa.tsx oficios-cuba/frontend/src/components/mapa/MapaExplorar.tsx oficios-cuba/frontend/src/components/mapa/ExplorarMapa.tsx oficios-cuba/frontend/src/components/mapa/ExplorarMapa.test.tsx
git commit -m "Web: la pestaña Productos del mapa abre la lista, vuelve a ella, resalta y amplía el mapa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Recorrido en navegador, documentación y STATUS

**Files:**
- Modify: `oficios-cuba/CLAUDE.md` (tabla de la API y la descripción de `/explorar`)
- Modify: `oficios-cuba/STATUS.md` (entrada al final)

- [ ] **Step 1: Levantar en local con datos de demo**

En el worktree, con el `.env` de pruebas (no el de producción). Anotar los PID para pararlos al final.

1. Base de desarrollo propia en `oficio_db_test`: `oficio_pm_dev` (crearla con `psql`/`createdb` contra `127.0.0.1:55432` usando las credenciales del `.env`, sin imprimirlas).
2. API: `cd oficios-cuba/backend && DATABASE_URL=<…/oficio_pm_dev> DEMO_MODE=true PORT=3012 npm run dev`. Se migra y siembra sola.
3. Datos: `DATABASE_URL=<la misma> DEMO_MODE=true npm run seed:mapa && DATABASE_URL=<la misma> DEMO_MODE=true npm run seed:catalogo`.
4. Web: `cd ../frontend && BACKEND_URL=http://127.0.0.1:3012 npx vite --port 5178 --strictPort --host 0.0.0.0`.

- [ ] **Step 2: Mirar cada captura** con `dh-playwright:1.63.0` (memoria «Navegador en vps2 via Docker»: importar `playwright` desde `/trabajo/node_modules/playwright/index.mjs` y usar `--network host`), a 390×844 y a 1280×800, en `http://127.0.0.1:5178/explorar?vista=mapa&tab=productos&q=<un término que exista en el catálogo sembrado>`:
   - la lista se abre sola; filas compactas con foto, nombre, logo y negocio pequeños, precio a la derecha;
   - «Menor precio» reordena y aparece la nota de la tasa; la URL lleva `orden=price_asc`;
   - al final, «Fuera de esta zona» con municipio y km; tocar uno aleja el mapa, aparece su pin y se abre la ficha con «Lo que tocaste»;
   - «‹ N productos» vuelve a la lista en la fila tocada;
   - en escritorio, pasar el ratón por una fila resalta su pin (o pinta uno suelto si estaba agrupado);
   - cerrar la lista deja «Ver N productos».

   Cualquier punto que no se pueda ver en pantalla se anota como **no verificado** en `STATUS.md`; nunca se da por visto.

- [ ] **Step 3: Parar los procesos y borrar `oficio_pm_dev`.**

- [ ] **Step 4: Documentación**

`oficios-cuba/CLAUDE.md`, fila **Mapa** de la tabla de la API, añadir al final:
`· `GET /mapa/productos?bbox=…&q=&category=&sort=relevance|price_asc|price_desc&page=` (P; productos de la zona visible EXACTA —sin el margen del 50 %— en `dentro`, 20 por página, y en la página 1 los 10 más cercanos de fuera en `fuera`, con `distancia_km`. Precio para ordenar en CUP con `TASA_CUP_USD`; «A consultar» al final. Filtra y mide solo por `punto_pub`)`

En la descripción de `/explorar` (sección Páginas), tras «…desde uno se vuelve a la lista.»: «En la pestaña Productos, el panel abre solo `ListaProductos` (productos de la zona, orden en `&orden=`, y aparte los de fuera); tocar uno abre la ficha de su negocio con el producto marcado y se vuelve a la lista; uno de fuera amplía el mapa con `flyToBounds`.»

- [ ] **Step 5: STATUS.md**

Entrada al final con el formato de las existentes: cambios por archivo, tests (backend N/N, web N/N, tsc y build), qué se vio en el navegador y qué no, Security («endpoint público nuevo de solo lectura, filtra y mide solo por `punto_pub`; sin cambios de red, túnel ni auth»), Next («desplegar con OK de Dariel; entrega 2: app Android»).

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/CLAUDE.md oficios-cuba/STATUS.md
git commit -m "Docs: productos en el mapa en CLAUDE.md y STATUS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

La integración en `master` y el despliegue se deciden con Dariel al terminar (skill `superpowers:finishing-a-development-branch`, y `oficio-deploy-vps2` con su OK).
