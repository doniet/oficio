// Administradores del panel técnico. Solo desde el servidor: la web no puede dar este rol.
//   Desarrollo:  npm run admin -- listar | dar <email> | quitar <email> | reset-2fa <email>
//   Producción:  docker exec oficio_api node dist/scripts/admin.js dar <email>
import 'dotenv/config';
import { randomUUID } from 'crypto';
import db, { initDatabase } from '../db/index.js';

initDatabase();
const [accion, email] = process.argv.slice(2);
const registrar = (userId: string, action: string) => db.prepare('INSERT INTO admin_audit (id, user_id, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
  .run(randomUUID(), userId, action, 'desde el servidor (CLI)', 'cli', new Date().toISOString());

function usuario(e: string | undefined) {
  const u = e && db.prepare('SELECT id, email, full_name FROM users WHERE email = ? COLLATE NOCASE').get(e.trim()) as { id: string; email: string; full_name: string } | undefined;
  if (!u) { console.error(`No hay ningún usuario con el email ${e ?? '(vacío)'}.`); process.exit(1); }
  return u;
}

if (accion === 'listar' || !accion) {
  const admins = db.prepare('SELECT email, full_name, totp_enabled_at FROM users WHERE is_admin = 1 ORDER BY email').all() as { email: string; full_name: string; totp_enabled_at: string | null }[];
  if (!admins.length) console.log('No hay administradores.');
  for (const a of admins) console.log(`${a.email}  ${a.full_name}  2FA: ${a.totp_enabled_at ? `activo desde ${a.totp_enabled_at.slice(0, 10)}` : 'pendiente (lo activa al entrar en /admin)'}`);
} else if (accion === 'dar') {
  const u = usuario(email);
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(u.id);
  registrar(u.id, 'admin_dado');
  console.log(`${u.email} ya es administrador. Al entrar en /admin tendrá que activar el 2FA.`);
} else if (accion === 'quitar') {
  const u = usuario(email);
  db.prepare('UPDATE users SET is_admin = 0, totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?').run(u.id);
  registrar(u.id, 'admin_quitado');
  console.log(`${u.email} ya no es administrador.`);
} else if (accion === 'reset-2fa') {
  const u = usuario(email);
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?').run(u.id);
  registrar(u.id, '2fa_reiniciado');
  console.log(`2FA de ${u.email} borrado: lo vuelve a activar al entrar en /admin (las sesiones de administración abiertas caducan).`);
} else {
  console.log('Uso: admin listar | dar <email> | quitar <email> | reset-2fa <email>');
  process.exitCode = 2;
}
