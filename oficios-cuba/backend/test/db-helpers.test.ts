import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { q, qOne } from '../src/db/acceso.js';
import {
  parseImages, parsePriceList, planDelPerfil, providerProfileIdFor,
  PLAN_WEIGHT_SQL, CON_NEGOCIO_SQL, CON_CATALOGO_SQL,
} from '../src/db/index.js';

describe('jsonb ya viene parseado (Review Focus 2)', () => {
  it('parseImages acepta el array que devuelve pg, no solo una cadena', () => {
    // Con SQLite llegaba '["/demo/a.webp"]'; con jsonb llega ya como array.
    expect(parseImages(['/demo/a.webp'])).toEqual(['/demo/a.webp']);
    expect(parseImages('["/demo/a.webp"]')).toEqual(['/demo/a.webp']);
    expect(parseImages(null)).toEqual([]);
    expect(parseImages(undefined)).toEqual([]);
    expect(parseImages('no es json')).toEqual([]);
  });

  it('parsePriceList acepta el array que devuelve pg', () => {
    expect(parsePriceList([{ name: 'Corte', price: 100 }])).toEqual([{ name: 'Corte', price: 100 }]);
    expect(parsePriceList('[{"name":"Corte","price":100}]')).toEqual([{ name: 'Corte', price: 100 }]);
    expect(parsePriceList(null)).toEqual([]);
  });
});

// planDelPerfil y providerProfileIdFor son helpers de la capa de datos: se ejercitan insertando
// directo con q/qOne, sin pasar por /api/auth/register (esa ruta la porta la Tarea 6).
describe('planDelPerfil y providerProfileIdFor', () => {
  it('planDelPerfil devuelve el plan actual', async () => {
    // provider_profiles.province_id es NOT NULL y referencia provinces: el seed base ya trae
    // las 16 provincias en la plantilla, así que basta con leer una existente.
    const provincia = (await qOne<{ id: string }>('SELECT id FROM provinces LIMIT 1'))!;
    const userId = uuidv4();
    const profileId = uuidv4();
    await q(
      'INSERT INTO users (id, email, password_hash, full_name, user_type) VALUES ($1, $2, $3, $4, $5)',
      [userId, `${userId}@test.cu`, 'x', 'Prueba', 'provider'],
    );
    await q(
      'INSERT INTO provider_profiles (id, user_id, province_id, subscription_plan) VALUES ($1, $2, $3, $4)',
      [profileId, userId, provincia.id, 'pro'],
    );
    expect((await planDelPerfil(profileId)).name).toBe('Profesional');
  });

  it('providerProfileIdFor devuelve undefined para un usuario sin perfil', async () => {
    const userId = uuidv4();
    await q(
      'INSERT INTO users (id, email, password_hash, full_name, user_type) VALUES ($1, $2, $3, $4, $5)',
      [userId, `${userId}@test.cu`, 'x', 'Prueba', 'client'],
    );
    expect(await providerProfileIdFor(userId)).toBeUndefined();
  });
});

describe("'premium' ya no aparece en el SQL compartido", () => {
  it('ninguna de las tres constantes lo menciona', () => {
    for (const sql of [PLAN_WEIGHT_SQL, CON_NEGOCIO_SQL, CON_CATALOGO_SQL]) {
      expect(sql).not.toContain('premium');
    }
  });

  it('los tres son SQL válido para Postgres', async () => {
    await q(`SELECT ${PLAN_WEIGHT_SQL} FROM provider_profiles pp LIMIT 0`);
    await q(`SELECT 1 FROM provider_profiles pp WHERE ${CON_NEGOCIO_SQL} LIMIT 0`);
    await q(`SELECT 1 FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id
             WHERE ${CON_CATALOGO_SQL} LIMIT 0`);
  });
});
