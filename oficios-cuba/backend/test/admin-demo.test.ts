import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.DEMO_MODE = 'true'; });

import { api, registrar } from './helpers.js';
import { q } from '../src/db/acceso.js';
import { codigo, nuevoSecreto, pasoActual } from '../src/lib/totp.js';

describe('atajo de admin de la demo (DEMO_MODE)', () => {
  it('admin@demo.com: exige 2FA activo primero, y luego entra al panel sin código', async () => {
    const u = await registrar('client', { email: 'admin@demo.com' });
    await q('UPDATE users SET is_admin = true WHERE id = $1', [u.userId]);

    // Sembrada pero sin 2FA activado todavía: el atajo no puede abrir una sesión sin él.
    expect((await api.post('/api/admin/2fa/demo-enter').set(u.auth)).status).toBe(400);

    const secret = nuevoSecreto();
    await q('UPDATE users SET totp_secret = $1, totp_enabled_at = now() WHERE id = $2', [secret, u.userId]);

    const res = await api.post('/api/admin/2fa/demo-enter').set(u.auth);
    expect(res.status).toBe(200);
    expect(res.body.admin_token).toBeTruthy();

    const sys = await api.get('/api/admin/system').set({ ...u.auth, 'X-Admin-Token': res.body.admin_token });
    expect(sys.status).toBe(200);
    expect(sys.body.demo_mode).toBe(true);
  });

  it('no funciona para otro admin, aunque esté en DEMO_MODE y tenga 2FA activo', async () => {
    const u = await registrar('client');
    const secret = nuevoSecreto();
    await q('UPDATE users SET is_admin = true, totp_secret = $1, totp_enabled_at = now() WHERE id = $2', [secret, u.userId]);

    expect((await api.post('/api/admin/2fa/demo-enter').set(u.auth)).status).toBe(404);
    // El camino normal sigue disponible para un admin real.
    const paso = pasoActual();
    expect((await api.post('/api/admin/2fa/verify').set(u.auth).send({ code: codigo(secret, paso) })).status).toBe(200);
  });
});
