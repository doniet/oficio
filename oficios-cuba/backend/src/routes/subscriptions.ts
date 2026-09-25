import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { enforcePlanLimit } from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { DEMO_MODE, PLANS } from '../config.js';

const router = Router();

router.get('/plans', (_req, res) => {
  res.json({ plans: PLANS, demo: DEMO_MODE });
});

function providerFor(userId: string) {
  const provider = db.prepare('SELECT id, subscription_plan, subscription_expires_at FROM provider_profiles WHERE user_id = ?').get(userId);
  if (!provider) throw new AppError('Perfil de proveedor no encontrado', 404);
  return provider as { id: string; subscription_plan: keyof typeof PLANS; subscription_expires_at: string | null };
}

router.get('/me', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = providerFor(req.user!.id);
  const subscription = db.prepare(`
    SELECT * FROM subscriptions WHERE provider_id = ? AND status IN ('active', 'pending', 'past_due')
    ORDER BY created_at DESC LIMIT 1
  `).get(provider.id);
  const payments = db.prepare(`
    SELECT p.id, p.amount, p.currency, p.status, p.created_at, s.plan
    FROM payments p JOIN subscriptions s ON p.subscription_id = s.id
    WHERE p.provider_id = ? ORDER BY p.created_at DESC LIMIT 12
  `).all(provider.id);
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM services WHERE provider_id = ?').get(provider.id) as { count: number };
  res.json({ provider, subscription, payments, service_count: count });
}));

// Sin pasarela de pago integrada: en modo demo el pago se simula y el plan se activa al
// momento; en producción la suscripción queda pendiente hasta que un administrador confirme
// la transferencia o el pago en efectivo con `npm run pagos` (src/scripts/pagos.ts).
router.post('/checkout', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { plan, payment_method } = z.object({
    plan: z.enum(['basic', 'pro', 'premium']),
    payment_method: z.enum(['transfer', 'cash', 'demo']).default(DEMO_MODE ? 'demo' : 'transfer'),
  }).parse(req.body);

  const provider = providerFor(req.user!.id);
  const info = PLANS[plan];
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  const subscriptionId = uuidv4();

  if (DEMO_MODE) {
    const tx = db.transaction(() => {
      db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE provider_id = ? AND status IN ('active', 'pending')").run(provider.id);
      db.prepare(`INSERT INTO subscriptions (id, provider_id, plan, amount, status, current_period_start, current_period_end)
        VALUES (?, ?, ?, ?, 'active', ?, ?)`).run(subscriptionId, provider.id, plan, info.price, now.toISOString(), end.toISOString());
      db.prepare(`INSERT INTO payments (id, subscription_id, provider_id, amount, status, metadata, created_at)
        VALUES (?, ?, ?, ?, 'succeeded', ?, ?)`).run(uuidv4(), subscriptionId, provider.id, info.price, JSON.stringify({ demo: true }), now.toISOString());
      db.prepare('UPDATE provider_profiles SET subscription_plan = ?, subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(plan, end.toISOString(), provider.id);
      enforcePlanLimit(provider.id);
    });
    tx();
    return res.json({ status: 'active', message: `Plan ${info.name} activado (pago simulado de demostración)` });
  }

  if (payment_method === 'demo') throw new AppError('Método de pago no disponible', 400);
  db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE provider_id = ? AND status = 'pending'").run(provider.id);
  db.prepare(`INSERT INTO subscriptions (id, provider_id, plan, amount, status, current_period_start, current_period_end)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)`).run(subscriptionId, provider.id, plan, info.price, now.toISOString(), end.toISOString());
  res.json({
    status: 'pending',
    subscription_id: subscriptionId,
    message: 'Solicitud registrada. Realiza el pago y reporta el número de transacción para que lo verifiquemos.',
  });
}));

router.post('/confirm-manual', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({ subscription_id: z.string().uuid(), transaction_id: z.string().trim().min(3).max(80) }).parse(req.body);
  const provider = providerFor(req.user!.id);
  const subscription = db.prepare("SELECT id, amount FROM subscriptions WHERE id = ? AND provider_id = ? AND status = 'pending'")
    .get(data.subscription_id, provider.id) as { id: string; amount: number } | undefined;
  if (!subscription) throw new AppError('Suscripción pendiente no encontrada', 404);

  db.prepare(`INSERT INTO payments (id, subscription_id, provider_id, amount, status, metadata, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)`)
    .run(uuidv4(), subscription.id, provider.id, subscription.amount, JSON.stringify({ transaction_id: data.transaction_id }), new Date().toISOString());
  res.json({ message: 'Pago reportado. Lo verificaremos y activaremos tu plan.' });
}));

router.post('/cancel', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = providerFor(req.user!.id);
  const result = db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE provider_id = ? AND status IN ('active', 'pending', 'past_due')")
    .run(provider.id);
  if (result.changes === 0 && provider.subscription_plan === 'free') throw new AppError('No tienes un plan de pago activo', 404);
  db.transaction(() => {
    db.prepare("UPDATE provider_profiles SET subscription_plan = 'free', subscription_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(provider.id);
    enforcePlanLimit(provider.id);
  })();
  res.json({ message: 'Suscripción cancelada. Tu cuenta pasó al plan Gratuito; si tenías más servicios de los que permite, los más nuevos quedaron pausados.' });
}));

export default router;
