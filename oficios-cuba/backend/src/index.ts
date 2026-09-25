import 'dotenv/config';
import app from './app.js';
import { initDatabase, expireSubscriptions } from './db/index.js';
import { seedBase } from './db/seed.js';
import { seedDemo } from './db/seed-demo.js';
import { DEMO_MODE } from './config.js';
import { cargarCuentaFcm, crearCanalFcm } from './push/fcm.js';
import { usarCanal } from './push/avisos.js';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  initDatabase();
  seedBase();
  if (DEMO_MODE && (await seedDemo())) {
    console.log('Datos demo creados');
  }
  expireSubscriptions();
  setInterval(expireSubscriptions, 60 * 60 * 1000).unref();

  // El push es opcional: nunca debe tumbar el arranque de la API (igual que nunca
  // retrasa ni rompe la respuesta del chat — ver push/avisos.ts).
  let cuentaFcm: ReturnType<typeof cargarCuentaFcm> = null;
  try {
    cuentaFcm = cargarCuentaFcm();
  } catch (err) {
    console.log(`Push FCM desactivado: ${(err as Error).message}`);
  }
  if (cuentaFcm) {
    usarCanal('fcm', crearCanalFcm(cuentaFcm));
    console.log(`Push FCM activo (proyecto ${cuentaFcm.project_id})`);
  } else if (!process.env.FCM_SERVICE_ACCOUNT_FILE) {
    console.log('Push FCM desactivado: falta FCM_SERVICE_ACCOUNT_FILE');
  }

  app.listen(PORT, () => {
    console.log(`API escuchando en :${PORT} (demo=${DEMO_MODE})`);
  });
}

start().catch((err) => {
  console.error('No se pudo arrancar la API:', err);
  process.exit(1);
});

export default app;
