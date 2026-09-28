import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

describe('migración 11 — mapa', () => {
  it('añade map_precision con DEFAULT exacta y el índice geo, desde una base vacía', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase, ESQUEMA_VERSION } = await import('../src/db/index.js');
    initDatabase();
    expect(ESQUEMA_VERSION).toBe(12);
    const cols = (db.pragma('table_info(provider_profiles)') as { name: string; dflt_value: string | null }[]);
    const col = cols.find((c) => c.name === 'map_precision');
    expect(col).toBeDefined();
    expect(col!.dflt_value).toBe("'exacta'");
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pp_geo'").get();
    expect(idx).toBeDefined();
  });

  it('show_on_map sigue en DEFAULT 0: la entrega no cambia la visibilidad de nadie', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const cols = (db.pragma('table_info(provider_profiles)') as { name: string; dflt_value: string | null }[]);
    expect(cols.find((c) => c.name === 'show_on_map')!.dflt_value).toBe('0');
  });
});

describe('migración 12 — coordenadas reales de los municipios', () => {
  it('ningún municipio conserva el punto de la espiral', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    const { seedBase } = await import('../src/db/seed.js');
    initDatabase();
    seedBase();

    // La fórmula que se retiró: radio 0.06 + 0.035·√i en ángulo áureo desde la capital.
    const espiral = (base: { lat: number; lng: number }, i: number) => i === 0 ? base : {
      lat: base.lat + (0.06 + 0.035 * Math.sqrt(i)) * Math.sin(i * 2.39996),
      lng: base.lng + (0.06 + 0.035 * Math.sqrt(i)) * 1.2 * Math.cos(i * 2.39996),
    };
    const provs = db.prepare('SELECT id, name, lat, lng FROM provinces').all() as { id: string; name: string; lat: number; lng: number }[];
    let comprobados = 0;
    for (const p of provs) {
      const muns = db.prepare('SELECT name, lat, lng FROM municipalities WHERE province_id = ? ORDER BY rowid').all(p.id) as { name: string; lat: number; lng: number }[];
      muns.forEach((m, i) => {
        if (i === 0) return; // el índice 0 ES la capital: coincide por legítimo, no por la espiral
        const e = espiral(p, i);
        expect(Math.abs(e.lat - m.lat) + Math.abs(e.lng - m.lng), `${p.name}/${m.name} sigue en la espiral`).toBeGreaterThan(1e-6);
        comprobados++;
      });
    }
    expect(comprobados).toBeGreaterThan(100);
  });

  it('cada municipio cae dentro de Cuba', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    const { seedBase } = await import('../src/db/seed.js');
    initDatabase();
    seedBase();
    const fuera = db.prepare('SELECT name, lat, lng FROM municipalities WHERE lat NOT BETWEEN 19.7 AND 23.4 OR lng NOT BETWEEN -85.1 AND -73.9').all();
    expect(fuera).toEqual([]);
  });
});
