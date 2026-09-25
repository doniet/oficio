import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

// La base de producción se creó con el esquema del commit d68b13f (sin migraciones).
// Se reproduce ANTES de importar el módulo de la base, que la abre al cargarse.
const vieja = new Database(process.env.DATABASE_PATH!);
vieja.pragma('foreign_keys = ON');
vieja.exec(readFileSync(join(__dirname, 'fixtures/esquema-v0.sql'), 'utf8'));
vieja.exec(`
  INSERT INTO provinces (id, name, capital, lat, lng) VALUES ('prov', 'La Habana', 'La Habana', 23.1, -82.3);
  INSERT INTO categories (id, name, slug) VALUES ('cat', 'Oficios', 'oficios');
  INSERT INTO users (id, email, password_hash, full_name, user_type) VALUES
    ('u-pro', 'p@x.cu', 'h', 'Pro', 'provider'), ('u-cli', 'c@x.cu', 'h', 'Cli', 'client');
  INSERT INTO provider_profiles (id, user_id, province_id) VALUES ('pp', 'u-pro', 'prov');
  INSERT INTO services (id, provider_id, category_id, title) VALUES ('s1', 'pp', 'cat', 'Uno');
  INSERT INTO reviews (id, service_id, client_id, provider_id, rating) VALUES ('r1', 's1', 'u-cli', 'pp', 4);
`);
vieja.close();

describe('migraciones sobre una base existente', () => {
  it('actualiza el esquema sin perder datos y borrar un servicio ya no borra sus reseñas', async () => {
    const { default: db, initDatabase, ESQUEMA_VERSION } = await import('../src/db/index.js');
    initDatabase();

    expect(db.pragma('user_version', { simple: true })).toBe(ESQUEMA_VERSION);
    expect(db.prepare('SELECT rating FROM reviews WHERE id = ?').get('r1')).toEqual({ rating: 4 });
    expect(db.pragma('foreign_key_check')).toEqual([]);

    db.prepare('DELETE FROM services WHERE id = ?').run('s1');
    expect(db.prepare('SELECT service_id FROM reviews WHERE id = ?').get('r1')).toEqual({ service_id: null });

    const columnas = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
    expect(columnas).toContain('password_changed_at');

    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    expect(tablas).toContain('push_devices');

    // Idempotente: arrancar otra vez no rehace nada.
    initDatabase();
    expect(db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 1 });
  });
});
