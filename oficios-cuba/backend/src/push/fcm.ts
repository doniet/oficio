import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { CanalPush, Notificacion, ResultadoEnvio } from './canal.js';

interface CuentaServicio { project_id: string; client_email: string; private_key: string }

export function cargarCuentaFcm(ruta = process.env.FCM_SERVICE_ACCOUNT_FILE): CuentaServicio | null {
  if (!ruta) return null;
  const c = JSON.parse(readFileSync(ruta, 'utf8'));
  if (!c.project_id || !c.client_email || !c.private_key) throw new Error(`${ruta} no es una cuenta de servicio de Firebase`);
  return c;
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
      // UNREGISTERED (404) siempre es token muerto. INVALID_ARGUMENT (400) también lo es
      // SOLO si el cuerpo señala el token: nuestro payload es fijo y válido, pero no lo
      // asumimos — si el 400 no menciona el token, es un fallo real y no se borra el dispositivo.
      const cuerpo = JSON.stringify(await res.json().catch(() => ({})));
      if (res.status === 404 || /UNREGISTERED|registration token/i.test(cuerpo)) return 'token_invalido';
      return 'error';
    },
  };
}
