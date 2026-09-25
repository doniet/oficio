import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { refreshProviderRating } from '../db/index.js';
import { authMiddleware, AuthRequest, requireClient } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

function eligibility(clientId: string, serviceId: string) {
  const service = db.prepare(`
    SELECT s.id, s.provider_id FROM services s JOIN provider_profiles pp ON s.provider_id = pp.id
    WHERE s.id = ? AND s.is_active = 1 AND pp.is_active = 1
  `).get(serviceId) as { id: string; provider_id: string } | undefined;
  if (!service) return { service: null, can_review: false, reason: 'Servicio no encontrado' };
  // Una reseña por cliente y proveedor: si no, un mismo cliente multiplica su voto con cada servicio.
  if (db.prepare('SELECT 1 FROM reviews WHERE client_id = ? AND provider_id = ?').get(clientId, service.provider_id)) {
    return { service, can_review: false, reason: 'Ya reseñaste a este profesional' };
  }
  // Solo reseña quien de verdad habló con el proveedor: tiene que haberle contestado en el chat.
  // Abrir una conversación con un "hola" desde una cuenta nueva no basta.
  const contesto = db.prepare(`
    SELECT 1 FROM conversations c JOIN messages m ON m.conversation_id = c.id
    WHERE c.client_id = ? AND c.provider_id = ? AND m.sender_type = 'provider' LIMIT 1
  `).get(clientId, service.provider_id);
  if (!contesto) {
    return { service, can_review: false, reason: 'Podrás reseñar cuando el profesional te haya respondido por el chat' };
  }
  return { service, can_review: true, reason: null };
}

router.get('/eligibility/:serviceId', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const { can_review, reason } = eligibility(req.user!.id, req.params.serviceId);
  res.json({ can_review, reason });
}));

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({
    service_id: z.string().uuid(),
    rating: z.number().int().min(1, 'Elige de 1 a 5 estrellas').max(5),
    comment: z.string().trim().max(1000).optional(),
  }).parse(req.body);

  const { service, can_review, reason } = eligibility(req.user!.id, data.service_id);
  if (!service) throw new AppError('Servicio no encontrado', 404);
  if (!can_review) throw new AppError(reason!, 400);

  const id = uuidv4();
  db.prepare('INSERT INTO reviews (id, service_id, client_id, provider_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, data.service_id, req.user!.id, service.provider_id, data.rating, data.comment || null, new Date().toISOString());
  refreshProviderRating(service.provider_id);

  const review = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS client_name, u.avatar_url AS client_avatar
    FROM reviews r JOIN users u ON r.client_id = u.id WHERE r.id = ?
  `).get(id);
  res.status(201).json({ review });
}));

router.get('/provider/:providerId', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS client_name, u.avatar_url AS client_avatar, s.title AS service_title
    FROM reviews r JOIN users u ON r.client_id = u.id LEFT JOIN services s ON r.service_id = s.id
    WHERE r.provider_id = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `).all(req.params.providerId, limit, (page - 1) * limit);
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM reviews WHERE provider_id = ?').get(req.params.providerId) as { count: number };
  res.json({ reviews, pagination: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) } });
}));

router.delete('/:id', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const review = db.prepare('SELECT provider_id FROM reviews WHERE id = ? AND client_id = ?').get(req.params.id, req.user!.id) as { provider_id: string } | undefined;
  if (!review) throw new AppError('Reseña no encontrada', 404);
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  refreshProviderRating(review.provider_id);
  res.json({ message: 'Reseña eliminada' });
}));

export default router;
