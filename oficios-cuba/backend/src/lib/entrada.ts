import db from '../db/index.js';

// Express convierte `?q=a&q=b` en un array: se toma el primer valor de texto.
export function textoQuery(v: unknown): string | undefined {
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' ? v : undefined;
}

export function queryTextos<K extends string>(query: Record<string, unknown>, claves: readonly K[]) {
  return Object.fromEntries(claves.map((k) => [k, textoQuery(query[k])])) as Record<K, string | undefined>;
}

const SUBIDA = /^\/api\/uploads\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/;

// Una imagen vale si es de las de demostración, si es una subida del propio usuario, o si ya estaba
// guardada (datos anteriores a esta regla). Las URLs externas no: la CSP de nginx las bloquearía.
export function imagenPermitida(url: string, userId: string, yaGuardadas: string[] = []) {
  if (yaGuardadas.includes(url)) return true;
  if (/^\/demo\/[\w-]+\.webp$/.test(url)) return true;
  const m = SUBIDA.exec(url);
  return Boolean(m && db.prepare('SELECT 1 FROM uploads WHERE name = ? AND user_id = ?').get(m[1], userId));
}
