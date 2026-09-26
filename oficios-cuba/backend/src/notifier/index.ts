import 'dotenv/config';
import { createPublicKey, generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import db from './db.js';
import { clienteTelegram, enviarPendientes, estado, latido, presentarse, recibir, type Llamar } from './bot.js';
import { descifrarToken } from '../lib/telegram-comun.js';

// Proceso del contenedor oficio_notifier. La base la migra la API: aquí solo se espera a que exista.
// El token lo pega un admin en el panel; la API lo guarda cifrado con la clave pública que este
// proceso publica en telegram_state. La clave privada vive solo en NOTIFIER_KEYS_DIR (volumen propio).
// TELEGRAM_BOT_TOKEN en el entorno sirve para desarrollo y tiene prioridad.

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clavePrivada() {
  const dir = process.env.NOTIFIER_KEYS_DIR || resolve(__dirname, '../../data/notifier-keys');
  const archivo = join(dir, 'notifier.key');
  if (!existsSync(archivo)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
    writeFileSync(archivo, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    console.log('Par de claves del notificador creado.');
  }
  return readFileSync(archivo, 'utf8');
}

async function esperarEsquema() {
  for (;;) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get()) return;
    console.log('Esperando a que la API cree la base…');
    await pausa(5000);
  }
}

let llamar: Llamar | null = null;
let version: string | null | undefined;

/** Relee el token si cambió en el panel y se reconecta. Sin token, el notificador espera. */
async function sincronizarToken(privada: string) {
  const deEntorno = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const actual = deEntorno ? 'entorno' : estado.leer('token_version') ?? null;
  if (actual === version) return;
  version = actual;
  llamar = null;
  estado.quitar('bot_username');
  const cifrado = estado.leer('token_cipher');
  if (!deEntorno && !cifrado) {
    console.log('Sin token: esperando a que un admin lo pegue en el panel.');
    return;
  }
  try {
    const token = deEntorno || descifrarToken(privada, cifrado!);
    const cliente = clienteTelegram(token, process.env.TELEGRAM_API_BASE || undefined);
    const anterior = estado.leer('bot_id');
    const usuario = await presentarse(cliente);
    // Otro bot = otra cola de mensajes: su offset empieza de cero.
    if (anterior !== estado.leer('bot_id')) estado.quitar('update_offset');
    estado.quitar('token_error');
    llamar = cliente;
    console.log(`Notificador activo como @${usuario}`);
  } catch (err) {
    const msg = (err as Error).message;
    estado.poner('token_error', msg.slice(0, 200));
    console.error(`El token no funciona: ${msg}`);
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
  await esperarEsquema();
  const privada = clavePrivada();
  estado.poner('notifier_pubkey', createPublicKey(privada).export({ type: 'spki', format: 'pem' }) as string);
  latido();
  await sincronizarToken(privada);
  await Promise.all([
    bucle('token', () => sincronizarToken(privada), 10_000),
    bucle('recibir', async () => (llamar ? recibir(llamar) : (latido(), pausa(5000))), 0),
    bucle('enviar', async () => (llamar ? enviarPendientes(llamar) : latido()), 3000),
  ]);
}

main().catch((err) => {
  console.error('El notificador no pudo arrancar:', (err as Error).message);
  process.exit(1);
});
