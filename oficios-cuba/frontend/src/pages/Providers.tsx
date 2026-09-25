import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search as SearchIcon, UsersRound } from 'lucide-react';
import { categoryApi, providerApi, provinceApi, apiError } from '../services/api';
import type { Category, Pagination, ProviderCard as ProviderCardType, Province } from '../types';
import { plural } from '../lib/format';
import { ProviderCard, ProviderCardSkeleton } from '../components/cards';
import { EmptyState, ErrorState, cn } from '../components/ui';

const SORTS = [
  { value: 'relevance', label: 'Destacados' },
  { value: 'rating', label: 'Mejor valorados' },
  { value: 'reviews', label: 'Más reseñas' },
  { value: 'newest', label: 'Recién llegados' },
];

const PAGE_SIZE = 12;

export default function Providers() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<ProviderCardType[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState(get('q'));
  const key = params.toString();

  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    if (!keepPage) next.delete('page');
    setParams(next);
  };

  useEffect(() => { setQ(get('q')); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    provinceApi.getAll().then((r) => setProvinces(r.data.provinces)).catch(() => {});
    categoryApi.getAll().then((r) => setCategories(r.data.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    providerApi.getAll({
      q: get('q') || undefined,
      province_id: get('province') || undefined,
      category: get('category') || undefined,
      sort: get('sort') || undefined,
      page: Number(get('page')) || 1,
      limit: PAGE_SIZE,
    })
      .then((r) => {
        if (!alive) return;
        setProviders(r.data.providers);
        setPagination(r.data.pagination);
      })
      .catch((err) => alive && setError(apiError(err, 'No pudimos cargar los profesionales.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: q.trim() || null });
  };

  const goPage = (p: number) => {
    update({ page: p > 1 ? String(p) : null }, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasFilters = Boolean(get('q') || get('province') || get('category'));
  const page = pagination?.page ?? 1;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="max-w-2xl">
        <p className="eyebrow mb-2">Profesionales</p>
        <h1 className="text-balance text-3xl font-bold sm:text-4xl">Gente de oficio en toda Cuba</h1>
        <p className="mt-2 text-ink-500">Conoce a quién contratas: su experiencia, sus trabajos y lo que opinan sus clientes.</p>
      </div>

      <div className="mt-6 grid gap-2 rounded-2xl border border-sand-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
        <form onSubmit={submit} role="search" className="relative sm:col-span-2 lg:col-span-1">
          <label className="sr-only" htmlFor="provider-q">Buscar por nombre o negocio</label>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input
            id="provider-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q.trim() !== get('q') && update({ q: q.trim() || null })}
            placeholder="Nombre o negocio"
            className="input pl-11"
          />
        </form>
        <select className="input" value={get('province')} onChange={(e) => update({ province: e.target.value || null })} aria-label="Provincia">
          <option value="">Toda Cuba</option>
          {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={get('category')} onChange={(e) => update({ category: e.target.value || null })} aria-label="Categoría">
          <option value="">Todos los oficios</option>
          {categories.map((c) => (
            <optgroup key={c.id} label={`${c.icon} ${c.name}`}>
              <option value={c.slug}>Todo en {c.name}</option>
              {c.subcategories?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select className="input sm:col-span-2 lg:col-span-1 lg:w-44" value={get('sort') || 'relevance'} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} aria-label="Ordenar por">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="mb-5 mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500" aria-live="polite">
          {pagination ? plural(pagination.total, 'profesional', 'profesionales') : 'Buscando…'}
        </p>
        {hasFilters && (
          <button onClick={() => update({ q: null, province: null, category: null })} className="text-sm font-semibold text-brand-700 hover:underline">
            Quitar filtros
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : loading && providers.length === 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <ProviderCardSkeleton key={i} />)}
        </div>
      ) : providers.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="Aún no hay profesionales con esos filtros"
          action={hasFilters
            ? <button onClick={() => update({ q: null, province: null, category: null })} className="btn-secondary">Ver todos</button>
            : <Link to="/registro?tipo=profesional" className="btn-primary">Anunciar mi oficio</Link>}
        >
          Prueba otra provincia u oficio. ¿Tienes un oficio? Puedes ser el primero en tu zona.
        </EmptyState>
      ) : (
        <>
          <div className={cn('grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', loading && 'opacity-50')} aria-busy={loading}>
            {providers.map((p) => <ProviderCard key={p.id} provider={p} />)}
          </div>
          {totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Paginación">
              <button onClick={() => goPage(page - 1)} disabled={page <= 1} className="btn-secondary">
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <span className="text-sm text-ink-500">Página {page} de {totalPages}</span>
              <button onClick={() => goPage(page + 1)} disabled={page >= totalPages} className="btn-secondary">
                Siguiente <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
