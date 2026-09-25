import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { conversationApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Conversation, Message } from '../../types';
import { ArrowLeft, Send, Loader2, Paperclip, MoreVertical, Check, CheckCheck, Clock } from 'lucide-react';

export default function Conversation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const fetchConversation = async () => {
      try {
        const res = await conversationApi.getById(id);
        setConversation(res.data.conversation);
        setMessages(res.data.messages || []);
      } catch (error) {
        console.error('Error fetching conversation:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConversation();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;

    setSending(true);
    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      const res = await conversationApi.sendMessage(id, messageContent);
      setMessages(prev => [...prev, res.data.message]);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error al enviar mensaje');
      setNewMessage(messageContent);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const isOwnMessage = (message: Message) => message.sender_id === user?.id;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Conversación no encontrada</h2>
          <button onClick={() => navigate('/dashboard/mensajes')} className="btn-primary">Volver a mensajes</button>
        </div>
      </div>
    );
  }

  const otherParty = user?.user_type === 'client' ? conversation.provider_name : conversation.client_name;
  const otherAvatar = user?.user_type === 'client' ? conversation.provider_avatar : conversation.client_avatar;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 h-16">
            <button onClick={() => navigate('/dashboard/mensajes')} className="p-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
              {otherAvatar ? (
                <img src={otherAvatar} alt="" className="w-10 h-10 rounded-xl" />
              ) : (
                <Paperclip className="w-5 h-5 text-primary-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900 truncate">{otherParty}</h2>
              {conversation.service_title && (
                <p className="text-sm text-gray-500 truncate">{conversation.service_title}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${isOwnMessage(message) ? 'flex-row-reverse' : ''}`}
            >
              {!isOwnMessage(message) && (
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  {message.sender_avatar ? (
                    <img src={message.sender_avatar} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <Paperclip className="w-4 h-4 text-primary-600" />
                  )}
                </div>
              )}

              <div className={`max-w-[70%] ${isOwnMessage(message) ? 'text-right' : ''}`}>
                <div
                  className={`inline-block px-4 py-2 rounded-2xl ${
                    isOwnMessage(message)
                      ? 'bg-primary-600 text-white rounded-tr-none'
                      : 'bg-white text-gray-900 rounded-tl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <div className={`flex items-center gap-1 mt-1 text-xs ${isOwnMessage(message) ? 'text-primary-100' : 'text-gray-400'}`}>
                    <span>{formatTime(message.created_at)}</span>
                    {isOwnMessage(message) && message.read_at && (
                      <>
                        <Check className="w-3 h-3" />
                        <Check className="w-3 h-3" />
                      </>
                    )}
                    {isOwnMessage(message) && !message.read_at && (
                      <Check className="w-3 h-3" />
                    )}
                  </div>
                </div>
              </div>

              {isOwnMessage(message) && (
                <div className="w-8 h-8 flex-shrink-0" />
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="bg-white border-t border-gray-100 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto py-4">
          <form onSubmit={handleSend} className="flex items-center gap-3">
            <button type="button" className="p-2 text-gray-400 hover:text-gray-600">
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="flex-1 input py-3"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="btn-primary p-3"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}