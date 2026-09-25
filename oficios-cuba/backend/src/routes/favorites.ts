import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { parseImages } from '../db/index.js';
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
      (SELECT COUNT(*) FROM services s WHERE s.provider_id = pp.id AND s.is_active = 1) as service_count,
      (SELECT s.images FROM services s WHERE s.provider_id = pp.id AND s.is_active = 1 AND s.images NOT IN ('[]', '') ORDER BY s.created_at LIMIT 1) as cover_images
    FROM favorites f
    JOIN provider_profiles pp ON f.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE f.client_id = ? AND pp.is_active = 1
    ORDER BY f.created_at DESC
  `).all(req.user!.id);

  res.json({
    favorites: favorites.map((f: any) => {
      const { cover_images, ...rest } = f;
      return { ...rest, cover: parseImages(cover_images)[0] ?? null };
    }),
  });
}));

router.get('/ids', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const rows = db.prepare('SELECT provider_id FROM favorites WHERE client_id = ?').all(req.user!.id) as { provider_id: string }[];
  res.json({ ids: rows.map((r) => r.provider_id) });
}));

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const { provider_id } = z.object({ provider_id: z.string().uuid('ID de proveedor requerido') }).parse(req.body);

  const provider = db.prepare('SELECT id FROM provider_profiles WHERE id = ? AND is_active = 1').get(provider_id);
  if (!provider) {
    throw new AppError('Proveedor no encontrado', 404);
  }

  db.prepare('INSERT OR IGNORE INTO favorites (id, client_id, provider_id, created_at) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), req.user!.id, provider_id, new Date().toISOString());

  res.status(201).json({ message: 'Agregado a favoritos' });
}));

router.delete('/:providerId', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  db.prepare('DELETE FROM favorites WHERE client_id = ? AND provider_id = ?')
    .run(req.user!.id, req.params.providerId);

  res.json({ message: 'Eliminado de favoritos' });
}));

router.get('/check/:providerId', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const favorite = db.prepare('SELECT id FROM favorites WHERE client_id = ? AND provider_id = ?')
    .get(req.user!.id, req.params.providerId);

  res.json({ is_favorite: !!favorite });
}));

export default router;