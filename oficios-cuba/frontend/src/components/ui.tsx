import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Star, X } from 'lucide-react';
import { initials, planLabel } from '../lib/format';
import type { Plan } from '../types';

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** El mismo pin de `mobile/assets/marca/glifo.svg`, que es de donde salen los iconos de la app:
 *  mismas coordenadas y mismos colores, para que cualquier desvío entre los dos salte a la vista.
 *  Aquí va sin sombra (a 36 px solo ensucia) y con el viewBox ceñido al dibujo. */
export function Logo({ light = false, soloIcono = false, className = '' }: { light?: boolean; soloIcono?: boolean; className?: string }) {
  // Dos Logo en la misma página (cabecera y pie) no pueden repetir el id del degradado.
  // useId() los devuelve con dos puntos («:r0:»), que en un url(#…) no todos los navegadores resuelven.
  const gradiente = `marca${useId().replace(/:/g, '')}`;
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="21 19 61 61" className="h-9 w-9 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id={gradiente} x1="0" y1="20" x2="0" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FF9A3A" />
            <stop offset="1" stopColor="#F26A00" />
          </linearGradient>
        </defs>
        <g transform="rotate(-45 49 47)">
          <path d="M49 19 C64.5 19 77 31.5 77 47 C77 60 68 70 58 82 L49 94 L40 82 C30 70 21 60 21 47 C21 31.5 33.5 19 49 19 Z" fill={`url(#${gradiente})`} />
        </g>
        <circle cx="49" cy="47" r="19" fill="#FFFFFF" />
        <path d="M44 41 L50.5 37 V57.5" fill="none" stroke="#F26A00" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* soloIcono: para el banner móvil, que al colapsarse (ver useDireccionScroll en Layout.tsx)
          se queda solo con el glifo dentro de un círculo — ahí el nombre completo no cabe. */}
      {!soloIcono && (
        <span className={cn('font-display text-[1.2rem] font-bold leading-none tracking-tight', light ? 'text-white' : 'text-ink-900')}>
          Encuentra<span className="text-brand-500">uno</span>
        </span>
      )}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden="true" />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-ink-400" role="status" aria-label="Cargando">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

const AVATAR_TONES = ['bg-brand-100 text-brand-800', 'bg-sea-100 text-sea-800', 'bg-amber-100 text-amber-800', 'bg-ink-100 text-ink-700', 'bg-rose-100 text-rose-800'];

function tone(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function Avatar({ src, name, size = 'md', square = false, className = '' }: {
  src?: string | null; name?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; square?: boolean; className?: string;
}) {
  const dims = { xs: 'h-7 w-7 text-[11px]', sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-24 w-24 text-2xl' }[size];
  const shape = square ? 'rounded-2xl' : 'rounded-full';
  if (src) {
    return <img src={src} alt="" loading="lazy" decoding="async" className={cn(dims, shape, 'shrink-0 object-cover', className)} />;
  }
  return (
    <span className={cn(dims, shape, tone(name ?? '?'), 'inline-flex shrink-0 select-none items-center justify-center font-display font-bold', className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Stars({ value, size = 'h-4 w-4', className = '' }: { value: number; size?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-sand-200 text-sand-200')} aria-hidden="true" />
      ))}
    </span>
  );
}

export function RatingInline({ rating, count, className = '' }: { rating: number; count: number; className?: string }) {
  if (!count) return <span className={cn('text-sm text-ink-400', className)}>Sin reseñas aún</span>;
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm', className)}>
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
      <span className="font-bold text-ink-900">{rating.toFixed(1)}</span>
      <span className="text-ink-400">({count})</span>
    </span>
  );
}

/** Solo para el panel del propio dueño: ahí ver tu plan ES el objetivo. Nunca en superficies
 *  públicas — el plan de pago de un negocio no es asunto de quien lo busca, y además «Profesional»
 *  se leería como un distintivo de calidad cuando solo significa que paga más. */
export function PlanPill({ plan }: { plan: Plan }) {
  const styles: Record<Plan, string> = {
    free: 'bg-sand-100 text-ink-600',
    basic: 'bg-amber-100 text-amber-800',
    pro: 'bg-ink-900 text-amber-300',
  };
  return <span className={cn('badge', styles[plan])}>{planLabel[plan]}</span>;
}

// Portada para servicios sin foto: un panel liso, sin borde ni sombra, con el icono de la
// categoría. Antes eran degradados de ocho colores distintos y en la retícula acababan siendo lo
// más llamativo de la página, compitiendo con las fotos reales de los negocios. El tema claro
// pide justo lo contrario: que el fondo no resalte y manden las imágenes.
// `seed` sigue en el tipo porque decenas de llamadas lo pasan, pero ya no se usa: elegía el
// color del degradado, y el degradado se fue. Quitarlo de la firma sería tocar media web para
// nada; dejarlo declarado y sin leer es el coste honesto de haber simplificado el dibujo.
export function CategoryCover({ icon, className = '' }: { seed: string; icon?: string | null; className?: string }) {
  return (
    <div
      className={cn('relative flex h-full w-full items-center justify-center overflow-hidden bg-panel', className)}
      aria-hidden="true"
    >
      <span className="relative text-5xl opacity-90 sm:text-6xl">{icon || '🛠️'}</span>
    </div>
  );
}

export function CoverImage({ src, seed, icon, alt, className = '', eager = false }: {
  src?: string | null; seed: string; icon?: string | null; alt: string; className?: string; eager?: boolean;
}) {
  if (!src) return <CategoryCover seed={seed} icon={icon} className={className} />;
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('h-full w-full object-cover', className)}
    />
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-sand-300 bg-white/60 px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sand-100 text-ink-400">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
      <p>{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-2 font-semibold underline underline-offset-4">Reintentar</button>}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-sea-200 bg-sea-50 text-sea-800',
    info: 'border-sand-300 bg-sand-100 text-ink-700',
  }[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm', styles)}>{children}</div>;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('textarea, input, select, button:not([data-close])')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('relative max-h-[92vh] w-full animate-fade-up overflow-y-auto rounded-t-3xl bg-white p-6 shadow-lift sm:rounded-3xl', size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold">{title}</h2>
          <button data-close onClick={onClose} className="-m-2 rounded-xl p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-700" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-ink-400">
        {items.map((item, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.to ? (
              <Link to={item.to} className="hover:text-ink-900">{item.label}</Link>
            ) : (
              <span className="max-w-[16rem] truncate font-medium text-ink-700" aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-balance text-3xl font-bold sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-xl text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
