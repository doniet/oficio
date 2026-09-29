import { Router } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { z } from 'zod';
import { q, qOne, tx } from '../db/acceso.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { GRUPOS, prefsDe, type Grupo } from '../lib/avisos.js';
import { hashCodigo } from '../lib/telegram-comun.js';

// Vinculación con Telegram y preferencias de avisos. La API no habla con Telegram: el código de un
// solo uso lo canjea oficio_notifier cuando el usuario pulsa «Iniciar» en el bot.
const router = Router();
router.use(authMiddleware);

export const CODIGO_MINUTOS = 10;

const leer = async (k: string) => (await qOne<{ value: string }>('SELECT value FROM telegram_state WHERE key = $1', [k]))?.value;

/** El bot está disponible si oficio_notifier dejó su usuario y dio señales de vida hace poco. */
export async function estadoBot() {
  const usuario = await leer('bot_username');
  const latido = await leer('heartbeat');
  const vivo = Boolean(latido && Date.now() - Date.parse(latido) < 5 * 60_000);
  return { usuario: usuario ?? null, disponible: Boolean(usuario && vivo) };
}

async function estadoDe(req: AuthRequest) {
  const u = (await qOne<{ telegram_chat_id: string | null; telegram_linked_at: string | null; notify_prefs: unknown }>(
    'SELECT telegram_chat_id, telegram_linked_at, notify_prefs FROM users WHERE id = $1', [req.user!.id],
  ))!;
  const bot = await estadoBot();
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
  res.json(await estadoDe(req));
}));

router.post('/link', asyncHandler(async (req: AuthRequest, res) => {
  const bot = await estadoBot();
  if (!bot.disponible) throw new AppError('Los avisos por Telegram aún no están disponibles.', 503);
  const codigo = randomBytes(24).toString('base64url'); // cabe en el límite de 64 caracteres de /start
  const expira = new Date(Date.now() + CODIGO_MINUTOS * 60_000).toISOString();
  await tx(async (c) => {
    await c.q('DELETE FROM telegram_link_tokens WHERE user_id = $1 OR expires_at < $2', [req.user!.id, new Date().toISOString()]);
    await c.q('INSERT INTO telegram_link_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashCodigo(codigo), req.user!.id, expira]);
  });
  res.json({ url: `https://t.me/${bot.usuario}?start=${codigo}`, expires_at: expira });
}));

router.delete('/link', asyncHandler(async (req: AuthRequest, res) => {
  await tx(async (c) => {
    await c.q('UPDATE users SET telegram_chat_id = NULL, telegram_linked_at = NULL WHERE id = $1', [req.user!.id]);
    await c.q("UPDATE notifications SET status = 'skipped' WHERE user_id = $1 AND status = 'pending'", [req.user!.id]);
  });
  res.json(await estadoDe(req));
}));

router.put('/prefs', asyncHandler(async (req: AuthRequest, res) => {
  const ids = GRUPOS.map((g) => g.id) as [Grupo, ...Grupo[]];
  const cambios = z.record(z.enum(ids), z.boolean()).parse(req.body);
  const actuales = prefsDe((await qOne<{ notify_prefs: unknown }>('SELECT notify_prefs FROM users WHERE id = $1', [req.user!.id]))!.notify_prefs);
  const nuevas = { ...actuales, ...cambios };
  // Solo se guardan los apagados: un grupo nuevo nace encendido para todos.
  const apagados = Object.fromEntries(Object.entries(nuevas).filter(([, v]) => !v).map(([k]) => [k, false]));
  await q('UPDATE users SET notify_prefs = $1 WHERE id = $2', [Object.keys(apagados).length ? JSON.stringify(apagados) : null, req.user!.id]);
  res.json(await estadoDe(req));
}));

router.post('/test', asyncHandler(async (req: AuthRequest, res) => {
  const u = (await qOne<{ telegram_chat_id: string | null }>('SELECT telegram_chat_id FROM users WHERE id = $1', [req.user!.id]))!;
  if (!u.telegram_chat_id) throw new AppError('Primero conecta tu Telegram', 400);
  // El aviso de prueba no depende de las preferencias; como mucho uno por minuto.
  const minuto = Math.floor(Date.now() / 60_000);
  const insertados = await q(`INSERT INTO notifications (id, user_id, kind, text, dedupe_key, send_after, created_at)
    VALUES ($1, $2, 'prueba', $3, $4, $5, $6) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [randomUUID(), req.user!.id, '🔔 Aviso de prueba de Encuentrauno. Si lo ves, todo funciona.', `prueba:${req.user!.id}:${minuto}`, new Date().toISOString(), new Date().toISOString()]);
  if (insertados.length === 0) throw new AppError('Ya enviamos una prueba hace un momento', 429);
  res.status(202).json({ ok: true });
}));

export default router;
