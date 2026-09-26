import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { CalendarClock, CalendarDays, Compass, MessageCircle, Repeat, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, appointmentApi } from '../../services/api';
import type { Appointment, SlotsResponse } from '../../types';
import { parseDate, whatsappLink } from '../../lib/format';
import { fechaCortaCuba, horaCuba } from '../../lib/cuba';
import { PageTitle } from '../../components/DashboardLayout';
import AddToCalendar, { eventoDeCita } from '../../components/AddToCalendar';
import SlotPicker, { duracionTexto } from '../../components/SlotPicker';
import { Alert, Avatar, EmptyState, ErrorState, Modal, PageLoader, Spinner, cn } from '../../components/ui';
import { AppointmentStatusPill, ConfirmDialog, citaFecha, citaHora } from './parts';

function CambiarCita({ cita, onClose, onDone }: { cita: Appointment | null; onClose: () => void; onDone: (nueva: Appointment) => void }) {
  const toast = useToast();
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async (c: Appointment) => {
    setData(null);
    try {
      const r = await appointmentApi.slots(c.provider_id, c.service_id ?? undefined);
      setData(r.data);
      setDay(r.data.days[0]?.date ?? null);
    } catch (err) {
      setError(apiError(err, 'No pudimos cargar la agenda.'));
    }
  }, []);

  useEffect(() => {
    if (!cita) return;
    setError('');
    setSlot(null);
    cargar(cita);
  }, [cita, cargar]);

  const guardar = async () => {
    if (!cita || !slot) return;
    setSaving(true);
    setError('');
    try {
      const r = await appointmentApi.reschedule(cita.id, slot);
      toast(r.data.appointment.status === 'confirmed' ? 'Cita cambiada' : 'Cita cambiada. Queda pendiente de confirmar.');
      onDone(r.data.appointment);
    } catch (err) {
      setError(apiError(err, 'No se pudo cambiar la cita.'));
      if (err instanceof AxiosError && err.response?.status === 409) {
        setSlot(null);
        cargar(cita);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(cita)} onClose={onClose} title="Cambiar la cita">
      {cita && (
        <div className="space-y-5">
          <p className="text-sm text-ink-600">
            Ahora: <span className="font-semibold text-ink-900 first-letter:uppercase">{citaFecha(cita.starts_at)}, {citaHora(cita.starts_at)}</span>.
            Elige la nueva hora con {cita.provider_name}.
          </p>
          {error && <Alert>{error}</Alert>}
          {data === null ? (
            <div className="flex justify-center py-8 text-ink-400">{!error && <Spinner />}</div>
          ) : (
            <>
              <SlotPicker days={data.days} horizonte={data.horizonte_dias} day={day} slot={slot} duracion={cita.duration_min}
                onDay={(d) => { setDay(d); setSlot(null); }} onSlot={setSlot} />
              {data.days.length > 0 && (
                <>
                  {data.confirmacion === 'manual' && <p className="text-xs text-ink-500">La nueva hora queda pendiente hasta que {cita.provider_name} la confirme.</p>}
                  <button type="button" disabled={!slot || saving} onClick={guardar} className="btn-primary btn-lg w-full">
                    {saving ? <Spinner className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                    {slot ? ` Cambiar al ${fechaCortaCuba(slot)}, ${horaCuba(slot)}` : ' Elige una hora'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function MisCitas() {
  const toast = useToast();
  const [citas, setCitas] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toCancel, setToCancel] = useState<Appointment | null>(null);
  const [toChange, setToChange] = useState<Appointment | null>(null);
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

  const cambiada = (vieja: Appointment, nueva: Appointment) => {
    setCitas((list) => [nueva, ...list.map((c) => (c.id === vieja.id ? { ...c, status: 'cancelled' as const, cancelled_by: 'client' as const, can_change: false } : c))]);
    setToChange(null);
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const now = Date.now();
  const activa = (c: Appointment) => c.status === 'pending' || c.status === 'confirmed';
  const esProxima = (c: Appointment) => parseDate(c.ends_at || c.starts_at).getTime() >= now && activa(c);
  const ordenadas = [...citas].sort((a, b) => {
    const pa = esProxima(a), pb = esProxima(b);
    if (pa !== pb) return pa ? -1 : 1;
    return pa ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at);
  });

  return (
    <div>
      <PageTitle title="Mis citas" subtitle="Las citas que pediste a profesionales. Horas de Cuba." />
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
            const fueraDePlazo = proxima && !c.can_change;
            return (
              <li key={c.id} className={cn('card space-y-3 p-4', !proxima && 'opacity-75')}>
                <div className="flex items-start gap-3">
                  <Avatar src={c.provider_avatar} name={c.provider_name} size="md" square />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/proveedor/${c.provider_id}`} className="block min-w-0 truncate font-bold hover:text-brand-700">{c.provider_name}</Link>
                      <AppointmentStatusPill status={c.status} />
                    </div>
                    <p className="text-sm text-ink-700 first-letter:uppercase">{citaFecha(c.starts_at)} · {citaHora(c.starts_at)}</p>
                    <p className="truncate text-xs text-ink-400">
                      {[c.service_title, duracionTexto(c.duration_min)].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-400">
                      {c.rescheduled_from && <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /> Reprogramada</span>}
                      {c.status === 'cancelled' && c.cancelled_by && <span>Cancelada {c.cancelled_by === 'client' ? 'por ti' : 'por el profesional'}</span>}
                    </div>
                  </div>
                </div>

                {proxima && c.can_change && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setToChange(c)} className="btn-secondary btn-sm flex-1"><CalendarClock className="h-4 w-4" /> Cambiar</button>
                    <button type="button" onClick={() => setToCancel(c)} className="btn-ghost btn-sm flex-1 text-red-600 hover:bg-red-50"><X className="h-4 w-4" /> Cancelar</button>
                  </div>
                )}
                {fueraDePlazo && (
                  <div className="space-y-2 rounded-xl bg-sand-50 px-3 py-2 text-xs text-ink-500">
                    <p>
                      Ya no se puede cambiar desde aquí
                      {c.cancel_until && <> (plazo: hasta el {fechaCortaCuba(c.cancel_until)}, {horaCuba(c.cancel_until)})</>}.
                    </p>
                    {c.provider_whatsapp && (
                      <a
                        href={whatsappLink(c.provider_whatsapp, `Hola, sobre mi cita del ${citaFecha(c.starts_at)} a las ${citaHora(c.starts_at)}.`)}
                        target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm w-full"
                      >
                        <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
                      </a>
                    )}
                  </div>
                )}
                {proxima && <AddToCalendar compact evento={eventoDeCita(c)} />}
              </li>
            );
          })}
        </ul>
      )}

      <CambiarCita cita={toChange} onClose={() => setToChange(null)} onDone={(n) => toChange && cambiada(toChange, n)} />

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

