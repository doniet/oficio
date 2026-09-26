// Envía N notificaciones de prueba a todos los dispositivos de un usuario, espaciadas, y anota el resultado.
//   Producción: docker exec oficio_notifier node dist/scripts/push-prueba.js <email> [n=10] [segundos=30]
// Va en oficio_notifier: es el único contenedor con salida a Google y con la cuenta de servicio.
// Envía directo (sin pasar por push_outbox) para medir la latencia real de FCM en el teléfono.
import 'dotenv/config';
import db from '../notifier/db.js';
import { crearCanalFcm, cargarCuentaFcm } from '../push/fcm.js';

const USO = 'Uso: push-prueba <email> [n=10] [segundos=30]  (n y segundos: enteros positivos; requiere FCM_SERVICE_ACCOUNT_FILE)';

function enteroPositivo(texto: string, nombre: string): number {
  const v = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(v) || v < 1) {
    console.error(`${nombre} debe ser un entero positivo (recibido: "${texto}")\n${USO}`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const [email, nArg = '10', segArg = '30'] = process.argv.slice(2);
  if (!email) { console.error(USO); process.exit(2); }
  const n = enteroPositivo(nArg, 'n');
  const segundos = enteroPositivo(segArg, 'segundos');

  const cuenta = cargarCuentaFcm();
  if (!cuenta) { console.error(USO); process.exit(2); }
  const usuario = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as { id: string } | undefined;
  if (!usuario) { console.error(`No existe ${email}`); process.exit(1); }
  const dispositivos = db.prepare('SELECT token FROM push_devices WHERE user_id = ? ORDER BY created_at').all(usuario.id) as { token: string }[];
  if (!dispositivos.length) { console.error('Ese usuario no tiene dispositivos registrados (¿abrió la app con sesión?)'); process.exit(1); }

  const canal = crearCanalFcm(cuenta);
  for (let i = 1; i <= n; i++) {
    const hora = new Date().toISOString().slice(11, 19);
    for (const d of dispositivos) {
      // Un fallo de red en un envío no debe abortar la prueba de campo: se anota y se sigue.
      let r: string;
      try {
        r = await canal.enviar(d.token, { titulo: `Prueba ${i}/${n} · ${hora} UTC`, cuerpo: 'Anota a qué hora te llegó', datos: { tipo: 'prueba', n: String(i) } });
      } catch (err) {
        r = `excepción: ${err instanceof Error ? err.message : String(err)}`;
      }
      console.log(`${hora} UTC  #${i}  …${d.token.slice(-8)}  ${r}`);
    }
    if (i < n) await new Promise((res) => setTimeout(res, segundos * 1000));
  }
}

main().catch((err) => {
  console.error(`push-prueba falló: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
