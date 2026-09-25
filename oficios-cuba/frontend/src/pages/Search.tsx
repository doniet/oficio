import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Map as MapIcon, Search as SearchIcon, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { categoryApi, provinceApi, serviceApi, apiError } from '../services/api';
import type { Category, Municipality, Pagination, PriceType, Province, ServiceSummary } from '../types';
import { cup, plural, priceTypeLabel } from '../lib/format';
import { ServiceCard, ServiceCardSkeleton } from '../components/cards';
import { EmptyState, ErrorState, Modal, PageLoader, cn } from '../components/ui';

// Leaflet pesa ~150 KB: solo se descarga si el usuario abre el mapa.
const ProvinceMapSelector = lazy(() => import('../components/ProvinceMapSelector'));

const SORTS = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'rating', label: 'Mejor valorados' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'newest', label: 'Más recientes' },
];

const PRICE_CAPS = [2000, 5000, 10000, 25000, 50000];
const PRICE_TYPES: PriceType[] = ['fixed', 'hourly', 'daily', 'negotiable'];
const FILTER_KEYS = ['category', 'province', 'municipality', 'price_max', 'price_type'] as const;
const PAGE_SIZE = 12;

function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  // Cualquier cambio de filtro vuelve a la página 1; cambiar de provincia invalida el municipio.
  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    if ('province' in patch && !('municipality' in patch) && patch.province !== params.get('province')) next.delete('municipality');
    if (!keepPage) next.delete('page');
    setParams(next);
  };
  return { params, get, update };
}

function FilterBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-sand-200 pb-5 last:border-0">
      <legend className="mb-2.5 text-sm font-bold text-ink-800">{title}</legend>
      {children}
    </fieldset>
  );
}

function Filters({ categories, provinces, municipalities, get, update, onOpenMap }: {
  categories: Category[]; provinces: Province[]; municipalities: Municipality[];
  get: (k: string) => string; update: (p: Record<string, string | null>) => void; onOpenMap: () => void;
}) {
  return (
    <div className="space-y-5">
      <FilterBlock title="Categoría">
        <select className="input" value={get('category')} onChange={(e) => update({ category: e.target.value || null })} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <optgroup key={c.id} label={`${c.icon} ${c.name}`}>
              <option value={c.slug}>Todo en {c.name}</option>
              {c.subcategories?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
      </FilterBlock>

      <FilterBlock title="Ubicación">
        <div className="space-y-2">
          <select className="input" value={get('province')} onChange={(e) => update({ province: e.target.value || null })} aria-label="Provincia">
            <option value="">Toda Cuba</option>
            {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {get('province') && (
            <select className="input" value={get('municipality')} onChange={(e) => update({ municipality: e.target.value || null })} aria-label="Municipio">
              <option value="">Todos los municipios</option>
              {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <button type="button" onClick={onOpenMap} className="btn-ghost btn-sm -ml-2 text-brand-700">
            <MapIcon className="h-4 w-4" /> Elegir en el mapa
          </button>
        </div>
      </FilterBlock>

      <FilterBlock title="Precio máximo (CUP)">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => update({ price_max: null })} className={cn('chip', !get('price_max') && 'chip-active')}>Cualquiera</button>
          {PRICE_CAPS.map((n) => (
            <button key={n} type="button" onClick={() => update({ price_max: String(n) })} className={cn('chip', get('price_max') === String(n) && 'chip-active')}>
              {cup(n).replace(' CUP', '')}
            </button>
          ))}
        </div>
      </FilterBlock>

      <FilterBlock title="Tipo de precio">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => update({ price_type: null })} className={cn('chip', !get('price_type') && 'chip-active')}>Todos</button>
          {PRICE_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => update({ price_type: t })} className={cn('chip', get('price_type') === t && 'chip-active')}>
              {priceTypeLabel[t]}
            </button>
          ))}
        </div>
      </FilterBlock>
    </div>
  );
}

function MapModal({ open, onClose, provinces, initialProvince, initialMunicipality, onApply }: {
  open: boolean; onClose: () => void; provinces: Province[];
  initialProvince: string; initialMunicipality: string; onApply: (province: string | null, municipality: string | null) => void;
}) {
  const [province, setProvince] = useState<Province | null>(null);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);

  useEffect(() => {
    if (!open) return;
    setProvince(provinces.find((p) => p.id === initialProvince) ?? null);
    setMunicipality(null);
  }, [open, provinces, initialProvince]);

  useEffect(() => {
    setMunicipalities([]);
    if (!province) return;
    let alive = true;
    provinceApi.getMunicipalities(province.id).then((r) => {
      if (!alive) return;
      const list: Municipality[] = r.data.municipalities;
      setMunicipalities(list);
      if (province.id === initialProvince && initialMunicipality) {
        setMunicipality((cur) => cur ?? list.find((m) => m.id === initialMunicipality) ?? null);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [province, initialProvince, initialMunicipality]);

  return (
    <Modal open={open} onClose={onClose} title="Elige dónde buscar" size="lg">
      {open && (
        <Suspense fallback={<PageLoader />}>
          <ProvinceMapSelector
            provinces={provinces}
            municipalities={municipalities}
            selectedProvince={province}
            setSelectedProvince={setProvince}
            selectedMunicipality={municipality}
            setSelectedMunicipality={setMunicipality}
            onConfirm={() => { onApply(province?.id ?? null, municipality?.id ?? null); onClose(); }}
          />
        </Suspense>
      )}
    </Modal>
  );
}

function Pager({ pagination, onPage }: { pagination: Pagination; onPage: (p: number) => void }) {
  const { page, totalPages } = pagination;
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="Paginación">
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="btn-secondary btn-sm h-9 w-9 px-0" aria-label="Página anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-ink-300">…</span>}
          <button
            onClick={() => onPage(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn('btn-sm h-9 min-w-9 px-2', p === page ? 'btn-dark' : 'btn-secondary')}
          >
            {p}
          </button>
        </span>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="btn-secondary btn-sm h-9 w-9 px-0" aria-label="Página siguiente">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export default function Search() {
  const { params, get, update } = useUrlFilters();
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [q, setQ] = useState(get('q'));

  const province = get('province');
  const key = params.toString();

  useEffect(() => { setQ(get('q')); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    provinceApi.getAll().then((r) => setProvinces(r.data.provinces)).catch(() => {});
    categoryApi.getAll().then((r) => setCategories(r.data.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setMunicipalities([]);
    if (!province) return;
    let alive = true;
    provinceApi.getMunicipalities(province).then((r) => alive && setMunicipalities(r.data.municipalities)).catch(() => {});
    return () => { alive = false; };
  }, [province]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    serviceApi.getAll({
      q: get('q') || undefined,
      category: get('category') || undefined,
      province_id: province || undefined,
      municipality_id: get('municipality') || undefined,
      price_max: get('price_max') || undefined,
      price_type: get('price_type') || undefined,
      sort: get('sort') || undefined,
      page: Number(get('page')) || 1,
      limit: PAGE_SIZE,
    })
      .then((r) => {
        if (!alive) return;
        setServices(r.data.services);
        setPagination(r.data.pagination);
      })
      .catch((err) => alive && setError(apiError(err, 'No pudimos cargar los servicios.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryLabel = useMemo(() => {
    const slug = get('category');
    if (!slug) return '';
    for (const c of categories) {
      if (c.slug === slug) return c.name;
      const sub = c.subcategories?.find((s) => s.slug === slug);
      if (sub) return sub.name;
    }
    return slug;
  }, [categories, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (get('q')) chips.push({ key: 'q', label: `“${get('q')}”`, clear: { q: null } });
  if (get('category')) chips.push({ key: 'category', label: categoryLabel, clear: { category: null } });
  if (province) chips.push({ key: 'province', label: provinces.find((p) => p.id === province)?.name ?? 'Provincia', clear: { province: null } });
  if (get('municipality')) chips.push({ key: 'municipality', label: municipalities.find((m) => m.id === get('municipality'))?.name ?? 'Municipio', clear: { municipality: null } });
  if (get('price_max')) chips.push({ key: 'price_max', label: `Hasta ${cup(Number(get('price_max')))}`, clear: { price_max: null } });
  if (get('price_type')) chips.push({ key: 'price_type', label: priceTypeLabel[get('price_type') as PriceType] ?? get('price_type'), clear: { price_type: null } });

  const activeFilters = FILTER_KEYS.filter((k) => get(k)).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: q.trim() || null });
  };

  const goPage = (p: number) => {
    update({ page: p > 1 ? String(p) : null }, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const title = categoryLabel || (get('q') ? `Resultados para “${get('q')}”` : 'Explorar servicios');
  const filterProps = { categories, provinces, municipalities, get, update, onOpenMap: () => { setFiltersOpen(false); setMapOpen(true); } };

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-balance text-3xl font-bold sm:text-4xl">{title}</h1>
        <form onSubmit={submit} role="search" className="mt-5 flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Buscar servicios</span>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Electricista, clases de inglés, arreglo de celulares…"
              className="input py-3 pl-11"
            />
          </label>
          <button type="submit" className="btn-primary px-5">Buscar</button>
        </form>
      </div>

      <div className="grid gap-8 lg:grid-cols-[16.5rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filtros">
          <div className="sticky top-24 rounded-2xl border border-sand-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-base font-bold">Filtros</h2>
              {activeFilters > 0 && (
                <button onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} className="text-sm font-semibold text-brand-700 hover:underline">
                  Limpiar
                </button>
              )}
            </div>
            <Filters {...filterProps} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500" aria-live="polite">
              {loading && !pagination ? 'Buscando…' : pagination ? plural(pagination.total, 'servicio encontrado', 'servicios encontrados') : ''}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setFiltersOpen(true)} className="btn-secondary lg:hidden">
                <SlidersHorizontal className="h-4 w-4" /> Filtros
                {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] leading-5 text-white">{activeFilters}</span>}
              </button>
              <label className="sr-only" htmlFor="sort">Ordenar por</label>
              <select id="sort" value={get('sort') || 'relevance'} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} className="input w-auto py-2 text-sm">
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button key={c.key} onClick={() => update(c.clear)} className="chip border-ink-200 bg-ink-50 py-1 text-[13px]" aria-label={`Quitar filtro ${c.label}`}>
                  {c.label} <X className="h-3.5 w-3.5 text-ink-400" />
                </button>
              ))}
            </div>
          )}

          {error ? (
            <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
          ) : loading && services.length === 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <ServiceCardSkeleton key={i} />)}
            </div>
          ) : services.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title="No encontramos servicios con esos filtros"
              action={chips.length > 0 ? (
                <button onClick={() => update({ q: null, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])) })} className="btn-secondary">Quitar todos los filtros</button>
              ) : (
                <Link to="/profesionales" className="btn-secondary">Ver profesionales</Link>
              )}
            >
              Prueba con otra palabra, amplía la zona a toda la provincia o quita el límite de precio.
            </EmptyState>
          ) : (
            <>
              <div className={cn('grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3', loading && 'opacity-50')} aria-busy={loading}>
                {services.map((s) => <ServiceCard key={s.id} service={s} />)}
              </div>
              {pagination && <Pager pagination={pagination} onPage={goPage} />}
            </>
          )}
        </div>
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros">
        <Filters {...filterProps} />
        <div className="sticky -bottom-6 -mx-6 mt-6 flex gap-2 border-t border-sand-200 bg-white px-6 py-4">
          <button onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} className="btn-secondary flex-1" disabled={!activeFilters}>Limpiar</button>
          <button onClick={() => setFiltersOpen(false)} className="btn-primary flex-[2]">
            {pagination ? `Ver ${plural(pagination.total, 'resultado', 'resultados')}` : 'Ver resultados'}
          </button>
        </div>
      </Modal>

      <MapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        provinces={provinces}
        initialProvince={province}
        initialMunicipality={get('municipality')}
        onApply={(p, m) => update({ province: p, municipality: m })}
      />
    </div>
  );
}
