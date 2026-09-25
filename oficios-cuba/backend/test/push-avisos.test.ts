import { afterEach, describe, expect, it } from 'vitest';
import { api, crearServicio, db, ponerPlan, registrar } from './helpers.js';
import { CanalPush, esperarAvisosPendientes, Notificacion, usarCanal } from '../src/push/avisos.js';

function canalFalso(respuesta: 'ok' | 'token_invalido' | 'lanza' | 'lento' = 'ok') {
  const enviados: { token: string; n: Notificacion }[] = [];
  const canal: CanalPush = {
    async enviar(token, n) {
      enviados.push({ token, n });
      if (respuesta === 'lanza') throw new Error('FCM caído');
      if (respuesta === 'lento') await new Promise((r) => setTimeout(r, 3000));
      return respuesta === 'token_invalido' ? 'token_invalido' : 'ok';
    },
  };
  return { canal, enviados };
}

async function escenario() {
  const pro = await registrar('provider');
  const cli = await registrar('client');
  ponerPlan(pro.providerId!, 'pro');
  const servicio = (await crearServicio(pro.auth, { title: 'Arreglo de neveras' })).body.service.id as string;
  await api.post('/api/push/devices').set(pro.auth).send({ canal: 'fcm', token: `tok-pro-${pro.userId}`, plataforma: 'android', app_version: '0.1.0' });
  await api.post('/api/push/devices').set(cli.auth).send({ canal: 'fcm', token: `tok-cli-${cli.userId}`, plataforma: 'android', app_version: '0.1.0' });
  return { pro, cli, servicio };
}

afterEach(() => usarCanal('fcm', null));

describe('avisos push', () => {
  it('una solicitud nueva avisa al PROVEEDOR (su usuario, no su perfil) y no al cliente', async () => {
    const f = canalFalso();
    usarCanal('fcm', f.canal);
    const { pro, cli, servicio } = await escenario();
    const res = await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'Mi nevera no enfría' });
    expect(res.status).toBe(201);
    await esperarAvisosPendientes();

    expect(f.enviados).toHaveLength(1);
    expect(f.enviados[0].token).toBe(`tok-pro-${pro.userId}`);
    expect(f.enviados[0].n.titulo).toMatch(/^Nueva solicitud de /);
    expect(f.enviados[0].n.datos).toEqual({ tipo: 'mensaje', conversation_id: res.body.conversation.id });
    // Nunca el texto del mensaje.
    expect(JSON.stringify(f.enviados[0].n)).not.toContain('nevera no enfría');
  });

  it('un mensaje del proveedor avisa al cliente y no al proveedor', async () => {
    const { pro, cli, servicio } = await escenario();
    const conv = (await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).body.conversation.id;
    await esperarAvisosPendientes();
    const f = canalFalso();
    usarCanal('fcm', f.canal);
    await api.post(`/api/conversations/${conv}/messages`).set(pro.auth).send({ content: 'Paso mañana a las 10' });
    await esperarAvisosPendientes();
    expect(f.enviados.map((e) => e.token)).toEqual([`tok-cli-${cli.userId}`]);
    expect(f.enviados[0].n.titulo).toMatch(/^Nuevo mensaje de /);
    expect(JSON.stringify(f.enviados[0].n)).not.toContain('mañana');
  });

  it('una segunda conversación del mismo cliente con el mismo servicio no es "solicitud nueva" sino mensaje', async () => {
    const f = canalFalso();
    usarCanal('fcm', f.canal);
    const { pro, cli, servicio } = await escenario();
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' });
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'sigo esperando' });
    await esperarAvisosPendientes();
    expect(f.enviados.map((e) => e.n.titulo.split(' de ')[0])).toEqual(['Nueva solicitud', 'Nuevo mensaje']);
  });

  it('un token inválido se borra', async () => {
    const f = canalFalso('token_invalido');
    usarCanal('fcm', f.canal);
    const { pro, cli, servicio } = await escenario();
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' });
    await esperarAvisosPendientes();
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_devices WHERE user_id = ?').get(pro.userId)).toEqual({ n: 0 });
  });

  it('si el canal falla o tarda, el mensaje se guarda y responde rápido', async () => {
    for (const modo of ['lanza', 'lento'] as const) {
      usarCanal('fcm', canalFalso(modo).canal);
      const { pro, cli, servicio } = await escenario();
      const t0 = Date.now();
      const res = await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' });
      expect(res.status).toBe(201);
      expect(Date.now() - t0).toBeLessThan(1000);
    }
    await esperarAvisosPendientes();
  }, 10_000);

  it('sin canal configurado (dev) no pasa nada', async () => {
    usarCanal('fcm', null);
    const { pro, cli, servicio } = await escenario();
    expect((await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).status).toBe(201);
  });
});
