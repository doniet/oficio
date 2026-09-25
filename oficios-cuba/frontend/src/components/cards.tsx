import { Link } from 'react-router-dom';
import { MapPin, Images } from 'lucide-react';
import type { ProviderCard as ProviderCardType, ServiceSummary } from '../types';
import { priceFrom } from '../lib/format';
import { Avatar, CoverImage, PlanBadge, RatingInline, cn } from './ui';

export function ServiceCard({ service, className = '' }: { service: ServiceSummary; className?: string }) {
  const price = priceFrom(service);
  const place = [service.municipality_name, service.province_name].filter(Boolean).join(', ');
  return (
    <Link
      to={`/servicio/${service.id}`}
      className={cn('group card card-hover flex flex-col overflow-hidden', className)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-sand-100">
        <CoverImage
          src={service.cover}
          seed={service.parent_category_slug || service.category_slug}
          icon={service.category_icon}
          alt={service.title}
          className="transition duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="badge bg-white/95 text-ink-800 shadow-sm backdrop-blur">
            <span aria-hidden="true">{service.category_icon}</span> {service.category_name}
          </span>
        </div>
        {service.image_count > 1 && (
          <span className="badge absolute bottom-3 right-3 bg-ink-900/70 text-white backdrop-blur">
            <Images className="h-3.5 w-3.5" /> {service.image_count}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <RatingInline rating={service.rating} count={service.review_count} />
          <PlanBadge plan={service.subscription_plan} />
        </div>
        <h3 className="line-clamp-2 font-sans text-[1.02rem] font-bold leading-snug text-ink-900 group-hover:text-brand-700">
          {service.title}
        </h3>
        <p className="mt-1 truncate text-sm text-ink-500">{service.business_name || service.owner_name}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          {place ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-ink-400">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </span>
          ) : <span />}
          <span className="shrink-0 text-right leading-none">
            {price.prefix && <span className="mr-1 text-xs text-ink-400">{price.prefix}</span>}
            <span className="font-display text-lg font-bold text-ink-900">{price.amount}</span>
            {price.suffix && <span className="ml-0.5 text-xs text-ink-400">{price.suffix}</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ServiceCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[4/3] rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-5 w-4/5" />
        <div className="skeleton h-4 w-1/2" />
        <div className="flex justify-between pt-3">
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-5 w-16" />
        </div>
      </div>
    </div>
  );
}

export function ProviderCard({ provider }: { provider: ProviderCardType }) {
  const name = provider.business_name || provider.owner_name;
  return (
    <Link to={`/proveedor/${provider.id}`} className="group card card-hover flex flex-col overflow-hidden">
      <div className="relative h-28 overflow-hidden bg-sand-100">
        <CoverImage src={provider.cover} seed={provider.categories[0] ?? name} alt="" className="transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/40 to-transparent" />
        <PlanBadge plan={provider.subscription_plan} className="absolute right-3 top-3 shadow-sm" />
      </div>
      <div className="relative flex flex-1 flex-col px-4 pb-4">
        <Avatar src={provider.avatar_url} name={name} size="lg" square className="-mt-8 border-4 border-white shadow-card" />
        <h3 className="mt-2 font-sans text-[1.05rem] font-bold leading-snug text-ink-900 group-hover:text-brand-700">{name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{[provider.municipality_name, provider.province_name].filter(Boolean).join(', ')}</span>
        </p>
        {provider.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {provider.categories.slice(0, 2).map((c) => (
              <span key={c} className="badge bg-sand-100 font-medium text-ink-600">{c}</span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between pt-4 text-sm">
          <RatingInline rating={provider.rating} count={provider.review_count} />
          <span className="text-ink-400">{provider.years_experience} años de oficio</span>
        </div>
      </div>
    </Link>
  );
}

export function ProviderCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-28 rounded-none" />
      <div className="space-y-3 px-4 pb-4">
        <div className="skeleton -mt-8 h-16 w-16 rounded-2xl border-4 border-white" />
        <div className="skeleton h-5 w-3/5" />
        <div className="skeleton h-4 w-2/5" />
        <div className="skeleton h-4 w-full" />
      </div>
    </div>
  );
}
