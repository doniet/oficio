import type { Appointment, AppointmentStatus } from '../../types';
import { aHHMM, fechaCuba, horaCuba, instanteCuba, minutosCuba, sumarDias, diaSemana } from '../../lib/cuba';
import { parseDate } from '../../lib/format';

/** Colores de cada estado en el calendario. La pendiente, con borde discontinuo: aún no es firme. */
export const ESTILO_CITA: Record<AppointmentStatus, string> = {
  pending: 'border-2 border-dashed border-amber-400 bg-amber-50 text-amber-900',
  confirmed: 'border border-sea-300 bg-sea-100 text-sea-900',
  done: 'border border-ink-800 bg-ink-800 text-white',
  no_show: 'border border-red-300 bg-red-50 text-red-800',
  cancelled: 'border border-sand-300 bg-sand-100 text-ink-400 line-through',
};

export const ms = (iso: string) => parseDate(iso).getTime();
export const fechaDeCita = (a: Appointment) => fechaCuba(ms(a.starts_at));
export const rangoHoras = (a: Appointment) => `${horaCuba(ms(a.starts_at))} – ${horaCuba(ms(a.ends_at))}`;
export const yaEmpezo = (a: Appointment) => ms(a.starts_at) <= Date.now();
export const activa = (a: Appointment) => a.status !== 'cancelled';

/** Lunes de la semana que contiene la fecha. */
export const lunesDe = (fecha: string) => sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));

/** "HH:MM" de pared en Cuba de un instante (para rellenar un <input type="time">). */
export const hhmmCuba = (t: number) => aHHMM(minutosCuba(t));

/** Instante ISO de una fecha y una hora "HH:MM" de Cuba. */
export const isoCuba = (fecha: string, hhmm: string) => new Date(instanteCuba(fecha, hhmm)).toISOString();

export const duracionTexto = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};
