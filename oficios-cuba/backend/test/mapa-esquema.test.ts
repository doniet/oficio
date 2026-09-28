import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

describe('migración 11 — mapa', () => {
  it('añade map_precision con DEFAULT exacta y el índice geo, desde una base vacía', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase, ESQUEMA_VERSION } = await import('../src/db/index.js');
    initDatabase();
    expect(ESQUEMA_VERSION).toBe(11);
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
