import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Eye, EyeOff, ExternalLink, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, serviceApi } from '../../services/api';
import type { Plan, ServiceSummary } from '../../types';
import { formatPrice, planLabel, relativeTime } from '../../lib/format';
import { PageTitle } from '../../components/DashboardLayout';
import { EmptyState, ErrorState, RatingInline, Spinner, cn } from '../../components/ui';
import { ConfirmDialog, ServiceThumb } from './parts';

export default function MyServices() {
  const toast = useToast();
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [plan, setPlan] = useState<Plan>('free');
  const [max, setMax] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ServiceSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await serviceApi.mine();
      setServices(res.data.services);
      setPlan(res.data.plan);
      setMax(res.data.max_services);
    } catch (err) {
      setError(apiError(err, 'No se pudieron cargar tus servicios.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (s: ServiceSummary) => {
    setToggling(s.id);
    try {
      const res = await serviceApi.toggle(s.id);
      setServices((list) => list.map((x) => (x.id === s.id ? { ...x, is_active: res.data.is_active } : x)));
      toast(res.data.is_active ? 'Servicio visible de nuevo' : 'Servicio pausado: ya no aparece en las búsquedas');
    } catch (err) {
      toast(apiError(err, 'No se pudo cambiar el estado.'), 'error');
    } finally {
      setToggling(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await serviceApi.delete(toDelete.id);
      setServices((list) => list.filter((x) => x.id !== toDelete.id));
      toast('Servicio eliminado');
      setToDelete(null);
    } catch (err) {
      toast(apiError(err, 'No se pudo eliminar el servicio.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  // El límite del plan cuenta también los servicios pausados (así lo valida el servidor).
  const atLimit = max !== null && services.length >= max;

  const newButton = atLimit ? (
    <Link to="/dashboard/suscripcion" className="btn-primary"><Sparkles className="h-4 w-4" /> Mejorar plan</Link>
  ) : (
    <Link to="/dashboard/servicios/nuevo" className="btn-primary"><Plus className="h-4 w-4" /> Publicar servicio</Link>
  );

  return (
    <div>
      <PageTitle title="Mis servicios" subtitle="Lo que ofreces y cómo lo ven tus clientes." action={!loading && !error && newButton} />

      {loading ? (
        <div className="card divide-y divide-sand-200">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="skeleton h-16 w-20 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/5" />
                <div className="skeleton h-3.5 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="space-y-4">
          {max !== null && (
            <div className={cn('flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
              atLimit ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sand-200 bg-white text-ink-600')}
            >
              <div className="flex-1">
                <p>
                  Plan <strong>{planLabel[plan]}</strong>: usas <strong>{services.length} de {max}</strong> {max === 1 ? 'servicio' : 'servicios'}.
                  {atLimit && ' Para publicar otro, mejora tu plan o elimina uno existente.'}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-200" aria-hidden="true">
                  <div className={cn('h-full rounded-full', atLimit ? 'bg-amber-500' : 'bg-sea-500')} style={{ width: `${Math.min(100, (services.length / max) * 100)}%` }} />
                </div>
              </div>
              {!atLimit && <Link to="/dashboard/suscripcion" className="link shrink-0">Ver planes</Link>}
            </div>
          )}

          {services.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-6 w-6" />}
              title="Publica tu primer servicio"
              action={<Link to="/dashboard/servicios/nuevo" className="btn-primary"><Plus className="h-4 w-4" /> Publicar servicio</Link>}
            >
              Describe lo que haces, añade fotos de tus trabajos y un precio orientativo. Así te encuentran los clientes.
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-sand-200 overflow-hidden">
              {services.map((s) => (
                <li key={s.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5', !s.is_active && 'bg-sand-50')}>
                  <Link to={`/dashboard/servicios/${s.id}/editar`} className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                    <ServiceThumb src={s.cover} icon={s.category_icon} className={cn('h-16 w-20', !s.is_active && 'opacity-60')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('badge', s.is_active ? 'bg-sea-100 text-sea-800' : 'bg-sand-200 text-ink-500')}>
                          {s.is_active ? 'Activo' : 'Pausado'}
                        </span>
                        <span className="truncate text-xs text-ink-400">{s.category_icon} {s.category_name}</span>
                      </div>
                      <p className="mt-1 truncate font-semibold text-ink-900">{s.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                        <span className="font-semibold text-ink-700">{formatPrice(s)}</span>
                        <RatingInline rating={s.rating} count={s.review_count} className="text-xs" />
                        <span>Publicado {relativeTime(s.created_at)}</span>
                      </p>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1 border-t border-sand-200 pt-2 sm:border-0 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => toggle(s)}
                      disabled={toggling === s.id}
                      className="btn-ghost btn-sm flex-1 sm:flex-none"
                      aria-label={s.is_active ? `Pausar ${s.title}` : `Activar ${s.title}`}
                    >
                      {toggling === s.id ? <Spinner className="h-4 w-4" /> : s.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span>{s.is_active ? 'Pausar' : 'Activar'}</span>
                    </button>
                    {s.is_active && (
                      <Link to={`/servicio/${s.id}`} className="btn-ghost btn-sm flex-1 sm:flex-none" aria-label={`Ver ${s.title} como cliente`}>
                        <ExternalLink className="h-4 w-4" /> <span className="sm:sr-only">Ver</span>
                      </Link>
                    )}
                    <Link to={`/dashboard/servicios/${s.id}/editar`} className="btn-ghost btn-sm flex-1 sm:flex-none" aria-label={`Editar ${s.title}`}>
                      <Pencil className="h-4 w-4" /> <span className="sm:sr-only">Editar</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setToDelete(s)}
                      className="btn-ghost btn-sm flex-1 text-red-600 hover:bg-red-50 hover:text-red-700 sm:flex-none"
                      aria-label={`Eliminar ${s.title}`}
                    >
                      <Trash2 className="h-4 w-4" /> <span className="sm:sr-only">Eliminar</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="¿Eliminar este servicio?"
        confirmLabel="Eliminar"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      >
        Vas a eliminar <strong className="text-ink-900">{toDelete?.title}</strong>. Esta acción no se puede deshacer.
        Si solo quieres ocultarlo un tiempo, usa <strong>Pausar</strong>.
      </ConfirmDialog>
    </div>
  );
}
