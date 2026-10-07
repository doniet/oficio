import { readFileSync } from 'fs';
import { resolve } from 'path';
import { q, tx } from './acceso.js';
import { MIGRACIONES } from './migraciones.js';

export const ESQUEMA_VERSION = 1;

/**
 * Aplica esquema.sql (v1) si la base está vacía y después cada migración de MIGRACIONES que falte,
 * en orden y cada una en su propia transacción: si una falla, las anteriores quedan aplicadas y el
 * proceso muere (ver el .catch de start() en index.ts).
 */
export async function migrar() {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const ya = new Set((await q<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));

  if (!ya.has(ESQUEMA_VERSION)) {
    const sql = readFileSync(resolve(__dirname, 'esquema.sql'), 'utf8');
    await tx(async (c) => {
      await c.q(sql);
      await c.q('INSERT INTO schema_migrations (version) VALUES ($1)', [ESQUEMA_VERSION]);
    });
  }

  for (const m of MIGRACIONES) {
    if (ya.has(m.version)) continue;
    await tx(async (c) => {
      await c.q(m.sql);
      await c.q('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
    });
  }
}
