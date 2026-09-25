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

export interface Agenda {
  dias: number[];
  desde: string;
  hasta: string;
  duracion: number;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'done';

export interface Appointment {
  id: string;
  provider_id: string;
  client_id: string;
  service_id?: string | null;
  starts_at: string;
  duration_min: number;
  note?: string | null;
  status: AppointmentStatus;
  created_at: string;
  provider_name: string;
  provider_avatar?: string | null;
  client_name: string;
  client_avatar?: string | null;
  /** Solo lo recibe el profesional. */
  client_phone?: string | null;
  service_title?: string | null;
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
