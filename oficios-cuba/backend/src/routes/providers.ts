import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

const providerProfileSchema = z.object({
  business_name: z.string().min(2).optional(),
  description: z.string().optional(),
  province_id: z.string().uuid(),
  municipality_id: z.string().uuid().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  whatsapp: z.string().optional(),
  telegram: z.string().optional(),
  email_contact: z.string().email().optional(),
  years_experience: z.number().int().min(0).optional(),
  service_area_ids: z.array(z.string().uuid()).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { province_id, category_id, municipality_id, q, page = '1', limit = '20', sort = 'rating' } = req.query;

  let whereClause = 'WHERE pp.is_active = 1';
  const params: any[] = [];

  if (province_id) {
    whereClause += ' AND pp.province_id = ?';
    params.push(province_id);
  }

  if (municipality_id) {
    whereClause += ' AND pp.municipality_id = ?';
    params.push(municipality_id);
  }

  if (category_id) {
    whereClause += ` AND pp.id IN (SELECT DISTINCT provider_id FROM services WHERE category_id = ? AND is_active = 1)`;
    params.push(category_id);
  }

  if (q) {
    whereClause += ` AND (pp.business_name LIKE ? OR pp.description LIKE ? OR u.full_name LIKE ?)`;
    const searchTerm = `%${q}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  let orderBy = 'pp.rating DESC, pp.review_count DESC';
  if (sort === 'newest') orderBy = 'pp.created_at DESC';
  else if (sort === 'reviews') orderBy = 'pp.review_count DESC';

  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const providers = db.prepare(`
    SELECT
      pp.id,
      pp.business_name,
      pp.description,
      pp.province_id,
      pp.municipality_id,
      pp.address,
      pp.lat,
      pp.lng,
      pp.whatsapp,
      pp.telegram,
      pp.years_experience,
      pp.rating,
      pp.review_count,
      pp.subscription_plan,
      p.name as province_name,
      m.name as municipality_name,
      u.full_name as owner_name,
      u.avatar_url
    FROM provider_profiles pp
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params);

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM provider_profiles pp
    JOIN users u ON pp.user_id = u.id
    ${whereClause}
  `).get(...params.slice(0, -2)) as { count: number };

  res.json({
    providers,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: total.count,
      totalPages: Math.ceil(total.count / Number(limit))
    }
  });
}));

router.get('/featured', asyncHandler(async (req, res) => {
  const { province_id, limit = '6' } = req.query;

  let whereClause = 'WHERE pp.is_active = 1 AND pp.subscription_plan IN (\'pro\', \'premium\')';
  const params: any[] = [];

  if (province_id) {
    whereClause += ' AND pp.province_id = ?';
    params.push(province_id);
  }

  params.push(Number(limit));

  const providers = db.prepare(`
    SELECT
      pp.id,
      pp.business_name,
      pp.description,
      pp.province_id,
      pp.municipality_id,
      pp.rating,
      pp.review_count,
      pp.subscription_plan,
      p.name as province_name,
      u.full_name as owner_name,
      u.avatar_url,
      (SELECT json_group_array(json_object('id', s.id, 'title', s.title, 'category', c.name, 'category_icon', c.icon))
       FROM services s
       JOIN categories c ON s.category_id = c.id
       WHERE s.provider_id = pp.id AND s.is_active = 1
       LIMIT 3) as top_services
    FROM provider_profiles pp
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    ${whereClause}
    ORDER BY pp.rating DESC, pp.review_count DESC
    LIMIT ?
  `).all(...params);

  res.json({ providers });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const provider = db.prepare(`
    SELECT
      pp.*,
      p.name as province_name,
      m.name as municipality_name,
      u.full_name as owner_name,
      u.email as owner_email,
      u.phone as owner_phone,
      u.avatar_url,
      u.created_at as user_created_at
    FROM provider_profiles pp
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE pp.id = ?
  `).get(req.params.id);

  if (!provider) {
    return res.status(404).json({ error: 'Proveedor no encontrado' });
  }

  const services = db.prepare(`
    SELECT s.*, c.name as category_name, c.icon as category_icon, c.slug as category_slug
    FROM services s
    JOIN categories c ON s.category_id = c.id
    WHERE s.provider_id = ? AND s.is_active = 1
    ORDER BY c.sort_order, s.title
  `).all(req.params.id);

  const serviceAreas = db.prepare(`
    SELECT sa.*, m.name as municipality_name, p.name as province_name
    FROM service_areas sa
    JOIN municipalities m ON sa.municipality_id = m.id
    JOIN provinces p ON m.province_id = p.id
    WHERE sa.provider_id = ?
  `).all(req.params.id);

  const reviews = db.prepare(`
    SELECT r.*, u.full_name as client_name, u.avatar_url as client_avatar, s.title as service_title
    FROM reviews r
    JOIN users u ON r.client_id = u.id
    JOIN services s ON r.service_id = s.id
    WHERE r.provider_id = ?
    ORDER BY r.created_at DESC
    LIMIT 10
  `).all(req.params.id);

  res.json({ provider, services, serviceAreas, reviews });
}));

router.post('/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const data = providerProfileSchema.parse(req.body);

  const existingProfile = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (existingProfile) {
    const updates = [];
    const values = [];

    if (data.business_name !== undefined) { updates.push('business_name = ?'); values.push(data.business_name); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
    if (data.province_id) { updates.push('province_id = ?'); values.push(data.province_id); }
    if (data.municipality_id !== undefined) { updates.push('municipality_id = ?'); values.push(data.municipality_id); }
    if (data.address !== undefined) { updates.push('address = ?'); values.push(data.address); }
    if (data.lat !== undefined) { updates.push('lat = ?'); values.push(data.lat); }
    if (data.lng !== undefined) { updates.push('lng = ?'); values.push(data.lng); }
    if (data.whatsapp !== undefined) { updates.push('whatsapp = ?'); values.push(data.whatsapp); }
    if (data.telegram !== undefined) { updates.push('telegram = ?'); values.push(data.telegram); }
    if (data.email_contact !== undefined) { updates.push('email_contact = ?'); values.push(data.email_contact); }
    if (data.years_experience !== undefined) { updates.push('years_experience = ?'); values.push(data.years_experience); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(existingProfile.id);
      db.prepare(`UPDATE provider_profiles SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    if (data.service_area_ids) {
      db.prepare('DELETE FROM service_areas WHERE provider_id = ?').run(existingProfile.id);
      const insertArea = db.prepare('INSERT INTO service_areas (id, provider_id, municipality_id) VALUES (?, ?, ?)');
      for (const muniId of data.service_area_ids) {
        insertArea.run(uuidv4(), existingProfile.id, muniId);
      }
    }

    const updated = db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(existingProfile.id);
    return res.json({ provider: updated });
  }

  const profileId = uuidv4();
  db.prepare(`
    INSERT INTO provider_profiles (id, user_id, business_name, description, province_id, municipality_id, address, lat, lng, whatsapp, telegram, email_contact, years_experience)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(profileId, req.user!.id, data.business_name || null, data.description || null, data.province_id, data.municipality_id || null, data.address || null, data.lat || null, data.lng || null, data.whatsapp || null, data.telegram || null, data.email_contact || null, data.years_experience || 0);

  if (data.service_area_ids) {
    const insertArea = db.prepare('INSERT INTO service_areas (id, provider_id, municipality_id) VALUES (?, ?, ?)');
    for (const muniId of data.service_area_ids) {
      insertArea.run(uuidv4(), profileId, muniId);
    }
  }

  const newProfile = db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(profileId);
  res.status(201).json({ provider: newProfile });
}));

router.get('/me/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare(`
    SELECT pp.*, p.name as province_name, m.name as municipality_name
    FROM provider_profiles pp
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE pp.user_id = ?
  `).get(req.user!.id);

  if (!provider) {
    return res.status(404).json({ error: 'Perfil de proveedor no encontrado' });
  }

  const serviceAreas = db.prepare(`
    SELECT sa.*, m.name as municipality_name, p.name as province_name
    FROM service_areas sa
    JOIN municipalities m ON sa.municipality_id = m.id
    JOIN provinces p ON m.province_id = p.id
    WHERE sa.provider_id = ?
  `).all(provider.id);

  res.json({ provider, serviceAreas });
}));

router.put('/me/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const data = providerProfileSchema.parse(req.body);

  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Perfil de proveedor no encontrado', 404);
  }

  const updates = [];
  const values = [];

  if (data.business_name !== undefined) { updates.push('business_name = ?'); values.push(data.business_name); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.province_id) { updates.push('province_id = ?'); values.push(data.province_id); }
  if (data.municipality_id !== undefined) { updates.push('municipality_id = ?'); values.push(data.municipality_id); }
  if (data.address !== undefined) { updates.push('address = ?'); values.push(data.address); }
  if (data.lat !== undefined) { updates.push('lat = ?'); values.push(data.lat); }
  if (data.lng !== undefined) { updates.push('lng = ?'); values.push(data.lng); }
  if (data.whatsapp !== undefined) { updates.push('whatsapp = ?'); values.push(data.whatsapp); }
  if (data.telegram !== undefined) { updates.push('telegram = ?'); values.push(data.telegram); }
  if (data.email_contact !== undefined) { updates.push('email_contact = ?'); values.push(data.email_contact); }
  if (data.years_experience !== undefined) { updates.push('years_experience = ?'); values.push(data.years_experience); }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(provider.id);
    db.prepare(`UPDATE provider_profiles SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  if (data.service_area_ids) {
    db.prepare('DELETE FROM service_areas WHERE provider_id = ?').run(provider.id);
    const insertArea = db.prepare('INSERT INTO service_areas (id, provider_id, municipality_id) VALUES (?, ?, ?)');
    for (const muniId of data.service_area_ids) {
      insertArea.run(uuidv4(), provider.id, muniId);
    }
  }

  const updated = db.prepare(`
    SELECT pp.*, p.name as province_name, m.name as municipality_name
    FROM provider_profiles pp
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE pp.id = ?
  `).get(provider.id);

  const serviceAreas = db.prepare(`
    SELECT sa.*, m.name as municipality_name, p.name as province_name
    FROM service_areas sa
    JOIN municipalities m ON sa.municipality_id = m.id
    JOIN provinces p ON m.province_id = p.id
    WHERE sa.provider_id = ?
  `).all(provider.id);

  res.json({ provider: updated, serviceAreas });
}));

router.delete('/me/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Perfil de proveedor no encontrado', 404);
  }

  db.prepare('DELETE FROM provider_profiles WHERE id = ?').run(provider.id);
  res.json({ message: 'Perfil eliminado correctamente' });
}));

export default router;