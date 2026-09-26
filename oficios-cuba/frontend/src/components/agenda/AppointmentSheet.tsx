import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, CheckCheck, MessageCircle, Phone, UserX, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, appointmentApi, esChoque } from '../../services/api';
import type { Appointment, AppointmentStatus } from '../../types';
import { fechaCuba, fechaLargaCuba, horaCuba } from '../../lib/cuba';
import { telLink, whatsappLink } from '../../lib/format';
import { AppointmentStatusPill } from '../../pages/dashboard/parts';
import { Alert, Avatar, Field, Modal, Spinner } from '../ui';
import { duracionTexto, hhmmCuba, isoCuba, ms, rangoHoras, yaEmpezo } from './shared';

interface Props {
  cita: Appointment | null;
  onClose: () => void;
  /** Tras cualquier cambio: el calendario se recarga (reprogramar crea otra cita). */
  onChanged: () => void;
}

type Modo = 'ver' | 'reprogramar' | 'cancelar';
const MENSAJE: Partial<Record<AppointmentStatus, string>> = {
  confirmed: 'Cita confirmada', done: 'Cita marcada como hecha', no_show: 'Marcada como "no vino"', cancelled: 'Cita cancelada',
};

export default function AppointmentSheet({ cita, onClose, onChanged }: Props) {
  const toast = useToast();
  const [modo, setModo] = useState<Modo>('ver');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [choque, setChoque] = useState(false);

  useEffect(() => {
    if (!cita) return;
    setModo('ver');
    setError('');
    setChoque(false);
    setFecha(fechaCuba(ms(cita.starts_at)));
    setHora(hhmmCuba(ms(cita.starts_at)));
  }, [cita]);

  if (!cita) return null;

  const abierta = cita.status === 'pending' || cita.status === 'confirmed';
  const empezo = yaEmpezo(cita);
  const inicio = ms(cita.starts_at);

  const cambiar = async (status: Exclude<AppointmentStatus, 'pending'>) => {
    setBusy(true);
    setError('');
    try {
      await appointmentApi.setStatus(cita.id, status);
      toast(MENSAJE[status] ?? 'Cita actualizada');
      onChanged();
    } catch (err) {
      setError(apiError(err, 'No se pudo actualizar la cita.'));
    } finally {
      setBusy(false);
    }
  };

  const reprogramar = async (forzar = false) => {
    if (!fecha || !hora) { setError('Elige el día y la hora.'); return; }
    setBusy(true);
    setError('');
    try {
      await appointmentApi.reschedule(cita.id, isoCuba(fecha, hora), forzar);
      toast('Cita movida');
      onChanged();
    } catch (err) {
      if (esChoque(err)) setChoque(true);
      else setError(apiError(err, 'No se pudo mover la cita.'));
    } finally {
      setBusy(false);
    }
  };

  const recordatorio = `Hola ${cita.client_name}, te recuerdo tu cita${cita.service_title ? ` de ${cita.service_title}` : ''} el ${fechaLargaCuba(inicio)} a las ${horaCuba(inicio)}. ¿Me confirmas que vienes?`;

  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Cita">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Avatar src={cita.client_avatar} name={cita.client_name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{cita.client_name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <AppointmentStatusPill status={cita.status} />
              <span className="badge bg-sand-100 text-ink-600">{cita.origin === 'manual' ? 'Apuntada por ti' : 'Pedida online'}</span>
            </div>
          </div>
        </div>

        {Boolean(cita.no_shows) && (
          <Alert tone="info">
            <span className="flex items-center gap-2 font-semibold text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> No vino {cita.no_shows} {cita.no_shows === 1 ? 'vez' : 'veces'} a tus citas.
            </span>
          </Alert>
        )}

        <dl className="space-y-1.5 rounded-2xl bg-paper p-4 text-sm">
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-400">Día</dt><dd className="font-semibold first-letter:uppercase">{fechaLargaCuba(inicio)}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-400">Hora</dt><dd className="font-semibold">{rangoHoras(cita)} <span className="font-normal text-ink-400">({duracionTexto(cita.duration_min)})</span></dd></div>
          {cita.service_title && <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-400">Servicio</dt><dd className="min-w-0 break-words">{cita.service_title}</dd></div>}
          {cita.note && <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-400">Nota</dt><dd className="min-w-0 whitespace-pre-wrap break-words">{cita.note}</dd></div>}
          {cita.status === 'cancelled' && cita.cancelled_by && (
            <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-400">Canceló</dt><dd>{cita.cancelled_by === 'client' ? 'El cliente' : 'Tú'}</dd></div>
          )}
        </dl>

        {cita.client_phone && (
          <div className="grid grid-cols-2 gap-2">
            <a href={telLink(cita.client_phone)} className="btn-secondary btn-sm"><Phone className="h-4 w-4" /> Llamar</a>
            <a href={whatsappLink(cita.client_phone, recordatorio)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
              <MessageCircle className="h-4 w-4" /> {abierta && !empezo ? 'Recordar por WhatsApp' : 'WhatsApp'}
            </a>
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        {modo === 'reprogramar' && (
          <div className="space-y-3 rounded-2xl border border-sand-200 p-4">
            <p className="text-sm font-semibold">Mover la cita a…</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día" htmlFor="rp-fecha"><input id="rp-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input px-2" /></Field>
              <Field label="Hora" htmlFor="rp-hora"><input id="rp-hora" type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} className="input px-2" /></Field>
            </div>
            {choque && (
              <Alert tone="info">
                <p className="font-semibold">Choca con otra cita o bloqueo.</p>
                <button type="button" disabled={busy} onClick={() => reprogramar(true)} className="btn-secondary btn-sm mt-2">Moverla igualmente</button>
              </Alert>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setModo('ver')} className="btn-ghost btn-sm flex-1">Volver</button>
              <button type="button" disabled={busy} onClick={() => reprogramar()} className="btn-primary btn-sm flex-1">{busy && <Spinner className="h-4 w-4" />} Mover</button>
            </div>
          </div>
        )}

        {modo === 'cancelar' && (
          <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>¿Cancelar la cita{cita.origin === 'online' ? '? El cliente lo verá en "Mis citas".' : '?'}</p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setModo('ver')} className="btn-secondary btn-sm flex-1">No</button>
              <button type="button" disabled={busy} onClick={() => cambiar('cancelled')} className="btn-danger btn-sm flex-1">{busy && <Spinner className="h-4 w-4" />} Sí, cancelar</button>
            </div>
          </div>
        )}

        {modo === 'ver' && (
          <div className="grid grid-cols-2 gap-2">
            {cita.status === 'pending' && (
              <button type="button" disabled={busy} onClick={() => cambiar('confirmed')} className="btn-primary btn-sm col-span-2"><Check className="h-4 w-4" /> Confirmar</button>
            )}
            {abierta && empezo && (
              <>
                <button type="button" disabled={busy} onClick={() => cambiar('done')} className="btn-secondary btn-sm"><CheckCheck className="h-4 w-4" /> Hecha</button>
                <button type="button" disabled={busy} onClick={() => cambiar('no_show')} className="btn-secondary btn-sm text-red-700"><UserX className="h-4 w-4" /> No vino</button>
              </>
            )}
            {cita.status === 'done' && (
              <button type="button" disabled={busy} onClick={() => cambiar('no_show')} className="btn-ghost btn-sm col-span-2">Corregir: no vino</button>
            )}
            {cita.status === 'no_show' && (
              <button type="button" disabled={busy} onClick={() => cambiar('done')} className="btn-ghost btn-sm col-span-2">Corregir: sí vino</button>
            )}
            {abierta && (
              <>
                <button type="button" disabled={busy} onClick={() => { setModo('reprogramar'); setError(''); }} className="btn-secondary btn-sm"><CalendarClock className="h-4 w-4" /> Reprogramar</button>
                <button type="button" disabled={busy} onClick={() => { setModo('cancelar'); setError(''); }} className="btn-ghost btn-sm text-red-600 hover:bg-red-50"><X className="h-4 w-4" /> Cancelar</button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
