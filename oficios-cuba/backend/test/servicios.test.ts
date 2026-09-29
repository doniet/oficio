import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { activos, api, categoriaId, crearServicio, ponerPlan, registrar } from './helpers.js';
import { q, qOne } from '../src/db/acceso.js';
import { expireSubscriptions } from '../src/db/index.js';

// reviews.provider_profile_id (Tarea 3): es el id del PERFIL, el nombre ya no es provider_id.
async function reseñaDirecta(serviceId: string, clientId: string, providerId: string, rating: number) {
  await q(
    'INSERT INTO reviews (id, service_id, client_id, provider_profile_id, rating) VALUES ($1, $2, $3, $4, $5)',
    [uuidv4(), serviceId, clientId, providerId, rating],
  );
}

describe('borrar un servicio', () => {
  it('conserva sus reseñas y recalcula la valoración del proveedor', async () => {
    const pro = await registrar('provider');
    const cli = await registrar('client');
    await ponerPlan(pro.providerId!, 'pro');
    const bueno = (await crearServicio(pro.auth)).body.service.id;
    const malo = (await crearServicio(pro.auth)).body.service.id;
    await reseñaDirecta(bueno, cli.userId, pro.providerId!, 5);
    await reseñaDirecta(malo, cli.userId, pro.providerId!, 1);

    const res = await api.delete(`/api/services/${malo}`).set(pro.auth);
    expect(res.status).toBe(200);

    const restantes = await qOne<{ n: string }>('SELECT count(*) AS n FROM reviews WHERE provider_profile_id = $1', [pro.providerId]);
    expect(Number(restantes!.n)).toBe(2);
    const perfil = await qOne<{ rating: number; review_count: number }>('SELECT rating, review_count FROM provider_profiles WHERE id = $1', [pro.providerId]);
    expect(perfil).toEqual({ rating: 3, review_count: 2 });

    const publico = await api.get(`/api/providers/${pro.providerId}`);
    expect(publico.status).toBe(200);
    expect(publico.body.reviews).toHaveLength(2);
  });

  it('created_at de un servicio es una cadena ISO, no un objeto Date', async () => {
    const { auth } = await registrar('provider');
    const { body } = await api.post('/api/services').set(auth).send({
      category_id: await categoriaId(), title: 'Con fecha', price_type: 'negotiable',
    });
    expect(typeof body.service.created_at).toBe('string');
    expect(body.service.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('límite de servicios del plan', () => {
  it('al caducar un plan de pago se pausan los servicios que sobran (se quedan los más antiguos)', async () => {
    const pro = await registrar('provider');
    await ponerPlan(pro.providerId!, 'pro');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await crearServicio(pro.auth)).body.service.id);
    await ponerPlan(pro.providerId!, 'pro', new Date(Date.now() - 1000).toISOString());

    await expireSubscriptions();

    expect(await activos(pro.providerId!)).toBe(1);
    const primero = await qOne<{ is_active: boolean }>('SELECT is_active FROM services WHERE id = $1', [ids[0]]);
    expect(primero!.is_active).toBe(true);
  });

  it('al cancelar el plan se pausan los servicios que sobran', async () => {
    const pro = await registrar('provider');
    await ponerPlan(pro.providerId!, 'basic');
    for (let i = 0; i < 3; i++) await crearServicio(pro.auth);

    const res = await api.post('/api/subscriptions/cancel').set(pro.auth);
    expect(res.status).toBe(200);
    expect(await activos(pro.providerId!)).toBe(1);
  });

  it('no deja reactivar un servicio pausado si el plan ya está lleno', async () => {
    const pro = await registrar('provider');
    await ponerPlan(pro.providerId!, 'basic');
    const a = (await crearServicio(pro.auth)).body.service.id;
    const b = (await crearServicio(pro.auth)).body.service.id;
    await ponerPlan(pro.providerId!, 'free');
    await api.patch(`/api/services/${b}/toggle`).set(pro.auth);
    expect(await activos(pro.providerId!)).toBe(1);

    const res = await api.patch(`/api/services/${b}/toggle`).set(pro.auth);
    expect(res.status).toBe(403);
    expect(await activos(pro.providerId!)).toBe(1);

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
    const provincia = (await qOne<{ id: string }>('SELECT id FROM provinces LIMIT 1'))!.id;
    const res = await api.put('/api/providers/me/profile').set(pro.auth).send({ province_id: provincia, service_area_ids: [uuidv4()] });
    expect(res.status).toBe(400);
  });

  it('no acepta fotos de servicio de dominios externos ni subidas ajenas', async () => {
    const pro = await registrar('provider');
    await ponerPlan(pro.providerId!, 'basic');
    const externa = await crearServicio(pro.auth, { images: ['https://evil.example/x.jpg'] });
    expect(externa.status).toBe(400);
    const ajena = await crearServicio(pro.auth, { images: ['/api/uploads/00000000-0000-4000-8000-000000000000.webp'] });
    expect(ajena.status).toBe(400);
    const demo = await crearServicio(pro.auth, { images: ['/demo/pintura-1.webp'] });
    expect(demo.status).toBe(201);
  });
});
