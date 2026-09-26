import { MapPin } from 'lucide-react';
import { useTasa } from '../../hooks/useTasa';
import { catalogPrice } from '../../lib/format';
import type { CatalogItem, CatalogSearchItem } from '../../types';
import { CategoryCover, cn } from '../ui';

/** Foto del artículo o, si no tiene, un fondo de color estable con su inicial. */
export function CatalogImage({ item, className = '', eager = false }: { item: Pick<CatalogItem, 'name' | 'image'>; className?: string; eager?: boolean }) {
  if (!item.image) {
    return <CategoryCover seed={item.name} icon={item.name.trim().charAt(0).toUpperCase() || '·'} className={cn('font-display font-bold text-ink-900/70', className)} />;
  }
  return <img src={item.image} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className={cn('h-full w-full object-cover', className)} />;
}

export function PrecioArticulo({ item, size = 'md' }: { item: CatalogItem; size?: 'md' | 'lg' }) {
  const tasa = useTasa();
  const p = catalogPrice(item, tasa);
  return (
    <p className="leading-none">
      {p.prefix && <span className="mr-1 text-xs text-ink-400">{p.prefix}</span>}
      <span className={cn('font-display font-bold text-ink-900', size === 'lg' ? 'text-2xl' : 'text-base')}>{p.amount}</span>
      {p.alt && <span className={cn('mt-1 block text-ink-400', size === 'lg' ? 'text-sm' : 'text-xs')}>{p.alt}</span>}
    </p>
  );
}

export function CatalogCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-square w-full" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-4/5 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

/** Tarjeta de un artículo. Con `provider`, añade quién lo vende (búsqueda general). */
export default function CatalogCard({ item, onOpen }: { item: CatalogItem | CatalogSearchItem; onOpen: () => void }) {
  const vendedor = 'provider_name' in item ? item : null;
  const lugar = vendedor ? [vendedor.municipality_name, vendedor.province_name].filter(Boolean).join(', ') : '';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('group card card-hover flex h-full flex-col overflow-hidden text-left', !item.available && 'opacity-60')}
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-sand-100">
        <CatalogImage item={item} className="transition duration-500 group-hover:scale-[1.04] [&>span]:text-5xl" />
        {!item.available && <span className="badge absolute left-2 top-2 bg-ink-900 text-white">Agotado</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 font-sans text-sm font-bold leading-snug text-ink-900 group-hover:text-brand-700 sm:text-[15px]">{item.name}</h3>
        {vendedor && (
          <p className="min-w-0 text-xs text-ink-500">
            <span className="block truncate font-semibold text-ink-700">{vendedor.provider_name}</span>
            {lugar && <span className="mt-0.5 flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /> {lugar}</span>}
          </p>
        )}
        <div className="mt-auto">
          <PrecioArticulo item={item} />
        </div>
      </div>
    </button>
  );
}
