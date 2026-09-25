import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';

export type Canal = 'fcm';

// La versión de zod instalada (bloqueada por package-lock.json) infiere `z.infer<>` con todos
// los campos opcionales bajo `moduleResolution: "node"`, aunque el esquema exija required+default.
// Se comparte este tipo entre el schema y `registrarDispositivo` para que ambos lados casen
// estructuralmente; en tiempo de ejecución `.parse()` sigue exigiendo y rellenando los campos.
export const nuevoDispositivoSchema = z.object({
  canal: z.enum(['fcm']),
  token: z.string().trim().min(1).max(4096),
  plataforma: z.enum(['android', 'ios']),
  app_version: z.string().trim().max(20).default(''),
});

export type NuevoDispositivo = z.infer<typeof nuevoDispositivoSchema>;

export function registrarDispositivo(userId: string, d: NuevoDispositivo) {
  const ahora = new Date().toISOString();
  // Si el token era de otra cuenta (teléfono prestado, cambio de sesión), pasa a esta.
  db.prepare(`
    INSERT INTO push_devices (id, user_id, canal, token, plataforma, app_version, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (canal, token) DO UPDATE SET user_id = excluded.user_id, plataforma = excluded.plataforma,
      app_version = excluded.app_version, last_seen_at = excluded.last_seen_at
  `).run(uuidv4(), userId, d.canal, d.token, d.plataforma, d.app_version, ahora, ahora);
}

export function borrarDispositivo(userId: string, token: string) {
  db.prepare('DELETE FROM push_devices WHERE user_id = ? AND token = ?').run(userId, token);
}

export function borrarToken(canal: Canal, token: string) {
  db.prepare('DELETE FROM push_devices WHERE canal = ? AND token = ?').run(canal, token);
}

export function dispositivosDe(userId: string): { canal: Canal; token: string }[] {
  return db.prepare('SELECT canal, token FROM push_devices WHERE user_id = ? ORDER BY created_at').all(userId) as { canal: Canal; token: string }[];
}
