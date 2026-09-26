import { Router, type NextFunction, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { readdirSync, statfsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { z } from 'zod';
import db, { dbPath as DB_PATH, ESQUEMA_VERSION } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { DEMO_MODE, JWT_SECRET } from '../config.js';
import { nuevoSecreto, uriOtpauth, verificar } from '../lib/totp.js';
import { cifrarToken, FORMATO_TOKEN } from '../lib/telegram-comun.js';
import { UPLOAD_DIR } from './uploads.js';

// Apartado técnico. Tres capas: sesión normal + ser admin (solo se da desde el servidor) + 2FA TOTP,
// que abre una sesión de administración de 30 min (cabecera X-Admin-Token). Las acciones sensibles
// piden además un código nuevo. A quien no es admin se le responde 404: el panel no se anuncia.
const router = Router();
const SESION_MIN = 30;

interface Admin { id: string; email: string; totp_secret: string | null; totp_enabled_at: string | null; totp_last_step: number | null; password_changed_at: string | null }

function adminDe(req: AuthRequest) {
  return db.prepare('SELECT id, email, totp_secret, totp_enabled_at, totp_last_step, password_changed_at FROM users WHERE id = ? AND is_admin = 1')
    .get(req.user!.id) as Admin | undefined;
}

function soloAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!adminDe(req)) return next(new AppError('Ruta no encontrada', 404));
  next();
}

export function auditar(req: AuthRequest, accion: string, detalle?: string) {
  db.prepare('INSERT INTO admin_audit (id, user_id, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), req.user?.id ?? null, accion, detalle ?? null, String(req.headers['cf-connecting-ip'] ?? req.ip ?? ''), new Date().toISOString());
}

// 5 códigos fallidos por admin cada 15 min.
const limite2fa = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => `2fa:${(req as AuthRequest).user?.id}`, validate: false,
  message: { error: 'Demasiados códigos incorrectos. Espera 15 minutos.' },
});

/** Comprueba un código TOTP y lo consume (no vale dos veces). */
function consumirCodigo(req: AuthRequest, admin: Admin, codigo: string) {
  const paso = admin.totp_secret ? verificar(admin.totp_secret, codigo, admin.totp_last_step) : null;
  if (paso === null) {
    auditar(req, '2fa_fallido');
    throw new AppError('Código incorrecto o ya usado', 401);
  }
  db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(paso, admin.id);
}

function abrirSesion(admin: Admin) {
  const token = jwt.sign({ id: admin.id, scope: 'admin' }, JWT_SECRET, { expiresIn: `${SESION_MIN}m` });
  return { admin_token: token, expires_at: new Date(Date.now() + SESION_MIN * 60_000).toISOString() };
}

function sesionAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  const admin = adminDe(req)!;
  const token = req.headers['x-admin-token'];
  try {
    if (typeof token !== 'string' || !admin.totp_enabled_at) throw new Error();
    const p = jwt.verify(token, JWT_SECRET) as { id: string; scope: string; iat: number };
    // Cambiar la contraseña o reactivar el 2FA invalida las sesiones de administración abiertas.
    const desde = Math.max(Date.parse(admin.totp_enabled_at), admin.password_changed_at ? Date.parse(admin.password_changed_at) : 0);
    if (p.scope !== 'admin' || p.id !== admin.id || p.iat * 1000 < desde - 1000) throw new Error();
  } catch {
    return next(new AppError('Confirma tu código de verificación para entrar al panel', 401, 'admin_2fa'));
  }
  next();
}

router.use(authMiddleware, soloAdmin);

router.get('/me', asyncHandler(async (req: AuthRequest, res) => {
  const a = adminDe(req)!;
  res.json({ totp_enabled: Boolean(a.totp_enabled_at) });
}));

// Alta del 2FA: una sola vez (para rehacerlo: npm run admin -- reset-2fa <email>, en el servidor).
router.post('/2fa/setup', asyncHandler(async (req: AuthRequest, res) => {
  const a = adminDe(req)!;
  if (a.totp_enabled_at) throw new AppError('El 2FA ya está activo', 409);
  const secreto = nuevoSecreto();
  db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?').run(secreto, a.id);
  res.json({ secret: secreto, uri: uriOtpauth(secreto, a.email) });
}));

router.post('/2fa/enable', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const a = adminDe(req)!;
  if (a.totp_enabled_at) throw new AppError('El 2FA ya está activo', 409);
  if (!a.totp_secret) throw new AppError('Primero genera el código QR', 400);
  consumirCodigo(req, a, code);
  const ahora = new Date(Date.now() - 1000).toISOString();
  db.prepare('UPDATE users SET totp_enabled_at = ? WHERE id = ?').run(ahora, a.id);
  auditar(req, '2fa_activado');
  res.json(abrirSesion({ ...a, totp_enabled_at: ahora }));
}));

router.post('/2fa/verify', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const a = adminDe(req)!;
  if (!a.totp_enabled_at) throw new AppError('Activa primero el 2FA', 400);
  consumirCodigo(req, a, code);
  auditar(req, 'entrada_panel');
  res.json(abrirSesion(a));
}));

router.use(sesionAdmin);

// ── Sistema ─────────────────────────────────────────────────────────────────────────────────────

function tamano(ruta: string) {
  try { return statSync(ruta).size; } catch { return 0; }
}

router.get('/system', asyncHandler(async (_req: AuthRequest, res) => {
  let fotos = 0, bytesFotos = 0;
  for (const f of readdirSync(UPLOAD_DIR)) { fotos++; bytesFotos += tamano(join(UPLOAD_DIR, f)); }
  const disco = statfsSync(dirname(DB_PATH));
  const contar = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  res.json({
    schema_version: (db.pragma('user_version') as { user_version: number }[])[0].user_version, schema_expected: ESQUEMA_VERSION,
    demo_mode: DEMO_MODE,
    node: process.version,
    uptime_s: Math.round(process.uptime()),
    db_bytes: tamano(DB_PATH) + tamano(`${DB_PATH}-wal`),
    uploads: { files: fotos, bytes: bytesFotos },
    disk: { free_bytes: disco.bavail * disco.bsize, total_bytes: disco.blocks * disco.bsize },
    counts: {
      users: contar('SELECT COUNT(*) AS n FROM users'),
      clients: contar("SELECT COUNT(*) AS n FROM users WHERE user_type = 'client'"),
      providers_free: contar("SELECT COUNT(*) AS n FROM provider_profiles WHERE subscription_plan = 'free'"),
      providers_basic: contar("SELECT COUNT(*) AS n FROM provider_profiles WHERE subscription_plan = 'basic'"),
      providers_pro: contar("SELECT COUNT(*) AS n FROM provider_profiles WHERE subscription_plan IN ('pro', 'premium')"),
      services: contar('SELECT COUNT(*) AS n FROM services'),
      catalog_items: contar('SELECT COUNT(*) AS n FROM catalog_items'),
      appointments_upcoming: contar(`SELECT COUNT(*) AS n FROM appointments WHERE status IN ('pending', 'confirmed') AND starts_at > '${new Date().toISOString()}'`),
      pending_payments: contar("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'pending'"),
    },
    app_downloads: {
      total: contar('SELECT COUNT(*) AS n FROM apk_descargas'),
      last7d: contar(`SELECT COUNT(*) AS n FROM apk_descargas WHERE created_at > '${new Date(Date.now() - 7 * 86_400_000).toISOString()}'`),
      by_version: db.prepare('SELECT version, COUNT(*) AS n FROM apk_descargas GROUP BY version ORDER BY MAX(created_at) DESC').all() as { version: string; n: number }[],
    },
  });
}));

// ── Telegram ────────────────────────────────────────────────────────────────────────────────────

const leer = (k: string) => (db.prepare('SELECT value FROM telegram_state WHERE key = ?').get(k) as { value: string } | undefined)?.value ?? null;
const poner = (k: string, v: string) => db.prepare('INSERT INTO telegram_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
const quitar = (...ks: string[]) => ks.forEach((k) => db.prepare('DELETE FROM telegram_state WHERE key = ?').run(k));

router.get('/telegram', asyncHandler(async (_req: AuthRequest, res) => {
  const clave = leer('notifier_pubkey');
  const latido = leer('heartbeat');
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  res.json({
    token: { configured: Boolean(leer('token_cipher')), hint: leer('token_hint'), updated_at: leer('token_updated_at'), error: leer('token_error') },
    notifier: {
      key_fingerprint: clave ? createHash('sha256').update(clave).digest('hex').slice(0, 16) : null,
      heartbeat: latido,
      alive: Boolean(latido && Date.now() - Date.parse(latido) < 2 * 60_000),
      bot_username: leer('bot_username'),
    },
    linked_users: (db.prepare('SELECT COUNT(*) AS n FROM users WHERE telegram_chat_id IS NOT NULL').get() as { n: number }).n,
    last7d: Object.fromEntries((db.prepare('SELECT status, COUNT(*) AS n FROM notifications WHERE created_at > ? GROUP BY status').all(hace7) as { status: string; n: number }[]).map((r) => [r.status, r.n])),
    recent_errors: db.prepare(`SELECT kind, status, last_error, attempts, created_at FROM notifications
      WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 10`).all(),
  });
}));

const codigoSchema = z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/, 'Escribe el código de 6 cifras de tu app');

router.put('/telegram/token', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { token, code } = z.object({ token: z.string().trim().regex(FORMATO_TOKEN, 'Eso no parece un token de @BotFather (número:letras)'), code: codigoSchema }).parse(req.body);
  consumirCodigo(req, adminDe(req)!, code);
  const clave = leer('notifier_pubkey');
  if (!clave) throw new AppError('El notificador aún no ha arrancado nunca: no hay con qué cifrar el token.', 409);
  const version = String(Number(leer('token_version') ?? 0) + 1);
  db.transaction(() => {
    poner('token_cipher', cifrarToken(clave, token));
    poner('token_hint', token.slice(-4));
    poner('token_updated_at', new Date().toISOString());
    poner('token_version', version);
    quitar('token_error');
  })();
  auditar(req, 'telegram_token_cambiado', `…${token.slice(-4)}`);
  res.json({ ok: true, hint: token.slice(-4) });
}));

router.delete('/telegram/token', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { code } = z.object({ code: codigoSchema }).parse(req.body);
  consumirCodigo(req, adminDe(req)!, code);
  db.transaction(() => {
    quitar('token_cipher', 'token_hint', 'token_error');
    poner('token_updated_at', new Date().toISOString());
    poner('token_version', String(Number(leer('token_version') ?? 0) + 1));
  })();
  auditar(req, 'telegram_token_borrado');
  res.json({ ok: true });
}));

// ── Registro ────────────────────────────────────────────────────────────────────────────────────

router.get('/audit', asyncHandler(async (_req: AuthRequest, res) => {
  res.json({
    entries: db.prepare(`SELECT a.action, a.detail, a.ip, a.created_at, u.email FROM admin_audit a LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC LIMIT 100`).all(),
  });
}));

export default router;
