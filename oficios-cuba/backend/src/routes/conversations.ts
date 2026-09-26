import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db, { planDelPerfil, providerProfileIdFor } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { avisarChat } from '../lib/avisos.js';

const router = Router();
router.use(authMiddleware);

const SIN_CHAT = 'El chat es del plan Profesional. Contacta a este profesional por WhatsApp o llamada.';

// conversations.provider_id es el id del PERFIL de proveedor, no el del usuario.
function participantFilter(req: AuthRequest): { column: 'client_id' | 'provider_id'; value: string } {
  if (req.user!.user_type === 'client') return { column: 'client_id', value: req.user!.id };
  const profileId = providerProfileIdFor(req.user!.id);
  if (!profileId) throw new AppError('Perfil de proveedor no encontrado', 404);
  return { column: 'provider_id', value: profileId };
}

function loadConversation(req: AuthRequest) {
  const { column, value } = participantFilter(req);
  const conversation = db.prepare(`
    SELECT c.id, c.client_id, c.provider_id, c.service_id, c.created_at, c.last_message_at,
      COALESCE(pp.business_name, pu.full_name) AS provider_name, pu.avatar_url AS provider_avatar,
      cu.full_name AS client_name, cu.avatar_url AS client_avatar,
      s.title AS service_title
    FROM conversations c
    JOIN provider_profiles pp ON c.provider_id = pp.id
    JOIN users pu ON pp.user_id = pu.id
    JOIN users cu ON c.client_id = cu.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.id = ? AND c.${column} = ?
  `).get(req.params.id, value);
  if (!conversation) throw new AppError('Conversación no encontrada', 404);
  return conversation;
}

function markRead(conversationId: string, userType: 'client' | 'provider') {
  const other = userType === 'client' ? 'provider' : 'client';
  db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_type = ? AND read_at IS NULL')
    .run(new Date().toISOString(), conversationId, other);
}

router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const { column, value } = participantFilter(req);
  const other = req.user!.user_type === 'client' ? 'provider' : 'client';
  const conversations = db.prepare(`
    SELECT c.id, c.client_id, c.provider_id, c.service_id, c.last_message, c.last_message_at, c.created_at,
      COALESCE(pp.business_name, pu.full_name) AS provider_name, pu.avatar_url AS provider_avatar,
      cu.full_name AS client_name, cu.avatar_url AS client_avatar,
      s.title AS service_title,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_type = ? AND m.read_at IS NULL) AS unread_count
    FROM conversations c
    JOIN provider_profiles pp ON c.provider_id = pp.id
    JOIN users pu ON pp.user_id = pu.id
    JOIN users cu ON c.client_id = cu.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.${column} = ? AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
    ORDER BY c.last_message_at DESC
  `).all(other, value);
  res.json({ conversations });
}));

router.get('/unread-count', asyncHandler(async (req: AuthRequest, res) => {
  const { column, value } = participantFilter(req);
  const other = req.user!.user_type === 'client' ? 'provider' : 'client';
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM messages m JOIN conversations c ON m.conversation_id = c.id
    WHERE c.${column} = ? AND m.sender_type = ? AND m.read_at IS NULL
  `).get(value, other) as { count: number };
  res.json({ count: row.count });
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
  if (!db.prepare('SELECT 1 FROM provider_profiles WHERE id = ? AND is_active = 1').get(data.provider_id)) {
    throw new AppError('Proveedor no encontrado', 404);
  }
  if (!planDelPerfil(data.provider_id).chat) throw new AppError(SIN_CHAT, 403);
  if (data.service_id && !db.prepare('SELECT 1 FROM services WHERE id = ? AND provider_id = ?').get(data.service_id, data.provider_id)) {
    throw new AppError('Servicio no encontrado', 404);
  }

  const now = new Date().toISOString();
  const serviceId = data.service_id ?? null;
  const tx = db.transaction(() => {
    let conv = db.prepare('SELECT id FROM conversations WHERE client_id = ? AND provider_id = ? AND service_id IS ?')
      .get(req.user!.id, data.provider_id, serviceId) as { id: string } | undefined;
    if (!conv) {
      conv = { id: uuidv4() };
      db.prepare('INSERT INTO conversations (id, client_id, provider_id, service_id, last_message, last_message_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(conv.id, req.user!.id, data.provider_id, serviceId, data.initial_message, now, now);
    } else {
      db.prepare('UPDATE conversations SET last_message = ?, last_message_at = ? WHERE id = ?').run(data.initial_message, now, conv.id);
    }
    db.prepare("INSERT INTO messages (id, conversation_id, sender_id, sender_type, content, created_at) VALUES (?, ?, ?, 'client', ?, ?)")
      .run(uuidv4(), conv.id, req.user!.id, data.initial_message, now);
    return conv.id;
  });

  const conversationId = tx();
  avisarChat(conversationId, 'client');
  res.status(201).json({ conversation: { id: conversationId } });
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const conversation = loadConversation(req);
  const after = typeof req.query.after === 'string' ? req.query.after : null;
  const messages = db.prepare(`
    SELECT id, sender_id, sender_type, content, read_at, created_at FROM messages
    WHERE conversation_id = ? ${after ? 'AND created_at > ?' : ''}
    ORDER BY created_at ASC
  `).all(...(after ? [conversation.id, after] : [conversation.id]));
  markRead(conversation.id, req.user!.user_type);
  res.json({ conversation, messages });
}));

router.post('/:id/messages', asyncHandler(async (req: AuthRequest, res) => {
  const { content } = z.object({ content: z.string().trim().min(1).max(2000) }).parse(req.body);
  const conversation = loadConversation(req);
  // Las conversaciones viejas se pueden leer, pero seguir escribiendo exige el plan Profesional.
  if (!planDelPerfil(conversation.provider_id).chat) throw new AppError(SIN_CHAT, 403);
  const now = new Date().toISOString();
  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, sender_type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, conversation.id, req.user!.id, req.user!.user_type, content, now);
  db.prepare('UPDATE conversations SET last_message = ?, last_message_at = ? WHERE id = ?').run(content, now, conversation.id);
  markRead(conversation.id, req.user!.user_type);
  avisarChat(conversation.id, req.user!.user_type);
  res.status(201).json({ message: { id, sender_id: req.user!.id, sender_type: req.user!.user_type, content, read_at: null, created_at: now } });
}));

export default router;
