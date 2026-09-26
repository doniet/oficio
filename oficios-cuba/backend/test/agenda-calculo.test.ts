import { describe, expect, it } from 'vitest';
import { agendaDesdeJson, agendaSchema, calcularHuecos, leerAgenda, type AgendaConfig } from '../src/lib/agenda.js';
import { instanteLocal } from '../src/lib/hora.js';

const semanaIgual = (tramos: { desde: string; hasta: string }[]) => Array.from({ length: 7 }, () => tramos);
const agenda = (extra: Partial<AgendaConfig> = {}): AgendaConfig =>
  agendaSchema.parse({ semana: semanaIgual([{ desde: '09:00', hasta: '12:00' }]), duracion: 60, intervalo: 60, antelacion_min: 0, horizonte_dias: 3, ...extra });
const t = (s: string) => Date.parse(s);
const horas = (dias: { date: string; slots: string[] }[], fecha: string) => dias.find((d) => d.date === fecha)?.slots ?? [];

// 2026-09-26 00:00 en Cuba (UTC-4 en verano) = 04:00 UTC.
const MEDIANOCHE = t('2026-09-26T04:00:00Z');

describe('cálculo de huecos', () => {
  it('reparte los tramos en hora de Cuba y respeta varios tramos por día', () => {
    const a = agenda({ semana: semanaIgual([{ desde: '09:00', hasta: '11:00' }, { desde: '15:00', hasta: '16:00' }]) });
    const dias = calcularHuecos({ agenda: a, duracion: 60, citas: [], bloqueos: [], ahora: MEDIANOCHE });
    expect(horas(dias, '2026-09-26')).toEqual(['2026-09-26T13:00:00.000Z', '2026-09-26T14:00:00.000Z', '2026-09-26T19:00:00.000Z']);
    expect(dias.map((d) => d.date)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
  });

  it('la cita entera tiene que caber en el tramo', () => {
    const dias = calcularHuecos({ agenda: agenda({ intervalo: 30 }), duracion: 90, citas: [], bloqueos: [], ahora: MEDIANOCHE });
    // 09:00, 09:30, 10:00 y 10:30 (termina a las 12:00); 11:00 ya no cabe.
    expect(horas(dias, '2026-09-26')).toHaveLength(4);
  });

  it('una cita ocupa por solape, no solo cuando empieza a la misma hora', () => {
    const a = agenda({ intervalo: 30 });
    // Cita de 09:30 a 10:30: tapa los huecos de 09:00, 09:30 y 10:00 (de 60 min).
    const citas = [{ inicio: t('2026-09-26T13:30:00Z'), fin: t('2026-09-26T14:30:00Z') }];
    expect(horas(calcularHuecos({ agenda: a, duracion: 60, citas, bloqueos: [], ahora: MEDIANOCHE }), '2026-09-26'))
      .toEqual(['2026-09-26T14:30:00.000Z', '2026-09-26T15:00:00.000Z']);
  });

  it('los márgenes separan las citas y los bloqueos quitan huecos', () => {
    const a = agenda({ intervalo: 30, margen_despues: 30, semana: semanaIgual([{ desde: '09:00', hasta: '14:00' }]) });
    const citas = [{ inicio: t('2026-09-26T13:00:00Z'), fin: t('2026-09-26T14:00:00Z') }]; // 09:00–10:00
    const bloqueos = [{ inicio: t('2026-09-26T16:00:00Z'), fin: t('2026-09-26T17:00:00Z') }]; // 12:00–13:00
    // La cita nueva empieza tras 10:00 + 30 min de margen; su propio margen no puede pisar el bloqueo.
    expect(horas(calcularHuecos({ agenda: a, duracion: 60, citas, bloqueos, ahora: MEDIANOCHE }), '2026-09-26'))
      .toEqual(['2026-09-26T14:30:00.000Z', '2026-09-26T17:00:00.000Z']);
  });

  it('antelación mínima, horizonte y límite por día', () => {
    const ahora = t('2026-09-26T13:30:00Z'); // 09:30 en Cuba
    const a = agenda({ antelacion_min: 60, horizonte_dias: 2, max_por_dia: 1 });
    const dias = calcularHuecos({ agenda: a, duracion: 60, citas: [], bloqueos: [], ahora });
    expect(horas(dias, '2026-09-26')).toEqual(['2026-09-26T15:00:00.000Z']); // 11:00 (10:00 queda a menos de 1 h)
    expect(dias.map((d) => d.date)).toEqual(['2026-09-26', '2026-09-27']);

    const llena = calcularHuecos({ agenda: a, duracion: 60, citas: [{ inicio: t('2026-09-27T13:00:00Z'), fin: t('2026-09-27T14:00:00Z') }], bloqueos: [], ahora });
    expect(llena.map((d) => d.date)).toEqual(['2026-09-26']);
  });

  it('las excepciones por fecha cambian o cierran un día', () => {
    const a = agenda({ excepciones: [{ fecha: '2026-09-26', tramos: [] }, { fecha: '2026-09-27', tramos: [{ desde: '18:00', hasta: '19:00' }] }] });
    const dias = calcularHuecos({ agenda: a, duracion: 60, citas: [], bloqueos: [], ahora: MEDIANOCHE });
    expect(horas(dias, '2026-09-26')).toEqual([]);
    expect(horas(dias, '2026-09-27')).toEqual(['2026-09-27T22:00:00.000Z']);
  });

  it('cambio de hora de marzo: la franja 00:00–00:59 no existe', () => {
    const a = agenda({ semana: semanaIgual([{ desde: '00:00', hasta: '02:00' }]), intervalo: 30, duracion: 30, horizonte_dias: 1 });
    const ahora = t('2026-03-08T04:00:00Z'); // 7 de marzo, 23:00 en Cuba (UTC-5)
    const dias = calcularHuecos({ agenda: a, duracion: 30, citas: [], bloqueos: [], ahora });
    expect(dias).toEqual([]); // el horizonte de 1 día es el 7

    const d8 = calcularHuecos({ agenda: { ...a, horizonte_dias: 2 }, duracion: 30, citas: [], bloqueos: [], ahora });
    // A las 00:00 se pasa a las 01:00 (UTC-4): solo hay 01:00 y 01:30, sin duplicados.
    expect(horas(d8, '2026-03-08')).toEqual(['2026-03-08T05:00:00.000Z', '2026-03-08T05:30:00.000Z']);
  });

  it('cambio de hora de noviembre: la hora repetida no duplica huecos', () => {
    const a = agenda({ semana: semanaIgual([{ desde: '00:00', hasta: '02:00' }]), intervalo: 30, duracion: 30, horizonte_dias: 2 });
    const ahora = t('2026-10-31T12:00:00Z');
    const slots = horas(calcularHuecos({ agenda: a, duracion: 30, citas: [], bloqueos: [], ahora }), '2026-11-01');
    // 00:00 y 00:30 (aún UTC-4), 01:00 y 01:30 (ya UTC-5). El tramo termina a las 02:00 UTC-5 = 07:00 UTC.
    expect(slots).toEqual(['2026-11-01T04:00:00.000Z', '2026-11-01T04:30:00.000Z', '2026-11-01T06:00:00.000Z', '2026-11-01T06:30:00.000Z']);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('las horas de pared se convierten con la tzdata, no con un desfase fijo', () => {
    expect(new Date(instanteLocal('2026-01-15', 9 * 60)!).toISOString()).toBe('2026-01-15T14:00:00.000Z'); // UTC-5
    expect(new Date(instanteLocal('2026-07-15', 9 * 60)!).toISOString()).toBe('2026-07-15T13:00:00.000Z'); // UTC-4
    expect(instanteLocal('2026-03-08', 30)).toBeNull();
  });
});

describe('formato de la agenda', () => {
  it('lee el formato viejo con el comportamiento de antes', () => {
    const a = leerAgenda(JSON.stringify({ dias: [1, 2], desde: '08:00', hasta: '12:00', duracion: 60 }));
    expect(a.semana[1]).toEqual([{ desde: '08:00', hasta: '12:00' }]);
    expect(a.semana[0]).toEqual([]);
    expect(a).toMatchObject({ duracion: 60, intervalo: 60, antelacion_min: 60, horizonte_dias: 14 });
  });

  it('rechaza tramos solapados o al revés, y una agenda rota vuelve a la de por defecto', () => {
    expect(() => agendaDesdeJson({ semana: semanaIgual([{ desde: '09:00', hasta: '12:00' }, { desde: '11:00', hasta: '13:00' }]), duracion: 60 })).toThrow();
    expect(() => agendaDesdeJson({ semana: semanaIgual([{ desde: '12:00', hasta: '09:00' }]), duracion: 60 })).toThrow();
    expect(agendaDesdeJson({ semana: semanaIgual([{ desde: '20:00', hasta: '24:00' }]), duracion: 60 }).semana[0]).toHaveLength(1);
    expect(leerAgenda('{"basura":1}').duracion).toBe(60);
  });
});
