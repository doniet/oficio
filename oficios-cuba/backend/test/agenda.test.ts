import { describe, expect, it } from 'vitest';
import { api, crearServicio, db, ponerPlan, registrar } from './helpers.js';

const TODA_LA_SEMANA = Array.from({ length: 7 }, () => [{ desde: '00:00', hasta: '24:00' }]);

async function profesional(agenda: Record<string, unknown> = {}) {
  const p = await registrar('provider');
  ponerPlan(p.providerId!, 'pro');
  const res = await api.put('/api/appointments/config').set(p.auth)
    .send({ semana: TODA_LA_SEMANA, duracion: 60, intervalo: 60, antelacion_min: 0, horizonte_dias: 10, ...agenda });
  if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  return p;
}

const slots = async (providerId: string, query: Record<string, string> = {}) =>
  (await api.get(`/api/appointments/provider/${providerId}/slots`).query(query)).body;
const todos = (body: { days: { slots: string[] }[] }) => body.days.flatMap((d) => d.slots);
const pedir = (auth: Record<string, string>, provider_id: string, starts_at: string, extra: Record<string, unknown> = {}) =>
  api.post('/api/appointments').set(auth).send({ provider_id, starts_at, ...extra });
const enHoras = (h: number) => Date.now() + h * 3_600_000;

describe('agenda profesional', () => {
  it('dos clientes a la vez por el mismo hueco: solo uno se lo queda', async () => {
    const p = await profesional();
    const [a, b, c] = await Promise.all([registrar('client'), registrar('client'), registrar('client')]);
    const hora = todos(await slots(p.providerId!))[5];
    const res = await Promise.all([a, b, c].map((x) => pedir(x.auth, p.providerId!, hora)));
    expect(res.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it('una cita pendiente tapa los huecos que solapa, también los de otra duración', async () => {
    const p = await profesional({ intervalo: 30 });
    const largo = (await crearServicio(p.auth, { duration_min: 120 })).body.service.id;
    const c = await registrar('client');
    const body = await slots(p.providerId!, { service_id: largo });
    expect(body.duracion).toBe(120);
    expect(body.servicios[0]).toMatchObject({ id: largo, duration_min: 120 });
    const hora = todos(body)[10];
    const cita = await pedir(c.auth, p.providerId!, hora, { service_id: largo });
    expect(cita.body.appointment).toMatchObject({ status: 'pending', duration_min: 120 });
    expect(Date.parse(cita.body.appointment.ends_at) - Date.parse(hora)).toBe(120 * 60_000);

    const libres = todos(await slots(p.providerId!));
    for (const m of [0, 30, 60, 90]) expect(libres).not.toContain(new Date(Date.parse(hora) + m * 60_000).toISOString());
    expect(libres).not.toContain(new Date(Date.parse(hora) - 30 * 60_000).toISOString()); // su hora pisaría la cita
    expect(libres).toContain(new Date(Date.parse(hora) + 120 * 60_000).toISOString());
  });

  it('con confirmación automática la cita nace confirmada', async () => {
    const p = await profesional({ confirmacion: 'auto' });
    const c = await registrar('client');
    const res = await pedir(c.auth, p.providerId!, todos(await slots(p.providerId!))[3]);
    expect(res.body.appointment.status).toBe('confirmed');
  });

  it('el cliente solo cancela o cambia dentro del plazo', async () => {
    const p = await profesional({ cancelacion_horas: 48 });
    const c = await registrar('client');
    const libres = todos(await slots(p.providerId!));
    const pronto = libres.find((s) => Date.parse(s) > enHoras(2))!;
    const lejos = libres.find((s) => Date.parse(s) > enHoras(24 * 5))!;

    const a = (await pedir(c.auth, p.providerId!, pronto)).body.appointment;
    expect(a.can_change).toBe(false);
    expect(a).toHaveProperty('provider_whatsapp');
    const fuera = await api.patch(`/api/appointments/${a.id}`).set(c.auth).send({ status: 'cancelled' });
    expect(fuera.status).toBe(403);
    expect(fuera.body.error).toContain('48 h');
    expect((await api.post(`/api/appointments/${a.id}/reschedule`).set(c.auth).send({ starts_at: lejos })).status).toBe(403);

    const b = (await pedir(c.auth, p.providerId!, lejos)).body.appointment;
    expect(b.can_change).toBe(true);
    const cancelada = await api.patch(`/api/appointments/${b.id}`).set(c.auth).send({ status: 'cancelled' });
    expect(cancelada.body.appointment).toMatchObject({ status: 'cancelled', cancelled_by: 'client' });
  });

  it('reprogramar crea una cita enlazada y libera la hora vieja', async () => {
    const p = await profesional({ cancelacion_horas: 0 });
    const c = await registrar('client');
    const libres = todos(await slots(p.providerId!));
    const vieja = (await pedir(c.auth, p.providerId!, libres[4])).body.appointment;
    await api.patch(`/api/appointments/${vieja.id}`).set(p.auth).send({ status: 'confirmed' });

    // El cliente no puede irse a un hueco ocupado.
    const otro = await registrar('client');
    await pedir(otro.auth, p.providerId!, libres[6]);
    expect((await api.post(`/api/appointments/${vieja.id}/reschedule`).set(c.auth).send({ starts_at: libres[6] })).status).toBe(409);

    const res = await api.post(`/api/appointments/${vieja.id}/reschedule`).set(c.auth).send({ starts_at: libres[8] });
    expect(res.status).toBe(201);
    // Con confirmación manual, la nueva hora vuelve a esperar al profesional.
    expect(res.body.appointment).toMatchObject({ status: 'pending', rescheduled_from: vieja.id, starts_at: libres[8] });
    expect(db.prepare('SELECT status, cancelled_by FROM appointments WHERE id = ?').get(vieja.id)).toEqual({ status: 'cancelled', cancelled_by: 'client' });
    expect(todos(await slots(p.providerId!))).toContain(libres[4]);

    // El profesional puede moverla a cualquier hora, pero se le avisa si choca.
    const nueva = res.body.appointment.id;
    const choque = await api.post(`/api/appointments/${nueva}/reschedule`).set(p.auth).send({ starts_at: libres[6] });
    expect(choque.status).toBe(409);
    expect(choque.body.code).toBe('choque');
    const forzada = await api.post(`/api/appointments/${nueva}/reschedule`).set(p.auth).send({ starts_at: libres[6], forzar: true });
    expect(forzada.body.appointment).toMatchObject({ status: 'confirmed', rescheduled_from: nueva });
  });

  it('cita manual sin cuenta, "no vino" solo pasada la hora y el contador de ausencias', async () => {
    const p = await profesional();
    const manual = (inicio: number, extra: Record<string, unknown> = {}) => api.post('/api/appointments/manual').set(p.auth)
      .send({ starts_at: new Date(inicio).toISOString(), duration_min: 30, client_name: 'Mercedes', client_phone: '+53 5 999 0000', ...extra });

    const pasada = await manual(enHoras(-3));
    expect(pasada.status).toBe(201);
    expect(pasada.body.appointment).toMatchObject({ origin: 'manual', status: 'confirmed', client_id: null, client_name: 'Mercedes', client_phone: '+53 5 999 0000' });
    expect((await api.patch(`/api/appointments/${pasada.body.appointment.id}`).set(p.auth).send({ status: 'no_show' })).body.appointment.status).toBe('no_show');

    const futura = (await manual(enHoras(30))).body.appointment;
    expect(futura.no_shows).toBe(1);
    expect((await api.patch(`/api/appointments/${futura.id}`).set(p.auth).send({ status: 'no_show' })).status).toBe(400);
    expect((await api.patch(`/api/appointments/${futura.id}`).set(p.auth).send({ status: 'done' })).status).toBe(400);

    // Un choque se avisa y se puede forzar.
    const choque = await manual(enHoras(30) + 10 * 60_000);
    expect(choque.status).toBe(409);
    expect((await manual(enHoras(30) + 10 * 60_000, { forzar: true })).status).toBe(201);

    // La cita manual también ocupa para las reservas online.
    const hora = new Date(futura.starts_at);
    expect(todos(await slots(p.providerId!)).some((s) => Math.abs(Date.parse(s) - hora.getTime()) < 30 * 60_000)).toBe(false);

    // Un cliente no puede apuntar citas manuales.
    const c = await registrar('client');
    expect((await api.post('/api/appointments/manual').set(c.auth).send({ starts_at: new Date(enHoras(40)).toISOString(), duration_min: 30, client_name: 'X' })).status).toBe(403);
  });

  it('los bloqueos quitan huecos, salen en el calendario y solo los borra su dueño', async () => {
    const p = await profesional();
    const libres = todos(await slots(p.providerId!));
    const bloque = await api.post('/api/appointments/blocks').set(p.auth)
      .send({ starts_at: libres[2], ends_at: new Date(Date.parse(libres[2]) + 3 * 3_600_000).toISOString(), note: 'Almuerzo' });
    expect(bloque.status).toBe(201);
    const ahora = todos(await slots(p.providerId!));
    for (const i of [2, 3, 4]) expect(ahora).not.toContain(libres[i]);
    expect(ahora).toContain(libres[5]);

    const hoy = new Date().toISOString().slice(0, 10);
    const hasta = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const cal = (await api.get('/api/appointments/calendar').set(p.auth).query({ desde: hoy, hasta })).body;
    expect(cal.blocks.map((b: { id: string }) => b.id)).toContain(bloque.body.block.id);
    expect(cal.dias.length).toBeGreaterThanOrEqual(5);
    expect(cal.dias[0].tramos).toHaveLength(1);

    const ajeno = await profesional();
    expect((await api.delete(`/api/appointments/blocks/${bloque.body.block.id}`).set(ajeno.auth)).status).toBe(404);
    expect((await api.delete(`/api/appointments/blocks/${bloque.body.block.id}`).set(p.auth)).status).toBe(200);
    expect(todos(await slots(p.providerId!))).toContain(libres[3]);
  });

  it('el límite de citas por día y la antelación se aplican en el servidor', async () => {
    const p = await profesional({ max_por_dia: 1, antelacion_min: 180 });
    const [a, b] = await Promise.all([registrar('client'), registrar('client')]);
    const body = await slots(p.providerId!);
    const [primero] = todos(body);
    expect(Date.parse(primero)).toBeGreaterThanOrEqual(Date.now() + 179 * 60_000);
    expect((await pedir(a.auth, p.providerId!, new Date(Math.ceil(enHoras(1) / 3_600_000) * 3_600_000).toISOString())).status).toBe(409);

    expect((await pedir(a.auth, p.providerId!, primero)).status).toBe(201);
    const mismoDia = body.days[0].slots[1];
    if (mismoDia) expect((await pedir(b.auth, p.providerId!, mismoDia)).status).toBe(409);
    expect((await slots(p.providerId!)).days[0]?.date).not.toBe(body.days[0].date);
  });
});
