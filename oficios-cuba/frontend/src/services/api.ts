import axios from 'axios';
import type { ApiError } from '../types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { email: string; password: string; full_name: string; phone?: string; user_type: 'client' | 'provider' }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { full_name?: string; phone?: string; avatar_url?: string }) =>
    api.put('/auth/profile', data),
  updatePassword: (data: { current_password: string; new_password: string }) =>
    api.put('/auth/password', data),
};

export const provinceApi = {
  getAll: () => api.get('/provinces'),
  getById: (id: string) => api.get(`/provinces/${id}`),
  getMunicipalities: (provinceId: string) => api.get(`/provinces/${provinceId}/municipalities`),
  reverseGeocode: (lat: number, lng: number) => api.get(`/provinces/search/osm?lat=${lat}&lng=${lng}`),
};

export const categoryApi = {
  getAll: () => api.get('/categories'),
  getFlat: () => api.get('/categories/flat'),
  getById: (id: string) => api.get(`/categories/${id}`),
  getBySlug: (slug: string) => api.get(`/categories/slug/${slug}`),
};

export const providerApi = {
  getAll: (params?: {
    province_id?: string;
    category_id?: string;
    municipality_id?: string;
    q?: string;
    page?: number;
    limit?: number;
    sort?: string;
  }) => api.get('/providers', { params }),
  getFeatured: (params?: { province_id?: string; limit?: number }) =>
    api.get('/providers/featured', { params }),
  getById: (id: string) => api.get(`/providers/${id}`),
  createProfile: (data: any) => api.post('/providers/profile', data),
  getMyProfile: () => api.get('/providers/me/profile'),
  updateMyProfile: (data: any) => api.put('/providers/me/profile', data),
  deleteMyProfile: () => api.delete('/providers/me/profile'),
};

export const serviceApi = {
  getAll: (params?: {
    provider_id?: string;
    category_id?: string;
    province_id?: string;
    municipality_id?: string;
    q?: string;
    price_min?: number;
    price_max?: number;
    price_type?: string;
    page?: number;
    limit?: number;
    sort?: string;
  }) => api.get('/services', { params }),
  getCategoryStats: (province_id?: string) => api.get('/services/categories/stats', { params: { province_id } }),
  getById: (id: string) => api.get(`/services/${id}`),
  create: (data: any) => api.post('/services', data),
  update: (id: string, data: any) => api.put(`/services/${id}`, data),
  delete: (id: string) => api.delete(`/services/${id}`),
  toggle: (id: string) => api.patch(`/services/${id}/toggle`),
};

export const subscriptionApi = {
  getPlans: () => api.get('/subscriptions/plans'),
  getMySubscription: () => api.get('/subscriptions/me'),
  checkout: (data: { plan: 'basic' | 'pro' | 'premium'; payment_method?: 'stripe' | 'transfer' | 'cash' }) =>
    api.post('/subscriptions/checkout', data),
  confirmManual: (data: { subscription_id: string; transaction_id?: string }) =>
    api.post('/subscriptions/confirm-manual', data),
  cancel: () => api.post('/subscriptions/cancel'),
};

export const conversationApi = {
  getAll: () => api.get('/conversations'),
  create: (data: { provider_id: string; service_id?: string; initial_message: string }) =>
    api.post('/conversations', data),
  getById: (id: string) => api.get(`/conversations/${id}`),
  sendMessage: (id: string, content: string) => api.post(`/conversations/${id}/messages`, { content }),
  markAsRead: (id: string) => api.patch(`/conversations/${id}/read`),
};

export const reviewApi = {
  create: (data: { service_id: string; rating: number; comment?: string }) =>
    api.post('/reviews', data),
  getByProvider: (providerId: string, params?: { page?: number; limit?: number }) =>
    api.get(`/reviews/provider/${providerId}`, { params }),
  getByService: (serviceId: string) => api.get(`/reviews/service/${serviceId}`),
  update: (id: string, data: { rating?: number; comment?: string }) =>
    api.put(`/reviews/${id}`, data),
  delete: (id: string) => api.delete(`/reviews/${id}`),
};

export const favoriteApi = {
  getAll: () => api.get('/favorites'),
  add: (provider_id: string) => api.post('/favorites', { provider_id }),
  remove: (providerId: string) => api.delete(`/favorites/${providerId}`),
  check: (providerId: string) => api.get(`/favorites/check/${providerId}`),
};

export default api;