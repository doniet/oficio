import { v4 as uuidv4 } from 'uuid';
import { q } from '../db/acceso.js';

export type Canal = 'fcm';

export async function registrarDispositivo(userId: string, d: { canal: Canal; token: string; plataforma: 'android' | 'ios'; app_version: string }) {
  const ahora = new Date().toISOString();
  // Si el token era de otra cuenta (teléfono prestado, cambio de sesión), pasa a esta.
  await q(`
    INSERT INTO push_devices (id, user_id, canal, token, plataforma, app_version, created_at, last_seen_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (canal, token) DO UPDATE SET user_id = EXCLUDED.user_id, plataforma = EXCLUDED.plataforma,
      app_version = EXCLUDED.app_version, last_seen_at = EXCLUDED.last_seen_at
  `, [uuidv4(), userId, d.canal, d.token, d.plataforma, d.app_version, ahora, ahora]);
}

// Borra por token, sea de quien sea: el token FCM es un secreto que solo conoce el dispositivo
// y borrarlo solo deja de enviarle avisos. Así, si la app no pudo borrarlo al cerrar la sesión
// de una cuenta, lo reintenta con la sesión de la siguiente cuenta que entre en ese teléfono.
export async function borrarDispositivo(token: string) {
  await q('DELETE FROM push_devices WHERE token = $1', [token]);
}

export async function borrarDispositivosDe(userId: string) {
  await q('DELETE FROM push_devices WHERE user_id = $1', [userId]);
}

export async function dispositivosDe(userId: string): Promise<{ canal: Canal; token: string }[]> {
  return q<{ canal: Canal; token: string }>('SELECT canal, token FROM push_devices WHERE user_id = $1 ORDER BY created_at', [userId]);
}
