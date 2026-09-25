import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Search } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiError, conversationApi } from '../../services/api';
import type { Conversation } from '../../types';
import { relativeTime } from '../../lib/format';
import { PageTitle } from '../../components/DashboardLayout';
import { Avatar, EmptyState, ErrorState, cn } from '../../components/ui';

export default function Messages() {
  const { user } = useAuth();
  const isProvider = user?.user_type === 'provider';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await conversationApi.getAll();
      setConversations(res.data.conversations);
    } catch (err) {
      setError(apiError(err, 'No se pudieron cargar tus mensajes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      [isProvider ? c.client_name : c.provider_name, c.service_title, c.last_message]
        .some((v) => v?.toLowerCase().includes(q)));
  }, [conversations, query, isProvider]);

  return (
    <div>
      <PageTitle
        title="Mensajes"
        subtitle={isProvider ? 'Conversaciones con clientes interesados en tus servicios.' : 'Tus conversaciones con profesionales.'}
      />

      {loading ? (
        <div className="card divide-y divide-sand-200">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <div className="skeleton h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-2/5" />
                <div className="skeleton h-3.5 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title="Aún no tienes mensajes"
          action={!isProvider && <Link to="/buscar" className="btn-primary">Buscar profesionales</Link>}
        >
          {isProvider
            ? 'Cuando un cliente te escriba desde uno de tus servicios, la conversación aparecerá aquí.'
            : 'Escribe a un profesional desde su servicio o perfil y sigue la conversación aquí.'}
        </EmptyState>
      ) : (
        <>
          {conversations.length > 5 && (
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o servicio"
                aria-label="Buscar conversaciones"
                className="input pl-10"
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">Ninguna conversación coincide con “{query}”.</p>
          ) : (
            <ul className="card divide-y divide-sand-200 overflow-hidden">
              {filtered.map((c) => {
                const name = isProvider ? c.client_name : c.provider_name;
                const avatar = isProvider ? c.client_avatar : c.provider_avatar;
                const unread = c.unread_count ?? 0;
                return (
                  <li key={c.id}>
                    <Link to={`/dashboard/mensajes/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-sand-50 sm:px-5">
                      <Avatar src={avatar} name={name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={cn('truncate', unread ? 'font-bold text-ink-900' : 'font-semibold text-ink-800')}>{name}</p>
                          <span className={cn('shrink-0 text-xs', unread ? 'font-semibold text-brand-700' : 'text-ink-400')}>
                            {relativeTime(c.last_message_at)}
                          </span>
                        </div>
                        {c.service_title && <p className="truncate text-xs font-medium text-ink-400">{c.service_title}</p>}
                        <div className="flex items-center gap-2">
                          <p className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'text-ink-800' : 'text-ink-500')}>{c.last_message}</p>
                          {unread > 0 && (
                            <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-[11px] font-bold leading-5 text-white" aria-label={`${unread} sin leer`}>
                              {unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
