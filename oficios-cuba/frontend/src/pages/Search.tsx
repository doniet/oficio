import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExplorarMapa from '../components/mapa/ExplorarMapa';
import { List, Map as MapIcon, Package, Search as SearchIcon, SearchX, SlidersHorizontal, Store, Wrench, X } from 'lucide-react';
import { catalogApi, categoryApi, providerApi, provinceApi, serviceApi, apiError } from '../services/api';
import type { CatalogSearchItem, Category, Municipality, PriceType, ProviderCard as ProviderCardType, Province, ServiceSummary } from '../types';
import { cup, plural, priceTypeLabel } from '../lib/format';
import { ProviderCard, ProviderCardSkeleton, ServiceCard, ServiceCardSkeleton } from '../components/cards';
import { EmptyState, ErrorState, Modal, PageLoader, Spinner, cn } from '../components/ui';
import CatalogCard, { CatalogCardSkeleton } from '../components/catalog/CatalogCard';
import CatalogItemModal from '../components/catalog/CatalogItemModal';

const ProvinceMapSelector = lazy(() => import('../components/ProvinceMapSelector'));

const PRICE_CAPS = [2000, 5000, 10000, 25000, 50000];
const PRICE_TYPES: PriceType[] = ['fixed', 'hourly', 'daily', 'negotiable'];
// Los filtros que la búsqueda mezclada entiende. Cada uno solo afecta a las categorías que lo
// aceptan en el backend (la categoría no llega a /catalog/search, el municipio no llega a
// /providers): pasarlos de más es inofensivo, el endpoint los ignora.
const FILTER_KEYS: readonly string[] = ['category', 'province', 'municipality', 'price_max', 'price_type'];
const PAGE_SIZE = 9;

/** Un resultado de cualquiera de las tres categorías, con su tipo para poder etiquetarlo y pintar la tarjeta correcta. */
type Resultado =
  | { tipo: 'servicio'; item: ServiceSummary }
  | { tipo: 'negocio'; item: ProviderCardType }
  | { tipo: 'producto'; item: CatalogSearchItem };

/** Intercala las tres listas (servicio, negocio, producto de cada posición, en ese orden) en vez
 * de pegarlas una tras otra: así ninguna categoría le gana siempre el primer vistazo a las demás. */
function entrelazar(servicios: ServiceSummary[], negocios: ProviderCardType[], productos: CatalogSearchItem[]): Resultado[] {
  const out: Resultado[] = [];
  const max = Math.max(servicios.length, negocios.length, productos.length);
  for (let i = 0; i < max; i++) {
    if (servicios[i]) out.push({ tipo: 'servicio', item: servicios[i] });
    if (negocios[i]) out.push({ tipo: 'negocio', item: negocios[i] });
    if (productos[i]) out.push({ tipo: 'producto', item: productos[i] });
  }
  return out;
}

const ETIQUETAS_TIPO: Record<Resultado['tipo'], { label: string; Icon: typeof Wrench }> = {
  servicio: { label: 'Servicio', Icon: Wrench },
  negocio: { label: 'Negocio', Icon: Store },
  producto: { label: 'Producto', Icon: Package },
};

/** Una tarjeta de la lista mezclada: la del tipo que toque, con una etiqueta encima que diga cuál es. */
function TarjetaResultado({ r, onAbrirProducto }: { r: Resultado; onAbrirProducto: (item: CatalogSearchItem) => void }) {
  const { label, Icon } = ETIQUETAS_TIPO[r.tipo];
  return (
    <div className="relative">
      <span className="pointer-events-none absolute right-3 top-3 z-10 badge bg-ink-900/80 text-white shadow-sm backdrop-blur">
        <Icon className="h-3 w-3" /> {label}
      </span>
      {r.tipo === 'servicio' ? <ServiceCard service={r.item} />
        : r.tipo === 'negocio' ? <ProviderCard provider={r.item} />
        : <CatalogCard item={r.item} onOpen={() => onAbrirProducto(r.item)} />}
    </div>
  );
}

function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  // Cualquier cambio de filtro vuelve a la página 1; cambiar de provincia invalida el municipio.
  const update = (patch: Record<string, string | null>, opts: { keepPage?: boolean; replace?: boolean } = {}) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    if ('province' in patch && !('municipality' in patch) && patch.province !== params.get('province')) next.delete('municipality');
    if (!opts.keepPage) next.delete('page');
    setParams(next, opts.replace ? { replace: true } : undefined);
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

export default function Search() {
  const { params, get, update } = useUrlFilters();
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [q, setQ] = useState(get('q'));

  const province = get('province');
  const key = params.toString();
  // Sin `vista` en la URL se ve la lista: el precio y la foto deciden un servicio, y eso el mapa
  // no lo enseña. `vista=mapa` es explícito y sobrevive a compartir el enlace.
  const enMapa = get('vista') === 'mapa';

  // La lista mezclada: servicios, negocios y productos de la misma búsqueda, intercalados. Cada
  // categoría lleva su propia página siguiente (para «Ver más») porque cada una se agota en un
  // momento distinto: no tiene sentido pedir la página 2 de negocios si ya no quedan.
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [totales, setTotales] = useState<{ servicios: number; negocios: number; productos: number } | null>(null);
  const [masDisponible, setMasDisponible] = useState({ servicios: false, negocios: false, productos: false });
  const [paginas, setPaginas] = useState({ servicios: 1, negocios: 1, productos: 1 });
  const [cargandoMas, setCargandoMas] = useState(false);
  const [abierto, setAbierto] = useState<CatalogSearchItem | null>(null);
  const cerrarArticulo = useCallback(() => setAbierto(null), []);

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
    // En la vista de mapa la lista no se pinta: pedirla igual sería tráfico de más en una
    // conexión cubana lenta, justo lo que el mapa (la vista cara) ya intenta evitar.
    if (enMapa) return;
    let alive = true;
    setLoading(true);
    setError('');
    const base = { q: get('q') || undefined, province_id: province || undefined };
    Promise.allSettled([
      serviceApi.getAll({
        ...base, category: get('category') || undefined, municipality_id: get('municipality') || undefined,
        price_max: get('price_max') || undefined, price_type: get('price_type') || undefined,
        sort: 'relevance', page: 1, limit: PAGE_SIZE,
      }),
      providerApi.getAll({ kind: 'negocio', ...base, category: get('category') || undefined, sort: 'relevance', page: 1, limit: PAGE_SIZE }),
      catalogApi.search({ ...base, municipality_id: get('municipality') || undefined, page: 1 }),
    ]).then(([rs, rn, rp]) => {
      if (!alive) return;
      const servicios: ServiceSummary[] = rs.status === 'fulfilled' ? rs.value.data.services : [];
      const negocios: ProviderCardType[] = rn.status === 'fulfilled' ? rn.value.data.providers : [];
      const productos: CatalogSearchItem[] = rp.status === 'fulfilled' ? rp.value.data.items : [];
      setResultados(entrelazar(servicios, negocios, productos));
      setTotales({
        servicios: rs.status === 'fulfilled' ? rs.value.data.pagination.total : 0,
        negocios: rn.status === 'fulfilled' ? rn.value.data.pagination.total : 0,
        productos: rp.status === 'fulfilled' ? rp.value.data.total : 0,
      });
      setMasDisponible({
        servicios: rs.status === 'fulfilled' && rs.value.data.pagination.totalPages > 1,
        negocios: rn.status === 'fulfilled' && rn.value.data.pagination.totalPages > 1,
        productos: rp.status === 'fulfilled' && rp.value.data.pages > 1,
      });
      setPaginas({ servicios: 1, negocios: 1, productos: 1 });
      if (rs.status === 'rejected' && rn.status === 'rejected' && rp.status === 'rejected') {
        setError(apiError(rs.reason, 'No pudimos cargar los resultados.'));
      }
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const verMas = async () => {
    setCargandoMas(true);
    const base = { q: get('q') || undefined, province_id: province || undefined };
    try {
      const [rs, rn, rp] = await Promise.allSettled([
        masDisponible.servicios
          ? serviceApi.getAll({
              ...base, category: get('category') || undefined, municipality_id: get('municipality') || undefined,
              price_max: get('price_max') || undefined, price_type: get('price_type') || undefined,
              sort: 'relevance', page: paginas.servicios + 1, limit: PAGE_SIZE,
            })
          : Promise.resolve(null),
        masDisponible.negocios
          ? providerApi.getAll({ kind: 'negocio', ...base, category: get('category') || undefined, sort: 'relevance', page: paginas.negocios + 1, limit: PAGE_SIZE })
          : Promise.resolve(null),
        masDisponible.productos
          ? catalogApi.search({ ...base, municipality_id: get('municipality') || undefined, page: paginas.productos + 1 })
          : Promise.resolve(null),
      ]);
      const nuevosServicios: ServiceSummary[] = rs.status === 'fulfilled' && rs.value ? rs.value.data.services : [];
      const nuevosNegocios: ProviderCardType[] = rn.status === 'fulfilled' && rn.value ? rn.value.data.providers : [];
      const nuevosProductos: CatalogSearchItem[] = rp.status === 'fulfilled' && rp.value ? rp.value.data.items : [];
      setResultados((prev) => [...prev, ...entrelazar(nuevosServicios, nuevosNegocios, nuevosProductos)]);
      setPaginas((prev) => ({
        servicios: masDisponible.servicios && rs.status === 'fulfilled' && rs.value ? prev.servicios + 1 : prev.servicios,
        negocios: masDisponible.negocios && rn.status === 'fulfilled' && rn.value ? prev.negocios + 1 : prev.negocios,
        productos: masDisponible.productos && rp.status === 'fulfilled' && rp.value ? prev.productos + 1 : prev.productos,
      }));
      setMasDisponible((prev) => ({
        servicios: prev.servicios && rs.status === 'fulfilled' && !!rs.value && rs.value.data.pagination.page < rs.value.data.pagination.totalPages,
        negocios: prev.negocios && rn.status === 'fulfilled' && !!rn.value && rn.value.data.pagination.page < rn.value.data.pagination.totalPages,
        productos: prev.productos && rp.status === 'fulfilled' && !!rp.value && rp.value.data.page < rp.value.data.pages,
      }));
    } finally {
      setCargandoMas(false);
    }
  };

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

  // La vista de mapa es dueña de su propio layout a sangre, así que sale ANTES del marco de
  // página (container-page, con su ancho máximo y su relleno) en vez de vivir en una caja dentro
  // de la columna de resultados. Va después de TODOS los hooks de arriba: un retorno temprano por
  // encima de cualquiera de ellos cambiaría el número de hooks entre renders y React se rompe.
  if (enMapa) return <ExplorarMapa get={get} update={update} categorias={categories} />;

  const puesto = (k: string) => FILTER_KEYS.includes(k) && get(k);
  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (get('q')) chips.push({ key: 'q', label: `“${get('q')}”`, clear: { q: null } });
  if (puesto('category')) chips.push({ key: 'category', label: categoryLabel, clear: { category: null } });
  if (puesto('province')) chips.push({ key: 'province', label: provinces.find((p) => p.id === province)?.name ?? 'Provincia', clear: { province: null } });
  if (puesto('municipality')) chips.push({ key: 'municipality', label: municipalities.find((m) => m.id === get('municipality'))?.name ?? 'Municipio', clear: { municipality: null } });
  if (puesto('price_max')) chips.push({ key: 'price_max', label: `Hasta ${cup(Number(get('price_max')))}`, clear: { price_max: null } });
  if (puesto('price_type')) chips.push({ key: 'price_type', label: priceTypeLabel[get('price_type') as PriceType] ?? get('price_type'), clear: { price_type: null } });
  const activeFilters = FILTER_KEYS.filter((k) => get(k)).length;
  const clearFilters = () => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  const clearAll = () => update({ q: null, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: q.trim() || null });
  };

  const totalResultados = totales ? totales.servicios + totales.negocios + totales.productos : undefined;
  const title = categoryLabel || (get('q') ? `Resultados para “${get('q')}”` : 'Explorar');
  const filterProps = { categories, provinces, municipalities, get, update, onOpenMap: () => { setFiltersOpen(false); setMapOpen(true); } };
  const hayMas = masDisponible.servicios || masDisponible.negocios || masDisponible.productos;

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-balance text-3xl font-bold sm:text-4xl">{title}</h1>
        <form onSubmit={submit} role="search" className="mt-5 flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Buscar servicios, negocios o productos</span>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Electricista, panadería, zapatos…"
              className="input py-3 pl-11"
            />
          </label>
          <button type="submit" className="btn-primary px-5">Buscar</button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* La lista es el valor por defecto (sin `vista` en la URL): el precio y la foto de un
             servicio deciden, y el mapa no los enseña; también es la vista más cara de cargar. */}
          <div className="inline-grid grid-cols-2 gap-1 rounded-2xl bg-sand-100 p-1" role="tablist" aria-label="Cómo ver los resultados">
            {([['lista', 'Lista', List], ['mapa', 'Mapa', MapIcon]] as const).map(([valor, label, Icon]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={enMapa === (valor === 'mapa')}
                onClick={() => update({ vista: valor === 'mapa' ? 'mapa' : null })}
                className={cn('flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition', enMapa === (valor === 'mapa') ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[16.5rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filtros">
          <div className="sticky top-24 rounded-2xl border border-sand-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-base font-bold">Filtros</h2>
              {activeFilters > 0 && (
                <button onClick={clearFilters} className="text-sm font-semibold text-brand-700 hover:underline">
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
              {loading && totalResultados === undefined ? 'Buscando…' : totalResultados !== undefined ? plural(totalResultados, 'resultado encontrado', 'resultados encontrados') : ''}
            </p>
            <button onClick={() => setFiltersOpen(true)} className="btn-secondary lg:hidden">
              <SlidersHorizontal className="h-4 w-4" /> Filtros
              {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] leading-5 text-white">{activeFilters}</span>}
            </button>
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
          ) : loading && resultados.length === 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (i % 3 === 0 ? <CatalogCardSkeleton key={i} /> : i % 3 === 1 ? <ProviderCardSkeleton key={i} /> : <ServiceCardSkeleton key={i} />))}
            </div>
          ) : resultados.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title="No encontramos resultados"
              action={chips.length > 0 ? <button onClick={clearAll} className="btn-secondary">Quitar todos los filtros</button> : undefined}
            >
              Prueba con otra palabra, amplía la zona o quita el límite de precio.
            </EmptyState>
          ) : (
            <>
              <div className={cn('grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3', loading && 'opacity-50')} aria-busy={loading}>
                {resultados.map((r) => <TarjetaResultado key={`${r.tipo}-${r.item.id}`} r={r} onAbrirProducto={setAbierto} />)}
              </div>
              {hayMas && (
                <button type="button" onClick={verMas} disabled={cargandoMas} className="btn-secondary mt-8 w-full">
                  {cargandoMas && <Spinner className="h-4 w-4" />} Ver más resultados
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros">
        <Filters {...filterProps} />
        <div className="sticky -bottom-6 -mx-6 mt-6 flex gap-2 border-t border-sand-200 bg-white px-6 py-4">
          <button onClick={clearFilters} className="btn-secondary flex-1" disabled={!activeFilters}>Limpiar</button>
          <button onClick={() => setFiltersOpen(false)} className="btn-primary flex-[2]">
            {totalResultados !== undefined ? `Ver ${plural(totalResultados, 'resultado', 'resultados')}` : 'Ver resultados'}
          </button>
        </div>
      </Modal>

      <CatalogItemModal
        item={abierto}
        vendedor={abierto ? { id: abierto.provider_id, name: abierto.provider_name, whatsapp: abierto.whatsapp, contactMode: abierto.contact_mode, hasChat: abierto.subscription_plan === 'pro' } : null}
        onClose={cerrarArticulo}
        profileLink
      />

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
