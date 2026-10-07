import { describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { metrosEntre, RADIO_APROX_MAX_M, RADIO_APROX_MIN_M } from '../src/lib/ubicacion.js';
import { seedMapa } from '../src/db/seed-mapa.js';

// Este archivo probaba, en SQLite, las migraciones 11-13 una a una (PRAGMA user_version, tablas
// creadas desde :memory:). El esquema de Postgres nació limpio en la v1 (db/migrar.ts) y las
// migraciones incrementales posteriores viven en db/migraciones.ts (la 2 es de DardoVentas, no
// del mapa): "migración 11/12/13" ya no significa nada. Lo que
// sigue prueba las MISMAS invariantes que esas migraciones protegían, contra el esquema final:
// que map_precision/show_on_map sigan naciendo con el valor seguro por defecto, que los
// municipios sembrados caigan dentro de Cuba, y — el corazón del archivo — que ningún perfil con
// punto se quede sin coordenada publicada y que los perfiles "zona" publiquen de verdad un punto
// dentro del anillo de 100-300 m. La comprobación de que `punto_pub` es una columna geography con
// índice GiST vive en test/esquema.test.ts (Tarea 5, describe 'PostGIS'); no se repite aquí.

describe('columnas del mapa: valores por defecto', () => {
  it('map_precision nace en «exacta»', async () => {
    const col = await qOne<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'provider_profiles' AND column_name = 'map_precision'`,
    );
    expect(col?.column_default).toContain("'exacta'");
  });

  it('show_on_map nace en false: la entrega no cambia la visibilidad de nadie', async () => {
    const col = await qOne<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'provider_profiles' AND column_name = 'show_on_map'`,
    );
    expect(col?.column_default).toContain('false');
  });
});

describe('coordenadas de municipios', () => {
  it('cada municipio sembrado cae dentro de Cuba', async () => {
    const fuera = await q(
      `SELECT name FROM municipalities WHERE lat NOT BETWEEN 19.7 AND 23.4 OR lng NOT BETWEEN -85.1 AND -73.9`,
    );
    expect(fuera).toEqual([]);
  });
});

describe('la coordenada publicada (punto_pub)', () => {
  // Se prueba de verdad sembrando 300 perfiles (seedMapa) y mirando la invariante sobre ellos, en
  // vez de simularlo en memoria: es más fuerte, y es el mismo camino (puntoPublico() + el INSERT
  // de db/seed-mapa.ts, hermano del UPDATE de routes/providers.ts) que produce datos reales.
  it('ningún perfil con punto se queda sin coordenada publicada, y los "zona" publican de verdad otro punto dentro del anillo', async () => {
    process.env.DEMO_MODE = 'true';
    await seedMapa();

    const huerfanos = await qOne<{ n: string }>(`
      SELECT count(*) AS n FROM provider_profiles
      WHERE lat IS NOT NULL AND punto_pub IS NULL
    `);
    expect(Number(huerfanos?.n)).toBe(0);

    // Y los 'zona' publican de verdad otro punto, dentro del anillo [100 m, 300 m].
    const zonas = await q<{ lat: number; lng: number; pl: number; pg: number }>(`
      SELECT lat, lng, ST_Y(punto_pub::geometry) AS pl, ST_X(punto_pub::geometry) AS pg
      FROM provider_profiles WHERE map_precision = 'zona' AND lat IS NOT NULL LIMIT 40
    `);
    expect(zonas.length).toBeGreaterThan(10);
    for (const z of zonas) {
      const d = metrosEntre({ lat: z.lat, lng: z.lng }, { lat: z.pl, lng: z.pg });
      expect(d).toBeGreaterThanOrEqual(RADIO_APROX_MIN_M - 1);
      expect(d).toBeLessThanOrEqual(RADIO_APROX_MAX_M + 1);
    }
  });
});
