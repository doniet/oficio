import { Router } from 'express';
import { q, qOne } from '../db/acceso.js';
import { CATEGORIAS_SQL, CON_CATALOGO_SQL, CON_NEGOCIO_SQL, LAT_SERVIDA, LNG_SERVIDA, PLAN_WEIGHT_SQL } from '../db/index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { categoriaColumna, queryTextos } from '../lib/entrada.js';
import { consultaSQL, termino } from '../lib/buscador.js';
import { conMargen, leerBbox, tamanoCelda } from '../lib/mapa.js';
import { segunPlan } from './providers.js';
import { TASA_CUP_USD } from '../config.js';
import { COLUMNAS as COLUMNAS_ARTICULO, CON_CATALOGO } from './catalog.js';

const router = Router();

const TOPE = 200;
const PESTANAS = ['servicios', 'productos', 'negocios'] as const;

// LAT_SERVIDA/LNG_SERVIDA (db/index.ts) son la única definición de «la coordenada que se
// publica»: la presencia de un perfil en este listado depende de lo mismo que se sirve. Antes se
// filtraba por pp.lat/pp.lng (lo guardado) y se redondeaba después, en JS: eso deja un oráculo —
// con un rectángulo del tamaño que se quiera (leerBbox no impone mínimo) se puede localizar por
// bisección la casa exacta de un perfil `zona`, con solo mirar si aparece o no.

// Una línea de precio para el marcador. Sin conversión de moneda (esa la hace shared/formato.ts,
// pensada para las fichas del cliente y no accesible desde el backend): basta con la cifra tal
// como se guardó — el mapa es una vista de bulto, no la ficha completa.
function textoPrecio(s: { price_min: number | null; price_max: number | null; price_type: string; price_currency: string }) {
  if (s.price_type === 'negotiable' || (s.price_min == null && s.price_max == null)) return 'precio acordado';
  const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cifra = (n: number) => `${miles(n)} ${s.price_currency === 'USD' ? 'USD' : 'CUP'}`;
  const { price_min: min, price_max: max } = s;
  const monto = min != null && max != null && max !== min ? `${cifra(min)}–${cifra(max)}` : cifra((min ?? max) as number);
  const sufijo = s.price_type === 'hourly' ? ' / hora' : s.price_type === 'daily' ? ' / día' : '';
  return `${monto}${sufijo}`;
}

// `resumen` es la línea que se ve en el marcador y en la ficha asomada: SIEMPRE una cadena (el
// contrato de los cuatro tipos — shared, frontend y los dos móviles — es `resumen: string`, nunca
// un objeto). Antes cada rama devolvía una forma distinta ({titulo,precio_min,…} / {articulos} /
// {categoria}) y los tres consumidores la pintaban como hijo de React directo: cualquier punto
// del mapa reventaba la página. El propio test de este archivo fija `typeof resumen === 'string'`
// para que esto no pueda volver a desviarse sin que la suite lo note.

// El servicio activo más reciente de un perfil: uno recién publicado es el más probable de
// seguir vigente. Desempate por id para que dos peticiones iguales den siempre el mismo resumen.
async function resumenServicio(providerId: string) {
  const s = await qOne<
    { title: string; price_min: number | null; price_max: number | null; price_type: string; price_currency: string }
  >(`
    SELECT title, price_min, price_max, price_type, price_currency FROM services
    WHERE provider_id = $1 AND is_active = true ORDER BY created_at DESC, id LIMIT 1
  `, [providerId]);
  if (!s) return '';
  return `${s.title} · ${textoPrecio(s)}`;
}

async function resumenProductos(providerId: string) {
  // count(*) llega como cadena (bigint de pg): Number(...) antes de usarlo.
  const row = await qOne<{ n: string }>(`
    SELECT count(*) AS n FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id
    WHERE ci.provider_id = $1 AND ci.available = true AND ${CON_CATALOGO_SQL}
  `, [providerId]);
  const n = Number(row?.n ?? 0);
  if (!n) return '';
  return `${n} ${n === 1 ? 'artículo' : 'artículos'}`;
}

// La categoría principal de un negocio: se reusa CATEGORIAS_SQL de db/index.ts (la misma que
// arma PUBLIC_COLUMNS en providers.ts) en vez de escribir otra forma de sacarla. Ya es jsonb:
// llega parseada, nada de JSON.parse.
async function resumenNegocio(providerId: string) {
  const row = await qOne<{ categorias: string[] | null }>(
    `SELECT ${CATEGORIAS_SQL} AS categorias FROM provider_profiles pp WHERE pp.id = $1`, [providerId],
  );
  const categorias = Array.isArray(row?.categorias) ? row!.categorias : [];
  return categorias[0] ?? '';
}

async function resumenDe(providerId: string, tab: string): Promise<string> {
  if (tab === 'negocios') return resumenNegocio(providerId);
  if (tab === 'productos') return resumenProductos(providerId);
  return resumenServicio(providerId);
}

/**
 * El filtro de perfiles visibles del mapa. Lo comparten GET /mapa y GET /mapa/celda: si cada uno
 * escribiera el suyo, la lista de una celda podría no coincidir con el «+N» que la anuncia, y el
 * usuario vería «5 más» y le saldrían cuatro. Es la misma razón por la que el tamaño de celda lo
 * calcula el servidor en los dos sitios.
 *
 * Los parámetros que devuelve arrancan en $1 y son autocontenidos: quien arme la consulta final
 * añade los suyos (celda, cy/cx, el LIMIT) DESPUÉS, con `params.push(...)` y referenciando
 * `params.length` — el mismo patrón que ya usan providers.ts/services.ts/catalog.ts.
 */
function filtroDeVisibles(
  tab: string, texto: string | undefined, category: string | undefined,
  pedido: { sur: number; norte: number; oeste: number; este: number },
) {
  // Se filtra SOLO por la coordenada publicada (pp.punto_pub), nunca por la guardada (pp.lat/
  // pp.lng). Ahí está el oráculo: con rectángulos cada vez más pequeños sobre la coordenada real
  // se podría acorralar por bisección la casa de un perfil «zona», anulando la única promesa de
  // esa opción. ST_Intersects usa el índice GiST idx_pp_punto_pub (esquema.sql), así que sigue
  // siendo un filtro indexable, no un simple BETWEEN.
  //
  // ST_MakeEnvelope toma (oeste, sur, este, norte) — un orden DISTINTO del bbox=sur,oeste,norte,
  // este que recibe la API (leerBbox). Equivocar el orden da un rectángulo vacío EN SILENCIO, sin
  // error: el mapa saldría sin puntos y parecería que no hay negocios, no que el filtro está mal.
  let where = `WHERE pp.is_active = true AND pp.show_on_map = true
    AND pp.punto_pub IS NOT NULL
    AND ST_Intersects(pp.punto_pub, ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography)`;
  const params: unknown[] = [pedido.oeste, pedido.sur, pedido.este, pedido.norte];

  if (tab === 'negocios') where += ` AND pp.kind = 'negocio' AND ${CON_NEGOCIO_SQL}`;

  // `texto` tiene que buscar lo mismo que busca la lista de esa pestaña (services.ts /
  // catalog.ts): si no, cambiar de lista a mapa con un término escrito casi siempre vacía el
  // mapa, porque el término coincide con un servicio o un artículo, no con el nombre del
  // negocio. Negocios es la excepción a propósito: ahí no hay un "servicio que coincide" que
  // mostrar, así que sí busca en los campos del propio perfil (pp.busca).
  if (tab === 'servicios') {
    // El LIKE original también buscaba en el nombre del negocio y en el de la categoría (y su
    // categoría padre): mismas cuatro columnas que la lista (services.ts), o cambiar de vista con
    // un término escrito podría vaciar el mapa por una coincidencia que la lista sí encontraba.
    where += ` AND EXISTS (SELECT 1 FROM services s
      LEFT JOIN categories c ON s.category_id = c.id LEFT JOIN categories parent ON c.parent_id = parent.id
      WHERE s.provider_id = pp.id AND s.is_active = true`;
    const idx = params.length + 1;
    const t = termino(texto, 's.busca', idx);
    if (t) {
      where += ` AND (${t.sql} OR pp.busca @@ ${consultaSQL(idx)}
        OR c.busca @@ ${consultaSQL(idx)} OR parent.busca @@ ${consultaSQL(idx)})`;
      params.push(...t.params);
    }
    where += ')';
  }
  if (tab === 'productos') {
    // `catalog_items` NO tiene `is_active`: la visibilidad es `available` más el tope del plan.
    where += ` AND EXISTS (SELECT 1 FROM catalog_items ci
      WHERE ci.provider_id = pp.id AND ci.available = true AND ${CON_CATALOGO_SQL}`;
    // pp.business_name igual que catalog.ts (/catalog/search, la que usa la pestaña Productos).
    const idx = params.length + 1;
    const t = termino(texto, 'ci.busca', idx);
    if (t) {
      where += ` AND (${t.sql} OR pp.busca @@ ${consultaSQL(idx)})`;
      params.push(...t.params);
    }
    where += ')';
  }
  if (category) {
    // category acepta un uuid o un slug: ver categoriaColumna (misma trampa que providers.ts/services.ts).
    const campo = categoriaColumna(category);
    params.push(category);
    const n = params.length;
    where += ` AND pp.id IN (SELECT s.provider_id FROM services s JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true AND (c.${campo} = $${n} OR c.parent_id IN (SELECT id FROM categories WHERE ${campo} = $${n})))`;
  }
  if (tab === 'negocios') {
    // El LIKE original también buscaba en el nombre del dueño (u.full_name): u ya está unida en
    // la CTE de fuera (FROM provider_profiles pp JOIN users u ON pp.user_id = u.id).
    const idx = params.length + 1;
    const t = termino(texto, 'pp.busca', idx);
    if (t) {
      where += ` AND (${t.sql} OR u.busca @@ ${consultaSQL(idx)})`;
      params.push(...t.params);
    }
  }
  return { where, params };
}

router.get('/', asyncHandler(async (req, res) => {
  // Un tab que no sea una cadena (p. ej. ?tab[x]=1) no puede caer en el valor por defecto en
  // silencio: es justo el filtro que separa negocios de oficios, y la spec pide fallar, no adivinar.
  if (req.query.tab !== undefined && typeof req.query.tab !== 'string') {
    throw new AppError('Pestaña no válida', 400);
  }
  const { tab = 'servicios', q: texto, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
  if (!PESTANAS.includes(tab as (typeof PESTANAS)[number])) {
    throw new AppError('Pestaña no válida', 400);
  }
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const celda = tamanoCelda(visible);
  const pedido = conMargen(visible);

  const { where, params } = filtroDeVisibles(tab, texto, category, pedido);
  // celda y el LIMIT se añaden DESPUÉS de los del filtro, referenciados por su propia posición:
  // el mismo parámetro $celdaParam se reusa dos veces (cy y cx), algo que el `?` posicional de
  // SQLite no permitía.
  const celdaParam = params.length + 1;
  params.push(celda);
  const limiteParam = params.length + 1;
  params.push(TOPE + 1);

  // Las dos CTE se aliasan `pp` a propósito: PLAN_WEIGHT_SQL lleva el prefijo `pp.` escrito
  // dentro, así que sin el alias el ORDER BY de fuera fallaría con «no such column».
  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = await q<any>(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.map_precision, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             floor(${LAT_SERVIDA} / $${celdaParam})::int AS cy, floor(${LNG_SERVIDA} / $${celdaParam})::int AS cx
        FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      ${where}
    ), rankeadas AS (
      SELECT pp.*, ROW_NUMBER() OVER (PARTITION BY pp.cy, pp.cx ORDER BY ${orden}) AS pos,
                   COUNT(*)     OVER (PARTITION BY pp.cy, pp.cx) AS en_celda
        FROM visibles pp
    )
    SELECT * FROM rankeadas pp WHERE pp.pos = 1 ORDER BY ${orden} LIMIT $${limiteParam}
  `, params);

  const hay_mas = filas.length > TOPE;
  // resumenDe() consulta la base una vez por punto, hasta TOPE veces por petición: es un N+1 real
  // y deliberadamente no se toca aquí (fuera de alcance de este porte; resuelto en el Plan 2,
  // precalculando el resumen en el índice de búsqueda). Promise.all mantiene el mismo número de
  // consultas que antes, solo concurrentes en vez de secuenciales — lo que pide portar un `.map()`
  // síncrono a async, no una optimización.
  const puntos = await Promise.all(filas.slice(0, TOPE).map(async (f) => ({
    id: f.id,
    // `pp.kind` a secas es el dato guardado, no lo que el plan actual permite mostrar: un negocio
    // que bajó de plan sigue teniendo kind='negocio' en la fila hasta que alguien lo edite. El
    // filtro de la pestaña Negocios ya usa CON_NEGOCIO_SQL (por eso no aparece ahí), pero fuera de
    // esa pestaña la etiqueta pasaba cruda — segunPlan() es la única fuente de verdad de "qué kind
    // se le muestra a la gente" (routes/providers.ts, listados y ficha), así que el mapa la reusa
    // en vez de escribir una tercera forma de decidirlo.
    tipo: segunPlan(f).kind as 'oficio' | 'negocio',
    nombre: f.business_name || f.owner_name,
    lat: f.lat,
    lng: f.lng,
    plan: f.subscription_plan === 'premium' ? 'pro' : f.subscription_plan,
    // Sin esta bandera el cliente no puede dibujar distinto lo aproximado, y un negocio con local
    // real se vería tan difuso como quien se esconde. Revela una preferencia, no una ubicación.
    aproximado: f.map_precision === 'zona',
    // COUNT(*) OVER(...) llega como cadena (bigint de pg): Number(...) antes de restar.
    detras: Number(f.en_celda) - 1,
    // Los índices de celda VIENEN del servidor y el cliente los reenvía a /mapa/celda tal cual.
    // Recalcularlos en el cliente sería definir el mismo número en dos sitios: floor(x/celda) en
    // SQL y Math.floor en JS coinciden hoy, pero es exactamente el error que esta entrega ya
    // corrigió varias veces. No añaden información: salen de lat/lng y celda, que ya viajan.
    cy: f.cy,
    cx: f.cx,
    resumen: await resumenDe(f.id, tab),
  })));

  res.json({ puntos, celda, hay_mas });
}));

// Los negocios de UNA celda, con los mismos filtros. Hasta ahora `detras` era solo una insignia:
// si una celda tenía cinco negocios veías uno y los otros cuatro eran inalcanzables desde el mapa.
const TOPE_CELDA = 50;

router.get('/celda', asyncHandler(async (req, res) => {
  if (req.query.tab !== undefined && typeof req.query.tab !== 'string') {
    throw new AppError('Pestaña no válida', 400);
  }
  const { tab = 'servicios', q: texto, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
  if (!PESTANAS.includes(tab as (typeof PESTANAS)[number])) {
    throw new AppError('Pestaña no válida', 400);
  }
  const cy = Number(req.query.cy);
  const cx = Number(req.query.cx);
  if (!Number.isInteger(cy) || !Number.isInteger(cx)) {
    throw new AppError('Celda no válida', 400);
  }

  // El tamaño de celda lo recalcula el servidor del mismo bbox y con la misma función que /mapa:
  // si viniera del cliente, dos definiciones del mismo número acabarían separándose y la lista
  // dejaría de coincidir con el «+N» que la anunció.
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const celda = tamanoCelda(visible);
  const pedido = conMargen(visible);
  const { where, params } = filtroDeVisibles(tab, texto, category, pedido);

  const celdaParam = params.length + 1;
  params.push(celda);
  const cyParam = params.length + 1;
  params.push(cy);
  const cxParam = params.length + 1;
  params.push(cx);
  const limiteParam = params.length + 1;
  params.push(TOPE_CELDA + 1);

  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = await q<any>(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.map_precision, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             floor(${LAT_SERVIDA} / $${celdaParam})::int AS cy, floor(${LNG_SERVIDA} / $${celdaParam})::int AS cx
        FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      ${where}
    )
    SELECT * FROM visibles pp WHERE pp.cy = $${cyParam} AND pp.cx = $${cxParam} ORDER BY ${orden} LIMIT $${limiteParam}
  `, params);

  const hay_mas = filas.length > TOPE_CELDA;
  const puntos = await Promise.all(filas.slice(0, TOPE_CELDA).map(async (f) => ({
    id: f.id,
    tipo: segunPlan(f).kind as 'oficio' | 'negocio',
    nombre: f.business_name || f.owner_name,
    lat: f.lat,
    lng: f.lng,
    plan: f.subscription_plan === 'premium' ? 'pro' : f.subscription_plan,
    aproximado: f.map_precision === 'zona',
    detras: 0,
    cy: f.cy,
    cx: f.cx,
    resumen: await resumenDe(f.id, tab),
  })));

  res.json({ puntos, celda, hay_mas });
}));

// ── Productos de la zona visible ───────────────────────────────────────────────────────────────
// La lista de la pestaña Productos del mapa. A diferencia de `/` y `/celda`, NO infla el bbox con
// conMargen: la lista dice «N productos en esta zona» y tiene que ser verdad para lo que se ve.

const ORDENES_PRODUCTOS = ['relevance', 'price_asc', 'price_desc'] as const;
type OrdenProductos = (typeof ORDENES_PRODUCTOS)[number];
const POR_PAGINA_PRODUCTOS = 20;
const TOPE_FUERA = 10;

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
}));

export default router;
