import { describe, expect, it } from 'vitest';
import { api, crearServicio, db, registrar } from './helpers.js';

describe('sesiones', () => {
  it('cambiar la contraseña invalida los tokens anteriores y devuelve uno nuevo', async () => {
    const u = await registrar('client');
    // El iat del JWT va en segundos: sin esta espera el token viejo y el cambio caen en el mismo segundo.
    await new Promise((r) => setTimeout(r, 1100));
    const res = await api.put('/api/auth/password').set(u.auth).send({ current_password: 'Clave-segura-1', new_password: 'Otra-clave-2' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    expect((await api.get('/api/auth/me').set(u.auth)).status).toBe(401);
    expect((await api.get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` })).status).toBe(200);
  });

  it('el token de un usuario borrado deja de valer', async () => {
    const u = await registrar('client');
    db.prepare('DELETE FROM users WHERE id = ?').run(u.userId);
    expect((await api.get('/api/auth/me').set(u.auth)).status).toBe(401);
  });

  it('bloquea la fuerza bruta contra una misma cuenta aunque cambie la IP', async () => {
    const u = await registrar('client');
    let ultimo = 0;
    for (let i = 0; i < 12; i++) {
      const r = await api.post('/api/auth/login').set('CF-Connecting-IP', `10.0.0.${i}`).send({ email: u.email, password: 'mala' });
      ultimo = r.status;
    }
    expect(ultimo).toBe(429);
  });
});

describe('perfil público del proveedor', () => {
  it('no expone coordenadas si el profesional no eligió mostrarlas en el mapa', async () => {
    const pro = await registrar('provider');
    await crearServicio(pro.auth);
    db.prepare('UPDATE provider_profiles SET lat = 23.1, lng = -82.3 WHERE id = ?').run(pro.providerId);
    const perfil = await api.get(`/api/providers/${pro.providerId}`);
    expect(perfil.body.provider).not.toHaveProperty('lat');
    expect(perfil.body.provider).not.toHaveProperty('lng');
    const servicio = (await api.get('/api/services').query({ provider_id: pro.providerId })).body.services[0];
    const detalle = await api.get(`/api/services/${servicio.id}`);
    expect(detalle.body.service).not.toHaveProperty('lat');
    expect(detalle.body.service).not.toHaveProperty('lng');
  });

  it('un proveedor sin nombre de negocio aparece en el listado de profesionales', async () => {
    const pro = await registrar('provider');
    await crearServicio(pro.auth);
    const res = await api.get('/api/providers').query({ limit: 48, sort: 'newest' });
    expect(res.body.providers.map((p: { id: string }) => p.id)).toContain(pro.providerId);
  });
});

describe('subidas', () => {
  const png = 'data:image/png;base64,' + Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64),
  ]).toString('base64');

  it('el avatar solo acepta subidas propias', async () => {
    const a = await registrar('provider');
    const b = await registrar('provider');
    const subida = await api.post('/api/uploads').set(a.auth).send({ data: png });
    expect(subida.status).toBe(201);

    expect((await api.put('/api/auth/profile').set(b.auth).send({ avatar_url: subida.body.url })).status).toBe(400);
    expect((await api.put('/api/auth/profile').set(a.auth).send({ avatar_url: subida.body.url })).status).toBe(200);
    expect((await api.put('/api/auth/profile').set(a.auth).send({ avatar_url: 'https://evil.example/a.png' })).status).toBe(400);
  });

  it('tiene cuota diaria por usuario', async () => {
    const a = await registrar('provider');
    const hoy = new Date().toISOString();
    const ins = db.prepare('INSERT INTO uploads (name, user_id, created_at) VALUES (?, ?, ?)');
    for (let i = 0; i < 60; i++) ins.run(`relleno-${a.userId}-${i}.png`, a.userId, hoy);
    expect((await api.post('/api/uploads').set(a.auth).send({ data: png })).status).toBe(429);
  });
});
