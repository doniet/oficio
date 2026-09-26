import db from './db.js';
import type { CanalPush } from '../push/canal.js';

// Envío de los avisos push que la API dejó en push_outbox. Corre en oficio_notifier, el único
// contenedor con salida a internet; la cuenta de servicio de Firebase solo la monta él.

export type CanalesPush = Partial<Record<'fcm', CanalPush>>;

const MAX_INTENTOS = 5;
// Un aviso de chat de hace más de un día ya no sirve: el usuario habrá abierto la app.
const CADUCA_MS = 24 * 3_600_000;
const GUARDAR_MS = 7 * 24 * 3_600_000;

/** Envía los avisos push pendientes. Devuelve cuántos se enviaron. */
export async function enviarPushPendientes(canales: CanalesPush, lote = 20) {
  const ahora = Date.now();
  db.prepare("UPDATE push_outbox SET status = 'skipped', last_error = 'caducado' WHERE status = 'pending' AND created_at < ?")
    .run(new Date(ahora - CADUCA_MS).toISOString());
  db.prepare("DELETE FROM push_outbox WHERE status != 'pending' AND created_at < ?").run(new Date(ahora - GUARDAR_MS).toISOString());

  const pendientes = db.prepare(`SELECT o.id, o.user_id, o.titulo, o.cuerpo, o.datos, o.attempts,
      d.id AS device_id, d.canal, d.token, d.user_id AS dueno
    FROM push_outbox o JOIN push_devices d ON o.device_id = d.id
    WHERE o.status = 'pending' AND o.send_after <= ? ORDER BY o.created_at LIMIT ?`)
    .all(new Date(ahora).toISOString(), lote) as {
      id: string; user_id: string; titulo: string; cuerpo: string; datos: string; attempts: number;
      device_id: string; canal: 'fcm'; token: string; dueno: string;
    }[];

  let enviados = 0;
  for (const p of pendientes) {
    if (p.dueno !== p.user_id) {
      db.prepare("UPDATE push_outbox SET status = 'skipped', last_error = 'el dispositivo cambió de cuenta' WHERE id = ?").run(p.id);
      continue;
    }
    const canal = canales[p.canal];
    if (!canal) continue;
    let resultado: string;
    try {
      resultado = await canal.enviar(p.token, { titulo: p.titulo, cuerpo: p.cuerpo, datos: JSON.parse(p.datos) });
    } catch (err) {
      resultado = (err as Error).message || 'excepción';
    }
    if (resultado === 'ok') {
      db.prepare("UPDATE push_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?").run(new Date().toISOString(), p.id);
      enviados++;
    } else if (resultado === 'token_invalido') {
      // La app se desinstaló o el token caducó: fuera el dispositivo (y, en cascada, sus avisos).
      db.prepare('DELETE FROM push_devices WHERE id = ?').run(p.device_id);
    } else {
      const intentos = p.attempts + 1;
      db.prepare('UPDATE push_outbox SET attempts = ?, status = ?, send_after = ?, last_error = ? WHERE id = ?')
        .run(intentos, intentos >= MAX_INTENTOS ? 'failed' : 'pending', new Date(Date.now() + 2 ** intentos * 60_000).toISOString(),
          resultado.slice(0, 200), p.id);
    }
  }
  return enviados;
}
