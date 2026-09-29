import { z } from 'zod';
import { qOne } from '../db/acceso.js';

// Express convierte `?q=a&q=b` en un array: se toma el primer valor de texto.
export function textoQuery(v: unknown): string | undefined {
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' ? v : undefined;
}

export function queryTextos<K extends string>(query: Record<string, unknown>, claves: readonly K[]) {
  return Object.fromEntries(claves.map((k) => [k, textoQuery(query[k])])) as Record<K, string | undefined>;
}

export const esUuid = (v: string) => z.string().uuid().safeParse(v).success;

/**
 * El filtro `category` de providers/services/mapa acepta un uuid o un slug (el menú de
 * categorías manda slugs; algunos enlaces guardados, uuid). Comparar el mismo valor a la vez
 * contra `id` (columna uuid) y `slug` (columna texto) revienta en Postgres si no tiene forma de
 * uuid — 22P02 en el bind, antes de evaluar la fila — y errorHandler lo traduce a 404 sobre el
 * listado entero (el mismo problema que uuidQuery resuelve para province_id/municipality_id, pero
 * ahí no sirve: aquí el valor sin forma de uuid es un slug legítimo, no "sin filtro"). La
 * respuesta correcta no es sustituir por un centinela: es elegir la columna según el formato
 * ANTES de construir la consulta.
 */
export function categoriaColumna(valor: string): 'id' | 'slug' {
  return esUuid(valor) ? 'id' : 'slug';
}

// uuid que ni uuidv4() ni ningún seed genera nunca (todo ceros): un filtro que compara contra él no
// puede igualar ninguna fila real, así que sirve para forzar "sin resultados" sin tocar el resto del
// WHERE ni la forma de la respuesta de cada ruta.
const SIN_COINCIDENCIA = '00000000-0000-0000-0000-000000000000';

/**
 * Filtro de query que se compara contra una columna `uuid` (province_id, municipality_id, ...).
 * Con SQLite (columna TEXT) un valor sin forma de uuid simplemente no igualaba ninguna fila: la
 * ruta seguía respondiendo 200 con lista vacía. En Postgres, comparar un literal que no es uuid
 * contra una columna uuid lanza 22P02 en el bind, y errorHandler lo traduce a 404 — así que hay que
 * validar antes de que Postgres decida. Si `valor` no vino, no hay filtro (undefined); si vino pero
 * no es un uuid, se sustituye por uno que nunca puede coincidir, para conservar el 200 vacío en vez
 * de un 404 o de ignorar el filtro que el usuario pidió.
 */
export function uuidQuery(valor: string | undefined): string | undefined {
  if (valor === undefined) return undefined;
  return esUuid(valor) ? valor : SIN_COINCIDENCIA;
}

const SUBIDA = /^\/api\/uploads\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/;

// Una imagen vale si es de las de demostración, si es una subida del propio usuario, o si ya estaba
// guardada (datos anteriores a esta regla). Las URLs externas no: la CSP de nginx las bloquearía.
export async function imagenPermitida(url: string, userId: string, yaGuardadas: string[] = []) {
  if (yaGuardadas.includes(url)) return true;
  if (/^\/demo\/[\w-]+\.webp$/.test(url)) return true;
  const m = SUBIDA.exec(url);
  return Boolean(m && await qOne('SELECT 1 FROM uploads WHERE name = $1 AND user_id = $2', [m[1], userId]));
}
