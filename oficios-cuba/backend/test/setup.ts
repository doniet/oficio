import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'oficios-test-')), 'oficios.db');
process.env.JWT_SECRET = 'test-secret-de-al-menos-treinta-y-dos-caracteres';
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'false';
