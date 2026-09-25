import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, MessageCircle, Search, ShieldCheck, Star, UserRoundSearch } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { providerApi, provinceApi, serviceApi, statsApi } from '../services/api';
import type { CategoryStat, ProviderCard as ProviderCardType, Province, ServiceSummary, SiteStats } from '../types';
import { ProviderCard, ProviderCardSkeleton, ServiceCard, ServiceCardSkeleton } from '../components/cards';
import { SectionHeading, cn } from '../components/ui';

const POPULAR = ['Electricista', 'Plomero', 'Mecánico', 'Clases', 'Peluquería', 'Aire acondicionado'];

const HERO_IMAGES = [
  { src: '/demo/electricidad-1.webp', label: 'Electricidad' },
  { src: '/demo/reposteria-1.webp', label: 'Repostería' },
  { src: '/demo/mecanica-1.webp', label: 'Mecánica' },
  { src: '/demo/salon-1.webp', label: 'Belleza' },
];

function Hero({ provinces }: { provinces: Province[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [province, setProvince] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (province) params.set('province', province);
    navigate(`/buscar${params.toString() ? `?${params}` : ''}`);
  };

  return (
    <section className="relative overflow-hidden border-b border-sand-200">
      <div className="pointer-events-none absolute inset-0 opacity-[.35]" aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #DDD0BB 1px, transparent 0)', backgroundSize: '22px 22px' }} />
      <div className="container-page relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:py-20">
        <div className="animate-fade-up">
          <p className="eyebrow mb-4">Directorio de oficios · Toda Cuba</p>
          <h1 className="text-balance text-[2.4rem] font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
            El que te lo soluciona <span className="text-brand-600">vive cerca.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-500">
            Electricistas, mecánicos, costureras, profesores y cientos de oficios más. Mira sus trabajos, lee reseñas reales y escríbeles directo.
          </p>

          <form onSubmit={submit} role="search" className="mt-8 flex flex-col gap-2 rounded-2xl border border-sand-300 bg-white p-2 shadow-lift sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">¿Qué necesitas?</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="¿Qué necesitas? Ej: electricista"
                className="w-full rounded-xl border-0 bg-transparent py-3 pl-11 pr-3 text-[15px] placeholder:text-ink-300 focus:outline-none focus:ring-0"
              />
            </label>
            <div className="hidden h-8 w-px bg-sand-200 sm:block" aria-hidden="true" />
            <label className="relative sm:w-52">
              <span className="sr-only">Provincia</span>
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full appearance-none rounded-xl border-0 bg-sand-100 py-3 pl-11 pr-3 text-[15px] text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:bg-transparent"
              >
                <option value="">Toda Cuba</option>
                {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <button type="submit" className="btn-primary btn-lg">Buscar</button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-400">Lo más buscado:</span>
            {POPULAR.map((term) => (
              <Link key={term} to={`/buscar?q=${encodeURIComponent(term)}`} className="chip py-1 text-[13px]">{term}</Link>
            ))}
          </div>
        </div>

        <div className="relative hidden lg:block" aria-hidden="true">
          <div className="grid grid-cols-2 gap-4">
            {HERO_IMAGES.map((img, i) => (
              <figure
                key={img.src}
                className={cn('relative overflow-hidden rounded-3xl border-4 border-white shadow-lift', i % 2 === 1 && 'translate-y-10', i === 0 ? 'rotate-[-2deg]' : i === 3 ? 'rotate-[2deg]' : '')}
              >
                <img src={img.src} alt="" className="aspect-[4/5] w-full object-cover" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                <figcaption className="badge absolute bottom-3 left-3 bg-white/95 text-ink-800 shadow-sm">{img.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="absolute -left-6 top-1/2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lift">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100"><Star className="h-5 w-5 fill-amber-400 text-amber-400" /></span>
            <span className="text-sm leading-tight"><b className="block text-ink-900">Reseñas reales</b><span className="text-ink-400">solo de quien contrató</span></span>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsStrip({ stats }: { stats: SiteStats | null }) {
  const items = [
    { label: 'profesionales', value: stats?.providers },
    { label: 'servicios publicados', value: stats?.services },
    { label: 'provincias con oficios', value: stats?.provinces },
    { label: 'valoración media', value: stats?.avg_rating != null ? `${stats.avg_rating.toFixed(1)}★` : stats ? '—' : undefined },
  ];
  return (
    <section className="bg-ink-950 text-white">
      <dl className="container-page grid grid-cols-2 gap-y-6 py-8 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col-reverse text-center sm:border-l sm:border-white/10 sm:first:border-l-0">
            <dt className="text-xs text-ink-300 sm:text-sm">{it.label}</dt>
            <dd className="font-display text-3xl font-bold text-white sm:text-4xl">
              {it.value ?? <span className="skeleton inline-block h-8 w-12 bg-white/10" />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Categories({ categories, loading }: { categories: CategoryStat[]; loading: boolean }) {
  return (
    <section className="container-page py-16">
      <SectionHeading
        eyebrow="Categorías"
        title="¿Qué necesitas resolver?"
        action={<Link to="/buscar" className="link inline-flex items-center gap-1 text-sm">Ver todos los servicios <ArrowRight className="h-4 w-4" /></Link>}
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <li key={i} className="skeleton h-24 rounded-2xl" />)
          : categories.map((c) => (
            <li key={c.id}>
              <Link to={`/buscar?category=${c.slug}`} className="card card-hover group flex h-full items-start gap-3 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl transition group-hover:bg-brand-50" aria-hidden="true">{c.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-snug text-ink-900 group-hover:text-brand-700">{c.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-400">
                    {c.service_count ? `${c.service_count} ${c.service_count === 1 ? 'servicio' : 'servicios'}` : 'Sé el primero'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { icon: UserRoundSearch, title: 'Busca por oficio y lugar', text: 'Filtra por provincia y municipio para encontrar a alguien que llegue rápido.' },
  { icon: ShieldCheck, title: 'Compara con calma', text: 'Fotos de trabajos, precios orientativos y reseñas de clientes que ya contrataron.' },
  { icon: MessageCircle, title: 'Habla directo', text: 'Escríbele por WhatsApp, llámalo o pide cita. Sin intermediarios ni comisiones.' },
];

export default function Home() {
  const { user } = useAuth();
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [featured, setFeatured] = useState<ProviderCardType[]>([]);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [loading, setLoading] = useState({ categories: true, featured: true, services: true });

  useEffect(() => {
    const done = (k: keyof typeof loading) => setLoading((l) => ({ ...l, [k]: false }));
    provinceApi.getAll().then((r) => setProvinces(r.data.provinces)).catch(() => {});
    statsApi.get().then((r) => setStats(r.data.stats)).catch(() => {});
    statsApi.categories().then((r) => setCategories(r.data.categories)).catch(() => {}).finally(() => done('categories'));
    providerApi.getFeatured(6).then((r) => setFeatured(r.data.providers)).catch(() => {}).finally(() => done('featured'));
    serviceApi.getAll({ limit: 8, sort: 'newest' }).then((r) => setServices(r.data.services)).catch(() => {}).finally(() => done('services'));
  }, []);

  return (
    <>
      <Hero provinces={provinces} />
      <StatsStrip stats={stats} />
      <Categories categories={categories} loading={loading.categories} />

      {(loading.featured || featured.length > 0) && (
        <section className="border-y border-sand-200 bg-sand-100/60 py-16">
          <div className="container-page">
            <SectionHeading
              eyebrow="Destacados"
              title="Profesionales con buena mano"
              subtitle="Los mejor valorados por sus clientes."
              action={<Link to="/profesionales" className="link inline-flex items-center gap-1 text-sm">Ver todos <ArrowRight className="h-4 w-4" /></Link>}
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {loading.featured
                ? Array.from({ length: 3 }).map((_, i) => <ProviderCardSkeleton key={i} />)
                : featured.map((p) => <ProviderCard key={p.id} provider={p} />)}
            </div>
          </div>
        </section>
      )}

      {(loading.services || services.length > 0) && (
        <section className="container-page py-16">
          <SectionHeading
            eyebrow="Recién publicados"
            title="Servicios nuevos"
            action={<Link to="/buscar?sort=newest" className="link inline-flex items-center gap-1 text-sm">Ver más <ArrowRight className="h-4 w-4" /></Link>}
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {loading.services
              ? Array.from({ length: 4 }).map((_, i) => <ServiceCardSkeleton key={i} />)
              : services.map((s) => <ServiceCard key={s.id} service={s} />)}
          </div>
        </section>
      )}

      <section className="container-page pb-4 pt-4">
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-3xl border border-sand-200 bg-white p-6">
              <span className="absolute right-5 top-4 font-display text-5xl font-extrabold text-sand-200" aria-hidden="true">{i + 1}</span>
              <s.icon className="h-7 w-7 text-brand-600" aria-hidden="true" />
              <h3 className="mt-4 font-sans text-lg font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {user?.user_type !== 'client' && (
        <section className="container-page pt-12">
          <div className="relative overflow-hidden rounded-4xl bg-brand-600 px-6 py-10 text-white sm:px-12 sm:py-14">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-500/60" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-amber-400/30" aria-hidden="true" />
            <div className="relative max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-100">Para profesionales</p>
              <h2 className="mt-3 text-balance text-3xl font-bold text-white sm:text-4xl">¿Tienes un oficio? Que te encuentren.</h2>
              <p className="mt-3 text-brand-50/90">Anúnciate gratis entrando con tu cuenta de Google: tu nombre, tu logo, tu oficio y tu teléfono. Con el plan Básico ($1 USD/mes) sumas fotos y hasta 5 oficios; con el Profesional ($10 USD/mes), citas, chat y punto de venta.</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {user?.user_type === 'provider' ? (
                  <Link to="/dashboard/servicios/nuevo" className="btn-lg btn bg-white text-brand-700 hover:bg-brand-50">Publicar un servicio</Link>
                ) : (
                  <Link to="/registro?tipo=profesional" className="btn-lg btn bg-white text-brand-700 hover:bg-brand-50">Anunciar mi oficio gratis</Link>
                )}
                <Link to="/planes" className="btn-lg btn border border-white/40 text-white hover:bg-white/10">Ver planes</Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
