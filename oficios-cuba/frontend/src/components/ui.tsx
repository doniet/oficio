import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Loader2, Star, X } from 'lucide-react';
import { initials, planLabel } from '../lib/format';
import type { Plan } from '../types';

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="#C8472B" />
        <path d="M8 20.5 20 10l12 10.5" fill="none" stroke="#FAF6EF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 19v11.5h16V19" fill="none" stroke="#FAF6EF" strokeWidth="3" strokeLinejoin="round" />
        <path d="m20 20.2 1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z" fill="#F2B33D" />
      </svg>
      <span className={cn('font-display text-[1.2rem] font-bold leading-none tracking-tight', light ? 'text-white' : 'text-ink-900')}>
        Oficios<span className="text-brand-500">Cuba</span>
      </span>
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

// Es la insignia del plan, no una verificación de identidad: no puede decir "Verificado".
export function PlanBadge({ plan, className = '' }: { plan: Plan; className?: string }) {
  if (plan === 'premium') {
    return <span className={cn('badge bg-ink-900 text-amber-300', className)}><Crown className="h-3.5 w-3.5" aria-hidden="true" /> Premium</span>;
  }
  if (plan === 'pro') return <span className={cn('badge bg-sea-100 text-sea-800', className)}>Pro</span>;
  return null;
}

export function PlanPill({ plan }: { plan: Plan }) {
  const styles: Record<Plan, string> = {
    free: 'bg-sand-100 text-ink-600',
    basic: 'bg-amber-100 text-amber-800',
    pro: 'bg-sea-100 text-sea-800',
    premium: 'bg-ink-900 text-amber-300',
  };
  return <span className={cn('badge', styles[plan])}>{planLabel[plan]}</span>;
}

// Portada para servicios sin foto: color estable por categoría + icono grande.
const COVER_TONES = [
  ['#F6CBBD', '#EFA78F'], ['#D3F1EC', '#A8E2DA'], ['#FDE7B0', '#F6D27A'], ['#E6EAF2', '#CBD2E1'],
  ['#F9D8E0', '#F2B4C3'], ['#E3F0D2', '#C6E0A6'], ['#EADFF7', '#D4C1F0'], ['#FBE6DF', '#F6CBBD'],
];

export function CategoryCover({ seed, icon, className = '' }: { seed: string; icon?: string | null; className?: string }) {
  let h = 0;
  for (const ch of seed) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = COVER_TONES[h % COVER_TONES.length];
  return (
    <div
      className={cn('relative flex h-full w-full items-center justify-center overflow-hidden', className)}
      style={{ background: `radial-gradient(120% 90% at 20% 10%, ${a} 0%, ${b} 100%)` }}
      aria-hidden="true"
    >
      <svg className="absolute inset-0 h-full w-full opacity-[.18]" aria-hidden="true">
        <defs>
          <pattern id={`p-${h}`} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="22" stroke="#16213E" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#p-${h})`} />
      </svg>
      <span className="relative text-5xl drop-shadow-sm sm:text-6xl">{icon || '🛠️'}</span>
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
