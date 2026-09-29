// Administradores del panel técnico. Solo desde el servidor: la web no puede dar este rol.
//   Desarrollo:  npm run admin -- listar | dar <email> | quitar <email> | reset-2fa <email>
//   Producción:  docker exec oficio_api node dist/scripts/admin.js dar <email>
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { migrar } from '../db/migrar.js';
import { q, qOne } from '../db/acceso.js';
import { cerrarPool } from '../db/conexion.js';

async function registrar(userId: string, action: string) {
  await q('INSERT INTO admin_audit (id, user_id, action, detail, ip, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), userId, action, 'desde el servidor (CLI)', 'cli', new Date().toISOString()]);
}

// email es citext (Postgres): la comparación ya es insensible a mayúsculas, sin COLLATE.
async function usuario(e: string | undefined) {
  const u = e && await qOne<{ id: string; email: string; full_name: string }>(
    'SELECT id, email, full_name FROM users WHERE email = $1', [e.trim()],
  );
  if (!u) { console.error(`No hay ningún usuario con el email ${e ?? '(vacío)'}.`); process.exit(1); }
  return u;
}

async function main() {
  await migrar();
  const [accion, email] = process.argv.slice(2);

  if (accion === 'listar' || !accion) {
    const admins = await q<{ email: string; full_name: string; totp_enabled_at: string | null }>(
      'SELECT email, full_name, totp_enabled_at FROM users WHERE is_admin = true ORDER BY email',
    );
    if (!admins.length) console.log('No hay administradores.');
    for (const a of admins) console.log(`${a.email}  ${a.full_name}  2FA: ${a.totp_enabled_at ? `activo desde ${a.totp_enabled_at.slice(0, 10)}` : 'pendiente (lo activa al entrar en /admin)'}`);
  } else if (accion === 'dar') {
    const u = await usuario(email);
    await q('UPDATE users SET is_admin = true WHERE id = $1', [u!.id]);
    await registrar(u!.id, 'admin_dado');
    console.log(`${u!.email} ya es administrador. Al entrar en /admin tendrá que activar el 2FA.`);
  } else if (accion === 'quitar') {
    const u = await usuario(email);
    await q('UPDATE users SET is_admin = false, totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1', [u!.id]);
    await registrar(u!.id, 'admin_quitado');
    console.log(`${u!.email} ya no es administrador.`);
  } else if (accion === 'reset-2fa') {
    const u = await usuario(email);
    await q('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1', [u!.id]);
    await registrar(u!.id, '2fa_reiniciado');
    console.log(`2FA de ${u!.email} borrado: lo vuelve a activar al entrar en /admin (las sesiones de administración abiertas caducan).`);
  } else {
    console.log('Uso: admin listar | dar <email> | quitar <email> | reset-2fa <email>');
    process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
