import { Router } from 'express';
import db, { CATEGORIAS_SQL, CON_CATALOGO_SQL, CON_NEGOCIO_SQL, PLAN_WEIGHT_SQL } from '../db/index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { queryTextos } from '../lib/entrada.js';
import { conMargen, leerBbox, tamanoCelda } from '../lib/mapa.js';

const router = Router();

const TOPE = 200;
// Celda de ~1 km: es la precisión que acepta quien no quiere publicar su casa exacta.
const CELDA_ZONA = 0.01;
const PESTANAS = ['servicios', 'productos', 'negocios'] as const;

// Una sola definición de «la coordenada que se publica», en SQL, para que la presencia de un
// perfil dependa de lo mismo que se sirve. Antes se filtraba por pp.lat/pp.lng (lo guardado) y
// se redondeaba después, en JS: eso deja un oráculo — con un rectángulo del tamaño que se quiera
// (leerBbox no impone mínimo) se puede localizar por bisección la casa exacta de un perfil
// `zona`, con solo mirar si aparece o no. Dirección segura a propósito: lo que no sea
// exactamente 'exacta' se redondea, así que un valor inesperado degrada la precisión en vez de
// publicar la casa de alguien.
const LAT_SERVIDA = `CASE WHEN pp.map_precision = 'exacta' THEN pp.lat ELSE ROUND(pp.lat / ${CELDA_ZONA}) * ${CELDA_ZONA} END`;
const LNG_SERVIDA = `CASE WHEN pp.map_precision = 'exacta' THEN pp.lng ELSE ROUND(pp.lng / ${CELDA_ZONA}) * ${CELDA_ZONA} END`;

// Los tres `db.prepare` de abajo se compilan una sola vez, en el primer uso, y se reusan después
// (better-sqlite3 no cachea por su cuenta: sin esto, resumenDe() recompilaría el SQL hasta 200
// veces por petición). No se preparan al cargar el módulo: este archivo se importa antes de que
// initDatabase() cree las tablas (app.ts → index.ts arrancan en ese orden), así que un
// `db.prepare` a nivel de módulo rompería el arranque con «no such table».
let stmtServicio: ReturnType<typeof db.prepare> | null = null;
let stmtProductos: ReturnType<typeof db.prepare> | null = null;
let stmtNegocio: ReturnType<typeof db.prepare> | null = null;

// El servicio activo más reciente de un perfil: uno recién publicado es el más probable de
// seguir vigente. Desempate por id para que dos peticiones iguales den siempre el mismo resumen.
function resumenServicio(providerId: string) {
  stmtServicio ??= db.prepare(`
    SELECT title, price_min, price_max, price_type, price_currency FROM services
    WHERE provider_id = ? AND is_active = 1 ORDER BY created_at DESC, id LIMIT 1
  `);
  const s = stmtServicio.get(providerId) as
    { title: string; price_min: number | null; price_max: number | null; price_type: string; price_currency: string } | undefined;
  if (!s) return null;
  return { titulo: s.title, precio_min: s.price_min, precio_max: s.price_max, price_type: s.price_type, price_currency: s.price_currency };
}

function resumenProductos(providerId: string) {
  stmtProductos ??= db.prepare(`
    SELECT COUNT(*) AS n FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id
    WHERE ci.provider_id = ? AND ci.available = 1 AND ${CON_CATALOGO_SQL}
  `);
  const { n } = stmtProductos.get(providerId) as { n: number };
  return { articulos: n };
}

// La categoría principal de un negocio: se reusa CATEGORIAS_SQL de db/index.ts (la misma que
// arma PUBLIC_COLUMNS en providers.ts) en vez de escribir otra forma de sacarla.
function resumenNegocio(providerId: string) {
  stmtNegocio ??= db.prepare(`SELECT ${CATEGORIAS_SQL} AS categorias FROM provider_profiles pp WHERE pp.id = ?`);
  const row = stmtNegocio.get(providerId) as { categorias: string | null } | undefined;
  let categorias: string[] = [];
  try { categorias = JSON.parse(row?.categorias || '[]'); } catch { categorias = []; }
  return { categoria: categorias[0] ?? null };
}

function resumenDe(providerId: string, tab: string) {
  if (tab === 'negocios') return resumenNegocio(providerId);
  if (tab === 'productos') return resumenProductos(providerId);
  return resumenServicio(providerId);
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

  // El BETWEEN crudo (sobre lo guardado) va primero y con holgura de una celda de zona: es
  // indexable por idx_pp_geo y acota, pero NO decide. Quien decide es el filtro siguiente, sobre
  // la coordenada SERVIDA — el redondeo mueve un punto como mucho media celda, así que una celda
  // entera de holgura siempre alcanza para no perder a nadie que el filtro preciso sí deba incluir.
  const HOLGURA = CELDA_ZONA;
  let where = `WHERE pp.is_active = 1 AND pp.show_on_map = 1
    AND pp.lat IS NOT NULL AND pp.lng IS NOT NULL
    AND pp.lat BETWEEN ? AND ? AND pp.lng BETWEEN ? AND ?
    AND ${LAT_SERVIDA} BETWEEN ? AND ? AND ${LNG_SERVIDA} BETWEEN ? AND ?`;
  const params: unknown[] = [
    pedido.sur - HOLGURA, pedido.norte + HOLGURA, pedido.oeste - HOLGURA, pedido.este + HOLGURA,
    pedido.sur, pedido.norte, pedido.oeste, pedido.este,
  ];

  if (tab === 'negocios') where += ` AND pp.kind = 'negocio' AND ${CON_NEGOCIO_SQL}`;
  if (tab === 'servicios') {
    where += ` AND EXISTS (SELECT 1 FROM services s WHERE s.provider_id = pp.id AND s.is_active = 1)`;
  }
  if (tab === 'productos') {
    // `catalog_items` NO tiene `is_active`: la visibilidad es `available` más el tope del plan.
    where += ` AND EXISTS (SELECT 1 FROM catalog_items ci
      WHERE ci.provider_id = pp.id AND ci.available = 1 AND ${CON_CATALOGO_SQL})`;
  }
  if (category) {
    where += ` AND pp.id IN (SELECT s.provider_id FROM services s JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = 1 AND (c.id = ? OR c.slug = ? OR c.parent_id IN (SELECT id FROM categories WHERE id = ? OR slug = ?)))`;
    params.push(category, category, category, category);
  }
  if (q && q.trim()) {
    where += ' AND (pp.business_name LIKE ? OR pp.description LIKE ? OR u.full_name LIKE ?)';
    const term = `%${q.trim()}%`;
    params.push(term, term, term);
  }

  // Las dos CTE se aliasan `pp` a propósito: PLAN_WEIGHT_SQL lleva el prefijo `pp.` escrito
  // dentro, así que sin el alias el ORDER BY de fuera fallaría con «no such column».
  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = db.prepare(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng,
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
    tipo: f.kind as 'oficio' | 'negocio',
    nombre: f.business_name || f.owner_name,
    lat: f.lat,
    lng: f.lng,
    plan: f.subscription_plan === 'premium' ? 'pro' : f.subscription_plan,
    detras: f.en_celda - 1,
    resumen: resumenDe(f.id, tab),
  }));

  res.json({ puntos, celda, hay_mas });
}));

export default router;
