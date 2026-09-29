import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { qOne } from '../db/acceso.js';
import { asyncHandler } from './errorHandler.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    user_type: 'client' | 'provider';
  };
}

// Envuelve el middleware en try/catch: authMiddleware ya no es puramente síncrono (consulta
// password_changed_at) y Express 4 no espera promesas de un middleware — una que rechace sin
// atrapar se pierde como "unhandled rejection" en vez de llegar al errorHandler.
export const authMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido' });
  }

  const user = await userFromToken(authHeader.split(' ')[1]);
  if (!user) return res.status(401).json({ error: 'Token inválido o expirado' });
  req.user = user;
  next();
});

// Un token deja de valer si el usuario ya no existe o si cambió la contraseña después de emitirlo.
async function userFromToken(token: string): Promise<AuthRequest['user'] | null> {
  let decoded: { id: string; email: string; user_type: 'client' | 'provider'; iat?: number };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as typeof decoded;
  } catch {
    return null;
  }
  const row = await qOne<{ password_changed_at: string | null }>('SELECT password_changed_at FROM users WHERE id = $1', [decoded.id]);
  if (!row) return null;
  // iat va en segundos: se compara al segundo para no rechazar el token emitido justo tras el cambio.
  if (row.password_changed_at && (decoded.iat ?? 0) < Math.floor(Date.parse(row.password_changed_at) / 1000)) return null;
  return { id: decoded.id, email: decoded.email, user_type: decoded.user_type };
}

// Para rutas públicas que muestran más datos al dueño (p. ej. un servicio desactivado).
export const optionalAuth = asyncHandler(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    // token inválido: se trata como visitante anónimo
    req.user = (await userFromToken(authHeader.split(' ')[1])) ?? undefined;
  }
  next();
});

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