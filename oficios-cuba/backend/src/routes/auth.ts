import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { imagenPermitida } from '../lib/entrada.js';
import { borrarDispositivosDe } from '../push/registro.js';
import { verificarIdTokenGoogle, IdentidadGoogle } from '../lib/google.js';
import { DEMO_MODE, googleClientId } from '../config.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  full_name: z.string().trim().min(2, 'Escribe tu nombre completo').max(80),
  phone: z.string().trim().max(20).optional(),
  user_type: z.enum(['client', 'provider']),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

const DUMMY_HASH = bcrypt.hashSync('contraseña-que-nadie-tiene', 10);
// Las cuentas creadas con Google no tienen contraseña: este valor nunca es un hash bcrypt válido.
const SIN_CONTRASENA = '!google';

const tienePassword = (hash: string | null | undefined) => Boolean(hash?.startsWith('$2'));

function crearUsuario(u: { email: string; passwordHash: string; full_name: string; phone?: string | null; user_type: 'client' | 'provider'; google_sub?: string | null }) {
  const userId = uuidv4();
  // En una transacción: un proveedor sin perfil se quedaría con todas sus rutas en 404.
  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, user_type, google_sub, is_verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, u.email, u.passwordHash, u.full_name, u.phone || null, u.user_type, u.google_sub ?? null, u.google_sub ? 1 : 0, new Date().toISOString());

    if (u.user_type === 'provider') {
      // El formulario de registro avisa al proveedor de que los clientes lo contactarán por este número.
      db.prepare(`
        INSERT INTO provider_profiles (id, user_id, province_id, whatsapp, created_at)
        VALUES (?, ?, COALESCE((SELECT id FROM provinces WHERE name = 'La Habana'), (SELECT id FROM provinces LIMIT 1)), ?, ?)
      `).run(uuidv4(), userId, u.phone || null, new Date().toISOString());
    }
  })();
  return userId;
}

function usuarioPublico(id: string) {
  const u = db.prepare('SELECT id, email, full_name, phone, avatar_url, user_type, is_verified, google_sub, password_hash, is_admin FROM users WHERE id = ?').get(id);
  return {
    id: u.id, email: u.email, full_name: u.full_name, phone: u.phone ?? null, avatar_url: u.avatar_url ?? null,
    user_type: u.user_type, is_verified: Boolean(u.is_verified),
    google: Boolean(u.google_sub), has_password: tienePassword(u.password_hash),
    ...(u.is_admin ? { is_admin: true } : {}),
  };
}

router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
  if (existingUser) {
    throw new AppError('El email ya está registrado', 400);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const userId = crearUsuario({ email: data.email, passwordHash, full_name: data.full_name, phone: data.phone, user_type: data.user_type });
  const token = generateToken({ id: userId, email: data.email, user_type: data.user_type });
  res.status(201).json({ message: 'Usuario registrado exitosamente', token, user: usuarioPublico(userId) });
}));

// Entrar o registrarse con Google. Con DEMO_MODE y sin Client ID se simula: el frontend muestra un
// selector de cuentas ficticias y manda el email elegido. Una cuenta que ya existe con contraseña
// no se puede tomar así (en demo cualquiera escribiría el email de otro).
const googleSchema = z.object({
  user_type: z.enum(['client', 'provider']).optional(),
}).and(z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('google'), id_token: z.string().min(20).max(4096), nonce: z.string().min(16).max(128) }),
  z.object({
    mode: z.literal('demo'),
    email: z.string().trim().toLowerCase().email('Email inválido'),
    full_name: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  }),
]));

router.post('/google', asyncHandler(async (req, res) => {
  const data = googleSchema.parse(req.body);
  let id: IdentidadGoogle;
  if (data.mode === 'demo') {
    if (!DEMO_MODE) throw new AppError('Login con Google simulado no disponible', 400);
    id = { sub: `demo:${data.email}`, email: data.email, name: data.full_name, picture: null };
  } else {
    if (!googleClientId()) throw new AppError('El acceso con Google todavía no está activo', 503);
    try {
      id = await verificarIdTokenGoogle(data.id_token, data.nonce);
    } catch {
      throw new AppError('No se pudo verificar tu cuenta de Google. Inténtalo de nuevo.', 401);
    }
  }

  let user = db.prepare('SELECT id, email, user_type, google_sub FROM users WHERE google_sub = ?').get(id.sub) as
    | { id: string; email: string; user_type: 'client' | 'provider'; google_sub: string | null } | undefined;
  if (!user) {
    const porEmail = db.prepare('SELECT id, email, user_type, google_sub FROM users WHERE email = ?').get(id.email) as typeof user;
    if (porEmail) {
      // Google verificó el email: se puede enlazar. El simulado no verifica nada.
      if (data.mode === 'demo' || porEmail.google_sub) throw new AppError('Ese email ya tiene cuenta con contraseña. Entra con tu contraseña.', 409);
      db.prepare('UPDATE users SET google_sub = ?, is_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id.sub, porEmail.id);
      user = { ...porEmail, google_sub: id.sub };
    }
  }

  let isNew = false;
  if (!user) {
    if (!data.user_type) return res.status(200).json({ needs_user_type: true, email: id.email, full_name: id.name });
    const userId = crearUsuario({ email: id.email, passwordHash: SIN_CONTRASENA, full_name: id.name, user_type: data.user_type, google_sub: id.sub });
    user = { id: userId, email: id.email, user_type: data.user_type, google_sub: id.sub };
    isNew = true;
  }

  const token = generateToken({ id: user.id, email: user.email, user_type: user.user_type });
  res.status(isNew ? 201 : 200).json({ token, user: usuarioPublico(user.id), is_new: isNew });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email) as
    | { id: string; email: string; password_hash: string; full_name: string; user_type: 'client' | 'provider'; is_verified: number }
    | undefined;

  // Con usuario inexistente también se compara contra un hash: si no, el tiempo de respuesta
  // delata qué emails están registrados.
  const conHash = tienePassword(user?.password_hash);
  const validPassword = await bcrypt.compare(data.password, conHash ? user!.password_hash : DUMMY_HASH);
  if (!user || !conHash) {
    throw new AppError('Credenciales inválidas', 401);
  }

  if (!validPassword) {
    throw new AppError('Credenciales inválidas', 401);
  }

  const token = generateToken({ id: user.id, email: user.email, user_type: user.user_type });
  res.json({ message: 'Inicio de sesión exitoso', token, user: usuarioPublico(user.id) });
}));

router.get('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const row = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.user!.id) as { created_at: string } | undefined;
  if (!row) throw new AppError('Usuario no encontrado', 404);
  const user = { ...usuarioPublico(req.user!.id), created_at: row.created_at };

  let providerProfile = null;
  if (user.user_type === 'provider') {
    providerProfile = db.prepare(`
      SELECT pp.*, p.name as province_name, m.name as municipality_name
      FROM provider_profiles pp
      LEFT JOIN provinces p ON pp.province_id = p.id
      LEFT JOIN municipalities m ON pp.municipality_id = m.id
      WHERE pp.user_id = ?
    `).get(req.user!.id);
  }

  res.json({ user, providerProfile });
}));

router.put('/profile', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const updateSchema = z.object({
    full_name: z.string().trim().min(2, 'Escribe tu nombre completo').max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    avatar_url: z.union([z.literal(''), z.string().max(500)]).optional(),
  });

  const data = updateSchema.parse(req.body);
  if (data.avatar_url) {
    const actual = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user!.id) as { avatar_url: string | null } | undefined;
    if (!imagenPermitida(data.avatar_url, req.user!.id, actual?.avatar_url ? [actual.avatar_url] : [])) {
      throw new AppError('URL de imagen no válida', 400);
    }
  }

  const updates = [];
  const values = [];

  if (data.full_name) {
    updates.push('full_name = ?');
    values.push(data.full_name);
  }
  if (data.phone !== undefined) {
    updates.push('phone = ?');
    values.push(data.phone);
  }
  if (data.avatar_url !== undefined) {
    updates.push('avatar_url = ?');
    values.push(data.avatar_url || null);
  }

  if (updates.length === 0) {
    throw new AppError('No hay datos para actualizar', 400);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.user!.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  res.json({ user: usuarioPublico(req.user!.id) });
}));

router.put('/password', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(128),
  });

  const data = schema.parse(req.body);

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as
    | { password_hash: string } | undefined;

  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }
  if (!tienePassword(user.password_hash)) throw new AppError('Tu cuenta entra con Google y no tiene contraseña', 400);

  const validPassword = await bcrypt.compare(data.current_password, user.password_hash);
  if (!validPassword) {
    throw new AppError('Contraseña actual incorrecta', 400);
  }

  const newPasswordHash = await bcrypt.hash(data.new_password, 10);
  // Cambiar la contraseña cierra las demás sesiones; esta sigue con el token nuevo.
  db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newPasswordHash, new Date().toISOString(), req.user!.id);
  // Las sesiones revocadas no deben seguir recibiendo avisos; la app vuelve a registrar su
  // token en el próximo inicio de sesión o arranque en frío.
  borrarDispositivosDe(req.user!.id);

  res.json({ message: 'Contraseña actualizada correctamente', token: generateToken(req.user!) });
}));

export default router;