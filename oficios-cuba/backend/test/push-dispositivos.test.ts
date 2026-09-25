import { describe, expect, it } from 'vitest';
import { api, db, registrar } from './helpers.js';
import { dispositivosDe } from '../src/push/registro.js';

const dispositivo = (token: string) => ({ canal: 'fcm', token, plataforma: 'android', app_version: '0.1.0' });

describe('dispositivos push', () => {
  it('registra y es idempotente', async () => {
    const u = await registrar('client');
    expect((await api.post('/api/push/devices').set(u.auth).send(dispositivo('tok-a'))).status).toBe(201);
    expect((await api.post('/api/push/devices').set(u.auth).send(dispositivo('tok-a'))).status).toBe(201);
    expect(dispositivosDe(u.userId)).toEqual([{ canal: 'fcm', token: 'tok-a' }]);
  });

  it('un token que pasa a otra cuenta deja de pertenecer a la anterior', async () => {
    const a = await registrar('client');
    const b = await registrar('provider');
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-compartido'));
    await api.post('/api/push/devices').set(b.auth).send(dispositivo('tok-compartido'));
    expect(dispositivosDe(a.userId)).toEqual([]);
    expect(dispositivosDe(b.userId)).toEqual([{ canal: 'fcm', token: 'tok-compartido' }]);
  });

  it('cualquier sesión puede borrar un token que conoce (reintento tras cambiar de cuenta)', async () => {
    // El token FCM solo lo conoce el teléfono: quien lo tiene es ese dispositivo, y borrarlo
    // solo deja de enviarle avisos. Es lo que permite reintentar el borrado pendiente de la
    // cuenta anterior con la sesión de la cuenta que entra después.
    const a = await registrar('client');
    const b = await registrar('client');
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-de-a'));
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-otro-de-a'));
    expect((await api.delete('/api/push/devices/tok-de-a').set(b.auth)).status).toBe(200);
    expect(dispositivosDe(a.userId)).toEqual([{ canal: 'fcm', token: 'tok-otro-de-a' }]);
  });

  it('borrar exige sesión', async () => {
    const a = await registrar('client');
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-protegido'));
    expect((await api.delete('/api/push/devices/tok-protegido')).status).toBe(401);
    expect(dispositivosDe(a.userId)).toHaveLength(1);
  });

  it('cambiar la contraseña borra los dispositivos de esa cuenta (y solo los suyos)', async () => {
    const a = await registrar('client');
    const b = await registrar('client');
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-a-1'));
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-a-2'));
    await api.post('/api/push/devices').set(b.auth).send(dispositivo('tok-b-1'));
    const res = await api.put('/api/auth/password').set(a.auth).send({ current_password: 'Clave-segura-1', new_password: 'Otra-clave-2' });
    expect(res.status).toBe(200);
    expect(dispositivosDe(a.userId)).toEqual([]);
    expect(dispositivosDe(b.userId)).toEqual([{ canal: 'fcm', token: 'tok-b-1' }]);
  });

  it('una contraseña actual incorrecta no borra los dispositivos', async () => {
    const a = await registrar('client');
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-a-seguro'));
    const res = await api.put('/api/auth/password').set(a.auth).send({ current_password: 'mala-clave', new_password: 'Otra-clave-2' });
    expect(res.status).toBe(400);
    expect(dispositivosDe(a.userId)).toHaveLength(1);
  });

  it('valida la entrada y exige sesión', async () => {
    const u = await registrar('client');
    expect((await api.post('/api/push/devices').send(dispositivo('x'))).status).toBe(401);
    expect((await api.post('/api/push/devices').set(u.auth).send({ ...dispositivo('x'), canal: 'sms' })).status).toBe(400);
    expect((await api.post('/api/push/devices').set(u.auth).send({ ...dispositivo('') })).status).toBe(400);
  });

  it('al borrar el usuario se borran sus dispositivos', async () => {
    const u = await registrar('client');
    await api.post('/api/push/devices').set(u.auth).send(dispositivo('tok-borrado'));
    db.prepare('DELETE FROM users WHERE id = ?').run(u.userId);
    expect(db.prepare("SELECT COUNT(*) AS n FROM push_devices WHERE token = 'tok-borrado'").get()).toEqual({ n: 0 });
  });
});
