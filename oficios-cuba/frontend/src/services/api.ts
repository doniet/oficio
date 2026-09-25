import axios, { AxiosError } from 'axios';
import type { PriceType, UserType } from '../types';

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
  images: string[];
}

export const authApi = {
  register: (data: { email: string; password: string; full_name: string; phone?: string; user_type: UserType }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { full_name?: string; phone?: string; avatar_url?: string }) => api.put('/auth/profile', data),
  updatePassword: (data: { current_password: string; new_password: string }) => api.put('/auth/password', data),
};

export const configApi = {
  get: () => api.get<{ demo: boolean }>('/config'),
};

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
  image: (data: string) => api.post<{ url: string }>('/uploads', { data }),
};

export const subscriptionApi = {
  getPlans: () => api.get('/subscriptions/plans'),
  getMine: () => api.get('/subscriptions/me'),
  checkout: (plan: 'basic' | 'pro' | 'premium', payment_method?: 'transfer' | 'cash') => api.post('/subscriptions/checkout', { plan, payment_method }),
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

export default api;
