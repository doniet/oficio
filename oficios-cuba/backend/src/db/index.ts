import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { planDe } from '../config.js';

const dbPath = process.env.DATABASE_PATH || resolve(__dirname, '../../data/oficios.db');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const schema = `
-- Users table (both clients and providers)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  user_type TEXT NOT NULL CHECK (user_type IN ('client', 'provider')),
  avatar_url TEXT,
  is_verified INTEGER DEFAULT 0,
  password_changed_at DATETIME,
  google_sub TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Provinces of Cuba
CREATE TABLE IF NOT EXISTS provinces (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  capital TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  zoom INTEGER DEFAULT 9,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Municipalities of Cuba
CREATE TABLE IF NOT EXISTS municipalities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (province_id) REFERENCES provinces(id) ON DELETE CASCADE
);

-- Service categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  description TEXT,
  parent_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Provider profiles
CREATE TABLE IF NOT EXISTS provider_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  business_name TEXT,
  description TEXT,
  province_id TEXT NOT NULL,
  municipality_id TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  whatsapp TEXT,
  telegram TEXT,
  email_contact TEXT,
  years_experience INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  subscription_plan TEXT DEFAULT 'free' CHECK (subscription_plan IN ('free', 'basic', 'pro', 'premium')),
  subscription_expires_at DATETIME,
  stripe_customer_id TEXT,
  contact_mode TEXT DEFAULT 'whatsapp' CHECK (contact_mode IN ('whatsapp', 'call', 'both')),
  kind TEXT DEFAULT 'oficio' CHECK (kind IN ('oficio', 'negocio')),
  horario TEXT,
  gallery TEXT, -- JSON: fotos del negocio
  agenda TEXT, -- JSON: días y horas en que acepta citas
  show_on_map INTEGER DEFAULT 0, -- el profesional eligió publicar su punto en el mapa
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (province_id) REFERENCES provinces(id),
  FOREIGN KEY (municipality_id) REFERENCES municipalities(id)
);

-- Provider services
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_min REAL,
  price_max REAL,
  price_type TEXT DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'hourly', 'daily', 'negotiable')),
  price_currency TEXT DEFAULT 'CUP' CHECK (price_currency IN ('CUP', 'USD')),
  images TEXT, -- JSON array of image URLs
  duration_min INTEGER, -- duración de la cita; NULL = la general de la agenda
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Service areas (which municipalities a provider serves)
CREATE TABLE IF NOT EXISTS service_areas (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  municipality_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE CASCADE,
  UNIQUE(provider_id, municipality_id)
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  service_id TEXT,
  client_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- SET NULL: borrar un servicio no puede borrar sus reseñas (se lavaría la valoración).
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'premium')),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired', 'past_due')),
  stripe_subscription_id TEXT,
  current_period_start DATETIME,
  current_period_end DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id TEXT,
  metadata TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

-- Conversations/Chat
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  service_id TEXT,
  last_message TEXT,
  last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'provider')),
  content TEXT NOT NULL,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
  UNIQUE(client_id, provider_id)
);

-- Fotos subidas (para cuota por usuario y para comprobar quién es el dueño)
CREATE TABLE IF NOT EXISTS uploads (
  name TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Citas agendadas (plan Profesional). provider_id = id del PERFIL. Las citas manuales (las apunta
-- el profesional) pueden no tener cliente con cuenta: llevan client_name / client_phone.
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  client_id TEXT,
  service_id TEXT,
  starts_at TEXT NOT NULL, -- ISO UTC
  ends_at TEXT NOT NULL, -- ISO UTC, fijado al reservar
  duration_min INTEGER NOT NULL,
  note TEXT,
  client_name TEXT,
  client_phone TEXT,
  origin TEXT NOT NULL DEFAULT 'online' CHECK (origin IN ('online', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done', 'no_show')),
  cancelled_by TEXT CHECK (cancelled_by IN ('client', 'provider')),
  rescheduled_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  FOREIGN KEY (rescheduled_from) REFERENCES appointments(id) ON DELETE SET NULL
);

-- Tiempo en que el profesional no acepta citas (almuerzo, un trámite, vacaciones).
CREATE TABLE IF NOT EXISTS agenda_blocks (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  starts_at TEXT NOT NULL, -- ISO UTC
  ends_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

-- Clientes con sesión que pulsaron WhatsApp o Llamar: sin chat, es la prueba de contacto para reseñar.
CREATE TABLE IF NOT EXISTS contacts (
  client_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  via TEXT NOT NULL CHECK (via IN ('whatsapp', 'call')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (client_id, provider_id, via),
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_agenda_blocks_provider ON agenda_blocks(provider_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_province ON provider_profiles(province_id);
CREATE INDEX IF NOT EXISTS idx_providers_active ON provider_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_subscription ON provider_profiles(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations(provider_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_service ON reviews(service_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_municipalities_province ON municipalities(province_id);
CREATE INDEX IF NOT EXISTS idx_favorites_client ON favorites(client_id);
CREATE INDEX IF NOT EXISTS idx_reviews_client_provider ON reviews(client_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at);
`;

// Migraciones de bases ya existentes (la de producción nació sin control de versión = 0).
// Una base nueva se crea directamente con `schema` y se marca con la última versión.
// Cada migración corre una sola vez, dentro de una transacción; nunca se edita una ya publicada.
const MIGRACIONES: ((d: typeof db) => void)[] = [
  // 1 — reviews.service_id pasa a admitir NULL con ON DELETE SET NULL. SQLite no permite
  //     cambiar una FK en sitio: se reconstruye la tabla.
  (d) => {
    d.exec(`
      CREATE TABLE reviews_v1 (
        id TEXT PRIMARY KEY,
        service_id TEXT,
        client_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
      );
      INSERT INTO reviews_v1 (id, service_id, client_id, provider_id, rating, comment, created_at)
        SELECT id, service_id, client_id, provider_id, rating, comment, created_at FROM reviews;
      DROP TABLE reviews;
      ALTER TABLE reviews_v1 RENAME TO reviews;
      CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews(provider_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_service ON reviews(service_id);
    `);
  },
  // 2 — fecha del último cambio de contraseña, para invalidar los tokens anteriores.
  (d) => {
    d.exec('ALTER TABLE users ADD COLUMN password_changed_at DATETIME');
  },
  // 3 — planes nuevos (Gratis / Básico / Profesional), login con Google, contacto por WhatsApp o
  //     llamada, negocio, galería, agenda y moneda del precio. Los precios anteriores eran en USD.
  (d) => {
    d.exec(`
      ALTER TABLE users ADD COLUMN google_sub TEXT;
      ALTER TABLE provider_profiles ADD COLUMN contact_mode TEXT DEFAULT 'whatsapp' CHECK (contact_mode IN ('whatsapp', 'call', 'both'));
      ALTER TABLE provider_profiles ADD COLUMN kind TEXT DEFAULT 'oficio' CHECK (kind IN ('oficio', 'negocio'));
      ALTER TABLE provider_profiles ADD COLUMN horario TEXT;
      ALTER TABLE provider_profiles ADD COLUMN gallery TEXT;
      ALTER TABLE provider_profiles ADD COLUMN agenda TEXT;
      ALTER TABLE provider_profiles ADD COLUMN show_on_map INTEGER DEFAULT 0;
      ALTER TABLE services ADD COLUMN price_currency TEXT DEFAULT 'CUP' CHECK (price_currency IN ('CUP', 'USD'));
      UPDATE services SET price_currency = 'USD';
      UPDATE provider_profiles SET subscription_plan = 'pro' WHERE subscription_plan = 'premium';
      UPDATE subscriptions SET plan = 'pro' WHERE plan = 'premium';
    `);
  },
  // 4 — agenda profesional: fin de la cita, citas manuales sin cuenta, "no vino", quién cancela y
  //     reprogramaciones; duración por servicio. La tabla agenda_blocks la crea `schema`.
  (d) => {
    d.exec('ALTER TABLE services ADD COLUMN duration_min INTEGER');
    // Las bases anteriores a la v3 no tenían appointments: la crea `schema` ya en su forma nueva.
    if (!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'appointments'").get()) return;
    d.exec(`
      CREATE TABLE appointments_v4 (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        client_id TEXT,
        service_id TEXT,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        duration_min INTEGER NOT NULL,
        note TEXT,
        client_name TEXT,
        client_phone TEXT,
        origin TEXT NOT NULL DEFAULT 'online' CHECK (origin IN ('online', 'manual')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done', 'no_show')),
        cancelled_by TEXT CHECK (cancelled_by IN ('client', 'provider')),
        rescheduled_from TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
        FOREIGN KEY (rescheduled_from) REFERENCES appointments(id) ON DELETE SET NULL
      );
      INSERT INTO appointments_v4 (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, status, created_at, updated_at)
        SELECT id, provider_id, client_id, service_id, starts_at,
          strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+' || duration_min || ' minutes'),
          duration_min, note, status, created_at, updated_at
        FROM appointments;
      DROP TABLE appointments;
      ALTER TABLE appointments_v4 RENAME TO appointments;
      CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id, starts_at);
      CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id, starts_at);
    `);
  },
];

export const ESQUEMA_VERSION = MIGRACIONES.length;

function migrar() {
  const actual = (db.pragma('user_version') as { user_version: number }[])[0].user_version;
  if (actual >= ESQUEMA_VERSION) return;
  // Reconstruir tablas exige las FK apagadas, y ese pragma no surte efecto dentro de una transacción.
  db.pragma('foreign_keys = OFF');
  try {
    for (let v = actual; v < ESQUEMA_VERSION; v++) {
      db.transaction(() => {
        MIGRACIONES[v](db);
        const rotas = db.pragma('foreign_key_check') as unknown[];
        if (rotas.length) throw new Error(`Migración ${v + 1}: ${rotas.length} referencias rotas`);
        db.pragma(`user_version = ${v + 1}`);
      })();
      console.log(`Base de datos migrada a la versión ${v + 1}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

export function initDatabase() {
  const existia = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get());
  if (existia) {
    migrar();
    db.exec(schema); // tablas e índices nuevos (CREATE ... IF NOT EXISTS)
  } else {
    db.exec(schema);
    db.pragma(`user_version = ${ESQUEMA_VERSION}`);
  }
  return db;
}

export const PLAN_WEIGHT_SQL = "CASE pp.subscription_plan WHEN 'premium' THEN 2 WHEN 'pro' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END";

export function planDelPerfil(providerId: string) {
  const row = db.prepare('SELECT subscription_plan FROM provider_profiles WHERE id = ?').get(providerId) as { subscription_plan: string } | undefined;
  return planDe(row?.subscription_plan);
}

export function parseImages(raw: unknown): string[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function providerProfileIdFor(userId: string): string | undefined {
  const row = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(userId) as { id: string } | undefined;
  return row?.id;
}

export function refreshProviderRating(providerId: string) {
  const stats = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE provider_id = ?')
    .get(providerId) as { avg_rating: number | null; count: number };
  db.prepare('UPDATE provider_profiles SET rating = ?, review_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(stats.avg_rating ? Math.round(stats.avg_rating * 10) / 10 : 0, stats.count, providerId);
}

// Deja activos como máximo los servicios que permite el plan actual: se conservan los más
// antiguos y el resto se pausa (el proveedor puede elegir cuáles pausando y reactivando).
export function enforcePlanLimit(providerId: string) {
  const row = db.prepare('SELECT subscription_plan FROM provider_profiles WHERE id = ?').get(providerId) as { subscription_plan: string } | undefined;
  if (!row) return;
  const max = planDe(row.subscription_plan).maxServices;
  if (max === null) return;
  db.prepare(`
    UPDATE services SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (SELECT id FROM services WHERE provider_id = ? AND is_active = 1 ORDER BY created_at, id LIMIT -1 OFFSET ?)
  `).run(providerId, max);
}

export function expireSubscriptions() {
  const now = new Date().toISOString();
  const vencidos = db.prepare(`
    SELECT id FROM provider_profiles
    WHERE subscription_plan != 'free' AND subscription_expires_at IS NOT NULL AND subscription_expires_at < ?
  `).all(now) as { id: string }[];
  db.transaction(() => {
    for (const { id } of vencidos) {
      db.prepare("UPDATE provider_profiles SET subscription_plan = 'free', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      enforcePlanLimit(id);
    }
    db.prepare("UPDATE subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE status = 'active' AND current_period_end < ?")
      .run(now);
  })();
}

export function getDb() {
  return db;
}

export default db;