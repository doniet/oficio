import axios from 'axios';
import { tokenStore } from './api';
import type { AdminAuditEntry, AdminSession, AdminSystem, AdminTelegram } from '../types';

// Instancia propia: la de api.ts cierra la sesión ante cualquier 401, y aquí un 401 solo significa
// "vuelve a poner tu código 2FA" (o un código incorrecto).
const SESSION_KEY = 'oc_admin';

export const adminSession = {
  get(): AdminSession | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as AdminSession | null;
      return s && Date.parse(s.expires_at) > Date.now() ? s : null;
    } catch { return null; }
  },
  set(s: AdminSession) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* modo privado */ }
  },
  clear() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* modo privado */ }
  },
};

const http = axios.create({ baseURL: '/api/admin', timeout: 20000 });

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const s = adminSession.get();
  if (s) config.headers['X-Admin-Token'] = s.admin_token;
  return config;
});

/** Un 401 con code 'admin_2fa': la sesión de administración caducó y hay que pedir el código. */
export const ADMIN_2FA_EVENT = 'oc:admin-2fa';
http.interceptors.response.use((r) => r, (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && (error.response.data as { code?: string })?.code === 'admin_2fa') {
    adminSession.clear();
    window.dispatchEvent(new Event(ADMIN_2FA_EVENT));
  }
  return Promise.reject(error);
});

export const adminApi = {
  me: () => http.get<{ totp_enabled: boolean }>('/me'),
  setup2fa: () => http.post<{ secret: string; uri: string }>('/2fa/setup'),
  enable2fa: (code: string) => http.post<AdminSession>('/2fa/enable', { code }),
  verify2fa: (code: string) => http.post<AdminSession>('/2fa/verify', { code }),
  system: () => http.get<AdminSystem>('/system'),
  telegram: () => http.get<AdminTelegram>('/telegram'),
  setTelegramToken: (token: string, code: string) => http.put<{ ok: true; hint: string }>('/telegram/token', { token, code }),
  deleteTelegramToken: (code: string) => http.delete<{ ok: true }>('/telegram/token', { data: { code } }),
  audit: () => http.get<{ entries: AdminAuditEntry[] }>('/audit'),
};
