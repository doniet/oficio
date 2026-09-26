import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import db from '../db/index.js';
import { JWT_SECRET } from '../config.js';
import { clienteIp } from '../lib/cliente.js';

const router = Router();

// El APK lo sirve nginx desde /descargas/ y Cloudflare lo guarda en caché, así que contar allí se
// quedaría corto. El botón de la web pasa por aquí: se cuenta y se redirige al archivo.
const APK = /^oficios-cuba-(\d{1,3}\.\d{1,3}\.\d{1,3})\.apk$/;
const DIA = 86_400_000;

router.get('/descargar', (req, res) => {
  const archivo = typeof req.query.archivo === 'string' ? req.query.archivo : '';
  const m = APK.exec(archivo);
  if (!m) return res.status(400).json({ error: 'Archivo no válido' });
  const version = m[1];
  // Nunca la IP en claro: solo su hash con sal, lo justo para no contar dos veces un reintento.
  const visitante = createHash('sha256').update(`${JWT_SECRET}:apk:${clienteIp(req)}`).digest('hex').slice(0, 32);
  const ahora = new Date();
  try {
    const reciente = db.prepare('SELECT 1 FROM apk_descargas WHERE visitante = ? AND version = ? AND created_at > ?')
      .get(visitante, version, new Date(ahora.getTime() - DIA).toISOString());
    if (!reciente) {
      db.prepare('INSERT INTO apk_descargas (id, version, visitante, created_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), version, visitante, ahora.toISOString());
    }
  } catch (err) {
    // El contador nunca debe impedir la descarga.
    console.error('No se pudo contar la descarga:', (err as Error).message);
  }
  res.set('Cache-Control', 'no-store');
  res.redirect(302, `/descargas/${archivo}`);
});

export default router;
