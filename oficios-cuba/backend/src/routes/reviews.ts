import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest, requireClient } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    service_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
  });

  const data = schema.parse(req.body);

  const service = db.prepare(`
    SELECT s.*, pp.id as provider_id, pp.user_id as provider_user_id
    FROM services s
    JOIN provider_profiles pp ON s.provider_id = pp.id
    WHERE s.id = ?
  `).get(data.service_id);

  if (!service) {
    throw new AppError('Servicio no encontrado', 404);
  }

  const existingReview = db.prepare(`
    SELECT id FROM reviews WHERE service_id = ? AND client_id = ?
  `).get(data.service_id, req.user!.id);

  if (existingReview) {
    throw new AppError('Ya has reseñado este servicio', 400);
  }

  const conversation = db.prepare(`
    SELECT id FROM conversations
    WHERE client_id = ? AND provider_id = ? AND service_id = ?
  `).get(req.user!.id, service.provider_id, data.service_id);

  if (!conversation) {
    throw new AppError('Solo puedes reseñar servicios con los que has interactuado', 400);
  }

  const reviewId = uuidv4();
  db.prepare(`
    INSERT INTO reviews (id, service_id, client_id, provider_id, rating, comment)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(reviewId, data.service_id, req.user!.id, service.provider_id, data.rating, data.comment || null);

  const stats = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as count
    FROM reviews
    WHERE provider_id = ?
  `).get(service.provider_id) as { avg_rating: number; count: number };

  db.prepare(`
    UPDATE provider_profiles
    SET rating = ?, review_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(Math.round(stats.avg_rating * 10) / 10, stats.count, service.provider_id);

  const review = db.prepare(`
    SELECT r.*, u.full_name as client_name, u.avatar_url as client_avatar
    FROM reviews r
    JOIN users u ON r.client_id = u.id
    WHERE r.id = ?
  `).get(reviewId);

  res.status(201).json({ review });
}));

router.get('/provider/:providerId', asyncHandler(async (req, res) => {
  const { page = '1', limit = '10' } = req.query;

  const offset = (Number(page) - 1) * Number(limit);

  const reviews = db.prepare(`
    SELECT r.*, u.full_name as client_name, u.avatar_url as client_avatar, s.title as service_title
    FROM reviews r
    JOIN users u ON r.client_id = u.id
    JOIN services s ON r.service_id = s.id
    WHERE r.provider_id = ?
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.providerId, Number(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM reviews WHERE provider_id = ?')
    .get(req.params.providerId) as { count: number };

  const ratingStats = db.prepare(`
    SELECT
      AVG(rating) as avg_rating,
      COUNT(*) as total,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
    FROM reviews
    WHERE provider_id = ?
  `).get(req.params.providerId);

  res.json({
    reviews,
    stats: ratingStats,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: total.count,
      totalPages: Math.ceil(total.count / Number(limit))
    }
  });
}));

router.get('/service/:serviceId', asyncHandler(async (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, u.full_name as client_name, u.avatar_url as client_avatar
    FROM reviews r
    JOIN users u ON r.client_id = u.id
    WHERE r.service_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.serviceId);

  res.json({ reviews });
}));

router.put('/:id', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(1000).optional(),
  });

  const data = schema.parse(req.body);

  const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND client_id = ?').get(req.params.id, req.user!.id);

  if (!review) {
    throw new AppError('Reseña no encontrada', 404);
  }

  const updates = [];
  const values = [];

  if (data.rating !== undefined) { updates.push('rating = ?'); values.push(data.rating); }
  if (data.comment !== undefined) { updates.push('comment = ?'); values.push(data.comment); }

  if (updates.length === 0) {
    throw new AppError('No hay datos para actualizar', 400);
  }

  values.push(req.params.id);
  db.prepare(`UPDATE reviews SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const provider = db.prepare('SELECT provider_id FROM reviews WHERE id = ?').get(req.params.id) as { provider_id: string };

  const stats = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as count
    FROM reviews
    WHERE provider_id = ?
  `).get(provider.provider_id) as { avg_rating: number; count: number };

  db.prepare(`
    UPDATE provider_profiles
    SET rating = ?, review_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(Math.round(stats.avg_rating * 10) / 10, stats.count, provider.provider_id);

  const updated = db.prepare(`
    SELECT r.*, u.full_name as client_name, u.avatar_url as client_avatar
    FROM reviews r
    JOIN users u ON r.client_id = u.id
    WHERE r.id = ?
  `).get(req.params.id);

  res.json({ review: updated });
}));

router.delete('/:id', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND client_id = ?').get(req.params.id, req.user!.id);

  if (!review) {
    throw new AppError('Reseña no encontrada', 404);
  }

  const providerId = review.provider_id;

  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);

  const stats = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as count
    FROM reviews
    WHERE provider_id = ?
  `).get(providerId) as { avg_rating: number | null; count: number };

  db.prepare(`
    UPDATE provider_profiles
    SET rating = ?, review_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(stats.avg_rating ? Math.round(stats.avg_rating * 10) / 10 : 0, stats.count, providerId);

  res.json({ message: 'Reseña eliminada' });
}));

export default router;