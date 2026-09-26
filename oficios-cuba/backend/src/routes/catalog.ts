import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { enforcePlanLimit, planDelPerfil, PLAN_WEIGHT_SQL, providerProfileIdFor } from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { imagenPermitida, queryTextos } from '../lib/entrada.js';
import { borrarSiHuerfana } from './uploads.js';

const router = Router();

// Catálogo de productos o servicios (Básico 50, Profesional 1000). Lo público solo muestra
// artículos dentro del límite del plan actual (hidden_by_plan = 0) de perfiles con catálogo.
const POR_PAGINA = 24;
const CON_CATALOGO = "pp.is_active = 1 AND pp.subscription_plan IN ('basic', 'pro', 'premium') AND ci.hidden_by_plan = 0";

const itemSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es muy corto').max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  price_type: z.enum(['fixed', 'from', 'ask']).default('fixed'),
  price: z.preprocess((v) => (v === '' ? null : v), z.number().min(0).max(100_000_000).nullable().optional()),
  price_currency: z.enum(['CUP', 'USD']).default('CUP'),
  image: z.string().max(500).optional().nullable(),
  section: z.string().trim().max(40).optional().nullable(),
  available: z.boolean().default(true),
}).refine((d) => d.price_type === 'ask' || (d.price !== null && d.price !== undefined), { message: 'Pon el precio o elige «A consultar»', path: ['price'] });

const COLUMNAS = 'ci.id, ci.name, ci.description, ci.price, ci.price_type, ci.price_currency, ci.image, ci.section, ci.available, ci.created_at';
const aItem = (r: { available: number } & Record<string, unknown>) => ({ ...r, available: Boolean(r.available) });

function limpiar(texto: string | null | undefined) {
  return texto && texto.trim() ? texto.trim() : null;
}

function miPerfil(req: AuthRequest) {
  const id = providerProfileIdFor(req.user!.id);
  if (!id) throw new AppError('Perfil de proveedor no encontrado', 404);
  return { id, plan: planDelPerfil(id) };
}

function assertImagen(url: string | null | undefined, userId: string, anterior?: string | null) {
  if (url && !imagenPermitida(url, userId, anterior ? [anterior] : [])) throw new AppError('Imagen no válida', 400);
}

// ── Público ─────────────────────────────────────────────────────────────────────────────────────

router.get('/provider/:providerId', asyncHandler(async (req, res) => {
  const { q, section } = queryTextos(req.query, ['q', 'section'] as const);
  const page = Math.max(1, Number(req.query.page) || 1);
  const base = `FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id WHERE ci.provider_id = ? AND ${CON_CATALOGO}`;
  let where = '';
  const params: unknown[] = [req.params.providerId];
  if (section) { where += ' AND ci.section = ?'; params.push(section); }
  if (q && q.trim()) { where += ' AND (ci.name LIKE ? OR ci.description LIKE ?)'; params.push(`%${q.trim()}%`, `%${q.trim()}%`); }

  const total = (db.prepare(`SELECT COUNT(*) AS n ${base} ${where}`).get(...params) as { n: number }).n;
  const items = (db.prepare(`SELECT ${COLUMNAS} ${base} ${where}
    ORDER BY ci.available DESC, COALESCE(ci.section, '~'), ci.name COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, POR_PAGINA, (page - 1) * POR_PAGINA) as { available: number }[]).map(aItem);
  const sections = db.prepare(`SELECT ci.section AS name, COUNT(*) AS count ${base} AND ci.section IS NOT NULL GROUP BY ci.section ORDER BY ci.section COLLATE NOCASE`)
    .all(req.params.providerId);
  const { n: totalAll } = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(req.params.providerId) as { n: number };
  res.json({ items, sections, total, total_all: totalAll, page, pages: Math.max(1, Math.ceil(total / POR_PAGINA)) });
}));

// Búsqueda general de productos (/buscar → pestaña Productos). Para que un catálogo de 1000
// artículos no llene la página, se intercalan: primero el mejor artículo de cada profesional,
// luego el segundo de cada uno, etc.
router.get('/search', asyncHandler(async (req, res) => {
  const { q, province_id, municipality_id } = queryTextos(req.query, ['q', 'province_id', 'municipality_id'] as const);
  const page = Math.max(1, Number(req.query.page) || 1);
  let where = `WHERE ${CON_CATALOGO} AND ci.available = 1`;
  const params: unknown[] = [];
  let coincide = '0';
  const coincideParams: unknown[] = [];
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    where += ' AND (ci.name LIKE ? OR ci.description LIKE ? OR ci.section LIKE ? OR pp.business_name LIKE ?)';
    params.push(term, term, term, term);
    coincide = '(ci.name LIKE ?)';
    coincideParams.push(term);
  }
  if (province_id) { where += ' AND pp.province_id = ?'; params.push(province_id); }
  if (municipality_id) {
    where += ' AND (pp.municipality_id = ? OR EXISTS (SELECT 1 FROM service_areas sa WHERE sa.provider_id = pp.id AND sa.municipality_id = ?))';
    params.push(municipality_id, municipality_id);
  }
  const joins = `FROM catalog_items ci
    JOIN provider_profiles pp ON ci.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id`;

  const total = (db.prepare(`SELECT COUNT(*) AS n ${joins} ${where}`).get(...params) as { n: number }).n;
  const items = (db.prepare(`
    SELECT * FROM (
      SELECT ${COLUMNAS}, pp.id AS provider_id, COALESCE(pp.business_name, u.full_name) AS provider_name, u.avatar_url AS provider_avatar,
        pp.subscription_plan, pp.contact_mode, pp.whatsapp, p.name AS province_name, m.name AS municipality_name,
        ${PLAN_WEIGHT_SQL} AS peso, ${coincide} AS coincide,
        ROW_NUMBER() OVER (PARTITION BY ci.provider_id ORDER BY ${coincide} DESC, ci.image IS NULL, ci.created_at DESC) AS turno
      ${joins} ${where}
    ) ORDER BY turno, peso DESC, coincide DESC, created_at DESC LIMIT ? OFFSET ?
  `).all(...coincideParams, ...coincideParams, ...params, POR_PAGINA, (page - 1) * POR_PAGINA) as ({ available: number; peso?: number; coincide?: number; turno?: number } & Record<string, unknown>)[])
    .map(({ peso: _p, coincide: _c, turno: _t, ...r }) => aItem(r as { available: number }));
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / POR_PAGINA)) });
}));

// ── Profesional ─────────────────────────────────────────────────────────────────────────────────

router.get('/mine', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id, plan } = miPerfil(req);
  const items = (db.prepare(`SELECT ${COLUMNAS}, ci.hidden_by_plan FROM catalog_items ci WHERE ci.provider_id = ?
    ORDER BY COALESCE(ci.section, '~'), ci.name COLLATE NOCASE`).all(id) as { available: number; hidden_by_plan: number }[])
    .map((r) => ({ ...aItem(r), hidden_by_plan: Boolean(r.hidden_by_plan) }));
  res.json({ items, max: plan.maxCatalog, plan: plan.name });
}));

router.post('/', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId, plan } = miPerfil(req);
  const data = itemSchema.parse(req.body);
  if (!plan.maxCatalog) throw new AppError(`El plan ${plan.name} no incluye catálogo. Mejora tu plan para usarlo.`, 403);
  assertImagen(data.image, req.user!.id);

  const id = uuidv4();
  db.transaction(() => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM catalog_items WHERE provider_id = ?').get(providerId) as { n: number };
    if (n >= plan.maxCatalog) throw new AppError(`Tu plan ${plan.name} permite ${plan.maxCatalog} artículos en el catálogo.`, 403);
    db.prepare(`INSERT INTO catalog_items (id, provider_id, name, description, price, price_type, price_currency, image, section, available, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, providerId, data.name, limpiar(data.description), data.price_type === 'ask' ? null : data.price, data.price_type,
        data.price_currency, data.image || null, limpiar(data.section), data.available ? 1 : 0, new Date().toISOString());
  })();
  res.status(201).json({ item: aItem(db.prepare(`SELECT ${COLUMNAS} FROM catalog_items ci WHERE id = ?`).get(id) as { available: number }) });
}));

function itemPropio(req: AuthRequest) {
  const { id: providerId, plan } = miPerfil(req);
  const item = db.prepare('SELECT id, image FROM catalog_items WHERE id = ? AND provider_id = ?').get(req.params.id, providerId) as { id: string; image: string | null } | undefined;
  if (!item) throw new AppError('Artículo no encontrado', 404);
  return { item, plan, providerId };
}

router.put('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { item, plan } = itemPropio(req);
  if (!plan.maxCatalog) throw new AppError(`El plan ${plan.name} no incluye catálogo. Mejora tu plan para usarlo.`, 403);
  const data = itemSchema.parse(req.body);
  assertImagen(data.image, req.user!.id, item.image);
  db.prepare(`UPDATE catalog_items SET name = ?, description = ?, price = ?, price_type = ?, price_currency = ?, image = ?, section = ?, available = ?, updated_at = ?
    WHERE id = ?`)
    .run(data.name, limpiar(data.description), data.price_type === 'ask' ? null : data.price, data.price_type, data.price_currency,
      data.image || null, limpiar(data.section), data.available ? 1 : 0, new Date().toISOString(), item.id);
  if (item.image !== (data.image || null)) borrarSiHuerfana(item.image);
  res.json({ item: aItem(db.prepare(`SELECT ${COLUMNAS} FROM catalog_items ci WHERE id = ?`).get(item.id) as { available: number }) });
}));

// Agotado / disponible con un toque (no exige plan: es solo marcar).
router.patch('/:id/available', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { item } = itemPropio(req);
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  db.prepare('UPDATE catalog_items SET available = ?, updated_at = ? WHERE id = ?').run(available ? 1 : 0, new Date().toISOString(), item.id);
  res.json({ ok: true, available });
}));

router.delete('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { item, providerId } = itemPropio(req);
  db.prepare('DELETE FROM catalog_items WHERE id = ?').run(item.id);
  borrarSiHuerfana(item.image);
  // Borrar deja hueco en el límite: un artículo oculto por el plan puede volver a verse.
  enforcePlanLimit(providerId);
  res.json({ ok: true });
}));

export default router;
