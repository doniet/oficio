import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Globe2, List, Plus, Settings2, Sparkles } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, appointmentApi, serviceApi } from '../../services/api';
import type { AgendaBlock, Appointment, CalendarData } from '../../types';
import { diaSemana, fechaLargaCuba, fueraDeCuba, hoyCuba, instanteCuba, mediodia, sumarDias } from '../../lib/cuba';
import { PageTitle } from '../../components/DashboardLayout';
import { Avatar, EmptyState, ErrorState, PageLoader, Spinner, cn } from '../../components/ui';
import DayView from '../../components/agenda/DayView';
import NewEntrySheet, { type ServicioAgenda } from '../../components/agenda/NewEntrySheet';
import AppointmentSheet from '../../components/agenda/AppointmentSheet';
import { ESTILO_CITA, activa, fechaDeCita, lunesDe, ms, rangoHoras } from '../../components/agenda/shared';
import { AppointmentStatusPill } from './parts';

type Vista = 'dia' | 'lista';
const LETRA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DIAS_LISTA = 30;

function rangoDe(vista: Vista, fecha: string) {
  if (vista === 'lista') { const hoy = hoyCuba(); return { desde: hoy, hasta: sumarDias(hoy, DIAS_LISTA - 1) }; }
  const lunes = lunesDe(fecha);
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

function ListaCitas({ citas, onSelect }: { citas: Appointment[]; onSelect?: (a: Appointment) => void }) {
  const grupos = useMemo(() => {
    const porDia = new Map<string, Appointment[]>();
    for (const c of [...citas].sort((a, b) => ms(a.starts_at) - ms(b.starts_at))) {
      const k = fechaDeCita(c);
      porDia.set(k, [...(porDia.get(k) ?? []), c]);
    }
    return [...porDia.entries()];
  }, [citas]);

  return (
    <div className="space-y-4">
      {grupos.map(([dia, lista]) => (
        <section key={dia} className="card overflow-hidden">
          <h2 className="border-b border-sand-200 bg-paper px-4 py-2 text-sm font-bold first-letter:uppercase text-ink-700">
            {dia === hoyCuba() ? 'Hoy · ' : dia === sumarDias(hoyCuba(), 1) ? 'Mañana · ' : ''}{fechaLargaCuba(mediodia(dia))}
          </h2>
          <ul className="divide-y divide-sand-200">
            {lista.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={!onSelect} onClick={() => onSelect?.(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition enabled:hover:bg-paper">
                  <span className={cn('h-10 w-1.5 shrink-0 rounded-full', ESTILO_CITA[c.status])} aria-hidden="true" />
                  <div className="w-24 shrink-0 text-sm font-bold text-ink-900">{rangoHoras(c)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Avatar src={c.client_avatar} name={c.client_name} size="xs" />
                      <span className="truncate font-semibold">{c.client_name}</span>
                    </div>
                    {c.service_title && <p className="truncate text-xs text-ink-500">{c.service_title}</p>}
                  </div>
                  <AppointmentStatusPill status={c.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function Agenda() {
  const toast = useToast();
  const [vista, setVista] = useState<Vista>('dia');
  const [fecha, setFecha] = useState(hoyCuba);
  const [data, setData] = useState<CalendarData | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [viejas, setViejas] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [verCanceladas, setVerCanceladas] = useState(false);
  const [nuevo, setNuevo] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Appointment | null>(null);
  const [servicios, setServicios] = useState<ServicioAgenda[] | null>(null);

  const { desde, hasta } = rangoDe(vista, fecha);

  const cargar = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const [cal, mias] = await Promise.all([appointmentApi.calendar(desde, hasta), appointmentApi.mine()]);
      setData(cal.data);
      const ahora = Date.now();
      setPendientes(mias.data.appointments.filter((c) => c.status === 'pending' && ms(c.starts_at) >= ahora).length);
      setViejas(mias.data.appointments);
    } catch (err) {
      setError(apiError(err, 'No se pudo cargar tu agenda.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  // Los servicios solo hacen falta para apuntar una cita: se piden al abrir la hoja la primera vez.
  useEffect(() => {
    if (nuevo === null || servicios) return;
    serviceApi.mine()
      .then((r) => setServicios((r.data.services as ServicioAgenda[]).filter((s: ServicioAgenda & { is_active?: boolean }) => s.is_active !== false)))
      .catch(() => setServicios([]));
  }, [nuevo, servicios]);

  const cerrarNuevo = useCallback(() => setNuevo(null), []);
  const cerrarCita = useCallback(() => setSeleccion(null), []);
  const trasCambio = useCallback(() => { setNuevo(null); setSeleccion(null); cargar(); }, [cargar]);

  const borrarBloqueo = async (b: AgendaBlock) => {
    if (!window.confirm('¿Quitar este bloqueo? Volverás a aceptar citas en ese tiempo.')) return;
    try {
      await appointmentApi.deleteBlock(b.id);
      toast('Bloqueo quitado');
      cargar();
    } catch (err) {
      toast(apiError(err, 'No se pudo quitar el bloqueo.'), 'error');
    }
  };

  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data?.appointments ?? []) if (activa(a)) m.set(fechaDeCita(a), (m.get(fechaDeCita(a)) ?? 0) + 1);
    return m;
  }, [data]);

  if (loading) return <PageLoader />;
  if (!data) return <ErrorState message={error || 'Sin datos'} onRetry={cargar} />;

  if (!data.enabled) {
    const conservadas = viejas.filter((c) => c.status !== 'cancelled');
    return (
      <div className="space-y-6">
        <PageTitle title="Agenda" />
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Agenda de citas del plan Profesional"
          action={<Link to="/dashboard/suscripcion?plan=pro" className="btn-primary"><Sparkles className="h-4 w-4" /> Ver plan Profesional</Link>}
        >
          Tus clientes eligen un hueco libre en tu horario y tú confirmas la cita. Sin llamadas de ida y vuelta.
        </EmptyState>
        {conservadas.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold">Tus citas anteriores</h2>
            <ListaCitas citas={conservadas} />
          </section>
        )}
      </div>
    );
  }

  const lunes = lunesDe(fecha);
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const hoy = hoyCuba();
  const delDia = (data.appointments ?? []).filter((a) => fechaDeCita(a) === fecha && (verCanceladas || activa(a)));
  const inicioDia = instanteCuba(fecha, 0), finDia = instanteCuba(sumarDias(fecha, 1), 0);
  const bloqueosDia = data.blocks.filter((b) => ms(b.starts_at) < finDia && ms(b.ends_at) > inicioDia);
  const proximas = data.appointments.filter((a) => activa(a) && ms(a.ends_at) >= Date.now());
  const canceladasDia = (data.appointments ?? []).filter((a) => fechaDeCita(a) === fecha && !activa(a)).length;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Agenda"
        subtitle={pendientes ? `Tienes ${pendientes} ${pendientes === 1 ? 'cita' : 'citas'} por confirmar.` : 'Toca una hora libre para apuntar una cita o bloquear tiempo.'}
        action={<Link to="/dashboard/agenda/ajustes" className="btn-secondary btn-sm self-start"><Settings2 className="h-4 w-4" /> Horario y reglas</Link>}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-grid grid-cols-2 gap-1 rounded-2xl bg-sand-100 p-1" role="tablist" aria-label="Vista">
          {([['dia', 'Día', CalendarDays], ['lista', 'Lista', List]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
              className={cn('flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-semibold transition', vista === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Spinner className="h-4 w-4 text-ink-400" />}
          {fueraDeCuba() && <span className="badge bg-sand-100 text-ink-600"><Globe2 className="h-3.5 w-3.5" /> Horas de Cuba</span>}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={cargar} />}

      {vista === 'dia' ? (
        <>
          <div className="card p-2">
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <button type="button" onClick={() => setFecha(sumarDias(fecha, -7))} className="btn-ghost btn-sm px-2" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
              <p className="text-sm font-semibold first-letter:uppercase text-ink-700">{fechaLargaCuba(mediodia(fecha))}</p>
              <div className="flex items-center">
                {fecha !== hoy && <button type="button" onClick={() => setFecha(hoy)} className="btn-ghost btn-sm">Hoy</button>}
                <button type="button" onClick={() => setFecha(sumarDias(fecha, 7))} className="btn-ghost btn-sm px-2" aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {semana.map((d) => {
                const n = porDia.get(d) ?? 0;
                const cerrado = !(data.dias.find((x) => x.date === d)?.tramos.length);
                return (
                  <button key={d} type="button" onClick={() => setFecha(d)} aria-pressed={d === fecha}
                    aria-label={`${fechaLargaCuba(mediodia(d))}${n ? `, ${n} ${n === 1 ? 'cita' : 'citas'}` : ''}`}
                    className={cn('flex flex-col items-center rounded-xl py-1.5 transition',
                      d === fecha ? 'bg-ink-900 text-white' : 'hover:bg-sand-100', cerrado && d !== fecha && 'text-ink-300')}>
                    <span className="text-[11px] font-semibold">{LETRA[diaSemana(d)]}</span>
                    <span className={cn('text-base font-bold', d === hoy && d !== fecha && 'text-brand-600')}>{Number(d.slice(8))}</span>
                    <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                      {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                        <span key={i} className={cn('h-1.5 w-1.5 rounded-full', d === fecha ? 'bg-white' : 'bg-sea-500')} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setNuevo(instanteCuba(fecha, 9 * 60))} className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Nueva</button>
            {canceladasDia > 0 && (
              <label className="flex items-center gap-2 text-sm text-ink-500">
                <input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} className="h-4 w-4 rounded border-sand-300" />
                Ver canceladas ({canceladasDia})
              </label>
            )}
          </div>

          <DayView
            date={fecha}
            dia={data.dias.find((d) => d.date === fecha)}
            appointments={delDia}
            blocks={bloqueosDia}
            onSlot={setNuevo}
            onAppointment={setSeleccion}
            onDeleteBlock={borrarBloqueo}
          />
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-400">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border-2 border-dashed border-amber-400" /> Por confirmar</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sea-300" /> Confirmada</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-ink-800" /> Hecha</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-300" /> No vino</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sand-300" /> Fuera de horario</span>
          </p>
        </>
      ) : proximas.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-400">No tienes citas en los próximos {DIAS_LISTA} días. Cuando un cliente pida una, aparecerá aquí.</div>
      ) : (
        <ListaCitas citas={proximas} onSelect={setSeleccion} />
      )}

      <NewEntrySheet instante={nuevo} duracionGeneral={data.agenda.duracion} servicios={servicios ?? []} onClose={cerrarNuevo} onSaved={trasCambio} />
      <AppointmentSheet cita={seleccion} onClose={cerrarCita} onChanged={trasCambio} />
    </div>
  );
}
