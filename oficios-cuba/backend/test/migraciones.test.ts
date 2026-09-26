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
  -- Tabla de citas tal como la dejó la v3 (se creaba desde \`schema\`, no en una migración).
  CREATE TABLE appointments (
    id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, client_id TEXT NOT NULL, service_id TEXT,
    starts_at TEXT NOT NULL, duration_min INTEGER NOT NULL, note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done')),
    created_at TEXT NOT NULL, updated_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
  );
  INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, duration_min, status, created_at)
    VALUES ('a1', 'pp', 'u-cli', 's1', '2026-09-30T14:00:00.000Z', 90, 'confirmed', '2026-09-25T10:00:00.000Z');
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

    // v4: las citas conservan sus datos, ganan su hora de fin y admiten citas manuales y "no vino".
    expect(db.prepare('SELECT starts_at, ends_at, status, origin, client_id FROM appointments WHERE id = ?').get('a1'))
      .toEqual({ starts_at: '2026-09-30T14:00:00.000Z', ends_at: '2026-09-30T15:30:00.000Z', status: 'confirmed', origin: 'online', client_id: 'u-cli' });
    db.prepare("INSERT INTO appointments (id, provider_id, starts_at, ends_at, duration_min, client_name, origin, status, created_at) VALUES ('a2', 'pp', 'x', 'y', 30, 'Mercedes', 'manual', 'no_show', 'z')").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'agenda_blocks'").get()).toEqual({ n: 1 });
    expect((db.prepare('PRAGMA table_info(services)').all() as { name: string }[]).map((c) => c.name)).toContain('duration_min');
    // v5: catálogo y propósito de las subidas.
    expect((db.prepare('PRAGMA table_info(uploads)').all() as { name: string }[]).map((c) => c.name)).toContain('purpose');
    expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'catalog_items'").get()).toEqual({ n: 1 });
    // v6: Telegram.
    expect((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name)).toEqual(expect.arrayContaining(['telegram_chat_id', 'notify_prefs']));
    expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('notifications', 'telegram_link_tokens', 'telegram_state')").get()).toEqual({ n: 3 });

    db.prepare('DELETE FROM services WHERE id = ?').run('s1');
    expect(db.prepare('SELECT service_id FROM reviews WHERE id = ?').get('r1')).toEqual({ service_id: null });

    const columnas = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
    expect(columnas).toContain('password_changed_at');

    // Idempotente: arrancar otra vez no rehace nada.
    initDatabase();
    expect(db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 1 });
  });
});
