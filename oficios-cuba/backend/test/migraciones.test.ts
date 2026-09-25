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
  INSERT INTO provider_profiles (id, user_id, province_id, subscription_plan) VALUES ('pp', 'u-pro', 'prov', 'premium');
  INSERT INTO services (id, provider_id, category_id, title, price_min) VALUES ('s1', 'pp', 'cat', 'Uno', 35);
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

    // v3: premium pasa a Profesional y los precios que había (en USD) conservan su moneda.
    expect(db.prepare('SELECT subscription_plan, contact_mode, kind FROM provider_profiles WHERE id = ?').get('pp'))
      .toEqual({ subscription_plan: 'pro', contact_mode: 'whatsapp', kind: 'oficio' });
    expect(db.prepare('SELECT price_currency FROM services WHERE id = ?').get('s1')).toEqual({ price_currency: 'USD' });

    db.prepare('DELETE FROM services WHERE id = ?').run('s1');
    expect(db.prepare('SELECT service_id FROM reviews WHERE id = ?').get('r1')).toEqual({ service_id: null });

    const columnas = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
    expect(columnas).toContain('password_changed_at');

    // Idempotente: arrancar otra vez no rehace nada.
    initDatabase();
    expect(db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 1 });
  });
});
