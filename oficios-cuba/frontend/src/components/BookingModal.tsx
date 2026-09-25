import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarCheck, CalendarX } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiError, appointmentApi } from '../services/api';
import { Alert, Modal, Spinner, cn } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  serviceId?: string;
}

type Day = { date: string; slots: string[] };

function dayChip(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export default function BookingModal({ open, onClose, providerId, providerName, serviceId }: Props) {
  const { user, demo, googleMode } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [days, setDays] = useState<Day[] | null>(null);
  const [duracion, setDuracion] = useState(60);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const canBook = user?.user_type === 'client';

  useEffect(() => {
    if (!open || !canBook) return;
    setDays(null);
    setError('');
    setDone(false);
    setSlot(null);
    appointmentApi.slots(providerId)
      .then((r) => {
        setDays(r.data.days);
        setDuracion(r.data.duracion);
        setDay(r.data.days[0]?.date ?? null);
      })
      .catch((err) => { setDays([]); setError(apiError(err, 'No pudimos cargar la agenda.')); });
  }, [open, canBook, providerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return;
    setSending(true);
    setError('');
    try {
      await appointmentApi.create({ provider_id: providerId, service_id: serviceId, starts_at: slot, note: note.trim() || undefined });
      toast('Cita pedida. Te avisamos cuando la confirme.');
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  const next = encodeURIComponent(location.pathname);
  const current = days?.find((d) => d.date === day);

  let body: React.ReactNode;
  if (!user) {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-ink-600">Para pedir una cita entra con tu cuenta de cliente.</p>
        <Link to={`/login?next=${next}`} className="btn-primary w-full">Entrar para pedir cita</Link>
      </div>
    );
  } else if (!canBook) {
    body = <Alert tone="info">Estás usando una cuenta profesional. Solo las cuentas de cliente pueden pedir citas.</Alert>;
  } else if (done) {
    body = (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sea-100 text-sea-700">
          <CalendarCheck className="h-7 w-7" />
        </div>
        <p className="text-sm text-ink-600">Tu cita con {providerName} quedó pendiente de confirmación.</p>
        <Link to="/dashboard/citas" className="btn-primary w-full">Ver mis citas</Link>
      </div>
    );
  } else {
    body = (
      <form onSubmit={submit} className="space-y-5">
        {demo && <p className="text-xs text-ink-400">Demo: en producción se pedirá entrar con tu cuenta de Google.</p>}
        {googleMode === 'real' && user.google === false && (
          <Alert tone="info">Para pedir citas tienes que entrar con tu cuenta de Google.</Alert>
        )}
        {error && <Alert>{error}</Alert>}
        {days === null ? (
          <div className="flex justify-center py-8 text-ink-400"><Spinner /></div>
        ) : days.length === 0 ? (
          !error && (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-ink-500">
              <CalendarX className="h-7 w-7 text-ink-300" />
              No hay horarios libres en los próximos 14 días. Prueba a contactarle por otra vía.
            </div>
          )
        ) : (
          <>
            <div>
              <p className="label">Día</p>
              <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => { setDay(d.date); setSlot(null); }}
                    aria-pressed={d.date === day}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition',
                      d.date === day ? 'border-ink-900 bg-ink-900 text-white' : 'border-sand-200 bg-white text-ink-700 hover:border-ink-300',
                    )}
                  >
                    {dayChip(d.date)}
                  </button>
                ))}
              </div>
            </div>
            {current && (
              <div>
                <p className="label">Hora <span className="font-normal text-ink-400">(hora de Cuba · {duracion} min)</span></p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {current.slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSlot(s)}
                      aria-pressed={s === slot}
                      className={cn(
                        'rounded-xl border py-2 text-sm font-semibold tabular-nums transition',
                        s === slot ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-200 bg-white text-ink-700 hover:border-ink-300',
                      )}
                    >
                      {hora(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="cita-nota" className="label">Nota para el profesional <span className="font-normal text-ink-400">(opcional)</span></label>
              <textarea
                id="cita-nota"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                className="input resize-none"
                placeholder="Qué necesitas y la dirección aproximada."
              />
            </div>
            <button type="submit" disabled={!slot || sending} className="btn-primary btn-lg w-full">
              {sending ? <Spinner className="h-4 w-4" /> : <CalendarCheck className="h-4 w-4" />} Pedir cita
            </button>
          </>
        )}
      </form>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Pedir cita con ${providerName}`}>
      {body}
    </Modal>
  );
}
