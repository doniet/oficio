import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { planDelPerfil, providerProfileIdFor } from '../db/index.js';
import { q, qOne, tx } from '../db/acceso.js';
import type { Tx } from '../db/acceso.js';
import { authMiddleware, AuthRequest, requireClient, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { DEMO_MODE, googleClientId } from '../config.js';
import {
  agendaDesdeJson, calcularHuecos, leerAgenda, seSolapan, tramoEnInstantes, tramosDelDia,
  type AgendaConfig, type Intervalo,
} from '../lib/agenda.js';
import { fechaLocal, sumarDias, ZONA } from '../lib/hora.js';
import { avisarCita } from '../lib/avisos.js';

const router = Router();

// Agenda del plan Profesional. Toda hora de pared es hora de Cuba (lib/hora.ts), sin depender
// del TZ del proceso; en la base, starts_at/ends_at son instantes ISO UTC.
const OCUPAN = "('pending', 'confirmed', 'done', 'no_show')";
const iso = (t: number) => new Date(t).toISOString();
const DIA_MS = 86_400_000;

// Fuera de una transacción, las consultas de huecos/choques van por el pool (mismas firmas que
// el cliente `c` que entrega tx()): así ocupacion/huecos/assertHuecoLibre/assertSinChoque no
// necesitan dos versiones, solo reciben el ejecutor correcto según si están dentro de una tx().
const POOL: Tx = { q, qOne };

async function perfilConAgenda(providerId: string) {
  const row = await qOne<{ id: string; agenda: unknown }>(
    'SELECT id, agenda FROM provider_profiles WHERE id = $1 AND is_active = true', [providerId],
  );
  if (!row) throw new AppError('Profesional no encontrado', 404);
  if (!(await planDelPerfil(row.id)).agenda) throw new AppError('Este profesional no tiene agenda de citas', 404);
  return { id: row.id, agenda: leerAgenda(row.agenda) };
}

async function miPerfil(req: AuthRequest) {
  const id = await providerProfileIdFor(req.user!.id);
  if (!id) throw new AppError('Perfil de proveedor no encontrado', 404);
  const row = await qOne<{ agenda: unknown }>('SELECT agenda FROM provider_profiles WHERE id = $1', [id]);
  const plan = await planDelPerfil(id);
  return { id, agenda: leerAgenda(row?.agenda ?? null), enabled: plan.agenda };
}

function exigirPro(enabled: boolean) {
  if (!enabled) throw new AppError('La agenda de citas es del plan Profesional', 403);
}

async function ocupacion(c: Tx, providerId: string, desde: number, hasta: number, excluir?: string) {
  // `excluir` es opcional: comparar contra un uuid vacío ('' como en el truco de SQLite con TEXT)
  // lanzaría 22P02 en Postgres, así que el filtro solo entra en el SQL cuando hace falta.
  const filtroExcluir = excluir ? ' AND id != $4' : '';
  const paramsCitas = excluir ? [providerId, iso(desde), iso(hasta), excluir] : [providerId, iso(desde), iso(hasta)];
  const citas = (await c.q<{ starts_at: string; ends_at: string }>(
    `SELECT starts_at, ends_at FROM appointments
     WHERE provider_id = $1 AND status IN ${OCUPAN} AND ends_at > $2 AND starts_at < $3${filtroExcluir}`,
    paramsCitas,
  )).map((r) => ({ inicio: Date.parse(r.starts_at), fin: Date.parse(r.ends_at) }));
  const bloqueos = (await c.q<{ starts_at: string; ends_at: string }>(
    'SELECT starts_at, ends_at FROM agenda_blocks WHERE provider_id = $1 AND ends_at > $2 AND starts_at < $3',
    [providerId, iso(desde), iso(hasta)],
  )).map((r) => ({ inicio: Date.parse(r.starts_at), fin: Date.parse(r.ends_at) }));
  return { citas, bloqueos };
}

async function huecos(c: Tx, providerId: string, agenda: AgendaConfig, duracion: number, opciones: { soloDia?: string; excluir?: string } = {}) {
  const ahora = Date.now();
  const { citas, bloqueos } = await ocupacion(c, providerId, ahora - DIA_MS, ahora + (agenda.horizonte_dias + 2) * DIA_MS, opciones.excluir);
  return calcularHuecos({ agenda, duracion, citas, bloqueos, ahora, soloDia: opciones.soloDia });
}

async function servicioDe(providerId: string, serviceId: string | undefined, agenda: AgendaConfig) {
  if (!serviceId) return { id: null, duracion: agenda.duracion };
  const s = await qOne<{ id: string; duration_min: number | null }>(
    'SELECT id, duration_min FROM services WHERE id = $1 AND provider_id = $2 AND is_active = true', [serviceId, providerId],
  );
  if (!s) throw new AppError('Servicio no encontrado', 404);
  return { id: s.id, duracion: s.duration_min ?? agenda.duracion };
}

/** Un hueco solo es reservable si lo da el cálculo de huecos de ese día (reglas incluidas). */
async function assertHuecoLibre(c: Tx, providerId: string, agenda: AgendaConfig, duracion: number, startsAt: string, excluir?: string) {
  const libres = await huecos(c, providerId, agenda, duracion, { soloDia: fechaLocal(Date.parse(startsAt)), excluir });
  if (!libres.some((d) => d.slots.includes(startsAt))) throw new AppError('Ese horario ya no está disponible. Elige otro.', 409);
}

/** Para las citas que pone el profesional: avisa del choque salvo que lo fuerce. */
async function assertSinChoque(c: Tx, providerId: string, cita: Intervalo, forzar: boolean, excluir?: string) {
  if (forzar) return;
  const { citas, bloqueos } = await ocupacion(c, providerId, cita.inicio, cita.fin, excluir);
  const choques = [...citas, ...bloqueos].filter((o) => seSolapan(cita, o)).length;
  if (choques) throw new AppError('Choca con otra cita o con un bloqueo de tu agenda.', 409, 'choque');
}

async function exigirGoogleReal(userId: string) {
  // Con Google real activo (fuera de la demo), pedir cita exige haber entrado con Google.
  if (googleClientId() && !DEMO_MODE) {
    const u = await qOne<{ google_sub: string | null }>('SELECT google_sub FROM users WHERE id = $1', [userId]);
    if (!u?.google_sub) throw new AppError('Para pedir una cita entra con tu cuenta de Google', 403);
  }
}

const COLUMNAS = `
  a.id, a.provider_id, a.client_id, a.service_id, a.starts_at, a.ends_at, a.duration_min, a.note, a.status,
  a.origin, a.cancelled_by, a.rescheduled_from, a.created_at,
  COALESCE(pp.business_name, pu.full_name) AS provider_name, pu.avatar_url AS provider_avatar,
  COALESCE(cu.full_name, a.client_name) AS client_name, cu.avatar_url AS client_avatar, s.title AS service_title
`;
const JOINS = `
  FROM appointments a
  JOIN provider_profiles pp ON a.provider_id = pp.id
  JOIN users pu ON pp.user_id = pu.id
  LEFT JOIN users cu ON a.client_id = cu.id
  LEFT JOIN services s ON a.service_id = s.id
`;
// Solo para el profesional: teléfono del cliente y cuántas veces no vino a SUS citas.
// ::int porque count(*) llega como bigint (cadena) y esto sale directo en el JSON de respuesta.
const COLUMNAS_PROFESIONAL = `
  , COALESCE(cu.phone, a.client_phone) AS client_phone,
  (SELECT COUNT(*) FROM appointments x WHERE x.provider_id = a.provider_id AND x.status = 'no_show'
    AND (x.client_id = a.client_id OR (a.client_id IS NULL AND x.client_id IS NULL AND x.client_phone = a.client_phone)))::int AS no_shows
`;
// Solo para el cliente: el WhatsApp del profesional, para cuando ya no puede cancelar desde aquí.
const COLUMNAS_CLIENTE = ', pp.whatsapp AS provider_whatsapp, pp.agenda AS _agenda';

type FilaCliente = Record<string, unknown> & { starts_at: string; status: string; _agenda?: unknown };

function paraCliente(row: FilaCliente) {
  const { _agenda, ...cita } = row;
  const horas = leerAgenda(_agenda ?? null).cancelacion_horas;
  const limite = Date.parse(row.starts_at) - horas * 3_600_000;
  const activa = row.status === 'pending' || row.status === 'confirmed';
  return { ...cita, cancel_until: iso(limite), can_change: activa && Date.now() <= limite };
}

async function citaPara(req: AuthRequest, id: string) {
  if (req.user!.user_type === 'client') {
    const row = await qOne<FilaCliente>(`SELECT ${COLUMNAS} ${COLUMNAS_CLIENTE} ${JOINS} WHERE a.id = $1`, [id]);
    return paraCliente(row!);
  }
  return qOne(`SELECT ${COLUMNAS} ${COLUMNAS_PROFESIONAL} ${JOINS} WHERE a.id = $1`, [id]);
}

// ── Público ─────────────────────────────────────────────────────────────────────────────────────

router.get('/provider/:providerId/slots', asyncHandler(async (req, res) => {
  const { id, agenda } = await perfilConAgenda(req.params.providerId);
  const serviceId = typeof req.query.service_id === 'string' && req.query.service_id ? req.query.service_id : undefined;
  const servicio = await servicioDe(id, serviceId, agenda);
  const servicios = await q<{ duration_min: number | null }>(`SELECT id, title, duration_min, price_min, price_max, price_type, price_currency
    FROM services WHERE provider_id = $1 AND is_active = true ORDER BY created_at, id`, [id]);
  res.json({
    zona: ZONA,
    duracion: servicio.duracion,
    confirmacion: agenda.confirmacion,
    cancelacion_horas: agenda.cancelacion_horas,
    horizonte_dias: agenda.horizonte_dias,
    servicios: servicios.map((s) => ({ ...s, duration_min: s.duration_min ?? agenda.duracion })),
    days: await huecos(POOL, id, agenda, servicio.duracion),
  });
}));

// ── Profesional: configuración, calendario, bloqueos y citas manuales ──────────────────────────

router.get('/config', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { agenda, enabled } = await miPerfil(req);
  res.json({ agenda, enabled, zona: ZONA });
}));

router.put('/config', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id, enabled } = await miPerfil(req);
  exigirPro(enabled);
  const agenda = agendaDesdeJson(req.body);
  await q('UPDATE provider_profiles SET agenda = $1, updated_at = now() WHERE id = $2', [JSON.stringify(agenda), id]);
  res.json({ agenda });
}));

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');

// Todo lo que pinta el calendario entre dos fechas (incluidas): horario de cada día ya resuelto
// con sus excepciones, citas y bloqueos.
router.get('/calendar', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { desde, hasta } = z.object({ desde: fechaSchema, hasta: fechaSchema }).parse(req.query);
  if (hasta < desde || hasta > sumarDias(desde, 62)) throw new AppError('Rango de fechas no válido', 400);
  const { id, agenda, enabled } = await miPerfil(req);

  const dias: { date: string; tramos: { inicio: string; fin: string }[]; excepcion: boolean }[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    dias.push({
      date: d,
      excepcion: agenda.excepciones.some((e) => e.fecha === d),
      tramos: tramosDelDia(agenda, d).map((t) => { const x = tramoEnInstantes(d, t); return { inicio: iso(x.inicio), fin: iso(x.fin) }; }),
    });
  }
  // Un día de Cuba nunca dura más de 25 h: el margen cubre los dos extremos.
  const inicio = iso(Date.parse(`${desde}T00:00:00Z`) - DIA_MS);
  const fin = iso(Date.parse(`${hasta}T00:00:00Z`) + 2 * DIA_MS);
  const appointments = (await q<{ starts_at: string }>(`SELECT ${COLUMNAS} ${COLUMNAS_PROFESIONAL} ${JOINS}
    WHERE a.provider_id = $1 AND a.ends_at > $2 AND a.starts_at < $3 ORDER BY a.starts_at`, [id, inicio, fin]))
    .filter((a) => { const f = fechaLocal(Date.parse(a.starts_at)); return f >= desde && f <= hasta; });
  const blocks = await q('SELECT id, starts_at, ends_at, note FROM agenda_blocks WHERE provider_id = $1 AND ends_at > $2 AND starts_at < $3 ORDER BY starts_at',
    [id, inicio, fin]);
  res.json({ zona: ZONA, enabled, agenda, dias, appointments, blocks });
}));

const rangoSchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  note: z.string().trim().max(200).optional(),
}).refine((b) => Date.parse(b.ends_at) > Date.parse(b.starts_at), { message: 'El fin debe ser posterior al inicio', path: ['ends_at'] })
  .refine((b) => Date.parse(b.ends_at) - Date.parse(b.starts_at) <= 62 * DIA_MS, { message: 'Un bloqueo puede durar como mucho 62 días', path: ['ends_at'] });

router.post('/blocks', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId, enabled } = await miPerfil(req);
  exigirPro(enabled);
  const data = rangoSchema.parse(req.body);
  const conteo = await qOne<{ n: string }>('SELECT count(*) AS n FROM agenda_blocks WHERE provider_id = $1 AND ends_at > $2', [providerId, iso(Date.now())]);
  if (Number(conteo?.n ?? 0) >= 300) throw new AppError('Tienes demasiados bloqueos pendientes. Borra alguno.', 400);
  const id = uuidv4();
  await q('INSERT INTO agenda_blocks (id, provider_id, starts_at, ends_at, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, providerId, iso(Date.parse(data.starts_at)), iso(Date.parse(data.ends_at)), data.note || null, iso(Date.now())]);
  res.status(201).json({ block: await qOne('SELECT id, starts_at, ends_at, note FROM agenda_blocks WHERE id = $1', [id]) });
}));

router.delete('/blocks/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId } = await miPerfil(req);
  // RETURNING en vez de un DELETE + comprobar changes: una sola consulta dice si borró algo.
  const borrado = await qOne<{ id: string }>('DELETE FROM agenda_blocks WHERE id = $1 AND provider_id = $2 RETURNING id', [req.params.id, providerId]);
  if (!borrado) throw new AppError('Bloqueo no encontrado', 404);
  res.json({ ok: true });
}));

// Cita que apunta el profesional (un cliente que llamó o que pasó por el local): no exige cuenta
// ni respeta las reglas de reserva online, pero avisa si choca.
router.post('/manual', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId, agenda, enabled } = await miPerfil(req);
  exigirPro(enabled);
  const data = z.object({
    starts_at: z.string().datetime(),
    duration_min: z.number().int().min(5).max(24 * 60),
    service_id: z.string().uuid().optional(),
    client_name: z.string().trim().min(2, 'Escribe el nombre del cliente').max(100),
    client_phone: z.string().trim().max(30).optional(),
    note: z.string().trim().max(500).optional(),
    forzar: z.boolean().optional(),
  }).parse(req.body);
  const servicio = await servicioDe(providerId, data.service_id, agenda);
  const inicio = Date.parse(data.starts_at);
  const cita = { inicio, fin: inicio + data.duration_min * 60_000 };

  const id = uuidv4();
  const forzada = Boolean(data.forzar);
  try {
    await tx(async (c) => {
      await assertSinChoque(c, providerId, cita, forzada);
      // forzada = true saca la fila del índice de la EXCLUDE (esquema.sql): "forzar" es una
      // función del producto (apuntar una cita a sabiendas de que se solapa), no un descuido.
      await c.q(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, client_name, client_phone, origin, status, forzada, created_at)
        VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, 'manual', 'confirmed', $10, $11)`,
        [id, providerId, servicio.id, iso(cita.inicio), iso(cita.fin), data.duration_min, data.note || null,
          data.client_name, data.client_phone || null, forzada, iso(Date.now())]);
    });
  } catch (e) {
    // Con forzada = true la EXCLUDE ya no mira esta fila, así que un 23P01 aquí solo puede
    // venir de una carrera real (otra cita, no forzada, que se coló entre la revalidación de
    // arriba y este INSERT) — no de "forzar" siendo pisado por la restricción.
    if ((e as { code?: string }).code === '23P01') {
      throw new AppError('Esa hora choca con otra cita activa de tu agenda.', 409, 'choque');
    }
    throw e;
  }
  res.status(201).json({ appointment: await citaPara(req, id) });
}));

// ── Citas de cada usuario ───────────────────────────────────────────────────────────────────────

router.get('/mine', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.user_type === 'client') {
    const rows = await q<FilaCliente>(`SELECT ${COLUMNAS} ${COLUMNAS_CLIENTE} ${JOINS} WHERE a.client_id = $1 ORDER BY a.starts_at DESC LIMIT 200`,
      [req.user!.id]);
    res.json({ appointments: rows.map(paraCliente) });
    return;
  }
  const rows = await q(`SELECT ${COLUMNAS} ${COLUMNAS_PROFESIONAL} ${JOINS} WHERE a.provider_id = $1 ORDER BY a.starts_at DESC LIMIT 200`,
    [await providerProfileIdFor(req.user!.id)]);
  res.json({ appointments: rows });
}));

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({
    provider_id: z.string().uuid(),
    service_id: z.string().uuid().optional(),
    starts_at: z.string().datetime(),
    note: z.string().trim().max(500).optional(),
  }).parse(req.body);
  await exigirGoogleReal(req.user!.id);

  const { id: providerId, agenda } = await perfilConAgenda(data.provider_id);
  const servicio = await servicioDe(providerId, data.service_id, agenda);
  const inicio = Date.parse(data.starts_at);
  const status = agenda.confirmacion === 'auto' ? 'confirmed' : 'pending';

  const id = uuidv4();
  try {
    await tx(async (c) => {
      await assertHuecoLibre(c, providerId, agenda, servicio.duracion, iso(inicio));
      const conteo = await c.qOne<{ n: string }>(
        "SELECT count(*) AS n FROM appointments WHERE client_id = $1 AND provider_id = $2 AND status IN ('pending', 'confirmed') AND starts_at > $3",
        [req.user!.id, providerId, iso(Date.now())],
      );
      if (Number(conteo?.n ?? 0) >= 3) throw new AppError('Ya tienes 3 citas próximas con este profesional', 400);
      await c.q(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, origin, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'online', $9, $10)`,
        [id, providerId, req.user!.id, servicio.id, iso(inicio), iso(inicio + servicio.duracion * 60_000), servicio.duracion,
          data.note || null, status, iso(Date.now())]);
    });
  } catch (e) {
    // La restricción EXCLUDE del esquema es la que garantiza de verdad que no
    // haya dos citas solapadas. La revalidación de arriba cubre el caso normal;
    // esto cubre la carrera que ella no puede ver.
    if ((e as { code?: string }).code === '23P01') {
      throw new AppError('Esa hora acaba de ocuparse', 409, 'choque');
    }
    throw e;
  }

  await avisarCita({ id, provider_id: providerId, client_id: req.user!.id, starts_at: iso(inicio), status }, 'nueva', 'client');
  res.status(201).json({ appointment: await citaPara(req, id) });
}));

interface CitaDb {
  id: string; provider_id: string; client_id: string | null; service_id: string | null; starts_at: string; ends_at: string;
  duration_min: number; note: string | null; client_name: string | null; client_phone: string | null; origin: string; status: string;
}

async function citaPropia(req: AuthRequest) {
  const esCliente = req.user!.user_type === 'client';
  const cita = await qOne<CitaDb>(
    `SELECT * FROM appointments WHERE id = $1 AND ${esCliente ? 'client_id' : 'provider_id'} = $2`,
    [req.params.id, esCliente ? req.user!.id : await providerProfileIdFor(req.user!.id)],
  );
  if (!cita) throw new AppError('Cita no encontrada', 404);
  return { cita, esCliente };
}

/** El cliente solo cambia o cancela dentro del plazo que fijó el profesional. */
async function assertPlazoCliente(cita: CitaDb) {
  if (cita.status !== 'pending' && cita.status !== 'confirmed') throw new AppError('Esa cita ya no se puede cambiar', 400);
  const { cancelacion_horas: horas } = await perfilSinPlan(POOL, cita.provider_id);
  if (Date.now() > Date.parse(cita.starts_at) - horas * 3_600_000) {
    throw new AppError(`Solo se puede cambiar o cancelar hasta ${horas} h antes. Escríbele al profesional.`, 403);
  }
}

async function perfilSinPlan(c: Tx, providerId: string) {
  const row = await c.qOne<{ agenda: unknown }>('SELECT agenda FROM provider_profiles WHERE id = $1', [providerId]);
  return leerAgenda(row?.agenda ?? null);
}

// Profesional: confirmar, cancelar, marcar hecha o "no vino". Cliente: solo cancelar, dentro de plazo.
router.patch('/:id', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { status } = z.object({ status: z.enum(['confirmed', 'cancelled', 'done', 'no_show']) }).parse(req.body);
  const { cita, esCliente } = await citaPropia(req);

  if (esCliente) {
    if (status !== 'cancelled') throw new AppError('Solo puedes cancelar tu cita', 403);
    await assertPlazoCliente(cita);
  } else {
    const permitidos: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled', 'no_show'],
      confirmed: ['cancelled', 'done', 'no_show'],
      // Corregir un error al marcarla.
      done: ['no_show'],
      no_show: ['done'],
    };
    if (!permitidos[cita.status]?.includes(status)) throw new AppError('Esa cita ya no se puede cambiar', 400);
    if ((status === 'done' || status === 'no_show') && Date.now() < Date.parse(cita.starts_at)) {
      throw new AppError('Eso solo se puede marcar cuando ya ha llegado la hora de la cita', 400);
    }
  }

  await q('UPDATE appointments SET status = $1, cancelled_by = $2, updated_at = $3 WHERE id = $4',
    [status, status === 'cancelled' ? (esCliente ? 'client' : 'provider') : null, iso(Date.now()), cita.id]);
  if (status === 'confirmed' || status === 'cancelled') {
    await avisarCita(cita, status === 'confirmed' ? 'confirmada' : 'cancelada', esCliente ? 'client' : 'provider');
  }
  res.json({ appointment: await citaPara(req, cita.id) });
}));

// Reprogramar = cancelar la cita y crear otra enlazada (rescheduled_from), en una sola transacción.
// El cliente elige entre los huecos libres; el profesional puede poner cualquier hora (avisando de choques).
router.post('/:id/reschedule', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({ starts_at: z.string().datetime(), forzar: z.boolean().optional() }).parse(req.body);
  const { cita, esCliente } = await citaPropia(req);
  const inicio = Date.parse(data.starts_at);
  const nueva = { inicio, fin: inicio + cita.duration_min * 60_000 };
  let status = 'confirmed';

  if (esCliente) {
    await assertPlazoCliente(cita);
    const { agenda } = await perfilConAgenda(cita.provider_id);
    if (agenda.confirmacion === 'manual') status = 'pending';
  } else {
    if (cita.status !== 'pending' && cita.status !== 'confirmed') throw new AppError('Esa cita ya no se puede cambiar', 400);
    exigirPro((await planDelPerfil(cita.provider_id)).agenda);
  }

  const id = uuidv4();
  // Solo el profesional puede forzar (assertSinChoque es la única que acepta el flag); si el
  // cliente lo manda igual, se ignora, igual que ya ignoraba `forzar` assertHuecoLibre.
  const forzada = !esCliente && Boolean(data.forzar);
  try {
    await tx(async (c) => {
      if (esCliente) await assertHuecoLibre(c, cita.provider_id, await perfilSinPlan(c, cita.provider_id), cita.duration_min, iso(inicio), cita.id);
      else await assertSinChoque(c, cita.provider_id, nueva, forzada, cita.id);
      const ahora = iso(Date.now());
      await c.q("UPDATE appointments SET status = 'cancelled', cancelled_by = $1, updated_at = $2 WHERE id = $3",
        [esCliente ? 'client' : 'provider', ahora, cita.id]);
      // forzada = true saca la fila del índice de la EXCLUDE (esquema.sql): igual que en la
      // cita manual, "forzar" es una función del producto, no un descuido a corregir.
      await c.q(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, client_name, client_phone, origin, status, rescheduled_from, forzada, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [id, cita.provider_id, cita.client_id, cita.service_id, iso(nueva.inicio), iso(nueva.fin), cita.duration_min, cita.note,
          cita.client_name, cita.client_phone, cita.origin, status, cita.id, forzada, ahora]);
    });
  } catch (e) {
    // Con forzada = true la EXCLUDE ya no mira esta fila: un 23P01 aquí solo puede venir de una
    // carrera real (otra cita, no forzada, colada entre la revalidación y este INSERT), no de
    // que "forzar" quede pisado por la restricción.
    if ((e as { code?: string }).code === '23P01') {
      throw new AppError('Esa hora choca con otra cita activa de tu agenda.', 409, 'choque');
    }
    throw e;
  }
  await avisarCita({ id, provider_id: cita.provider_id, client_id: cita.client_id, starts_at: iso(nueva.inicio), status }, 'movida', esCliente ? 'client' : 'provider');
  res.status(201).json({ appointment: await citaPara(req, id) });
}));

export default router;
