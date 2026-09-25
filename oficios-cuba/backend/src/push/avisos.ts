import db from '../db/index.js';
import { CanalPush, Notificacion } from './canal.js';
import { borrarToken, Canal, dispositivosDe } from './registro.js';

export type { CanalPush, Notificacion } from './canal.js';

const canales: Partial<Record<Canal, CanalPush>> = {};
const pendientes = new Set<Promise<void>>();

export function usarCanal(canal: Canal, impl: CanalPush | null) {
  if (impl) canales[canal] = impl; else delete canales[canal];
}

export async function avisarUsuario(userId: string, n: Notificacion) {
  for (const d of dispositivosDe(userId)) {
    const canal = canales[d.canal];
    if (!canal) continue;
    try {
      const r = await canal.enviar(d.token, n);
      if (r === 'token_invalido') borrarToken(d.canal, d.token);
      else if (r === 'error') console.warn(`push ${d.canal}: envío fallido a ${userId}`);
    } catch (err) {
      console.warn(`push ${d.canal}: ${(err as Error).message}`);
    }
  }
}

// Dispara y olvida: el push nunca retrasa ni rompe la respuesta del chat.
function enSegundoPlano(tarea: () => Promise<void>) {
  const p = tarea().catch((err) => console.warn('push:', (err as Error).message)).finally(() => pendientes.delete(p));
  pendientes.add(p);
}

export async function esperarAvisosPendientes() {
  while (pendientes.size) await Promise.allSettled([...pendientes]);
}

interface Participantes { client_id: string; provider_user_id: string; client_name: string; provider_name: string; service_title: string | null }

function participantes(conversationId: string) {
  // conversations.provider_id es el PERFIL: el usuario a avisar es provider_profiles.user_id.
  return db.prepare(`
    SELECT c.client_id, pp.user_id AS provider_user_id, cu.full_name AS client_name,
      COALESCE(pp.business_name, pu.full_name) AS provider_name, s.title AS service_title
    FROM conversations c
    JOIN provider_profiles pp ON c.provider_id = pp.id
    JOIN users pu ON pp.user_id = pu.id
    JOIN users cu ON c.client_id = cu.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.id = ?
  `).get(conversationId) as Participantes | undefined;
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0];

export function avisarNuevaSolicitud(conversationId: string) {
  enSegundoPlano(async () => {
    const p = participantes(conversationId);
    if (!p) return;
    await avisarUsuario(p.provider_user_id, {
      titulo: `Nueva solicitud de ${primerNombre(p.client_name)}`,
      cuerpo: p.service_title ? `Sobre: ${p.service_title}` : 'Toca para responder',
      datos: { tipo: 'mensaje', conversation_id: conversationId },
    });
  });
}

export function avisarNuevoMensaje(conversationId: string, remitente: 'client' | 'provider') {
  enSegundoPlano(async () => {
    const p = participantes(conversationId);
    if (!p) return;
    const [destino, nombre] = remitente === 'client' ? [p.provider_user_id, primerNombre(p.client_name)] : [p.client_id, p.provider_name];
    await avisarUsuario(destino, { titulo: `Nuevo mensaje de ${nombre}`, cuerpo: 'Toca para leerlo', datos: { tipo: 'mensaje', conversation_id: conversationId } });
  });
}
