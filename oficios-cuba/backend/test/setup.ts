import { config } from 'dotenv';
import { join } from 'path';
import { Client } from 'pg';
import { afterAll, beforeAll } from 'vitest';
import { PLANTILLA } from './plantilla.js';

// El .env real del proyecto vive un nivel por encima de backend/ (lo usa también producción).
// Sin esto, cada test de conexión a Postgres (DATABASE_URL) exige exportar la variable a mano
// antes de correr vitest. dotenv nunca pisa una variable que ya venga del entorno (no pasamos
// `override`), así que se puede seguir apuntando los tests a otra base sin tocar este archivo.
// Se carga ANTES de las asignaciones de abajo para que estas sigan ganando (p. ej. DEMO_MODE
// pasa a 'false' aquí aunque el .env traiga 'true': los tests no deben correr en modo demo).
config({ path: join(__dirname, '..', '..', '.env') });

// La URL de la base `postgres` (para CREATE/DROP DATABASE) se DERIVA de DATABASE_URL:
// host, puerto y credenciales son los mismos, solo cambia el nombre de la base. Escribirla
// aparte duplicaría la contraseña y el puerto en el código, y se desincronizarían.
function urlAdmin() {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/postgres';
  return url.toString();
}

// Un nombre por proceso de test. `pool: 'forks'` da un proceso por archivo.
const propia = `oficio_test_${process.pid}_${Date.now()}`;

process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'false';
process.env.JWT_SECRET = 'test-secret-de-al-menos-treinta-y-dos-caracteres';
process.env.DATABASE_URL = urlAdmin().replace(/postgres$/, propia);

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Postgres rechaza `CREATE DATABASE ... TEMPLATE x` mientras otra conexión usa x
// (code 55006, "source database is being accessed by other users"). Con `pool: 'forks'`
// varios archivos de test arrancan a la vez y todos clonan la misma plantilla, así que el
// choque es la norma, no la excepción. Se reintenta en vez de serializar los archivos
// (`fileParallelism: false` sería más simple pero deja la suite mucho más lenta).
async function crearDesdePlantilla(admin: Client, nombre: string) {
  const maxIntentos = 40;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      await admin.query(`CREATE DATABASE ${nombre} TEMPLATE ${PLANTILLA}`);
      return;
    } catch (err) {
      const codigoOcupada = (err as { code?: string }).code === '55006';
      if (!codigoOcupada || intento === maxIntentos) throw err;
      await esperar(150 + Math.random() * 150);
    }
  }
}

beforeAll(async () => {
  const c = new Client({ connectionString: urlAdmin() });
  await c.connect();
  try {
    // TEMPLATE copia ficheros: no re-ejecuta el esquema ni el seed.
    await crearDesdePlantilla(c, propia);
  } finally {
    await c.end();
  }
});

afterAll(async () => {
  // Algunos archivos de test (acceso.test.ts, conexion.test.ts, esquema.test.ts) ya cierran
  // el pool en su propio afterAll. `pool.end()` lanza si se llama dos veces, y un error aquí
  // ANTES del DROP DATABASE de abajo dejaría la base del archivo huérfana. Por eso cerrar el
  // pool nunca puede impedir el intento de borrado: se registra el fallo y se sigue.
  try {
    const { pool, cerrarPool } = await import('../src/db/conexion.js');
    if (!(pool as unknown as { ending?: boolean }).ending) await cerrarPool();
  } catch (err) {
    console.error(`[test/setup] no se pudo cerrar el pool antes de borrar ${propia}:`, err);
  }

  const c = new Client({ connectionString: urlAdmin() });
  await c.connect();
  try {
    // WITH (FORCE) desconecta a la fuerza cualquier sesión colgada en `propia`, pero el DROP
    // en sí puede toparse con contención transitoria del catálogo bajo carga; un reintento
    // corto es más barato que dejar la base sin borrar.
    await borrarConReintento(c, propia);
  } catch (err) {
    console.error(`[test/setup] no se pudo borrar ${propia}, queda huérfana:`, err);
  } finally {
    await c.end();
  }
});

async function borrarConReintento(admin: Client, nombre: string) {
  const maxIntentos = 5;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
      return;
    } catch (err) {
      if (intento === maxIntentos) throw err;
      await esperar(150 + Math.random() * 150);
    }
  }
}
