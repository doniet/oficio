import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { planDelPerfil, providerProfileIdFor } from '../db/index.js';
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

function perfilConAgenda(providerId: string) {
  const row = db.prepare('SELECT id, agenda FROM provider_profiles WHERE id = ? AND is_active = 1').get(providerId) as { id: string; agenda: string | null } | undefined;
  if (!row) throw new AppError('Profesional no encontrado', 404);
  if (!planDelPerfil(row.id).agenda) throw new AppError('Este profesional no tiene agenda de citas', 404);
  return { id: row.id, agenda: leerAgenda(row.agenda) };
}

function miPerfil(req: AuthRequest) {
  const id = providerProfileIdFor(req.user!.id);
  if (!id) throw new AppError('Perfil de proveedor no encontrado', 404);
  const row = db.prepare('SELECT agenda FROM provider_profiles WHERE id = ?').get(id) as { agenda: string | null };
  return { id, agenda: leerAgenda(row.agenda), enabled: planDelPerfil(id).agenda };
}

function exigirPro(enabled: boolean) {
  if (!enabled) throw new AppError('La agenda de citas es del plan Profesional', 403);
}

function ocupacion(providerId: string, desde: number, hasta: number, excluir?: string) {
  const citas = (db.prepare(`
    SELECT starts_at, ends_at FROM appointments
    WHERE provider_id = ? AND status IN ${OCUPAN} AND ends_at > ? AND starts_at < ? AND id != ?
  `).all(providerId, iso(desde), iso(hasta), excluir ?? '') as { starts_at: string; ends_at: string }[])
    .map((r) => ({ inicio: Date.parse(r.starts_at), fin: Date.parse(r.ends_at) }));
  const bloqueos = (db.prepare('SELECT starts_at, ends_at FROM agenda_blocks WHERE provider_id = ? AND ends_at > ? AND starts_at < ?')
    .all(providerId, iso(desde), iso(hasta)) as { starts_at: string; ends_at: string }[])
    .map((r) => ({ inicio: Date.parse(r.starts_at), fin: Date.parse(r.ends_at) }));
  return { citas, bloqueos };
}

function huecos(providerId: string, agenda: AgendaConfig, duracion: number, opciones: { soloDia?: string; excluir?: string } = {}) {
  const ahora = Date.now();
  const { citas, bloqueos } = ocupacion(providerId, ahora - DIA_MS, ahora + (agenda.horizonte_dias + 2) * DIA_MS, opciones.excluir);
  return calcularHuecos({ agenda, duracion, citas, bloqueos, ahora, soloDia: opciones.soloDia });
}

function servicioDe(providerId: string, serviceId: string | undefined, agenda: AgendaConfig) {
  if (!serviceId) return { id: null, duracion: agenda.duracion };
  const s = db.prepare('SELECT id, duration_min FROM services WHERE id = ? AND provider_id = ? AND is_active = 1').get(serviceId, providerId) as { id: string; duration_min: number | null } | undefined;
  if (!s) throw new AppError('Servicio no encontrado', 404);
  return { id: s.id, duracion: s.duration_min ?? agenda.duracion };
}

/** Un hueco solo es reservable si lo da el cálculo de huecos de ese día (reglas incluidas). */
function assertHuecoLibre(providerId: string, agenda: AgendaConfig, duracion: number, startsAt: string, excluir?: string) {
  const libres = huecos(providerId, agenda, duracion, { soloDia: fechaLocal(Date.parse(startsAt)), excluir });
  if (!libres.some((d) => d.slots.includes(startsAt))) throw new AppError('Ese horario ya no está disponible. Elige otro.', 409);
}

/** Para las citas que pone el profesional: avisa del choque salvo que lo fuerce. */
function assertSinChoque(providerId: string, cita: Intervalo, forzar: boolean, excluir?: string) {
  if (forzar) return;
  const { citas, bloqueos } = ocupacion(providerId, cita.inicio, cita.fin, excluir);
  const choques = [...citas, ...bloqueos].filter((o) => seSolapan(cita, o)).length;
  if (choques) throw new AppError('Choca con otra cita o con un bloqueo de tu agenda.', 409, 'choque');
}

function exigirGoogleReal(userId: string) {
  // Con Google real activo (fuera de la demo), pedir cita exige haber entrado con Google.
  if (googleClientId() && !DEMO_MODE) {
    const u = db.prepare('SELECT google_sub FROM users WHERE id = ?').get(userId) as { google_sub: string | null };
    if (!u.google_sub) throw new AppError('Para pedir una cita entra con tu cuenta de Google', 403);
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
const COLUMNAS_PROFESIONAL = `
  , COALESCE(cu.phone, a.client_phone) AS client_phone,
  (SELECT COUNT(*) FROM appointments x WHERE x.provider_id = a.provider_id AND x.status = 'no_show'
    AND (x.client_id = a.client_id OR (a.client_id IS NULL AND x.client_id IS NULL AND x.client_phone = a.client_phone))) AS no_shows
`;
// Solo para el cliente: el WhatsApp del profesional, para cuando ya no puede cancelar desde aquí.
const COLUMNAS_CLIENTE = ', pp.whatsapp AS provider_whatsapp, pp.agenda AS _agenda';

type FilaCliente = Record<string, unknown> & { starts_at: string; status: string; _agenda?: string | null };

function paraCliente(row: FilaCliente) {
  const { _agenda, ...cita } = row;
  const horas = leerAgenda(_agenda ?? null).cancelacion_horas;
  const limite = Date.parse(row.starts_at) - horas * 3_600_000;
  const activa = row.status === 'pending' || row.status === 'confirmed';
  return { ...cita, cancel_until: iso(limite), can_change: activa && Date.now() <= limite };
}

function citaPara(req: AuthRequest, id: string) {
  if (req.user!.user_type === 'client') {
    return paraCliente(db.prepare(`SELECT ${COLUMNAS} ${COLUMNAS_CLIENTE} ${JOINS} WHERE a.id = ?`).get(id) as FilaCliente);
  }
  return db.prepare(`SELECT ${COLUMNAS} ${COLUMNAS_PROFESIONAL} ${JOINS} WHERE a.id = ?`).get(id);
}

// ── Público ─────────────────────────────────────────────────────────────────────────────────────

router.get('/provider/:providerId/slots', asyncHandler(async (req, res) => {
  const { id, agenda } = perfilConAgenda(req.params.providerId);
  const serviceId = typeof req.query.service_id === 'string' && req.query.service_id ? req.query.service_id : undefined;
  const servicio = servicioDe(id, serviceId, agenda);
  const servicios = db.prepare(`SELECT id, title, duration_min, price_min, price_max, price_type, price_currency
    FROM services WHERE provider_id = ? AND is_active = 1 ORDER BY created_at, id`).all(id) as { duration_min: number | null }[];
  res.json({
    zona: ZONA,
    duracion: servicio.duracion,
    confirmacion: agenda.confirmacion,
    cancelacion_horas: agenda.cancelacion_horas,
    horizonte_dias: agenda.horizonte_dias,
    servicios: servicios.map((s) => ({ ...s, duration_min: s.duration_min ?? agenda.duracion })),
    days: huecos(id, agenda, servicio.duracion),
  });
}));

// ── Profesional: configuración, calendario, bloqueos y citas manuales ──────────────────────────

router.get('/config', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { agenda, enabled } = miPerfil(req);
  res.json({ agenda, enabled, zona: ZONA });
}));

router.put('/config', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id, enabled } = miPerfil(req);
  exigirPro(enabled);
  const agenda = agendaDesdeJson(req.body);
  db.prepare('UPDATE provider_profiles SET agenda = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(agenda), id);
  res.json({ agenda });
}));

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');

// Todo lo que pinta el calendario entre dos fechas (incluidas): horario de cada día ya resuelto
// con sus excepciones, citas y bloqueos.
router.get('/calendar', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { desde, hasta } = z.object({ desde: fechaSchema, hasta: fechaSchema }).parse(req.query);
  if (hasta < desde || hasta > sumarDias(desde, 62)) throw new AppError('Rango de fechas no válido', 400);
  const { id, agenda, enabled } = miPerfil(req);

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
  const appointments = (db.prepare(`SELECT ${COLUMNAS} ${COLUMNAS_PROFESIONAL} ${JOINS}
    WHERE a.provider_id = ? AND a.ends_at > ? AND a.starts_at < ? ORDER BY a.starts_at`).all(id, inicio, fin) as { starts_at: string }[])
    .filter((a) => { const f = fechaLocal(Date.parse(a.starts_at)); return f >= desde && f <= hasta; });
  const blocks = db.prepare('SELECT id, starts_at, ends_at, note FROM agenda_blocks WHERE provider_id = ? AND ends_at > ? AND starts_at < ? ORDER BY starts_at')
    .all(id, inicio, fin);
  res.json({ zona: ZONA, enabled, agenda, dias, appointments, blocks });
}));

const rangoSchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  note: z.string().trim().max(200).optional(),
}).refine((b) => Date.parse(b.ends_at) > Date.parse(b.starts_at), { message: 'El fin debe ser posterior al inicio', path: ['ends_at'] })
  .refine((b) => Date.parse(b.ends_at) - Date.parse(b.starts_at) <= 62 * DIA_MS, { message: 'Un bloqueo puede durar como mucho 62 días', path: ['ends_at'] });

router.post('/blocks', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId, enabled } = miPerfil(req);
  exigirPro(enabled);
  const data = rangoSchema.parse(req.body);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM agenda_blocks WHERE provider_id = ? AND ends_at > ?').get(providerId, iso(Date.now())) as { n: number };
  if (n >= 300) throw new AppError('Tienes demasiados bloqueos pendientes. Borra alguno.', 400);
  const id = uuidv4();
  db.prepare('INSERT INTO agenda_blocks (id, provider_id, starts_at, ends_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, providerId, iso(Date.parse(data.starts_at)), iso(Date.parse(data.ends_at)), data.note || null, iso(Date.now()));
  res.status(201).json({ block: db.prepare('SELECT id, starts_at, ends_at, note FROM agenda_blocks WHERE id = ?').get(id) });
}));

router.delete('/blocks/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId } = miPerfil(req);
  const r = db.prepare('DELETE FROM agenda_blocks WHERE id = ? AND provider_id = ?').run(req.params.id, providerId);
  if (!r.changes) throw new AppError('Bloqueo no encontrado', 404);
  res.json({ ok: true });
}));

// Cita que apunta el profesional (un cliente que llamó o que pasó por el local): no exige cuenta
// ni respeta las reglas de reserva online, pero avisa si choca.
router.post('/manual', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const { id: providerId, agenda, enabled } = miPerfil(req);
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
  const servicio = servicioDe(providerId, data.service_id, agenda);
  const inicio = Date.parse(data.starts_at);
  const cita = { inicio, fin: inicio + data.duration_min * 60_000 };

  const id = uuidv4();
  db.transaction(() => {
    assertSinChoque(providerId, cita, Boolean(data.forzar));
    db.prepare(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, client_name, client_phone, origin, status, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'manual', 'confirmed', ?)`)
      .run(id, providerId, servicio.id, iso(cita.inicio), iso(cita.fin), data.duration_min, data.note || null,
        data.client_name, data.client_phone || null, iso(Date.now()));
  })();
  res.status(201).json({ appointment: citaPara(req, id) });
}));

// ── Citas de cada usuario ───────────────────────────────────────────────────────────────────────

router.get('/mine', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.user_type === 'client') {
    const rows = db.prepare(`SELECT ${COLUMNAS} ${COLUMNAS_CLIENTE} ${JOINS} WHERE a.client_id = ? ORDER BY a.starts_at DESC LIMIT 200`)
      .all(req.user!.id) as FilaCliente[];
    res.json({ appointments: rows.map(paraCliente) });
    return;
  }
  const rows = db.prepare(`SELECT ${COLUMNAS} ${COLUMNAS_PROFESIONAL} ${JOINS} WHERE a.provider_id = ? ORDER BY a.starts_at DESC LIMIT 200`)
    .all(providerProfileIdFor(req.user!.id));
  res.json({ appointments: rows });
}));

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({
    provider_id: z.string().uuid(),
    service_id: z.string().uuid().optional(),
    starts_at: z.string().datetime(),
    note: z.string().trim().max(500).optional(),
  }).parse(req.body);
  exigirGoogleReal(req.user!.id);

  const { id: providerId, agenda } = perfilConAgenda(data.provider_id);
  const servicio = servicioDe(providerId, data.service_id, agenda);
  const inicio = Date.parse(data.starts_at);
  const status = agenda.confirmacion === 'auto' ? 'confirmed' : 'pending';

  const id = uuidv4();
  // better-sqlite3 es síncrono: comprobar y guardar dentro de la misma transacción impide que dos
  // peticiones simultáneas se queden con el mismo hueco.
  db.transaction(() => {
    assertHuecoLibre(providerId, agenda, servicio.duracion, iso(inicio));
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE client_id = ? AND provider_id = ? AND status IN ('pending', 'confirmed') AND starts_at > ?")
      .get(req.user!.id, providerId, iso(Date.now())) as { n: number };
    if (n >= 3) throw new AppError('Ya tienes 3 citas próximas con este profesional', 400);
    db.prepare(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, origin, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?)`)
      .run(id, providerId, req.user!.id, servicio.id, iso(inicio), iso(inicio + servicio.duracion * 60_000), servicio.duracion,
        data.note || null, status, iso(Date.now()));
  })();

  avisarCita({ id, provider_id: providerId, client_id: req.user!.id, starts_at: iso(inicio), status }, 'nueva', 'client');
  res.status(201).json({ appointment: citaPara(req, id) });
}));

interface CitaDb {
  id: string; provider_id: string; client_id: string | null; service_id: string | null; starts_at: string; ends_at: string;
  duration_min: number; note: string | null; client_name: string | null; client_phone: string | null; origin: string; status: string;
}

function citaPropia(req: AuthRequest) {
  const esCliente = req.user!.user_type === 'client';
  const cita = db.prepare(`SELECT * FROM appointments WHERE id = ? AND ${esCliente ? 'client_id' : 'provider_id'} = ?`)
    .get(req.params.id, esCliente ? req.user!.id : providerProfileIdFor(req.user!.id)) as CitaDb | undefined;
  if (!cita) throw new AppError('Cita no encontrada', 404);
  return { cita, esCliente };
}

/** El cliente solo cambia o cancela dentro del plazo que fijó el profesional. */
function assertPlazoCliente(cita: CitaDb) {
  if (cita.status !== 'pending' && cita.status !== 'confirmed') throw new AppError('Esa cita ya no se puede cambiar', 400);
  const { cancelacion_horas: horas } = perfilSinPlan(cita.provider_id);
  if (Date.now() > Date.parse(cita.starts_at) - horas * 3_600_000) {
    throw new AppError(`Solo se puede cambiar o cancelar hasta ${horas} h antes. Escríbele al profesional.`, 403);
  }
}

function perfilSinPlan(providerId: string) {
  const row = db.prepare('SELECT agenda FROM provider_profiles WHERE id = ?').get(providerId) as { agenda: string | null };
  return leerAgenda(row.agenda);
}

// Profesional: confirmar, cancelar, marcar hecha o "no vino". Cliente: solo cancelar, dentro de plazo.
router.patch('/:id', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { status } = z.object({ status: z.enum(['confirmed', 'cancelled', 'done', 'no_show']) }).parse(req.body);
  const { cita, esCliente } = citaPropia(req);

  if (esCliente) {
    if (status !== 'cancelled') throw new AppError('Solo puedes cancelar tu cita', 403);
    assertPlazoCliente(cita);
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

  db.prepare('UPDATE appointments SET status = ?, cancelled_by = ?, updated_at = ? WHERE id = ?')
    .run(status, status === 'cancelled' ? (esCliente ? 'client' : 'provider') : null, iso(Date.now()), cita.id);
  if (status === 'confirmed' || status === 'cancelled') {
    avisarCita(cita, status === 'confirmed' ? 'confirmada' : 'cancelada', esCliente ? 'client' : 'provider');
  }
  res.json({ appointment: citaPara(req, cita.id) });
}));

// Reprogramar = cancelar la cita y crear otra enlazada (rescheduled_from), en una sola transacción.
// El cliente elige entre los huecos libres; el profesional puede poner cualquier hora (avisando de choques).
router.post('/:id/reschedule', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({ starts_at: z.string().datetime(), forzar: z.boolean().optional() }).parse(req.body);
  const { cita, esCliente } = citaPropia(req);
  const inicio = Date.parse(data.starts_at);
  const nueva = { inicio, fin: inicio + cita.duration_min * 60_000 };
  let status = 'confirmed';

  if (esCliente) {
    assertPlazoCliente(cita);
    const { agenda } = perfilConAgenda(cita.provider_id);
    if (agenda.confirmacion === 'manual') status = 'pending';
  } else {
    if (cita.status !== 'pending' && cita.status !== 'confirmed') throw new AppError('Esa cita ya no se puede cambiar', 400);
    exigirPro(planDelPerfil(cita.provider_id).agenda);
  }

  const id = uuidv4();
  db.transaction(() => {
    if (esCliente) assertHuecoLibre(cita.provider_id, perfilSinPlan(cita.provider_id), cita.duration_min, iso(inicio), cita.id);
    else assertSinChoque(cita.provider_id, nueva, Boolean(data.forzar), cita.id);
    const ahora = iso(Date.now());
    db.prepare("UPDATE appointments SET status = 'cancelled', cancelled_by = ?, updated_at = ? WHERE id = ?")
      .run(esCliente ? 'client' : 'provider', ahora, cita.id);
    db.prepare(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, client_name, client_phone, origin, status, rescheduled_from, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, cita.provider_id, cita.client_id, cita.service_id, iso(nueva.inicio), iso(nueva.fin), cita.duration_min, cita.note,
        cita.client_name, cita.client_phone, cita.origin, status, cita.id, ahora);
  })();
  avisarCita({ id, provider_id: cita.provider_id, client_id: cita.client_id, starts_at: iso(nueva.inicio), status }, 'movida', esCliente ? 'client' : 'provider');
  res.status(201).json({ appointment: citaPara(req, id) });
}));

export default router;
