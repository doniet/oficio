// Horas de pared en Cuba ↔ instantes UTC, con la tzdata de Node (ICU). Nunca se suma un
// desfase fijo: Cuba cambia de hora a las 0:00 (en marzo la franja 00:00–00:59 no existe y en
// noviembre ocurre dos veces), así que los días se recorren como fechas de calendario.
export const ZONA = 'America/Havana';

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
});
const SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface PartesLocales { fecha: string; minutos: number; diaSemana: number }

export function partesLocales(t: Date | number): PartesLocales {
  const p = Object.fromEntries(formato.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute), diaSemana: SEMANA[p.weekday] };
}

export const fechaLocal = (t: Date | number) => partesLocales(t).fecha;

const comoUtc = (fecha: string, minutos: number) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, minutos);
};
const desfase = (t: number) => {
  const p = partesLocales(t);
  return comoUtc(p.fecha, p.minutos) - Math.floor(t / 60_000) * 60_000;
};

/**
 * Instante (ms UTC) de una hora de pared en Cuba. Si esa hora no existe (salto de marzo) devuelve
 * null, salvo con `siNoExiste: 'despues'`, que da el instante del salto (sirve para los bordes de un
 * tramo). Si ocurre dos veces (noviembre), la primera.
 */
export function instanteLocal(fecha: string, minutos: number, siNoExiste: 'null' | 'despues' = 'null'): number | null {
  if (minutos >= 1440) return instanteLocal(sumarDias(fecha, 1), minutos - 1440, siNoExiste);
  const pared = comoUtc(fecha, minutos);
  const candidatos = [...new Set([desfase(pared - 14 * 3_600_000), desfase(pared + 14 * 3_600_000)])]
    .map((off) => pared - off)
    .filter((t) => { const p = partesLocales(t); return p.fecha === fecha && p.minutos === minutos; })
    .sort((a, b) => a - b);
  if (candidatos.length) return candidatos[0];
  if (siNoExiste === 'null') return null;
  // En el salto, la hora de pared anterior al cambio sigue el desfase viejo: cae justo después.
  return pared - desfase(pared - 14 * 3_600_000);
}

export function sumarDias(fecha: string, n: number) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diaSemana(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const aMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
