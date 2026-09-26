import { z } from 'zod';
import { aMinutos, diaSemana, fechaLocal, instanteLocal, sumarDias } from './hora.js';

// Configuración de la agenda (JSON en provider_profiles.agenda). Formato 2: varios tramos por día,
// excepciones por fecha y reglas de reserva. El formato 1 ({dias, desde, hasta, duracion}) se sigue leyendo.
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida');
const hhmmFin = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Hora no válida');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');

const tramoSchema = z.object({ desde: hhmm, hasta: hhmmFin })
  .refine((t) => t.desde < t.hasta, { message: 'Cada tramo debe terminar después de empezar', path: ['hasta'] });

function sinSolapes(tramos: { desde: string; hasta: string }[]) {
  const orden = [...tramos].sort((a, b) => a.desde.localeCompare(b.desde));
  return orden.every((t, i) => i === 0 || orden[i - 1].hasta <= t.desde);
}
const tramosSchema = z.array(tramoSchema).max(6).refine(sinSolapes, 'Los tramos de un mismo día se solapan');

export const agendaSchema = z.object({
  v: z.literal(2).default(2),
  semana: z.array(tramosSchema).length(7), // índice 0 = domingo
  excepciones: z.array(z.object({ fecha, tramos: tramosSchema })).max(200)
    .refine((e) => new Set(e.map((x) => x.fecha)).size === e.length, 'Hay dos excepciones para la misma fecha')
    .default([]),
  duracion: z.number().int().min(10).max(480),
  intervalo: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
  margen_antes: z.number().int().min(0).max(240).default(0),
  margen_despues: z.number().int().min(0).max(240).default(0),
  antelacion_min: z.number().int().min(0).max(7 * 1440).default(120),
  horizonte_dias: z.number().int().min(1).max(90).default(30),
  max_por_dia: z.number().int().min(1).max(100).nullable().default(null),
  confirmacion: z.enum(['manual', 'auto']).default('manual'),
  cancelacion_horas: z.number().int().min(0).max(168).default(12),
});

export type AgendaConfig = z.infer<typeof agendaSchema>;
export type Tramo = { desde: string; hasta: string };

const LABORABLE = [{ desde: '09:00', hasta: '17:00' }];
export const AGENDA_POR_DEFECTO: AgendaConfig = agendaSchema.parse({
  semana: [[], LABORABLE, LABORABLE, LABORABLE, LABORABLE, LABORABLE, LABORABLE],
  duracion: 60,
});

const legadoSchema = z.object({
  dias: z.array(z.number().int().min(0).max(6)).max(7),
  desde: hhmm,
  hasta: hhmm,
  duracion: z.number().int(),
});

/** Valida una agenda en cualquiera de los dos formatos; lanza ZodError si no es válida. */
export function agendaDesdeJson(json: unknown): AgendaConfig {
  if (json && typeof json === 'object' && 'semana' in json) return agendaSchema.parse(json);
  const viejo = legadoSchema.parse(json);
  if (viejo.desde >= viejo.hasta) throw new z.ZodError([{ code: 'custom', message: 'La hora de fin debe ser posterior a la de inicio', path: ['hasta'] }]);
  // Conserva el comportamiento del formato 1: huecos cada `duracion`, 1 h de antelación y 14 días.
  return agendaSchema.parse({
    semana: [0, 1, 2, 3, 4, 5, 6].map((d) => (viejo.dias.includes(d) ? [{ desde: viejo.desde, hasta: viejo.hasta }] : [])),
    duracion: viejo.duracion,
    intervalo: [15, 30, 60].includes(viejo.duracion) ? viejo.duracion : 30,
    antelacion_min: 60,
    horizonte_dias: 14,
    cancelacion_horas: 0,
  });
}

export function leerAgenda(raw: string | null): AgendaConfig {
  if (!raw) return AGENDA_POR_DEFECTO;
  try {
    return agendaDesdeJson(JSON.parse(raw));
  } catch {
    return AGENDA_POR_DEFECTO;
  }
}

export function tramosDelDia(agenda: AgendaConfig, dia: string): Tramo[] {
  const excepcion = agenda.excepciones.find((e) => e.fecha === dia);
  return (excepcion ? excepcion.tramos : agenda.semana[diaSemana(dia)]) as Tramo[];
}

export interface Intervalo { inicio: number; fin: number }

/** Bordes reales (ms UTC) de un tramo de pared; un borde inexistente por el cambio de hora cae tras el salto. */
export function tramoEnInstantes(dia: string, t: Tramo): Intervalo {
  return { inicio: instanteLocal(dia, aMinutos(t.desde), 'despues')!, fin: instanteLocal(dia, aMinutos(t.hasta), 'despues')! };
}

export const seSolapan = (a: Intervalo, b: Intervalo) => a.inicio < b.fin && b.inicio < a.fin;

export interface EntradaHuecos {
  agenda: AgendaConfig;
  duracion: number;
  /** Citas que ocupan (todas menos las canceladas): el margen se les aplica aquí. */
  citas: Intervalo[];
  bloqueos: Intervalo[];
  ahora: number;
  /** Solo estos días (YYYY-MM-DD), dentro del horizonte. Por defecto, todo el horizonte. */
  soloDia?: string;
}

/**
 * Huecos libres por día. Un hueco vale si la cita entera cabe dentro de un tramo y, con sus
 * márgenes, no se solapa con otra cita (también con sus márgenes) ni con un bloqueo. Las citas
 * pendientes ocupan igual que las confirmadas: si no, dos clientes podrían pedir el mismo hueco.
 */
export function calcularHuecos({ agenda, duracion, citas, bloqueos, ahora, soloDia }: EntradaHuecos) {
  const antes = agenda.margen_antes * 60_000;
  const despues = agenda.margen_despues * 60_000;
  const dur = duracion * 60_000;
  const ocupado = [
    ...citas.map((c) => ({ inicio: c.inicio - antes, fin: c.fin + despues })),
    ...bloqueos,
  ];
  const minimo = ahora + agenda.antelacion_min * 60_000;
  const citasPorDia = new Map<string, number>();
  for (const c of citas) {
    const d = fechaLocal(c.inicio);
    citasPorDia.set(d, (citasPorDia.get(d) ?? 0) + 1);
  }

  const hoy = fechaLocal(ahora);
  const dias: { date: string; slots: string[] }[] = [];
  for (let i = 0; i < agenda.horizonte_dias; i++) {
    const dia = sumarDias(hoy, i);
    if (soloDia && dia !== soloDia) continue;
    if (agenda.max_por_dia !== null && (citasPorDia.get(dia) ?? 0) >= agenda.max_por_dia) continue;
    const slots: string[] = [];
    for (const tramo of tramosDelDia(agenda, dia)) {
      const { fin } = tramoEnInstantes(dia, tramo);
      for (let m = aMinutos(tramo.desde); m < aMinutos(tramo.hasta); m += agenda.intervalo) {
        const inicio = instanteLocal(dia, m);
        if (inicio === null || inicio < minimo || inicio + dur > fin) continue;
        const conMargen = { inicio: inicio - antes, fin: inicio + dur + despues };
        if (ocupado.some((o) => seSolapan(conMargen, o))) continue;
        slots.push(new Date(inicio).toISOString());
      }
    }
    if (slots.length) dias.push({ date: dia, slots: [...new Set(slots)].sort() });
  }
  return dias;
}
