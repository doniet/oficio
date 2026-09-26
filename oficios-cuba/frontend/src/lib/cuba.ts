// Las citas son siempre en hora de Cuba, esté donde esté el dispositivo (familiares fuera de Cuba
// que piden cita para alguien de aquí). Misma lógica que backend/src/lib/hora.ts: tzdata del
// navegador, sin desfases fijos, y los días se recorren como fechas de calendario.
export const ZONA_CUBA = 'America/Havana';

const partes = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_CUBA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export function partesCuba(t: Date | number | string) {
  const p = Object.fromEntries(partes.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

/** YYYY-MM-DD en Cuba de un instante. */
export const fechaCuba = (t: Date | number | string) => partesCuba(t).fecha;
/** Minutos desde la medianoche de Cuba. */
export const minutosCuba = (t: Date | number | string) => partesCuba(t).minutos;
export const hoyCuba = () => fechaCuba(Date.now());

const comoUtc = (fecha: string, minutos: number) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, minutos);
};
const desfase = (t: number) => {
  const p = partesCuba(t);
  return comoUtc(p.fecha, p.minutos) - Math.floor(t / 60_000) * 60_000;
};

export function sumarDias(fecha: string, n: number) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = domingo. */
export function diaSemana(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Instante de una hora de pared en Cuba ("09:30" o minutos). Una hora que no existe por el cambio
 * de marzo cae justo después del salto; una que ocurre dos veces (noviembre), la primera.
 */
export function instanteCuba(fecha: string, hora: string | number): number {
  const minutos = typeof hora === 'number' ? hora : aMinutos(hora);
  if (minutos >= 1440) return instanteCuba(sumarDias(fecha, 1), minutos - 1440);
  const pared = comoUtc(fecha, minutos);
  const candidatos = [...new Set([desfase(pared - 14 * 3_600_000), desfase(pared + 14 * 3_600_000)])]
    .map((off) => pared - off)
    .filter((t) => { const p = partesCuba(t); return p.fecha === fecha && p.minutos === minutos; })
    .sort((a, b) => a - b);
  return candidatos[0] ?? pared - desfase(pared - 14 * 3_600_000);
}

export const aMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const aHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA_CUBA, ...opts });
const fmtHora = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });
const fmtFechaLarga = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtFechaCorta = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fmtMes = fmt({ month: 'long', year: 'numeric' });

/** "9:30 a. m." en hora de Cuba. */
export const horaCuba = (t: Date | number | string) => fmtHora.format(new Date(t));
/** "sábado, 26 de septiembre" en hora de Cuba. */
export const fechaLargaCuba = (t: Date | number | string) => fmtFechaLarga.format(new Date(t));
/** "sáb 26 sept" en hora de Cuba. */
export const fechaCortaCuba = (t: Date | number | string) => fmtFechaCorta.format(new Date(t)).replace(/\./g, '');
export const mesCuba = (t: Date | number | string) => fmtMes.format(new Date(t));

/** Mediodía de Cuba de una fecha: un instante seguro para formatearla (nunca cae en otro día). */
export const mediodia = (fecha: string) => instanteCuba(fecha, 12 * 60);

/** ¿El dispositivo está en otra zona? Entonces hay que avisar de que las horas son de Cuba. */
export function fueraDeCuba() {
  try {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zona === ZONA_CUBA) return false;
    const ahora = Date.now();
    return new Date(ahora).getTimezoneOffset() !== -desfase(ahora) / 60_000;
  } catch {
    return false;
  }
}

// ── Añadir al calendario (sin pasar por la API) ─────────────────────────────────────────────────

const utcCompacto = (t: Date | number | string) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escaparIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

export interface EventoCalendario { id: string; titulo: string; inicio: string; fin: string; detalle?: string; lugar?: string }

/** Archivo .ics con avisos 1 día y 1 hora antes. En UTC: cada calendario lo pasa a su zona. */
export function archivoIcs(e: EventoCalendario) {
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Oficios Cuba//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@oficio.dardoit.com`,
    `DTSTAMP:${utcCompacto(Date.now())}`,
    `DTSTART:${utcCompacto(e.inicio)}`,
    `DTEND:${utcCompacto(e.fin)}`,
    `SUMMARY:${escaparIcs(e.titulo)}`,
    ...(e.detalle ? [`DESCRIPTION:${escaparIcs(e.detalle)}`] : []),
    ...(e.lugar ? [`LOCATION:${escaparIcs(e.lugar)}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio de cita', 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio de cita', 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return new Blob([lineas.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
}

export function descargarIcs(e: EventoCalendario) {
  const url = URL.createObjectURL(archivoIcs(e));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cita.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function enlaceGoogleCalendar(e: EventoCalendario) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.titulo,
    dates: `${utcCompacto(e.inicio)}/${utcCompacto(e.fin)}`,
    ctz: ZONA_CUBA,
  });
  if (e.detalle) p.set('details', e.detalle);
  if (e.lugar) p.set('location', e.lugar);
  return `https://calendar.google.com/calendar/render?${p}`;
}
