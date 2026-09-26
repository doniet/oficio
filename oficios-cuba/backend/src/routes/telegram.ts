import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { GRUPOS, prefsDe, type Grupo } from '../lib/avisos.js';
import { hashCodigo } from '../lib/telegram-comun.js';

// Vinculación con Telegram y preferencias de avisos. La API no habla con Telegram: el código de un
// solo uso lo canjea oficio_notifier cuando el usuario pulsa «Iniciar» en el bot.
const router = Router();
router.use(authMiddleware);

export const CODIGO_MINUTOS = 10;

/** El bot está disponible si oficio_notifier dejó su usuario y dio señales de vida hace poco. */
export function estadoBot() {
  const leer = (k: string) => (db.prepare('SELECT value FROM telegram_state WHERE key = ?').get(k) as { value: string } | undefined)?.value;
  const usuario = leer('bot_username');
  const latido = leer('heartbeat');
  const vivo = Boolean(latido && Date.now() - Date.parse(latido) < 5 * 60_000);
  return { usuario: usuario ?? null, disponible: Boolean(usuario && vivo) };
}

function estadoDe(req: AuthRequest) {
  const u = db.prepare('SELECT telegram_chat_id, telegram_linked_at, notify_prefs FROM users WHERE id = ?').get(req.user!.id) as
    { telegram_chat_id: string | null; telegram_linked_at: string | null; notify_prefs: string | null };
  const bot = estadoBot();
  return {
    available: bot.disponible,
    bot_username: bot.usuario,
    linked: Boolean(u.telegram_chat_id),
    linked_at: u.telegram_linked_at,
    prefs: prefsDe(u.notify_prefs),
    groups: GRUPOS.filter((g) => g.para.includes(req.user!.user_type)).map(({ id, label, description }) => ({ id, label, description })),
  };
}

router.get('/status', asyncHandler(async (req: AuthRequest, res) => {
  res.json(estadoDe(req));
}));

router.post('/link', asyncHandler(async (req: AuthRequest, res) => {
  const bot = estadoBot();
  if (!bot.disponible) throw new AppError('Los avisos por Telegram aún no están disponibles.', 503);
  const codigo = randomBytes(24).toString('base64url'); // cabe en el límite de 64 caracteres de /start
  const expira = new Date(Date.now() + CODIGO_MINUTOS * 60_000).toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM telegram_link_tokens WHERE user_id = ? OR expires_at < ?').run(req.user!.id, new Date().toISOString());
    db.prepare('INSERT INTO telegram_link_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashCodigo(codigo), req.user!.id, expira);
  })();
  res.json({ url: `https://t.me/${bot.usuario}?start=${codigo}`, expires_at: expira });
}));

router.delete('/link', asyncHandler(async (req: AuthRequest, res) => {
  db.transaction(() => {
    db.prepare('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE id = ?').run(req.user!.id);
    db.prepare("UPDATE notifications SET status = 'skipped' WHERE user_id = ? AND status = 'pending'").run(req.user!.id);
  })();
  res.json(estadoDe(req));
}));

router.put('/prefs', asyncHandler(async (req: AuthRequest, res) => {
  const ids = GRUPOS.map((g) => g.id) as [Grupo, ...Grupo[]];
  const cambios = z.record(z.enum(ids), z.boolean()).parse(req.body);
  const actuales = prefsDe((db.prepare('SELECT notify_prefs FROM users WHERE id = ?').get(req.user!.id) as { notify_prefs: string | null }).notify_prefs);
  const nuevas = { ...actuales, ...cambios };
  // Solo se guardan los apagados: un grupo nuevo nace encendido para todos.
  const apagados = Object.fromEntries(Object.entries(nuevas).filter(([, v]) => !v).map(([k]) => [k, false]));
  db.prepare('UPDATE users SET notify_prefs = ? WHERE id = ?').run(Object.keys(apagados).length ? JSON.stringify(apagados) : null, req.user!.id);
  res.json(estadoDe(req));
}));

router.post('/test', asyncHandler(async (req: AuthRequest, res) => {
  const u = db.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(req.user!.id) as { telegram_chat_id: string | null };
  if (!u.telegram_chat_id) throw new AppError('Primero conecta tu Telegram', 400);
  // El aviso de prueba no depende de las preferencias; como mucho uno por minuto.
  const minuto = Math.floor(Date.now() / 60_000);
  const ok = db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, kind, text, dedupe_key, send_after, created_at)
    VALUES (lower(hex(randomblob(16))), ?, 'prueba', ?, ?, ?, ?)`)
    .run(req.user!.id, '🔔 Aviso de prueba de Oficios Cuba. Si lo ves, todo funciona.', `prueba:${req.user!.id}:${minuto}`, new Date().toISOString(), new Date().toISOString()).changes > 0;
  if (!ok) throw new AppError('Ya enviamos una prueba hace un momento', 429);
  res.status(202).json({ ok: true });
}));

export default router;
