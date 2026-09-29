import { afterAll, describe, expect, it } from 'vitest';
import { pool, cerrarPool } from '../src/db/conexion.js';

afterAll(async () => { await cerrarPool(); });

describe('conexión a Postgres', () => {
  it('conecta y responde', async () => {
    const { rows } = await pool.query('SELECT 1 AS uno');
    expect(rows[0].uno).toBe(1);
  });

  it('tiene PostGIS disponible', async () => {
    const { rows } = await pool.query('SELECT postgis_version() AS v');
    expect(rows[0].v).toMatch(/^3\./);
  });

  it('tiene ICU para colación en español', async () => {
    const { rows } = await pool.query(
      `SELECT 'ñandú' < 'oveja' COLLATE "es-ES-x-icu" AS ordena`,
    );
    expect(rows[0].ordena).toBe(true);
  });
});
