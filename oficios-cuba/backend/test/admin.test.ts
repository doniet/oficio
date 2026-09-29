import { generateKeyPairSync } from 'crypto';
import { describe, expect, it } from 'vitest';
import { api, registrar } from './helpers.js';
import { q, qOne } from '../src/db/acceso.js';
import { codigo, pasoActual } from '../src/lib/totp.js';
import { descifrarToken } from '../src/lib/telegram-comun.js';

const TOKEN = '8123456789:AAH-un_token_de_prueba_con_longitud_ok';
const poner = (k: string, v: string) => q('INSERT INTO telegram_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, v]);

async function adminCon2fa() {
  const u = await registrar('client');
  await q('UPDATE users SET is_admin = true WHERE id = $1', [u.userId]);
  const { secret } = (await api.post('/api/admin/2fa/setup').set(u.auth)).body;
  const paso = pasoActual();
  const enable = await api.post('/api/admin/2fa/enable').set(u.auth).send({ code: codigo(secret, paso) });
  expect(enable.status).toBe(200);
  return { ...u, secret, paso, admin: { ...u.auth, 'X-Admin-Token': enable.body.admin_token } };
}

describe('panel de administración', () => {
  it('no se anuncia a quien no es admin', async () => {
    const u = await registrar('provider');
    expect((await api.get('/api/admin/me').set(u.auth)).status).toBe(404);
    expect((await api.get('/api/admin/system').set(u.auth)).status).toBe(404);
    expect((await api.get('/api/auth/me').set(u.auth)).body.user.is_admin).toBeUndefined();
  });

  it('exige 2FA: sin sesión de administración no hay datos, y el código no vale dos veces', async () => {
    const a = await adminCon2fa();
    expect((await api.get('/api/auth/me').set(a.auth)).body.user.is_admin).toBe(true);
    const sin = await api.get('/api/admin/system').set(a.auth);
    expect(sin.status).toBe(401);
    expect(sin.body.code).toBe('admin_2fa');

    const sys = await api.get('/api/admin/system').set(a.admin);
    expect(sys.status).toBe(200);
    expect(sys.body).toMatchObject({ schema_version: sys.body.schema_expected, demo_mode: false });
    expect(sys.body.disk.free_bytes).toBeGreaterThan(0);

    // El código con el que se activó ya está usado.
    expect((await api.post('/api/admin/2fa/verify').set(a.auth).send({ code: codigo(a.secret, a.paso) })).status).toBe(401);
    expect((await api.post('/api/admin/2fa/setup').set(a.auth)).status).toBe(409);

    // Reiniciar el 2FA (CLI) invalida la sesión abierta.
    await q('UPDATE users SET totp_enabled_at = NULL, totp_secret = NULL WHERE id = $1', [a.userId]);
    expect((await api.get('/api/admin/system').set(a.admin)).status).toBe(401);
  });

  it('bloquea tras 5 códigos incorrectos', async () => {
    const a = await adminCon2fa();
    for (let i = 0; i < 5; i++) expect((await api.post('/api/admin/2fa/verify').set(a.auth).send({ code: '000000' })).status).toBe(401);
    expect((await api.post('/api/admin/2fa/verify').set(a.auth).send({ code: codigo(a.secret, a.paso + 1) })).status).toBe(429);
  });

  it('el token de Telegram se guarda cifrado para el notificador y nunca vuelve a salir', async () => {
    const a = await adminCon2fa();
    await q("DELETE FROM telegram_state WHERE key = 'notifier_pubkey'");
    const siguiente = () => codigo(a.secret, a.paso + 1);
    expect((await api.put('/api/admin/telegram/token').set(a.admin).send({ token: TOKEN, code: siguiente() })).status).toBe(409);

    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await poner('notifier_pubkey', publicKey.export({ type: 'spki', format: 'pem' }) as string);
    // Hace falta un código nuevo: el de antes ya se consumió en el 409.
    expect((await api.put('/api/admin/telegram/token').set(a.admin).send({ token: TOKEN, code: siguiente() })).status).toBe(401);
    expect((await api.put('/api/admin/telegram/token').set(a.admin).send({ token: 'no-es-un-token', code: codigo(a.secret, a.paso - 1) })).status).toBe(400);

    await q('UPDATE users SET totp_last_step = $1 WHERE id = $2', [a.paso, a.userId]);
    const ok = await api.put('/api/admin/telegram/token').set(a.admin).send({ token: TOKEN, code: siguiente() });
    expect(ok.body).toEqual({ ok: true, hint: TOKEN.slice(-4) });

    const cifrado = (await qOne<{ value: string }>("SELECT value FROM telegram_state WHERE key = 'token_cipher'"))!.value;
    expect(cifrado).not.toContain(TOKEN);
    expect(descifrarToken(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, cifrado)).toBe(TOKEN);

    const info = await api.get('/api/admin/telegram').set(a.admin);
    expect(info.body.token).toMatchObject({ configured: true, hint: TOKEN.slice(-4) });
    expect(JSON.stringify(info.body)).not.toContain(TOKEN.split(':')[1]);

    const registro = (await api.get('/api/admin/audit').set(a.admin)).body.entries.map((e: { action: string }) => e.action);
    expect(registro).toEqual(expect.arrayContaining(['2fa_activado', 'telegram_token_cambiado', '2fa_fallido']));
  });
});
