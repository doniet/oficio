import { describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { parseImages, parsePriceList, PLAN_WEIGHT_SQL, CON_NEGOCIO_SQL, CON_CATALOGO_SQL } from '../src/db/index.js';
import { api, ponerPlan, registrar } from './helpers.js';

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

describe('las fechas salen como ISO en el JSON (Review Focus 3)', () => {
  it('created_at de un servicio es una cadena ISO, no un objeto', async () => {
    const { auth } = await registrar('provider');
    const { body } = await api.post('/api/services').set(auth).send({
      category_id: (await qOne<{ id: string }>('SELECT id FROM categories WHERE parent_id IS NOT NULL LIMIT 1'))!.id,
      title: 'Con fecha', price_type: 'negotiable',
    });
    expect(typeof body.service.created_at).toBe('string');
    expect(body.service.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('los booleanos del contrato público (Review Focus 4)', () => {
  it('available de un artículo del catálogo es boolean en el JSON', async () => {
    const { auth, providerId } = await registrar('provider');
    await ponerPlan(providerId!, 'basic');
    const { body } = await api.post('/api/catalog').set(auth)
      .send({ name: 'Arroz', price: 100, price_type: 'fixed' });
    expect(body.item.available).toBe(true);
    expect(body.item.available).not.toBe(1);
  });
});

describe('planDelPerfil y enforcePlanLimit', () => {
  it('planDelPerfil devuelve el plan actual', async () => {
    const { planDelPerfil } = await import('../src/db/index.js');
    const { providerId } = await registrar('provider');
    await ponerPlan(providerId!, 'pro');
    expect((await planDelPerfil(providerId!)).name).toBe('Profesional');
  });

  it('providerProfileIdFor devuelve undefined para un usuario sin perfil', async () => {
    const { providerProfileIdFor } = await import('../src/db/index.js');
    const { userId } = await registrar('client');
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
