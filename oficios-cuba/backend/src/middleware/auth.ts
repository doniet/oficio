import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import db from '../db/index.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    user_type: 'client' | 'provider';
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido' });
  }

  const user = userFromToken(authHeader.split(' ')[1]);
  if (!user) return res.status(401).json({ error: 'Token inválido o expirado' });
  req.user = user;
  next();
}

// Un token deja de valer si el usuario ya no existe o si cambió la contraseña después de emitirlo.
function userFromToken(token: string): AuthRequest['user'] | null {
  let decoded: { id: string; email: string; user_type: 'client' | 'provider'; iat?: number };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as typeof decoded;
  } catch {
    return null;
  }
  const row = db.prepare('SELECT password_changed_at FROM users WHERE id = ?').get(decoded.id) as { password_changed_at: string | null } | undefined;
  if (!row) return null;
  // iat va en segundos: se compara al segundo para no rechazar el token emitido justo tras el cambio.
  if (row.password_changed_at && (decoded.iat ?? 0) < Math.floor(Date.parse(row.password_changed_at) / 1000)) return null;
  return { id: decoded.id, email: decoded.email, user_type: decoded.user_type };
}

// Para rutas públicas que muestran más datos al dueño (p. ej. un servicio desactivado).
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    // token inválido: se trata como visitante anónimo
    req.user = userFromToken(authHeader.split(' ')[1]) ?? undefined;
  }
  next();
}

export function requireProvider(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.user_type !== 'provider') {
    return res.status(403).json({ error: 'Acceso solo para proveedores' });
  }
  next();
}

export function requireClient(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.user_type !== 'client') {
    return res.status(403).json({ error: 'Acceso solo para clientes' });
  }
  next();
}

import { SignOptions } from 'jsonwebtoken';

export function generateToken(user: { id: string; email: string; user_type: 'client' | 'provider' }) {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn']
  };
  return jwt.sign(
    { id: user.id, email: user.email, user_type: user.user_type },
    JWT_SECRET,
    options
  );
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as {
    id: string;
    email: string;
    user_type: 'client' | 'provider';
  };
}