import 'dotenv/config';
import app from './app.js';
import { initDatabase, expireSubscriptions } from './db/index.js';
import { seedBase } from './db/seed.js';
import { seedDemo } from './db/seed-demo.js';
import { DEMO_MODE } from './config.js';
import { programarAvisos } from './lib/avisos.js';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  initDatabase();
  seedBase();
  if (DEMO_MODE && (await seedDemo())) {
    console.log('Datos demo creados');
  }
  expireSubscriptions();
  setInterval(expireSubscriptions, 60 * 60 * 1000).unref();
  // Recordatorios, resumen de mañana y vencimiento del plan (dedupe: cada uno se apunta una vez).
  const programar = () => { try { programarAvisos(); } catch (err) { console.error('Avisos programados:', (err as Error).message); } };
  programar();
  setInterval(programar, 5 * 60 * 1000).unref();

  app.listen(PORT, () => {
    console.log(`API escuchando en :${PORT} (demo=${DEMO_MODE})`);
  });
}

start().catch((err) => {
  console.error('No se pudo arrancar la API:', err);
  process.exit(1);
});

export default app;
