import { config } from 'dotenv';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// El .env real del proyecto vive un nivel por encima de backend/ (lo usa también producción).
// Sin esto, cada test de conexión a Postgres (DATABASE_URL) exige exportar la variable a mano
// antes de correr vitest. dotenv nunca pisa una variable que ya venga del entorno (no pasamos
// `override`), así que se puede seguir apuntando los tests a otra base sin tocar este archivo.
// Se carga ANTES de las asignaciones de abajo para que estas sigan ganando (p. ej. DEMO_MODE
// pasa a 'false' aquí aunque el .env traiga 'true': los tests no deben correr en modo demo).
config({ path: join(__dirname, '..', '..', '.env') });

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'oficios-test-')), 'oficios.db');
process.env.JWT_SECRET = 'test-secret-de-al-menos-treinta-y-dos-caracteres';
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'false';
