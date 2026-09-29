import type { PoolClient } from 'pg';
import { pool } from './conexion.js';

/**
 * El único modo de consultar dentro de una transacción. `tx()` entrega uno de
 * estos y no el pool a propósito: una consulta que use el pool dentro de una
 * transacción se ejecuta FUERA de ella y sobrevive al rollback, sin dar ningún
 * error. El test 'lo que se escribe con el pool dentro de una transacción NO se
 * deshace' documenta ese fallo.
 */
export type Tx = {
  q<T>(sql: string, params?: unknown[]): Promise<T[]>;
  qOne<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
};

export async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}

export async function qOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const { rows } = await pool.query(sql, params);
  return rows[0] as T | undefined;
}

export async function tx<T>(fn: (c: Tx) => Promise<T>): Promise<T> {
  const cliente: PoolClient = await pool.connect();
  const dentro: Tx = {
    async q<R>(sql: string, params: unknown[] = []) {
      const { rows } = await cliente.query(sql, params);
      return rows as R[];
    },
    async qOne<R>(sql: string, params: unknown[] = []) {
      const { rows } = await cliente.query(sql, params);
      return rows[0] as R | undefined;
    },
  };
  try {
    await cliente.query('BEGIN');
    const valor = await fn(dentro);
    await cliente.query('COMMIT');
    return valor;
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}
