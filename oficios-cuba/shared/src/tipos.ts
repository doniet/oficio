export type UserType = 'client' | 'provider';
export type Plan = 'free' | 'basic' | 'pro' | 'premium';
export type PriceType = 'fixed' | 'hourly' | 'daily' | 'negotiable';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  user_type: UserType;
  avatar_url?: string | null;
  is_verified: boolean;
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
  province_name?: string | null;
  municipality_name?: string | null;
}

export interface ServiceDetail extends Omit<ServiceSummary, 'cover' | 'image_count'> {
  images: string[];
  provider_description?: string | null;
  province_id: string;
  municipality_id?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  email_contact?: string | null;
  years_experience: number;
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
}

export interface ProviderPublic extends ProviderCard {
  address?: string | null;
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
  cover: string | null;
  category_name: string;
  category_icon: string;
  category_slug: string;
  created_at: string;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
  client_name: string;
  client_avatar?: string | null;
  service_title?: string | null;
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

export interface PlanInfo {
  name: string;
  price: number;
  maxServices: number | null;
  features: string[];
}

export interface PaginaServicios { services: ServiceSummary[]; pagination: Pagination }
export interface SesionUsuario { token: string; user: User }
export type CanalPush = 'fcm';
export interface DispositivoPush { canal: CanalPush; token: string; plataforma: 'android' | 'ios'; app_version: string }
