import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { cargarCuentaFcm, crearCanalFcm } from '../src/push/fcm.js';

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

  it('SENDER_ID_MISMATCH (cuenta de servicio equivocada/rotada) → error, NUNCA token_invalido', async () => {
    // Su mensaje humano real menciona "the registration token" — si el clasificador
    // grepeara el cuerpo en vez de leer error.details[].errorCode, confundiría esto con
    // un token muerto y borraría TODOS los dispositivos válidos ante un simple desajuste
    // de configuración (fix ronda 1).
    const mal = fetchFalso(() => json(403, {
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        message: 'The authenticated sender ID is different from the sender ID for the registration token.',
        details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'SENDER_ID_MISMATCH' }],
      },
    }));
    expect(await crearCanalFcm(cuenta, mal as unknown as typeof fetch).enviar('X', n)).toBe('error');
  });

  it('400 INVALID_ARGUMENT por payload mal formado → error (nunca se borra por ambigüedad)', async () => {
    const malo = fetchFalso(() => json(400, {
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'Invalid JSON payload received. Unknown name "notificacion": Cannot find field.',
        details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'INVALID_ARGUMENT' }],
      },
    }));
    expect(await crearCanalFcm(cuenta, malo as unknown as typeof fetch).enviar('X', n)).toBe('error');
  });
});

describe('cargarCuentaFcm', () => {
  function archivoTmp(contenido: string) {
    const dir = mkdtempSync(join(tmpdir(), 'fcm-cuenta-'));
    const ruta = join(dir, 'fcm.json');
    writeFileSync(ruta, contenido);
    return ruta;
  }

  it('sin ruta configurada, devuelve null (push desactivado)', () => {
    expect(cargarCuentaFcm(undefined)).toBeNull();
  });

  it('JSON inválido: el mensaje no incluye el contenido del archivo', () => {
    const ruta = archivoTmp('{ esto no es JSON válido, tiene clave_secreta_de_prueba');
    try {
      cargarCuentaFcm(ruta);
      expect.unreachable('debía lanzar');
    } catch (err) {
      expect((err as Error).message).not.toContain('clave_secreta_de_prueba');
      expect((err as Error).message).toContain(ruta);
    }
  });

  it('JSON válido pero sin los campos de una cuenta de servicio: el mensaje no incluye el contenido', () => {
    const ruta = archivoTmp(JSON.stringify({ private_key: 'SECRETO-DE-PRUEBA-QUE-NO-DEBE-SALIR' }));
    try {
      cargarCuentaFcm(ruta);
      expect.unreachable('debía lanzar');
    } catch (err) {
      expect((err as Error).message).not.toContain('SECRETO-DE-PRUEBA-QUE-NO-DEBE-SALIR');
      expect((err as Error).message).toContain(ruta);
    }
  });

  it('archivo inexistente: el mensaje no incluye contenido (no lo hay) y sí la ruta', () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'fcm-cuenta-')), 'no-existe.json');
    expect(() => cargarCuentaFcm(ruta)).toThrow(ruta);
  });
});
