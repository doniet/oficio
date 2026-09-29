import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { planDelPerfil, providerProfileIdFor } from '../db/index.js';
import { q, qOne, tx } from '../db/acceso.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { avisarNuevaSolicitud, avisarNuevoMensaje } from '../push/avisos.js';
import { avisarChat } from '../lib/avisos.js';

const router = Router();
router.use(authMiddleware);

const SIN_CHAT = 'El chat es del plan Profesional. Contacta a este profesional por WhatsApp o llamada.';

// conversations.provider_profile_id es el id del PERFIL de proveedor, no el del usuario (Tarea 3).
// El contrato JSON de la API no cambia: sigue llamándose provider_id (lo consumen el frontend y las
// dos apps móviles).
async function participantFilter(req: AuthRequest): Promise<{ column: 'client_id' | 'provider_profile_id'; value: string }> {
  if (req.user!.user_type === 'client') return { column: 'client_id', value: req.user!.id };
  const profileId = await providerProfileIdFor(req.user!.id);
  if (!profileId) throw new AppError('Perfil de proveedor no encontrado', 404);
  return { column: 'provider_profile_id', value: profileId };
}

async function loadConversation(req: AuthRequest) {
  const { column, value } = await participantFilter(req);
  const conversation = await qOne<any>(`
    SELECT c.id, c.client_id, c.provider_profile_id AS provider_id, c.service_id, c.created_at, c.last_message_at,
      COALESCE(pp.business_name, pu.full_name) AS provider_name, pu.avatar_url AS provider_avatar,
      cu.full_name AS client_name, cu.avatar_url AS client_avatar,
      s.title AS service_title
    FROM conversations c
    JOIN provider_profiles pp ON c.provider_profile_id = pp.id
    JOIN users pu ON pp.user_id = pu.id
    JOIN users cu ON c.client_id = cu.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.id = $1 AND c.${column} = $2
  `, [req.params.id, value]);
  if (!conversation) throw new AppError('Conversación no encontrada', 404);
  return conversation;
}

async function markRead(conversationId: string, userType: 'client' | 'provider') {
  const other = userType === 'client' ? 'provider' : 'client';
  await q(
    'UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_type = $2 AND read_at IS NULL',
    [conversationId, other],
  );
}

router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const { column, value } = await participantFilter(req);
  const other = req.user!.user_type === 'client' ? 'provider' : 'client';
  const conversations = await q<any>(`
    SELECT c.id, c.client_id, c.provider_profile_id AS provider_id, c.service_id, c.last_message, c.last_message_at, c.created_at,
      COALESCE(pp.business_name, pu.full_name) AS provider_name, pu.avatar_url AS provider_avatar,
      cu.full_name AS client_name, cu.avatar_url AS client_avatar,
      s.title AS service_title,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_type = $1 AND m.read_at IS NULL) AS unread_count
    FROM conversations c
    JOIN provider_profiles pp ON c.provider_profile_id = pp.id
    JOIN users pu ON pp.user_id = pu.id
    JOIN users cu ON c.client_id = cu.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.${column} = $2 AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
    ORDER BY c.last_message_at DESC
  `, [other, value]);
  res.json({ conversations: conversations.map((c) => ({ ...c, unread_count: Number(c.unread_count) })) });
}));

router.get('/unread-count', asyncHandler(async (req: AuthRequest, res) => {
  const { column, value } = await participantFilter(req);
  const other = req.user!.user_type === 'client' ? 'provider' : 'client';
  const row = await qOne<{ count: string }>(`
    SELECT COUNT(*) AS count FROM messages m JOIN conversations c ON m.conversation_id = c.id
    WHERE c.${column} = $1 AND m.sender_type = $2 AND m.read_at IS NULL
  `, [value, other]);
  res.json({ count: Number(row?.count ?? 0) });
}));

router.post('/', asyncHandler(async (req: AuthRequest, res) => {
  const data = z.object({
    provider_id: z.string().uuid(),
    service_id: z.string().uuid().optional(),
    initial_message: z.string().trim().min(1, 'Escribe un mensaje').max(2000),
  }).parse(req.body);

  if (req.user!.user_type !== 'client') {
    throw new AppError('Solo las cuentas de cliente pueden iniciar conversaciones', 403);
  }
  if (!await qOne('SELECT 1 FROM provider_profiles WHERE id = $1 AND is_active = true', [data.provider_id])) {
    throw new AppError('Proveedor no encontrado', 404);
  }
  if (!(await planDelPerfil(data.provider_id)).chat) throw new AppError(SIN_CHAT, 403);
  if (data.service_id && !await qOne('SELECT 1 FROM services WHERE id = $1 AND provider_id = $2', [data.service_id, data.provider_id])) {
    throw new AppError('Servicio no encontrado', 404);
  }

  const serviceId = data.service_id ?? null;
  const { id, nueva } = await tx(async (c) => {
    const existente = await c.qOne<{ id: string }>(
      'SELECT id FROM conversations WHERE client_id = $1 AND provider_profile_id = $2 AND service_id IS NOT DISTINCT FROM $3',
      [req.user!.id, data.provider_id, serviceId],
    );
    let convId = existente?.id;
    let esNueva = false;
    if (!convId) {
      convId = uuidv4();
      esNueva = true;
      await c.q(
        'INSERT INTO conversations (id, client_id, provider_profile_id, service_id, last_message, last_message_at, created_at) VALUES ($1, $2, $3, $4, $5, now(), now())',
        [convId, req.user!.id, data.provider_id, serviceId, data.initial_message],
      );
    } else {
      await c.q('UPDATE conversations SET last_message = $1, last_message_at = now() WHERE id = $2', [data.initial_message, convId]);
    }
    await c.q(
      "INSERT INTO messages (id, conversation_id, sender_id, sender_type, content, created_at) VALUES ($1, $2, $3, 'client', $4, now())",
      [uuidv4(), convId, req.user!.id, data.initial_message],
    );
    return { id: convId, nueva: esNueva };
  });

  // avisarNuevaSolicitud/avisarNuevoMensaje (push/avisos.ts) y avisarChat (lib/avisos.ts) ya
  // envuelven su cuerpo en try/catch: un aviso que falle no tumba la conversación.
  if (nueva) await avisarNuevaSolicitud(id); else await avisarNuevoMensaje(id, 'client');
  await avisarChat(id, 'client');
  res.status(201).json({ conversation: { id } });
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const conversation = await loadConversation(req);
  const after = typeof req.query.after === 'string' ? req.query.after : null;
  const messages = after
    ? await q('SELECT id, sender_id, sender_type, content, read_at, created_at FROM messages WHERE conversation_id = $1 AND created_at > $2 ORDER BY created_at ASC', [conversation.id, after])
    : await q('SELECT id, sender_id, sender_type, content, read_at, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conversation.id]);
  await markRead(conversation.id, req.user!.user_type);
  res.json({ conversation, messages });
}));

router.post('/:id/messages', asyncHandler(async (req: AuthRequest, res) => {
  const { content } = z.object({ content: z.string().trim().min(1).max(2000) }).parse(req.body);
  const conversation = await loadConversation(req);
  // Las conversaciones viejas se pueden leer, pero seguir escribiendo exige el plan Profesional.
  if (!(await planDelPerfil(conversation.provider_id)).chat) throw new AppError(SIN_CHAT, 403);
  const id = uuidv4();
  const inserted = await qOne<{ created_at: string }>(
    'INSERT INTO messages (id, conversation_id, sender_id, sender_type, content, created_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING created_at',
    [id, conversation.id, req.user!.id, req.user!.user_type, content],
  );
  await q('UPDATE conversations SET last_message = $1, last_message_at = now() WHERE id = $2', [content, conversation.id]);
  await markRead(conversation.id, req.user!.user_type);
  await avisarNuevoMensaje(conversation.id, req.user!.user_type);
  await avisarChat(conversation.id, req.user!.user_type);
  res.status(201).json({ message: { id, sender_id: req.user!.id, sender_type: req.user!.user_type, content, read_at: null, created_at: inserted!.created_at } });
}));

export default router;
