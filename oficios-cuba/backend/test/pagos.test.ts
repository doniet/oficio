import { describe, expect, it } from 'vitest';
import { api, db, registrar } from './helpers.js';
import { confirmarPago, pagosPendientes, rechazarPago } from '../src/db/pagos.js';

async function solicitar(plan: 'basic' | 'pro') {
  const pro = await registrar('provider');
  const checkout = await api.post('/api/subscriptions/checkout').set(pro.auth).send({ plan, payment_method: 'transfer' });
  expect(checkout.body.status).toBe('pending');
  await api.post('/api/subscriptions/confirm-manual').set(pro.auth)
    .send({ subscription_id: checkout.body.subscription_id, transaction_id: 'TX-12345' });
  return { pro, subscriptionId: checkout.body.subscription_id as string };
}

describe('confirmación manual de pagos (sin DEMO_MODE)', () => {
  it('el checkout real deja el plan pendiente, no lo activa', async () => {
    const { pro } = await solicitar('pro');
    const perfil = db.prepare('SELECT subscription_plan FROM provider_profiles WHERE id = ?').get(pro.providerId) as { subscription_plan: string };
    expect(perfil.subscription_plan).toBe('free');
  });

  it('lista los pagos pendientes con su número de transacción', async () => {
    const { subscriptionId } = await solicitar('basic');
    const fila = pagosPendientes().find((p) => p.subscription_id === subscriptionId);
    expect(fila).toMatchObject({ plan: 'basic', transaction_id: 'TX-12345' });
  });

  it('confirmar activa el plan un mes y marca el pago como cobrado', async () => {
    const { pro, subscriptionId } = await solicitar('pro');
    confirmarPago(subscriptionId);

    const perfil = db.prepare('SELECT subscription_plan, subscription_expires_at FROM provider_profiles WHERE id = ?')
      .get(pro.providerId) as { subscription_plan: string; subscription_expires_at: string };
    expect(perfil.subscription_plan).toBe('pro');
    const dias = (Date.parse(perfil.subscription_expires_at) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(27);
    expect(dias).toBeLessThan(32);

    const sub = db.prepare('SELECT status FROM subscriptions WHERE id = ?').get(subscriptionId) as { status: string };
    expect(sub.status).toBe('active');
    const pago = db.prepare('SELECT status FROM payments WHERE subscription_id = ?').get(subscriptionId) as { status: string };
    expect(pago.status).toBe('succeeded');
    expect(pagosPendientes().some((p) => p.subscription_id === subscriptionId)).toBe(false);
  });

  it('no confirma dos veces la misma suscripción', async () => {
    const { subscriptionId } = await solicitar('basic');
    confirmarPago(subscriptionId);
    expect(() => confirmarPago(subscriptionId)).toThrow();
  });

  it('rechazar deja el plan gratuito y el pago fallido', async () => {
    const { pro, subscriptionId } = await solicitar('pro');
    rechazarPago(subscriptionId);
    const perfil = db.prepare('SELECT subscription_plan FROM provider_profiles WHERE id = ?').get(pro.providerId) as { subscription_plan: string };
    expect(perfil.subscription_plan).toBe('free');
    const pago = db.prepare('SELECT status FROM payments WHERE subscription_id = ?').get(subscriptionId) as { status: string };
    expect(pago.status).toBe('failed');
  });
});
