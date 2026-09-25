import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { borrarDispositivo, nuevoDispositivoSchema, registrarDispositivo } from '../push/registro.js';

const router = Router();
router.use(authMiddleware);

router.post('/devices', asyncHandler(async (req: AuthRequest, res) => {
  const d = nuevoDispositivoSchema.parse(req.body);
  registrarDispositivo(req.user!.id, d);
  res.status(201).json({ ok: true });
}));

router.delete('/devices/:token', asyncHandler(async (req: AuthRequest, res) => {
  borrarDispositivo(req.user!.id, req.params.token);
  res.json({ ok: true });
}));

export default router;
