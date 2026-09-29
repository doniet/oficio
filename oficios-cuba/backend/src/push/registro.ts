import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
// Todo este archivo es de la Tarea 13 (src/push/*). borrarDispositivosDe() es la única excepción:
// routes/auth.ts (Tarea 6) la llama al cambiar la contraseña para cerrar las demás sesiones, así
// que necesita funcionar contra Postgres ya. El resto del archivo se queda tal cual hasta su tarea.
import { q } from '../db/acceso.js';

export type Canal = 'fcm';

export function registrarDispositivo(userId: string, d: { canal: Canal; token: string; plataforma: 'android' | 'ios'; app_version: string }) {
  const ahora = new Date().toISOString();
  // Si el token era de otra cuenta (teléfono prestado, cambio de sesión), pasa a esta.
  db.prepare(`
    INSERT INTO push_devices (id, user_id, canal, token, plataforma, app_version, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (canal, token) DO UPDATE SET user_id = excluded.user_id, plataforma = excluded.plataforma,
      app_version = excluded.app_version, last_seen_at = excluded.last_seen_at
  `).run(uuidv4(), userId, d.canal, d.token, d.plataforma, d.app_version, ahora, ahora);
}

// Borra por token, sea de quien sea: el token FCM es un secreto que solo conoce el dispositivo
// y borrarlo solo deja de enviarle avisos. Así, si la app no pudo borrarlo al cerrar la sesión
// de una cuenta, lo reintenta con la sesión de la siguiente cuenta que entre en ese teléfono.
export function borrarDispositivo(token: string) {
  db.prepare('DELETE FROM push_devices WHERE token = ?').run(token);
}

export async function borrarDispositivosDe(userId: string) {
  await q('DELETE FROM push_devices WHERE user_id = $1', [userId]);
}

export function dispositivosDe(userId: string): { canal: Canal; token: string }[] {
  return db.prepare('SELECT canal, token FROM push_devices WHERE user_id = ? ORDER BY created_at').all(userId) as { canal: Canal; token: string }[];
}
