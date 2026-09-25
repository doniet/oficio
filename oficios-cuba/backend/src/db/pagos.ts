import { v4 as uuidv4 } from 'uuid';
import db, { enforcePlanLimit } from './index.js';

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
export function pagosPendientes(): PagoPendiente[] {
  const rows = db.prepare(`
    SELECT s.id AS subscription_id, s.plan, s.amount, s.created_at AS solicitado,
      pp.business_name, u.full_name, u.email,
      (SELECT p.metadata FROM payments p WHERE p.subscription_id = s.id AND p.status = 'pending' ORDER BY p.created_at DESC LIMIT 1) AS metadata
    FROM subscriptions s
    JOIN provider_profiles pp ON s.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    WHERE s.status = 'pending'
    ORDER BY s.created_at
  `).all() as (Omit<PagoPendiente, 'transaction_id'> & { metadata: string | null })[];
  return rows.map(({ metadata, ...r }) => {
    let transaction_id: string | null = null;
    try { transaction_id = metadata ? JSON.parse(metadata).transaction_id ?? null : null; } catch { /* metadata corrupta */ }
    return { ...r, transaction_id };
  });
}

function pendiente(subscriptionId: string) {
  const sub = db.prepare("SELECT id, provider_id, plan, amount FROM subscriptions WHERE id = ? AND status = 'pending'")
    .get(subscriptionId) as { id: string; provider_id: string; plan: string; amount: number } | undefined;
  if (!sub) throw new Error(`No hay ninguna suscripción pendiente con id ${subscriptionId}`);
  return sub;
}

// El mes pagado empieza al confirmar, no al solicitar: si la transferencia tarda días, no se pierden.
export function confirmarPago(subscriptionId: string) {
  return db.transaction(() => {
    const sub = pendiente(subscriptionId);
    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setMonth(fin.getMonth() + 1);

    db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE provider_id = ? AND status = 'active'")
      .run(sub.provider_id);
    db.prepare(`UPDATE subscriptions SET status = 'active', current_period_start = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(inicio.toISOString(), fin.toISOString(), sub.id);

    const cobrado = db.prepare("UPDATE payments SET status = 'succeeded' WHERE subscription_id = ? AND status = 'pending'").run(sub.id);
    if (cobrado.changes === 0) {
      db.prepare(`INSERT INTO payments (id, subscription_id, provider_id, amount, status, metadata, created_at)
        VALUES (?, ?, ?, ?, 'succeeded', ?, ?)`)
        .run(uuidv4(), sub.id, sub.provider_id, sub.amount, JSON.stringify({ confirmado_sin_reporte: true }), inicio.toISOString());
    }

    db.prepare('UPDATE provider_profiles SET subscription_plan = ?, subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(sub.plan, fin.toISOString(), sub.provider_id);
    enforcePlanLimit(sub.provider_id);
    return { ...sub, hasta: fin.toISOString() };
  })();
}

export function rechazarPago(subscriptionId: string) {
  return db.transaction(() => {
    const sub = pendiente(subscriptionId);
    db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sub.id);
    db.prepare("UPDATE payments SET status = 'failed' WHERE subscription_id = ? AND status = 'pending'").run(sub.id);
    return sub;
  })();
}
