import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { parseImages } from '../db/index.js';
import { q, qOne } from '../db/acceso.js';
import { authMiddleware, AuthRequest, requireClient } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const favorites = await q<any>(`
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
      (SELECT COUNT(*) FROM services s WHERE s.provider_id = pp.id AND s.is_active = true) as service_count,
      (SELECT s.images FROM services s WHERE s.provider_id = pp.id AND s.is_active = true AND s.images IS NOT NULL AND s.images <> '[]'::jsonb ORDER BY s.created_at LIMIT 1) as cover_images
    FROM favorites f
    JOIN provider_profiles pp ON f.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE f.client_id = $1 AND pp.is_active = true
    ORDER BY f.created_at DESC
  `, [req.user!.id]);

  res.json({
    favorites: favorites.map((f) => {
      const { cover_images, service_count, ...rest } = f;
      return { ...rest, service_count: Number(service_count), cover: parseImages(cover_images)[0] ?? null };
    }),
  });
}));

router.get('/ids', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const rows = await q<{ provider_id: string }>('SELECT provider_id FROM favorites WHERE client_id = $1', [req.user!.id]);
  res.json({ ids: rows.map((r) => r.provider_id) });
}));

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const { provider_id } = z.object({ provider_id: z.string().uuid('ID de proveedor requerido') }).parse(req.body);

  const provider = await qOne('SELECT id FROM provider_profiles WHERE id = $1 AND is_active = true', [provider_id]);
  if (!provider) {
    throw new AppError('Proveedor no encontrado', 404);
  }

  await q(
    'INSERT INTO favorites (id, client_id, provider_id, created_at) VALUES ($1, $2, $3, now()) ON CONFLICT (client_id, provider_id) DO NOTHING',
    [uuidv4(), req.user!.id, provider_id],
  );

  res.status(201).json({ message: 'Agregado a favoritos' });
}));

router.delete('/:providerId', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  await q('DELETE FROM favorites WHERE client_id = $1 AND provider_id = $2', [req.user!.id, req.params.providerId]);

  res.json({ message: 'Eliminado de favoritos' });
}));

router.get('/check/:providerId', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const favorite = await qOne('SELECT id FROM favorites WHERE client_id = $1 AND provider_id = $2', [req.user!.id, req.params.providerId]);

  res.json({ is_favorite: !!favorite });
}));

export default router;
