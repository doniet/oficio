import type { Tx } from './acceso.js';
import { aplicarLimiteDePlan } from './limite-plan.js';

// Lo comparten la API (desvincular desde el panel) y oficio_notifier (canje y 410). Por eso no
// importa db/index.ts: ver notifier/db.ts.

/**
 * Profesional regalado mientras dure la integración. Nunca acorta: un plan de pago sin
 * caducidad se queda sin caducidad, y uno que vence después de `hasta` conserva su fecha.
 * En el SET, `subscription_plan` y `subscription_expires_at` son aún los valores viejos.
 */
export async function regalarPro(c: Tx, providerId: string, hasta: Date) {
  await c.q(
    `UPDATE provider_profiles SET
       subscription_expires_at = CASE
         WHEN subscription_plan <> 'free' AND subscription_expires_at IS NULL THEN NULL
         WHEN subscription_plan <> 'free' THEN GREATEST(subscription_expires_at, $2::timestamptz)
         ELSE $2::timestamptz END,
       subscription_plan = 'pro',
       updated_at = now()
     WHERE id = $1`,
    [providerId, hasta.toISOString()],
  );
  await aplicarLimiteDePlan(c, providerId);
}

/**
 * Retira el catálogo importado y el vínculo. `ocultarDelMapa` es para el 410: el comerciante
 * retiró el consentimiento en mi.dardoventas.com y el negocio sale del mapa hasta que él lo
 * vuelva a marcar. Desde el panel de Encuentrauno no se toca: ahí decide él.
 */
export async function desvincular(c: Tx, providerId: string, ocultarDelMapa: boolean) {
  await c.q("DELETE FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas'", [providerId]);
  await c.q(
    `UPDATE provider_profiles SET dardoventas_slug = NULL, dardoventas_linked_at = NULL, dardoventas_etag = NULL,
       dardoventas_synced_at = NULL, dardoventas_fallos = 0, dardoventas_reintento_en = NULL,
       show_on_map = CASE WHEN $2 THEN false ELSE show_on_map END, updated_at = now()
     WHERE id = $1`,
    [providerId, ocultarDelMapa],
  );
  // Borrar deja hueco en el tope del plan: un artículo propio oculto puede volver a verse.
  await aplicarLimiteDePlan(c, providerId);
}
