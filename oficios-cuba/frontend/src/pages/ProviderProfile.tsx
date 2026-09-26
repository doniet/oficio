import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Briefcase, CalendarDays, Clock, Mail, MapPin, Send, UserX, Wrench, X } from 'lucide-react';
import { useTasa } from '../hooks/useTasa';
import { useAuth } from '../hooks/useAuth';
import { providerApi, reviewApi, apiError } from '../services/api';
import { memberSince, priceFrom } from '../lib/format';
import type { Pagination, ProviderPublic, ProviderServiceItem, Review, ServiceArea } from '../types';
import ContactActions from '../components/ContactActions';
import ProviderCatalog from '../components/catalog/ProviderCatalog';
import { NegocioChip } from '../components/cards';
import { RatingBreakdown, ReviewItem } from '../components/ReviewList';
import { Avatar, Breadcrumbs, CoverImage, EmptyState, ErrorState, PageLoader, PlanBadge, RatingInline, Spinner } from '../components/ui';

const PlaceMap = lazy(() => import('../components/PlaceMap'));

function ServiceRow({ service }: { service: ProviderServiceItem }) {
  const tasa = useTasa();
  const price = priceFrom(service, tasa);
  return (
    <Link to={`/servicio/${service.id}`} className="group card card-hover flex overflow-hidden">
      <div className="relative w-28 shrink-0 overflow-hidden bg-sand-100 sm:w-40">
        <CoverImage src={service.cover} seed={service.category_slug} icon={service.category_icon} alt="" className="absolute inset-0 transition duration-500 group-hover:scale-[1.04] [&>span]:text-4xl" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <span className="text-xs font-semibold text-ink-400"><span aria-hidden="true">{service.category_icon}</span> {service.category_name}</span>
        <h3 className="mt-1 line-clamp-2 font-sans text-base font-bold leading-snug text-ink-900 group-hover:text-brand-700">{service.title}</h3>
        {service.description && <p className="mt-1 line-clamp-2 hidden text-sm text-ink-500 sm:block">{service.description}</p>}
        <p className="mt-auto pt-3 leading-none">
          {price.prefix && <span className="mr-1 text-xs text-ink-400">{price.prefix}</span>}
          <span className="font-display text-lg font-bold text-ink-900">{price.amount}</span>
          {price.suffix && <span className="ml-0.5 text-xs text-ink-400">{price.suffix}</span>}
          {price.alt && <span className="mt-1 block text-xs text-ink-400">{price.alt}</span>}
        </p>
      </div>
    </Link>
  );
}

function GalleryGrid({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((src, i) => (
          <li key={src + i}>
            <button onClick={() => setOpen(i)} className="block aspect-square w-full overflow-hidden rounded-xl bg-sand-100" aria-label={`Ampliar foto ${i + 1}`}>
              <img src={src} alt={`${name} — foto ${i + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover transition hover:scale-[1.04]" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <div role="dialog" aria-modal="true" aria-label="Foto ampliada" className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4" onClick={() => setOpen(null)}>
          <button onClick={() => setOpen(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink-900" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
          <img src={images[open]} alt={`${name} — foto ${open + 1}`} className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </>
  );
}

function AreasList({ areas }: { areas: ServiceArea[] }) {
  const byProvince = areas.reduce<Record<string, string[]>>((acc, a) => {
    (acc[a.province_name] ??= []).push(a.municipality_name);
    return acc;
  }, {});
  return (
    <div className="space-y-3">
      {Object.entries(byProvince).map(([province, munis]) => (
        <div key={province}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">{province}</p>
          <ul className="flex flex-wrap gap-1.5">
            {munis.map((m) => <li key={m} className="badge bg-sand-100 font-medium text-ink-700">{m}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ProviderProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [provider, setProvider] = useState<ProviderPublic | null>(null);
  const [services, setServices] = useState<ProviderServiceItem[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [distribution, setDistribution] = useState<{ rating: number; count: number }[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [myProviderId, setMyProviderId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.user_type !== 'provider') return;
    providerApi.getMyProfile().then((r) => setMyProviderId(r.data.provider.id)).catch(() => {});
  }, [user]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const [res, first] = await Promise.all([providerApi.getById(id), reviewApi.getByProvider(id, 1)]);
      setProvider(res.data.provider);
      setServices(res.data.services);
      setAreas(res.data.serviceAreas);
      setDistribution(res.data.distribution);
      setReviews(first.data.reviews);
      setPagination(first.data.pagination);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true);
      else setError(apiError(err, 'No pudimos cargar el perfil.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    window.scrollTo(0, 0);
  }, [load]);

  const name = provider ? provider.business_name || provider.owner_name : '';
  const vendedor = useMemo(() => (provider
    ? { id: provider.id, name, whatsapp: provider.whatsapp, contactMode: provider.contact_mode, hasChat: provider.has_chat }
    : null), [provider, name]);

  useEffect(() => {
    if (name) document.title = `${name} · Oficios Cuba`;
    return () => { document.title = 'Oficios Cuba'; };
  }, [name]);

  const loadMore = async () => {
    if (!id || !pagination) return;
    setLoadingMore(true);
    try {
      const res = await reviewApi.getByProvider(id, pagination.page + 1);
      setReviews((prev) => [...prev, ...res.data.reviews]);
      setPagination(res.data.pagination);
    } catch {
      /* el botón sigue disponible para reintentar */
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <PageLoader />;

  if (notFound) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<UserX className="h-7 w-7" />} title="Este perfil no está disponible" action={<Link to="/profesionales" className="btn-primary">Ver otros profesionales</Link>}>
          Puede que el profesional haya desactivado su cuenta.
        </EmptyState>
      </div>
    );
  }

  if (error || !provider) {
    return <div className="container-page py-12"><ErrorState message={error || 'No pudimos cargar el perfil.'} onRetry={load} /></div>;
  }

  const isOwnProfile = myProviderId === provider.id;
  const place = [provider.municipality_name, provider.province_name].filter(Boolean).join(', ');
  const hasMore = pagination ? pagination.page < pagination.totalPages : false;

  const contactExtras = (provider.telegram || provider.email_contact) && (
    <ul className="space-y-2 border-t border-sand-200 pt-4 text-sm">
      {provider.telegram && (
        <li>
          <a href={`https://t.me/${provider.telegram.replace(/^@/, '').replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-ink-600 hover:text-ink-900">
            <Send className="h-4 w-4 text-sky-500" aria-hidden="true" /> Telegram <span className="truncate text-ink-400">{provider.telegram}</span>
          </a>
        </li>
      )}
      {provider.email_contact && (
        <li>
          <a href={`mailto:${provider.email_contact}`} className="flex items-center gap-2 text-ink-600 hover:text-ink-900">
            <Mail className="h-4 w-4 text-ink-400" aria-hidden="true" /> <span className="truncate">{provider.email_contact}</span>
          </a>
        </li>
      )}
    </ul>
  );

  return (
    <div className="pb-28 md:pb-10">
      <div className="relative h-40 overflow-hidden bg-sand-100 sm:h-56">
        <CoverImage src={provider.cover} seed={provider.categories[0] ?? name} alt="" eager />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 via-ink-950/10 to-transparent" />
        <div className="container-page relative pt-4">
          <Link to="/profesionales" className="btn-sm inline-flex items-center gap-1 rounded-xl bg-white/90 px-3 py-1.5 font-semibold text-ink-800 shadow-sm backdrop-blur sm:hidden">
            <ArrowLeft className="h-4 w-4" /> Profesionales
          </Link>
        </div>
      </div>

      <div className="container-page">
        <header className="relative -mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          <Avatar src={provider.avatar_url} name={name} size="xl" square className="border-4 border-paper shadow-card" />
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="hidden sm:mb-2 sm:block">
              <Breadcrumbs items={[{ label: 'Inicio', to: '/' }, { label: 'Profesionales', to: '/profesionales' }, { label: name }]} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-balance text-3xl font-bold leading-tight">{name}</h1>
              <PlanBadge plan={provider.subscription_plan} />
              {provider.kind === 'negocio' && <NegocioChip />}
            </div>
            {provider.business_name && <p className="text-ink-500">{provider.owner_name}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-500">
              <RatingInline rating={provider.rating} count={provider.review_count} />
              {place && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden="true" /> {place}</span>}
              {provider.years_experience > 0 && <span className="flex items-center gap-1"><Briefcase className="h-4 w-4" aria-hidden="true" /> {provider.years_experience} años de oficio</span>}
              {provider.kind === 'negocio' && provider.horario && <span className="flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden="true" /> {provider.horario}</span>}
              <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" aria-hidden="true" /> En Oficios Cuba desde {memberSince(provider.created_at)}</span>
            </div>
          </div>
        </header>

        {isOwnProfile && (
          <div className="mt-5 rounded-xl border border-sand-300 bg-sand-100 px-4 py-3 text-sm text-ink-700">
            Así ven los clientes tu perfil. <Link to="/dashboard/perfil" className="link">Editar perfil</Link>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-10">
            <section aria-labelledby="about-title">
              <h2 id="about-title" className="mb-3 text-xl font-bold">Sobre {provider.business_name ? 'el negocio' : 'mí'}</h2>
              {provider.description ? (
                <p className="whitespace-pre-line leading-relaxed text-ink-700">{provider.description}</p>
              ) : (
                <p className="text-ink-400">Este profesional aún no ha escrito una presentación.</p>
              )}
              {provider.categories.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Especialidades">
                  {provider.categories.map((c) => <li key={c} className="badge bg-white font-medium text-ink-700 shadow-sm">{c}</li>)}
                </ul>
              )}
            </section>

            {provider.gallery?.length > 0 && (
              <section aria-labelledby="gallery-title">
                <h2 id="gallery-title" className="mb-4 text-xl font-bold">Fotos {provider.kind === 'negocio' ? 'del negocio' : 'de mis trabajos'}</h2>
                <GalleryGrid images={provider.gallery} name={name} />
              </section>
            )}

            {(provider.address || (provider.lat != null && provider.lng != null)) && (
              <section aria-labelledby="where-title">
                <h2 id="where-title" className="mb-3 text-xl font-bold">Dónde {provider.kind === 'negocio' ? 'estamos' : 'estoy'}</h2>
                {provider.address && (
                  <p className="mb-3 flex items-start gap-2 text-ink-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" /> {[provider.address, place].filter(Boolean).join(', ')}</p>
                )}
                {provider.lat != null && provider.lng != null && (
                  <Suspense fallback={<div className="skeleton h-56 w-full rounded-2xl" />}>
                    <div className="relative z-0 overflow-hidden rounded-2xl border border-sand-200">
                      <PlaceMap lat={provider.lat} lng={provider.lng} label={name} />
                    </div>
                  </Suspense>
                )}
              </section>
            )}

            <section aria-labelledby="services-title">
              <h2 id="services-title" className="mb-4 text-xl font-bold">
                Servicios <span className="font-sans text-base font-semibold text-ink-400">({services.length})</span>
              </h2>
              {services.length === 0 ? (
                <EmptyState icon={<Wrench className="h-6 w-6" />} title="Sin servicios publicados">
                  Puedes contactarle igualmente para consultar un trabajo.
                </EmptyState>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {services.map((s) => <ServiceRow key={s.id} service={s} />)}
                </div>
              )}
            </section>

            {vendedor && <ProviderCatalog vendedor={vendedor} />}

            {areas.length > 0 && (
              <section aria-labelledby="areas-title" className="lg:hidden">
                <h2 id="areas-title" className="mb-3 text-xl font-bold">Zonas donde trabaja</h2>
                <AreasList areas={areas} />
              </section>
            )}

            <section id="resenas" aria-labelledby="reviews-title" className="card scroll-mt-24 p-5 sm:p-6">
              <h2 id="reviews-title" className="mb-5 text-xl font-bold">Reseñas</h2>
              {provider.review_count > 0 && (
                <div className="mb-6 border-b border-sand-200 pb-6">
                  <RatingBreakdown rating={provider.rating} count={provider.review_count} distribution={distribution} />
                </div>
              )}
              {reviews.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">Todavía no tiene reseñas. Los clientes que lo contacten por WhatsApp, llamada, chat o cita podrán valorarlo.</p>
              ) : (
                <>
                  <ul className="divide-y divide-sand-200">
                    {reviews.map((r) => <ReviewItem key={r.id} review={r} showService />)}
                  </ul>
                  {hasMore && (
                    <button onClick={loadMore} disabled={loadingMore} className="btn-secondary mt-6 w-full">
                      {loadingMore && <Spinner className="h-4 w-4" />} Ver más reseñas
                    </button>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <div className="card hidden space-y-4 p-6 md:block lg:sticky lg:top-24">
              <h2 className="text-lg font-bold">Contactar</h2>
              {isOwnProfile ? (
                <Link to="/dashboard/perfil" className="btn-secondary w-full">Editar mi perfil</Link>
              ) : (
                <ContactActions
                  providerId={provider.id}
                  providerName={name}
                  phone={provider.whatsapp}
                  contactMode={provider.contact_mode}
                  hasChat={provider.has_chat}
                  hasAgenda={provider.has_agenda}
                />
              )}
              {contactExtras}
            </div>
            {contactExtras && <div className="card p-5 md:hidden">{contactExtras}</div>}
            {areas.length > 0 && (
              <div className="card hidden p-6 lg:block">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">Zonas donde trabaja</h2>
                <AreasList areas={areas} />
              </div>
            )}
          </aside>
        </div>
      </div>

      {!isOwnProfile && (
        <ContactActions
          variant="bar"
          providerId={provider.id}
          providerName={name}
          phone={provider.whatsapp}
          contactMode={provider.contact_mode}
          hasChat={provider.has_chat}
          hasAgenda={provider.has_agenda}
        />
      )}
    </div>
  );
}
