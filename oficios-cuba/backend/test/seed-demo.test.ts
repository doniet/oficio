import { describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { seedDemo } from '../src/db/seed-demo.js';

async function contar(tabla: string): Promise<number> {
  const row = await qOne<{ count: string }>(`SELECT count(*) AS count FROM ${tabla}`);
  return Number(row?.count ?? 0); // count(*) llega como cadena (bigint de pg).
}

// Fix round 1 de la Tarea 15: seedDemo() vivía, en SQLite, dentro de UNA transacción síncrona —
// cualquier fallo a medio camino la revertía entera. Al portar a Postgres, refreshProviderRating()
// tiene que correr con el pool (no puede ir dentro de una tx(), es la misma regla que documenta
// db/pagos.ts y routes/services.ts), así que el sembrado quedó partido en tres tramos que YA NO
// comparten una única transacción. Si el primer tramo confirma y el segundo o el tercero fallan,
// la base queda con perfiles/servicios a medias, y el guardián de seedDemo() (que mira si existe
// 'cliente@demo.com') los daría por "ya sembrado" en el siguiente intento sin reparar nada.
//
// Para forzar un fallo real a mitad de camino (sin meter un `if` de prueba en el código de
// producción) se instala un trigger que hace fallar el PRIMER INSERT en `reviews` — la tabla que
// escribe el segundo tramo, después de que el primero ya haya confirmado usuarios/perfiles/
// servicios. Es un fallo genuino de Postgres, de la misma familia que "una reseña que choca con
// una restricción" que describe el registro de revisión.
async function conFalloForzadoEnReviews<T>(fn: () => Promise<T>): Promise<T> {
  await q(`
    CREATE OR REPLACE FUNCTION _test_fallo_reviews() RETURNS trigger AS $f$
    BEGIN
      RAISE EXCEPTION 'fallo forzado por el test (recuperación de seedDemo, Tarea 15)';
    END;
    $f$ LANGUAGE plpgsql;
    CREATE TRIGGER _test_fallo_reviews_trigger BEFORE INSERT ON reviews
      FOR EACH ROW EXECUTE FUNCTION _test_fallo_reviews();
  `);
  try {
    return await fn();
  } finally {
    await q(`
      DROP TRIGGER IF EXISTS _test_fallo_reviews_trigger ON reviews;
      DROP FUNCTION IF EXISTS _test_fallo_reviews();
    `);
  }
}

describe('seedDemo()', () => {
  it('un fallo a medio camino no cuenta como sembrado: limpia lo a medias y el reintento repara', async () => {
    expect(await contar('users')).toBe(0);

    await conFalloForzadoEnReviews(async () => {
      await expect(seedDemo()).rejects.toThrow(/fallo forzado por el test/);
    });

    // El primer tramo (usuarios, perfiles, servicios, suscripciones) SÍ había confirmado antes de
    // que el segundo tramo chocara con el trigger — sin la limpieza de seedDemo(), estas filas
    // seguirían aquí y el próximo intento las daría por buenas.
    expect(await contar('users')).toBe(0);
    expect(await contar('provider_profiles')).toBe(0);
    expect(await contar('services')).toBe(0);
    expect(await qOne("SELECT 1 FROM users WHERE email = 'cliente@demo.com'")).toBeUndefined();

    // Reintento sin el trigger: tiene que completar el sembrado entero, no quedarse a medias por
    // segunda vez ni chocar con un email que en realidad ya se limpió.
    expect(await seedDemo()).toBe(true);
    expect(await qOne("SELECT 1 FROM users WHERE email = 'cliente@demo.com'")).toBeTruthy();

    const electro = await qOne<{ rating: number; review_count: string }>(`
      SELECT pp.rating, pp.review_count FROM provider_profiles pp
      JOIN users u ON pp.user_id = u.id WHERE u.email = 'proveedor@demo.com'
    `);
    // La valoración se recalcula en el segundo tramo (fuera de cualquier tx()): si el reintento
    // se hubiera quedado a medias otra vez, esto seguiría en 0.
    expect(Number(electro?.review_count)).toBeGreaterThan(0);
    expect(Number(electro?.rating)).toBeGreaterThan(0);

    const usuariosTrasElSembradoCompleto = await contar('users');
    expect(usuariosTrasElSembradoCompleto).toBeGreaterThan(0);

    // Y sigue siendo idempotente: una tercera llamada no repite ni duplica nada.
    expect(await seedDemo()).toBe(false);
    expect(await contar('users')).toBe(usuariosTrasElSembradoCompleto);
  });
});
