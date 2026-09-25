import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { authMiddleware, AuthRequest, requireClient } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const favorites = db.prepare(`
    SELECT
      f.*,
      pp.id as provider_id,
      pp.business_name,
      pp.description,
      pp.province_id,
      pp.municipality_id,
      pp.rating,
      pp.review_count,
      pp.subscription_plan,
      p.name as province_name,
      m.name as municipality_name,
      u.full_name as owner_name,
      u.avatar_url,
      (SELECT json_group_array(json_object('id', s.id, 'title', s.title, 'category', c.name, 'category_icon', c.icon))
       FROM services s
       JOIN categories c ON s.category_id = c.id
       WHERE s.provider_id = pp.id AND s.is_active = 1
       LIMIT 3) as top_services
    FROM favorites f
    JOIN provider_profiles pp ON f.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE f.client_id = ? AND pp.is_active = 1
    ORDER BY f.created_at DESC
  `).all(req.user!.id);

  res.json({ favorites });
}));

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const { provider_id } = req.body;

  if (!provider_id) {
    throw new AppError('ID de proveedor requerido', 400);
  }

  const provider = db.prepare('SELECT id FROM provider_profiles WHERE id = ? AND is_active = 1').get(provider_id);
  if (!provider) {
    throw new AppError('Proveedor no encontrado', 404);
  }

  const existing = db.prepare('SELECT id FROM favorites WHERE client_id = ? AND provider_id = ?').get(req.user!.id, provider_id);
  if (existing) {
    throw new AppError('Ya está en favoritos', 400);
  }

  const favoriteId = uuidv4();
  db.prepare('INSERT INTO favorites (id, client_id, provider_id) VALUES (?, ?, ?)')
    .run(favoriteId, req.user!.id, provider_id);

  res.status(201).json({ message: 'Agregado a favoritos', favorite_id: favoriteId });
}));

router.delete('/:providerId', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const result = db.prepare('DELETE FROM favorites WHERE client_id = ? AND provider_id = ?')
    .run(req.user!.id, req.params.providerId);

  if (result.changes === 0) {
    throw new AppError('No estaba en favoritos', 404);
  }

  res.json({ message: 'Eliminado de favoritos' });
}));

router.get('/check/:providerId', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const favorite = db.prepare('SELECT id FROM favorites WHERE client_id = ? AND provider_id = ?')
    .get(req.user!.id, req.params.providerId);

  res.json({ is_favorite: !!favorite });
}));

export default router;