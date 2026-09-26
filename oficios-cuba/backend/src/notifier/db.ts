import Database from 'better-sqlite3';
import { resolve } from 'path';

// Conexión propia del notificador a la misma base que la API (WAL admite los dos procesos).
const db = new Database(process.env.DATABASE_PATH || resolve(__dirname, '../../data/oficios.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export default db;
