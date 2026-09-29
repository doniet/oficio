import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { q, qOne, tx } from '../src/db/acceso.js';
import { cerrarPool } from '../src/db/conexion.js';

beforeAll(async () => {
  await q('CREATE TABLE IF NOT EXISTS prueba_acceso (id int PRIMARY KEY, nombre text)');
  await q('TRUNCATE prueba_acceso');
});

afterAll(async () => {
  await q('DROP TABLE IF EXISTS prueba_acceso');
  await cerrarPool();
});

describe('q y qOne', () => {
  it('q devuelve todas las filas', async () => {
    await q('INSERT INTO prueba_acceso VALUES ($1, $2), ($3, $4)', [1, 'uno', 2, 'dos']);
    const filas = await q<{ id: number }>('SELECT id FROM prueba_acceso ORDER BY id');
    expect(filas.map((f) => f.id)).toEqual([1, 2]);
  });

  it('qOne devuelve una fila', async () => {
    const fila = await qOne<{ nombre: string }>('SELECT nombre FROM prueba_acceso WHERE id = $1', [1]);
    expect(fila?.nombre).toBe('uno');
  });

  it('qOne devuelve undefined si no hay fila, no null', async () => {
    expect(await qOne('SELECT 1 FROM prueba_acceso WHERE id = $1', [999])).toBeUndefined();
  });
});

describe('tx', () => {
  it('confirma los cambios si la función termina bien', async () => {
    await tx(async (c) => { await c.q('INSERT INTO prueba_acceso VALUES ($1, $2)', [10, 'diez']); });
    expect(await qOne('SELECT 1 FROM prueba_acceso WHERE id = 10')).toBeDefined();
  });

  it('deshace TODO si la función lanza', async () => {
    await expect(tx(async (c) => {
      await c.q('INSERT INTO prueba_acceso VALUES ($1, $2)', [20, 'veinte']);
      throw new Error('a propósito');
    })).rejects.toThrow('a propósito');
    expect(await qOne('SELECT 1 FROM prueba_acceso WHERE id = 20')).toBeUndefined();
  });

  it('las lecturas de dentro ven las escrituras de dentro', async () => {
    const visto = await tx(async (c) => {
      await c.q('INSERT INTO prueba_acceso VALUES ($1, $2)', [30, 'treinta']);
      return c.qOne<{ nombre: string }>('SELECT nombre FROM prueba_acceso WHERE id = 30');
    });
    expect(visto?.nombre).toBe('treinta');
  });

  it('lo que se escribe con el pool dentro de una transacción NO se deshace', async () => {
    // Este test documenta el fallo que la API de tx() existe para hacer imposible.
    // Si alguien llama a q() (el pool) dentro de tx(), su escritura queda fuera
    // de la transacción y sobrevive al rollback.
    await expect(tx(async (c) => {
      await c.q('INSERT INTO prueba_acceso VALUES ($1, $2)', [40, 'dentro']);
      await q('INSERT INTO prueba_acceso VALUES ($1, $2)', [41, 'fuera']);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await qOne('SELECT 1 FROM prueba_acceso WHERE id = 40')).toBeUndefined();
    expect(await qOne('SELECT 1 FROM prueba_acceso WHERE id = 41')).toBeDefined();
  });

  it('devuelve el cliente al pool aunque la función lance', async () => {
    for (let i = 0; i < 30; i++) {
      await tx(async () => { throw new Error('x'); }).catch(() => {});
    }
    // Con max: 10, si tx() no liberara el cliente esto se quedaría colgado.
    expect((await q('SELECT 1 AS ok'))[0]).toEqual({ ok: 1 });
  });
});
