import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, CheckCheck, MessageCircle, Phone, Sparkles, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, appointmentApi } from '../../services/api';
import type { Agenda as AgendaConfig, Appointment, AppointmentStatus } from '../../types';
import { parseDate, telLink, whatsappLink } from '../../lib/format';
import { PageTitle } from '../../components/DashboardLayout';
import { Alert, Avatar, EmptyState, ErrorState, Field, PageLoader, Spinner, cn } from '../../components/ui';
import { AppointmentStatusPill, citaFecha, citaHora, FormSection } from './parts';

const DIAS: { n: number; corto: string; largo: string }[] = [
  { n: 1, corto: 'L', largo: 'Lunes' }, { n: 2, corto: 'M', largo: 'Martes' }, { n: 3, corto: 'X', largo: 'Miércoles' },
  { n: 4, corto: 'J', largo: 'Jueves' }, { n: 5, corto: 'V', largo: 'Viernes' }, { n: 6, corto: 'S', largo: 'Sábado' },
  { n: 0, corto: 'D', largo: 'Domingo' },
];
const DURACIONES: [number, string][] = [[30, '30 min'], [45, '45 min'], [60, '1 hora'], [90, '1 hora y media'], [120, '2 horas']];

type Tab = 'proximas' | 'pasadas';

function ConfigForm({ initial, onSaved }: { initial: AgendaConfig; onSaved: (a: AgendaConfig) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleDia = (n: number) => setForm((f) => ({ ...f, dias: f.dias.includes(n) ? f.dias.filter((d) => d !== n) : [...f.dias, n].sort() }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.desde >= form.hasta) { setError('La hora de fin debe ser posterior a la de inicio'); return; }
    setError('');
    setSaving(true);
    try {
      const res = await appointmentApi.saveConfig(form);
      onSaved(res.data.agenda);
      toast('Horario guardado');
    } catch (err) {
      setError(apiError(err, 'No se pudo guardar el horario.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <FormSection title="Cuándo aceptas citas" description="Los clientes solo podrán pedir huecos libres dentro de este horario (próximos 14 días).">
        {error && <Alert>{error}</Alert>}
        <fieldset>
          <legend className="label">Días</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {DIAS.map((d) => (
              <button key={d.n} type="button" onClick={() => toggleDia(d.n)} aria-pressed={form.dias.includes(d.n)} aria-label={d.largo}
                className={cn('chip justify-center px-0', form.dias.includes(d.n) && 'chip-active')}>
                {d.corto}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Desde" htmlFor="desde">
            <input id="desde" type="time" value={form.desde} onChange={(e) => setForm((f) => ({ ...f, desde: e.target.value }))} className="input" />
          </Field>
          <Field label="Hasta" htmlFor="hasta">
            <input id="hasta" type="time" value={form.hasta} onChange={(e) => setForm((f) => ({ ...f, hasta: e.target.value }))} className="input" />
          </Field>
          <Field label="Cada cita dura" htmlFor="dur">
            <select id="dur" value={form.duracion} onChange={(e) => setForm((f) => ({ ...f, duracion: Number(e.target.value) }))} className="input">
              {DURACIONES.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">{saving && <Spinner className="h-4 w-4" />} Guardar horario</button>
        </div>
      </FormSection>
    </form>
  );
}

function CitaItem({ cita, busy, onStatus }: { cita: Appointment; busy: boolean; onStatus: (s: Exclude<AppointmentStatus, 'pending'>) => void }) {
  const phone = cita.client_phone;
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <div className="w-20 shrink-0">
        <p className="font-display text-lg font-bold text-ink-900">{citaHora(cita.starts_at)}</p>
        <p className="text-xs text-ink-400">{cita.duration_min} min</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Avatar src={cita.client_avatar} name={cita.client_name} size="xs" />
          <p className="font-semibold">{cita.client_name}</p>
          <AppointmentStatusPill status={cita.status} />
        </div>
        {cita.service_title && <p className="mt-1 truncate text-sm text-ink-500">{cita.service_title}</p>}
        {cita.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-700">“{cita.note}”</p>}
        {phone && (
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={telLink(phone)} className="btn-ghost btn-sm"><Phone className="h-4 w-4" /> {phone}</a>
            <a href={whatsappLink(phone, `Hola ${cita.client_name}, sobre tu cita del ${citaFecha(cita.starts_at)} a las ${citaHora(cita.starts_at)}.`)}
              target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
          </div>
        )}
      </div>
      {(cita.status === 'pending' || cita.status === 'confirmed') && (
        <div className="flex gap-2 sm:flex-col">
          {cita.status === 'pending' && (
            <button type="button" disabled={busy} onClick={() => onStatus('confirmed')} className="btn-primary btn-sm flex-1"><Check className="h-4 w-4" /> Confirmar</button>
          )}
          {cita.status === 'confirmed' && (
            <button type="button" disabled={busy} onClick={() => onStatus('done')} className="btn-secondary btn-sm flex-1"><CheckCheck className="h-4 w-4" /> Hecha</button>
          )}
          <button type="button" disabled={busy} onClick={() => onStatus('cancelled')} className="btn-ghost btn-sm flex-1 text-red-600 hover:bg-red-50"><X className="h-4 w-4" /> Cancelar</button>
        </div>
      )}
    </li>
  );
}

export default function Agenda() {
  const toast = useToast();
  const [config, setConfig] = useState<AgendaConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [citas, setCitas] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('proximas');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, m] = await Promise.all([appointmentApi.getConfig(), appointmentApi.mine()]);
      setConfig(c.data.agenda);
      setEnabled(c.data.enabled);
      setCitas(m.data.appointments);
    } catch (err) {
      setError(apiError(err, 'No se pudo cargar tu agenda.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grupos = useMemo(() => {
    const now = Date.now();
    const lista = citas
      .filter((c) => {
        const futura = parseDate(c.starts_at).getTime() + c.duration_min * 60_000 >= now;
        return tab === 'proximas' ? futura && c.status !== 'cancelled' && c.status !== 'done' : !futura || c.status === 'cancelled' || c.status === 'done';
      })
      .sort((a, b) => (tab === 'proximas' ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at)));
    const porDia = new Map<string, Appointment[]>();
    for (const c of lista) {
      const k = citaFecha(c.starts_at);
      porDia.set(k, [...(porDia.get(k) ?? []), c]);
    }
    return [...porDia.entries()];
  }, [citas, tab]);

  const setStatus = async (cita: Appointment, status: Exclude<AppointmentStatus, 'pending'>) => {
    setBusy(cita.id);
    try {
      const res = await appointmentApi.setStatus(cita.id, status);
      setCitas((list) => list.map((c) => (c.id === cita.id ? { ...c, ...res.data.appointment } : c)));
      toast(status === 'confirmed' ? 'Cita confirmada' : status === 'done' ? 'Cita marcada como hecha' : 'Cita cancelada');
    } catch (err) {
      toast(apiError(err, 'No se pudo actualizar la cita.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PageLoader />;
  if (error || !config) return <ErrorState message={error || 'Sin datos'} onRetry={load} />;

  if (!enabled) {
    return (
      <div>
        <PageTitle title="Agenda" />
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Agenda de citas del plan Profesional"
          action={<Link to="/dashboard/suscripcion?plan=pro" className="btn-primary"><Sparkles className="h-4 w-4" /> Ver plan Profesional</Link>}
        >
          Tus clientes eligen un hueco libre en tu horario y tú confirmas la cita. Sin llamadas de ida y vuelta.
        </EmptyState>
      </div>
    );
  }

  const pendientes = citas.filter((c) => c.status === 'pending' && parseDate(c.starts_at).getTime() >= Date.now()).length;

  return (
    <div className="space-y-6">
      <PageTitle title="Agenda" subtitle={pendientes ? `Tienes ${pendientes} ${pendientes === 1 ? 'cita' : 'citas'} por confirmar.` : 'Tus citas con clientes.'} />

      <section>
        <div className="mb-3 inline-grid grid-cols-2 gap-1 rounded-2xl bg-sand-100 p-1" role="tablist">
          {([['proximas', 'Próximas'], ['pasadas', 'Pasadas']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('rounded-xl px-4 py-1.5 text-sm font-semibold transition', tab === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>
              {label}
            </button>
          ))}
        </div>
        {grupos.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-400">
            {tab === 'proximas' ? 'No tienes citas próximas. Cuando un cliente pida una, aparecerá aquí.' : 'Aún no hay citas pasadas.'}
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map(([dia, lista]) => (
              <section key={dia} className="card overflow-hidden">
                <h2 className="border-b border-sand-200 bg-sand-50 px-4 py-2 text-sm font-bold capitalize text-ink-700">{dia}</h2>
                <ul className="divide-y divide-sand-200">
                  {lista.map((c) => <CitaItem key={c.id} cita={c} busy={busy === c.id} onStatus={(s) => setStatus(c, s)} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <ConfigForm initial={config} onSaved={setConfig} />
    </div>
  );
}
