import type { PriceType } from './tipos';

type ConPrecio = { price_min?: number | null; price_max?: number | null; price_type: PriceType };

// SQLite guarda algunas fechas como "YYYY-MM-DD HH:MM:SS" (UTC, sin zona): se normalizan a ISO.
export function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

// Hermes (motor JS de React Native) no garantiza Intl completo en Android: formateo manual.
function dinero(n: number) {
  const [ent, dec] = (Math.round(n * 100) / 100).toString().split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${dec ? `${miles},${dec.padEnd(2, '0')}` : miles}`;
}

const unidad: Record<PriceType, string> = { fixed: '', hourly: ' / hora', daily: ' / día', negotiable: '' };

export function formatPrice({ price_min: min, price_max: max, price_type }: ConPrecio): string {
  if (price_type === 'negotiable' || (min == null && max == null)) return 'A convenir';
  if (min != null && max != null && min !== max) return `${dinero(min)} – ${dinero(max)}${unidad[price_type]}`;
  return `${dinero((min ?? max) as number)}${unidad[price_type]}`;
}

export function priceFrom({ price_min: min, price_max: max, price_type }: ConPrecio) {
  if (price_type === 'negotiable' || (min == null && max == null)) return { prefix: '', amount: 'A convenir', suffix: '' };
  const rango = min != null && max != null && min !== max;
  return { prefix: rango ? 'desde' : '', amount: dinero((min ?? max) as number), suffix: unidad[price_type].trim() };
}

export function relativeTime(value: string, ahora: Date = new Date()): string {
  const fecha = parseDate(value);
  const s = (ahora.getTime() - fecha.getTime()) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) {
    const d = Math.floor(s / 86400);
    return d === 1 ? 'ayer' : `hace ${d} días`;
  }
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const año = fecha.getUTCFullYear() === ahora.getUTCFullYear() ? '' : ` ${fecha.getUTCFullYear()}`;
  return `${fecha.getUTCDate()} ${meses[fecha.getUTCMonth()]}${año}`;
}

export function shortTime(value: string): string {
  const d = parseDate(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const partes = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

export const nombreVisible = (p: { business_name?: string | null; owner_name: string }) => p.business_name || p.owner_name;

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
