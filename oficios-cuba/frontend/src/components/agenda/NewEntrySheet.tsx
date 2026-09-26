import { useEffect, useState, type FormEvent } from 'react';
import { Ban, CalendarPlus } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, appointmentApi, esChoque } from '../../services/api';
import { fechaCuba, fechaLargaCuba, instanteCuba, mediodia } from '../../lib/cuba';
import { Alert, Field, Modal, Spinner, cn } from '../ui';
import { duracionTexto, hhmmCuba, isoCuba } from './shared';

export interface ServicioAgenda { id: string; title: string; duration_min?: number | null }

interface Props {
  /** Instante tocado en el calendario; null = cerrado. */
  instante: number | null;
  duracionGeneral: number;
  servicios: ServicioAgenda[];
  onClose: () => void;
  onSaved: () => void;
}

type Pestana = 'cita' | 'bloqueo';

export default function NewEntrySheet({ instante, duracionGeneral, servicios, onClose, onSaved }: Props) {
  const toast = useToast();
  const [pestana, setPestana] = useState<Pestana>('cita');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  // Cita
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [servicio, setServicio] = useState('');
  const [duracion, setDuracion] = useState(duracionGeneral);
  const [nota, setNota] = useState('');
  const [choque, setChoque] = useState(false);
  // Bloqueo
  const [hasta, setHasta] = useState('');
  const [todoElDia, setTodoElDia] = useState(false);
  const [variosDias, setVariosDias] = useState(false);
  const [fechaFin, setFechaFin] = useState('');
  const [motivo, setMotivo] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (instante === null) return;
    const f = fechaCuba(instante);
    setPestana('cita');
    setFecha(f);
    setFechaFin(f);
    setHora(hhmmCuba(instante));
    setHasta(hhmmCuba(instante + 60 * 60_000));
    setNombre(''); setTelefono(''); setServicio(''); setNota(''); setMotivo('');
    setDuracion(duracionGeneral);
    setTodoElDia(false); setVariosDias(false);
    setChoque(false); setError('');
  }, [instante, duracionGeneral]);

  const elegirServicio = (id: string) => {
    setServicio(id);
    const s = servicios.find((x) => x.id === id);
    setDuracion(s?.duration_min ?? duracionGeneral);
  };

  const guardarCita = async (forzar = false) => {
    if (nombre.trim().length < 2) { setError('Escribe el nombre del cliente.'); return; }
    if (!fecha || !hora) { setError('Elige el día y la hora.'); return; }
    if (!Number.isFinite(duracion) || duracion < 5) { setError('La duración mínima es de 5 minutos.'); return; }
    setSaving(true);
    setError('');
    try {
      await appointmentApi.createManual({
        starts_at: isoCuba(fecha, hora), duration_min: duracion, service_id: servicio || undefined,
        client_name: nombre.trim(), client_phone: telefono.trim() || undefined, note: nota.trim() || undefined, forzar,
      });
      toast('Cita apuntada');
      onSaved();
    } catch (err) {
      if (esChoque(err)) setChoque(true);
      else setError(apiError(err, 'No se pudo guardar la cita.'));
    } finally {
      setSaving(false);
    }
  };

  const guardarBloqueo = async () => {
    const fin = variosDias ? fechaFin : fecha;
    if (!fecha || !fin) { setError('Elige las fechas.'); return; }
    const inicio = todoElDia ? instanteCuba(fecha, 0) : instanteCuba(fecha, hora);
    const final = todoElDia ? instanteCuba(fin, 24 * 60) : instanteCuba(fin, hasta);
    if (final <= inicio) { setError('El final tiene que ser posterior al inicio.'); return; }
    setSaving(true);
    setError('');
    try {
      await appointmentApi.createBlock({ starts_at: new Date(inicio).toISOString(), ends_at: new Date(final).toISOString(), note: motivo.trim() || undefined });
      toast('Tiempo bloqueado');
      onSaved();
    } catch (err) {
      setError(apiError(err, 'No se pudo bloquear ese tiempo.'));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pestana === 'cita') guardarCita();
    else guardarBloqueo();
  };

  return (
    <Modal open={instante !== null} onClose={saving ? () => {} : onClose} title={fecha ? `Nuevo · ${fechaLargaCuba(mediodia(fecha))}` : 'Nuevo'}>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-sand-100 p-1" role="tablist">
        {([['cita', 'Nueva cita', CalendarPlus], ['bloqueo', 'Bloquear tiempo', Ban]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => { setPestana(k); setError(''); setChoque(false); }}
            className={cn('flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition', pestana === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {pestana === 'cita' ? (
          <>
            <Field label="Cliente" htmlFor="nc-nombre">
              <input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" maxLength={100} placeholder="Nombre" autoComplete="off" />
            </Field>
            <Field label="Teléfono (opcional)" htmlFor="nc-tel">
              <input id="nc-tel" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="input" maxLength={30} placeholder="+53 5 123 4567" />
            </Field>
            {servicios.length > 0 && (
              <Field label="Servicio (opcional)" htmlFor="nc-serv">
                <select id="nc-serv" value={servicio} onChange={(e) => elegirServicio(e.target.value)} className="input">
                  <option value="">Sin servicio concreto</option>
                  {servicios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Día" htmlFor="nc-fecha">
                <input id="nc-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input px-2" />
              </Field>
              <Field label="Hora" htmlFor="nc-hora">
                <input id="nc-hora" type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} className="input px-2" />
              </Field>
              <Field label="Minutos" htmlFor="nc-dur">
                <input id="nc-dur" type="number" min={5} max={1440} step={5} inputMode="numeric" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className="input px-2" />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-ink-400">Dura {duracionTexto(duracion || 0)}.</p>
            <Field label="Nota (opcional)" htmlFor="nc-nota">
              <textarea id="nc-nota" value={nota} onChange={(e) => setNota(e.target.value)} className="input min-h-[4.5rem]" maxLength={500} />
            </Field>
            {choque && (
              <Alert tone="info">
                <p className="font-semibold">Choca con otra cita o bloqueo.</p>
                <p className="mt-1">Puedes cambiar la hora o guardarla igualmente.</p>
                <button type="button" disabled={saving} onClick={() => guardarCita(true)} className="btn-secondary btn-sm mt-3">Guardar igualmente</button>
              </Alert>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <label className={cn('chip cursor-pointer', todoElDia && 'chip-active')}>
                <input type="checkbox" className="sr-only" checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} /> Todo el día
              </label>
              <label className={cn('chip cursor-pointer', variosDias && 'chip-active')}>
                <input type="checkbox" className="sr-only" checked={variosDias} onChange={(e) => setVariosDias(e.target.checked)} /> Varios días (vacaciones)
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={variosDias ? 'Desde el día' : 'Día'} htmlFor="nb-fecha">
                <input id="nb-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input px-2" />
              </Field>
              {!todoElDia && (
                <Field label="Desde las" htmlFor="nb-desde">
                  <input id="nb-desde" type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} className="input px-2" />
                </Field>
              )}
              {variosDias && (
                <Field label="Hasta el día" htmlFor="nb-fin">
                  <input id="nb-fin" type="date" min={fecha} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="input px-2" />
                </Field>
              )}
              {!todoElDia && (
                <Field label="Hasta las" htmlFor="nb-hasta">
                  <input id="nb-hasta" type="time" step={300} value={hasta} onChange={(e) => setHasta(e.target.value)} className="input px-2" />
                </Field>
              )}
            </div>
            <Field label="Motivo (opcional, solo lo ves tú)" htmlFor="nb-motivo">
              <input id="nb-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" maxLength={200} placeholder="Almuerzo, trámite, vacaciones…" />
            </Field>
            <p className="text-xs text-ink-400">En ese tiempo nadie podrá pedirte cita. Las citas que ya tengas no se tocan.</p>
          </>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cerrar</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Spinner className="h-4 w-4" />} {pestana === 'cita' ? 'Guardar cita' : 'Bloquear'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
