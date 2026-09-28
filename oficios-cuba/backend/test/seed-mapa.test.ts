import { describe, expect, it, beforeEach } from 'vitest';

describe('seedMapa', () => {
  // Nota: los tests de este archivo comparten un único proceso vitest ("pool: forks" aísla por
  // archivo, no por test), y con él la misma conexión ':memory:' — por eso todas las
  // comprobaciones sobre el sembrado van en ESTE test, en vez de repartirse en its() separados
  // que asumirían (equivocadamente) partir de una base vacía y solo verían el centinela ya puesto.
  it('crea 300 perfiles visibles en el mapa, repartidos y con los tres planes', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    const creados = await seedMapa();
    expect(creados).toBe(300);
    const n = db.prepare('SELECT COUNT(*) c FROM provider_profiles WHERE show_on_map = 1').get() as { c: number };
    expect(n.c).toBeGreaterThanOrEqual(300);
    const planes = db.prepare("SELECT subscription_plan p, COUNT(*) c FROM provider_profiles WHERE business_name LIKE 'Prueba %' GROUP BY p").all() as { p: string; c: number }[];
    expect(planes.map((x) => x.p).sort()).toEqual(['basic', 'free', 'pro']);
    const provincias = db.prepare("SELECT COUNT(DISTINCT province_id) c FROM provider_profiles WHERE business_name LIKE 'Prueba %'").get() as { c: number };
    expect(provincias.c).toBeGreaterThanOrEqual(10);

    // Ronda de arreglo 1: la prueba de arriba (antes de esto) solo comprobaba que existieran los
    // tres planes, y eso dejó pasar un 16,7 % de básico disfrazado de "~25 %". Se cuenta de
    // verdad, con ±3 puntos de tolerancia sobre el objetivo (40 % free / 25 % basic / 35 % pro).
    const pct = Object.fromEntries(planes.map((x) => [x.p, (x.c / creados) * 100])) as Record<string, number>;
    expect(pct.free).toBeGreaterThanOrEqual(37);
    expect(pct.free).toBeLessThanOrEqual(43);
    expect(pct.basic).toBeGreaterThanOrEqual(22);
    expect(pct.basic).toBeLessThanOrEqual(28);
    expect(pct.pro).toBeGreaterThanOrEqual(32);
    expect(pct.pro).toBeLessThanOrEqual(38);

    // Ronda de arreglo 1: antes del arreglo los 300 quedaban en 'exacta' (el default de la
    // columna) porque el INSERT nunca tocaba map_precision, así que el camino de coordenada
    // redondeada de /api/mapa no tenía ni un dato de desarrollo que lo mostrara.
    const zona = db.prepare("SELECT COUNT(*) c FROM provider_profiles WHERE business_name LIKE 'Prueba %' AND map_precision = 'zona'").get() as { c: number };
    expect(zona.c).toBeGreaterThanOrEqual(50); // ~1 de cada 5 de 300
    const CELDA_ZONA = 0.01;
    // La misma cuenta que hace /api/mapa (ROUND(lat/celda)) para saber si dos perfiles de zona
    // caen en el punto redondeado exactamente igual: eso es lo que la interfaz necesita ver.
    const apilados = db.prepare(`
      SELECT COUNT(*) c FROM (
        SELECT ROUND(lat / ?) cy, ROUND(lng / ?) cx, COUNT(*) n
        FROM provider_profiles WHERE business_name LIKE 'Prueba %' AND map_precision = 'zona'
        GROUP BY cy, cx HAVING n >= 2
      )
    `).get(CELDA_ZONA, CELDA_ZONA) as { c: number };
    expect(apilados.c).toBeGreaterThanOrEqual(1);
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
