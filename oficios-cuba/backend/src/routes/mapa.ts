import { Router } from 'express';
import db, { CATEGORIAS_SQL, CON_CATALOGO_SQL, CON_NEGOCIO_SQL, LAT_SERVIDA, LNG_SERVIDA, PLAN_WEIGHT_SQL } from '../db/index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { queryTextos } from '../lib/entrada.js';
import { conMargen, leerBbox, tamanoCelda } from '../lib/mapa.js';
import { segunPlan } from './providers.js';

const router = Router();

const TOPE = 200;
const PESTANAS = ['servicios', 'productos', 'negocios'] as const;

// LAT_SERVIDA/LNG_SERVIDA (db/index.ts) son la única definición de «la coordenada que se
// publica»: la presencia de un perfil en este listado depende de lo mismo que se sirve. Antes se
// filtraba por pp.lat/pp.lng (lo guardado) y se redondeaba después, en JS: eso deja un oráculo —
// con un rectángulo del tamaño que se quiera (leerBbox no impone mínimo) se puede localizar por
// bisección la casa exacta de un perfil `zona`, con solo mirar si aparece o no.

// Los tres `db.prepare` de abajo se compilan una sola vez, en el primer uso, y se reusan después
// (better-sqlite3 no cachea por su cuenta: sin esto, resumenDe() recompilaría el SQL hasta 200
// veces por petición). No se preparan al cargar el módulo: este archivo se importa antes de que
// initDatabase() cree las tablas (app.ts → index.ts arrancan en ese orden), así que un
// `db.prepare` a nivel de módulo rompería el arranque con «no such table».
let stmtServicio: ReturnType<typeof db.prepare> | null = null;
let stmtProductos: ReturnType<typeof db.prepare> | null = null;
let stmtNegocio: ReturnType<typeof db.prepare> | null = null;

// Una línea de precio para el marcador. Sin conversión de moneda (esa la hace shared/formato.ts,
// pensada para las fichas del cliente y no accesible desde el backend): basta con la cifra tal
// como se guardó — el mapa es una vista de bulto, no la ficha completa.
function textoPrecio(s: { price_min: number | null; price_max: number | null; price_type: string; price_currency: string }) {
  if (s.price_type === 'negotiable' || (s.price_min == null && s.price_max == null)) return 'precio acordado';
  const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
function resumenServicio(providerId: string) {
  stmtServicio ??= db.prepare(`
    SELECT title, price_min, price_max, price_type, price_currency FROM services
    WHERE provider_id = ? AND is_active = 1 ORDER BY created_at DESC, id LIMIT 1
  `);
  const s = stmtServicio.get(providerId) as
    { title: string; price_min: number | null; price_max: number | null; price_type: string; price_currency: string } | undefined;
  if (!s) return '';
  return `${s.title} · ${textoPrecio(s)}`;
}

function resumenProductos(providerId: string) {
  stmtProductos ??= db.prepare(`
    SELECT COUNT(*) AS n FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id
    WHERE ci.provider_id = ? AND ci.available = 1 AND ${CON_CATALOGO_SQL}
  `);
  const { n } = stmtProductos.get(providerId) as { n: number };
  if (!n) return '';
  return `${n} ${n === 1 ? 'artículo' : 'artículos'}`;
}

// La categoría principal de un negocio: se reusa CATEGORIAS_SQL de db/index.ts (la misma que
// arma PUBLIC_COLUMNS en providers.ts) en vez de escribir otra forma de sacarla.
function resumenNegocio(providerId: string) {
  stmtNegocio ??= db.prepare(`SELECT ${CATEGORIAS_SQL} AS categorias FROM provider_profiles pp WHERE pp.id = ?`);
  const row = stmtNegocio.get(providerId) as { categorias: string | null } | undefined;
  let categorias: string[] = [];
  try { categorias = JSON.parse(row?.categorias || '[]'); } catch { categorias = []; }
  return categorias[0] ?? '';
}

function resumenDe(providerId: string, tab: string): string {
  if (tab === 'negocios') return resumenNegocio(providerId);
  if (tab === 'productos') return resumenProductos(providerId);
  return resumenServicio(providerId);
}

/**
 * El filtro de perfiles visibles del mapa. Lo comparten GET /mapa y GET /mapa/celda: si cada uno
 * escribiera el suyo, la lista de una celda podría no coincidir con el «+N» que la anuncia, y el
 * usuario vería «5 más» y le saldrían cuatro. Es la misma razón por la que el tamaño de celda lo
 * calcula el servidor en los dos sitios.
 */
function filtroDeVisibles(tab: string, q: string | undefined, category: string | undefined, pedido: { sur: number; norte: number; oeste: number; este: number }) {
  // Se filtra SOLO por la coordenada publicada, nunca por la guardada. Ahí está el oráculo: con
// rectángulos cada vez más pequeños sobre la coordenada real se podría acorralar por bisección
// la casa de un perfil «zona», anulando la única promesa de esa opción. Desde que la publicada
// es una columna (migración 13) esto es además un simple BETWEEN indexable por idx_pp_geo_pub:
// el filtro de dos capas que hacía falta cuando se redondeaba al vuelo ya no tiene razón de ser.
let where = `WHERE pp.is_active = 1 AND pp.show_on_map = 1
  AND ${LAT_SERVIDA} IS NOT NULL AND ${LNG_SERVIDA} IS NOT NULL
  AND ${LAT_SERVIDA} BETWEEN ? AND ? AND ${LNG_SERVIDA} BETWEEN ? AND ?`;
const params: unknown[] = [pedido.sur, pedido.norte, pedido.oeste, pedido.este];

if (tab === 'negocios') where += ` AND pp.kind = 'negocio' AND ${CON_NEGOCIO_SQL}`;

// `q` tiene que buscar lo mismo que busca la lista de esa pestaña (services.ts / catalog.ts):
// si no, cambiar de lista a mapa con un término escrito casi siempre vacía el mapa, porque el
// término coincide con un servicio o un artículo, no con el nombre del negocio. Negocios es la
// excepción a propósito: ahí no hay un "servicio que coincide" que mostrar, así que sí busca en
// los campos del propio perfil.
const termino = q && q.trim() ? `%${q.trim()}%` : null;

if (tab === 'servicios') {
  where += ` AND EXISTS (SELECT 1 FROM services s
    LEFT JOIN categories c ON s.category_id = c.id LEFT JOIN categories parent ON c.parent_id = parent.id
    WHERE s.provider_id = pp.id AND s.is_active = 1`;
  // pp.business_name igual que services.ts:109 — el nombre del negocio es un término válido
  // en la lista, y sin él aquí el mismo término vacía el mapa al cambiar de vista.
  if (termino) where += ' AND (s.title LIKE ? OR s.description LIKE ? OR c.name LIKE ? OR parent.name LIKE ? OR pp.business_name LIKE ?)';
  where += ')';
  if (termino) params.push(termino, termino, termino, termino, termino);
}
if (tab === 'productos') {
  // `catalog_items` NO tiene `is_active`: la visibilidad es `available` más el tope del plan.
  where += ` AND EXISTS (SELECT 1 FROM catalog_items ci
    WHERE ci.provider_id = pp.id AND ci.available = 1 AND ${CON_CATALOGO_SQL}`;
  // pp.business_name igual que catalog.ts:78 (/catalog/search, la que usa la pestaña Productos).
  if (termino) where += ' AND (ci.name LIKE ? OR ci.description LIKE ? OR ci.section LIKE ? OR pp.business_name LIKE ?)';
  where += ')';
  if (termino) params.push(termino, termino, termino, termino);
}
if (category) {
  where += ` AND pp.id IN (SELECT s.provider_id FROM services s JOIN categories c ON s.category_id = c.id
    WHERE s.is_active = 1 AND (c.id = ? OR c.slug = ? OR c.parent_id IN (SELECT id FROM categories WHERE id = ? OR slug = ?)))`;
  params.push(category, category, category, category);
}
if (tab === 'negocios' && termino) {
  where += ' AND (pp.business_name LIKE ? OR pp.description LIKE ? OR u.full_name LIKE ?)';
  params.push(termino, termino, termino);
}
  return { where, params };
}

router.get('/', asyncHandler(async (req, res) => {
  // Un tab que no sea una cadena (p. ej. ?tab[x]=1) no puede caer en el valor por defecto en
  // silencio: es justo el filtro que separa negocios de oficios, y la spec pide fallar, no adivinar.
  if (req.query.tab !== undefined && typeof req.query.tab !== 'string') {
    throw new AppError('Pestaña no válida', 400);
  }
  const { tab = 'servicios', q, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
  if (!PESTANAS.includes(tab as (typeof PESTANAS)[number])) {
    throw new AppError('Pestaña no válida', 400);
  }
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const celda = tamanoCelda(visible);
  const pedido = conMargen(visible);

  const { where, params } = filtroDeVisibles(tab, q, category, pedido);

  // Las dos CTE se aliasan `pp` a propósito: PLAN_WEIGHT_SQL lleva el prefijo `pp.` escrito
  // dentro, así que sin el alias el ORDER BY de fuera fallaría con «no such column».
  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = db.prepare(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.map_precision, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             CAST(${LAT_SERVIDA} / ? AS INT) AS cy, CAST(${LNG_SERVIDA} / ? AS INT) AS cx
        FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      ${where}
    ), rankeadas AS (
      SELECT pp.*, ROW_NUMBER() OVER (PARTITION BY pp.cy, pp.cx ORDER BY ${orden}) AS pos,
                   COUNT(*)     OVER (PARTITION BY pp.cy, pp.cx) AS en_celda
        FROM visibles pp
    )
    SELECT * FROM rankeadas pp WHERE pp.pos = 1 ORDER BY ${orden} LIMIT ?
  `).all(celda, celda, ...params, TOPE + 1) as any[];

  const hay_mas = filas.length > TOPE;
  const puntos = filas.slice(0, TOPE).map((f) => ({
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
    detras: f.en_celda - 1,
    // Los índices de celda VIENEN del servidor y el cliente los reenvía a /mapa/celda tal cual.
    // Recalcularlos en el cliente sería definir el mismo número en dos sitios: CAST(x/celda AS INT)
    // en SQLite y Math.trunc en JS coinciden hoy, pero es exactamente el error que esta entrega ya
    // corrigió tres veces. No añaden información: salen de lat/lng y celda, que ya viajan.
    cy: f.cy,
    cx: f.cx,
    resumen: resumenDe(f.id, tab),
  }));

  res.json({ puntos, celda, hay_mas });
}));

// Los negocios de UNA celda, con los mismos filtros. Hasta ahora `detras` era solo una insignia:
// si una celda tenía cinco negocios veías uno y los otros cuatro eran inalcanzables desde el mapa.
const TOPE_CELDA = 50;

router.get('/celda', asyncHandler(async (req, res) => {
  if (req.query.tab !== undefined && typeof req.query.tab !== 'string') {
    throw new AppError('Pestaña no válida', 400);
  }
  const { tab = 'servicios', q, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
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
  const { where, params } = filtroDeVisibles(tab, q, category, pedido);

  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = db.prepare(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.map_precision, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             CAST(${LAT_SERVIDA} / ? AS INT) AS cy, CAST(${LNG_SERVIDA} / ? AS INT) AS cx
        FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      ${where}
    )
    SELECT * FROM visibles pp WHERE pp.cy = ? AND pp.cx = ? ORDER BY ${orden} LIMIT ?
  `).all(celda, celda, ...params, cy, cx, TOPE_CELDA + 1) as any[];

  const hay_mas = filas.length > TOPE_CELDA;
  const puntos = filas.slice(0, TOPE_CELDA).map((f) => ({
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
    resumen: resumenDe(f.id, tab),
  }));

  res.json({ puntos, celda, hay_mas });
}));

export default router;
