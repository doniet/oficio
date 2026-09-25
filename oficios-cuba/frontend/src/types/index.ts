export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  user_type: 'client' | 'provider';
  avatar_url?: string;
  is_verified: boolean;
  created_at: string;
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
  province_id: string;
  lat: number;
  lng: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  parent_id?: string;
  sort_order: number;
  subcategories?: Category[];
}

export interface ProviderProfile {
  id: string;
  user_id: string;
  business_name?: string;
  description?: string;
  province_id: string;
  municipality_id?: string;
  address?: string;
  lat?: number;
  lng?: number;
  whatsapp?: string;
  telegram?: string;
  email_contact?: string;
  years_experience: number;
  rating: number;
  review_count: number;
  is_active: boolean;
  subscription_plan: 'free' | 'basic' | 'pro' | 'premium';
  subscription_expires_at?: string;
  province_name?: string;
  municipality_name?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  avatar_url?: string;
  service_areas?: ServiceArea[];
}

export interface ServiceArea {
  id: string;
  provider_id: string;
  municipality_id: string;
  municipality_name?: string;
  province_name?: string;
}

export interface Service {
  id: string;
  provider_id: string;
  category_id: string;
  title: string;
  description?: string;
  price_min?: number;
  price_max?: number;
  price_type: 'fixed' | 'hourly' | 'daily' | 'negotiable';
  images: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_icon?: string;
  category_slug?: string;
  provider_business_name?: string;
  provider_rating?: number;
  provider_review_count?: number;
  provider_subscription_plan?: string;
  province_name?: string;
  municipality_name?: string;
}

export interface Review {
  id: string;
  service_id: string;
  client_id: string;
  provider_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  client_name?: string;
  client_avatar?: string;
  service_title?: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  provider_id: string;
  service_id?: string;
  last_message?: string;
  last_message_at: string;
  created_at: string;
  provider_name?: string;
  provider_avatar?: string;
  client_name?: string;
  client_avatar?: string;
  service_title?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'client' | 'provider';
  content: string;
  read_at?: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

export interface Subscription {
  id: string;
  provider_id: string;
  plan: 'basic' | 'pro' | 'premium';
  amount: number;
  currency: string;
  status: 'pending' | 'active' | 'cancelled' | 'expired' | 'past_due';
  current_period_start: string;
  current_period_end: string;
}

export interface Payment {
  id: string;
  subscription_id: string;
  provider_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  created_at: string;
}

export interface Favorite {
  id: string;
  client_id: string;
  provider_id: string;
  created_at: string;
  provider?: ProviderProfile;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  details?: Array<{ field: string; message: string }>;
}

export type MapCoordinates = [number, number];