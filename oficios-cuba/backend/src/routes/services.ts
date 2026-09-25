import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

const serviceSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(5).max(100),
  description: z.string().optional(),
  price_min: z.number().min(0).optional(),
  price_max: z.number().min(0).optional(),
  price_type: z.enum(['fixed', 'hourly', 'daily', 'negotiable']).default('negotiable'),
  images: z.array(z.string().url()).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { provider_id, category_id, province_id, municipality_id, q, price_min, price_max, price_type, page = '1', limit = '20', sort = 'relevance' } = req.query;

  let whereClause = 'WHERE s.is_active = 1 AND pp.is_active = 1';
  const params: any[] = [];

  if (provider_id) {
    whereClause += ' AND s.provider_id = ?';
    params.push(provider_id);
  }

  if (category_id) {
    whereClause += ' AND s.category_id = ?';
    params.push(category_id);
  }

  if (province_id) {
    whereClause += ' AND pp.province_id = ?';
    params.push(province_id);
  }

  if (municipality_id) {
    whereClause += ' AND pp.municipality_id = ?';
    params.push(municipality_id);
  }

  if (price_min) {
    whereClause += ' AND (s.price_max IS NULL OR s.price_max >= ?)';
    params.push(Number(price_min));
  }

  if (price_max) {
    whereClause += ' AND (s.price_min IS NULL OR s.price_min <= ?)';
    params.push(Number(price_max));
  }

  if (price_type) {
    whereClause += ' AND s.price_type = ?';
    params.push(price_type);
  }

  if (q) {
    whereClause += ` AND (s.title LIKE ? OR s.description LIKE ? OR c.name LIKE ?)`;
    const searchTerm = `%${q}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  let orderBy = 'pp.rating DESC, pp.review_count DESC, s.created_at DESC';
  if (sort === 'price_asc') orderBy = 'COALESCE(s.price_min, 0) ASC';
  else if (sort === 'price_desc') orderBy = 'COALESCE(s.price_max, 0) DESC';
  else if (sort === 'newest') orderBy = 's.created_at DESC';
  else if (sort === 'rating') orderBy = 'pp.rating DESC, pp.review_count DESC';

  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const services = db.prepare(`
    SELECT
      s.*,
      c.name as category_name,
      c.icon as category_icon,
      c.slug as category_slug,
      pp.id as provider_id,
      pp.business_name,
      pp.rating,
      pp.review_count,
      pp.subscription_plan,
      p.name as province_name,
      m.name as municipality_name
    FROM services s
    JOIN categories c ON s.category_id = c.id
    JOIN provider_profiles pp ON s.provider_id = pp.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params);

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM services s
    JOIN provider_profiles pp ON s.provider_id = pp.id
    ${whereClause}
  `).get(...params.slice(0, -2)) as { count: number };

  res.json({
    services,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: total.count,
      totalPages: Math.ceil(total.count / Number(limit))
    }
  });
}));

router.get('/categories/stats', asyncHandler(async (req, res) => {
  const { province_id } = req.query;

  let whereClause = 'WHERE s.is_active = 1 AND pp.is_active = 1';
  const params: any[] = [];

  if (province_id) {
    whereClause += ' AND pp.province_id = ?';
    params.push(province_id);
  }

  const stats = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.icon,
      c.slug,
      COUNT(DISTINCT s.id) as service_count,
      COUNT(DISTINCT s.provider_id) as provider_count
    FROM categories c
    LEFT JOIN services s ON c.id = s.category_id AND s.is_active = 1
    LEFT JOIN provider_profiles pp ON s.provider_id = pp.id AND pp.is_active = 1
    ${whereClause.replace('s.is_active', 's.is_active').replace('pp.is_active', 'pp.is_active')}
    WHERE c.parent_id IS NULL
    GROUP BY c.id
    ORDER BY service_count DESC
  `).all(...params);

  res.json({ stats });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const service = db.prepare(`
    SELECT
      s.*,
      c.name as category_name,
      c.icon as category_icon,
      c.slug as category_slug,
      c.parent_id as category_parent_id,
      pp.id as provider_id,
      pp.business_name,
      pp.description as provider_description,
      pp.province_id,
      pp.municipality_id,
      pp.address,
      pp.lat,
      pp.lng,
      pp.whatsapp,
      pp.telegram,
      pp.email_contact,
      pp.years_experience,
      pp.rating,
      pp.review_count,
      pp.subscription_plan,
      p.name as province_name,
      m.name as municipality_name,
      u.full_name as owner_name,
      u.avatar_url as owner_avatar
    FROM services s
    JOIN categories c ON s.category_id = c.id
    JOIN provider_profiles pp ON s.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado' });
  }

  const reviews = db.prepare(`
    SELECT r.*, u.full_name as client_name, u.avatar_url as client_avatar
    FROM reviews r
    JOIN users u ON r.client_id = u.id
    WHERE r.service_id = ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(req.params.id);

  res.json({ service, reviews });
}));

router.post('/', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Debe completar su perfil de proveedor primero', 400);
  }

  const data = serviceSchema.parse(req.body);

  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(data.category_id);
  if (!category) {
    throw new AppError('Categoría no válida', 400);
  }

  const serviceId = uuidv4();
  db.prepare(`
    INSERT INTO services (id, provider_id, category_id, title, description, price_min, price_max, price_type, images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(serviceId, provider.id, data.category_id, data.title, data.description || null, data.price_min || null, data.price_max || null, data.price_type, JSON.stringify(data.images || []));

  const newService = db.prepare(`
    SELECT s.*, c.name as category_name, c.icon as category_icon
    FROM services s
    JOIN categories c ON s.category_id = c.id
    WHERE s.id = ?
  `).get(serviceId);

  res.status(201).json({ service: newService });
}));

router.put('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Perfil de proveedor no encontrado', 404);
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ? AND provider_id = ?').get(req.params.id, provider.id);

  if (!service) {
    throw new AppError('Servicio no encontrado', 404);
  }

  const data = serviceSchema.partial().parse(req.body);

  const updates = [];
  const values = [];

  if (data.category_id) { updates.push('category_id = ?'); values.push(data.category_id); }
  if (data.title) { updates.push('title = ?'); values.push(data.title); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.price_min !== undefined) { updates.push('price_min = ?'); values.push(data.price_min); }
  if (data.price_max !== undefined) { updates.push('price_max = ?'); values.push(data.price_max); }
  if (data.price_type) { updates.push('price_type = ?'); values.push(data.price_type); }
  if (data.images !== undefined) { updates.push('images = ?'); values.push(JSON.stringify(data.images)); }

  if (updates.length === 0) {
    throw new AppError('No hay datos para actualizar', 400);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  db.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare(`
    SELECT s.*, c.name as category_name, c.icon as category_icon
    FROM services s
    JOIN categories c ON s.category_id = c.id
    WHERE s.id = ?
  `).get(req.params.id);

  res.json({ service: updated });
}));

router.delete('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Perfil de proveedor no encontrado', 404);
  }

  const service = db.prepare('SELECT id FROM services WHERE id = ? AND provider_id = ?').get(req.params.id, provider.id);

  if (!service) {
    throw new AppError('Servicio no encontrado', 404);
  }

  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ message: 'Servicio eliminado correctamente' });
}));

router.patch('/:id/toggle', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Perfil de proveedor no encontrado', 404);
  }

  const service = db.prepare('SELECT id, is_active FROM services WHERE id = ? AND provider_id = ?').get(req.params.id, provider.id);

  if (!service) {
    throw new AppError('Servicio no encontrado', 404);
  }

  const newStatus = service.is_active ? 0 : 1;
  db.prepare('UPDATE services SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, req.params.id);

  res.json({ message: newStatus ? 'Servicio activado' : 'Servicio desactivado', is_active: newStatus });
}));

export default router;