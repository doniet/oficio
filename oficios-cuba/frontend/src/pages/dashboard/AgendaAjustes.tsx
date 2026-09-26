import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, appointmentApi } from '../../services/api';
import type { Agenda, Tramo } from '../../types';
import { fechaLargaCuba, hoyCuba, mediodia } from '../../lib/cuba';
import { PageTitle } from '../../components/DashboardLayout';
import { Alert, ErrorState, Field, PageLoader, Spinner, cn } from '../../components/ui';
import { FormSection } from './parts';
import { duracionTexto } from '../../components/agenda/shared';

// Lunes primero; el índice es el de `semana` (0 = domingo).
const DIAS: { i: number; nombre: string }[] = [
  { i: 1, nombre: 'Lunes' }, { i: 2, nombre: 'Martes' }, { i: 3, nombre: 'Miércoles' }, { i: 4, nombre: 'Jueves' },
  { i: 5, nombre: 'Viernes' }, { i: 6, nombre: 'Sábado' }, { i: 0, nombre: 'Domingo' },
];
const DURACIONES = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];
const MARGENES = [0, 5, 10, 15, 30, 45, 60];
const ANTELACIONES: [number, string][] = [[0, 'Sin antelación'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [720, '12 horas'], [1440, '1 día'], [2880, '2 días']];
const HORIZONTES = [7, 14, 30, 60, 90];
const PLAZOS: [number, string][] = [[0, 'Hasta la hora de la cita'], [1, 'Hasta 1 h antes'], [2, 'Hasta 2 h antes'], [6, 'Hasta 6 h antes'], [12, 'Hasta 12 h antes'], [24, 'Hasta 24 h antes'], [48, 'Hasta 48 h antes']];
const TRAMO_NUEVO: Tramo = { desde: '09:00', hasta: '17:00' };

const conActual = <T,>(opciones: T[], actual: T) => (opciones.includes(actual) ? opciones : [...opciones, actual]);

/** Errores de un día: tramos al revés o que se pisan. */
function erroresTramos(tramos: Tramo[]) {
  if (tramos.some((t) => !t.desde || !t.hasta || t.desde >= t.hasta)) return 'Cada tramo tiene que terminar después de empezar.';
  const orden = [...tramos].sort((a, b) => a.desde.localeCompare(b.desde));
  if (orden.some((t, i) => i > 0 && orden[i - 1].hasta > t.desde)) return 'Hay tramos que se pisan.';
  return '';
}

function TramosEditor({ tramos, onChange, idPrefix }: { tramos: Tramo[]; onChange: (t: Tramo[]) => void; idPrefix: string }) {
  const poner = (i: number, cambio: Partial<Tramo>) => onChange(tramos.map((t, j) => (j === i ? { ...t, ...cambio } : t)));
  const error = erroresTramos(tramos);
  return (
    <div className="space-y-2">
      {tramos.map((t, i) => {
        const medianoche = t.hasta === '24:00';
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input aria-label="Desde" id={`${idPrefix}-d${i}`} type="time" step={300} value={t.desde} onChange={(e) => poner(i, { desde: e.target.value })} className="input w-[7.5rem] px-2" />
            <span className="text-sm text-ink-400">a</span>
            {medianoche ? (
              <span className="input flex w-[7.5rem] items-center px-2 text-ink-500">24:00</span>
            ) : (
              <input aria-label="Hasta" type="time" step={300} value={t.hasta} onChange={(e) => poner(i, { hasta: e.target.value })} className="input w-[7.5rem] px-2" />
            )}
            <label className="flex items-center gap-1 text-xs text-ink-500">
              <input type="checkbox" checked={medianoche} onChange={(e) => poner(i, { hasta: e.target.checked ? '24:00' : '23:00' })} className="h-3.5 w-3.5" />
              hasta medianoche
            </label>
            <button type="button" onClick={() => onChange(tramos.filter((_, j) => j !== i))} className="btn-ghost btn-sm px-2 text-ink-400" aria-label="Quitar tramo">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      {tramos.length < 6 && (
        <button type="button" onClick={() => {
          const ultimo = tramos[tramos.length - 1];
          const siguiente = ultimo && ultimo.hasta < '22:00'
            ? { desde: ultimo.hasta, hasta: `${String(Math.min(23, Number(ultimo.hasta.slice(0, 2)) + 2)).padStart(2, '0')}:${ultimo.hasta.slice(3)}` }
            : TRAMO_NUEVO;
          onChange([...tramos, siguiente]);
        }} className="btn-ghost btn-sm px-2 text-brand-700">
          <Plus className="h-4 w-4" /> Añadir tramo
        </button>
      )}
    </div>
  );
}

export default function AgendaAjustes() {
  const toast = useToast();
  const [form, setForm] = useState<Agenda | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [nuevaFecha, setNuevaFecha] = useState('');

  const cargar = useCallback(async () => {
    setLoadError('');
    try {
      const res = await appointmentApi.getConfig();
      setForm(res.data.agenda);
      setEnabled(res.data.enabled);
    } catch (err) {
      setLoadError(apiError(err, 'No se pudo cargar tu horario.'));
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (loadError) return <ErrorState message={loadError} onRetry={cargar} />;
  if (!form) return <PageLoader />;

  const set = <K extends keyof Agenda>(k: K, v: Agenda[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setDia = (i: number, tramos: Tramo[]) => setForm((f) => (f ? { ...f, semana: f.semana.map((t, j) => (j === i ? tramos : t)) } : f));
  const copiarLaborables = (i: number) => setForm((f) => (f ? { ...f, semana: f.semana.map((t, j) => (j >= 1 && j <= 5 ? form.semana[i].map((x) => ({ ...x })) : t)) } : f));

  const excepciones = [...form.excepciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const setExcepcion = (fecha: string, tramos: Tramo[]) => set('excepciones', form.excepciones.map((e) => (e.fecha === fecha ? { ...e, tramos } : e)));
  const anadirExcepcion = () => {
    if (!nuevaFecha) return;
    if (form.excepciones.some((e) => e.fecha === nuevaFecha)) { setError('Ya hay una excepción para ese día.'); return; }
    set('excepciones', [...form.excepciones, { fecha: nuevaFecha, tramos: [] }]);
    setNuevaFecha('');
    setError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const malDia = DIAS.find((d) => erroresTramos(form.semana[d.i]));
    const malExc = form.excepciones.find((x) => erroresTramos(x.tramos));
    if (malDia) { setError(`${malDia.nombre}: ${erroresTramos(form.semana[malDia.i])}`); return; }
    if (malExc) { setError(`${fechaLargaCuba(mediodia(malExc.fecha))}: ${erroresTramos(malExc.tramos)}`); return; }
    if (form.max_por_dia !== null && (!Number.isInteger(form.max_por_dia) || form.max_por_dia < 1 || form.max_por_dia > 100)) {
      setError('El máximo de citas por día va de 1 a 100 (o vacío para no poner límite).'); return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await appointmentApi.saveConfig(form);
      setForm(res.data.agenda);
      toast('Horario guardado');
    } catch (err) {
      setError(apiError(err, 'No se pudo guardar el horario.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Link to="/dashboard/agenda" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Agenda</Link>
      <PageTitle title="Horario y reglas" subtitle="Cuándo aceptas citas y cómo se reservan. Todas las horas son de Cuba." />
      {!enabled && <Alert tone="info">La agenda de citas es del plan Profesional. <Link to="/dashboard/suscripcion?plan=pro" className="font-semibold underline">Ver plan</Link></Alert>}
      {error && <Alert>{error}</Alert>}

      <FormSection title="Horario semanal" description="Puedes partir el día en varios tramos, por ejemplo de 9 a 13 y de 15 a 19.">
        <ul className="divide-y divide-sand-200">
          {DIAS.map((d) => {
            const tramos = form.semana[d.i];
            const abierto = tramos.length > 0;
            return (
              <li key={d.i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-3">
                    <span className="relative inline-flex">
                      <input type="checkbox" className="peer sr-only" checked={abierto} onChange={(e) => setDia(d.i, e.target.checked ? [{ ...TRAMO_NUEVO }] : [])} />
                      <span className="h-6 w-11 rounded-full bg-sand-300 transition peer-checked:bg-sea-500 peer-focus-visible:ring-2 peer-focus-visible:ring-sea-500/40" />
                      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                    </span>
                    <span className="font-semibold">{d.nombre}</span>
                  </label>
                  {abierto ? (
                    <button type="button" onClick={() => copiarLaborables(d.i)} className="btn-ghost btn-sm px-2 text-ink-500" title="Copiar este horario de lunes a viernes">
                      <Copy className="h-4 w-4" /> <span className="hidden sm:inline">Copiar a lunes–viernes</span><span className="sm:hidden">L–V</span>
                    </button>
                  ) : <span className="text-sm text-ink-400">Cerrado</span>}
                </div>
                {abierto && <div className="mt-3 sm:pl-14"><TramosEditor idPrefix={`dia${d.i}`} tramos={tramos} onChange={(t) => setDia(d.i, t)} /></div>}
              </li>
            );
          })}
        </ul>
      </FormSection>

      <FormSection title="Días especiales" description="Un feriado, el 24 de diciembre o un día con otro horario. Mandan sobre el horario semanal.">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Fecha" htmlFor="exc-fecha">
            <input id="exc-fecha" type="date" min={hoyCuba()} value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} className="input" />
          </Field>
          <button type="button" onClick={anadirExcepcion} disabled={!nuevaFecha} className="btn-secondary"><Plus className="h-4 w-4" /> Añadir</button>
        </div>
        {excepciones.length > 0 && (
          <ul className="space-y-3">
            {excepciones.map((x) => (
              <li key={x.fecha} className={cn('rounded-2xl border border-sand-200 p-3', x.fecha < hoyCuba() && 'opacity-60')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold first-letter:uppercase">{fechaLargaCuba(mediodia(x.fecha))}</p>
                  <button type="button" onClick={() => set('excepciones', form.excepciones.filter((e) => e.fecha !== x.fecha))} className="btn-ghost btn-sm px-2 text-ink-400" aria-label="Quitar día especial">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setExcepcion(x.fecha, [])} className={cn('chip', !x.tramos.length && 'chip-active')}>Cerrado</button>
                  <button type="button" onClick={() => !x.tramos.length && setExcepcion(x.fecha, [{ ...TRAMO_NUEVO }])} className={cn('chip', x.tramos.length > 0 && 'chip-active')}>Otro horario</button>
                </div>
                {x.tramos.length > 0 && <div className="mt-3"><TramosEditor idPrefix={`exc${x.fecha}`} tramos={x.tramos} onChange={(t) => setExcepcion(x.fecha, t)} /></div>}
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title="Citas" description="Cuánto dura una cita y cada cuánto pueden empezar.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="duracion" label="Duración general" hint="La que usan los servicios que no tienen una propia.">
            <select id="duracion" value={form.duracion} onChange={(e) => set('duracion', Number(e.target.value))} className="input">
              {conActual(DURACIONES, form.duracion).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{duracionTexto(m)}</option>)}
            </select>
          </Field>
          <Field htmlFor="intervalo" label="Las citas empiezan cada" hint="Por ejemplo, cada 30 min: 9:00, 9:30, 10:00…">
            <select id="intervalo" value={form.intervalo} onChange={(e) => set('intervalo', Number(e.target.value) as Agenda['intervalo'])} className="input">
              {[15, 30, 60].map((m) => <option key={m} value={m}>{duracionTexto(m)}</option>)}
            </select>
          </Field>
          <Field htmlFor="antes" label="Margen antes de cada cita" hint="Para prepararte o llegar.">
            <select id="antes" value={form.margen_antes} onChange={(e) => set('margen_antes', Number(e.target.value))} className="input">
              {conActual(MARGENES, form.margen_antes).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m ? duracionTexto(m) : 'Sin margen'}</option>)}
            </select>
          </Field>
          <Field htmlFor="despues" label="Margen después de cada cita" hint="Para recoger o desplazarte.">
            <select id="despues" value={form.margen_despues} onChange={(e) => set('margen_despues', Number(e.target.value))} className="input">
              {conActual(MARGENES, form.margen_despues).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m ? duracionTexto(m) : 'Sin margen'}</option>)}
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Reservas" description="Las reglas que se aplican cuando un cliente pide cita desde tu perfil.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="antelacion" label="Antelación mínima" hint="Nadie puede pedirte cita con menos tiempo que este.">
            <select id="antelacion" value={form.antelacion_min} onChange={(e) => set('antelacion_min', Number(e.target.value))} className="input">
              {(ANTELACIONES.some(([m]) => m === form.antelacion_min) ? ANTELACIONES : [...ANTELACIONES, [form.antelacion_min, duracionTexto(form.antelacion_min)] as [number, string]])
                .map(([m, l]) => <option key={m} value={m}>{l}</option>)}
            </select>
          </Field>
          <Field htmlFor="horizonte" label="Se puede reservar con hasta" hint="Cuántos días hacia delante ven tus huecos.">
            <select id="horizonte" value={form.horizonte_dias} onChange={(e) => set('horizonte_dias', Number(e.target.value))} className="input">
              {conActual(HORIZONTES, form.horizonte_dias).sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
          </Field>
          <Field htmlFor="max" label="Máximo de citas por día" hint="Déjalo vacío para no poner límite.">
            <input id="max" type="number" min={1} max={100} inputMode="numeric" value={form.max_por_dia ?? ''} placeholder="Sin límite"
              onChange={(e) => set('max_por_dia', e.target.value === '' ? null : Number(e.target.value))} className="input" />
          </Field>
          <Field htmlFor="plazo" label="El cliente puede cancelar o cambiar" hint="Pasado ese plazo tendrá que escribirte.">
            <select id="plazo" value={form.cancelacion_horas} onChange={(e) => set('cancelacion_horas', Number(e.target.value))} className="input">
              {(PLAZOS.some(([h]) => h === form.cancelacion_horas) ? PLAZOS : [...PLAZOS, [form.cancelacion_horas, `Hasta ${form.cancelacion_horas} h antes`] as [number, string]])
                .map(([h, l]) => <option key={h} value={h}>{l}</option>)}
            </select>
          </Field>
        </div>
        <fieldset>
          <legend className="label">Confirmación</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['manual', 'La confirmo yo', 'Cada cita llega "por confirmar" y el hueco queda apartado hasta que la aceptes o la canceles.'],
              ['auto', 'Automática', 'La cita queda confirmada al momento. Útil si tu horario está siempre al día.'],
            ] as const).map(([v, titulo, texto]) => (
              <label key={v} className={cn('cursor-pointer rounded-2xl border p-3 transition', form.confirmacion === v ? 'border-ink-900 bg-paper' : 'border-sand-200 hover:border-sand-300')}>
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="confirmacion" value={v} checked={form.confirmacion === v} onChange={() => set('confirmacion', v)} className="h-4 w-4" />
                  {titulo}
                </span>
                <span className="mt-1 block text-xs text-ink-500">{texto}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </FormSection>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <button type="submit" disabled={saving || !enabled} className="btn-primary w-full shadow-lift sm:w-auto">
          {saving && <Spinner className="h-4 w-4" />} Guardar horario y reglas
        </button>
      </div>
    </form>
  );
}
