import { v4 as uuidv4 } from 'uuid';
import { q, tx, type Tx } from './acceso.js';
import { enforcePlanLimit } from './index.js';

export interface PagoPendiente {
  subscription_id: string;
  plan: string;
  amount: number;
  solicitado: string;
  business_name: string | null;
  full_name: string;
  email: string;
  transaction_id: string | null;
}

// Suscripciones pendientes, con el número de transacción si el proveedor ya lo reportó.
export async function pagosPendientes(): Promise<PagoPendiente[]> {
  // metadata es jsonb: ya llega parseada (objeto o null), nunca como cadena que haya que JSON.parse.
  const rows = await q<Omit<PagoPendiente, 'transaction_id'> & { metadata: { transaction_id?: string } | null }>(`
    SELECT s.id AS subscription_id, s.plan, s.amount, s.created_at AS solicitado,
      pp.business_name, u.full_name, u.email,
      (SELECT p.metadata FROM payments p WHERE p.subscription_id = s.id AND p.status = 'pending' ORDER BY p.created_at DESC LIMIT 1) AS metadata
    FROM subscriptions s
    JOIN provider_profiles pp ON s.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    WHERE s.status = 'pending'
    ORDER BY s.created_at
  `);
  return rows.map(({ metadata, ...r }) => ({ ...r, transaction_id: metadata?.transaction_id ?? null }));
}

async function pendiente(c: Tx, subscriptionId: string) {
  const sub = await c.qOne<{ id: string; provider_id: string; plan: string; amount: number }>(
    "SELECT id, provider_id, plan, amount FROM subscriptions WHERE id = $1 AND status = 'pending'", [subscriptionId],
  );
  if (!sub) throw new Error(`No hay ninguna suscripción pendiente con id ${subscriptionId}`);
  return sub;
}

// El mes pagado empieza al confirmar, no al solicitar: si la transferencia tarda días, no se pierden.
//
// enforcePlanLimit() se llama DESPUÉS de que esta transacción confirme, no dentro: abre su propia
// conexión del pool, y si se llamara dentro leería el plan viejo (la transacción exterior todavía
// no ha hecho COMMIT). Ver el comentario de aplicarLimiteDePlan en db/limite-plan.ts.
export async function confirmarPago(subscriptionId: string) {
  const resultado = await tx(async (c) => {
    const sub = await pendiente(c, subscriptionId);
    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setMonth(fin.getMonth() + 1);

    await c.q("UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE provider_id = $1 AND status = 'active'", [sub.provider_id]);
    await c.q(`UPDATE subscriptions SET status = 'active', current_period_start = $1, current_period_end = $2, updated_at = now()
      WHERE id = $3`, [inicio.toISOString(), fin.toISOString(), sub.id]);

    const cobrado = await c.q("UPDATE payments SET status = 'succeeded' WHERE subscription_id = $1 AND status = 'pending' RETURNING id", [sub.id]);
    if (cobrado.length === 0) {
      await c.q(`INSERT INTO payments (id, subscription_id, provider_id, amount, status, metadata, created_at)
        VALUES ($1, $2, $3, $4, 'succeeded', $5, $6)`,
        [uuidv4(), sub.id, sub.provider_id, sub.amount, JSON.stringify({ confirmado_sin_reporte: true }), inicio.toISOString()]);
    }

    await c.q('UPDATE provider_profiles SET subscription_plan = $1, subscription_expires_at = $2, updated_at = now() WHERE id = $3',
      [sub.plan, fin.toISOString(), sub.provider_id]);
    return { ...sub, hasta: fin.toISOString() };
  });
  await enforcePlanLimit(resultado.provider_id);
  return resultado;
}

export async function rechazarPago(subscriptionId: string) {
  return tx(async (c) => {
    const sub = await pendiente(c, subscriptionId);
    await c.q("UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE id = $1", [sub.id]);
    await c.q("UPDATE payments SET status = 'failed' WHERE subscription_id = $1 AND status = 'pending'", [sub.id]);
    return sub;
  });
}
