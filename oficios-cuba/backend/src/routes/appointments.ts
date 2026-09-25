import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { planDelPerfil, providerProfileIdFor } from '../db/index.js';
import { authMiddleware, AuthRequest, requireClient, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { DEMO_MODE, googleClientId } from '../config.js';

const router = Router();

// Agenda del plan Profesional. Las horas se calculan en la zona del proceso (TZ=America/Havana en
// producción): "09:00" es la hora de Cuba y starts_at se guarda en ISO UTC.
const agendaSchema = z.object({
  dias: z.array(z.number().int().min(0).max(6)).max(7), // 0 = domingo
  desde: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida'),
  hasta: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida'),
  duracion: z.number().int().refine((n) => [30, 45, 60, 90, 120].includes(n), 'Duración no válida'),
}).refine((a) => a.desde < a.hasta, { message: 'La hora de fin debe ser posterior a la de inicio', path: ['hasta'] });

type Agenda = z.infer<typeof agendaSchema>;

export const AGENDA_POR_DEFECTO: Agenda = { dias: [1, 2, 3, 4, 5, 6], desde: '09:00', hasta: '17:00', duracion: 60 };
const DIAS_VISIBLES = 14;
const ANTELACION_MS = 60 * 60 * 1000;

function agendaDe(raw: string | null): Agenda {
  if (!raw) return AGENDA_POR_DEFECTO;
  try {
    return agendaSchema.parse(JSON.parse(raw));
  } catch {
    return AGENDA_POR_DEFECTO;
  }
}

const aMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function proveedorConAgenda(providerId: string) {
  const row = db.prepare('SELECT id, agenda FROM provider_profiles WHERE id = ? AND is_active = 1').get(providerId) as { id: string; agenda: string | null } | undefined;
  if (!row) throw new AppError('Profesional no encontrado', 404);
  if (!planDelPerfil(row.id).agenda) throw new AppError('Este profesional no tiene agenda de citas', 404);
  return { id: row.id, agenda: agendaDe(row.agenda) };
}

function huecosLibres(providerId: string, agenda: Agenda, ahora = new Date()) {
  const ocupados = new Set((db.prepare(`
    SELECT starts_at FROM appointments WHERE provider_id = ? AND status IN ('pending', 'confirmed') AND starts_at >= ?
  `).all(providerId, ahora.toISOString()) as { starts_at: string }[]).map((r) => r.starts_at));

  const dias: { date: string; slots: string[] }[] = [];
  const inicio = aMinutos(agenda.desde);
  const fin = aMinutos(agenda.hasta);
  for (let i = 0; i < DIAS_VISIBLES; i++) {
    const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + i);
    if (!agenda.dias.includes(dia.getDay())) continue;
    const slots: string[] = [];
    for (let m = inicio; m + agenda.duracion <= fin; m += agenda.duracion) {
      const t = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), Math.floor(m / 60), m % 60);
      if (t.getTime() - ahora.getTime() < ANTELACION_MS) continue;
      const iso = t.toISOString();
      if (!ocupados.has(iso)) slots.push(iso);
    }
    if (slots.length) dias.push({ date: fechaLocal(dia), slots });
  }
  return dias;
}

router.get('/provider/:providerId/slots', asyncHandler(async (req, res) => {
  const { id, agenda } = proveedorConAgenda(req.params.providerId);
  res.json({ duracion: agenda.duracion, days: huecosLibres(id, agenda) });
}));

router.get('/config', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = providerProfileIdFor(req.user!.id)!;
  const row = db.prepare('SELECT agenda FROM provider_profiles WHERE id = ?').get(providerId) as { agenda: string | null };
  res.json({ agenda: agendaDe(row.agenda), enabled: planDelPerfil(providerId).agenda });
}));

router.put('/config', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = providerProfileIdFor(req.user!.id)!;
  if (!planDelPerfil(providerId).agenda) throw new AppError('La agenda de citas es del plan Profesional', 403);
  const agenda = agendaSchema.parse(req.body);
  db.prepare('UPDATE provider_profiles SET agenda = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(agenda), providerId);
  res.json({ agenda });
}));

const COLUMNAS = `
  a.id, a.provider_id, a.client_id, a.service_id, a.starts_at, a.duration_min, a.note, a.status, a.created_at,
  COALESCE(pp.business_name, pu.full_name) AS provider_name, pu.avatar_url AS provider_avatar,
  cu.full_name AS client_name, cu.avatar_url AS client_avatar, s.title AS service_title
`;
const JOINS = `
  FROM appointments a
  JOIN provider_profiles pp ON a.provider_id = pp.id
  JOIN users pu ON pp.user_id = pu.id
  JOIN users cu ON a.client_id = cu.id
  LEFT JOIN services s ON a.service_id = s.id
`;

router.get('/mine', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const esCliente = req.user!.user_type === 'client';
  const valor = esCliente ? req.user!.id : providerProfileIdFor(req.user!.id);
  // El teléfono del cliente solo lo ve el profesional al que le pidió la cita.
  const rows = db.prepare(`
    SELECT ${COLUMNAS} ${esCliente ? '' : ', cu.phone AS client_phone'} ${JOINS}
    WHERE a.${esCliente ? 'client_id' : 'provider_id'} = ?
    ORDER BY a.starts_at DESC LIMIT 200
  `).all(valor);
  res.json({ appointments: rows });
}));

router.post('/', authMiddleware, requireClient, asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({
    provider_id: z.string().uuid(),
    service_id: z.string().uuid().optional(),
    starts_at: z.string().datetime(),
    note: z.string().trim().max(500).optional(),
  }).parse(req.body);

  // Con Google real activo (fuera de la demo), pedir cita exige haber entrado con Google.
  if (googleClientId() && !DEMO_MODE) {
    const u = db.prepare('SELECT google_sub FROM users WHERE id = ?').get(req.user!.id) as { google_sub: string | null };
    if (!u.google_sub) throw new AppError('Para pedir una cita entra con tu cuenta de Google', 403);
  }

  const { id: providerId, agenda } = proveedorConAgenda(data.provider_id);
  if (data.service_id && !db.prepare('SELECT 1 FROM services WHERE id = ? AND provider_id = ? AND is_active = 1').get(data.service_id, providerId)) {
    throw new AppError('Servicio no encontrado', 404);
  }
  const startsAt = new Date(data.starts_at).toISOString();

  const id = uuidv4();
  db.transaction(() => {
    if (!huecosLibres(providerId, agenda).some((d) => d.slots.includes(startsAt))) {
      throw new AppError('Ese horario ya no está disponible. Elige otro.', 409);
    }
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE client_id = ? AND provider_id = ? AND status = 'pending'")
      .get(req.user!.id, providerId) as { n: number };
    if (n >= 3) throw new AppError('Ya tienes 3 citas pendientes con este profesional', 400);
    db.prepare(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, duration_min, note, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .run(id, providerId, req.user!.id, data.service_id ?? null, startsAt, agenda.duracion, data.note || null, new Date().toISOString());
  })();

  res.status(201).json({ appointment: db.prepare(`SELECT ${COLUMNAS} ${JOINS} WHERE a.id = ?`).get(id) });
}));

// Profesional: confirmar, cancelar o marcar como hecha. Cliente: solo cancelar.
router.patch('/:id', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { status } = z.object({ status: z.enum(['confirmed', 'cancelled', 'done']) }).parse(req.body);
  const esCliente = req.user!.user_type === 'client';
  const cita = db.prepare(`SELECT id, status FROM appointments WHERE id = ? AND ${esCliente ? 'client_id' : 'provider_id'} = ?`)
    .get(req.params.id, esCliente ? req.user!.id : providerProfileIdFor(req.user!.id)) as { id: string; status: string } | undefined;
  if (!cita) throw new AppError('Cita no encontrada', 404);
  if (esCliente && status !== 'cancelled') throw new AppError('Solo puedes cancelar tu cita', 403);

  const permitidos: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['cancelled', 'done'] };
  if (!permitidos[cita.status]?.includes(status)) throw new AppError('Esa cita ya no se puede cambiar', 400);

  db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), cita.id);
  res.json({ appointment: db.prepare(`SELECT ${COLUMNAS} ${JOINS} WHERE a.id = ?`).get(cita.id) });
}));

export default router;
