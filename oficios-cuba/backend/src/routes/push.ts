import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { borrarDispositivo, registrarDispositivo } from '../push/registro.js';

const router = Router();
router.use(authMiddleware);

router.post('/devices', asyncHandler(async (req: AuthRequest, res) => {
  const d = z.object({
    canal: z.enum(['fcm']),
    token: z.string().trim().min(1).max(4096),
    plataforma: z.enum(['android', 'ios']),
    app_version: z.string().trim().max(20).default(''),
  }).parse(req.body);
  // El tsconfig de este proyecto (strict:false/strictNullChecks:false) hace que z.infer<>
  // salga con todos los campos opcionales; zod documenta que su inferencia exige modo strict.
  // Se reconstruye el objeto explícitamente para que el parámetro de registrarDispositivo
  // conserve sus campos requeridos y el compilador SÍ marque error si falta alguno.
  registrarDispositivo(req.user!.id, { canal: d.canal, token: d.token, plataforma: d.plataforma, app_version: d.app_version ?? '' });
  res.status(201).json({ ok: true });
}));

router.delete('/devices/:token', asyncHandler(async (req: AuthRequest, res) => {
  borrarDispositivo(req.params.token);
  res.json({ ok: true });
}));

export default router;
