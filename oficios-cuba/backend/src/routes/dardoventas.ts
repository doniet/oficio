import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { tx, qOne } from '../db/acceso.js';
import { desvincular } from '../db/dardoventas.js';
import { providerProfileIdFor } from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

// La API no tiene salida a internet: solo apunta el código. Lo canjea oficio_notifier
// (notifier/dardoventas.ts), y la página de vínculo consulta /estado hasta ver el resultado.
const router = Router();

const MAX_INTENTOS_HORA = 10;
const entrada = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{22,128}$/, 'El código no es válido') });

async function miPerfil(req: AuthRequest) {
  const id = await providerProfileIdFor(req.user!.id);
  if (!id) throw new AppError('Perfil de proveedor no encontrado', 404);
  return id;
}

router.post('/vincular', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = await miPerfil(req);
  const { code } = entrada.parse(req.body);
  const id = uuidv4();
  await tx(async (c) => {
    const perfil = await c.qOne<{ dardoventas_slug: string | null }>(
      'SELECT dardoventas_slug FROM provider_profiles WHERE id = $1 FOR UPDATE', [providerId],
    );
    if (perfil?.dardoventas_slug) throw new AppError('Tu negocio ya está conectado con DardoVentas.', 409);
    const { n } = (await c.qOne<{ n: string }>(
      "SELECT count(*) AS n FROM dardoventas_canjes WHERE provider_id = $1 AND created_at > now() - interval '1 hour'", [providerId],
    ))!;
    if (Number(n) >= MAX_INTENTOS_HORA) throw new AppError('Demasiados intentos. Prueba otra vez dentro de una hora.', 429);
    await c.q(
      `UPDATE dardoventas_canjes SET status = 'error', error = 'Sustituido por un código más nuevo.', code = NULL, done_at = now()
       WHERE provider_id = $1 AND status = 'pendiente'`,
      [providerId],
    );
    await c.q('INSERT INTO dardoventas_canjes (id, provider_id, code) VALUES ($1, $2, $3)', [id, providerId, code]);
  });
  res.status(202).json({ id });
}));

router.get('/estado', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = await miPerfil(req);
  const p = (await qOne<{ vinculado: boolean; linked_at: string | null; synced_at: string | null; articulos: string }>(
    `SELECT pp.dardoventas_slug IS NOT NULL AS vinculado, pp.dardoventas_linked_at AS linked_at,
            pp.dardoventas_synced_at AS synced_at,
            (SELECT count(*) FROM catalog_items ci WHERE ci.provider_id = pp.id AND ci.origen = 'dardoventas') AS articulos
       FROM provider_profiles pp WHERE pp.id = $1`,
    [providerId],
  ))!;
  const canje = await qOne<{ id: string; status: string; error: string | null }>(
    'SELECT id, status, error FROM dardoventas_canjes WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 1', [providerId],
  );
  res.json({ ...p, articulos: Number(p.articulos), canje: canje ?? null });
}));

router.delete('/vincular', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = await miPerfil(req);
  await tx((c) => desvincular(c, providerId, false));
  res.json({ ok: true });
}));

export default router;
