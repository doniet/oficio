import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const userType = req.user!.user_type;

  let conversations;
  if (userType === 'client') {
    conversations = db.prepare(`
      SELECT
        c.*,
        pp.business_name as provider_name,
        pp.id as provider_profile_id,
        u.avatar_url as provider_avatar,
        s.title as service_title,
        s.id as service_id,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_content,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM conversations c
      JOIN provider_profiles pp ON c.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ?
      ORDER BY c.last_message_at DESC
    `).all(userId);
  } else {
    conversations = db.prepare(`
      SELECT
        c.*,
        u.full_name as client_name,
        u.avatar_url as client_avatar,
        s.title as service_title,
        s.id as service_id,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_content,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM conversations c
      JOIN users u ON c.client_id = u.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.provider_id = ?
      ORDER BY c.last_message_at DESC
    `).all(userId);
  }

  res.json({ conversations });
}));

router.post('/', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    provider_id: z.string().uuid(),
    service_id: z.string().uuid().optional(),
    initial_message: z.string().min(1).max(1000),
  });

  const data = schema.parse(req.body);

  if (req.user!.user_type !== 'client') {
    throw new AppError('Solo los clientes pueden iniciar conversaciones', 403);
  }

  const provider = db.prepare('SELECT id FROM provider_profiles WHERE id = ? AND is_active = 1').get(data.provider_id);
  if (!provider) {
    throw new AppError('Proveedor no encontrado', 404);
  }

  let conversation = db.prepare(`
    SELECT * FROM conversations
    WHERE client_id = ? AND provider_id = ? AND (service_id = ? OR service_id IS NULL)
  `).get(req.user!.id, data.provider_id, data.service_id || null);

  if (!conversation) {
    const conversationId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO conversations (id, client_id, provider_id, service_id, last_message, last_message_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(conversationId, req.user!.id, data.provider_id, data.service_id || null, data.initial_message, now);

    const messageId = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, sender_type, content)
      VALUES (?, ?, ?, 'client', ?)
    `).run(messageId, conversationId, req.user!.id, data.initial_message);

    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  } else {
    const messageId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, sender_type, content)
      VALUES (?, ?, ?, 'client', ?)
    `).run(messageId, conversation.id, req.user!.id, data.initial_message);

    db.prepare('UPDATE conversations SET last_message = ?, last_message_at = ? WHERE id = ?')
      .run(data.initial_message, now, conversation.id);
  }

  res.json({ conversation });
}));

router.get('/:id', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);

  if (!conversation) {
    throw new AppError('Conversación no encontrada', 404);
  }

  const userId = req.user!.id;
  const userType = req.user!.user_type;

  if ((userType === 'client' && conversation.client_id !== userId) ||
      (userType === 'provider' && conversation.provider_id !== userId)) {
    throw new AppError('No autorizado', 403);
  }

  const messages = db.prepare(`
    SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).all(req.params.id);

  if (userType === 'client') {
    db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_type = ? AND read_at IS NULL')
      .run(new Date().toISOString(), req.params.id, 'provider');
  } else {
    db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_type = ? AND read_at IS NULL')
      .run(new Date().toISOString(), req.params.id, 'client');
  }

  res.json({ conversation, messages });
}));

router.post('/:id/messages', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    content: z.string().min(1).max(2000),
  });

  const data = schema.parse(req.body);

  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);

  if (!conversation) {
    throw new AppError('Conversación no encontrada', 404);
  }

  const userId = req.user!.id;
  const userType = req.user!.user_type;

  if ((userType === 'client' && conversation.client_id !== userId) ||
      (userType === 'provider' && conversation.provider_id !== userId)) {
    throw new AppError('No autorizado', 403);
  }

  const messageId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, sender_type, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(messageId, req.params.id, userId, userType, data.content);

  db.prepare('UPDATE conversations SET last_message = ?, last_message_at = ? WHERE id = ?')
    .run(data.content, now, req.params.id);

  const message = db.prepare(`
    SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.id = ?
  `).get(messageId);

  res.status(201).json({ message });
}));

router.patch('/:id/read', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);

  if (!conversation) {
    throw new AppError('Conversación no encontrada', 404);
  }

  const userId = req.user!.id;
  const userType = req.user!.user_type;

  if ((userType === 'client' && conversation.client_id !== userId) ||
      (userType === 'provider' && conversation.provider_id !== userId)) {
    throw new AppError('No autorizado', 403);
  }

  const senderType = userType === 'client' ? 'provider' : 'client';
  db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_type = ? AND read_at IS NULL')
    .run(new Date().toISOString(), req.params.id, senderType);

  res.json({ message: 'Mensajes marcados como leídos' });
}));

export default router;