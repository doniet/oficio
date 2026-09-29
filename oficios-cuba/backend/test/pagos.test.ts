import { describe, expect, it } from 'vitest';
import { api, registrar } from './helpers.js';
import { qOne } from '../src/db/acceso.js';
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
    const perfil = await qOne<{ subscription_plan: string }>('SELECT subscription_plan FROM provider_profiles WHERE id = $1', [pro.providerId]);
    expect(perfil!.subscription_plan).toBe('free');
  });

  it('lista los pagos pendientes con su número de transacción', async () => {
    const { subscriptionId } = await solicitar('basic');
    const fila = (await pagosPendientes()).find((p) => p.subscription_id === subscriptionId);
    expect(fila).toMatchObject({ plan: 'basic', transaction_id: 'TX-12345' });
  });

  it('confirmar activa el plan un mes y marca el pago como cobrado', async () => {
    const { pro, subscriptionId } = await solicitar('pro');
    await confirmarPago(subscriptionId);

    const perfil = await qOne<{ subscription_plan: string; subscription_expires_at: string }>(
      'SELECT subscription_plan, subscription_expires_at FROM provider_profiles WHERE id = $1', [pro.providerId],
    );
    expect(perfil!.subscription_plan).toBe('pro');
    const dias = (Date.parse(perfil!.subscription_expires_at) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(27);
    expect(dias).toBeLessThan(32);

    const sub = await qOne<{ status: string }>('SELECT status FROM subscriptions WHERE id = $1', [subscriptionId]);
    expect(sub!.status).toBe('active');
    const pago = await qOne<{ status: string }>('SELECT status FROM payments WHERE subscription_id = $1', [subscriptionId]);
    expect(pago!.status).toBe('succeeded');
    expect((await pagosPendientes()).some((p) => p.subscription_id === subscriptionId)).toBe(false);
  });

  it('no confirma dos veces la misma suscripción', async () => {
    const { subscriptionId } = await solicitar('basic');
    await confirmarPago(subscriptionId);
    await expect(confirmarPago(subscriptionId)).rejects.toThrow();
  });

  it('rechazar deja el plan gratuito y el pago fallido', async () => {
    const { pro, subscriptionId } = await solicitar('pro');
    await rechazarPago(subscriptionId);
    const perfil = await qOne<{ subscription_plan: string }>('SELECT subscription_plan FROM provider_profiles WHERE id = $1', [pro.providerId]);
    expect(perfil!.subscription_plan).toBe('free');
    const pago = await qOne<{ status: string }>('SELECT status FROM payments WHERE subscription_id = $1', [subscriptionId]);
    expect(pago!.status).toBe('failed');
  });
});
