import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.DEMO_MODE = 'true'; });

import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { api, db, registrar } from './helpers.js';
import { verificarIdTokenGoogle } from '../src/lib/google.js';

describe('Google simulado (DEMO_MODE)', () => {
  it('pide el tipo de cuenta la primera vez y luego crea un profesional en plan Gratis', async () => {
    const cuenta = { mode: 'demo', email: 'nuevo.oficio@gmail.com', full_name: 'Nuevo Oficio' };
    const primera = await api.post('/api/auth/google').send(cuenta);
    expect(primera.body).toMatchObject({ needs_user_type: true, email: cuenta.email });

    const alta = await api.post('/api/auth/google').send({ ...cuenta, user_type: 'provider' });
    expect(alta.status).toBe(201);
    expect(alta.body.user).toMatchObject({ user_type: 'provider', google: true, has_password: false });
    const perfil = db.prepare('SELECT subscription_plan FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE u.email = ?').get(cuenta.email);
    expect(perfil).toEqual({ subscription_plan: 'free' });

    const otraVez = await api.post('/api/auth/google').send(cuenta);
    expect(otraVez.status).toBe(200);
    expect(otraVez.body.user.id).toBe(alta.body.user.id);

    // Sin contraseña: el login clásico no entra.
    expect((await api.post('/api/auth/login').send({ email: cuenta.email, password: '!google' })).status).toBe(401);
  });

  it('no deja tomar una cuenta que ya existe con contraseña', async () => {
    const c = await registrar('client');
    const res = await api.post('/api/auth/google').send({ mode: 'demo', email: c.email, full_name: 'Intruso', user_type: 'client' });
    expect(res.status).toBe(409);
  });

  it('el flujo real está apagado sin GOOGLE_CLIENT_ID', async () => {
    const res = await api.post('/api/auth/google').send({ mode: 'google', id_token: 'x'.repeat(40), nonce: 'n'.repeat(20), user_type: 'client' });
    expect(res.status).toBe(503);
    expect((await api.get('/api/config')).body).toMatchObject({ demo: true, google: 'demo' });
  });
});

describe('verificación del id_token real', () => {
  it('acepta un token firmado para nuestra audiencia y con el nonce correcto; rechaza el resto', async () => {
    process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const claves = createLocalJWKSet({ keys: [jwk] });
    const firmar = (claims: Record<string, unknown>, aud = process.env.GOOGLE_CLIENT_ID!) => new SignJWT({ email: 'Ana@Gmail.com', email_verified: true, name: 'Ana', nonce: 'nonce-1234567890abcd', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('https://accounts.google.com').setSubject('123')
      .setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);

    await expect(verificarIdTokenGoogle(await firmar({}), 'nonce-1234567890abcd', claves)).resolves.toMatchObject({ sub: '123', email: 'ana@gmail.com' });
    await expect(verificarIdTokenGoogle(await firmar({}), 'otro-nonce-000000000', claves)).rejects.toThrow();
    await expect(verificarIdTokenGoogle(await firmar({ email_verified: false }), 'nonce-1234567890abcd', claves)).rejects.toThrow();
    await expect(verificarIdTokenGoogle(await firmar({}, 'otra-app'), 'nonce-1234567890abcd', claves)).rejects.toThrow();
    delete process.env.GOOGLE_CLIENT_ID;
  });
});
