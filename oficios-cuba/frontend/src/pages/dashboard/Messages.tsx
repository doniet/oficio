import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { conversationApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Conversation } from '../../types';
import { MessageSquare, Loader2, User, Building2, Clock, Search, Bell } from 'lucide-react';

export default function Messages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await conversationApi.getAll();
        setConversations(res.data.conversations || []);
      } catch (error) {
        console.error('Error fetching conversations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();
  }, []);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mensajes</h1>
            <p className="text-gray-600 mt-1">Conversaciones con clientes y proveedores</p>
          </div>
        </div>

        {conversations.length === 0 ? (
          <div className="card p-12 text-center">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Sin conversaciones</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              {user?.user_type === 'provider'
                ? 'Cuando un cliente te contacte, aparecerá aquí.'
                : 'Inicia una conversación desde el perfil de un proveedor.'}
            </p>
            <Link to="/buscar" className="btn-primary inline-flex gap-2">
              <Search className="w-5 h-5" />
              Buscar servicios
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-gray-100">
              {conversations.map((conv) => (
                <Link
                  key={conv.id}
                  to={`/dashboard/mensajes/${conv.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                    {conv.provider_avatar ? (
                      <img src={conv.provider_avatar} alt="" className="w-12 h-12 rounded-xl" />
                    ) : (
                      <Building2 className="w-6 h-6 text-primary-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 truncate">
                        {user?.user_type === 'client' ? conv.provider_name : conv.client_name}
                      </h3>
                      <span className="text-sm text-gray-500 whitespace-nowrap">
                        {formatTime(conv.last_message_at || conv.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {conv.service_title && (
                        <span className="badge bg-gray-100 text-gray-700">{conv.service_title}</span>
                      )}
                      <p className="text-sm text-gray-500 truncate">{conv.last_message || 'Sin mensajes'}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}