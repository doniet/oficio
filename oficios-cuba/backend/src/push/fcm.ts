import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { CanalPush, Notificacion, ResultadoEnvio } from './canal.js';

interface CuentaServicio { project_id: string; client_email: string; private_key: string }

export function cargarCuentaFcm(ruta = process.env.FCM_SERVICE_ACCOUNT_FILE): CuentaServicio | null {
  if (!ruta) return null;
  let contenido: string;
  try {
    contenido = readFileSync(ruta, 'utf8');
  } catch {
    // Nunca el detalle del sistema de archivos: solo la ruta, sin contenido.
    throw new Error(`No se pudo leer ${ruta}`);
  }
  let c: Partial<CuentaServicio>;
  try {
    c = JSON.parse(contenido);
  } catch {
    // JSON.parse en Node puede citar un fragmento del texto en el mensaje de error;
    // nunca lo reenviamos tal cual (podría filtrar la clave privada).
    throw new Error(`${ruta} no es un JSON válido`);
  }
  if (!c.project_id || !c.client_email || !c.private_key) throw new Error(`${ruta} no es una cuenta de servicio de Firebase`);
  return c as CuentaServicio;
}

interface RespuestaErrorFcm { error?: { status?: string; details?: { errorCode?: string }[] } }

// Clasifica por el error ESTRUCTURADO de FCM (`error.details[].errorCode`, `error.status`),
// nunca por un grep del mensaje humano: SENDER_ID_MISMATCH (cuenta de servicio equivocada o
// rotada) también dice "the registration token" en su texto, y confiar en eso borraría TODOS
// los dispositivos válidos ante un simple error de configuración.
function clasificarError(status: number, cuerpo: RespuestaErrorFcm | null): ResultadoEnvio {
  // `details` viene de la red: si no es un array (cuerpo inesperado, proxy intermedio), se ignora.
  const details = cuerpo?.error?.details;
  const errorCode = Array.isArray(details) ? details.find((d) => d && typeof d.errorCode === 'string')?.errorCode : undefined;
  if (errorCode === 'UNREGISTERED') return 'token_invalido';
  if (status === 404 && cuerpo?.error?.status === 'NOT_FOUND') return 'token_invalido';
  if (errorCode === 'SENDER_ID_MISMATCH') {
    console.warn('push fcm: SENDER_ID_MISMATCH — revisa FCM_SERVICE_ACCOUNT_FILE (¿cuenta de servicio equivocada o rotada?)');
  }
  // 400 INVALID_ARGUMENT: la documentación de FCM no da una forma estructurada confiable de
  // distinguir "el token es inválido" de "el payload está mal formado" — nunca se borra el
  // dispositivo por ambigüedad. Igual para 401/403 de auth, QUOTA_EXCEEDED, UNAVAILABLE,
  // INTERNAL y cualquier otro código no reconocido arriba.
  return 'error';
}

export function crearCanalFcm(cuenta: CuentaServicio, fetchImpl: typeof fetch = fetch): CanalPush {
  let acceso: { token: string; vence: number } | null = null;

  async function tokenAcceso() {
    if (acceso && acceso.vence > Date.now() + 60_000) return acceso.token;
    const ahora = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      { iss: cuenta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 },
      cuenta.private_key,
      { algorithm: 'RS256' },
    );
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`OAuth de FCM respondió ${res.status}`);
    const d = (await res.json()) as { access_token: string; expires_in: number };
    acceso = { token: d.access_token, vence: Date.now() + d.expires_in * 1000 };
    return acceso.token;
  }

  return {
    async enviar(token: string, n: Notificacion): Promise<ResultadoEnvio> {
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${cuenta.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await tokenAcceso()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: n.titulo, body: n.cuerpo },
            data: n.datos,
            // Mismo id de canal que crea la app (expo-notifications, Task 9).
            android: { priority: 'high', notification: { channel_id: 'mensajes' } },
          },
        }),
      });
      if (res.ok) return 'ok';
      return clasificarError(res.status, await res.json().catch(() => null));
    },
  };
}
