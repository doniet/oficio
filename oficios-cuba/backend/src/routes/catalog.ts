import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { CON_CATALOGO_SQL, enforcePlanLimit, planDelPerfil, PLAN_WEIGHT_SQL, providerProfileIdFor } from '../db/index.js';
import { q, qOne, tx } from '../db/acceso.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { imagenPermitida, queryTextos } from '../lib/entrada.js';
import { consultaSQL, termino } from '../lib/buscador.js';
import { borrarSiHuerfana } from './uploads.js';

const router = Router();

// Catálogo de productos o servicios (Básico 50, Profesional 1000). Lo público solo muestra
// artículos dentro del límite del plan actual (hidden_by_plan = false) de perfiles con catálogo.
const POR_PAGINA = 24;
const CON_CATALOGO = `pp.is_active = true AND ${CON_CATALOGO_SQL}`;

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
// available ya es boolean (columna boolean, no INTEGER 0/1): nada que convertir al leer.
const aItem = <T extends { available: boolean }>(r: T) => r;

function limpiar(texto: string | null | undefined) {
  return texto && texto.trim() ? texto.trim() : null;
}

async function miPerfil(req: AuthRequest) {
  const id = await providerProfileIdFor(req.user!.id);
  if (!id) throw new AppError('Perfil de proveedor no encontrado', 404);
  return { id, plan: await planDelPerfil(id) };
}

// imagenPermitida consulta la base y es async: sin await la validación se salta en silencio
// (!Promise es siempre false) y el typecheck no avisa (strict:false).
async function assertImagen(url: string | null | undefined, userId: string, anterior?: string | null) {
  if (url && !(await imagenPermitida(url, userId, anterior ? [anterior] : []))) throw new AppError('Imagen no válida', 400);
}

// ── Público ─────────────────────────────────────────────────────────────────────────────────────

router.get('/provider/:providerId', asyncHandler(async (req, res) => {
  const { q: texto, section } = queryTextos(req.query, ['q', 'section'] as const);
  const page = Math.max(1, Number(req.query.page) || 1);
  const base = `FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id WHERE ci.provider_id = $1 AND ${CON_CATALOGO}`;
  let where = '';
  const params: unknown[] = [req.params.providerId];
  if (section) { params.push(section); where += ` AND ci.section = $${params.length}`; }
  const t1 = termino(texto, 'ci.busca', params.length + 1);
  if (t1) { where += ` AND ${t1.sql}`; params.push(...t1.params); }

  const total = Number((await qOne<{ n: string }>(`SELECT COUNT(*) AS n ${base} ${where}`, params))!.n);
  const limitParams = [...params, POR_PAGINA, (page - 1) * POR_PAGINA];
  const items = (await q<{ available: boolean } & Record<string, unknown>>(`SELECT ${COLUMNAS} ${base} ${where}
    ORDER BY ci.available DESC, COALESCE(ci.section, '~'), lower(ci.name) LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}`, limitParams))
    .map(aItem);
  // Esta consulta reusa la misma base que el total (solo provider_id, sin los filtros de
  // section/q), tal como el original: las secciones que se listan son las del catálogo entero.
  const sections = (await q<{ name: string; count: string }>(
    `SELECT ci.section AS name, COUNT(*) AS count ${base} AND ci.section IS NOT NULL GROUP BY ci.section ORDER BY lower(ci.section)`,
    [req.params.providerId],
  )).map((s) => ({ name: s.name, count: Number(s.count) }));
  const totalAll = Number((await qOne<{ n: string }>(`SELECT COUNT(*) AS n ${base}`, [req.params.providerId]))!.n);
  res.json({ items, sections, total, total_all: totalAll, page, pages: Math.max(1, Math.ceil(total / POR_PAGINA)) });
}));

// Búsqueda general de productos (/buscar → pestaña Productos). Para que un catálogo de 1000
// artículos no llene la página, se intercalan: primero el mejor artículo de cada profesional,
// luego el segundo de cada uno, etc.
router.get('/search', asyncHandler(async (req, res) => {
  const { q: texto, province_id, municipality_id } = queryTextos(req.query, ['q', 'province_id', 'municipality_id'] as const);
  const page = Math.max(1, Number(req.query.page) || 1);
  let where = `WHERE ${CON_CATALOGO} AND ci.available = true`;
  const params: unknown[] = [];
  let coincide = '0';
  const idxTermino = params.length + 1;
  const t = termino(texto, 'ci.busca', idxTermino);
  if (t) {
    // El nombre del negocio también es un término válido (igual que en services.ts): se
    // reusa el mismo parámetro $idxTermino contra las dos columnas, no se repite el valor.
    where += ` AND (${t.sql} OR pp.busca @@ ${consultaSQL(idxTermino)})`;
    params.push(...t.params);
    coincide = `ts_rank(ci.busca, ${consultaSQL(idxTermino)})`;
  }
  if (province_id) { params.push(province_id); where += ` AND pp.province_id = $${params.length}`; }
  if (municipality_id) {
    params.push(municipality_id, municipality_id);
    const n = params.length;
    where += ` AND (pp.municipality_id = $${n - 1} OR EXISTS (SELECT 1 FROM service_areas sa WHERE sa.provider_id = pp.id AND sa.municipality_id = $${n}))`;
  }
  const joins = `FROM catalog_items ci
    JOIN provider_profiles pp ON ci.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id`;

  const total = Number((await qOne<{ n: string }>(`SELECT COUNT(*) AS n ${joins} ${where}`, params))!.n);
  const limitParams = [...params, POR_PAGINA, (page - 1) * POR_PAGINA];
  const items = (await q<({ available: boolean; peso?: number; coincide?: number; turno?: number } & Record<string, unknown>)>(`
    SELECT * FROM (
      SELECT ${COLUMNAS}, pp.id AS provider_id, COALESCE(pp.business_name, u.full_name) AS provider_name, u.avatar_url AS provider_avatar,
        pp.subscription_plan, pp.contact_mode, pp.whatsapp, p.name AS province_name, m.name AS municipality_name,
        ${PLAN_WEIGHT_SQL} AS peso, ${coincide} AS coincide,
        -- ci.image IS NULL da boolean; Postgres ordena false antes que true en ASC (al revés que
        -- el 0/1 de SQLite si se leyera como entero) — ASC explícito para que el intercalado no
        -- cambie de orden.
        ROW_NUMBER() OVER (PARTITION BY ci.provider_id ORDER BY ${coincide} DESC, ci.image IS NULL ASC, ci.created_at DESC) AS turno
      ${joins} ${where}
    ) x ORDER BY turno, peso DESC, coincide DESC, created_at DESC LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}
  `, limitParams))
    .map(({ peso: _p, coincide: _c, turno: _t, ...r }) => aItem(r as { available: boolean } & Record<string, unknown>));
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / POR_PAGINA)) });
}));

// ── Profesional ─────────────────────────────────────────────────────────────────────────────────

router.get('/mine', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id, plan } = await miPerfil(req);
  const items = (await q<{ available: boolean; hidden_by_plan: boolean } & Record<string, unknown>>(`SELECT ${COLUMNAS}, ci.hidden_by_plan FROM catalog_items ci WHERE ci.provider_id = $1
    ORDER BY COALESCE(ci.section, '~'), lower(ci.name)`, [id]))
    .map(aItem);
  res.json({ items, max: plan.maxCatalog, plan: plan.name });
}));

router.post('/', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId, plan } = await miPerfil(req);
  const data = itemSchema.parse(req.body);
  if (!plan.maxCatalog) throw new AppError(`El plan ${plan.name} no incluye catálogo. Mejora tu plan para usarlo.`, 403);
  await assertImagen(data.image, req.user!.id);

  const id = uuidv4();
  // Contar y crear van en la misma transacción, consultando solo con `c`: dos peticiones a la
  // vez no deben poder colarse las dos por encima del tope del plan.
  await tx(async (c) => {
    const count = Number((await c.qOne<{ n: string }>('SELECT COUNT(*) AS n FROM catalog_items WHERE provider_id = $1', [providerId]))!.n);
    if (count >= plan.maxCatalog) throw new AppError(`Tu plan ${plan.name} permite ${plan.maxCatalog} artículos en el catálogo.`, 403);
    await c.q(`INSERT INTO catalog_items (id, provider_id, name, description, price, price_type, price_currency, image, section, available, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, providerId, data.name, limpiar(data.description), data.price_type === 'ask' ? null : data.price, data.price_type,
        data.price_currency, data.image || null, limpiar(data.section), data.available, new Date().toISOString()]);
  });
  res.status(201).json({ item: aItem((await qOne<{ available: boolean } & Record<string, unknown>>(`SELECT ${COLUMNAS} FROM catalog_items ci WHERE id = $1`, [id]))!) });
}));

async function itemPropio(req: AuthRequest) {
  const { id: providerId, plan } = await miPerfil(req);
  const item = await qOne<{ id: string; image: string | null }>('SELECT id, image FROM catalog_items WHERE id = $1 AND provider_id = $2', [req.params.id, providerId]);
  if (!item) throw new AppError('Artículo no encontrado', 404);
  return { item, plan, providerId };
}

router.put('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { item, plan } = await itemPropio(req);
  if (!plan.maxCatalog) throw new AppError(`El plan ${plan.name} no incluye catálogo. Mejora tu plan para usarlo.`, 403);
  const data = itemSchema.parse(req.body);
  await assertImagen(data.image, req.user!.id, item.image);
  await q(`UPDATE catalog_items SET name = $1, description = $2, price = $3, price_type = $4, price_currency = $5, image = $6, section = $7, available = $8, updated_at = $9
    WHERE id = $10`,
    [data.name, limpiar(data.description), data.price_type === 'ask' ? null : data.price, data.price_type, data.price_currency,
      data.image || null, limpiar(data.section), data.available, new Date().toISOString(), item.id]);
  if (item.image !== (data.image || null)) await borrarSiHuerfana(item.image);
  res.json({ item: aItem((await qOne<{ available: boolean } & Record<string, unknown>>(`SELECT ${COLUMNAS} FROM catalog_items ci WHERE id = $1`, [item.id]))!) });
}));

// Agotado / disponible con un toque (no exige plan: es solo marcar).
router.patch('/:id/available', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { item } = await itemPropio(req);
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  await q('UPDATE catalog_items SET available = $1, updated_at = $2 WHERE id = $3', [available, new Date().toISOString(), item.id]);
  res.json({ ok: true, available });
}));

router.delete('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { item, providerId } = await itemPropio(req);
  await q('DELETE FROM catalog_items WHERE id = $1', [item.id]);
  await borrarSiHuerfana(item.image);
  // Borrar deja hueco en el límite: un artículo oculto por el plan puede volver a verse.
  await enforcePlanLimit(providerId);
  res.json({ ok: true });
}));

export default router;
