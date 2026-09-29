import { describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import './helpers.js';

describe('aislamiento de la base de test', () => {
  it('trae el seed base: provincias y categorías', async () => {
    expect(Number((await qOne<{ n: string }>('SELECT count(*) AS n FROM provinces'))!.n)).toBeGreaterThan(0);
    expect(Number((await qOne<{ n: string }>('SELECT count(*) AS n FROM categories'))!.n)).toBeGreaterThan(0);
  });

  it('arranca sin usuarios: DEMO_MODE está apagado en los tests', async () => {
    expect((await qOne<{ n: string }>('SELECT count(*) AS n FROM users'))!.n).toBe('0');
  });

  it('escribe en su propia base, no en la plantilla', async () => {
    await q(`INSERT INTO telegram_state (key, value) VALUES ('marca-aislamiento', 'x')`);
    const suya = await qOne(`SELECT 1 FROM telegram_state WHERE key = 'marca-aislamiento'`);
    expect(suya).toBeDefined();
    // Si este test contaminara la plantilla, el resto de los otros archivos vería la marca.
    const nombre = await qOne<{ db: string }>('SELECT current_database() AS db');
    expect(nombre?.db).not.toBe('oficio_test_plantilla');
  });
});
