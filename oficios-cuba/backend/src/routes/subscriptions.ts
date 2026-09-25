import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

const PLANS = {
  basic: { name: 'Básico', price: Number(process.env.PLAN_BASIC_PRICE) || 9.99, features: ['Hasta 5 servicios', 'Perfil básico', 'Soporte por email'] },
  pro: { name: 'Profesional', price: Number(process.env.PLAN_PRO_PRICE) || 19.99, features: ['Servicios ilimitados', 'Perfil destacado', 'Estadísticas básicas', 'Soporte prioritario'] },
  premium: { name: 'Premium', price: Number(process.env.PLAN_PREMIUM_PRICE) || 39.99, features: ['Todo en Pro', 'Top en búsquedas', 'Estadísticas avanzadas', 'Badge verificado', 'Soporte 24/7'] },
};

router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

router.get('/me', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id, subscription_plan, subscription_expires_at FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Perfil de proveedor no encontrado', 404);
  }

  const subscription = db.prepare(`
    SELECT * FROM subscriptions
    WHERE provider_id = ? AND status IN ('active', 'past_due')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(provider.id);

  const payments = db.prepare(`
    SELECT * FROM payments
    WHERE provider_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(provider.id);

  res.json({ provider, subscription, payments });
}));

router.post('/checkout', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    plan: z.enum(['basic', 'pro', 'premium']),
    payment_method: z.enum(['stripe', 'transfer', 'cash']).default('stripe'),
  });

  const data = schema.parse(req.body);

  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  if (!provider) {
    throw new AppError('Perfil de proveedor no encontrado', 404);
  }

  const planInfo = PLANS[data.plan];
  const subscriptionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  db.prepare(`
    INSERT INTO subscriptions (id, provider_id, plan, amount, currency, status, current_period_start, current_period_end)
    VALUES (?, ?, ?, ?, 'USD', 'pending', ?, ?)
  `).run(subscriptionId, provider.id, data.plan, planInfo.price, now.toISOString(), expiresAt.toISOString());

  if (data.payment_method === 'stripe') {
    res.json({
      subscription_id: subscriptionId,
      amount: planInfo.price,
      currency: 'USD',
      message: 'Redirigir a Stripe Checkout',
      stripe_session_url: `https://checkout.stripe.com/pay/cs_test_${subscriptionId}`
    });
  } else {
    res.json({
      subscription_id: subscriptionId,
      amount: planInfo.price,
      currency: 'USD',
      message: 'Pago pendiente - Complete la transferencia o pago en efectivo',
      instructions: 'Contacte al administrador para completar el pago'
    });
  }
}));

router.post('/webhook', asyncHandler(async (req, res) => {
  const { subscription_id, status, stripe_payment_intent_id } = req.body;

  const subscription = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscription_id);

  if (!subscription) {
    return res.status(404).json({ error: 'Suscripción no encontrada' });
  }

  const paymentId = uuidv4();
  db.prepare(`
    INSERT INTO payments (id, subscription_id, provider_id, amount, currency, status, stripe_payment_intent_id)
    VALUES (?, ?, ?, ?, 'USD', ?, ?)
  `).run(paymentId, subscription_id, subscription.provider_id, subscription.amount, status, stripe_payment_intent_id || null);

  if (status === 'succeeded') {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    db.prepare(`
      UPDATE subscriptions
      SET status = 'active', stripe_subscription_id = ?, current_period_start = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stripe_payment_intent_id, now.toISOString(), expiresAt.toISOString(), subscription_id);

    db.prepare(`
      UPDATE provider_profiles
      SET subscription_plan = ?, subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(subscription.plan, expiresAt.toISOString(), subscription.provider_id);
  } else if (status === 'failed') {
    db.prepare('UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', subscription_id);
  }

  res.json({ received: true });
}));

router.post('/confirm-manual', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    subscription_id: z.string().uuid(),
    transaction_id: z.string().optional(),
  });

  const data = schema.parse(req.body);

  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  const subscription = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND provider_id = ?').get(data.subscription_id, provider.id);

  if (!subscription) {
    throw new AppError('Suscripción no encontrada', 404);
  }

  const paymentId = uuidv4();
  db.prepare(`
    INSERT INTO payments (id, subscription_id, provider_id, amount, currency, status, metadata)
    VALUES (?, ?, ?, ?, 'USD', 'pending', ?)
  `).run(paymentId, subscription.id, provider.id, JSON.stringify({ transaction_id: data.transaction_id }));

  res.json({ message: 'Pago reportado, pendiente de verificación por administrador' });
}));

router.post('/cancel', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(req.user!.id);

  const subscription = db.prepare(`
    SELECT * FROM subscriptions
    WHERE provider_id = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(provider.id);

  if (!subscription) {
    throw new AppError('No hay suscripción activa', 404);
  }

  db.prepare('UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', subscription.id);
  db.prepare('UPDATE provider_profiles SET subscription_plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('free', provider.id);

  res.json({ message: 'Suscripción cancelada correctamente' });
}));

export default router;