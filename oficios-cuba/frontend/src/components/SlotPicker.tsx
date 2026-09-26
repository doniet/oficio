import { useEffect, useMemo, useRef } from 'react';
import { CalendarX, Globe } from 'lucide-react';
import { fechaCortaCuba, fueraDeCuba, hoyCuba, horaCuba, mediodia, minutosCuba, sumarDias } from '../lib/cuba';
import { cn } from './ui';

export type SlotDay = { date: string; slots: string[] };

/** "45 min", "1 h", "1 h 30 min". */
export function duracionTexto(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const FRANJAS: { label: string; desde: number; hasta: number }[] = [
  { label: 'Mañana', desde: 0, hasta: 12 * 60 },
  { label: 'Tarde', desde: 12 * 60, hasta: 19 * 60 },
  { label: 'Noche', desde: 19 * 60, hasta: 24 * 60 },
];

interface Props {
  days: SlotDay[];
  horizonte: number;
  day: string | null;
  slot: string | null;
  onDay: (date: string) => void;
  onSlot: (iso: string) => void;
  duracion: number;
}

/** Elegir día (tira horizontal; solo se tocan los días con huecos) y hora (agrupada por franjas). Hora de Cuba. */
export default function SlotPicker({ days, horizonte, day, slot, onDay, onSlot, duracion }: Props) {
  const porFecha = useMemo(() => new Map(days.map((d) => [d.date, d.slots])), [days]);
  // La tira llega hasta el último día con huecos (dentro del horizonte), no a 90 días vacíos.
  const fechas = useMemo(() => {
    const hoy = hoyCuba();
    const ultimo = days[days.length - 1]?.date ?? hoy;
    const lista: string[] = [];
    for (let i = 0; i < horizonte; i++) {
      const f = sumarDias(hoy, i);
      if (f > ultimo) break;
      lista.push(f);
    }
    return lista;
  }, [days, horizonte]);
  const tira = useRef<HTMLDivElement>(null);
  const otraZona = useMemo(() => fueraDeCuba(), []);

  useEffect(() => {
    tira.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [day]);

  if (!days.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-ink-500">
        <CalendarX className="h-7 w-7 text-ink-300" />
        No hay horarios libres en los próximos {horizonte} días. Prueba a contactarle por otra vía.
      </div>
    );
  }

  const slots = day ? porFecha.get(day) ?? [] : [];

  return (
    <div className="space-y-5">
      {otraZona && (
        <p className="flex items-center gap-1.5 rounded-xl bg-sea-50 px-3 py-2 text-xs font-semibold text-sea-800">
          <Globe className="h-4 w-4" /> Horas de Cuba
        </p>
      )}
      <div>
        <p className="label">Día</p>
        <div ref={tira} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {fechas.map((f) => {
            const libres = porFecha.get(f)?.length ?? 0;
            const [dia, num, mes] = fechaCortaCuba(mediodia(f)).replace(',', '').split(' ');
            return (
              <button
                key={f}
                type="button"
                disabled={!libres}
                onClick={() => onDay(f)}
                aria-pressed={f === day}
                aria-label={`${fechaCortaCuba(mediodia(f))}${libres ? `, ${libres} horas libres` : ', sin horas libres'}`}
                className={cn(
                  'flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs capitalize transition',
                  f === day ? 'border-ink-900 bg-ink-900 text-white'
                    : libres ? 'border-sand-200 bg-white text-ink-700 hover:border-ink-300'
                    : 'cursor-not-allowed border-transparent bg-sand-50 text-ink-300 line-through decoration-ink-200',
                )}
              >
                <span className="font-semibold">{dia}</span>
                <span className="font-display text-lg font-bold leading-tight">{num}</span>
                <span>{mes}</span>
              </button>
            );
          })}
        </div>
      </div>
      {day && (
        <div className="space-y-3">
          <p className="label mb-0">Hora <span className="font-normal text-ink-400">(dura {duracionTexto(duracion)})</span></p>
          {FRANJAS.map((fr) => {
            const enFranja = slots.filter((s) => { const m = minutosCuba(s); return m >= fr.desde && m < fr.hasta; });
            if (!enFranja.length) return null;
            return (
              <div key={fr.label}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">{fr.label}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {enFranja.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSlot(s)}
                      aria-pressed={s === slot}
                      className={cn(
                        'rounded-xl border py-2 text-sm font-semibold tabular-nums transition',
                        s === slot ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-200 bg-white text-ink-700 hover:border-ink-300',
                      )}
                    >
                      {horaCuba(s)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
