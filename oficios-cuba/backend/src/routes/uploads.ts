import { Router } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import db from '../db/index.js';

const dbPath = process.env.DATABASE_PATH || resolve(__dirname, '../../data/oficios.db');
export const UPLOAD_DIR = join(dirname(dbPath), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 1.5 * 1024 * 1024;
// Suficiente para un perfil y seis servicios con fotos, y a la vez impide llenar el disco.
const MAX_POR_DIA = 60;

// El tipo se decide por la firma del archivo, no por lo que declare el cliente.
function detectType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const router = Router();

router.post('/', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM uploads WHERE user_id = ? AND created_at > ?').get(req.user!.id, desde) as { n: number };
  if (n >= MAX_POR_DIA) throw new AppError('Has subido demasiadas fotos hoy. Inténtalo mañana.', 429);

  const { data } = z.object({ data: z.string().min(20) }).parse(req.body);
  const base64 = data.replace(/^data:image\/[a-z]+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > MAX_BYTES) throw new AppError('La imagen supera 1,5 MB', 413);
  const ext = detectType(buf);
  if (!ext) throw new AppError('Formato no soportado: usa JPG, PNG o WebP', 400);

  const name = `${uuidv4()}.${ext}`;
  writeFileSync(join(UPLOAD_DIR, name), buf);
  db.prepare('INSERT INTO uploads (name, user_id, created_at) VALUES (?, ?, ?)').run(name, req.user!.id, new Date().toISOString());
  res.status(201).json({ url: `/api/uploads/${name}` });
}));

export default router;
