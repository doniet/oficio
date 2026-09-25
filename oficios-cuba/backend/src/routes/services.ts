import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { parseImages, PLAN_WEIGHT_SQL, providerProfileIdFor, refreshProviderRating } from '../db/index.js';
import { imagenPermitida, queryTextos } from '../lib/entrada.js';
import { authMiddleware, AuthRequest, optionalAuth, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { planDe, TASA_CUP_USD } from '../config.js';

const router = Router();

const imageUrl = z.string().max(500);

const optionalNumber = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.number().min(0).max(1_000_000).optional());

const serviceSchema = z.object({
  category_id: z.string().uuid('Elige una categoría'),
  title: z.string().trim().min(5, 'El título debe tener al menos 5 caracteres').max(100),
  description: z.string().trim().max(3000).optional(),
  price_min: optionalNumber,
  price_max: optionalNumber,
  price_type: z.enum(['fixed', 'hourly', 'daily', 'negotiable']).default('negotiable'),
  price_currency: z.enum(['CUP', 'USD']).default('CUP'),
  images: z.array(imageUrl).max(6, 'Máximo 6 fotos').optional(),
});

const LIST_COLUMNS = `
  s.id, s.title, s.description, s.price_min, s.price_max, s.price_type, s.price_currency, s.images, s.is_active, s.created_at,
  s.category_id, c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug,
  parent.name AS parent_category_name, parent.slug AS parent_category_slug,
  pp.id AS provider_id, pp.business_name, pp.rating, pp.review_count, pp.subscription_plan, pp.kind, pp.contact_mode,
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
// Con un plan sin fotos (Gratis) las que quedaron de un plan anterior no se muestran.
function fotosVisibles(row: { images: string | null; subscription_plan: string }) {
  return planDe(row.subscription_plan).maxPhotos ? parseImages(row.images) : [];
}

function toListItem(row: any) {
  const images = fotosVisibles(row);
  const { images: _omit, ...rest } = row;
  const plan = planDe(row.subscription_plan);
  return {
    ...rest, subscription_plan: row.subscription_plan === 'premium' ? 'pro' : row.subscription_plan,
    kind: plan.negocio ? row.kind : 'oficio', has_chat: plan.chat, has_agenda: plan.agenda,
    cover: images[0] ?? null, image_count: images.length, is_active: Boolean(row.is_active),
  };
}

const PRECIO_CUP = (col: string) => `(CASE WHEN s.price_currency = 'USD' THEN ${col} * ${Number(TASA_CUP_USD)} ELSE ${col} END)`;

router.get('/', asyncHandler(async (req, res) => {
  const { provider_id, category, category_id, province_id, municipality_id, q, price_max, price_type, sort = 'relevance' } =
    queryTextos(req.query, ['provider_id', 'category', 'category_id', 'province_id', 'municipality_id', 'q', 'price_max', 'price_type', 'sort'] as const);
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
    // El filtro va en CUP; los precios en USD se convierten con la tasa de respaldo (aproximado).
    where += ` AND (s.price_min IS NULL OR ${PRECIO_CUP('s.price_min')} <= ?)`;
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
    price_asc: `CASE WHEN s.price_min IS NULL THEN 1 ELSE 0 END, ${PRECIO_CUP('s.price_min')} ASC`,
    price_desc: `${PRECIO_CUP('COALESCE(s.price_max, s.price_min, 0)')} DESC`,
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
  const plan = (db.prepare('SELECT subscription_plan FROM provider_profiles WHERE id = ?').get(providerId) as { subscription_plan: string }).subscription_plan;
  const limites = planDe(plan);
  // El dueño ve sus fotos aunque su plan ya no las muestre.
  const services = rows.map((r: any) => ({ ...toListItem({ ...r, subscription_plan: 'pro' }), subscription_plan: plan }));
  res.json({ services, plan, max_services: limites.maxServices, photos_allowed: limites.maxPhotos > 0 });
}));

router.get('/:id', optionalAuth, asyncHandler(async (req: AuthRequest, res) => {
  const service = db.prepare(`
    SELECT s.*, c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug, c.parent_id AS category_parent_id,
      parent.name AS parent_category_name, parent.slug AS parent_category_slug,
      pp.id AS provider_id, pp.user_id AS provider_user_id, pp.business_name, pp.description AS provider_description,
      pp.province_id, pp.municipality_id, pp.address, pp.whatsapp, pp.telegram, pp.email_contact,
      pp.years_experience, pp.rating, pp.review_count, pp.subscription_plan, pp.is_active AS provider_active,
      pp.kind, pp.contact_mode, pp.horario,
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
  const plan = planDe(service.subscription_plan);
  res.json({
    service: {
      ...publicService, subscription_plan: service.subscription_plan === 'premium' ? 'pro' : service.subscription_plan,
      kind: plan.negocio ? service.kind : 'oficio', horario: plan.negocio ? service.horario : null,
      has_chat: plan.chat, has_agenda: plan.agenda,
      images: isOwner ? parseImages(service.images) : fotosVisibles(service), is_active: Boolean(service.is_active), is_owner: Boolean(isOwner),
    },
    reviews,
    related: related.map(toListItem),
  });
}));

function assertImages(images: string[] | undefined, userId: string, subscriptionPlan: string, yaGuardadas: string[] = []) {
  const plan = planDe(subscriptionPlan);
  const nuevas = (images ?? []).filter((url) => !yaGuardadas.includes(url));
  if (!plan.maxPhotos && nuevas.length) throw new AppError(`El plan ${plan.name} no incluye fotos. Mejora tu plan para subirlas.`, 403);
  if (images?.some((url) => !imagenPermitida(url, userId, yaGuardadas))) {
    throw new AppError('Alguna foto no es válida: súbela desde el formulario', 400);
  }
}

function assertPriceRange(data: { price_min?: number; price_max?: number }) {
  if (data.price_min != null && data.price_max != null && data.price_max < data.price_min) {
    throw new AppError('El precio máximo no puede ser menor que el mínimo', 400);
  }
}

router.post('/', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id, subscription_plan FROM provider_profiles WHERE user_id = ?').get(req.user!.id) as { id: string; subscription_plan: string } | undefined;
  if (!provider) throw new AppError('Debes completar tu perfil de proveedor primero', 400);

  const data = serviceSchema.parse(req.body);
  assertPriceRange(data);
  assertImages(data.images, req.user!.id, provider.subscription_plan);
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(data.category_id)) throw new AppError('Categoría no válida', 400);

  const { maxServices: max, name: planName } = planDe(provider.subscription_plan);
  if (max !== null) {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM services WHERE provider_id = ?').get(provider.id) as { count: number };
    if (count >= max) {
      throw new AppError(`Tu plan ${planName} permite ${max} oficio${max === 1 ? '' : 's'}. Mejora tu plan para publicar más.`, 403);
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO services (id, provider_id, category_id, title, description, price_min, price_max, price_type, price_currency, images, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, provider.id, data.category_id, data.title, data.description || null,
    data.price_type === 'negotiable' ? null : data.price_min ?? null,
    data.price_type === 'negotiable' ? null : data.price_max ?? null,
    data.price_type, data.price_currency, JSON.stringify(data.images ?? []), new Date().toISOString());

  res.status(201).json({ service: { id } });
}));

function ownedService(req: AuthRequest) {
  const providerId = providerProfileIdFor(req.user!.id);
  if (!providerId) throw new AppError('Perfil de proveedor no encontrado', 404);
  const service = db.prepare(`SELECT s.id, s.provider_id, s.is_active, s.images, pp.subscription_plan FROM services s
    JOIN provider_profiles pp ON s.provider_id = pp.id WHERE s.id = ? AND s.provider_id = ?`).get(req.params.id, providerId);
  if (!service) throw new AppError('Servicio no encontrado', 404);
  return service as { id: string; provider_id: string; is_active: number; images: string | null; subscription_plan: string };
}

router.put('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const current = ownedService(req);
  const data = serviceSchema.parse(req.body);
  assertPriceRange(data);
  assertImages(data.images, req.user!.id, current.subscription_plan, parseImages(current.images));
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(data.category_id)) throw new AppError('Categoría no válida', 400);

  const negotiable = data.price_type === 'negotiable';
  db.prepare(`
    UPDATE services SET category_id = ?, title = ?, description = ?, price_min = ?, price_max = ?, price_type = ?, price_currency = ?, images = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(data.category_id, data.title, data.description || null,
    negotiable ? null : data.price_min ?? null, negotiable ? null : data.price_max ?? null,
    data.price_type, data.price_currency, JSON.stringify(data.images ?? []), req.params.id);

  res.json({ service: { id: req.params.id } });
}));

router.delete('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const service = ownedService(req);
  // Las reseñas del servicio se quedan (service_id pasa a NULL) y siguen contando para el proveedor.
  db.transaction(() => {
    db.prepare('DELETE FROM services WHERE id = ?').run(service.id);
    refreshProviderRating(service.provider_id);
  })();
  res.json({ message: 'Servicio eliminado' });
}));

router.patch('/:id/toggle', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const service = ownedService(req);
  const next = service.is_active ? 0 : 1;
  if (next === 1) {
    const { maxServices: max, name: planName } = planDe(service.subscription_plan);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM services WHERE provider_id = ? AND is_active = 1').get(service.provider_id) as { count: number };
    if (max !== null && count >= max) {
      throw new AppError(`Tu plan ${planName} permite ${max} oficio${max === 1 ? '' : 's'} activo${max === 1 ? '' : 's'}. Pausa otro o mejora tu plan.`, 403);
    }
  }
  db.prepare('UPDATE services SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(next, service.id);
  res.json({ is_active: Boolean(next) });
}));

export default router;
