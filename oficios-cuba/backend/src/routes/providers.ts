import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { parseImages, PLAN_WEIGHT_SQL } from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const providerProfileSchema = z.object({
  business_name: z.preprocess(blankToUndefined, z.string().trim().min(2, 'El nombre del negocio es muy corto').max(80).optional()),
  description: optionalText(2000),
  province_id: z.string().uuid('Elige una provincia'),
  municipality_id: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  address: optionalText(200),
  lat: z.number().min(19).max(24).optional(),
  lng: z.number().min(-85.5).max(-73.5).optional(),
  whatsapp: z.preprocess(blankToUndefined, z.string().trim().regex(/^\+?[\d\s-]{8,20}$/, 'WhatsApp no válido').optional()),
  telegram: optionalText(40),
  email_contact: z.preprocess(blankToUndefined, z.string().trim().email('Email de contacto no válido').optional()),
  years_experience: z.number().int().min(0).max(70).optional(),
  service_area_ids: z.array(z.string().uuid()).max(60).optional(),
});

const PUBLIC_COLUMNS = `
  pp.id, pp.business_name, pp.description, pp.province_id, pp.municipality_id, pp.years_experience,
  pp.rating, pp.review_count, pp.subscription_plan, pp.created_at,
  p.name AS province_name, m.name AS municipality_name,
  u.full_name AS owner_name, u.avatar_url,
  (SELECT COUNT(*) FROM services s WHERE s.provider_id = pp.id AND s.is_active = 1) AS service_count,
  (SELECT json_group_array(name) FROM (
     SELECT DISTINCT COALESCE(parent.name, c.name) AS name FROM services s
     JOIN categories c ON s.category_id = c.id LEFT JOIN categories parent ON c.parent_id = parent.id
     WHERE s.provider_id = pp.id AND s.is_active = 1 LIMIT 3)) AS categories,
  (SELECT s.images FROM services s WHERE s.provider_id = pp.id AND s.is_active = 1 AND s.images NOT IN ('[]', '') ORDER BY s.created_at LIMIT 1) AS cover_images
`;

const PUBLIC_JOINS = `
  FROM provider_profiles pp
  JOIN users u ON pp.user_id = u.id
  LEFT JOIN provinces p ON pp.province_id = p.id
  LEFT JOIN municipalities m ON pp.municipality_id = m.id
`;

function toCard(row: any) {
  const { cover_images, categories, ...rest } = row;
  let cats: string[] = [];
  try { cats = JSON.parse(categories || '[]'); } catch { cats = []; }
  return { ...rest, categories: cats, cover: parseImages(cover_images)[0] ?? null };
}

router.get('/', asyncHandler(async (req, res) => {
  const { province_id, category, q, sort = 'relevance' } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));

  let where = 'WHERE pp.is_active = 1 AND pp.business_name IS NOT NULL';
  const params: unknown[] = [];
  if (province_id) { where += ' AND pp.province_id = ?'; params.push(province_id); }
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

  const orders: Record<string, string> = {
    relevance: `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC`,
    rating: 'pp.rating DESC, pp.review_count DESC',
    reviews: 'pp.review_count DESC',
    newest: 'pp.created_at DESC',
  };

  const total = (db.prepare(`SELECT COUNT(*) AS count ${PUBLIC_JOINS} ${where}`).get(...params) as { count: number }).count;
  const rows = db.prepare(`SELECT ${PUBLIC_COLUMNS} ${PUBLIC_JOINS} ${where} ORDER BY ${orders[sort] ?? orders.relevance} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);

  res.json({ providers: rows.map(toCard), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.get('/featured', asyncHandler(async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 6));
  const rows = db.prepare(`
    SELECT ${PUBLIC_COLUMNS} ${PUBLIC_JOINS}
    WHERE pp.is_active = 1 AND pp.business_name IS NOT NULL
      AND EXISTS (SELECT 1 FROM services s WHERE s.provider_id = pp.id AND s.is_active = 1)
    ORDER BY ${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC
    LIMIT ?
  `).all(limit);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ providers: rows.map(toCard) });
}));

function serviceAreasOf(providerId: string) {
  return db.prepare(`
    SELECT sa.id, sa.municipality_id, m.name AS municipality_name, p.name AS province_name
    FROM service_areas sa
    JOIN municipalities m ON sa.municipality_id = m.id
    JOIN provinces p ON m.province_id = p.id
    WHERE sa.provider_id = ? ORDER BY m.name
  `).all(providerId);
}

router.get('/me/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare(`
    SELECT pp.*, p.name AS province_name, m.name AS municipality_name, u.full_name AS owner_name, u.avatar_url
    FROM provider_profiles pp
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE pp.user_id = ?
  `).get(req.user!.id);
  if (!provider) throw new AppError('Perfil de proveedor no encontrado', 404);
  res.json({ provider, serviceAreas: serviceAreasOf(provider.id) });
}));

router.put('/me/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const data = providerProfileSchema.parse(req.body);
  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id) as { id: string } | undefined;
  if (!provider) throw new AppError('Perfil de proveedor no encontrado', 404);

  if (data.municipality_id) {
    const ok = db.prepare('SELECT 1 FROM municipalities WHERE id = ? AND province_id = ?').get(data.municipality_id, data.province_id);
    if (!ok) throw new AppError('El municipio no pertenece a la provincia elegida', 400);
  }

  // Formulario completo: los campos vacíos se guardan como NULL para poder borrarlos.
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE provider_profiles SET business_name = ?, description = ?, province_id = ?, municipality_id = ?, address = ?,
        lat = COALESCE(?, lat), lng = COALESCE(?, lng), whatsapp = ?, telegram = ?, email_contact = ?, years_experience = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.business_name ?? null, data.description ?? null, data.province_id, data.municipality_id ?? null, data.address ?? null,
      data.lat ?? null, data.lng ?? null, data.whatsapp ?? null, data.telegram ?? null, data.email_contact ?? null,
      data.years_experience ?? 0, provider.id);

    if (data.service_area_ids) {
      db.prepare('DELETE FROM service_areas WHERE provider_id = ?').run(provider.id);
      const insert = db.prepare('INSERT OR IGNORE INTO service_areas (id, provider_id, municipality_id) VALUES (?, ?, ?)');
      for (const muniId of data.service_area_ids) insert.run(uuidv4(), provider.id, muniId);
    }
  });
  tx();

  const updated = db.prepare(`
    SELECT pp.*, p.name AS province_name, m.name AS municipality_name
    FROM provider_profiles pp
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE pp.id = ?
  `).get(provider.id);
  res.json({ provider: updated, serviceAreas: serviceAreasOf(provider.id) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const provider = db.prepare(`
    SELECT ${PUBLIC_COLUMNS}, pp.address, pp.lat, pp.lng, pp.whatsapp, pp.telegram, pp.email_contact
    ${PUBLIC_JOINS} WHERE pp.id = ? AND pp.is_active = 1
  `).get(req.params.id);
  if (!provider) throw new AppError('Proveedor no encontrado', 404);

  const services = db.prepare(`
    SELECT s.id, s.title, s.description, s.price_min, s.price_max, s.price_type, s.images, s.created_at,
      c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug
    FROM services s JOIN categories c ON s.category_id = c.id
    WHERE s.provider_id = ? AND s.is_active = 1
    ORDER BY s.created_at
  `).all(req.params.id).map((s: any) => {
    const images = parseImages(s.images);
    const { images: _i, ...rest } = s;
    return { ...rest, cover: images[0] ?? null };
  });

  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS client_name, u.avatar_url AS client_avatar, s.title AS service_title
    FROM reviews r JOIN users u ON r.client_id = u.id JOIN services s ON r.service_id = s.id
    WHERE r.provider_id = ? ORDER BY r.created_at DESC LIMIT 20
  `).all(req.params.id);

  const distribution = db.prepare('SELECT rating, COUNT(*) AS count FROM reviews WHERE provider_id = ? GROUP BY rating').all(req.params.id);

  res.json({ provider: toCard(provider), services, serviceAreas: serviceAreasOf(req.params.id), reviews, distribution });
}));

export default router;
