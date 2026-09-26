import 'dotenv/config';
import { readFileSync } from 'fs';
import db from './db.js';
import { clienteTelegram, enviarPendientes, presentarse, recibir } from './bot.js';

// Proceso del contenedor oficio_notifier. La base la migra la API: aquí solo se espera a que exista.
// El token se lee de TELEGRAM_BOT_TOKEN_FILE (secreto de Docker / archivo chmod 600) o de TELEGRAM_BOT_TOKEN.

function leerToken() {
  const archivo = process.env.TELEGRAM_BOT_TOKEN_FILE;
  const token = (archivo ? readFileSync(archivo, 'utf8') : process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!/^\d+:[\w-]{30,}$/.test(token)) {
    console.error('Falta el token del bot (TELEGRAM_BOT_TOKEN_FILE) o no tiene el formato de Telegram.');
    process.exit(1);
  }
  return token;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function esperarEsquema() {
  for (;;) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get()) return;
    console.log('Esperando a que la API cree la base…');
    await pausa(5000);
  }
}

async function bucle(nombre: string, vuelta: () => Promise<unknown>, descanso: number) {
  let errores = 0;
  for (;;) {
    try {
      await vuelta();
      errores = 0;
      await pausa(descanso);
    } catch (err) {
      errores++;
      console.error(`${nombre}: ${(err as Error).message}`);
      await pausa(Math.min(60_000, 2000 * 2 ** Math.min(errores, 5)));
    }
  }
}

async function main() {
  const llamar = clienteTelegram(leerToken(), process.env.TELEGRAM_API_BASE || undefined);
  await esperarEsquema();
  const usuario = await presentarse(llamar);
  console.log(`Notificador activo como @${usuario}`);
  await Promise.all([
    bucle('recibir', () => recibir(llamar), 0),
    bucle('enviar', () => enviarPendientes(llamar), 3000),
  ]);
}

main().catch((err) => {
  console.error('El notificador no pudo arrancar:', (err as Error).message);
  process.exit(1);
});
