import { describe, expect, it, beforeEach } from 'vitest';

describe('seedMapa', () => {
  // Nota: los tests de este archivo comparten un único proceso vitest ("pool: forks" aísla por
  // archivo, no por test), y con él la misma conexión ':memory:' — por eso todas las
  // comprobaciones sobre el sembrado van en ESTE test, en vez de repartirse en its() separados
  // que asumirían (equivocadamente) partir de una base vacía y solo verían el centinela ya puesto.
  // Lo sembrado se reconoce por el CORREO, no por el nombre del negocio: los nombres son
  // creíbles y variados a propósito, para que al tocar un punto del mapa se lea un negocio.
  it('crea 300 perfiles visibles en el mapa, repartidos y con los tres planes', async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.DEMO_MODE = 'true';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    const creados = await seedMapa();
    expect(creados).toBe(300);
    const n = db.prepare('SELECT COUNT(*) c FROM provider_profiles WHERE show_on_map = 1').get() as { c: number };
    expect(n.c).toBeGreaterThanOrEqual(300);
    const planes = db.prepare("SELECT subscription_plan p, COUNT(*) c FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'prueba.mapa.%@oficios.test') GROUP BY p").all() as { p: string; c: number }[];
    expect(planes.map((x) => x.p).sort()).toEqual(['basic', 'free', 'pro']);
    const provincias = db.prepare("SELECT COUNT(DISTINCT province_id) c FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'prueba.mapa.%@oficios.test')").get() as { c: number };
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
    const zona = db.prepare("SELECT COUNT(*) c FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'prueba.mapa.%@oficios.test') AND map_precision = 'zona'").get() as { c: number };
    expect(zona.c).toBeGreaterThanOrEqual(50); // ~1 de cada 5 de 300
    const CELDA_ZONA = 0.01;
    // La misma cuenta que hace /api/mapa (ROUND(lat/celda)) para saber si dos perfiles de zona
    // caen en el punto redondeado exactamente igual: eso es lo que la interfaz necesita ver.
    const apilados = db.prepare(`
      SELECT COUNT(*) c FROM (
        SELECT ROUND(lat / ?) cy, ROUND(lng / ?) cx, COUNT(*) n
        FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'prueba.mapa.%@oficios.test') AND map_precision = 'zona'
        GROUP BY cy, cx HAVING n >= 2
      )
    `).get(CELDA_ZONA, CELDA_ZONA) as { c: number };
    expect(apilados.c).toBeGreaterThanOrEqual(1);

    // Lo que impide sembrar en el mar: cada perfil cuelga del centro de SU municipio, que es un
    // pueblo y por tanto está en tierra. Antes se dispersaban ±33 km desde la capital provincial
    // y en provincias costeras eso caía al agua. Se exceptúan los tres apilados a propósito, que
    // van a un centro de celda fijo para que el redondeo de 'zona' sea observable.
    const lejos = db.prepare(`
      SELECT COUNT(*) c FROM provider_profiles pp
      JOIN municipalities m ON pp.municipality_id = m.id
      JOIN users u ON pp.user_id = u.id
      WHERE u.email LIKE 'prueba.mapa.%@oficios.test'
        AND (ABS(pp.lat - m.lat) > 0.009 OR ABS(pp.lng - m.lng) > 0.009)
    `).get() as { c: number };
    expect(lejos.c).toBeLessThanOrEqual(3);

    const fueraDeCuba = db.prepare(`
      SELECT COUNT(*) c FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      WHERE u.email LIKE 'prueba.mapa.%@oficios.test'
        AND (pp.lat NOT BETWEEN 19.7 AND 23.4 OR pp.lng NOT BETWEEN -85.1 AND -73.9)
    `).get() as { c: number };
    expect(fueraDeCuba.c).toBe(0);
  });

  it('es idempotente: correrlo dos veces no duplica', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    await seedMapa();
    expect(await seedMapa()).toBe(0);
  });

  // El guardia mira DEMO_MODE y no NODE_ENV: lo que hay que proteger es una base con datos
  // reales, y ese es el marcador que el proyecto ya usa para distinguirla. Con NODE_ENV se
  // protegía menos, porque perder la variable dejaba la base abierta.
  it('se niega a sembrar sin DEMO_MODE, aunque NODE_ENV no diga producción', async () => {
    process.env.DATABASE_PATH = ':memory:';
    delete process.env.DEMO_MODE;
    delete process.env.NODE_ENV;
    const { initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    await expect(seedMapa()).rejects.toThrow(/DEMO_MODE/);
    process.env.DEMO_MODE = 'true';
  });
});
