import { describe, expect, it } from 'vitest';
import { api, crearServicio, registrar } from './helpers.js';
import { q, qOne } from '../src/db/acceso.js';

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
    await q('DELETE FROM users WHERE id = $1', [u.userId]);
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

  it('un id que no es uuid da 404, no 500', async () => {
    for (const ruta of ['/api/providers/abc', '/api/services/no-es-uuid', '/api/reviews/provider/xxx']) {
      expect((await api.get(ruta)).status, ruta).toBe(404);
    }
  });
});

describe('validación de imágenes', () => {
  // imagenPermitida es async desde la Tarea 8; sin `await` en el llamador la validación se salta
  // en silencio (!Promise es siempre false) y el typecheck no lo detecta (strict:false). Este test
  // no depende de /api/uploads (Tarea 9, sin portar): basta con que la URL externa sea rechazada.
  it('el avatar rechaza una URL externa arbitraria', async () => {
    const u = await registrar('client');
    const res = await api.put('/api/auth/profile').set(u.auth).send({ avatar_url: 'https://ejemplo.com/foto.jpg' });
    expect(res.status).toBe(400);
  });
});

describe('perfil público del proveedor', () => {
  it('no expone coordenadas si el profesional no eligió mostrarlas en el mapa', async () => {
    const pro = await registrar('provider');
    await crearServicio(pro.auth);
    await q('UPDATE provider_profiles SET lat = 23.1, lng = -82.3 WHERE id = $1', [pro.providerId]);
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

// pp.* (auth.ts /me y providers.ts /me/profile) también traía busca (tsvector generado) y
// punto_pub (WKB hex de PostGIS): no son fuga de privacidad (es el propio perfil autenticado),
// pero son peso y campos no declarados en el contrato — GET /auth/me lo llaman las dos apps en
// cada arranque.
describe('el propio perfil no manda columnas internas de búsqueda/ubicación', () => {
  it('GET /api/auth/me', async () => {
    const pro = await registrar('provider');
    const res = await api.get('/api/auth/me').set(pro.auth);
    expect(res.status).toBe(200);
    expect(res.body.providerProfile).not.toHaveProperty('busca');
    expect(res.body.providerProfile).not.toHaveProperty('punto_pub');
  });

  it('GET y PUT /api/providers/me/profile', async () => {
    const pro = await registrar('provider');
    const provincia = (await qOne<{ id: string }>('SELECT id FROM provinces LIMIT 1'))!.id;
    const put = await api.put('/api/providers/me/profile').set(pro.auth).send({ business_name: 'Mi Taller', province_id: provincia });
    expect(put.status).toBe(200);
    expect(put.body.provider).not.toHaveProperty('busca');
    expect(put.body.provider).not.toHaveProperty('punto_pub');

    const get = await api.get('/api/providers/me/profile').set(pro.auth);
    expect(get.status).toBe(200);
    expect(get.body.provider).not.toHaveProperty('busca');
    expect(get.body.provider).not.toHaveProperty('punto_pub');
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
    for (let i = 0; i < 60; i++) {
      await q('INSERT INTO uploads (name, user_id, created_at) VALUES ($1, $2, $3)', [`relleno-${a.userId}-${i}.png`, a.userId, hoy]);
    }
    expect((await api.post('/api/uploads').set(a.auth).send({ data: png })).status).toBe(429);
  });
});
