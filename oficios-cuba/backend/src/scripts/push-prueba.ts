// Envía N notificaciones de prueba a todos los dispositivos de un usuario, espaciadas, y anota el resultado.
//   Producción: docker exec oficio_api node dist/scripts/push-prueba.js <email> [n=10] [segundos=30]
import 'dotenv/config';
import db, { initDatabase } from '../db/index.js';
import { crearCanalFcm, cargarCuentaFcm } from '../push/fcm.js';
import { dispositivosDe } from '../push/registro.js';

initDatabase();
const [email, nArg = '10', segArg = '30'] = process.argv.slice(2);
const cuenta = cargarCuentaFcm();
if (!email || !cuenta) {
  console.error('Uso: push-prueba <email> [n] [segundos]  (requiere FCM_SERVICE_ACCOUNT_FILE)');
  process.exit(2);
}
const usuario = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as { id: string } | undefined;
if (!usuario) { console.error(`No existe ${email}`); process.exit(1); }
const dispositivos = dispositivosDe(usuario.id);
if (!dispositivos.length) { console.error('Ese usuario no tiene dispositivos registrados (¿abrió la app con sesión?)'); process.exit(1); }

const canal = crearCanalFcm(cuenta);
const n = Number(nArg);
(async () => {
  for (let i = 1; i <= n; i++) {
    const hora = new Date().toISOString().slice(11, 19);
    for (const d of dispositivos) {
      const r = await canal.enviar(d.token, { titulo: `Prueba ${i}/${n} · ${hora} UTC`, cuerpo: 'Anota a qué hora te llegó', datos: { tipo: 'prueba', n: String(i) } });
      console.log(`${hora} UTC  #${i}  …${d.token.slice(-8)}  ${r}`);
    }
    if (i < n) await new Promise((r) => setTimeout(r, Number(segArg) * 1000));
  }
})();
