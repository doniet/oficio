import { readFileSync } from 'fs';
import { resolve } from 'path';
import { q, tx } from './acceso.js';

export const ESQUEMA_VERSION = 1;

/**
 * Aplica el esquema si la base está vacía. No hay migraciones incrementales
 * todavía: el esquema nació limpio en la v1 de Postgres, sin arrastrar las 13
 * migraciones de la época de SQLite. Cuando haya que cambiar el esquema con
 * datos reales en producción, esta función crece con un array de migraciones
 * como el que tenía db/index.ts.
 */
export async function migrar() {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const ya = await q<{ version: number }>('SELECT version FROM schema_migrations');
  if (ya.some((r) => r.version === ESQUEMA_VERSION)) return;

  const sql = readFileSync(resolve(__dirname, 'esquema.sql'), 'utf8');
  await tx(async (c) => {
    await c.q(sql);
    await c.q('INSERT INTO schema_migrations (version) VALUES ($1)', [ESQUEMA_VERSION]);
  });
}
