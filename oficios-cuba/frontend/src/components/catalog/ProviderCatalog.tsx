import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search as SearchIcon, SearchX } from 'lucide-react';
import { apiError, catalogApi } from '../../services/api';
import { plural } from '../../lib/format';
import type { CatalogItem, CatalogPage } from '../../types';
import { cn, Spinner } from '../ui';
import CatalogCard, { CatalogCardSkeleton } from './CatalogCard';
import CatalogItemModal, { type VendedorCatalogo } from './CatalogItemModal';

/** Sección "Catálogo" del perfil público. No pinta nada si el profesional no tiene artículos visibles. */
export default function ProviderCatalog({ vendedor }: { vendedor: VendedorCatalogo }) {
  const location = useLocation();
  const [data, setData] = useState<CatalogPage | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<CatalogItem | null>(null);
  const saltado = useRef(false);

  // Espera 400 ms a que el usuario deje de teclear para no pedir en cada letra.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    catalogApi.ofProvider(vendedor.id, { q: busqueda || undefined, section: section || undefined, page: 1 })
      .then((r) => {
        if (!alive) return;
        setData(r.data);
        setItems(r.data.items);
      })
      .catch((err) => alive && setError(apiError(err, 'No pudimos cargar el catálogo.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [vendedor.id, busqueda, section]);

  // Llegar con /proveedor/:id#catalogo (desde la búsqueda de productos) baja hasta aquí.
  useEffect(() => {
    if (saltado.current || !data || location.hash !== '#catalogo') return;
    saltado.current = true;
    requestAnimationFrame(() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [data, location.hash]);

  const verMas = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const r = await catalogApi.ofProvider(vendedor.id, { q: busqueda || undefined, section: section || undefined, page: data.page + 1 });
      setData(r.data);
      setItems((prev) => [...prev, ...r.data.items]);
    } catch {
      /* el botón sigue ahí para reintentar */
    } finally {
      setLoadingMore(false);
    }
  };

  const cerrar = useCallback(() => setAbierto(null), []);

  if (!data || data.total_all === 0) {
    // Mientras carga la primera vez no se reserva sitio: la mayoría de perfiles no tiene catálogo.
    return null;
  }

  const filtrando = Boolean(busqueda || section);

  return (
    <section id="catalogo" aria-labelledby="catalog-title" className="scroll-mt-24">
      <h2 id="catalog-title" className="mb-4 text-xl font-bold">
        Catálogo <span className="font-sans text-base font-semibold text-ink-400">({data.total_all})</span>
      </h2>

      {data.total_all > 8 && (
        <label className="relative mb-3 block">
          <span className="sr-only">Buscar en el catálogo</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el catálogo…" className="input py-2.5 pl-10" />
        </label>
      )}

      {data.sections.length > 0 && (
        <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" onClick={() => setSection('')} aria-pressed={!section} className={cn('chip shrink-0', !section && 'chip-active')}>Todo</button>
          {data.sections.map((s) => (
            <button key={s.name} type="button" onClick={() => setSection(section === s.name ? '' : s.name)} aria-pressed={section === s.name}
              className={cn('chip shrink-0', section === s.name && 'chip-active')}>
              {s.name} <span className="text-xs opacity-60">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {filtrando && !loading && <p className="mb-3 text-sm text-ink-500" aria-live="polite">{plural(data.total, 'artículo', 'artículos')}</p>}

      {error ? (
        <p className="card p-6 text-center text-sm text-red-600">{error}</p>
      ) : loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <CatalogCardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center text-sm text-ink-500">
          <SearchX className="h-6 w-6 text-ink-300" />
          Nada coincide con tu búsqueda.
          <button type="button" onClick={() => { setQ(''); setSection(''); }} className="btn-ghost btn-sm text-brand-700">Ver todo el catálogo</button>
        </div>
      ) : (
        <>
          <div className={cn('grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 xl:grid-cols-4', loading && 'opacity-50')} aria-busy={loading}>
            {items.map((it) => <CatalogCard key={it.id} item={it} onOpen={() => setAbierto(it)} />)}
          </div>
          {data.page < data.pages && (
            <button type="button" onClick={verMas} disabled={loadingMore} className="btn-secondary mt-4 w-full">
              {loadingMore && <Spinner className="h-4 w-4" />} Ver más ({data.total - items.length})
            </button>
          )}
        </>
      )}

      <CatalogItemModal item={abierto} vendedor={abierto ? vendedor : null} onClose={cerrar} />
    </section>
  );
}
