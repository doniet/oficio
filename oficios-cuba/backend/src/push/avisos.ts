import { v4 as uuidv4 } from 'uuid';
import { q, qOne } from '../db/acceso.js';
import { Notificacion } from './canal.js';

export type { Notificacion } from './canal.js';

// La API no tiene salida a internet: solo apunta el aviso en push_outbox, una fila por dispositivo
// del usuario, y oficio_notifier lo envía por FCM (notifier/push.ts). Apuntar es una escritura local:
// no retrasa la respuesta del chat, y si falla se registra y se sigue — un aviso perdido es mejor que
// un mensaje sin guardar.
export async function avisarUsuario(userId: string, n: Notificacion) {
  try {
    const ahora = new Date().toISOString();
    const dispositivos = await q<{ id: string }>('SELECT id FROM push_devices WHERE user_id = $1', [userId]);
    for (const d of dispositivos) {
      await q(`INSERT INTO push_outbox (id, device_id, user_id, titulo, cuerpo, datos, send_after, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuidv4(), d.id, userId, n.titulo, n.cuerpo, JSON.stringify(n.datos), ahora, ahora]);
    }
  } catch (err) {
    console.error('No se pudo apuntar el aviso push:', (err as Error).message);
  }
}

interface Participantes { client_id: string; provider_user_id: string; client_name: string; provider_name: string; service_title: string | null }

async function participantes(conversationId: string) {
  // conversations.provider_id es el PERFIL: el usuario a avisar es provider_profiles.user_id.
  return qOne<Participantes>(`
    SELECT c.client_id, pp.user_id AS provider_user_id, cu.full_name AS client_name,
      COALESCE(pp.business_name, pu.full_name) AS provider_name, s.title AS service_title
    FROM conversations c
    JOIN provider_profiles pp ON c.provider_profile_id = pp.id
    JOIN users pu ON pp.user_id = pu.id
    JOIN users cu ON c.client_id = cu.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.id = $1
  `, [conversationId]);
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0];

export async function avisarNuevaSolicitud(conversationId: string) {
  try {
    const p = await participantes(conversationId);
    if (!p) return;
    await avisarUsuario(p.provider_user_id, {
      titulo: `Nueva solicitud de ${primerNombre(p.client_name)}`,
      cuerpo: p.service_title ? `Sobre: ${p.service_title}` : 'Toca para responder',
      datos: { tipo: 'mensaje', conversation_id: conversationId },
    });
  } catch (err) {
    console.error('No se pudo apuntar el aviso de nueva solicitud:', (err as Error).message);
  }
}

export async function avisarNuevoMensaje(conversationId: string, remitente: 'client' | 'provider') {
  try {
    const p = await participantes(conversationId);
    if (!p) return;
    const [destino, nombre] = remitente === 'client' ? [p.provider_user_id, primerNombre(p.client_name)] : [p.client_id, p.provider_name];
    await avisarUsuario(destino, { titulo: `Nuevo mensaje de ${nombre}`, cuerpo: 'Toca para leerlo', datos: { tipo: 'mensaje', conversation_id: conversationId } });
  } catch (err) {
    console.error('No se pudo apuntar el aviso de nuevo mensaje:', (err as Error).message);
  }
}
