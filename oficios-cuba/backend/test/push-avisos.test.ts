import { beforeEach, describe, expect, it } from 'vitest';
import { api, crearServicio, db, ponerPlan, registrar } from './helpers.js';
import type { CanalPush, Notificacion } from '../src/push/canal.js';
import { enviarPushPendientes } from '../src/notifier/push.js';

function canalFalso(respuesta: 'ok' | 'token_invalido' | 'error' | 'lanza' = 'ok') {
  const enviados: { token: string; n: Notificacion }[] = [];
  const canal: CanalPush = {
    async enviar(token, n) {
      enviados.push({ token, n });
      if (respuesta === 'lanza') throw new Error('FCM caído');
      return respuesta;
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

interface Fila { device_id: string; user_id: string; titulo: string; cuerpo: string; datos: string; status: string; attempts: number; last_error: string | null }
const bandejaDe = (userId: string) => db.prepare('SELECT * FROM push_outbox WHERE user_id = ? ORDER BY created_at, rowid').all(userId) as Fila[];
const tokenDe = (deviceId: string) => (db.prepare('SELECT token FROM push_devices WHERE id = ?').get(deviceId) as { token: string } | undefined)?.token;

// Cada prueba del notificador empieza con la bandeja vacía de pendientes de las anteriores.
beforeEach(() => { db.prepare("UPDATE push_outbox SET status = 'skipped' WHERE status = 'pending'").run(); });

describe('avisos push: la API apunta en push_outbox', () => {
  it('una solicitud nueva se apunta para el PROVEEDOR (su usuario, no su perfil) y no para el cliente', async () => {
    const { pro, cli, servicio } = await escenario();
    const res = await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'Mi nevera no enfría' });
    expect(res.status).toBe(201);

    const filas = bandejaDe(pro.userId);
    expect(filas).toHaveLength(1);
    expect(tokenDe(filas[0].device_id)).toBe(`tok-pro-${pro.userId}`);
    expect(filas[0].titulo).toMatch(/^Nueva solicitud de /);
    expect(JSON.parse(filas[0].datos)).toEqual({ tipo: 'mensaje', conversation_id: res.body.conversation.id });
    expect(filas[0].status).toBe('pending');
    // Nunca el texto del mensaje.
    expect(JSON.stringify(filas[0])).not.toContain('nevera no enfría');
    expect(bandejaDe(cli.userId)).toEqual([]);
  });

  it('un mensaje del proveedor se apunta para el cliente y no para el proveedor', async () => {
    const { pro, cli, servicio } = await escenario();
    const conv = (await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).body.conversation.id;
    await api.post(`/api/conversations/${conv}/messages`).set(pro.auth).send({ content: 'Paso mañana a las 10' });
    const filas = bandejaDe(cli.userId);
    expect(filas).toHaveLength(1);
    expect(filas[0].titulo).toMatch(/^Nuevo mensaje de /);
    expect(JSON.stringify(filas[0])).not.toContain('mañana');
    expect(bandejaDe(pro.userId)).toHaveLength(1); // solo la solicitud inicial
  });

  it('una segunda conversación del mismo cliente con el mismo servicio no es "solicitud nueva" sino mensaje', async () => {
    const { pro, cli, servicio } = await escenario();
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' });
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'sigo esperando' });
    expect(bandejaDe(pro.userId).map((f) => f.titulo.split(' de ')[0])).toEqual(['Nueva solicitud', 'Nuevo mensaje']);
  });

  it('una fila por dispositivo; sin dispositivos no se apunta nada', async () => {
    const { pro, cli, servicio } = await escenario();
    await api.post('/api/push/devices').set(pro.auth).send({ canal: 'fcm', token: `tok-pro-2-${pro.userId}`, plataforma: 'ios', app_version: '0.1.0' });
    await api.delete(`/api/push/devices/tok-cli-${cli.userId}`).set(cli.auth);
    const conv = (await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).body.conversation.id;
    expect(bandejaDe(pro.userId)).toHaveLength(2);
    const res = await api.post(`/api/conversations/${conv}/messages`).set(pro.auth).send({ content: 'dime' });
    expect(res.status).toBe(201);
    expect(bandejaDe(cli.userId)).toEqual([]);
  });
});

describe('avisos push: oficio_notifier envía la bandeja', () => {
  async function unaSolicitud() {
    const e = await escenario();
    await api.post('/api/conversations').set(e.cli.auth).send({ provider_id: e.pro.providerId, service_id: e.servicio, initial_message: 'hola' });
    return e;
  }

  it('envía al token del dispositivo con los datos y marca enviada', async () => {
    const { pro } = await unaSolicitud();
    const f = canalFalso();
    expect(await enviarPushPendientes({ fcm: f.canal })).toBe(1);
    expect(f.enviados).toHaveLength(1);
    expect(f.enviados[0].token).toBe(`tok-pro-${pro.userId}`);
    expect(f.enviados[0].n.datos.tipo).toBe('mensaje');
    expect(bandejaDe(pro.userId)[0].status).toBe('sent');
    // Una segunda vuelta no la repite.
    expect(await enviarPushPendientes({ fcm: f.canal })).toBe(0);
    expect(f.enviados).toHaveLength(1);
  });

  it('un token inválido borra el dispositivo y sus avisos', async () => {
    const { pro } = await unaSolicitud();
    await enviarPushPendientes({ fcm: canalFalso('token_invalido').canal });
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_devices WHERE user_id = ?').get(pro.userId)).toEqual({ n: 0 });
    expect(bandejaDe(pro.userId)).toEqual([]);
  });

  it('un error (o una excepción) reintenta más tarde y al quinto intento se da por fallido', async () => {
    for (const modo of ['error', 'lanza'] as const) {
      db.prepare("UPDATE push_outbox SET status = 'skipped' WHERE status = 'pending'").run();
      const { pro } = await unaSolicitud();
      await enviarPushPendientes({ fcm: canalFalso(modo).canal });
      const [fila] = bandejaDe(pro.userId);
      expect(fila).toMatchObject({ status: 'pending', attempts: 1 });
      // Espera exponencial: no se reintenta en la vuelta siguiente.
      const f = canalFalso();
      await enviarPushPendientes({ fcm: f.canal });
      expect(f.enviados).toHaveLength(0);

      db.prepare('UPDATE push_outbox SET attempts = 4, send_after = ? WHERE user_id = ?').run(new Date(0).toISOString(), pro.userId);
      await enviarPushPendientes({ fcm: canalFalso(modo).canal });
      expect(bandejaDe(pro.userId)[0]).toMatchObject({ status: 'failed', attempts: 5 });
    }
  });

  it('si el teléfono pasó a otra cuenta antes del envío, el aviso de la anterior no se manda', async () => {
    const { pro } = await unaSolicitud();
    const otro = await registrar('client');
    await api.post('/api/push/devices').set(otro.auth).send({ canal: 'fcm', token: `tok-pro-${pro.userId}`, plataforma: 'android', app_version: '0.1.0' });
    const f = canalFalso();
    await enviarPushPendientes({ fcm: f.canal });
    expect(f.enviados).toHaveLength(0);
    expect(bandejaDe(pro.userId)[0]).toMatchObject({ status: 'skipped', last_error: 'el dispositivo cambió de cuenta' });
  });

  it('un aviso de hace más de un día caduca sin enviarse', async () => {
    const { pro } = await unaSolicitud();
    db.prepare('UPDATE push_outbox SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 25 * 3_600_000).toISOString(), pro.userId);
    const f = canalFalso();
    await enviarPushPendientes({ fcm: f.canal });
    expect(f.enviados).toHaveLength(0);
    expect(bandejaDe(pro.userId)[0]).toMatchObject({ status: 'skipped', last_error: 'caducado' });
  });

  it('sin canal configurado los avisos esperan', async () => {
    const { pro } = await unaSolicitud();
    expect(await enviarPushPendientes({})).toBe(0);
    expect(bandejaDe(pro.userId)[0].status).toBe('pending');
  });
});
