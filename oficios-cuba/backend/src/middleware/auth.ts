import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

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

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      user_type: 'client' | 'provider';
    };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Para rutas públicas que muestran más datos al dueño (p. ej. un servicio desactivado).
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as AuthRequest['user'];
    } catch {
      // token inválido: se trata como visitante anónimo
    }
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