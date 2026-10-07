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
  sort_order?: number;
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
  /** Plan Profesional: se le puede escribir por el chat. Si no, WhatsApp o llamada. */
  has_chat: boolean;
  has_agenda: boolean;
  province_name?: string | null;
  municipality_name?: string | null;
}

/** Un renglón de la lista de precios de un oficio, en la moneda del oficio. */
export interface PriceRow {
  name: string;
  price: number;
}

export interface ServiceDetail extends Omit<ServiceSummary, 'cover' | 'image_count'> {
  images: string[];
  /** Lista de precios renglón a renglón (planes Básico y Profesional). */
  price_list: PriceRow[];
  provider_description?: string | null;
  province_id: string;
  municipality_id?: string | null;
  address?: string | null;
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
  whatsapp?: string | null;
  telegram?: string | null;
  email_contact?: string | null;
  /** Solo viene si el perfil es un negocio (routes/providers.ts, GET /providers/:id). */
  horario?: string | null;
  gallery: string[];
  /**
   * Solo vienen si el profesional marcó `show_on_map`. Y aun así NO son la coordenada guardada:
   * es el punto PUBLICADO (`lib/ubicacion.ts`), desplazado 100-300 m al azar cuando la precisión
   * es `zona`. Nunca el real.
   */
  lat?: number;
  lng?: number;
}

/** Una zona de servicio del proveedor, tal como la arma `serviceAreasOf` (routes/providers.ts). */
export interface ProviderServiceArea {
  id: string;
  municipality_id: string;
  municipality_name: string;
  province_name: string;
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

export type PuntoMapa = {
  id: string;
  tipo: 'oficio' | 'negocio';
  nombre: string;
  /** La coordenada PUBLICADA. Para un perfil aproximado no es la suya: está a 100-300 m. */
  lat: number;
  lng: number;
  plan: 'pro' | 'basic' | 'free';
  /** El dueño pidió que su punto salga aproximado. Es una preferencia, no una ubicación. */
  aproximado: boolean;
  detras: number;
  /** Índices de la celda, tal como los calculó el SERVIDOR. Se reenvían a /mapa/celda sin tocar:
   *  recalcularlos en el cliente sería definir el mismo número en dos sitios. */
  cy: number;
  cx: number;
  resumen: string;
};

export type MapaRespuesta = { puntos: PuntoMapa[]; celda: number; hay_mas: boolean };

/** El área que se dibuja alrededor de un punto aproximado: el negocio está dentro. */
export const RADIO_APROX_M = 300;

/**
 * Debajo de este tamaño de celda, un punto aproximado deja de dibujarse como pin y pasa a área.
 * Sale de la geometría, no del gusto: la celda mide `min(alto,ancho)/5` del rectángulo visible,
 * o sea 1/5 del lado corto de la pantalla a cualquier zoom, y por debajo de 0,0054° (≈600 m, el
 * diámetro del área) los círculos de celdas vecinas se solapan por fuerza. Con el lado corto
 * abarcando menos de ~3 km, el mapa cambia de modo. Se autoajusta al dispositivo: en un móvil
 * salta un zoom antes que en una pantalla ancha, porque allí la celda mide más.
 */
export const ZONA_DESDE_GRADOS = 0.0054;
export type Bbox = { sur: number; oeste: number; norte: number; este: number };

// Copiados letra por letra de frontend/src/types/index.ts:401-437. CatalogInput,
// CatalogSearchItem y CatalogSearchPage NO se copian: son de escritura y de la búsqueda general,
// y la app no hace ninguna de las dos.

/** NO es el PriceType de servicios (línea 3): son dos uniones distintas con un miembro común. */
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
  /** 'dardoventas' = importado del punto de venta: no se edita a mano. Ausente en servidores viejos. */
  origen?: 'propio' | 'dardoventas';
  /** false = su precio no se convierte a la otra moneda (el CUP del POS sale de la tasa del negocio). */
  convertible?: boolean;
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
