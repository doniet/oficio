import type { Plan, PriceType } from '../types';

// SQLite guarda algunas fechas como "YYYY-MM-DD HH:MM:SS" (UTC, sin zona): se normalizan a ISO.
export function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

const money = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const usd = (n: number) => `$${money.format(n)}`;

const unit: Record<PriceType, string> = { fixed: '', hourly: ' / hora', daily: ' / día', negotiable: '' };

export function formatPrice(s: { price_min?: number | null; price_max?: number | null; price_type: PriceType }): string {
  const { price_min: min, price_max: max, price_type } = s;
  if (price_type === 'negotiable' || (min == null && max == null)) return 'A convenir';
  if (min != null && max != null && min !== max) return `${usd(min)} – ${usd(max)}${unit[price_type]}`;
  return `${usd((min ?? max) as number)}${unit[price_type]}`;
}

/** Precio corto para tarjetas: "desde $35". */
export function priceFrom(s: { price_min?: number | null; price_max?: number | null; price_type: PriceType }) {
  const { price_min: min, price_max: max, price_type } = s;
  if (price_type === 'negotiable' || (min == null && max == null)) return { prefix: '', amount: 'A convenir', suffix: '' };
  const hasRange = min != null && max != null && min !== max;
  return { prefix: hasRange ? 'desde' : '', amount: usd((min ?? max) as number), suffix: unit[price_type].trim() };
}

export const priceTypeLabel: Record<PriceType, string> = {
  fixed: 'Precio fijo',
  hourly: 'Por hora',
  daily: 'Por día',
  negotiable: 'A convenir',
};

export const planLabel: Record<Plan, string> = {
  free: 'Gratuito',
  basic: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
};

export function relativeTime(value: string): string {
  const date = parseDate(value);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) {
    const d = Math.floor(diff / 86400);
    return d === 1 ? 'ayer' : `hace ${d} días`;
  }
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function shortTime(value: string): string {
  return parseDate(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(value: string): string {
  const d = parseDate(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function memberSince(value: string): string {
  return parseDate(value).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
