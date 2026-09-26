import { useEffect, useState, type MouseEvent } from 'react';
import { Ban, Trash2 } from 'lucide-react';
import type { AgendaBlock, Appointment, CalendarDay } from '../../types';
import { horaCuba, hoyCuba, instanteCuba, sumarDias } from '../../lib/cuba';
import { cn } from '../ui';
import { ESTILO_CITA, ms } from './shared';

const PX_MIN = 1.1; // 66 px por hora: legible a 390 px sin hacer la columna eterna
const MIN_ALTO = 26;

interface Props {
  date: string;
  dia?: CalendarDay;
  appointments: Appointment[];
  blocks: AgendaBlock[];
  onSlot: (instante: number) => void;
  onAppointment: (a: Appointment) => void;
  onDeleteBlock: (b: AgendaBlock) => void;
}

/** Reparte en columnas las citas que se pisan (solo pasa si el profesional forzó un choque). */
function columnas(citas: Appointment[]) {
  const orden = [...citas].sort((a, b) => ms(a.starts_at) - ms(b.starts_at) || ms(b.ends_at) - ms(a.ends_at));
  const res = new Map<string, { col: number; cols: number }>();
  let grupo: { a: Appointment; col: number }[] = [];
  let finGrupo = -Infinity;
  const cerrar = () => {
    const cols = Math.max(1, ...grupo.map((g) => g.col + 1));
    grupo.forEach((g) => res.set(g.a.id, { col: g.col, cols }));
    grupo = [];
  };
  for (const a of orden) {
    if (ms(a.starts_at) >= finGrupo) { cerrar(); finGrupo = -Infinity; }
    const ocupadas = grupo.filter((g) => ms(g.a.ends_at) > ms(a.starts_at)).map((g) => g.col);
    let col = 0;
    while (ocupadas.includes(col)) col++;
    grupo.push({ a, col });
    finGrupo = Math.max(finGrupo, ms(a.ends_at));
  }
  cerrar();
  return res;
}

export default function DayView({ date, dia, appointments, blocks, onSlot, onAppointment, onDeleteBlock }: Props) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const inicioDia = instanteCuba(date, 0);
  const finDia = instanteCuba(sumarDias(date, 1), 0);
  const minDe = (t: number) => (Math.min(Math.max(t, inicioDia), finDia) - inicioDia) / 60_000;

  const marcas = [
      minDe(instanteCuba(date, 8 * 60)), minDe(instanteCuba(date, 18 * 60)),
      ...(dia?.tramos ?? []).flatMap((t) => [minDe(ms(t.inicio)), minDe(ms(t.fin))]),
      ...appointments.flatMap((a) => [minDe(ms(a.starts_at)), minDe(ms(a.ends_at))]),
      ...blocks.flatMap((b) => [minDe(ms(b.starts_at)), minDe(ms(b.ends_at))]),
    ];
  const desde = Math.max(0, Math.floor(Math.min(...marcas) / 60) * 60 - 60);
  const hasta = Math.min((finDia - inicioDia) / 60_000, Math.ceil(Math.max(...marcas) / 60) * 60 + 60);

  const y = (min: number) => (min - desde) * PX_MIN;
  const alto = (hasta - desde) * PX_MIN;
  const horas: { min: number; t: number }[] = [];
  for (let h = 0; h <= 24; h++) {
    const t = instanteCuba(date, h * 60);
    const m = minDe(t);
    if (m >= desde && m < hasta && !horas.some((x) => x.min === m)) horas.push({ min: m, t });
  }
  const cols = columnas(appointments);
  const esHoy = date === hoyCuba();

  const tocar = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const min = desde + (e.clientY - rect.top) / PX_MIN;
    const redondeado = Math.round((min - 15) / 30) * 30; // la media hora que contiene el toque
    onSlot(inicioDia + Math.max(0, redondeado) * 60_000);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex">
        <div className="relative w-14 shrink-0 border-r border-sand-200 bg-paper" style={{ height: alto }} aria-hidden="true">
          {horas.map((h) => (
            <span key={h.min} className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-ink-400" style={{ top: y(h.min) }}>
              {horaCuba(h.t).replace(':00', '')}
            </span>
          ))}
        </div>
        <div
          className="relative flex-1 cursor-pointer bg-sand-100"
          style={{ height: alto }}
          onClick={tocar}
          role="button"
          tabIndex={0}
          aria-label="Toca una hora libre para apuntar una cita o bloquear tiempo"
          onKeyDown={(e) => { if (e.key === 'Enter') onSlot(instanteCuba(date, 9 * 60)); }}
        >
          {(dia?.tramos ?? []).map((t) => (
            <div key={t.inicio} className="absolute inset-x-0 bg-white" style={{ top: y(minDe(ms(t.inicio))), height: (minDe(ms(t.fin)) - minDe(ms(t.inicio))) * PX_MIN }} />
          ))}
          {horas.map((h) => (
            <div key={h.min} className="pointer-events-none absolute inset-x-0 border-t border-sand-200" style={{ top: y(h.min) }} />
          ))}
          {blocks.map((b) => {
            const top = y(minDe(ms(b.starts_at)));
            const h = Math.max(MIN_ALTO, (minDe(ms(b.ends_at)) - minDe(ms(b.starts_at))) * PX_MIN);
            return (
              <div
                key={b.id}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-x-1 flex items-start justify-between gap-2 overflow-hidden rounded-lg border border-ink-200 px-2 py-1 text-xs text-ink-600"
                style={{ top, height: h, background: 'repeating-linear-gradient(135deg, #F4F6FA 0 6px, #E6EAF2 6px 12px)' }}
              >
                <span className="flex min-w-0 items-center gap-1 font-semibold">
                  <Ban className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{b.note || 'Bloqueado'}</span>
                </span>
                <button type="button" onClick={() => onDeleteBlock(b)} className="-m-1 shrink-0 rounded p-1 hover:bg-white/80" aria-label="Quitar bloqueo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {appointments.map((a) => {
            const pos = cols.get(a.id) ?? { col: 0, cols: 1 };
            const top = y(minDe(ms(a.starts_at)));
            const h = Math.max(MIN_ALTO, (minDe(ms(a.ends_at)) - minDe(ms(a.starts_at))) * PX_MIN);
            const ancho = 100 / pos.cols;
            return (
              <button
                key={a.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onAppointment(a); }}
                className={cn('absolute overflow-hidden rounded-lg px-2 py-1 text-left text-xs shadow-sm transition hover:brightness-95', ESTILO_CITA[a.status])}
                style={{ top, height: h, left: `calc(${pos.col * ancho}% + 4px)`, width: `calc(${ancho}% - 8px)` }}
              >
                <span className="block truncate font-bold">{horaCuba(ms(a.starts_at))} · {a.client_name}</span>
                {h > 40 && a.service_title && <span className="block truncate opacity-80">{a.service_title}</span>}
              </button>
            );
          })}
          {esHoy && ahora >= inicioDia && ahora < finDia && minDe(ahora) >= desde && minDe(ahora) <= hasta && (
            <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: y(minDe(ahora)) }}>
              <span className="absolute -left-1.5 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
