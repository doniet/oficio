import { existsSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { expireSubscriptions } from '../src/db/index.js';
import { UPLOAD_DIR } from '../src/routes/uploads.js';
import { api, db, ponerPlan, registrar } from './helpers.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const articulo = (extra: Record<string, unknown> = {}) => ({ name: 'Breaker 20 A', description: 'Nuevo', price: 3500, ...extra });
const subir = (auth: Record<string, string>, purpose?: 'catalog') => api.post('/api/uploads').set(auth).send({ data: PNG, purpose });

describe('catálogo', () => {
  it('Gratis no tiene catálogo; Básico llega hasta 50', async () => {
    const p = await registrar('provider');
    expect((await api.post('/api/catalog').set(p.auth).send(articulo())).status).toBe(403);
    expect((await subir(p.auth, 'catalog')).status).toBe(403);

    ponerPlan(p.providerId!, 'basic');
    const ahora = new Date().toISOString();
    const ins = db.prepare("INSERT INTO catalog_items (id, provider_id, name, price, created_at) VALUES (?, ?, 'x', 1, ?)");
    for (let i = 0; i < 49; i++) ins.run(`b-${p.providerId}-${i}`, p.providerId, ahora);
    expect((await api.post('/api/catalog').set(p.auth).send(articulo())).status).toBe(201);
    const lleno = await api.post('/api/catalog').set(p.auth).send(articulo());
    expect(lleno.status).toBe(403);
    expect(lleno.body.error).toContain('50');
  });

  it('valida precio, imagen propia y lo muestra en el perfil público', async () => {
    const p = await registrar('provider');
    const otro = await registrar('provider');
    ponerPlan(p.providerId!, 'pro');
    ponerPlan(otro.providerId!, 'pro');
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

  it('cambiar o borrar la foto la quita del disco si ya nadie la usa', async () => {
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'pro');
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
    ponerPlan(p.providerId!, 'basic');
    const hace = new Date(Date.now() - 3_600_000).toISOString();
    const ins = db.prepare("INSERT INTO uploads (name, user_id, purpose, created_at) VALUES (?, ?, 'catalog', ?)");
    for (let i = 0; i < 50; i++) ins.run(`c-${p.userId}-${i}`, p.userId, hace);
    expect((await subir(p.auth, 'catalog')).status).toBe(429);
    // Las demás subidas siguen con su cuota aparte.
    expect((await subir(p.auth)).status).toBe(201);
    // Un Profesional tiene 1000.
    ponerPlan(p.providerId!, 'pro');
    expect((await subir(p.auth, 'catalog')).status).toBe(201);
  });

  it('al bajar de plan se ocultan los más nuevos y vuelven al subir', async () => {
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'pro');
    const ins = db.prepare("INSERT INTO catalog_items (id, provider_id, name, price, created_at) VALUES (?, ?, ?, 1, ?)");
    for (let i = 0; i < 60; i++) ins.run(`d-${p.providerId}-${i}`, p.providerId, `Art ${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString());
    expect((await api.get(`/api/catalog/provider/${p.providerId}`)).body.total_all).toBe(60);

    ponerPlan(p.providerId!, 'basic', new Date(Date.now() - 1000).toISOString());
    expireSubscriptions(); // caduca → Gratis
    expect((await api.get(`/api/catalog/provider/${p.providerId}`)).body.total_all).toBe(0);

    ponerPlan(p.providerId!, 'basic');
    const { enforcePlanLimit } = await import('../src/db/index.js');
    enforcePlanLimit(p.providerId!);
    const pub = (await api.get(`/api/catalog/provider/${p.providerId}`)).body;
    expect(pub.total_all).toBe(50);
    const mios = (await api.get('/api/catalog/mine').set(p.auth)).body;
    expect(mios.items.filter((i: { hidden_by_plan: boolean }) => i.hidden_by_plan).map((i: { name: string }) => i.name).sort())
      .toEqual(Array.from({ length: 10 }, (_, i) => `Art ${50 + i}`).sort());
  });

  it('la búsqueda de productos intercala profesionales y oculta los agotados', async () => {
    const a = await registrar('provider');
    const b = await registrar('provider');
    ponerPlan(a.providerId!, 'pro');
    ponerPlan(b.providerId!, 'basic');
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
});
