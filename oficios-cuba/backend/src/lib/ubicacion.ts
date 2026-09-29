import { randomInt } from 'node:crypto';

/**
 * La coordenada que se publica de un perfil.
 *
 * Un perfil `exacta` publica la suya. Uno `zona` publica un punto desplazado entre 100 y 300 m
 * en una dirección al azar («donut masking»), así que el negocio está en alguna parte del
 * círculo de 300 m que la interfaz dibuja alrededor del punto publicado.
 *
 * Dos reglas que parecen detalles y son la razón de que esto sirva de algo:
 *
 * 1. **Se sortea UNA vez y se guarda.** Si se sorteara al servir, bastaría pedir el mismo perfil
 *    muchas veces y promediar los puntos para recuperar el verdadero. Se recalcula solo cuando el
 *    dueño mueve su ubicación o cambia de precisión — nunca al guardar otros campos, o su pin
 *    saltaría de sitio cada vez que corrige un teléfono.
 * 2. **El mínimo de 100 m importa tanto como el máximo.** Sin él, el sorteo puede devolver un
 *    punto pegado al real y la protección desaparece justo en los casos desafortunados.
 */

export const RADIO_APROX_MIN_M = 100;
export const RADIO_APROX_MAX_M = 300;

const METROS_POR_GRADO_LAT = 111_320;
const ESCALA = 1_000_000;

/**
 * Math.random() NO vale aquí. El generador de V8 es xorshift128+: no es criptográfico y su estado
 * interno se puede reconstruir observando suficientes salidas. Los puntos publicados son, en la
 * práctica, salidas observables; con bastantes perfiles alguien podría reconstruir el generador e
 * invertir el desplazamiento de TODOS, recuperando las ubicaciones exactas.
 */
const azar = () => randomInt(0, ESCALA) / ESCALA;

export type Precision = 'exacta' | 'zona';

/** Un punto al azar del anillo [100 m, 300 m] alrededor de (lat, lng). */
export function desplazar(lat: number, lng: number): { lat: number; lng: number } {
  // r = √(min² + u·(max²−min²)) reparte los puntos de forma pareja por ÁREA del anillo. Sortear la
  // distancia directamente los amontonaría cerca del borde interior, que es donde menos protegen.
  const u = azar();
  const r = Math.sqrt(RADIO_APROX_MIN_M ** 2 + u * (RADIO_APROX_MAX_M ** 2 - RADIO_APROX_MIN_M ** 2));
  const angulo = azar() * 2 * Math.PI;

  const dLat = (r * Math.cos(angulo)) / METROS_POR_GRADO_LAT;
  // Un grado de longitud mide menos según subes de latitud; sin el coseno el desplazamiento
  // saldría estirado en el eje este-oeste.
  const dLng = (r * Math.sin(angulo)) / (METROS_POR_GRADO_LAT * Math.cos((lat * Math.PI) / 180));

  return { lat: lat + dLat, lng: lng + dLng };
}

/** La coordenada pública de un perfil, según su precisión. Sin punto propio, no hay pública. */
export function puntoPublico(lat: number | null, lng: number | null, precision: Precision) {
  if (lat == null || lng == null) return { lat: null, lng: null };
  if (precision === 'exacta') return { lat, lng };
  return desplazar(lat, lng);
}

/**
 * Decide si hay que volver a sortear. Solo cuando cambia lo que define el punto: la ubicación o la
 * precisión. Guardar el resto del perfil no puede mover el pin de sitio.
 */
export function hayQueRecalcular(
  antes: { lat: number | null; lng: number | null; map_precision: string | null; map_lat_pub: number | null },
  ahora: { lat: number | null; lng: number | null; map_precision: string },
) {
  if (antes.lat !== ahora.lat || antes.lng !== ahora.lng) return true;
  if ((antes.map_precision ?? 'exacta') !== ahora.map_precision) return true;
  // Falta la pública pero hay punto: perfil anterior a la migración, o escritura que se la saltó.
  return ahora.lat != null && antes.map_lat_pub == null;
}

/** Metros entre dos coordenadas. Para pruebas y verificaciones; no hace falta precisión geodésica. */
export function metrosEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (b.lat - a.lat) * METROS_POR_GRADO_LAT;
  const dLng = (b.lng - a.lng) * METROS_POR_GRADO_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}
