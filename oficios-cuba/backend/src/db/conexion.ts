import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');

export const pool = new Pool({
  connectionString: url,
  // Por proceso. Con varios procesos de API, procesos × max tiene que caber
  // en el max_connections de Postgres con margen.
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function cerrarPool() {
  await pool.end();
}
