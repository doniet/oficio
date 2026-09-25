import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { crearCanalFcm } from '../src/push/fcm.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const cuenta = { project_id: 'oficios-test', client_email: 'push@oficios-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
const n = { titulo: 'Nuevo mensaje de Laura', cuerpo: 'Toca para leerlo', datos: { tipo: 'mensaje', conversation_id: 'c1' } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fetchFalso(envio: () => Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const assertion = new URLSearchParams(init.body as string).get('assertion')!;
      const claims = jwt.verify(assertion, publicKey.export({ type: 'spki', format: 'pem' }).toString(), { algorithms: ['RS256'] }) as Record<string, unknown>;
      expect(claims.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
      return json(200, { access_token: 'ACCESO', expires_in: 3600 });
    }
    return envio();
  });
}

describe('canal FCM', () => {
  it('envía con el token OAuth y el formato v1 (canal Android "mensajes", prioridad alta)', async () => {
    const f = fetchFalso(() => json(200, { name: 'projects/oficios-test/messages/1' }));
    expect(await crearCanalFcm(cuenta, f as unknown as typeof fetch).enviar('TOK', n)).toBe('ok');
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/oficios-test/messages:send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ACCESO');
    expect(JSON.parse(init.body as string)).toEqual({
      message: {
        token: 'TOK',
        notification: { title: n.titulo, body: n.cuerpo },
        data: n.datos,
        android: { priority: 'high', notification: { channel_id: 'mensajes' } },
      },
    });
  });

  it('reutiliza el token OAuth entre envíos', async () => {
    const f = fetchFalso(() => json(200, {}));
    const canal = crearCanalFcm(cuenta, f as unknown as typeof fetch);
    await canal.enviar('A', n);
    await canal.enviar('B', n);
    expect(f.mock.calls.filter((c) => c[0] === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('UNREGISTERED → token_invalido; 500 → error', async () => {
    const invalido = fetchFalso(() => json(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
    expect(await crearCanalFcm(cuenta, invalido as unknown as typeof fetch).enviar('X', n)).toBe('token_invalido');
    const caido = fetchFalso(() => json(500, { error: { status: 'INTERNAL' } }));
    expect(await crearCanalFcm(cuenta, caido as unknown as typeof fetch).enviar('X', n)).toBe('error');
  });
});
