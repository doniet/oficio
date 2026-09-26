import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useTasa } from '../hooks/useTasa';
import { apiError, appointmentApi } from '../services/api';
import type { Appointment, BookableService, SlotsResponse } from '../types';
import { priceParts } from '../lib/format';
import { fechaLargaCuba, horaCuba } from '../lib/cuba';
import AddToCalendar, { eventoDeCita } from './AddToCalendar';
import SlotPicker, { duracionTexto } from './SlotPicker';
import { Alert, Modal, Spinner, cn } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  serviceId?: string;
}

type Paso = 'servicio' | 'cuando' | 'confirmar';

export function politicaCancelacion(horas: number) {
  return horas > 0 ? `Puedes cancelar o cambiar la cita hasta ${horas} h antes.` : 'Puedes cancelar o cambiar la cita hasta la hora de la cita.';
}

export default function BookingModal({ open, onClose, providerId, providerName, serviceId }: Props) {
  const { user, demo, googleMode } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const tasa = useTasa();
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState<Paso>('cuando');
  const [servicio, setServicio] = useState<BookableService | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Appointment | null>(null);

  const canBook = user?.user_type === 'client';

  const cargar = useCallback(async (sid?: string) => {
    setLoading(true);
    try {
      const r = await appointmentApi.slots(providerId, sid);
      setData(r.data);
      setDay((d) => (d && r.data.days.some((x) => x.date === d) ? d : r.data.days[0]?.date ?? null));
      return r.data;
    } catch (err) {
      setError(apiError(err, 'No pudimos cargar la agenda.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    if (!open || !canBook) return;
    setData(null);
    setError('');
    setDone(null);
    setSlot(null);
    setDay(null);
    setNote('');
    setServicio(null);
    cargar(serviceId).then((d) => {
      if (!d) return;
      const pre = serviceId ? d.servicios.find((s) => s.id === serviceId) ?? null : null;
      setServicio(pre);
      setPaso(pre || d.servicios.length === 0 ? 'cuando' : 'servicio');
    });
  }, [open, canBook, providerId, serviceId, cargar]);

  const elegirServicio = async (s: BookableService) => {
    setServicio(s);
    setSlot(null);
    setError('');
    setPaso('cuando');
    await cargar(s.id);
  };

  const submit = async () => {
    if (!slot) return;
    setSending(true);
    setError('');
    try {
      const r = await appointmentApi.create({ provider_id: providerId, service_id: servicio?.id, starts_at: slot, note: note.trim() || undefined });
      setDone(r.data.appointment);
      toast(r.data.appointment.status === 'confirmed' ? 'Cita confirmada' : 'Cita pedida. Te avisamos cuando la confirme.');
    } catch (err) {
      setError(apiError(err));
      if (err instanceof AxiosError && err.response?.status === 409) {
        setSlot(null);
        setPaso('cuando');
        await cargar(servicio?.id);
      }
    } finally {
      setSending(false);
    }
  };

  const next = encodeURIComponent(location.pathname);
  const duracion = data?.duracion ?? servicio?.duration_min ?? 60;
  const atras = paso === 'confirmar' ? 'cuando' : paso === 'cuando' && data && data.servicios.length > 0 && !serviceId ? 'servicio' : null;

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
    const confirmada = done.status === 'confirmed';
    body = (
      <div className="space-y-5 text-center">
        <div className={cn('mx-auto flex h-14 w-14 items-center justify-center rounded-2xl', confirmada ? 'bg-sea-100 text-sea-700' : 'bg-amber-100 text-amber-700')}>
          {confirmada ? <CheckCircle2 className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
        </div>
        <div>
          <p className="font-display text-lg font-bold text-ink-900">{confirmada ? 'Cita confirmada' : 'Cita pedida'}</p>
          <p className="mt-1 text-sm text-ink-600 first-letter:uppercase">
            {fechaLargaCuba(done.starts_at)} a las {horaCuba(done.starts_at)} · {duracionTexto(done.duration_min)}
          </p>
          <p className="mt-2 text-sm text-ink-500">
            {confirmada ? `${providerName} te espera.` : `Queda pendiente hasta que ${providerName} la confirme. Lo verás en Mis citas.`}
          </p>
        </div>
        <AddToCalendar evento={eventoDeCita({ ...done, provider_name: done.provider_name || providerName })} />
        <Link to="/dashboard/citas" className="btn-primary w-full">Ver mis citas</Link>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        {demo && <p className="text-xs text-ink-400">Demo: en producción se pedirá entrar con tu cuenta de Google.</p>}
        {googleMode === 'real' && user.google === false && (
          <Alert tone="info">Para pedir citas tienes que entrar con tu cuenta de Google.</Alert>
        )}
        {atras && (
          <button type="button" onClick={() => { setError(''); setPaso(atras); }} className="btn-ghost btn-sm -ml-2">
            <ArrowLeft className="h-4 w-4" /> Atrás
          </button>
        )}
        {error && <Alert>{error}</Alert>}

        {data === null || (loading && paso === 'cuando') ? (
          <div className="flex justify-center py-8 text-ink-400">{!error && <Spinner />}</div>
        ) : paso === 'servicio' ? (
          <div>
            <p className="label">¿Qué necesitas?</p>
            <ul className="space-y-2">
              {data.servicios.map((s) => {
                const precio = priceParts(s, tasa);
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => elegirServicio(s)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-sand-200 bg-white p-3 text-left transition hover:border-ink-300">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink-900">{s.title}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          <Clock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{duracionTexto(s.duration_min)}
                          {' · '}{precio.main}{precio.suffix ? ` ${precio.suffix}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : paso === 'cuando' ? (
          <>
            {servicio && <p className="text-sm text-ink-600"><span className="font-semibold text-ink-900">{servicio.title}</span> · {duracionTexto(duracion)}</p>}
            <SlotPicker
              days={data.days}
              horizonte={data.horizonte_dias}
              day={day}
              slot={slot}
              duracion={duracion}
              onDay={(d) => { setDay(d); setSlot(null); }}
              onSlot={setSlot}
            />
            {data.days.length > 0 && (
              <button type="button" disabled={!slot} onClick={() => { setError(''); setPaso('confirmar'); }} className="btn-primary btn-lg w-full">
                Continuar
              </button>
            )}
          </>
        ) : slot && (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5">
            <dl className="divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-sand-50 text-sm">
              {[
                ['Con', providerName],
                ...(servicio ? [['Servicio', servicio.title]] : []),
                ['Día', fechaLargaCuba(slot)],
                ['Hora', `${horaCuba(slot)} (hora de Cuba) · ${duracionTexto(duracion)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 px-4 py-2.5">
                  <dt className="w-16 shrink-0 text-ink-400">{k}</dt>
                  <dd className="min-w-0 font-semibold first-letter:uppercase text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <label htmlFor="cita-nota" className="label">Nota para el profesional <span className="font-normal text-ink-400">(opcional)</span></label>
              <textarea id="cita-nota" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
                className="input resize-none" placeholder="Qué necesitas y la dirección aproximada." />
            </div>
            <div className="space-y-1 rounded-xl bg-sea-50 px-3 py-2.5 text-sm text-sea-900">
              <p className="font-semibold">
                {data.confirmacion === 'auto' ? 'Se confirma al momento.' : `Tu cita queda pendiente hasta que ${providerName} la confirme.`}
              </p>
              <p>{politicaCancelacion(data.cancelacion_horas)}</p>
            </div>
            <button type="submit" disabled={sending} className="btn-primary btn-lg w-full">
              {sending ? <Spinner className="h-4 w-4" /> : <CalendarCheck className="h-4 w-4" />} {data.confirmacion === 'auto' ? 'Reservar cita' : 'Pedir cita'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Pedir cita con ${providerName}`}>
      {body}
    </Modal>
  );
}
