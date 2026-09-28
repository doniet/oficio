import { describe, expect, it, beforeEach } from 'vitest';

describe('seedMapa', () => {
  it('crea 300 perfiles visibles en el mapa, repartidos y con los tres planes', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    expect(await seedMapa()).toBe(300);
    const n = db.prepare('SELECT COUNT(*) c FROM provider_profiles WHERE show_on_map = 1').get() as { c: number };
    expect(n.c).toBeGreaterThanOrEqual(300);
    const planes = db.prepare("SELECT subscription_plan p, COUNT(*) c FROM provider_profiles WHERE business_name LIKE 'Prueba %' GROUP BY p").all() as any[];
    expect(planes.map((x) => x.p).sort()).toEqual(['basic', 'free', 'pro']);
    const provincias = db.prepare("SELECT COUNT(DISTINCT province_id) c FROM provider_profiles WHERE business_name LIKE 'Prueba %'").get() as { c: number };
    expect(provincias.c).toBeGreaterThanOrEqual(10);
  });

  it('es idempotente: correrlo dos veces no duplica', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    await seedMapa();
    expect(await seedMapa()).toBe(0);
  });

  it('se niega a correr en producción', async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'production';
    const { initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    await expect(seedMapa()).rejects.toThrow(/producción/i);
    delete process.env.NODE_ENV;
  });
});
