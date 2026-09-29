import { q, qOne, tx } from './db.js';
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

export const estado = {
  leer: async (k: string) => (await qOne<{ value: string }>('SELECT value FROM telegram_state WHERE key = $1', [k]))?.value,
  poner: async (k: string, v: string) => { await q('INSERT INTO telegram_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, v]); },
  quitar: async (k: string) => { await q('DELETE FROM telegram_state WHERE key = $1', [k]); },
};

export const latido = () => estado.poner('heartbeat', new Date().toISOString());

export async function presentarse(llamar: Llamar) {
  const yo = await llamar('getMe', {});
  await estado.poner('bot_username', yo.username);
  await estado.poner('bot_id', String(yo.id));
  await latido();
  return yo.username as string;
}

const AYUDA = `Hola 👋 Soy el bot de avisos de Encuentrauno.\n\nPara recibir avisos de tus citas y mensajes, entra en ${SITIO}/dashboard/cuenta y pulsa «Conectar Telegram».\n\nPara dejar de recibirlos, escribe /stop.`;

/** Procesa un mensaje recibido. Devuelve el texto de respuesta (o null si no hay que contestar). */
export async function atenderMensaje(msg: { chat?: { id: number | string; type?: string }; text?: string }): Promise<string | null> {
  if (!msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return null;
  const chat = String(msg.chat.id);
  const texto = msg.text.trim();

  const inicio = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(texto);
  if (inicio) {
    const codigo = inicio[1];
    if (!codigo) return AYUDA;
    const ahora = new Date().toISOString();
    const fila = await qOne<{ user_id: string }>(
      'SELECT user_id FROM telegram_link_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2',
      [hashCodigo(codigo), ahora],
    );
    if (!fila) return `Ese enlace ya se usó o caducó (dura 10 minutos). Genera otro en ${SITIO}/dashboard/cuenta.`;
    const nombre = await tx(async (c) => {
      // Un chat de Telegram avisa a una sola cuenta: si ya estaba con otra, pasa a esta.
      await c.q('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE telegram_chat_id = $1 AND id != $2', [chat, fila.user_id]);
      await c.q('UPDATE users SET telegram_chat_id = $1, telegram_linked_at = $2 WHERE id = $3', [chat, ahora, fila.user_id]);
      await c.q('UPDATE telegram_link_tokens SET used_at = $1 WHERE token_hash = $2', [ahora, hashCodigo(codigo)]);
      return (await c.qOne<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [fila.user_id]))!.full_name;
    });
    return `✅ Listo, ${nombre.split(' ')[0]}. Te avisaré aquí de tus citas y mensajes.\n\nEliges qué avisos recibir en ${SITIO}/dashboard/cuenta. Para dejar de recibirlos, escribe /stop.`;
  }
  if (/^\/stop(?:@\w+)?$/.test(texto)) {
    const r = await q('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE telegram_chat_id = $1 RETURNING id', [chat]);
    return r.length ? 'Listo, ya no te enviaré avisos. Puedes volver a conectarte desde tu cuenta cuando quieras.' : 'Este chat no estaba conectado a ninguna cuenta.';
  }
  return AYUDA;
}

/** Una vuelta de long polling: recoge mensajes nuevos y contesta. */
export async function recibir(llamar: Llamar, espera = 25) {
  const offset = Number((await estado.leer('update_offset')) ?? 0);
  const updates = await llamar('getUpdates', { offset, timeout: espera, allowed_updates: ['message'] }) as { update_id: number; message?: any }[];
  for (const u of updates) {
    // Se avanza el offset antes de contestar: un mensaje que falla no se reprocesa en bucle.
    await estado.poner('update_offset', String(u.update_id + 1));
    const respuesta = u.message ? await atenderMensaje(u.message) : null;
    if (respuesta) await llamar('sendMessage', { chat_id: u.message.chat.id, text: respuesta, link_preview_options: { is_disabled: true } }).catch(() => {});
  }
  await latido();
  return updates.length;
}

const MAX_INTENTOS = 5;
const CADUCA_MS = 24 * 3_600_000;

/** Envía los avisos pendientes. Devuelve cuántos se enviaron. */
export async function enviarPendientes(llamar: Llamar, lote = 20) {
  const ahora = Date.now();
  // Un aviso de hace más de un día ya no sirve (un recordatorio de una cita pasada confunde).
  await q("UPDATE notifications SET status = 'skipped', last_error = 'caducado' WHERE status = 'pending' AND created_at < $1",
    [new Date(ahora - CADUCA_MS).toISOString()]);
  const pendientes = await q<{ id: string; user_id: string; text: string; url: string | null; attempts: number; chat: string | null }>(`
    SELECT n.id, n.user_id, n.text, n.url, n.attempts, u.telegram_chat_id AS chat
    FROM notifications n JOIN users u ON n.user_id = u.id
    WHERE n.status = 'pending' AND n.send_after <= $1 ORDER BY n.created_at LIMIT $2`,
    [new Date(ahora).toISOString(), lote]);

  let enviados = 0;
  for (const n of pendientes) {
    if (!n.chat) {
      await q("UPDATE notifications SET status = 'skipped', last_error = 'sin telegram' WHERE id = $1", [n.id]);
      continue;
    }
    try {
      await llamar('sendMessage', {
        chat_id: n.chat,
        text: n.text,
        link_preview_options: { is_disabled: true },
        // Telegram solo acepta botones con URL pública https.
        ...(n.url?.startsWith('https://') && { reply_markup: { inline_keyboard: [[{ text: 'Abrir en Encuentrauno', url: n.url }]] } }),
      });
      await q("UPDATE notifications SET status = 'sent', sent_at = $1, attempts = attempts + 1 WHERE id = $2", [new Date().toISOString(), n.id]);
      enviados++;
    } catch (err) {
      const e = err as TelegramError;
      if (e.status === 403) {
        // El usuario bloqueó el bot o borró el chat: se desvincula para no insistir.
        await q('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE id = $1 AND telegram_chat_id = $2', [n.user_id, n.chat]);
        await q("UPDATE notifications SET status = 'failed', last_error = $1 WHERE id = $2", [e.message.slice(0, 200), n.id]);
      } else if (e.status === 429) {
        const espera = (e.retryAfter ?? 30) * 1000;
        await q('UPDATE notifications SET send_after = $1, last_error = $2 WHERE id = $3', [new Date(Date.now() + espera).toISOString(), '429', n.id]);
        break;
      } else {
        const intentos = n.attempts + 1;
        const fallo = intentos >= MAX_INTENTOS || e.status === 400;
        await q('UPDATE notifications SET attempts = $1, status = $2, send_after = $3, last_error = $4 WHERE id = $5',
          [intentos, fallo ? 'failed' : 'pending', new Date(Date.now() + 2 ** intentos * 60_000).toISOString(), e.message.slice(0, 200), n.id]);
      }
    }
  }
  await latido();
  return enviados;
}
