import { randomUUID } from 'crypto';
import { q, qOne } from '../db/acceso.js';
import { ZONA } from './hora.js';
import { SITIO } from './telegram-comun.js';

// Avisos por Telegram. La API solo los apunta en `notifications`; los envía oficio_notifier.
// Si el usuario no tiene Telegram vinculado o apagó ese grupo, no se apunta nada.
//
// Estas funciones ahora son async (consultan Postgres): quien las llame desde un dominio todavía
// sin portar necesita añadir `await` aunque el typecheck (strict:false) no lo exija — el patrón ya
// causó un agujero real con enforcePlanLimit/imagenPermitida en otras tareas del porte.

export type Grupo = 'citas' | 'recordatorios' | 'chat' | 'resenas' | 'plan';

export const GRUPOS: { id: Grupo; label: string; description: string; para: ('client' | 'provider')[] }[] = [
  { id: 'citas', label: 'Citas', description: 'Citas nuevas, confirmadas, canceladas o cambiadas de hora.', para: ['client', 'provider'] },
  { id: 'recordatorios', label: 'Recordatorios', description: 'Clientes: 24 h y 2 h antes de la cita. Profesionales: tus citas de mañana, a las 8 de la noche.', para: ['client', 'provider'] },
  { id: 'chat', label: 'Mensajes del chat', description: 'Cuando te escriben (como mucho un aviso cada 10 minutos por conversación).', para: ['client', 'provider'] },
  { id: 'resenas', label: 'Reseñas', description: 'Cuando un cliente te deja una reseña.', para: ['provider'] },
  { id: 'plan', label: 'Tu plan', description: 'Tres días antes de que venza tu plan.', para: ['provider'] },
];


// notify_prefs es jsonb: llega ya parseado como objeto (o null), nunca como cadena — salvo algún
// seed viejo que todavía lo escriba como texto. Se aceptan las dos formas, como parseImages/
// parsePriceList en db/index.ts.
export function prefsDe(raw: unknown): Record<Grupo, boolean> {
  let apagados: Record<string, unknown> = {};
  if (raw && typeof raw === 'object') apagados = raw as Record<string, unknown>;
  else if (typeof raw === 'string') {
    try { apagados = JSON.parse(raw); } catch { /* preferencias rotas = todo encendido */ }
  }
  return Object.fromEntries(GRUPOS.map((g) => [g.id, apagados[g.id] !== false])) as Record<Grupo, boolean>;
}

interface Opciones {
  url?: string;
  /** Mismo dedupe_key = un solo aviso (recordatorios, vencimiento, ráfagas del chat). */
  dedupe?: string;
  sendAfter?: Date;
}

/** Apunta un aviso para un usuario. Devuelve true si quedó en la bandeja. */
export async function avisar(userId: string | null | undefined, grupo: Grupo, texto: string, opciones: Opciones = {}) {
  if (!userId) return false;
  const u = await qOne<{ telegram_chat_id: string | null; notify_prefs: string | null }>(
    'SELECT telegram_chat_id, notify_prefs FROM users WHERE id = $1', [userId],
  );
  if (!u?.telegram_chat_id || !prefsDe(u.notify_prefs)[grupo]) return false;
  const ahora = new Date().toISOString();
  const r = await q(`INSERT INTO notifications (id, user_id, kind, text, url, dedupe_key, send_after, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [randomUUID(), userId, grupo, texto.slice(0, 3500), opciones.url ? SITIO + opciones.url : null, opciones.dedupe ?? null,
      (opciones.sendAfter ?? new Date()).toISOString(), ahora]);
  return r.length > 0;
}

/** Nunca debe tumbar la petición que lo dispara: un aviso perdido es mejor que una cita sin guardar. */
export async function avisarSinFallar(...args: Parameters<typeof avisar>) {
  try { return await avisar(...args); } catch (err) {
    console.error('No se pudo apuntar el aviso:', (err as Error).message);
    return false;
  }
}

const fmtCita = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
/** "sábado, 26 de septiembre, 10:00 a. m." en hora de Cuba. */
export const cuando = (iso: string) => fmtCita.format(new Date(iso));

export async function usuarioDelPerfil(providerId: string) {
  return (await qOne<{ user_id: string }>('SELECT user_id FROM provider_profiles WHERE id = $1', [providerId]))?.user_id;
}

// ── Avisos de citas ─────────────────────────────────────────────────────────────────────────────

interface CitaAviso { id: string; provider_id: string; client_id: string | null; starts_at: string; status?: string }

async function datosCita(cita: CitaAviso) {
  const r = (await qOne<{ negocio: string; cliente: string; servicio: string | null }>(
    `SELECT COALESCE(pp.business_name, pu.full_name) AS negocio, COALESCE(cu.full_name, a.client_name) AS cliente, s.title AS servicio
    FROM appointments a JOIN provider_profiles pp ON a.provider_id = pp.id JOIN users pu ON pp.user_id = pu.id
    LEFT JOIN users cu ON a.client_id = cu.id LEFT JOIN services s ON a.service_id = s.id WHERE a.id = $1`, [cita.id],
  ))!;
  const servicio = r.servicio ? ` (${r.servicio})` : '';
  return { ...r, servicio, hora: cuando(cita.starts_at) };
}

export type EventoCita = 'nueva' | 'confirmada' | 'cancelada' | 'movida';

/** `por`: quién hizo el cambio. El aviso va a la otra parte. */
export async function avisarCita(cita: CitaAviso, evento: EventoCita, por: 'client' | 'provider') {
  try {
    const d = await datosCita(cita);
    if (por === 'client') {
      const textos: Record<EventoCita, string> = {
        nueva: cita.status === 'confirmed'
          ? `📅 Cita nueva: ${d.cliente}${d.servicio}, el ${d.hora}. Quedó confirmada.`
          : `📅 Cita nueva por confirmar: ${d.cliente}${d.servicio}, el ${d.hora}.`,
        confirmada: '',
        cancelada: `❌ ${d.cliente} canceló su cita del ${d.hora}.`,
        movida: `🔁 ${d.cliente} cambió su cita al ${d.hora}${cita.status === 'pending' ? '. Tienes que confirmarla.' : '.'}`,
      };
      if (textos[evento]) await avisar(await usuarioDelPerfil(cita.provider_id), 'citas', textos[evento], { url: '/dashboard/agenda' });
    } else {
      const textos: Record<EventoCita, string> = {
        nueva: '',
        confirmada: `✅ ${d.negocio} confirmó tu cita${d.servicio} del ${d.hora}.`,
        cancelada: `❌ ${d.negocio} canceló tu cita del ${d.hora}.`,
        movida: `🔁 ${d.negocio} movió tu cita al ${d.hora}.`,
      };
      if (textos[evento]) await avisar(cita.client_id, 'citas', textos[evento], { url: '/dashboard/citas' });
    }
  } catch (err) {
    console.error('No se pudo apuntar el aviso de la cita:', (err as Error).message);
  }
}

// ── Avisos programados (los apunta la API cada pocos minutos; dedupe = uno solo) ────────────────

export async function programarAvisos(ahora = Date.now()) {
  const iso = (t: number) => new Date(t).toISOString();
  const H = 3_600_000;

  // Recordatorios al cliente: 24 h antes y 2 h antes (solo citas confirmadas con cuenta).
  const ventanas: [string, number, number, string][] = [['24h', 20 * H, 24 * H, 'mañana'], ['2h', 1 * H, 2 * H, 'dentro de poco']];
  for (const [clave, desde, hasta, cuandoTexto] of ventanas) {
    const citas = await q<{ id: string; client_id: string; starts_at: string; negocio: string; address: string | null }>(
      `SELECT a.id, a.client_id, a.starts_at, COALESCE(pp.business_name, pu.full_name) AS negocio, pp.address
      FROM appointments a JOIN provider_profiles pp ON a.provider_id = pp.id JOIN users pu ON pp.user_id = pu.id
      WHERE a.status = 'confirmed' AND a.client_id IS NOT NULL AND a.starts_at > $1 AND a.starts_at <= $2`,
      [iso(ahora + desde), iso(ahora + hasta)],
    );
    for (const c of citas) {
      await avisar(c.client_id, 'recordatorios', `⏰ Recordatorio: tienes cita con ${c.negocio} ${cuandoTexto}, el ${cuando(c.starts_at)}.${c.address ? `\n📍 ${c.address}` : ''}`,
        { url: '/dashboard/citas', dedupe: `rec${clave}:${c.id}` });
    }
  }

  // Resumen para el profesional: a partir de las 20:00 de Cuba, sus citas de mañana.
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
    .formatToParts(new Date(ahora)).map((p) => [p.type, p.value]));
  if (Number(partes.hour) >= 20) {
    const hoy = `${partes.year}-${partes.month}-${partes.day}`;
    const filas = await q<{ provider_id: string; starts_at: string; cliente: string }>(
      `SELECT a.provider_id, a.starts_at, COALESCE(cu.full_name, a.client_name) AS cliente
      FROM appointments a LEFT JOIN users cu ON a.client_id = cu.id
      WHERE a.status IN ('pending', 'confirmed') AND a.starts_at > $1 AND a.starts_at < $2 ORDER BY a.starts_at`,
      [iso(ahora), iso(ahora + 30 * H)],
    );
    const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA });
    const manana = fmtDia.format(new Date(Date.parse(`${hoy}T12:00:00Z`) + 24 * H));
    const porPerfil = new Map<string, string[]>();
    for (const f of filas) {
      if (fmtDia.format(new Date(f.starts_at)) !== manana) continue;
      const hora = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(f.starts_at));
      porPerfil.set(f.provider_id, [...(porPerfil.get(f.provider_id) ?? []), `• ${hora} — ${f.cliente}`]);
    }
    for (const [perfil, lineas] of porPerfil) {
      await avisar(await usuarioDelPerfil(perfil), 'recordatorios', `🗓️ Mañana tienes ${lineas.length} ${lineas.length === 1 ? 'cita' : 'citas'}:\n${lineas.join('\n')}`,
        { url: '/dashboard/agenda', dedupe: `resumen:${perfil}:${manana}` });
    }
  }

  // El plan vence en 3 días o menos.
  const vencen = await q<{ id: string; user_id: string; subscription_expires_at: string }>(
    `SELECT id, user_id, subscription_expires_at FROM provider_profiles
    WHERE subscription_plan != 'free' AND subscription_expires_at > $1 AND subscription_expires_at <= $2`,
    [iso(ahora), iso(ahora + 72 * H)],
  );
  for (const p of vencen) {
    await avisar(p.user_id, 'plan', `💳 Tu plan vence el ${cuando(p.subscription_expires_at)}. Renuévalo para que tus fotos, tu catálogo y tu agenda sigan a la vista.`,
      { url: '/dashboard/suscripcion', dedupe: `vence:${p.id}:${p.subscription_expires_at}` });
  }
}

// ── Chat y reseñas ──────────────────────────────────────────────────────────────────────────────

/** Mensaje nuevo: aviso sin el texto (privacidad), agrupado en tramos de 10 min por conversación. */
export async function avisarChat(conversationId: string, remitente: 'client' | 'provider') {
  try {
    const c = await qOne<{ client_id: string; provider_user: string; cliente: string; negocio: string }>(
      `SELECT c.client_id, pp.user_id AS provider_user, cu.full_name AS cliente, COALESCE(pp.business_name, pu.full_name) AS negocio
      FROM conversations c JOIN provider_profiles pp ON c.provider_id = pp.id JOIN users pu ON pp.user_id = pu.id JOIN users cu ON c.client_id = cu.id
      WHERE c.id = $1`, [conversationId],
    );
    if (!c) return;
    const [destino, de] = remitente === 'client' ? [c.provider_user, c.cliente] : [c.client_id, c.negocio];
    const tramo = Math.floor(Date.now() / 600_000);
    await avisar(destino, 'chat', `💬 ${de} te escribió en Encuentrauno.`, { url: `/dashboard/mensajes/${conversationId}`, dedupe: `chat:${conversationId}:${destino}:${tramo}` });
  } catch (err) {
    console.error('No se pudo apuntar el aviso del chat:', (err as Error).message);
  }
}

export async function avisarResena(providerId: string, clienteId: string, estrellas: number) {
  try {
    const cliente = (await qOne<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [clienteId]))?.full_name ?? 'Un cliente';
    await avisar(await usuarioDelPerfil(providerId), 'resenas', `${'⭐'.repeat(estrellas)} ${cliente} te dejó una reseña de ${estrellas} ${estrellas === 1 ? 'estrella' : 'estrellas'}.`,
      { url: `/proveedor/${providerId}` });
  } catch (err) {
    console.error('No se pudo apuntar el aviso de la reseña:', (err as Error).message);
  }
}
