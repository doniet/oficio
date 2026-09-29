CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- lo exige EXCLUDE con provider_id WITH =
CREATE EXTENSION IF NOT EXISTS unaccent;  -- para que "jabon" encuentre "jabón" en la búsqueda por tsvector

-- unaccent() es STABLE, no IMMUTABLE (depende del search_path para resolver el diccionario), y
-- Postgres rechaza una columna GENERATED ... STORED cuya expresión no sea inmutable ("generation
-- expression is not immutable"). Este envoltorio fija el diccionario por su nombre calificado
-- (nunca cambia en ejecución), así que sí es seguro declararlo IMMUTABLE. Solo hace falta para las
-- columnas `busca` de abajo; las consultas (lib/buscador.ts) siguen usando unaccent() a secas.
CREATE OR REPLACE FUNCTION inmutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
  $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Users table (both clients and providers)
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  phone text,
  user_type text NOT NULL CHECK (user_type IN ('client', 'provider')),
  avatar_url text,
  is_verified boolean NOT NULL DEFAULT false,
  password_changed_at timestamptz,
  google_sub text,
  telegram_chat_id text, -- chat privado con el bot (lo escribe oficio_notifier al vincular)
  telegram_linked_at timestamptz,
  notify_prefs jsonb, -- JSON {grupo: false} con los avisos que el usuario apagó
  is_admin boolean NOT NULL DEFAULT false, -- solo se da desde el servidor: npm run admin -- dar <email>
  totp_secret text, -- 2FA del panel de administración (base32)
  totp_enabled_at timestamptz,
  totp_last_step integer, -- último paso TOTP aceptado: un código no vale dos veces
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Búsqueda por el nombre de la persona (routes/providers.ts, mapa.ts pestaña Negocios): el
-- LIKE original de esas dos rutas también buscaba en el nombre del dueño, no solo en el del
-- negocio — sin esta columna, buscar a alguien por su nombre dejaría de encontrar su perfil.
ALTER TABLE users ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', inmutable_unaccent(regexp_replace(coalesce(full_name, ''), '/', ' ', 'g')))
  ) STORED;
CREATE INDEX idx_users_busca ON users USING GIN (busca);

-- Provinces of Cuba
CREATE TABLE provinces (
  id uuid PRIMARY KEY,
  name text UNIQUE NOT NULL,
  capital text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  zoom integer NOT NULL DEFAULT 9,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Municipalities of Cuba
CREATE TABLE municipalities (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  province_id uuid NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Service categories
CREATE TABLE categories (
  id uuid PRIMARY KEY,
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  icon text,
  description text,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Búsqueda por nombre de categoría (routes/services.ts, mapa.ts pestaña Servicios): el LIKE
-- original buscaba también en el nombre de la categoría del oficio y en el de su categoría
-- padre — se cubre uniendo services.category_id -> categories dos veces (c y su parent), cada
-- una comparada contra esta columna.
--
-- regexp_replace(..., '/', ' ', 'g'): varias categorías se llaman "Fontanería/Plomería",
-- "Fotografía/Video", etc. El parser de texto de Postgres reconoce "palabra/palabra" (sin
-- espacios) como un token de tipo "file" (ruta de archivo) y lo manda ENTERO al diccionario
-- `simple`, sin partirlo ni pasarlo por el stemmer español — buscar "video" no encontraría
-- "Fotografía/Video" (sí lo encontraría un LIKE, porque para un LIKE es solo texto). Cambiar la
-- "/" por un espacio ANTES de tokenizar hace que se indexen "fotografia" y "video" por separado,
-- como si el nombre llevara un espacio. Verificado con ts_debug(): un guion sí se indexa bien
-- solo ("Post-Obra" da 'post', 'obra' Y 'post-obr'), la barra no.
ALTER TABLE categories ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', inmutable_unaccent(regexp_replace(coalesce(name, ''), '/', ' ', 'g')))
  ) STORED;
CREATE INDEX idx_categories_busca ON categories USING GIN (busca);

-- Provider profiles
CREATE TABLE provider_profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name text,
  description text,
  province_id uuid NOT NULL REFERENCES provinces(id),
  municipality_id uuid REFERENCES municipalities(id),
  address text,
  lat double precision,
  lng double precision,
  whatsapp text,
  telegram text,
  email_contact text,
  years_experience integer NOT NULL DEFAULT 0,
  rating real NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  subscription_plan text NOT NULL DEFAULT 'free'
    CHECK (subscription_plan IN ('free', 'basic', 'pro')),
  subscription_expires_at timestamptz,
  contact_mode text NOT NULL DEFAULT 'whatsapp'
    CHECK (contact_mode IN ('whatsapp', 'call', 'both')),
  kind text NOT NULL DEFAULT 'oficio' CHECK (kind IN ('oficio', 'negocio')),
  horario text,
  gallery jsonb,
  agenda jsonb,
  show_on_map boolean NOT NULL DEFAULT false,
  map_precision text NOT NULL DEFAULT 'exacta'
    CHECK (map_precision IN ('exacta', 'zona')),
  -- La coordenada que se publica. Para 'exacta' es la misma; para 'zona', un punto
  -- desplazado 100-300 m que sortea desplazar() en lib/ubicacion.ts UNA vez al
  -- establecerla. Se guarda en vez de calcularse al servir porque, sorteándola cada
  -- vez, promediando se recupera la verdadera. PostGIS indexa este valor; no lo genera.
  punto_pub geography(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_punto_pub ON provider_profiles USING gist (punto_pub);
CREATE INDEX idx_pp_province ON provider_profiles (province_id);
CREATE INDEX idx_pp_active ON provider_profiles (is_active);
CREATE INDEX idx_pp_plan ON provider_profiles (subscription_plan);

-- Búsqueda de negocios/oficios por nombre y descripción (routes/providers.ts, mapa.ts pestaña
-- Negocios). GENERATED ... STORED: se mantiene sola, nadie tiene que acordarse de actualizarla.
ALTER TABLE provider_profiles ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', inmutable_unaccent(regexp_replace(coalesce(business_name, '') || ' ' || coalesce(description, ''), '/', ' ', 'g')))
  ) STORED;
CREATE INDEX idx_pp_busca ON provider_profiles USING GIN (busca);

-- Provider services
CREATE TABLE services (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  title text NOT NULL,
  description text,
  price_min real,
  price_max real,
  price_type text NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'hourly', 'daily', 'negotiable')),
  price_currency text NOT NULL DEFAULT 'CUP' CHECK (price_currency IN ('CUP', 'USD')),
  images jsonb, -- JSON array of image URLs
  price_list jsonb, -- lista de precios renglón a renglón [{ name, price }] (Básico y Profesional)
  duration_min integer, -- duración de la cita; NULL = la general de la agenda
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_provider ON services (provider_id);
CREATE INDEX idx_services_category ON services (category_id);
CREATE INDEX idx_services_active ON services (is_active);

-- Búsqueda de oficios por título y descripción (routes/services.ts, mapa.ts pestaña Servicios).
ALTER TABLE services ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', inmutable_unaccent(regexp_replace(coalesce(title, '') || ' ' || coalesce(description, ''), '/', ' ', 'g')))
  ) STORED;
CREATE INDEX idx_s_busca ON services USING GIN (busca);

-- Service areas (which municipalities a provider serves)
CREATE TABLE service_areas (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  municipality_id uuid NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, municipality_id)
);

-- Reviews
CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Es el id del PERFIL, no del usuario. El nombre lo dice ahora.
  provider_profile_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_provider ON reviews (provider_profile_id);
CREATE INDEX idx_reviews_service ON reviews (service_id);
CREATE INDEX idx_reviews_client_provider ON reviews (client_id, provider_profile_id);

-- Subscriptions
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('basic', 'pro')),
  amount real NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired', 'past_due')),
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payments
CREATE TABLE payments (
  id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  amount real NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Conversations/Chat
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Es el id del PERFIL, no del usuario. El nombre lo dice ahora.
  provider_profile_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  last_message text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_client ON conversations (client_id);
CREATE INDEX idx_conversations_provider ON conversations (provider_profile_id);

-- Messages
CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('client', 'provider')),
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

-- Favorites
CREATE TABLE favorites (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, provider_id)
);

CREATE INDEX idx_favorites_client ON favorites (client_id);

-- Fotos subidas (para cuota por usuario y para comprobar quién es el dueño)
CREATE TABLE uploads (
  name text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text, -- 'catalog' = foto de un artículo del catálogo (cuota propia); NULL = el resto
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_uploads_user ON uploads (user_id, created_at);
CREATE INDEX idx_uploads_purpose ON uploads (user_id, purpose, created_at);

-- Citas agendadas (plan Profesional). provider_id = id del PERFIL. Las citas manuales (las apunta
-- el profesional) pueden no tener cliente con cuenta: llevan client_name / client_phone.
CREATE TABLE appointments (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES users(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- Redundante con ends_at - starts_at (se guarda igual: services.duration_min y toda la lectura
  -- de la agenda lo esperan como columna, no como cálculo). Nullable porque el resto de la fila
  -- ya fija la duración real; nada en la v1 depende de que venga siempre.
  duration_min integer,
  note text,
  client_name text,
  client_phone text,
  origin text NOT NULL DEFAULT 'online' CHECK (origin IN ('online', 'manual')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done', 'no_show')),
  cancelled_by text CHECK (cancelled_by IN ('client', 'provider')),
  -- Id de la cita anterior cuando esta nació de una reprogramación (routes/appointments.ts:
  -- reprogramar = cancelar + crear otra enlazada). No es una fecha: es una referencia a sí misma.
  rescheduled_from uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Una cita que el profesional creó a sabiendas de que se solapa (reintento con `forzar`).
  -- La restricción EXCLUDE de abajo la ignora: si no, la base impediría una función del
  -- producto, no solo la carrera que la restricción existe para cerrar.
  forzada boolean NOT NULL DEFAULT false,
  CHECK (ends_at > starts_at),
  -- La base deja de admitir estructuralmente dos citas solapadas del mismo
  -- profesional, salvo que el profesional la haya forzado a sabiendas
  -- (forzada = true, fuera del índice). Antes esto dependía de revalidar el
  -- solape dentro de la transacción, que con READ COMMITTED no basta: dos
  -- clientes concurrentes pueden leer los dos "libre" e insertar los dos.
  EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled' AND NOT forzada)
);

CREATE INDEX idx_appointments_provider ON appointments (provider_id, starts_at);
CREATE INDEX idx_appointments_client ON appointments (client_id, starts_at);

-- Catálogo de productos o servicios de un profesional (Básico 50, Profesional 1000).
-- hidden_by_plan: pasa del límite del plan actual; vuelve a verse si sube de plan.
CREATE TABLE catalog_items (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price real,
  price_type text NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'from', 'ask')),
  price_currency text NOT NULL DEFAULT 'CUP' CHECK (price_currency IN ('CUP', 'USD')),
  image text,
  section text,
  available boolean NOT NULL DEFAULT true,
  hidden_by_plan boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz
);

CREATE INDEX idx_catalog_provider ON catalog_items (provider_id, section, name);

-- Búsqueda de artículos por nombre, descripción y sección (routes/catalog.ts, mapa.ts pestaña
-- Productos).
ALTER TABLE catalog_items ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish',
      inmutable_unaccent(regexp_replace(coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(section, ''), '/', ' ', 'g'))
    )
  ) STORED;
CREATE INDEX idx_ci_busca ON catalog_items USING GIN (busca);

-- Avisos por Telegram. La API solo los apunta aquí (no tiene salida a internet); los envía
-- oficio_notifier, el único contenedor con el token del bot. dedupe_key evita repetir avisos
-- programados (recordatorios, vencimiento del plan) y agrupa los del chat.
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  text text NOT NULL,
  url text,
  dedupe_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  send_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  sent_at timestamptz
);

CREATE INDEX idx_notifications_pending ON notifications (status, send_after);

-- Códigos de un solo uso para vincular Telegram (t.me/<bot>?start=<código>). Se guarda el hash.
CREATE TABLE telegram_link_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Registro de lo que se hace en el panel de administración.
CREATE TABLE admin_audit (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text,
  ip text,
  created_at timestamptz NOT NULL
);

CREATE INDEX idx_admin_audit_fecha ON admin_audit (created_at);

-- Estado del bot que escribe oficio_notifier: usuario del bot, offset de getUpdates, latido.
CREATE TABLE telegram_state (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- Tiempo en que el profesional no acepta citas (almuerzo, un trámite, vacaciones).
CREATE TABLE agenda_blocks (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  note text,
  created_at timestamptz NOT NULL
);

CREATE INDEX idx_agenda_blocks_provider ON agenda_blocks (provider_id, starts_at);

-- Clientes con sesión que pulsaron WhatsApp o Llamar: sin chat, es la prueba de contacto para reseñar.
CREATE TABLE contacts (
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  via text NOT NULL CHECK (via IN ('whatsapp', 'call')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (client_id, provider_id, via)
);

-- Dispositivos para notificaciones push (un token pertenece a un solo usuario)
CREATE TABLE push_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('fcm')),
  token text NOT NULL,
  plataforma text NOT NULL CHECK (plataforma IN ('android', 'ios')),
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canal, token)
);

CREATE INDEX idx_push_devices_user ON push_devices (user_id);

-- Bandeja de avisos push: la API apunta una fila por dispositivo (no tiene salida a internet) y
-- oficio_notifier la envía por FCM. user_id = dueño del dispositivo AL APUNTAR: si el teléfono pasa
-- a otra cuenta antes del envío, el aviso no se manda (llevaba nombres de la cuenta anterior).
CREATE TABLE push_outbox (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  cuerpo text NOT NULL,
  datos jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  send_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  sent_at timestamptz
);

CREATE INDEX idx_push_outbox_pendientes ON push_outbox (status, send_after);

-- Descargas del APK desde la web (/api/app/descargar). visitante = hash con sal de la IP: nunca la IP.
CREATE TABLE apk_descargas (
  id uuid PRIMARY KEY,
  version text NOT NULL,
  visitante text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX idx_apk_descargas ON apk_descargas (visitante, version, created_at);

-- Índices restantes que no van pegados a la tabla arriba.
-- Como en SQLite, un índice UNIQUE de Postgres no compara los NULL entre sí: varios usuarios
-- sin Google o sin Telegram conviven sin chocar.
CREATE UNIQUE INDEX idx_users_google_sub ON users (google_sub);
CREATE UNIQUE INDEX idx_users_telegram ON users (telegram_chat_id);
CREATE INDEX idx_categories_parent ON categories (parent_id);
CREATE INDEX idx_municipalities_province ON municipalities (province_id);
