import { planDe } from '../config.js';
import { q, qOne, tx } from './acceso.js';
import type { Tx } from './acceso.js';

export const PLAN_WEIGHT_SQL =
  "CASE pp.subscription_plan WHEN 'pro' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END";

// El plan manda: segunPlan() muestra como oficio a quien no lo tenga incluido, así que todo SQL
// que separe negocios de oficios tiene que decir lo mismo. Una sola definición, importada, para
// que la lista y el mapa no puedan contradecirse.
export const CON_NEGOCIO_SQL = "pp.subscription_plan = 'pro'";

// Lo mismo para el catálogo: qué artículo se ve depende del plan del perfil y del tope que ese
// plan permite (`hidden_by_plan`). `catalog_items` no tiene `is_active`.
export const CON_CATALOGO_SQL =
  "pp.subscription_plan IN ('basic', 'pro') AND ci.hidden_by_plan = false";

// Hasta 3 categorías (o su categoría padre) de los oficios activos de un perfil, la más usada
// primero. La usan PUBLIC_COLUMNS en providers.ts (listado y detalle) y el resumen del mapa
// (pestaña Negocios), para que ninguno de los dos invente una segunda forma de sacar la categoría
// principal. json_group_array de SQLite no existe en Postgres: jsonb_agg sobre una subconsulta
// ordenada. El ORDER BY de dentro no es decorativo — jsonb_agg agrega las filas en el orden en que
// llegan de la subconsulta, así que sin él "la categoría principal" de un perfil cambiaría entre
// dos peticiones idénticas.
export const CATEGORIAS_SQL = `(SELECT jsonb_agg(name ORDER BY usos DESC, name) FROM (
  SELECT COALESCE(parent.name, c.name) AS name, count(*) AS usos
    FROM services s
    JOIN categories c ON s.category_id = c.id
    LEFT JOIN categories parent ON c.parent_id = parent.id
   WHERE s.provider_id = pp.id AND s.is_active = true
   GROUP BY COALESCE(parent.name, c.name)
   ORDER BY usos DESC, name
   LIMIT 3
) AS top)`;

/**
 * La coordenada que se publica, sacada de la columna geography. Sustituye a
 * LAT_SERVIDA/LNG_SERVIDA calculadas al servir. Sigue siendo la ÚNICA definición de "lo que se
 * publica": la presencia de un perfil en el mapa depende de lo mismo que se sirve. Filtrar
 * por pp.lat/pp.lng reabriría el oráculo de bisección.
 */
export const LAT_SERVIDA = 'ST_Y(pp.punto_pub::geometry)';
export const LNG_SERVIDA = 'ST_X(pp.punto_pub::geometry)';
export const PUNTO_PUB_SQL = 'pp.punto_pub';

function comoArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw; // jsonb: pg ya lo parseó
  if (typeof raw !== 'string') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Acepta las dos formas a propósito: los seeds escriben cadenas y `pg` devuelve arrays ya
// parseados desde una columna jsonb.
export function parseImages(raw: unknown): string[] {
  return comoArray(raw).filter((x): x is string => typeof x === 'string');
}

/** Renglones de la lista de precios de un oficio, en la moneda del oficio. */
export function parsePriceList(raw: unknown): { name: string; price: number }[] {
  return comoArray(raw).filter(
    (x): x is { name: string; price: number } =>
      !!x && typeof x === 'object'
      && typeof (x as { name?: unknown }).name === 'string'
      && typeof (x as { price?: unknown }).price === 'number',
  );
}

export async function planDelPerfil(providerId: string) {
  const row = await qOne<{ subscription_plan: string }>(
    'SELECT subscription_plan FROM provider_profiles WHERE id = $1', [providerId],
  );
  return planDe(row?.subscription_plan);
}

export async function providerProfileIdFor(userId: string): Promise<string | undefined> {
  const row = await qOne<{ id: string }>('SELECT id FROM provider_profiles WHERE user_id = $1', [userId]);
  return row?.id;
}

export async function refreshProviderRating(providerId: string) {
  // reviews.provider_profile_id (Tarea 3): el nombre de la columna ya dice que es el id del
  // perfil, no del usuario. No confundir con catalog_items/services.provider_id, que sí lo son.
  const stats = await qOne<{ avg_rating: string | null; count: string }>(
    'SELECT AVG(rating) AS avg_rating, count(*) AS count FROM reviews WHERE provider_profile_id = $1',
    [providerId],
  );
  // AVG y count(*) llegan como cadena (numeric/bigint): Number(...) en los dos.
  const promedio = stats?.avg_rating ? Math.round(Number(stats.avg_rating) * 10) / 10 : 0;
  await q(
    'UPDATE provider_profiles SET rating = $1, review_count = $2, updated_at = now() WHERE id = $3',
    [promedio, Number(stats?.count ?? 0), providerId],
  );
}

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
async function aplicarLimiteDePlan(c: Tx, providerId: string) {
  const row = await c.qOne<{ subscription_plan: string }>(
    'SELECT subscription_plan FROM provider_profiles WHERE id = $1', [providerId],
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

export async function enforcePlanLimit(providerId: string) {
  await tx((c) => aplicarLimiteDePlan(c, providerId));
}

export async function expireSubscriptions() {
  const now = new Date().toISOString();
  await tx(async (c) => {
    const vencidos = await c.q<{ id: string }>(
      `SELECT id FROM provider_profiles
       WHERE subscription_plan != 'free' AND subscription_expires_at IS NOT NULL AND subscription_expires_at < $1`,
      [now],
    );
    for (const { id } of vencidos) {
      await c.q("UPDATE provider_profiles SET subscription_plan = 'free', updated_at = now() WHERE id = $1", [id]);
      await aplicarLimiteDePlan(c, id);
    }
    await c.q(
      "UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE status = 'active' AND current_period_end < $1",
      [now],
    );
  });
}
