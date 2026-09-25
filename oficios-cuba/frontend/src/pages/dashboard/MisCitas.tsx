import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Compass, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, appointmentApi } from '../../services/api';
import type { Appointment } from '../../types';
import { parseDate } from '../../lib/format';
import { PageTitle } from '../../components/DashboardLayout';
import { Avatar, EmptyState, ErrorState, PageLoader, cn } from '../../components/ui';
import { AppointmentStatusPill, ConfirmDialog, citaFecha, citaHora } from './parts';

export default function MisCitas() {
  const toast = useToast();
  const [citas, setCitas] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toCancel, setToCancel] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await appointmentApi.mine();
      setCitas(res.data.appointments);
    } catch (err) {
      setError(apiError(err, 'No se pudieron cargar tus citas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      const res = await appointmentApi.setStatus(toCancel.id, 'cancelled');
      setCitas((list) => list.map((c) => (c.id === toCancel.id ? { ...c, ...res.data.appointment } : c)));
      toast('Cita cancelada');
      setToCancel(null);
    } catch (err) {
      toast(apiError(err, 'No se pudo cancelar la cita.'), 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const now = Date.now();
  const esProxima = (c: Appointment) => parseDate(c.starts_at).getTime() >= now && (c.status === 'pending' || c.status === 'confirmed');
  const ordenadas = [...citas].sort((a, b) => {
    const pa = esProxima(a), pb = esProxima(b);
    if (pa !== pb) return pa ? -1 : 1;
    return pa ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at);
  });

  return (
    <div>
      <PageTitle title="Mis citas" subtitle="Las citas que pediste a profesionales." />
      {citas.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Aún no tienes citas"
          action={<Link to="/profesionales" className="btn-primary"><Compass className="h-4 w-4" /> Buscar profesionales</Link>}
        >
          Los profesionales con plan Profesional tienen agenda: elige un hueco libre desde su perfil.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {ordenadas.map((c) => {
            const proxima = esProxima(c);
            return (
              <li key={c.id} className={cn('card flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !proxima && 'opacity-75')}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={c.provider_avatar} name={c.provider_name} size="md" square />
                  <div className="min-w-0 flex-1">
                    <Link to={`/proveedor/${c.provider_id}`} className="block truncate font-bold hover:text-brand-700">{c.provider_name}</Link>
                    <p className="text-sm capitalize text-ink-600">{citaFecha(c.starts_at)} · {citaHora(c.starts_at)}</p>
                    {c.service_title && <p className="truncate text-xs text-ink-400">{c.service_title}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <AppointmentStatusPill status={c.status} />
                  {proxima && (
                    <button type="button" onClick={() => setToCancel(c)} className="btn-ghost btn-sm text-red-600 hover:bg-red-50">
                      <X className="h-4 w-4" /> Cancelar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(toCancel)}
        title="¿Cancelar esta cita?"
        confirmLabel="Sí, cancelar"
        busy={cancelling}
        onConfirm={cancel}
        onClose={() => setToCancel(null)}
      >
        {toCancel && <><strong>{toCancel.provider_name}</strong> verá en su agenda que cancelaste la cita del {citaFecha(toCancel.starts_at)} a las {citaHora(toCancel.starts_at)}.</>}
      </ConfirmDialog>
    </div>
  );
}
