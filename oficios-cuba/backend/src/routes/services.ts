import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { parseImages, PLAN_WEIGHT_SQL, providerProfileIdFor } from '../db/index.js';
import { authMiddleware, AuthRequest, optionalAuth, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { PLANS, PlanId } from '../config.js';

const router = Router();

const imageUrl = z.string().max(500).refine(
  (v) => v.startsWith('/api/uploads/') || v.startsWith('/demo/') || /^https:\/\/[^\s]+$/.test(v),
  'URL de imagen no válida',
);

const optionalNumber = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.number().min(0).max(1_000_000).optional());

const serviceSchema = z.object({
  category_id: z.string().uuid('Elige una categoría'),
  title: z.string().trim().min(5, 'El título debe tener al menos 5 caracteres').max(100),
  description: z.string().trim().max(3000).optional(),
  price_min: optionalNumber,
  price_max: optionalNumber,
  price_type: z.enum(['fixed', 'hourly', 'daily', 'negotiable']).default('negotiable'),
  images: z.array(imageUrl).max(6, 'Máximo 6 fotos').optional(),
});

const LIST_COLUMNS = `
  s.id, s.title, s.description, s.price_min, s.price_max, s.price_type, s.images, s.is_active, s.created_at,
  s.category_id, c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug,
  parent.name AS parent_category_name, parent.slug AS parent_category_slug,
  pp.id AS provider_id, pp.business_name, pp.rating, pp.review_count, pp.subscription_plan,
  u.full_name AS owner_name, u.avatar_url,
  p.name AS province_name, m.name AS municipality_name
`;

const LIST_JOINS = `
  FROM services s
  JOIN categories c ON s.category_id = c.id
  LEFT JOIN categories parent ON c.parent_id = parent.id
  JOIN provider_profiles pp ON s.provider_id = pp.id
  JOIN users u ON pp.user_id = u.id
  LEFT JOIN provinces p ON pp.province_id = p.id
  LEFT JOIN municipalities m ON pp.municipality_id = m.id
`;

// Los listados solo necesitan la portada; las fotos completas van en el detalle.
function toListItem(row: any) {
  const images = parseImages(row.images);
  const { images: _omit, ...rest } = row;
  return { ...rest, cover: images[0] ?? null, image_count: images.length, is_active: Boolean(row.is_active) };
}

router.get('/', asyncHandler(async (req, res) => {
  const { provider_id, category, category_id, province_id, municipality_id, q, price_max, price_type, sort = 'relevance' } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));

  let where = 'WHERE s.is_active = 1 AND pp.is_active = 1';
  const params: unknown[] = [];

  if (provider_id) { where += ' AND s.provider_id = ?'; params.push(provider_id); }

  const categoryKey = category || category_id;
  if (categoryKey) {
    where += ` AND s.category_id IN (
      SELECT id FROM categories WHERE id = ? OR slug = ?
      UNION SELECT id FROM categories WHERE parent_id IN (SELECT id FROM categories WHERE id = ? OR slug = ?))`;
    params.push(categoryKey, categoryKey, categoryKey, categoryKey);
  }
  if (province_id) { where += ' AND pp.province_id = ?'; params.push(province_id); }
  if (municipality_id) {
    where += ' AND (pp.municipality_id = ? OR EXISTS (SELECT 1 FROM service_areas sa WHERE sa.provider_id = pp.id AND sa.municipality_id = ?))';
    params.push(municipality_id, municipality_id);
  }
  if (price_max && Number(price_max) > 0) {
    where += ' AND (s.price_min IS NULL OR s.price_min <= ?)';
    params.push(Number(price_max));
  }
  if (price_type) { where += ' AND s.price_type = ?'; params.push(price_type); }
  if (q && q.trim()) {
    where += ' AND (s.title LIKE ? OR s.description LIKE ? OR c.name LIKE ? OR parent.name LIKE ? OR pp.business_name LIKE ?)';
    const term = `%${q.trim()}%`;
    params.push(term, term, term, term, term);
  }

  const orders: Record<string, string> = {
    relevance: `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, s.created_at DESC`,
    rating: 'pp.rating DESC, pp.review_count DESC',
    price_asc: 'CASE WHEN s.price_min IS NULL THEN 1 ELSE 0 END, s.price_min ASC',
    price_desc: 'COALESCE(s.price_max, s.price_min, 0) DESC',
    newest: 's.created_at DESC',
  };
  const orderBy = orders[sort] ?? orders.relevance;

  const total = (db.prepare(`SELECT COUNT(*) AS count ${LIST_JOINS} ${where}`).get(...params) as { count: number }).count;
  const rows = db.prepare(`SELECT ${LIST_COLUMNS} ${LIST_JOINS} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);

  res.json({
    services: rows.map(toListItem),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}));

router.get('/mine', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = providerProfileIdFor(req.user!.id);
  if (!providerId) throw new AppError('Perfil de proveedor no encontrado', 404);
  const rows = db.prepare(`SELECT ${LIST_COLUMNS} ${LIST_JOINS} WHERE s.provider_id = ? ORDER BY s.is_active DESC, s.created_at DESC`).all(providerId);
  const plan = (db.prepare('SELECT subscription_plan FROM provider_profiles WHERE id = ?').get(providerId) as { subscription_plan: PlanId }).subscription_plan;
  res.json({ services: rows.map(toListItem), plan, max_services: PLANS[plan].maxServices });
}));

router.get('/:id', optionalAuth, asyncHandler(async (req: AuthRequest, res) => {
  const service = db.prepare(`
    SELECT s.*, c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug, c.parent_id AS category_parent_id,
      parent.name AS parent_category_name, parent.slug AS parent_category_slug,
      pp.id AS provider_id, pp.user_id AS provider_user_id, pp.business_name, pp.description AS provider_description,
      pp.province_id, pp.municipality_id, pp.address, pp.lat, pp.lng, pp.whatsapp, pp.telegram, pp.email_contact,
      pp.years_experience, pp.rating, pp.review_count, pp.subscription_plan, pp.is_active AS provider_active,
      p.name AS province_name, m.name AS municipality_name,
      u.full_name AS owner_name, u.avatar_url
    FROM services s
    JOIN categories c ON s.category_id = c.id
    LEFT JOIN categories parent ON c.parent_id = parent.id
    JOIN provider_profiles pp ON s.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE s.id = ?
  `).get(req.params.id);

  const isOwner = service && req.user?.id === service.provider_user_id;
  if (!service || (!isOwner && (!service.is_active || !service.provider_active))) {
    throw new AppError('Servicio no encontrado', 404);
  }

  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS client_name, u.avatar_url AS client_avatar
    FROM reviews r JOIN users u ON r.client_id = u.id
    WHERE r.service_id = ? ORDER BY r.created_at DESC LIMIT 20
  `).all(req.params.id);

  const related = db.prepare(`
    SELECT ${LIST_COLUMNS} ${LIST_JOINS}
    WHERE s.is_active = 1 AND pp.is_active = 1 AND s.id != ? AND pp.id != ? AND (s.category_id = ? OR c.parent_id = ?)
    ORDER BY ${PLAN_WEIGHT_SQL} DESC, pp.rating DESC LIMIT 4
  `).all(service.id, service.provider_id, service.category_id, service.category_parent_id ?? service.category_id);

  const { provider_user_id: _u, provider_active: _a, category_parent_id: _c, ...publicService } = service;
  res.json({
    service: { ...publicService, images: parseImages(service.images), is_active: Boolean(service.is_active), is_owner: Boolean(isOwner) },
    reviews,
    related: related.map(toListItem),
  });
}));

function assertPriceRange(data: { price_min?: number; price_max?: number }) {
  if (data.price_min != null && data.price_max != null && data.price_max < data.price_min) {
    throw new AppError('El precio máximo no puede ser menor que el mínimo', 400);
  }
}

router.post('/', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id, subscription_plan FROM provider_profiles WHERE user_id = ?').get(req.user!.id) as { id: string; subscription_plan: PlanId } | undefined;
  if (!provider) throw new AppError('Debes completar tu perfil de proveedor primero', 400);

  const data = serviceSchema.parse(req.body);
  assertPriceRange(data);
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(data.category_id)) throw new AppError('Categoría no válida', 400);

  const max = PLANS[provider.subscription_plan].maxServices;
  if (max !== null) {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM services WHERE provider_id = ?').get(provider.id) as { count: number };
    if (count >= max) {
      throw new AppError(`Tu plan ${PLANS[provider.subscription_plan].name} permite ${max} servicio${max === 1 ? '' : 's'}. Mejora tu plan para publicar más.`, 403);
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO services (id, provider_id, category_id, title, description, price_min, price_max, price_type, images, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, provider.id, data.category_id, data.title, data.description || null,
    data.price_type === 'negotiable' ? null : data.price_min ?? null,
    data.price_type === 'negotiable' ? null : data.price_max ?? null,
    data.price_type, JSON.stringify(data.images ?? []), new Date().toISOString());

  res.status(201).json({ service: { id } });
}));

function ownedService(req: AuthRequest) {
  const providerId = providerProfileIdFor(req.user!.id);
  if (!providerId) throw new AppError('Perfil de proveedor no encontrado', 404);
  const service = db.prepare('SELECT id, is_active FROM services WHERE id = ? AND provider_id = ?').get(req.params.id, providerId);
  if (!service) throw new AppError('Servicio no encontrado', 404);
  return service as { id: string; is_active: number };
}

router.put('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  ownedService(req);
  const data = serviceSchema.parse(req.body);
  assertPriceRange(data);
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(data.category_id)) throw new AppError('Categoría no válida', 400);

  const negotiable = data.price_type === 'negotiable';
  db.prepare(`
    UPDATE services SET category_id = ?, title = ?, description = ?, price_min = ?, price_max = ?, price_type = ?, images = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(data.category_id, data.title, data.description || null,
    negotiable ? null : data.price_min ?? null, negotiable ? null : data.price_max ?? null,
    data.price_type, JSON.stringify(data.images ?? []), req.params.id);

  res.json({ service: { id: req.params.id } });
}));

router.delete('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  ownedService(req);
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ message: 'Servicio eliminado' });
}));

router.patch('/:id/toggle', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const service = ownedService(req);
  const next = service.is_active ? 0 : 1;
  db.prepare('UPDATE services SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(next, service.id);
  res.json({ is_active: Boolean(next) });
}));

export default router;
