import { existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { enforcePlanLimit, expireSubscriptions } from '../src/db/index.js';
import { q } from '../src/db/acceso.js';
import { UPLOAD_DIR } from '../src/routes/uploads.js';
import { api, ponerPlan, registrar } from './helpers.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const articulo = (extra: Record<string, unknown> = {}) => ({ name: 'Breaker 20 A', description: 'Nuevo', price: 3500, ...extra });
const subir = (auth: Record<string, string>, purpose?: 'catalog') => api.post('/api/uploads').set(auth).send({ data: PNG, purpose });

describe('catálogo', () => {
  it('Gratis no tiene catálogo; Básico llega hasta 50', async () => {
    const p = await registrar('provider');
    expect((await api.post('/api/catalog').set(p.auth).send(articulo())).status).toBe(403);
    expect((await subir(p.auth, 'catalog')).status).toBe(403);

    await ponerPlan(p.providerId!, 'basic');
    const ahora = new Date().toISOString();
    // catalog_items.id es uuid (antes era TEXT en SQLite): hace falta un uuid real, no un slug.
    for (let i = 0; i < 49; i++) {
      await q("INSERT INTO catalog_items (id, provider_id, name, price, created_at) VALUES ($1, $2, 'x', 1, $3)", [uuidv4(), p.providerId, ahora]);
    }
    expect((await api.post('/api/catalog').set(p.auth).send(articulo())).status).toBe(201);
    const lleno = await api.post('/api/catalog').set(p.auth).send(articulo());
    expect(lleno.status).toBe(403);
    expect(lleno.body.error).toContain('50');
  });

  it('available de un artículo es boolean en el JSON, no 0/1', async () => {
    const { auth, providerId } = await registrar('provider');
    await ponerPlan(providerId!, 'basic');
    const { body } = await api.post('/api/catalog').set(auth)
      .send({ name: 'Arroz', price: 100, price_type: 'fixed' });
    expect(body.item.available).toBe(true);
    expect(body.item.available).not.toBe(1);
  });

  it('valida precio, imagen propia y lo muestra en el perfil público', async () => {
    const p = await registrar('provider');
    const otro = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro');
    await ponerPlan(otro.providerId!, 'pro');
    expect((await api.post('/api/catalog').set(p.auth).send(articulo({ price: null }))).status).toBe(400);
    expect((await api.post('/api/catalog').set(p.auth).send(articulo({ price: null, price_type: 'ask' }))).status).toBe(201);

    const ajena = (await subir(otro.auth, 'catalog')).body.url;
    expect((await api.post('/api/catalog').set(p.auth).send(articulo({ image: ajena }))).status).toBe(400);
    expect((await api.post('/api/catalog').set(p.auth).send(articulo({ image: 'https://malo.com/x.png' }))).status).toBe(400);

    const foto = (await subir(p.auth, 'catalog')).body.url;
    const creado = await api.post('/api/catalog').set(p.auth).send(articulo({ image: foto, section: 'Piezas', price_currency: 'USD' }));
    expect(creado.body.item).toMatchObject({ image: foto, section: 'Piezas', price_currency: 'USD', available: true });
    await api.post('/api/catalog').set(p.auth).send(articulo({ name: 'Tomacorriente', section: 'Piezas' }));

    const pub = (await api.get(`/api/catalog/provider/${p.providerId}`)).body;
    expect(pub.total).toBe(3);
    expect(pub.sections).toEqual([{ name: 'Piezas', count: 2 }]);
    expect((await api.get(`/api/catalog/provider/${p.providerId}`).query({ q: 'toma' })).body.items.map((i: { name: string }) => i.name)).toEqual(['Tomacorriente']);

    // Otro profesional no toca el artículo.
    expect((await api.delete(`/api/catalog/${creado.body.item.id}`).set(otro.auth)).status).toBe(404);
  });

  // Cierra la tercera superficie del arreglo de la Tarea 8 (imagenPermitida sin await):
  // miPerfil() ya no devuelve 403 antes de llegar a assertImagen, así que este camino se
  // puede probar de punta a punta.
  it('un artículo del catálogo rechaza una URL externa arbitraria como imagen', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'basic');
    const res = await api.post('/api/catalog').set(p.auth).send(articulo({ image: 'https://ejemplo.com/foto.jpg' }));
    expect(res.status).toBe(400);
  });

  it('cambiar o borrar la foto la quita del disco si ya nadie la usa', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro');
    const f1 = (await subir(p.auth, 'catalog')).body.url;
    const f2 = (await subir(p.auth, 'catalog')).body.url;
    const enDisco = (url: string) => existsSync(join(UPLOAD_DIR, url.split('/').pop()!));
    const item = (await api.post('/api/catalog').set(p.auth).send(articulo({ image: f1 }))).body.item;

    await api.put(`/api/catalog/${item.id}`).set(p.auth).send(articulo({ image: f2 }));
    expect(enDisco(f1)).toBe(false);
    expect(enDisco(f2)).toBe(true);

    // Si la misma foto la usa otro artículo, no se borra.
    const gemelo = (await api.post('/api/catalog').set(p.auth).send(articulo({ image: f2 }))).body.item;
    await api.delete(`/api/catalog/${item.id}`).set(p.auth);
    expect(enDisco(f2)).toBe(true);
    await api.delete(`/api/catalog/${gemelo.id}`).set(p.auth);
    expect(enDisco(f2)).toBe(false);
  });

  it('las fotos del catálogo tienen su propia cuota: la del plan en 24 h', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'basic');
    const hace = new Date(Date.now() - 3_600_000).toISOString();
    for (let i = 0; i < 50; i++) {
      await q("INSERT INTO uploads (name, user_id, purpose, created_at) VALUES ($1, $2, 'catalog', $3)", [`c-${p.userId}-${i}`, p.userId, hace]);
    }
    expect((await subir(p.auth, 'catalog')).status).toBe(429);
    // Las demás subidas siguen con su cuota aparte.
    expect((await subir(p.auth)).status).toBe(201);
    // Un Profesional tiene 1000.
    await ponerPlan(p.providerId!, 'pro');
    expect((await subir(p.auth, 'catalog')).status).toBe(201);
  });

  it('al bajar de plan se ocultan los más nuevos y vuelven al subir', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro');
    for (let i = 0; i < 60; i++) {
      await q('INSERT INTO catalog_items (id, provider_id, name, price, created_at) VALUES ($1, $2, $3, 1, $4)',
        [uuidv4(), p.providerId, `Art ${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()]);
    }
    expect((await api.get(`/api/catalog/provider/${p.providerId}`)).body.total_all).toBe(60);

    await ponerPlan(p.providerId!, 'basic', new Date(Date.now() - 1000).toISOString());
    await expireSubscriptions(); // caduca → Gratis
    expect((await api.get(`/api/catalog/provider/${p.providerId}`)).body.total_all).toBe(0);

    await ponerPlan(p.providerId!, 'basic');
    await enforcePlanLimit(p.providerId!);
    const pub = (await api.get(`/api/catalog/provider/${p.providerId}`)).body;
    expect(pub.total_all).toBe(50);
    const mios = (await api.get('/api/catalog/mine').set(p.auth)).body;
    expect(mios.items.filter((i: { hidden_by_plan: boolean }) => i.hidden_by_plan).map((i: { name: string }) => i.name).sort())
      .toEqual(Array.from({ length: 10 }, (_, i) => `Art ${50 + i}`).sort());
  });

  it('la búsqueda de productos intercala profesionales y oculta los agotados', async () => {
    const a = await registrar('provider');
    const b = await registrar('provider');
    await ponerPlan(a.providerId!, 'pro');
    await ponerPlan(b.providerId!, 'basic');
    for (let i = 0; i < 5; i++) await api.post('/api/catalog').set(a.auth).send(articulo({ name: `Zapatilla Única ${i}` }));
    await api.post('/api/catalog').set(b.auth).send(articulo({ name: 'Zapatilla Única B' }));
    const agotado = (await api.post('/api/catalog').set(b.auth).send(articulo({ name: 'Zapatilla Única agotada' }))).body.item;
    await api.patch(`/api/catalog/${agotado.id}/available`).set(b.auth).send({ available: false });

    const res = (await api.get('/api/catalog/search').query({ q: 'Zapatilla Única' })).body;
    expect(res.total).toBe(6);
    // Los dos primeros son de profesionales distintos.
    expect(new Set(res.items.slice(0, 2).map((i: { provider_id: string }) => i.provider_id)).size).toBe(2);
    expect(res.items.map((i: { name: string }) => i.name)).not.toContain('Zapatilla Única agotada');
    expect(res.items[0]).toHaveProperty('provider_name');
  });

  // Mismo bug de la migración que providers.ts/services.ts/stats.ts (commit 71f88d1): comparar un
  // valor sin forma de uuid contra pp.province_id/pp.municipality_id lanza 22P02, que errorHandler
  // traduce a 404 sobre el listado entero. catalog.ts se quedó fuera de aquel fix.
  it('/api/catalog/search con province_id o municipality_id que no son uuid da 200 con lista vacía, no 404', async () => {
    const porProvincia = await api.get('/api/catalog/search').query({ province_id: 'esto-no-es-un-uuid' });
    expect(porProvincia.status).toBe(200);
    expect(porProvincia.body.items).toEqual([]);

    const porMunicipio = await api.get('/api/catalog/search').query({ municipality_id: 'esto-no-es-un-uuid' });
    expect(porMunicipio.status).toBe(200);
    expect(porMunicipio.body.items).toEqual([]);
  });
});
