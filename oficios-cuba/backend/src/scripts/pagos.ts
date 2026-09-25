// Administración de pagos manuales (transferencia / efectivo) mientras no haya pasarela.
//   Desarrollo:  npm run pagos -- listar | confirmar <subscription_id> | rechazar <subscription_id>
//   Producción:  docker exec oficio_api node dist/scripts/pagos.js listar
import 'dotenv/config';
import { initDatabase } from '../db/index.js';
import { confirmarPago, pagosPendientes, rechazarPago } from '../db/pagos.js';

initDatabase();
const [accion, id] = process.argv.slice(2);

try {
  if (accion === 'listar' || !accion) {
    const pendientes = pagosPendientes();
    if (!pendientes.length) console.log('No hay pagos pendientes.');
    for (const p of pendientes) {
      console.log(`${p.subscription_id}  ${p.plan.padEnd(8)} $${p.amount.toFixed(2)}  ${p.business_name ?? p.full_name} <${p.email}>`
        + `  solicitado ${p.solicitado.slice(0, 10)}  transacción: ${p.transaction_id ?? '(sin reportar)'}`);
    }
  } else if (accion === 'confirmar' && id) {
    const r = confirmarPago(id);
    console.log(`Confirmado: plan ${r.plan} activo hasta ${r.hasta.slice(0, 10)}.`);
  } else if (accion === 'rechazar' && id) {
    rechazarPago(id);
    console.log('Rechazado: la suscripción quedó cancelada y el pago como fallido.');
  } else {
    console.log('Uso: pagos listar | confirmar <subscription_id> | rechazar <subscription_id>');
    process.exitCode = 2;
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
