import { planDe } from '../planes.js';
import type { Tx } from './acceso.js';

// Deja activos como máximo los servicios que permite el plan actual: se conservan los más
// antiguos y el resto se pausa (el proveedor puede elegir cuáles pausando y reactivando).
// Se llama en cada cambio de plan, hacia arriba o hacia abajo.
//
// Recibe el cliente de la transacción (`c`) en vez de abrir la suya: expireSubscriptions() la
// llama una vez por perfil vencido, DENTRO de su propia tx(), y necesita ver ahí mismo el plan
// 'free' que acaba de escribir — todavía sin COMMIT. Si esta función abriera su propia tx()
// (su propia conexión del pool), leería el plan viejo, porque la transacción exterior no ha
// confirmado todavía. enforcePlanLimit() (la versión exportada, para el resto de llamadores)
// simplemente abre su propia tx() y delega aquí.
export async function aplicarLimiteDePlan(c: Tx, providerId: string) {
  // FOR UPDATE: el perfil se bloquea antes que catalog_items/services, el mismo orden que la sincronización, para no abrazarse con ella.
  const row = await c.qOne<{ subscription_plan: string }>(
    'SELECT subscription_plan FROM provider_profiles WHERE id = $1 FOR UPDATE', [providerId],
  );
  if (!row) return;
  const { maxServices: max, maxCatalog } = planDe(row.subscription_plan);
  // Catálogo: se ven los `maxCatalog` más antiguos; al subir de plan reaparecen solos.
  await c.q(
    `UPDATE catalog_items SET hidden_by_plan = CASE WHEN id IN (
      SELECT id FROM catalog_items WHERE provider_id = $1 ORDER BY created_at, id LIMIT $2
    ) THEN false ELSE true END WHERE provider_id = $1`,
    [providerId, maxCatalog],
  );
  if (max === null) return;
  // Postgres admite OFFSET sin LIMIT (a diferencia del `LIMIT -1 OFFSET ?` que exigía SQLite):
  // "todo lo que sobre después de los `max` más antiguos" se pausa.
  await c.q(
    `UPDATE services SET is_active = false, updated_at = now()
     WHERE id IN (SELECT id FROM services WHERE provider_id = $1 AND is_active = true ORDER BY created_at, id OFFSET $2)`,
    [providerId, max],
  );
}
