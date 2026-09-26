import type { Currency, Plan, PriceType } from '../types';

// SQLite guarda algunas fechas como "YYYY-MM-DD HH:MM:SS" (UTC, sin zona): se normalizan a ISO.
export function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

const money = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const usd = (n: number) => `$${money.format(n)}`;
// Miles con espacio fino (no separable) siempre: es-ES pone "5000" pero "15.000", y en Cuba se lee "15 000".
export const cup = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')} CUP`;

/** Tasa de respaldo (CUP por 1 USD) mientras no llega la de dardoventas.com. */
export const TASA_RESPALDO = 730;

// Conversión aproximada: redondeo "de calle" (CUP a la decena/centena, USD a enteros o medio dólar).
function redondeoCup(n: number) {
  if (n < 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 100) * 100;
}
function redondeoUsd(n: number) {
  return n < 10 ? Math.max(0.5, Math.round(n * 2) / 2) : Math.round(n);
}

const unit: Record<PriceType, string> = { fixed: '', hourly: ' / hora', daily: ' / día', negotiable: '' };

type Priced = { price_min?: number | null; price_max?: number | null; price_type: PriceType; price_currency?: Currency | null };

/** Precio en ambas monedas. `main` va en la moneda en que lo puso el profesional; `alt` es la conversión (≈). */
export function priceParts(s: Priced, tasa: number = TASA_RESPALDO) {
  const { price_min: min, price_max: max, price_type } = s;
  const currency: Currency = s.price_currency ?? 'CUP';
  if (price_type === 'negotiable' || (min == null && max == null)) {
    return { negotiable: true, main: 'A convenir', alt: null as string | null, suffix: '', currency, hasRange: false, from: '', fromAlt: null as string | null };
  }
  const lo = (min ?? max) as number;
  const hi = max ?? min;
  const hasRange = min != null && max != null && min !== max;
  const fmt = currency === 'CUP' ? cup : (n: number) => `${usd(n)} USD`;
  const conv = currency === 'CUP' ? (n: number) => `${usd(redondeoUsd(n / tasa))} USD` : (n: number) => cup(redondeoCup(n * tasa));
  const rango = (f: (n: number) => string) => (hasRange ? `${f(lo).replace(/ (CUP|USD)$/, '')} – ${f(hi as number)}` : f(lo));
  return {
    negotiable: false,
    main: rango(fmt),
    alt: `≈ ${rango(conv)}`,
    suffix: unit[price_type].trim(),
    currency,
    hasRange,
    from: fmt(lo),
    fromAlt: `≈ ${conv(lo)}`,
  };
}

/** Texto de una línea: "15 000 – 60 000 CUP (≈ $21 – $82 USD) / hora". */
export function formatPrice(s: Priced, tasa?: number): string {
  const p = priceParts(s, tasa);
  if (p.negotiable) return p.main;
  return `${p.main} (${p.alt})${p.suffix ? ` / ${p.suffix.replace(/^\/ /, '')}` : ''}`;
}

/** Precio corto para tarjetas: "desde 3 000 CUP" + "≈ $4 USD". */
export function priceFrom(s: Priced, tasa?: number) {
  const p = priceParts(s, tasa);
  if (p.negotiable) return { prefix: '', amount: 'A convenir', suffix: '', alt: null as string | null };
  return { prefix: p.hasRange ? 'desde' : '', amount: p.from, suffix: p.suffix, alt: p.fromAlt };
}

/** Precio de un plan (en USD) con su equivalente en CUP. */
export function planPrice(usdAmount: number, tasa: number = TASA_RESPALDO) {
  return { usd: usdAmount === 0 ? 'Gratis' : `${usd(usdAmount)} USD`, cup: usdAmount === 0 ? null : `≈ ${cup(redondeoCup(usdAmount * tasa))}` };
}

export const priceTypeLabel: Record<PriceType, string> = {
  fixed: 'Precio fijo',
  hourly: 'Por hora',
  daily: 'Por día',
  negotiable: 'A convenir',
};

export const planLabel: Record<Plan, string> = {
  free: 'Gratis',
  basic: 'Básico',
  pro: 'Profesional',
};

export const DARDOIT_URL = 'https://www.dardoit.com';
export const DARDOVENTAS_URL = 'https://dardoventas.com';

export function telLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

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

/** Precio de un artículo del catálogo: { prefix: 'desde' | '', amount, alt (≈ otra moneda) }. */
export function catalogPrice(item: { price: number | null; price_type: 'fixed' | 'from' | 'ask'; price_currency: Currency }, tasa?: number) {
  if (item.price_type === 'ask' || item.price == null) return { prefix: '', amount: 'A consultar', alt: null as string | null };
  const p = priceParts({ price_min: item.price, price_type: 'fixed', price_currency: item.price_currency }, tasa);
  return { prefix: item.price_type === 'from' ? 'desde' : '', amount: p.main, alt: p.alt };
}
