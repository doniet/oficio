import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { q, qOne, tx } from '../db/acceso.js';
import { enforcePlanLimit } from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { DEMO_MODE, PLANS, planDe } from '../config.js';

const router = Router();

router.get('/plans', (_req, res) => {
  res.json({ plans: PLANS, demo: DEMO_MODE });
});

async function providerFor(userId: string) {
  const provider = await qOne<{ id: string; subscription_plan: string; subscription_expires_at: string | null }>(
    'SELECT id, subscription_plan, subscription_expires_at FROM provider_profiles WHERE user_id = $1', [userId],
  );
  if (!provider) throw new AppError('Perfil de proveedor no encontrado', 404);
  return { ...provider, subscription_plan: provider.subscription_plan === 'premium' ? 'pro' : provider.subscription_plan };
}

router.get('/me', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = await providerFor(req.user!.id);
  const subscription = await qOne(`
    SELECT * FROM subscriptions WHERE provider_id = $1 AND status IN ('active', 'pending', 'past_due')
    ORDER BY created_at DESC LIMIT 1
  `, [provider.id]);
  const payments = await q(`
    SELECT p.id, p.amount, p.currency, p.status, p.created_at, s.plan
    FROM payments p JOIN subscriptions s ON p.subscription_id = s.id
    WHERE p.provider_id = $1 ORDER BY p.created_at DESC LIMIT 12
  `, [provider.id]);
  const fila = await qOne<{ count: string }>('SELECT count(*) AS count FROM services WHERE provider_id = $1', [provider.id]);
  res.json({ provider, subscription, payments, service_count: Number(fila!.count), limits: planDe(provider.subscription_plan) });
}));

// Sin pasarela de pago integrada: en modo demo el pago se simula y el plan se activa al
// momento; en producción la suscripción queda pendiente hasta que un administrador confirme
// la transferencia o el pago en efectivo con `npm run pagos` (src/scripts/pagos.ts).
router.post('/checkout', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { plan, payment_method } = z.object({
    plan: z.enum(['basic', 'pro']),
    payment_method: z.enum(['transfer', 'cash', 'demo']).default(DEMO_MODE ? 'demo' : 'transfer'),
  }).parse(req.body);

  const provider = await providerFor(req.user!.id);
  const info = PLANS[plan];
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  const subscriptionId = uuidv4();

  if (DEMO_MODE) {
    // enforcePlanLimit() se llama DESPUÉS de que la transacción confirme (no dentro): abre su
    // propia conexión del pool y leería el plan viejo si el COMMIT de arriba no hubiera pasado ya.
    await tx(async (c) => {
      await c.q("UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE provider_id = $1 AND status IN ('active', 'pending')", [provider.id]);
      await c.q(`INSERT INTO subscriptions (id, provider_id, plan, amount, status, current_period_start, current_period_end)
        VALUES ($1, $2, $3, $4, 'active', $5, $6)`, [subscriptionId, provider.id, plan, info.price, now.toISOString(), end.toISOString()]);
      await c.q(`INSERT INTO payments (id, subscription_id, provider_id, amount, status, metadata, created_at)
        VALUES ($1, $2, $3, $4, 'succeeded', $5, $6)`, [uuidv4(), subscriptionId, provider.id, info.price, JSON.stringify({ demo: true }), now.toISOString()]);
      await c.q('UPDATE provider_profiles SET subscription_plan = $1, subscription_expires_at = $2, updated_at = now() WHERE id = $3',
        [plan, end.toISOString(), provider.id]);
    });
    await enforcePlanLimit(provider.id);
    return res.json({ status: 'active', message: `Plan ${info.name} activado (pago simulado de demostración)` });
  }

  if (payment_method === 'demo') throw new AppError('Método de pago no disponible', 400);
  await q("UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE provider_id = $1 AND status = 'pending'", [provider.id]);
  await q(`INSERT INTO subscriptions (id, provider_id, plan, amount, status, current_period_start, current_period_end)
    VALUES ($1, $2, $3, $4, 'pending', $5, $6)`, [subscriptionId, provider.id, plan, info.price, now.toISOString(), end.toISOString()]);
  res.json({
    status: 'pending',
    subscription_id: subscriptionId,
    message: 'Solicitud registrada. Realiza el pago y reporta el número de transacción para que lo verifiquemos.',
  });
}));

router.post('/confirm-manual', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({ subscription_id: z.string().uuid(), transaction_id: z.string().trim().min(3).max(80) }).parse(req.body);
  const provider = await providerFor(req.user!.id);
  const subscription = await qOne<{ id: string; amount: number }>(
    "SELECT id, amount FROM subscriptions WHERE id = $1 AND provider_id = $2 AND status = 'pending'", [data.subscription_id, provider.id],
  );
  if (!subscription) throw new AppError('Suscripción pendiente no encontrada', 404);

  await q(`INSERT INTO payments (id, subscription_id, provider_id, amount, status, metadata, created_at)
    VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
    [uuidv4(), subscription.id, provider.id, subscription.amount, JSON.stringify({ transaction_id: data.transaction_id }), new Date().toISOString()]);
  res.json({ message: 'Pago reportado. Lo verificaremos y activaremos tu plan.' });
}));

router.post('/cancel', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = await providerFor(req.user!.id);
  const cancelados = await q(
    "UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE provider_id = $1 AND status IN ('active', 'pending', 'past_due') RETURNING id",
    [provider.id],
  );
  if (cancelados.length === 0 && provider.subscription_plan === 'free') throw new AppError('No tienes un plan de pago activo', 404);
  await q("UPDATE provider_profiles SET subscription_plan = 'free', subscription_expires_at = NULL, updated_at = now() WHERE id = $1", [provider.id]);
  await enforcePlanLimit(provider.id);
  res.json({ message: 'Suscripción cancelada. Tu cuenta pasó al plan Gratuito; si tenías más servicios de los que permite, los más nuevos quedaron pausados.' });
}));

export default router;
