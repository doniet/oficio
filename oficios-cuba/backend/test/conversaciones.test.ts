import { describe, expect, it } from 'vitest';
import { api, crearServicio, ponerPlan, registrar } from './helpers.js';

// GET /api/conversations/:id?after= compara el valor contra c.created_at (timestamptz, ver
// conversations.ts:134-137, columna 22007 vs. las columnas uuid 22P02 que ya se arreglaron en
// otro sitio). El frontend siempre manda un ISO válido; este test cubre el valor que no lo es.
describe('GET /api/conversations/:id — ?after= inválido', () => {
  it('un after que no es una fecha da 400, no 500', async () => {
    const pro = await registrar('provider');
    const cli = await registrar('client');
    await ponerPlan(pro.providerId!, 'pro');
    const servicio = (await crearServicio(pro.auth)).body.service.id as string;
    const conv = (await api.post('/api/conversations').set(cli.auth)
      .send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).body.conversation;

    const res = await api.get(`/api/conversations/${conv.id}`).set(cli.auth).query({ after: 'esto-no-es-una-fecha' });
    expect(res.status).toBe(400);
  });

  it('un after con forma de fecha real sigue funcionando', async () => {
    const pro = await registrar('provider');
    const cli = await registrar('client');
    await ponerPlan(pro.providerId!, 'pro');
    const servicio = (await crearServicio(pro.auth)).body.service.id as string;
    const conv = (await api.post('/api/conversations').set(cli.auth)
      .send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).body.conversation;

    const res = await api.get(`/api/conversations/${conv.id}`).set(cli.auth).query({ after: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });
});
