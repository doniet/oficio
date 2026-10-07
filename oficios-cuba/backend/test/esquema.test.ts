import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { cerrarPool } from '../src/db/conexion.js';
import { migrar } from '../src/db/migrar.js';

beforeAll(async () => { await migrar(); });
afterAll(async () => { await cerrarPool(); });

const columna = (tabla: string, col: string) => qOne<{ data_type: string; udt_name: string }>(
  `SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
  [tabla, col],
);

describe('migrar', () => {
  it('deja registradas la v1 y todas las migraciones', async () => {
    expect((await qOne<{ v: number }>('SELECT max(version) AS v FROM schema_migrations'))?.v).toBe(2);
  });

  it('es idempotente: aplicarla dos veces no falla', async () => {
    await migrar();
    expect((await qOne<{ n: string }>('SELECT count(*) AS n FROM schema_migrations'))?.n).toBe('2');
  });

  it('crea las 27 tablas del modelo', async () => {
    const { length } = await q(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
          AND table_name <> 'schema_migrations' AND table_name NOT LIKE 'spatial_%'`,
    );
    expect(length).toBe(27);
  });
});

describe('tipos', () => {
  it('los booleanos son boolean, no integer', async () => {
    expect((await columna('catalog_items', 'available'))?.data_type).toBe('boolean');
    expect((await columna('provider_profiles', 'show_on_map'))?.data_type).toBe('boolean');
    expect((await columna('services', 'is_active'))?.data_type).toBe('boolean');
  });

  it('las columnas JSON son jsonb', async () => {
    expect((await columna('services', 'images'))?.udt_name).toBe('jsonb');
    expect((await columna('services', 'price_list'))?.udt_name).toBe('jsonb');
    expect((await columna('provider_profiles', 'gallery'))?.udt_name).toBe('jsonb');
    expect((await columna('provider_profiles', 'agenda'))?.udt_name).toBe('jsonb');
    expect((await columna('users', 'notify_prefs'))?.udt_name).toBe('jsonb');
  });

  it('las fechas son timestamptz', async () => {
    expect((await columna('appointments', 'starts_at'))?.udt_name).toBe('timestamptz');
    expect((await columna('users', 'created_at'))?.udt_name).toBe('timestamptz');
  });

  it('los ids son uuid', async () => {
    expect((await columna('users', 'id'))?.udt_name).toBe('uuid');
    expect((await columna('provider_profiles', 'user_id'))?.udt_name).toBe('uuid');
  });
});

describe('deuda eliminada', () => {
  it("el plan 'premium' no existe en la restricción", async () => {
    const { rows } = await import('../src/db/acceso.js').then((m) => m.q<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'provider_profiles'::regclass AND contype = 'c'`,
    )).then((r) => ({ rows: r }));
    expect(rows.map((r) => r.def).join(' ')).not.toContain('premium');
  });

  it('stripe_customer_id no existe', async () => {
    expect(await columna('provider_profiles', 'stripe_customer_id')).toBeUndefined();
  });

  it('conversations y reviews apuntan al perfil con un nombre que no engaña', async () => {
    expect(await columna('conversations', 'provider_profile_id')).toBeDefined();
    expect(await columna('conversations', 'provider_id')).toBeUndefined();
    expect(await columna('reviews', 'provider_profile_id')).toBeDefined();
    expect(await columna('reviews', 'provider_id')).toBeUndefined();
  });
});

describe('PostGIS', () => {
  it('el punto público es una columna geography con índice GiST', async () => {
    expect((await columna('provider_profiles', 'punto_pub'))?.udt_name).toBe('geography');
    const idx = await q<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'provider_profiles'`,
    );
    expect(idx.map((i) => i.indexdef).join(' ')).toMatch(/USING gist \(punto_pub\)/);
  });
});

describe('la agenda no admite dos citas solapadas', () => {
  beforeAll(async () => {
    // Limpia lo que haya dejado una ejecución anterior de este mismo test: sin esto, la
    // segunda vez el INSERT de la cita '44444444-…' falla por clave primaria duplicada
    // (23505) en vez de por la restricción EXCLUDE (23P01), y el test pasaría o fallaría
    // por el motivo equivocado. La intención no cambia: sigue siendo el mismo profesional
    // de prueba, con sus citas en cero antes de empezar.
    await q(`DELETE FROM appointments WHERE provider_id = '33333333-3333-3333-3333-333333333333'`);
  });

  it('rechaza el solape del mismo profesional', async () => {
    await q(`INSERT INTO provinces (id, name, capital, lat, lng) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Prueba', 'Prueba', 23, -82)
      ON CONFLICT DO NOTHING`);
    await q(`INSERT INTO users (id, email, password_hash, full_name, user_type) VALUES
      ('22222222-2222-2222-2222-222222222222', 'ex@test.cu', 'x', 'Ex', 'provider')
      ON CONFLICT DO NOTHING`);
    await q(`INSERT INTO provider_profiles (id, user_id, province_id) VALUES
      ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
       '11111111-1111-1111-1111-111111111111') ON CONFLICT DO NOTHING`);

    const cita = (id: string, desde: string, hasta: string) => q(
      `INSERT INTO appointments (id, provider_id, starts_at, ends_at, status, origin)
       VALUES ($1, '33333333-3333-3333-3333-333333333333', $2, $3, 'confirmed', 'manual')`,
      [id, desde, hasta],
    );

    await cita('44444444-4444-4444-4444-444444444444', '2027-01-10T14:00:00Z', '2027-01-10T15:00:00Z');
    await expect(
      cita('55555555-5555-5555-5555-555555555555', '2027-01-10T14:30:00Z', '2027-01-10T15:30:00Z'),
    ).rejects.toThrow(/conflicting key value|exclusion/i);
  });

  it('permite volver a reservar una hora que se canceló', async () => {
    await q(`UPDATE appointments SET status = 'cancelled'
             WHERE id = '44444444-4444-4444-4444-444444444444'`);
    await expect(q(
      `INSERT INTO appointments (id, provider_id, starts_at, ends_at, status, origin)
       VALUES ('66666666-6666-6666-6666-666666666666',
               '33333333-3333-3333-3333-333333333333',
               '2027-01-10T14:00:00Z', '2027-01-10T15:00:00Z', 'confirmed', 'manual')`,
    )).resolves.toBeDefined();
  });
});
