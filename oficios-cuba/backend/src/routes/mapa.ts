import { Router } from 'express';
import db, { CON_CATALOGO_SQL, CON_NEGOCIO_SQL, PLAN_WEIGHT_SQL } from '../db/index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { queryTextos } from '../lib/entrada.js';
import { CATEGORIAS_SQL } from './providers.js';
import { conMargen, leerBbox, tamanoCelda } from '../lib/mapa.js';

const router = Router();

const TOPE = 200;
// Celda de ~1 km: es la precisión que acepta quien no quiere publicar su casa exacta.
const CELDA_ZONA = 0.01;
const PESTANAS = ['servicios', 'productos', 'negocios'] as const;

// El servicio activo mejor clasificado de un perfil: el mismo criterio (el más antiguo) que usa
// la portada del perfil en PUBLIC_COLUMNS de providers.ts, para no inventar un segundo orden.
function resumenServicio(providerId: string) {
  const s = db.prepare(`
    SELECT title, price_min, price_max, price_type, price_currency FROM services
    WHERE provider_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1
  `).get(providerId) as
    { title: string; price_min: number | null; price_max: number | null; price_type: string; price_currency: string } | undefined;
  if (!s) return null;
  return { titulo: s.title, precio_min: s.price_min, precio_max: s.price_max, price_type: s.price_type, price_currency: s.price_currency };
}

function resumenProductos(providerId: string) {
  const { n } = db.prepare(`
    SELECT COUNT(*) AS n FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id
    WHERE ci.provider_id = ? AND ci.available = 1 AND ${CON_CATALOGO_SQL}
  `).get(providerId) as { n: number };
  return { articulos: n };
}

// La categoría principal de un negocio: se reusa el SQL de categorías de PUBLIC_COLUMNS
// (providers.ts) en vez de escribir otra forma de sacarla — la misma pregunta, la misma respuesta.
function resumenNegocio(providerId: string) {
  const row = db.prepare(`SELECT ${CATEGORIAS_SQL} AS categorias FROM provider_profiles pp WHERE pp.id = ?`)
    .get(providerId) as { categorias: string | null } | undefined;
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
  const { tab = 'servicios', q, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
  if (!PESTANAS.includes(tab as (typeof PESTANAS)[number])) {
    throw new AppError('Pestaña no válida', 400);
  }
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const celda = tamanoCelda(visible);
  const pedido = conMargen(visible);

  // Se filtra por la coordenada EXACTA y se redondea al servir. Al contrario, un perfil con
  // precisión de zona desaparecería del borde del rectángulo según el redondeo.
  let where = `WHERE pp.is_active = 1 AND pp.show_on_map = 1
    AND pp.lat IS NOT NULL AND pp.lng IS NOT NULL
    AND pp.lat BETWEEN ? AND ? AND pp.lng BETWEEN ? AND ?`;
  const params: unknown[] = [pedido.sur, pedido.norte, pedido.oeste, pedido.este];

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
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.lat, pp.lng, pp.map_precision,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             CAST(pp.lat / ? AS INT) AS cy, CAST(pp.lng / ? AS INT) AS cx
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
    // Al revés de lo intuitivo a propósito: si `map_precision` no es exactamente 'exacta' (un
    // valor futuro, un NULL, cualquier cosa que se cuele), se redondea. Así lo peor que puede
    // pasar es publicar un punto menos útil, nunca la casa exacta de alguien que pidió zona.
    lat: f.map_precision === 'exacta' ? f.lat : Math.round(f.lat / CELDA_ZONA) * CELDA_ZONA,
    lng: f.map_precision === 'exacta' ? f.lng : Math.round(f.lng / CELDA_ZONA) * CELDA_ZONA,
    plan: f.subscription_plan === 'premium' ? 'pro' : f.subscription_plan,
    detras: f.en_celda - 1,
    resumen: resumenDe(f.id, tab),
  }));

  res.json({ puntos, celda, hay_mas });
}));

export default router;
