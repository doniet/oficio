import { Router, type NextFunction, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { readdirSync, statfsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { z } from 'zod';
import { q, qOne, tx, type Tx } from '../db/acceso.js';
import { ESQUEMA_VERSION } from '../db/migrar.js';
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

async function adminDe(req: AuthRequest) {
  return qOne<Admin>(
    'SELECT id, email, totp_secret, totp_enabled_at, totp_last_step, password_changed_at FROM users WHERE id = $1 AND is_admin = true',
    [req.user!.id],
  );
}

// asyncHandler no es solo para rutas: este middleware ahora consulta la base, y Express 4 no
// espera promesas de un middleware sin envolverlo.
const soloAdmin = asyncHandler(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!(await adminDe(req))) return next(new AppError('Ruta no encontrada', 404));
  next();
});

export async function auditar(req: AuthRequest, accion: string, detalle?: string) {
  await q(
    'INSERT INTO admin_audit (id, user_id, action, detail, ip, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), req.user?.id ?? null, accion, detalle ?? null, String(req.headers['cf-connecting-ip'] ?? req.ip ?? ''), new Date().toISOString()],
  );
}

// 5 códigos fallidos por admin cada 15 min.
const limite2fa = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => `2fa:${(req as AuthRequest).user?.id}`, validate: false,
  message: { error: 'Demasiados códigos incorrectos. Espera 15 minutos.' },
});

/** Comprueba un código TOTP y lo consume (no vale dos veces). */
async function consumirCodigo(req: AuthRequest, admin: Admin, codigo: string) {
  const paso = admin.totp_secret ? verificar(admin.totp_secret, codigo, admin.totp_last_step) : null;
  if (paso === null) {
    await auditar(req, '2fa_fallido');
    throw new AppError('Código incorrecto o ya usado', 401);
  }
  await q('UPDATE users SET totp_last_step = $1 WHERE id = $2', [paso, admin.id]);
}

function abrirSesion(admin: Admin) {
  const token = jwt.sign({ id: admin.id, scope: 'admin' }, JWT_SECRET, { expiresIn: `${SESION_MIN}m` });
  return { admin_token: token, expires_at: new Date(Date.now() + SESION_MIN * 60_000).toISOString() };
}

const sesionAdmin = asyncHandler(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const admin = (await adminDe(req))!;
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
});

router.use(authMiddleware, soloAdmin);

router.get('/me', asyncHandler(async (req: AuthRequest, res) => {
  const a = (await adminDe(req))!;
  res.json({ totp_enabled: Boolean(a.totp_enabled_at) });
}));

// Alta del 2FA: una sola vez (para rehacerlo: npm run admin -- reset-2fa <email>, en el servidor).
router.post('/2fa/setup', asyncHandler(async (req: AuthRequest, res) => {
  const a = (await adminDe(req))!;
  if (a.totp_enabled_at) throw new AppError('El 2FA ya está activo', 409);
  const secreto = nuevoSecreto();
  await q('UPDATE users SET totp_secret = $1, totp_last_step = NULL WHERE id = $2', [secreto, a.id]);
  res.json({ secret: secreto, uri: uriOtpauth(secreto, a.email) });
}));

router.post('/2fa/enable', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const a = (await adminDe(req))!;
  if (a.totp_enabled_at) throw new AppError('El 2FA ya está activo', 409);
  if (!a.totp_secret) throw new AppError('Primero genera el código QR', 400);
  await consumirCodigo(req, a, code);
  const ahora = new Date(Date.now() - 1000).toISOString();
  await q('UPDATE users SET totp_enabled_at = $1 WHERE id = $2', [ahora, a.id]);
  await auditar(req, '2fa_activado');
  res.json(abrirSesion({ ...a, totp_enabled_at: ahora }));
}));

router.post('/2fa/verify', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const a = (await adminDe(req))!;
  if (!a.totp_enabled_at) throw new AppError('Activa primero el 2FA', 400);
  await consumirCodigo(req, a, code);
  await auditar(req, 'entrada_panel');
  res.json(abrirSesion(a));
}));

// Solo la cuenta de la demo (`admin@demo.com`, sembrada por seedDemo si DEMO_MODE) entra sin
// código: es la única forma de enseñar el panel sin pedirle a quien prueba que configure un
// autenticador. Cualquier otro admin —incluido uno real en producción con DEMO_MODE=true—
// sigue exigiendo su código TOTP: esta ruta nunca abre sesión para otro email.
router.post('/2fa/demo-enter', asyncHandler(async (req: AuthRequest, res) => {
  const a = (await adminDe(req))!;
  if (!DEMO_MODE || a.email !== 'admin@demo.com') throw new AppError('Ruta no encontrada', 404);
  if (!a.totp_enabled_at) throw new AppError('Activa primero el 2FA', 400);
  await auditar(req, 'entrada_panel_demo');
  res.json(abrirSesion(a));
}));

router.use(sesionAdmin);

// ── Sistema ─────────────────────────────────────────────────────────────────────────────────────

function tamano(ruta: string) {
  try { return statSync(ruta).size; } catch { return 0; }
}

// count(*) llega de pg como cadena (bigint): Number(...) en el único sitio por el que pasan
// los once conteos de este panel (los nueve de counts y los dos de app_downloads).
async function contar(sql: string, params: unknown[] = []) {
  const fila = await qOne<{ n: string }>(sql, params);
  return Number(fila?.n ?? 0);
}

router.get('/system', asyncHandler(async (_req: AuthRequest, res) => {
  let fotos = 0, bytesFotos = 0;
  for (const f of readdirSync(UPLOAD_DIR)) { fotos++; bytesFotos += tamano(join(UPLOAD_DIR, f)); }
  const disco = statfsSync(dirname(UPLOAD_DIR));
  const version = await qOne<{ v: number | null }>('SELECT max(version) AS v FROM schema_migrations');
  const dbBytes = await qOne<{ bytes: string }>('SELECT pg_database_size(current_database()) AS bytes');
  const porVersion = await q<{ version: string; n: string }>(
    'SELECT version, COUNT(*) AS n FROM apk_descargas GROUP BY version ORDER BY MAX(created_at) DESC',
  );
  res.json({
    schema_version: version?.v ?? 0, schema_expected: ESQUEMA_VERSION,
    demo_mode: DEMO_MODE,
    node: process.version,
    uptime_s: Math.round(process.uptime()),
    db_bytes: Number(dbBytes?.bytes ?? 0),
    uploads: { files: fotos, bytes: bytesFotos },
    disk: { free_bytes: disco.bavail * disco.bsize, total_bytes: disco.blocks * disco.bsize },
    counts: {
      users: await contar('SELECT COUNT(*) AS n FROM users'),
      clients: await contar("SELECT COUNT(*) AS n FROM users WHERE user_type = 'client'"),
      providers_free: await contar("SELECT COUNT(*) AS n FROM provider_profiles WHERE subscription_plan = 'free'"),
      providers_basic: await contar("SELECT COUNT(*) AS n FROM provider_profiles WHERE subscription_plan = 'basic'"),
      providers_pro: await contar("SELECT COUNT(*) AS n FROM provider_profiles WHERE subscription_plan = 'pro'"),
      services: await contar('SELECT COUNT(*) AS n FROM services'),
      catalog_items: await contar('SELECT COUNT(*) AS n FROM catalog_items'),
      appointments_upcoming: await contar(
        "SELECT COUNT(*) AS n FROM appointments WHERE status IN ('pending', 'confirmed') AND starts_at > $1",
        [new Date().toISOString()],
      ),
      pending_payments: await contar("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'pending'"),
    },
    app_downloads: {
      total: await contar('SELECT COUNT(*) AS n FROM apk_descargas'),
      last7d: await contar(
        'SELECT COUNT(*) AS n FROM apk_descargas WHERE created_at > $1',
        [new Date(Date.now() - 7 * 86_400_000).toISOString()],
      ),
      by_version: porVersion.map((r) => ({ version: r.version, n: Number(r.n) })),
    },
  });
}));

// ── Telegram ────────────────────────────────────────────────────────────────────────────────────

const leer = async (k: string) => (await qOne<{ value: string }>('SELECT value FROM telegram_state WHERE key = $1', [k]))?.value ?? null;
// poner/quitar de telegram_state, para usar DENTRO de una transacción: reciben el cliente `c`
// de tx() en vez de usar el pool, que corrompería la transacción en silencio (ver constraints.md).
const ponerTx = (c: Tx, k: string, v: string) => c.q('INSERT INTO telegram_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, v]);
const quitarTx = (c: Tx, ...ks: string[]) => Promise.all(ks.map((k) => c.q('DELETE FROM telegram_state WHERE key = $1', [k])));

router.get('/telegram', asyncHandler(async (_req: AuthRequest, res) => {
  const clave = await leer('notifier_pubkey');
  const latido = await leer('heartbeat');
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const linkedUsers = await contar('SELECT COUNT(*) AS n FROM users WHERE telegram_chat_id IS NOT NULL');
  const porEstado = await q<{ status: string; n: string }>('SELECT status, COUNT(*) AS n FROM notifications WHERE created_at > $1 GROUP BY status', [hace7]);
  res.json({
    token: { configured: Boolean(await leer('token_cipher')), hint: await leer('token_hint'), updated_at: await leer('token_updated_at'), error: await leer('token_error') },
    notifier: {
      key_fingerprint: clave ? createHash('sha256').update(clave).digest('hex').slice(0, 16) : null,
      heartbeat: latido,
      alive: Boolean(latido && Date.now() - Date.parse(latido) < 2 * 60_000),
      bot_username: await leer('bot_username'),
    },
    linked_users: linkedUsers,
    last7d: Object.fromEntries(porEstado.map((r) => [r.status, Number(r.n)])),
    recent_errors: await q(`SELECT kind, status, last_error, attempts, created_at FROM notifications
      WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 10`),
  });
}));

const codigoSchema = z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/, 'Escribe el código de 6 cifras de tu app');

router.put('/telegram/token', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { token, code } = z.object({ token: z.string().trim().regex(FORMATO_TOKEN, 'Eso no parece un token de @BotFather (número:letras)'), code: codigoSchema }).parse(req.body);
  await consumirCodigo(req, (await adminDe(req))!, code);
  const clave = await leer('notifier_pubkey');
  if (!clave) throw new AppError('El notificador aún no ha arrancado nunca: no hay con qué cifrar el token.', 409);
  const version = String(Number((await leer('token_version')) ?? 0) + 1);
  await tx(async (c) => {
    await ponerTx(c, 'token_cipher', cifrarToken(clave, token));
    await ponerTx(c, 'token_hint', token.slice(-4));
    await ponerTx(c, 'token_updated_at', new Date().toISOString());
    await ponerTx(c, 'token_version', version);
    await quitarTx(c, 'token_error');
  });
  await auditar(req, 'telegram_token_cambiado', `…${token.slice(-4)}`);
  res.json({ ok: true, hint: token.slice(-4) });
}));

router.delete('/telegram/token', limite2fa, asyncHandler(async (req: AuthRequest, res) => {
  const { code } = z.object({ code: codigoSchema }).parse(req.body);
  await consumirCodigo(req, (await adminDe(req))!, code);
  const version = String(Number((await leer('token_version')) ?? 0) + 1);
  await tx(async (c) => {
    await quitarTx(c, 'token_cipher', 'token_hint', 'token_error');
    await ponerTx(c, 'token_updated_at', new Date().toISOString());
    await ponerTx(c, 'token_version', version);
  });
  await auditar(req, 'telegram_token_borrado');
  res.json({ ok: true });
}));

// ── Registro ────────────────────────────────────────────────────────────────────────────────────

router.get('/audit', asyncHandler(async (_req: AuthRequest, res) => {
  res.json({
    entries: await q(`SELECT a.action, a.detail, a.ip, a.created_at, u.email FROM admin_audit a LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC LIMIT 100`),
  });
}));

export default router;
