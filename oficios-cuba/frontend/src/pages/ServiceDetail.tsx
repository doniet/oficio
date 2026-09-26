import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, ChevronLeft, ChevronRight, Clock, EyeOff, MapPin, MessageSquareText, Pencil, SearchX } from 'lucide-react';
import { useTasa } from '../hooks/useTasa';
import { useAuth } from '../hooks/useAuth';
import { reviewApi, serviceApi, apiError } from '../services/api';
import { priceParts, priceTypeLabel, relativeTime } from '../lib/format';
import type { Review, ServiceDetail as ServiceDetailType, ServiceSummary } from '../types';
import ContactActions from '../components/ContactActions';
import { NegocioChip, ServiceCard } from '../components/cards';
import { ReviewForm, ReviewItem } from '../components/ReviewList';
import { Alert, Avatar, Breadcrumbs, CategoryCover, EmptyState, ErrorState, PageLoader, PlanBadge, RatingInline, cn } from '../components/ui';
import axios from 'axios';

function Gallery({ images, title, seed, icon }: { images: string[]; title: string; seed: string; icon: string }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  // En móvil se desliza con el dedo (scroll-snap); el índice se deduce del scroll.
  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const go = (i: number) => {
    const next = (i + images.length) % images.length;
    setIndex(next);
    const el = track.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  if (images.length === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-3xl sm:aspect-[16/9]">
        <CategoryCover seed={seed} icon={icon} />
      </div>
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl bg-sand-100">
        <div
          ref={track}
          onScroll={onScroll}
          className="scrollbar-none flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto sm:aspect-[16/9]"
          aria-roledescription="carrusel"
          aria-label={`Fotos de ${title}`}
        >
          {images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`${title} — foto ${i + 1} de ${images.length}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button onClick={() => go(index - 1)} className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-800 shadow-card hover:bg-white sm:flex" aria-label="Foto anterior">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => go(index + 1)} className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-800 shadow-card hover:bg-white sm:flex" aria-label="Foto siguiente">
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="badge absolute bottom-3 right-3 bg-ink-900/70 text-white backdrop-blur" aria-live="polite">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              onClick={() => go(i)}
              className={cn('h-16 w-20 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-paper transition', i === index ? 'ring-brand-500' : 'ring-transparent opacity-70 hover:opacity-100')}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === index}
            >
              <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewsSection({ service, reviews, onCreated }: { service: ServiceDetailType; reviews: Review[]; onCreated: (r: Review) => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const [eligibility, setEligibility] = useState<{ can_review: boolean; reason: string | null } | null>(null);

  useEffect(() => {
    if (user?.user_type !== 'client') return;
    reviewApi.eligibility(service.id).then((r) => setEligibility(r.data)).catch(() => setEligibility(null));
  }, [user, service.id]);

  return (
    <section aria-labelledby="reviews-title" className="card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-title" className="text-xl font-bold">Reseñas del servicio</h2>
          <RatingInline rating={service.rating} count={service.review_count} className="mt-1" />
          {service.review_count > 0 && <span className="ml-1 text-xs text-ink-400">(valoración general del profesional)</span>}
        </div>
        {service.review_count > reviews.length && (
          <Link to={`/proveedor/${service.provider_id}#resenas`} className="link text-sm">Ver todas las reseñas</Link>
        )}
      </div>

      {eligibility?.can_review && (
        <div className="mb-6">
          <ReviewForm
            serviceId={service.id}
            onCreated={(r) => {
              setEligibility({ can_review: false, reason: 'Ya reseñaste este servicio' });
              onCreated(r);
            }}
          />
        </div>
      )}
      {eligibility && !eligibility.can_review && eligibility.reason && (
        <div className="mb-6"><Alert tone="info">{eligibility.reason}</Alert></div>
      )}
      {!user && (
        <p className="mb-6 text-sm text-ink-500">
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="link">Entra con tu cuenta de cliente</Link> para dejar una reseña después de contactar al profesional.
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">Este servicio todavía no tiene reseñas. ¡Sé el primero en contar tu experiencia!</p>
      ) : (
        <ul className="divide-y divide-sand-200">
          {reviews.map((r) => <ReviewItem key={r.id} review={r} />)}
        </ul>
      )}
    </section>
  );
}

function PriceBlock({ service, big }: { service: ServiceDetailType; big?: boolean }) {
  const tasa = useTasa();
  const p = priceParts(service, tasa);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{priceTypeLabel[service.price_type]}</p>
      <p className={cn('font-display font-bold text-ink-900', big ? 'text-3xl' : 'text-2xl')}>
        {p.main}
        {p.suffix && <span className="ml-1 text-base font-semibold text-ink-400">{p.suffix}</span>}
      </p>
      {p.alt && <p className="mt-0.5 text-sm text-ink-500">{p.alt} <span className="text-ink-400">· tasa informal</span></p>}
    </div>
  );
}

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [service, setService] = useState<ServiceDetailType | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<ServiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await serviceApi.getById(id);
      setService(res.data.service);
      setReviews(res.data.reviews);
      setRelated(res.data.related);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true);
      else setError(apiError(err, 'No pudimos cargar el servicio.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    window.scrollTo(0, 0);
  }, [load]);

  useEffect(() => {
    if (service) document.title = `${service.title} · Oficios Cuba`;
    return () => { document.title = 'Oficios Cuba'; };
  }, [service]);

  if (loading) return <PageLoader />;

  if (notFound) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<SearchX className="h-7 w-7" />} title="Este servicio ya no está disponible" action={<Link to="/buscar" className="btn-primary">Buscar otros servicios</Link>}>
          Puede que el profesional lo haya pausado o eliminado.
        </EmptyState>
      </div>
    );
  }

  if (error || !service) {
    return <div className="container-page py-12"><ErrorState message={error || 'No pudimos cargar el servicio.'} onRetry={load} /></div>;
  }

  const providerName = service.business_name || service.owner_name;
  const place = [service.municipality_name, service.province_name].filter(Boolean).join(', ');
  const category = service.parent_category_slug
    ? { label: service.parent_category_name ?? '', to: `/buscar?category=${service.parent_category_slug}` }
    : null;

  return (
    <div className={cn('container-page py-6 sm:py-8', !service.is_owner && 'pb-28 md:pb-8')}>
      <div className="mb-5 flex items-center gap-3">
        <Link to="/buscar" className="btn-ghost btn-sm -ml-3 sm:hidden" aria-label="Volver a la búsqueda">
          <ArrowLeft className="h-4 w-4" /> Buscar
        </Link>
        <div className="hidden sm:block">
          <Breadcrumbs
            items={[
              { label: 'Inicio', to: '/' },
              { label: 'Buscar', to: '/buscar' },
              ...(category ? [category] : []),
              { label: service.category_name, to: `/buscar?category=${service.category_slug}` },
              { label: service.title },
            ]}
          />
        </div>
      </div>

      {service.is_owner && (
        <div className="mb-6">
          <Alert tone={service.is_active ? 'info' : 'error'}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {!service.is_active && <EyeOff className="h-4 w-4" />}
                {service.is_active ? 'Así ven los clientes tu servicio.' : 'Este servicio está pausado: los clientes no pueden verlo.'}
              </span>
              <Link to={`/dashboard/servicios/${service.id}/editar`} className="btn-secondary btn-sm">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Link>
            </div>
          </Alert>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <Gallery images={service.images} title={service.title} seed={service.parent_category_slug || service.category_slug} icon={service.category_icon} />

          <header>
            <Link to={`/buscar?category=${service.category_slug}`} className="badge bg-sand-100 text-ink-700 hover:bg-sand-200">
              <span aria-hidden="true">{service.category_icon}</span> {service.category_name}
            </Link>
            <h1 className="mt-3 text-balance text-3xl font-bold leading-tight sm:text-4xl">{service.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-500">
              <RatingInline rating={service.rating} count={service.review_count} />
              {place && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden="true" /> {place}</span>}
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden="true" /> Publicado {relativeTime(service.created_at)}</span>
            </div>
            <div className="mt-5 rounded-2xl bg-white p-4 shadow-card lg:hidden">
              <PriceBlock service={service} />
              {/* Entre md y lg no hay barra inferior ni columna lateral: el contacto va aquí. */}
              {!service.is_owner && (
                <div className="mt-4 hidden md:block">
                  <ContactActions
                    providerId={service.provider_id}
                    providerName={providerName}
                    serviceId={service.id}
                    serviceTitle={service.title}
                    phone={service.whatsapp}
                    contactMode={service.contact_mode}
                    hasChat={service.has_chat}
                    hasAgenda={service.has_agenda}
                  />
                </div>
              )}
            </div>
          </header>

          <section aria-labelledby="desc-title">
            <h2 id="desc-title" className="mb-3 text-xl font-bold">Sobre este servicio</h2>
            {service.description ? (
              <p className="whitespace-pre-line leading-relaxed text-ink-700">{service.description}</p>
            ) : (
              <p className="text-ink-400">El profesional no añadió una descripción. Escríbele para conocer los detalles.</p>
            )}
          </section>

          <section aria-labelledby="pro-title" className="card p-5 sm:p-6">
            <h2 id="pro-title" className="sr-only">Sobre el profesional</h2>
            <div className="flex items-start gap-4">
              <Avatar src={service.avatar_url} name={providerName} size="lg" square />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/proveedor/${service.provider_id}`} className="text-lg font-bold text-ink-900 hover:text-brand-700">{providerName}</Link>
                  <PlanBadge plan={service.subscription_plan} />
                  {service.kind === 'negocio' && <NegocioChip />}
                </div>
                {service.business_name && <p className="text-sm text-ink-500">{service.owner_name}</p>}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-500">
                  <RatingInline rating={service.rating} count={service.review_count} />
                  {service.years_experience > 0 && (
                    <span className="flex items-center gap-1"><Briefcase className="h-4 w-4" aria-hidden="true" /> {service.years_experience} años de oficio</span>
                  )}
                  {service.kind === 'negocio' && service.horario && (
                    <span className="flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden="true" /> {service.horario}</span>
                  )}
                </div>
              </div>
            </div>
            {service.provider_description && (
              <p className="mt-4 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-ink-600">{service.provider_description}</p>
            )}
            <Link to={`/proveedor/${service.provider_id}`} className="btn-secondary mt-5 w-full sm:w-auto">Ver perfil completo</Link>
          </section>

          <ReviewsSection service={service} reviews={reviews} onCreated={(r) => setReviews((prev) => [r, ...prev])} />
        </div>

        <aside className="hidden lg:block">
          <div className="card sticky top-24 space-y-5 p-6">
            <PriceBlock service={service} big />
            {!service.is_owner && (
              <ContactActions
                providerId={service.provider_id}
                providerName={providerName}
                serviceId={service.id}
                serviceTitle={service.title}
                phone={service.whatsapp}
                contactMode={service.contact_mode}
                hasChat={service.has_chat}
                hasAgenda={service.has_agenda}
              />
            )}
            <p className="flex items-start gap-2 border-t border-sand-200 pt-4 text-xs leading-relaxed text-ink-400">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Acuerda precio, fecha y lugar {service.has_chat ? 'por el chat' : 'por WhatsApp o por teléfono'} antes de empezar el trabajo. Oficios Cuba no cobra comisión.
            </p>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-14">
          <h2 id="related-title" className="mb-5 text-2xl font-bold">Otros profesionales de {service.parent_category_name || service.category_name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((s) => <ServiceCard key={s.id} service={s} />)}
          </div>
        </section>
      )}

      {!service.is_owner && (
        <ContactActions
          variant="bar"
          providerId={service.provider_id}
          providerName={providerName}
          serviceId={service.id}
          serviceTitle={service.title}
          phone={service.whatsapp}
          contactMode={service.contact_mode}
          hasChat={service.has_chat}
          hasAgenda={service.has_agenda}
        />
      )}
    </div>
  );
}
