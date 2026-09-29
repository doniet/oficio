import { config } from 'dotenv';
import { join } from 'path';
import { Client } from 'pg';

export const PLANTILLA = 'oficio_test_plantilla';

// globalSetup corre en un proceso aparte, ANTES de que vitest cargue setupFiles (test/setup.ts):
// es el único momento en que nadie más ha leído el .env todavía, así que hay que cargarlo aquí
// también. Sin esto, DATABASE_URL no existe todavía y urlAdmin() revienta con la URL vacía.
config({ path: join(__dirname, '..', '..', '.env') });

// La URL de la base `postgres` (para CREATE/DROP DATABASE) se DERIVA de DATABASE_URL:
// host, puerto y credenciales son los mismos, solo cambia el nombre de la base. Escribirla
// aparte duplicaría la contraseña y el puerto en el código, y se desincronizarían.
function urlAdmin() {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/postgres';
  return url.toString();
}

export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.DEMO_MODE = 'false';
  process.env.JWT_SECRET = 'test-secret-de-al-menos-treinta-y-dos-caracteres';

  const c = new Client({ connectionString: urlAdmin() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${PLANTILLA}`);
  await c.query(`CREATE DATABASE ${PLANTILLA}`);
  await c.end();

  // Aplicar esquema + seed base una sola vez, en la plantilla. Los `import` son dinámicos
  // porque conexion.ts lee DATABASE_URL al cargarse: hay que fijarlo ANTES de importar.
  process.env.DATABASE_URL = urlAdmin().replace(/postgres$/, PLANTILLA);
  const { migrar } = await import('../src/db/migrar.js');
  const { seedBase } = await import('../src/db/seed.js');
  const { cerrarPool } = await import('../src/db/conexion.js');
  await migrar();
  await seedBase();
  await cerrarPool();
}
