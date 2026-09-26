export type UserType = 'client' | 'provider';
export type Plan = 'free' | 'basic' | 'pro';
export type PriceType = 'fixed' | 'hourly' | 'daily' | 'negotiable';
export type Currency = 'CUP' | 'USD';
export type ContactMode = 'whatsapp' | 'call' | 'both';
export type ProviderKind = 'oficio' | 'negocio';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  user_type: UserType;
  avatar_url?: string | null;
  is_verified: boolean;
  /** Entró con Google (o con el Google simulado de la demo). */
  google?: boolean;
  has_password?: boolean;
  created_at?: string;
  /** Solo viene (true) para administradores del panel técnico. */
  is_admin?: boolean;
}

export interface Province {
  id: string;
  name: string;
  capital: string;
  lat: number;
  lng: number;
  zoom: number;
}

export interface Municipality {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description?: string;
  parent_id?: string | null;
  sort_order: number;
  subcategories?: Category[];
}

export interface CategoryStat {
  id: string;
  name: string;
  slug: string;
  icon: string;
  service_count: number;
  provider_count: number;
}

export interface SiteStats {
  providers: number;
  services: number;
  provinces: number;
  reviews: number;
  avg_rating: number | null;
}

/** Fila de listado (búsqueda, relacionados, mis servicios). */
export interface ServiceSummary {
  id: string;
  title: string;
  description?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  price_type: PriceType;
  price_currency: Currency;
  cover: string | null;
  image_count: number;
  /** Duración de la cita para este servicio; null = la general de la agenda. */
  duration_min?: number | null;
  is_active: boolean;
  created_at: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  category_slug: string;
  parent_category_name?: string | null;
  parent_category_slug?: string | null;
  provider_id: string;
  business_name?: string | null;
  owner_name: string;
  avatar_url?: string | null;
  rating: number;
  review_count: number;
  subscription_plan: Plan;
  kind: ProviderKind;
  contact_mode: ContactMode;
  has_chat: boolean;
  has_agenda: boolean;
  province_name?: string | null;
  municipality_name?: string | null;
}

export interface ServiceDetail extends Omit<ServiceSummary, 'cover' | 'image_count'> {
  images: string[];
  provider_description?: string | null;
  province_id: string;
  municipality_id?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  whatsapp?: string | null;
  telegram?: string | null;
  email_contact?: string | null;
  years_experience: number;
  horario?: string | null;
  is_owner: boolean;
}

export interface ProviderCard {
  id: string;
  business_name?: string | null;
  description?: string | null;
  province_id: string;
  municipality_id?: string | null;
  years_experience: number;
  rating: number;
  review_count: number;
  subscription_plan: Plan;
  created_at: string;
  province_name?: string | null;
  municipality_name?: string | null;
  owner_name: string;
  avatar_url?: string | null;
  service_count: number;
  categories: string[];
  cover: string | null;
  kind: ProviderKind;
  contact_mode: ContactMode;
  has_chat: boolean;
  has_agenda: boolean;
}

export interface ProviderPublic extends ProviderCard {
  address?: string | null;
  /** Solo si el profesional eligió mostrar su punto en el mapa. */
  lat?: number | null;
  lng?: number | null;
  gallery: string[];
  horario?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  email_contact?: string | null;
}

export interface ProviderServiceItem {
  id: string;
  title: string;
  description?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  price_type: PriceType;
  price_currency: Currency;
  cover: string | null;
  category_name: string;
  category_icon: string;
  category_slug: string;
  created_at: string;
}

export interface MyProviderProfile {
  id: string;
  user_id: string;
  business_name?: string | null;
  description?: string | null;
  province_id: string;
  municipality_id?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  whatsapp?: string | null;
  telegram?: string | null;
  email_contact?: string | null;
  years_experience: number;
  rating: number;
  review_count: number;
  subscription_plan: Plan;
  subscription_expires_at?: string | null;
  province_name?: string | null;
  municipality_name?: string | null;
  owner_name?: string;
  avatar_url?: string | null;
  contact_mode: ContactMode;
  kind: ProviderKind;
  horario?: string | null;
  gallery: string[];
  show_on_map: number;
}

/** Límites y ventajas del plan (config.ts del backend). */
export interface PlanLimits {
  name: string;
  price: number;
  maxServices: number | null;
  maxPhotos: number;
  chat: boolean;
  agenda: boolean;
  negocio: boolean;
  pos: boolean;
  features: string[];
}

export interface Tramo { desde: string; hasta: string }

/** Configuración de la agenda (formato 2). `semana[0]` = domingo. Horas de pared en Cuba. */
export interface Agenda {
  v: 2;
  semana: Tramo[][];
  excepciones: { fecha: string; tramos: Tramo[] }[];
  duracion: number;
  intervalo: 15 | 30 | 60;
  margen_antes: number;
  margen_despues: number;
  antelacion_min: number;
  horizonte_dias: number;
  max_por_dia: number | null;
  confirmacion: 'manual' | 'auto';
  cancelacion_horas: number;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'done' | 'no_show';

export interface Appointment {
  id: string;
  provider_id: string;
  /** null en las citas que apunta el profesional para alguien sin cuenta. */
  client_id: string | null;
  service_id?: string | null;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  note?: string | null;
  status: AppointmentStatus;
  origin: 'online' | 'manual';
  cancelled_by?: 'client' | 'provider' | null;
  rescheduled_from?: string | null;
  created_at: string;
  provider_name: string;
  provider_avatar?: string | null;
  client_name: string;
  client_avatar?: string | null;
  service_title?: string | null;
  /** Solo lo recibe el profesional. */
  client_phone?: string | null;
  /** Solo el profesional: veces que este cliente no vino a sus citas. */
  no_shows?: number;
  /** Solo el cliente. */
  provider_whatsapp?: string | null;
  cancel_until?: string;
  can_change?: boolean;
}

export interface AgendaBlock { id: string; starts_at: string; ends_at: string; note?: string | null }

export interface CalendarDay { date: string; excepcion: boolean; tramos: { inicio: string; fin: string }[] }

export interface CalendarData {
  zona: string;
  enabled: boolean;
  agenda: Agenda;
  dias: CalendarDay[];
  appointments: Appointment[];
  blocks: AgendaBlock[];
}

export interface BookableService {
  id: string;
  title: string;
  duration_min: number;
  price_min: number | null;
  price_max: number | null;
  price_type: PriceType;
  price_currency: Currency;
}

export interface SlotsResponse {
  zona: string;
  duracion: number;
  confirmacion: 'manual' | 'auto';
  cancelacion_horas: number;
  horizonte_dias: number;
  servicios: BookableService[];
  days: { date: string; slots: string[] }[];
}

export interface Tasa {
  usd: number;
  updated_at: string | null;
  fuente: string;
}

export interface ServiceArea {
  id: string;
  municipality_id: string;
  municipality_name: string;
  province_name: string;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
  client_name: string;
  client_avatar?: string | null;
  service_title?: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  provider_id: string;
  service_id?: string | null;
  last_message?: string | null;
  last_message_at: string;
  created_at: string;
  provider_name: string;
  provider_avatar?: string | null;
  client_name: string;
  client_avatar?: string | null;
  service_title?: string | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  sender_id: string;
  sender_type: UserType;
  content: string;
  read_at?: string | null;
  created_at: string;
}

export type PlanInfo = PlanLimits;

export interface Subscription {
  id: string;
  plan: Exclude<Plan, 'free'>;
  amount: number;
  status: 'pending' | 'active' | 'cancelled' | 'expired' | 'past_due';
  current_period_start: string;
  current_period_end: string;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  created_at: string;
  plan: Plan;
}

export interface Favorite {
  id: string;
  provider_id: string;
  business_name?: string | null;
  description?: string | null;
  rating: number;
  review_count: number;
  subscription_plan: Plan;
  province_name?: string | null;
  municipality_name?: string | null;
  owner_name: string;
  avatar_url?: string | null;
  service_count: number;
  cover: string | null;
  created_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type CatalogPriceType = 'fixed' | 'from' | 'ask';

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  /** null si price_type es 'ask' (a consultar). */
  price: number | null;
  price_type: CatalogPriceType;
  price_currency: Currency;
  image: string | null;
  section: string | null;
  available: boolean;
  created_at: string;
}

export interface CatalogInput {
  name: string;
  description?: string | null;
  price?: number | null;
  price_type: CatalogPriceType;
  price_currency: Currency;
  image?: string | null;
  section?: string | null;
  available: boolean;
}

export interface CatalogPage {
  items: CatalogItem[];
  sections: { name: string; count: number }[];
  /** Con el filtro aplicado. */
  total: number;
  /** Sin filtros: si es 0 el perfil no enseña la sección. */
  total_all: number;
  page: number;
  pages: number;
}

export interface CatalogSearchItem extends CatalogItem {
  provider_id: string;
  provider_name: string;
  provider_avatar: string | null;
  subscription_plan: Plan;
  contact_mode: ContactMode;
  whatsapp: string | null;
  province_name: string | null;
  municipality_name: string | null;
}

export interface CatalogSearchPage { items: CatalogSearchItem[]; total: number; page: number; pages: number }

export type TelegramGroupId = 'citas' | 'recordatorios' | 'chat' | 'resenas' | 'plan';

export interface TelegramStatus {
  /** El notificador está en marcha y el bot tiene usuario. */
  available: boolean;
  bot_username: string | null;
  linked: boolean;
  linked_at: string | null;
  prefs: Record<TelegramGroupId, boolean>;
  /** Solo los grupos que aplican al tipo de cuenta. */
  groups: { id: TelegramGroupId; label: string; description: string }[];
}

export interface AdminSession { admin_token: string; expires_at: string }

export interface AdminSystem {
  schema_version: number;
  schema_expected: number;
  demo_mode: boolean;
  node: string;
  uptime_s: number;
  db_bytes: number;
  uploads: { files: number; bytes: number };
  disk: { free_bytes: number; total_bytes: number };
  counts: {
    users: number; clients: number; providers_free: number; providers_basic: number; providers_pro: number;
    services: number; catalog_items: number; appointments_upcoming: number; pending_payments: number;
  };
}

export interface AdminTelegram {
  token: { configured: boolean; hint: string | null; updated_at: string | null; error: string | null };
  notifier: { key_fingerprint: string | null; heartbeat: string | null; alive: boolean; bot_username: string | null };
  linked_users: number;
  last7d: Partial<Record<'pending' | 'sent' | 'failed' | 'skipped', number>>;
  recent_errors: { kind: string; status: string; last_error: string | null; attempts: number; created_at: string }[];
}

export interface AdminAuditEntry { action: string; detail: string | null; ip: string | null; created_at: string; email: string | null }
