import { describe, expect, it } from 'vitest';
import { api, crearServicio, db, ponerPlan, registrar } from './helpers.js';

async function escenario() {
  const pro = await registrar('provider');
  const cli = await registrar('client');
  ponerPlan(pro.providerId!, 'pro');
  const s1 = (await crearServicio(pro.auth)).body.service.id as string;
  const s2 = (await crearServicio(pro.auth)).body.service.id as string;
  const conv = await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: s1, initial_message: 'hola' });
  if (conv.status >= 300) throw new Error(`conversación: ${conv.status} ${JSON.stringify(conv.body)}`);
  const conversationId = (conv.body.conversation?.id ?? conv.body.id) as string;
  return { pro, cli, s1, s2, conversationId };
}

const reseñar = (auth: Record<string, string>, service_id: string, rating = 5) =>
  api.post('/api/reviews').set(auth).send({ service_id, rating, comment: 'ok' });

describe('reseñas', () => {
  it('no se puede reseñar si el proveedor nunca respondió en el chat', async () => {
    const { cli, s1 } = await escenario();
    const res = await reseñar(cli.auth, s1);
    expect(res.status).toBe(400);
  });

  it('se puede reseñar cuando el proveedor ya respondió', async () => {
    const { pro, cli, s1, conversationId } = await escenario();
    const r = await api.post(`/api/conversations/${conversationId}/messages`).set(pro.auth).send({ content: 'claro, dime' });
    expect(r.status).toBeLessThan(300);
    expect((await reseñar(cli.auth, s1)).status).toBe(201);
  });

  it('un cliente deja una sola reseña por proveedor, aunque tenga varios servicios', async () => {
    const { pro, cli, s1, s2, conversationId } = await escenario();
    await api.post(`/api/conversations/${conversationId}/messages`).set(pro.auth).send({ content: 'claro' });
    expect((await reseñar(cli.auth, s1)).status).toBe(201);
    expect((await reseñar(cli.auth, s2)).status).toBe(400);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE provider_id = ?').get(pro.providerId) as { n: number };
    expect(n).toBe(1);
  });

  it('no se puede reseñar un servicio pausado', async () => {
    const { pro, cli, s1, conversationId } = await escenario();
    await api.post(`/api/conversations/${conversationId}/messages`).set(pro.auth).send({ content: 'claro' });
    await api.patch(`/api/services/${s1}/toggle`).set(pro.auth);
    expect((await reseñar(cli.auth, s1)).status).toBe(404);
  });
});
