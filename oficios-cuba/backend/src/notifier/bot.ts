import db from './db.js';
import { hashCodigo, SITIO } from '../lib/telegram-comun.js';

// oficio_notifier: el único proceso con el token del bot y con salida a internet (solo hacia
// Telegram). Recibe los «Iniciar» por long polling (getUpdates), así que no abre nada hacia
// dentro, y envía los avisos que la API dejó en `notifications`.

export class TelegramError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}

export type Llamar = (metodo: string, datos: Record<string, unknown>) => Promise<any>;

/** Cliente mínimo de la Bot API. El token nunca aparece en errores ni en logs. */
export function clienteTelegram(token: string, base = 'https://api.telegram.org'): Llamar {
  return async (metodo, datos) => {
    let res: Response;
    try {
      res = await fetch(`${base}/bot${token}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
        signal: AbortSignal.timeout(metodo === 'getUpdates' ? 40_000 : 15_000),
      });
    } catch (err) {
      throw new TelegramError(0, `red: ${(err as Error).name}`);
    }
    const json = await res.json().catch(() => ({})) as { ok?: boolean; result?: unknown; description?: string; parameters?: { retry_after?: number } };
    if (!json.ok) throw new TelegramError(res.status, (json.description ?? `HTTP ${res.status}`).replaceAll(token, '***'), json.parameters?.retry_after);
    return json.result;
  };
}

const estado = {
  leer: (k: string) => (db.prepare('SELECT value FROM telegram_state WHERE key = ?').get(k) as { value: string } | undefined)?.value,
  poner: (k: string, v: string) => db.prepare('INSERT INTO telegram_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v),
};

export const latido = () => estado.poner('heartbeat', new Date().toISOString());

export async function presentarse(llamar: Llamar) {
  const yo = await llamar('getMe', {});
  estado.poner('bot_username', yo.username);
  latido();
  return yo.username as string;
}

const AYUDA = `Hola 👋 Soy el bot de avisos de Oficios Cuba.\n\nPara recibir avisos de tus citas y mensajes, entra en ${SITIO}/dashboard/cuenta y pulsa «Conectar Telegram».\n\nPara dejar de recibirlos, escribe /stop.`;

/** Procesa un mensaje recibido. Devuelve el texto de respuesta (o null si no hay que contestar). */
export function atenderMensaje(msg: { chat?: { id: number | string; type?: string }; text?: string }): string | null {
  if (!msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return null;
  const chat = String(msg.chat.id);
  const texto = msg.text.trim();

  const inicio = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(texto);
  if (inicio) {
    const codigo = inicio[1];
    if (!codigo) return AYUDA;
    const ahora = new Date().toISOString();
    const fila = db.prepare('SELECT user_id FROM telegram_link_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
      .get(hashCodigo(codigo), ahora) as { user_id: string } | undefined;
    if (!fila) return `Ese enlace ya se usó o caducó (dura 10 minutos). Genera otro en ${SITIO}/dashboard/cuenta.`;
    const nombre = db.transaction(() => {
      // Un chat de Telegram avisa a una sola cuenta: si ya estaba con otra, pasa a esta.
      db.prepare('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE telegram_chat_id = ? AND id != ?').run(chat, fila.user_id);
      db.prepare('UPDATE users SET telegram_chat_id = ?, telegram_linked_at = ? WHERE id = ?').run(chat, ahora, fila.user_id);
      db.prepare('UPDATE telegram_link_tokens SET used_at = ? WHERE token_hash = ?').run(ahora, hashCodigo(codigo));
      return (db.prepare('SELECT full_name FROM users WHERE id = ?').get(fila.user_id) as { full_name: string }).full_name;
    })();
    return `✅ Listo, ${nombre.split(' ')[0]}. Te avisaré aquí de tus citas y mensajes.\n\nEliges qué avisos recibir en ${SITIO}/dashboard/cuenta. Para dejar de recibirlos, escribe /stop.`;
  }
  if (/^\/stop(?:@\w+)?$/.test(texto)) {
    const r = db.prepare('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE telegram_chat_id = ?').run(chat);
    return r.changes ? 'Listo, ya no te enviaré avisos. Puedes volver a conectarte desde tu cuenta cuando quieras.' : 'Este chat no estaba conectado a ninguna cuenta.';
  }
  return AYUDA;
}

/** Una vuelta de long polling: recoge mensajes nuevos y contesta. */
export async function recibir(llamar: Llamar, espera = 25) {
  const offset = Number(estado.leer('update_offset') ?? 0);
  const updates = await llamar('getUpdates', { offset, timeout: espera, allowed_updates: ['message'] }) as { update_id: number; message?: any }[];
  for (const u of updates) {
    // Se avanza el offset antes de contestar: un mensaje que falla no se reprocesa en bucle.
    estado.poner('update_offset', String(u.update_id + 1));
    const respuesta = u.message ? atenderMensaje(u.message) : null;
    if (respuesta) await llamar('sendMessage', { chat_id: u.message.chat.id, text: respuesta, link_preview_options: { is_disabled: true } }).catch(() => {});
  }
  latido();
  return updates.length;
}

const MAX_INTENTOS = 5;
const CADUCA_MS = 24 * 3_600_000;

/** Envía los avisos pendientes. Devuelve cuántos se enviaron. */
export async function enviarPendientes(llamar: Llamar, lote = 20) {
  const ahora = Date.now();
  // Un aviso de hace más de un día ya no sirve (un recordatorio de una cita pasada confunde).
  db.prepare("UPDATE notifications SET status = 'skipped', last_error = 'caducado' WHERE status = 'pending' AND created_at < ?")
    .run(new Date(ahora - CADUCA_MS).toISOString());
  const pendientes = db.prepare(`SELECT n.id, n.user_id, n.text, n.url, n.attempts, u.telegram_chat_id AS chat
    FROM notifications n JOIN users u ON n.user_id = u.id
    WHERE n.status = 'pending' AND n.send_after <= ? ORDER BY n.created_at LIMIT ?`)
    .all(new Date(ahora).toISOString(), lote) as { id: string; user_id: string; text: string; url: string | null; attempts: number; chat: string | null }[];

  let enviados = 0;
  for (const n of pendientes) {
    if (!n.chat) {
      db.prepare("UPDATE notifications SET status = 'skipped', last_error = 'sin telegram' WHERE id = ?").run(n.id);
      continue;
    }
    try {
      await llamar('sendMessage', {
        chat_id: n.chat,
        text: n.text,
        link_preview_options: { is_disabled: true },
        // Telegram solo acepta botones con URL pública https.
        ...(n.url?.startsWith('https://') && { reply_markup: { inline_keyboard: [[{ text: 'Abrir en Oficios Cuba', url: n.url }]] } }),
      });
      db.prepare("UPDATE notifications SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?").run(new Date().toISOString(), n.id);
      enviados++;
    } catch (err) {
      const e = err as TelegramError;
      if (e.status === 403) {
        // El usuario bloqueó el bot o borró el chat: se desvincula para no insistir.
        db.prepare('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE id = ? AND telegram_chat_id = ?').run(n.user_id, n.chat);
        db.prepare("UPDATE notifications SET status = 'failed', last_error = ? WHERE id = ?").run(e.message.slice(0, 200), n.id);
      } else if (e.status === 429) {
        const espera = (e.retryAfter ?? 30) * 1000;
        db.prepare('UPDATE notifications SET send_after = ?, last_error = ? WHERE id = ?').run(new Date(Date.now() + espera).toISOString(), '429', n.id);
        break;
      } else {
        const intentos = n.attempts + 1;
        const fallo = intentos >= MAX_INTENTOS || e.status === 400;
        db.prepare('UPDATE notifications SET attempts = ?, status = ?, send_after = ?, last_error = ? WHERE id = ?')
          .run(intentos, fallo ? 'failed' : 'pending', new Date(Date.now() + 2 ** intentos * 60_000).toISOString(), e.message.slice(0, 200), n.id);
      }
    }
  }
  latido();
  return enviados;
}
