import type { Currency, PriceType } from './tipos';

type ConPrecio = { price_min?: number | null; price_max?: number | null; price_type: PriceType; price_currency?: Currency | null };

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
// En Cuba se lee "15 000 CUP". Espacio no separable normal: el fino (U+202F) de la web no está en
// todas las fuentes empaquetadas de la app.
const cup = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')} CUP`;
const usd = (n: number) => `${dinero(n)} USD`;

/** Tasa de respaldo (CUP por 1 USD) mientras no llega la de /api/tasas. Igual que en la web. */
export const TASA_RESPALDO = 730;

// Conversión aproximada con redondeo "de calle" (mismo criterio que la web).
const redondeoCup = (n: number) => (n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100);
const redondeoUsd = (n: number) => (n < 10 ? Math.max(0.5, Math.round(n * 2) / 2) : Math.round(n));

const unidad: Record<PriceType, string> = { fixed: '', hourly: '/ hora', daily: '/ día', negotiable: '' };

function partes(s: ConPrecio, tasa: number) {
  const { price_min: min, price_max: max, price_type } = s;
  if (price_type === 'negotiable' || (min == null && max == null)) return null;
  const t = Number.isFinite(tasa) && tasa > 0 ? tasa : TASA_RESPALDO;
  const moneda: Currency = s.price_currency ?? 'CUP';
  const lo = (min ?? max) as number;
  const hi = (max ?? min) as number;
  const rango = min != null && max != null && min !== max;
  const fmt = moneda === 'CUP' ? cup : usd;
  const conv = moneda === 'CUP' ? (n: number) => usd(redondeoUsd(n / t)) : (n: number) => cup(redondeoCup(n * t));
  const tramo = (f: (n: number) => string) => (rango ? `${f(lo).replace(/ (CUP|USD)$/, '')} – ${f(hi)}` : f(lo));
  return { principal: tramo(fmt), alt: `≈ ${tramo(conv)}`, desde: fmt(lo), desdeAlt: `≈ ${conv(lo)}`, rango, sufijo: unidad[price_type] };
}

/** Una línea: "15 000 – 60 000 CUP (≈ $21 – $82 USD) / hora". */
export function formatPrice(s: ConPrecio, tasa: number = TASA_RESPALDO): string {
  const p = partes(s, tasa);
  if (!p) return 'A convenir';
  return `${p.principal} (${p.alt})${p.sufijo ? ` ${p.sufijo}` : ''}`;
}

/** Para tarjetas: "desde 3 000 CUP" y aparte "≈ $4 USD". */
export function priceFrom(s: ConPrecio, tasa: number = TASA_RESPALDO) {
  const p = partes(s, tasa);
  if (!p) return { prefix: '', amount: 'A convenir', suffix: '', alt: null as string | null };
  return { prefix: p.rango ? 'desde' : '', amount: p.desde, suffix: p.sufijo, alt: p.desdeAlt as string | null };
}

export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

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
