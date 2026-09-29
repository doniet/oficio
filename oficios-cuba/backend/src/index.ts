import 'dotenv/config';
import app from './app.js';
import { migrar } from './db/migrar.js';
import { expireSubscriptions } from './db/index.js';
import { seedBase } from './db/seed.js';
import { seedDemo } from './db/seed-demo.js';
import { DEMO_MODE } from './config.js';
import { programarAvisos } from './lib/avisos.js';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  // Si migrar() falla, el proceso tiene que morir (ver el catch de start().catch más abajo) en
  // vez de servir con el esquema a medio aplicar: por eso va antes que cualquier otro await, sin
  // try/catch propio.
  await migrar();
  await seedBase();
  if (DEMO_MODE && (await seedDemo())) {
    console.log('Datos demo creados');
  }
  // expireSubscriptions() y programarAvisos() son async (Tarea 5/13): un setInterval no espera a
  // su callback, así que un rechazo suyo sería una unhandled promise rejection cada hora/5 min. El
  // try/catch tiene que estar DENTRO de una función async que SÍ haga await, nunca alrededor de la
  // llamada sin await — ese patrón no atrapa nada (trampas-porte.md).
  //
  // La caducidad de planes NO es un requisito para servir (a diferencia de migrar(), del que
  // depende todo lo demás): un perfil que debió caducar hace un minuto y caduca el próximo tick
  // no es una base a medias, es un dato que se pone al día solo. Por eso la llamada de arranque
  // usa el MISMO wrapper protegido que el setInterval, en vez de un await suelto que tumbaría el
  // proceso entero por un fallo transitorio (p. ej. el pool todavía calentando la conexión).
  const expirar = async () => {
    try { await expireSubscriptions(); } catch (err) { console.error('Caducidad de planes:', (err as Error).message); }
  };
  await expirar();
  setInterval(expirar, 60 * 60 * 1000).unref();
  // Recordatorios, resumen de mañana y vencimiento del plan (dedupe: cada uno se apunta una vez).
  const programar = async () => {
    try { await programarAvisos(); } catch (err) { console.error('Avisos programados:', (err as Error).message); }
  };
  programar();
  setInterval(programar, 5 * 60 * 1000).unref();

  // Los avisos push los envía oficio_notifier (notifier/push.ts): la API solo los apunta.

  app.listen(PORT, () => {
    console.log(`API escuchando en :${PORT} (demo=${DEMO_MODE})`);
  });
}

start().catch((err) => {
  console.error('No se pudo arrancar la API:', err);
  process.exit(1);
});

export default app;
