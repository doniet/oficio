import axios, { AxiosError } from 'axios';
import type { Agenda, AgendaBlock, CatalogInput, CatalogItem, CatalogPage, CatalogSearchPage, Appointment, AppointmentStatus, CalendarData, Currency, PriceType, SlotsResponse, Tasa, TelegramGroupId, TelegramStatus, UserType } from '../types';

const TOKEN_KEY = 'oc_token';

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* modo privado */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* modo privado */ }
  },
};

const api = axios.create({ baseURL: '/api', timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// El proveedor de auth escucha este evento para cerrar sesión sin recargar la página.
api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      window.dispatchEvent(new Event('oc:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export function apiError(err: unknown, fallback = 'Algo salió mal. Inténtalo de nuevo.'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Sin conexión con el servidor. Revisa tu internet.';
    const data = err.response.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  return fallback;
}

export interface ServiceInput {
  category_id: string;
  title: string;
  description?: string;
  price_min?: number | null;
  price_max?: number | null;
  price_type: PriceType;
  price_currency: Currency;
  images: string[];
  /** Duración de la cita en la agenda; null = la general. */
  duration_min?: number | null;
}

export type GoogleLogin =
  | { mode: 'demo'; email: string; full_name: string; user_type?: UserType }
  | { mode: 'google'; id_token: string; nonce: string; user_type?: UserType };

export const authApi = {
  register: (data: { email: string; password: string; full_name: string; phone?: string; user_type: UserType }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  /** 200 {token,user} | 201 {token,user,is_new} | 200 {needs_user_type,email,full_name} */
  google: (data: GoogleLogin) => api.post('/auth/google', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { full_name?: string; phone?: string; avatar_url?: string }) => api.put('/auth/profile', data),
  updatePassword: (data: { current_password: string; new_password: string }) => api.put('/auth/password', data),
};

export const configApi = {
  get: () => api.get<{ demo: boolean; google: 'real' | 'demo' | null; google_client_id: string | null }>('/config'),
};

export const tasaApi = {
  get: () => api.get<Tasa>('/tasas'),
};

export const appointmentApi = {
  slots: (providerId: string, serviceId?: string) =>
    api.get<SlotsResponse>(`/appointments/provider/${providerId}/slots`, { params: serviceId ? { service_id: serviceId } : undefined }),
  mine: () => api.get<{ appointments: Appointment[] }>('/appointments/mine'),
  create: (data: { provider_id: string; service_id?: string; starts_at: string; note?: string }) =>
    api.post<{ appointment: Appointment }>('/appointments', data),
  setStatus: (id: string, status: Exclude<AppointmentStatus, 'pending'>) => api.patch<{ appointment: Appointment }>(`/appointments/${id}`, { status }),
  /** 409 con `code: 'choque'` si el profesional pisa otra cita o un bloqueo; se reintenta con `forzar`. */
  reschedule: (id: string, starts_at: string, forzar?: boolean) =>
    api.post<{ appointment: Appointment }>(`/appointments/${id}/reschedule`, { starts_at, forzar }),
  getConfig: () => api.get<{ agenda: Agenda; enabled: boolean; zona: string }>('/appointments/config'),
  saveConfig: (agenda: Agenda) => api.put<{ agenda: Agenda }>('/appointments/config', agenda),
  /** Fechas YYYY-MM-DD (hora de Cuba), ambas incluidas, como mucho 62 días. */
  calendar: (desde: string, hasta: string) => api.get<CalendarData>('/appointments/calendar', { params: { desde, hasta } }),
  createManual: (data: { starts_at: string; duration_min: number; service_id?: string; client_name: string; client_phone?: string; note?: string; forzar?: boolean }) =>
    api.post<{ appointment: Appointment }>('/appointments/manual', data),
  createBlock: (data: { starts_at: string; ends_at: string; note?: string }) => api.post<{ block: AgendaBlock }>('/appointments/blocks', data),
  deleteBlock: (id: string) => api.delete(`/appointments/blocks/${id}`),
};

/** El 409 de "choca con otra cita" que el profesional puede forzar. */
export const esChoque = (err: unknown) => err instanceof AxiosError && err.response?.status === 409 && err.response.data?.code === 'choque';

export const statsApi = {
  get: () => api.get('/stats'),
  categories: (province_id?: string) => api.get('/stats/categories', { params: { province_id } }),
};

export const provinceApi = {
  getAll: () => api.get('/provinces'),
  getMunicipalities: (provinceId: string) => api.get(`/provinces/${provinceId}/municipalities`),
};

export const categoryApi = {
  getAll: () => api.get('/categories'),
};

export const providerApi = {
  getAll: (params?: Record<string, string | number | undefined>) => api.get('/providers', { params }),
  getFeatured: (limit = 6) => api.get('/providers/featured', { params: { limit } }),
  getById: (id: string) => api.get(`/providers/${id}`),
  getMyProfile: () => api.get('/providers/me/profile'),
  updateMyProfile: (data: Record<string, unknown>) => api.put('/providers/me/profile', data),
  /** Deja constancia (si hay sesión de cliente) de que se pulsó WhatsApp o Llamar: habilita reseñar. */
  contact: (id: string, via: 'whatsapp' | 'call') => api.post(`/providers/${id}/contact`, { via }).catch(() => {}),
};

export const serviceApi = {
  getAll: (params?: Record<string, string | number | undefined>) => api.get('/services', { params }),
  mine: () => api.get('/services/mine'),
  getById: (id: string) => api.get(`/services/${id}`),
  create: (data: ServiceInput) => api.post('/services', data),
  update: (id: string, data: ServiceInput) => api.put(`/services/${id}`, data),
  delete: (id: string) => api.delete(`/services/${id}`),
  toggle: (id: string) => api.patch(`/services/${id}/toggle`),
};

export const uploadApi = {
  /** `catalog`: foto de un artículo del catálogo (cuota propia, la del plan en 24 h). */
  image: (data: string, purpose?: 'catalog') => api.post<{ url: string }>('/uploads', { data, purpose }),
};

export const catalogApi = {
  ofProvider: (providerId: string, params: { q?: string; section?: string; page?: number } = {}) =>
    api.get<CatalogPage>(`/catalog/provider/${providerId}`, { params }),
  search: (params: { q?: string; province_id?: string; municipality_id?: string; page?: number }) =>
    api.get<CatalogSearchPage>('/catalog/search', { params }),
  mine: () => api.get<{ items: (CatalogItem & { hidden_by_plan: boolean })[]; max: number; plan: string }>('/catalog/mine'),
  create: (data: CatalogInput) => api.post<{ item: CatalogItem }>('/catalog', data),
  update: (id: string, data: CatalogInput) => api.put<{ item: CatalogItem }>(`/catalog/${id}`, data),
  setAvailable: (id: string, available: boolean) => api.patch(`/catalog/${id}/available`, { available }),
  remove: (id: string) => api.delete(`/catalog/${id}`),
};

export const subscriptionApi = {
  getPlans: () => api.get('/subscriptions/plans'),
  getMine: () => api.get('/subscriptions/me'),
  checkout: (plan: 'basic' | 'pro', payment_method?: 'transfer' | 'cash') => api.post('/subscriptions/checkout', { plan, payment_method }),
  confirmManual: (data: { subscription_id: string; transaction_id: string }) => api.post('/subscriptions/confirm-manual', data),
  cancel: () => api.post('/subscriptions/cancel'),
};

export const conversationApi = {
  getAll: () => api.get('/conversations'),
  unreadCount: () => api.get<{ count: number }>('/conversations/unread-count'),
  create: (data: { provider_id: string; service_id?: string; initial_message: string }) => api.post('/conversations', data),
  getById: (id: string, after?: string) => api.get(`/conversations/${id}`, { params: { after } }),
  sendMessage: (id: string, content: string) => api.post(`/conversations/${id}/messages`, { content }),
};

export const reviewApi = {
  eligibility: (serviceId: string) => api.get<{ can_review: boolean; reason: string | null }>(`/reviews/eligibility/${serviceId}`),
  create: (data: { service_id: string; rating: number; comment?: string }) => api.post('/reviews', data),
  getByProvider: (providerId: string, page = 1) => api.get(`/reviews/provider/${providerId}`, { params: { page, limit: 10 } }),
};

export const favoriteApi = {
  getAll: () => api.get('/favorites'),
  ids: () => api.get<{ ids: string[] }>('/favorites/ids'),
  add: (provider_id: string) => api.post('/favorites', { provider_id }),
  remove: (providerId: string) => api.delete(`/favorites/${providerId}`),
};

export const telegramApi = {
  status: () => api.get<TelegramStatus>('/telegram/status'),
  /** 503 si el notificador no está en marcha. */
  link: () => api.post<{ url: string; expires_at: string }>('/telegram/link'),
  unlink: () => api.delete<TelegramStatus>('/telegram/link'),
  setPrefs: (prefs: Partial<Record<TelegramGroupId, boolean>>) => api.put<TelegramStatus>('/telegram/prefs', prefs),
  /** 202; 429 si ya se mandó una en el último minuto. */
  test: () => api.post('/telegram/test'),
};

export default api;
