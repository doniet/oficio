import { describe, expect, it } from 'vitest';
import { api, registrar } from './helpers.js';
import { q, qOne } from '../src/db/acceso.js';
import { codigo, pasoActual } from '../src/lib/totp.js';

const ARCHIVO = 'oficios-cuba-0.1.0.apk';
const descargar = (ip: string, archivo = ARCHIVO) =>
  api.get('/api/app/descargar').query({ archivo }).set('CF-Connecting-IP', ip);
const total = async () => (await qOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM apk_descargas'))!.n;

async function sesionAdmin() {
  const u = await registrar('client');
  await q('UPDATE users SET is_admin = true WHERE id = $1', [u.userId]);
  const { secret } = (await api.post('/api/admin/2fa/setup').set(u.auth)).body;
  const enable = await api.post('/api/admin/2fa/enable').set(u.auth).send({ code: codigo(secret, pasoActual()) });
  return { ...u.auth, 'X-Admin-Token': enable.body.admin_token };
}

describe('descargas del APK', () => {
  it('cuenta y redirige al archivo (sin caché: cada clic pasa por aquí aunque Cloudflare guarde el APK)', async () => {
    const antes = await total();
    const res = await descargar('203.0.113.10');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/descargas/${ARCHIVO}`);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(await total()).toBe(antes + 1);
  });

  it('la misma IP y versión en 24 h cuenta una vez (en Cuba las descargas se cortan y se reintentan)', async () => {
    const antes = await total();
    await descargar('203.0.113.20');
    const otra = await descargar('203.0.113.20');
    expect(otra.status).toBe(302);
    expect(await total()).toBe(antes + 1);
    await descargar('203.0.113.21');
    expect(await total()).toBe(antes + 2);
    // Otra versión desde la misma IP sí cuenta.
    await descargar('203.0.113.20', 'oficios-cuba-0.2.0.apk');
    expect(await total()).toBe(antes + 3);
    // Pasadas 24 h vuelve a contar.
    await q("UPDATE apk_descargas SET created_at = '2020-01-01T00:00:00.000Z'");
    await descargar('203.0.113.20');
    expect(await total()).toBe(antes + 4);
  });

  it('no guarda la IP en claro', async () => {
    await descargar('198.51.100.77');
    const filas = JSON.stringify(await q('SELECT * FROM apk_descargas'));
    expect(filas).not.toContain('198.51.100.77');
  });

  it('solo acepta nombres de APK de la app: ni otras rutas ni redirecciones fuera del sitio', async () => {
    const antes = await total();
    for (const archivo of ['../../etc/passwd', 'https://malo.example/x.apk', 'oficios-cuba-0.1.0.apk/../x', 'otra-app-1.0.0.apk', 'oficios-cuba-1.apk', '../oficios-cuba-0.1.0.apk', 'x/oficios-cuba-0.1.0.apk', '']) {
      const res = await descargar('203.0.113.30', archivo);
      expect(res.status, archivo).toBe(400);
      expect(res.headers.location).toBeUndefined();
    }
    expect((await api.get('/api/app/descargar').set('CF-Connecting-IP', '203.0.113.30')).status).toBe(400);
    expect(await total()).toBe(antes);
  });

  it('el panel técnico muestra el total, los últimos 7 días y el desglose por versión', async () => {
    await q('DELETE FROM apk_descargas');
    await descargar('192.0.2.1');
    await descargar('192.0.2.2');
    await descargar('192.0.2.3', 'oficios-cuba-0.2.0.apk');
    await q("UPDATE apk_descargas SET created_at = '2020-01-01T00:00:00.000Z' WHERE version = '0.2.0'");
    // La sesión primero: supertest abre su servidor al crear la petición y no espera a un `await` dentro de `.set()`.
    const admin = await sesionAdmin();
    const sys = await api.get('/api/admin/system').set(admin);
    expect(sys.status).toBe(200);
    expect(sys.body.app_downloads).toEqual({ total: 3, last7d: 2, by_version: [{ version: '0.1.0', n: 2 }, { version: '0.2.0', n: 1 }] });
  });
});
