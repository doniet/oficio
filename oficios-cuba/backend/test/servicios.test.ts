import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { activos, api, crearServicio, db, ponerPlan, registrar } from './helpers.js';
import { expireSubscriptions } from '../src/db/index.js';

function reseñaDirecta(serviceId: string, clientId: string, providerId: string, rating: number) {
  db.prepare('INSERT INTO reviews (id, service_id, client_id, provider_id, rating) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), serviceId, clientId, providerId, rating);
}

describe('borrar un servicio', () => {
  it('conserva sus reseñas y recalcula la valoración del proveedor', async () => {
    const pro = await registrar('provider');
    const cli = await registrar('client');
    ponerPlan(pro.providerId!, 'pro');
    const bueno = (await crearServicio(pro.auth)).body.service.id;
    const malo = (await crearServicio(pro.auth)).body.service.id;
    reseñaDirecta(bueno, cli.userId, pro.providerId!, 5);
    reseñaDirecta(malo, cli.userId, pro.providerId!, 1);

    const res = await api.delete(`/api/services/${malo}`).set(pro.auth);
    expect(res.status).toBe(200);

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE provider_id = ?').get(pro.providerId) as { n: number };
    expect(n).toBe(2);
    const perfil = db.prepare('SELECT rating, review_count FROM provider_profiles WHERE id = ?').get(pro.providerId) as { rating: number; review_count: number };
    expect(perfil).toEqual({ rating: 3, review_count: 2 });

    const publico = await api.get(`/api/providers/${pro.providerId}`);
    expect(publico.status).toBe(200);
    expect(publico.body.reviews).toHaveLength(2);
  });
});

describe('límite de servicios del plan', () => {
  it('al caducar un plan de pago se pausan los servicios que sobran (se quedan los más antiguos)', async () => {
    const pro = await registrar('provider');
    ponerPlan(pro.providerId!, 'pro');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await crearServicio(pro.auth)).body.service.id);
    ponerPlan(pro.providerId!, 'pro', new Date(Date.now() - 1000).toISOString());

    expireSubscriptions();

    expect(activos(pro.providerId!)).toBe(1);
    const primero = db.prepare('SELECT is_active FROM services WHERE id = ?').get(ids[0]) as { is_active: number };
    expect(primero.is_active).toBe(1);
  });

  it('al cancelar el plan se pausan los servicios que sobran', async () => {
    const pro = await registrar('provider');
    ponerPlan(pro.providerId!, 'basic');
    for (let i = 0; i < 3; i++) await crearServicio(pro.auth);

    const res = await api.post('/api/subscriptions/cancel').set(pro.auth);
    expect(res.status).toBe(200);
    expect(activos(pro.providerId!)).toBe(1);
  });

  it('no deja reactivar un servicio pausado si el plan ya está lleno', async () => {
    const pro = await registrar('provider');
    ponerPlan(pro.providerId!, 'basic');
    const a = (await crearServicio(pro.auth)).body.service.id;
    const b = (await crearServicio(pro.auth)).body.service.id;
    ponerPlan(pro.providerId!, 'free');
    await api.patch(`/api/services/${b}/toggle`).set(pro.auth);
    expect(activos(pro.providerId!)).toBe(1);

    const res = await api.patch(`/api/services/${b}/toggle`).set(pro.auth);
    expect(res.status).toBe(403);
    expect(activos(pro.providerId!)).toBe(1);

    // Pausar el activo libera el hueco.
    await api.patch(`/api/services/${a}/toggle`).set(pro.auth);
    expect((await api.patch(`/api/services/${b}/toggle`).set(pro.auth)).status).toBe(200);
  });
});

describe('validación de entrada', () => {
  it('parámetros repetidos en la URL no rompen la búsqueda', async () => {
    expect((await api.get('/api/services?q=a&q=b')).status).toBe(200);
    expect((await api.get('/api/providers?q=a&q=b&province_id=x&province_id=y')).status).toBe(200);
    expect((await api.get('/api/stats/categories?province_id=a&province_id=b')).status).toBe(200);
  });

  it('una zona de servicio con municipio inexistente da 400, no 500', async () => {
    const pro = await registrar('provider');
    const provincia = (db.prepare('SELECT id FROM provinces LIMIT 1').get() as { id: string }).id;
    const res = await api.put('/api/providers/me/profile').set(pro.auth).send({ province_id: provincia, service_area_ids: [uuidv4()] });
    expect(res.status).toBe(400);
  });

  it('no acepta fotos de servicio de dominios externos ni subidas ajenas', async () => {
    const pro = await registrar('provider');
    const externa = await crearServicio(pro.auth, { images: ['https://evil.example/x.jpg'] });
    expect(externa.status).toBe(400);
    const ajena = await crearServicio(pro.auth, { images: ['/api/uploads/00000000-0000-4000-8000-000000000000.webp'] });
    expect(ajena.status).toBe(400);
    const demo = await crearServicio(pro.auth, { images: ['/demo/pintura-1.webp'] });
    expect(demo.status).toBe(201);
  });
});
