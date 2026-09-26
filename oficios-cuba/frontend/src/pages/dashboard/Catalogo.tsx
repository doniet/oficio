import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Pencil, Plus, Search, ShoppingBag, Sparkles, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useTasa } from '../../hooks/useTasa';
import { apiError, catalogApi, providerApi } from '../../services/api';
import { catalogPrice } from '../../lib/format';
import type { CatalogItem } from '../../types';
import { PageTitle } from '../../components/DashboardLayout';
import { Alert, EmptyState, ErrorState, PageLoader, cn } from '../../components/ui';
import CatalogItemForm from '../../components/catalog/admin/CatalogItemForm';
import { ConfirmDialog } from './parts';

type Item = CatalogItem & { hidden_by_plan: boolean };

const POR_TANDA = 30;

const orden = (a: Item, b: Item) =>
  (a.section ?? '~').localeCompare(b.section ?? '~', 'es', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

function Miniatura({ item }: { item: CatalogItem }) {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand-100">
      {item.image ? (
        <img src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-2xl font-bold text-ink-300" aria-hidden="true">{item.name.trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function Fila({ item, tasa, onToggle, onEdit, onDelete }: {
  item: Item; tasa: number; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const precio = catalogPrice(item, tasa);
  return (
    <li className={cn('flex gap-3 p-3 sm:p-4', item.hidden_by_plan && 'opacity-60')}>
      <Miniatura item={item} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-semibold">{item.name}</p>
          {item.hidden_by_plan && <span className="badge bg-sand-200 text-ink-600">Oculto por tu plan</span>}
        </div>
        {item.section && <p className="truncate text-xs text-ink-400">{item.section}</p>}
        <p className="mt-0.5 text-sm">
          {precio.prefix && <span className="text-ink-400">{precio.prefix} </span>}
          <span className="font-semibold text-ink-800">{precio.amount}</span>
          {precio.alt && <span className="ml-1.5 text-xs text-ink-400">{precio.alt}</span>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="relative inline-flex">
              <input type="checkbox" className="peer sr-only" checked={item.available} onChange={onToggle} aria-label={`${item.name}: disponible`} />
              <span className="h-5 w-9 rounded-full bg-sand-300 transition peer-checked:bg-sea-500 peer-focus-visible:ring-2 peer-focus-visible:ring-sea-500/40" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
            </span>
            <span className={cn('text-xs font-semibold', item.available ? 'text-sea-700' : 'text-ink-400')}>{item.available ? 'Disponible' : 'Agotado'}</span>
          </label>
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={onEdit} className="btn-ghost btn-sm"><Pencil className="h-4 w-4" /> Editar</button>
            <button type="button" onClick={onDelete} className="btn-ghost btn-sm text-red-600 hover:bg-red-50" aria-label={`Borrar ${item.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        </div>
      </div>
    </li>
  );
}

export default function Catalogo() {
  const toast = useToast();
  const tasa = useTasa();
  const [items, setItems] = useState<Item[]>([]);
  const [max, setMax] = useState(0);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [seccion, setSeccion] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(POR_TANDA);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Item | null>(null);
  const [aBorrar, setABorrar] = useState<Item | null>(null);
  const [borrando, setBorrando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await catalogApi.mine();
      setItems([...res.data.items].sort(orden));
      setMax(res.data.max);
    } catch (err) {
      setError(apiError(err, 'No se pudo cargar tu catálogo.'));
    } finally {
      setLoading(false);
    }
    providerApi.getMyProfile().then((r) => setProviderId(r.data.provider?.id ?? null)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVisibles(POR_TANDA); }, [q, seccion]);

  const secciones = useMemo(() => [...new Set(items.map((i) => i.section).filter((s): s is string => Boolean(s)))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })), [items]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('es');
    return items.filter((i) => (!seccion || i.section === seccion)
      && (!t || i.name.toLocaleLowerCase('es').includes(t) || (i.description ?? '').toLocaleLowerCase('es').includes(t)));
  }, [items, q, seccion]);

  const ocultos = items.filter((i) => i.hidden_by_plan).length;
  const lleno = items.length >= max;

  const cerrarForm = useCallback(() => { setFormOpen(false); setEditando(null); }, []);
  const abrirAlta = () => { setEditando(null); setFormOpen(true); };

  const guardado = (item: CatalogItem, esNuevo: boolean) => {
    setItems((list) => {
      if (esNuevo) return [...list, { ...item, hidden_by_plan: false }].sort(orden);
      return list.map((i) => (i.id === item.id ? { ...i, ...item } : i)).sort(orden);
    });
    toast(esNuevo ? 'Artículo añadido' : 'Artículo guardado');
  };

  const alternar = async (item: Item) => {
    const available = !item.available;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, available } : i)));
    try {
      await catalogApi.setAvailable(item.id, available);
    } catch (err) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, available: !available } : i)));
      toast(apiError(err, 'No se pudo cambiar la disponibilidad.'), 'error');
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await catalogApi.remove(aBorrar.id);
      toast('Artículo borrado');
      setABorrar(null);
      // Al borrar puede reaparecer un artículo que estaba oculto por el plan: se recarga la lista.
      if (ocultos) load();
      else setItems((list) => list.filter((i) => i.id !== aBorrar.id));
    } catch (err) {
      toast(apiError(err, 'No se pudo borrar el artículo.'), 'error');
    } finally {
      setBorrando(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (!max) {
    return (
      <div>
        <PageTitle title="Catálogo" />
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="Catálogo de productos y servicios"
          action={<Link to="/dashboard/suscripcion" className="btn-primary"><Sparkles className="h-4 w-4" /> Ver planes</Link>}
        >
          Enseña lo que vendes o haces con foto, precio y descripción. Básico: hasta 50 artículos · Profesional: hasta 1000.
        </EmptyState>
        {ocultos > 0 && <p className="mt-4 text-center text-sm text-ink-500">Tus {ocultos} artículos siguen guardados: vuelven a verse si mejoras tu plan.</p>}
      </div>
    );
  }

  const pct = Math.min(100, Math.round((items.length / max) * 100));

  return (
    <div className="space-y-5">
      <PageTitle
        title="Catálogo"
        subtitle="Lo que vendes o haces, con foto y precio. Tus clientes lo ven en tu perfil."
        action={(
          <button type="button" onClick={abrirAlta} disabled={lleno} className="btn-primary w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Añadir artículo
          </button>
        )}
      />

      <div className="card p-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <p><span className="font-bold text-ink-900">{items.length}</span> <span className="text-ink-500">de {max} artículos</span></p>
          {providerId && (
            <Link to={`/proveedor/${providerId}`} className="link inline-flex items-center gap-1 text-sm"><Eye className="h-4 w-4" /> Ver cómo lo ven tus clientes</Link>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={items.length} aria-valuemin={0} aria-valuemax={max} aria-label="Artículos usados">
          <div className={cn('h-full rounded-full transition-all', lleno ? 'bg-brand-600' : 'bg-sea-500')} style={{ width: `${pct}%` }} />
        </div>
        {lleno && (
          <p className="mt-2 text-xs text-ink-500">
            Llegaste al tope de tu plan. Borra alguno o <Link to="/dashboard/suscripcion" className="link">mejora tu plan</Link> para añadir más.
          </p>
        )}
      </div>

      {ocultos > 0 && (
        <Alert tone="info">
          <span className="inline-flex items-start gap-2">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {ocultos === 1 ? '1 artículo no se muestra' : `${ocultos} artículos no se muestran`} porque supera{ocultos === 1 ? '' : 'n'} el límite de tu plan.{' '}
              <Link to="/dashboard/suscripcion" className="font-semibold underline underline-offset-4">Mejorar plan</Link>
            </span>
          </span>
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="Tu catálogo está vacío"
          action={<button type="button" onClick={abrirAlta} className="btn-primary"><Plus className="h-4 w-4" /> Añadir el primero</button>}
        >
          Añade tus productos o servicios con precio. La foto es opcional: puedes ponerla después.
        </EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            <label className="relative block">
              <span className="sr-only">Buscar en tu catálogo</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o descripción" className="input pl-9" />
            </label>
            {secciones.length > 0 && (
              <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <button type="button" onClick={() => setSeccion(null)} aria-pressed={seccion === null} className={cn('chip shrink-0', seccion === null && 'chip-active')}>Todas</button>
                {secciones.map((s) => (
                  <button key={s} type="button" onClick={() => setSeccion(s === seccion ? null : s)} aria-pressed={seccion === s}
                    className={cn('chip shrink-0', seccion === s && 'chip-active')}>{s}</button>
                ))}
              </div>
            )}
          </div>

          {filtrados.length === 0 ? (
            <div className="card p-8 text-center text-sm text-ink-400">Ningún artículo coincide con la búsqueda.</div>
          ) : (
            <>
              <ul className="card divide-y divide-sand-200 overflow-hidden">
                {filtrados.slice(0, visibles).map((i) => (
                  <Fila key={i.id} item={i} tasa={tasa}
                    onToggle={() => alternar(i)}
                    onEdit={() => { setEditando(i); setFormOpen(true); }}
                    onDelete={() => setABorrar(i)} />
                ))}
              </ul>
              {filtrados.length > visibles && (
                <div className="flex justify-center">
                  <button type="button" onClick={() => setVisibles((v) => v + POR_TANDA)} className="btn-secondary">
                    Ver más ({filtrados.length - visibles})
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <CatalogItemForm open={formOpen} item={editando} sections={secciones} onClose={cerrarForm} onSaved={guardado} />

      <ConfirmDialog
        open={Boolean(aBorrar)}
        title="¿Borrar este artículo?"
        confirmLabel="Sí, borrar"
        busy={borrando}
        onConfirm={borrar}
        onClose={() => setABorrar(null)}
      >
        {aBorrar && <>Se borra <strong>{aBorrar.name}</strong> de tu catálogo{aBorrar.image ? ' con su foto' : ''}. No se puede deshacer.</>}
      </ConfirmDialog>
    </div>
  );
}
