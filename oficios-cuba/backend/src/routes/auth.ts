import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

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

router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
  if (existingUser) {
    throw new AppError('El email ya está registrado', 400);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const userId = uuidv4();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, user_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, data.email, passwordHash, data.full_name, data.phone || null, data.user_type, new Date().toISOString());

  if (data.user_type === 'provider') {
    db.prepare(`
      INSERT INTO provider_profiles (id, user_id, province_id, whatsapp, created_at)
      VALUES (?, ?, COALESCE((SELECT id FROM provinces WHERE name = 'La Habana'), (SELECT id FROM provinces LIMIT 1)), ?, ?)
    `).run(uuidv4(), userId, data.phone || null, new Date().toISOString());
  }

  const token = generateToken({ id: userId, email: data.email, user_type: data.user_type });

  res.status(201).json({
    message: 'Usuario registrado exitosamente',
    token,
    user: {
      id: userId,
      email: data.email,
      full_name: data.full_name,
      phone: data.phone || null,
      avatar_url: null,
      user_type: data.user_type,
      is_verified: false
    }
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email) as
    | { id: string; email: string; password_hash: string; full_name: string; user_type: 'client' | 'provider'; is_verified: number }
    | undefined;

  if (!user) {
    throw new AppError('Credenciales inválidas', 401);
  }

  const validPassword = await bcrypt.compare(data.password, user.password_hash);
  if (!validPassword) {
    throw new AppError('Credenciales inválidas', 401);
  }

  const token = generateToken({ id: user.id, email: user.email, user_type: user.user_type });

  res.json({
    message: 'Inicio de sesión exitoso',
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: (user as any).phone ?? null,
      avatar_url: (user as any).avatar_url ?? null,
      user_type: user.user_type,
      is_verified: Boolean(user.is_verified)
    }
  });
}));

router.get('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const user = db.prepare('SELECT id, email, full_name, phone, user_type, avatar_url, is_verified, created_at FROM users WHERE id = ?')
    .get(req.user!.id);

  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }

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
    avatar_url: z.union([z.literal(''), z.string().max(500).refine((v) => v.startsWith('/api/uploads/') || v.startsWith('https://'), 'URL de imagen no válida')]).optional(),
  });

  const data = updateSchema.parse(req.body);

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

  const updatedUser = db.prepare('SELECT id, email, full_name, phone, user_type, avatar_url, is_verified FROM users WHERE id = ?')
    .get(req.user!.id);

  res.json({ user: updatedUser });
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

  const validPassword = await bcrypt.compare(data.current_password, user.password_hash);
  if (!validPassword) {
    throw new AppError('Contraseña actual incorrecta', 400);
  }

  const newPasswordHash = await bcrypt.hash(data.new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newPasswordHash, req.user!.id);

  res.json({ message: 'Contraseña actualizada correctamente' });
}));

export default router;