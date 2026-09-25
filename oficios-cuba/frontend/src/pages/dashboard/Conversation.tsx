import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCheck, Lock, Send } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { apiError, conversationApi } from '../../services/api';
import type { Conversation as ConversationType, Message } from '../../types';
import { dayLabel, parseDate, shortTime } from '../../lib/format';
import { Avatar, ErrorState, PageLoader, Spinner, cn } from '../../components/ui';

const POLL_MS = 5000;

function mergeMessages(prev: Message[], incoming: Message[]) {
  if (!incoming.length) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

export default function Conversation() {
  const { id = '' } = useParams();
  const { user, refreshUnread } = useAuth();
  const toast = useToast();
  const [conversation, setConversation] = useState<ConversationType | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [closed, setClosed] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAt = useRef<string | undefined>(undefined);
  const stickToBottom = useRef(true);

  const isProvider = user?.user_type === 'provider';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await conversationApi.getById(id);
      setConversation(res.data.conversation);
      setMessages(res.data.messages);
      stickToBottom.current = true;
      refreshUnread();
    } catch (err) {
      setError(apiError(err, 'No se pudo abrir la conversación.'));
    } finally {
      setLoading(false);
    }
  }, [id, refreshUnread]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    lastAt.current = messages[messages.length - 1]?.created_at;
  }, [messages]);

  // Polling en vez de websockets: con conexiones inestables es más robusto, y se pausa
  // con la pestaña oculta para no gastar datos.
  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await conversationApi.getById(id, lastAt.current);
        if (cancelled || !res.data.messages.length) return;
        setMessages((prev) => mergeMessages(prev, res.data.messages));
        refreshUnread();
      } catch { /* el siguiente ciclo lo reintenta */ }
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [conversation, id, refreshUnread]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await conversationApi.sendMessage(id, content);
      stickToBottom.current = true;
      setMessages((prev) => mergeMessages(prev, [res.data.message]));
      setText('');
      inputRef.current?.focus();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) setClosed(apiError(err));
      else toast(apiError(err, 'No se pudo enviar el mensaje.'), 'error');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // En escritorio Enter envía; en móvil el teclado no tiene Mayús+Enter cómodo, así que se usa el botón.
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) {
      e.preventDefault();
      send();
    }
  };

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  if (loading) return <PageLoader />;
  if (error || !conversation) {
    return (
      <div className="container-page max-w-2xl py-10">
        <Link to="/dashboard/mensajes" className="link mb-4 inline-flex items-center gap-1 text-sm"><ArrowLeft className="h-4 w-4" /> Mensajes</Link>
        <ErrorState message={error || 'Conversación no encontrada'} onRetry={load} />
      </div>
    );
  }

  const otherName = isProvider ? conversation.client_name : conversation.provider_name;
  const otherAvatar = isProvider ? conversation.client_avatar : conversation.provider_avatar;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-sand-50">
      <div className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-4">
          <Link to="/dashboard/mensajes" className="-ml-1 rounded-xl p-2 text-ink-500 hover:bg-sand-100 hover:text-ink-900" aria-label="Volver a mensajes">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Avatar src={otherAvatar} name={otherName} size="sm" />
          <div className="min-w-0 flex-1">
            {isProvider ? (
              <p className="truncate font-bold">{otherName}</p>
            ) : (
              <Link to={`/proveedor/${conversation.provider_id}`} className="block truncate font-bold hover:text-brand-700">{otherName}</Link>
            )}
            {conversation.service_title && conversation.service_id && (
              <Link to={`/servicio/${conversation.service_id}`} className="block truncate text-xs text-ink-500 hover:text-brand-700">
                Sobre: {conversation.service_title}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto" aria-live="polite" aria-label="Mensajes">
        <div className="mx-auto max-w-3xl space-y-1.5 px-3 py-4 sm:px-4">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-400">Todavía no hay mensajes. Escribe el primero.</p>
          )}
          {messages.map((m, i) => {
            const mine = m.sender_id === user?.id;
            const prev = messages[i - 1];
            const newDay = !prev || parseDate(prev.created_at).toDateString() !== parseDate(m.created_at).toDateString();
            const grouped = !newDay && prev?.sender_id === m.sender_id;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="flex justify-center py-3">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-ink-500 shadow-sm">{dayLabel(m.created_at)}</span>
                  </div>
                )}
                <div className={cn('flex', mine ? 'justify-end' : 'justify-start', !grouped && 'pt-1.5')}>
                  <div
                    className={cn(
                      'max-w-[82%] rounded-2xl px-3.5 py-2 text-[0.95rem] leading-snug shadow-sm sm:max-w-[70%]',
                      mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white text-ink-900',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={cn('mt-0.5 flex items-center justify-end gap-1 text-[11px]', mine ? 'text-brand-100' : 'text-ink-400')}>
                      {shortTime(m.created_at)}
                      {mine && (m.read_at
                        ? <CheckCheck className="h-3.5 w-3.5" aria-label="Leído" />
                        : <Check className="h-3.5 w-3.5" aria-label="Enviado" />)}
                    </p>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {closed ? (
        <div className="pb-safe border-t border-sand-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-start gap-3 px-4 py-3 text-sm text-ink-600">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            <p className="flex-1">
              {closed}
              {isProvider && <> <Link to="/dashboard/suscripcion" className="link">Ver planes</Link></>}
              {!isProvider && <> <Link to={`/proveedor/${conversation.provider_id}`} className="link">Ver su contacto</Link></>}
            </p>
          </div>
        </div>
      ) : (
      <form onSubmit={send} className="pb-safe border-t border-sand-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-end gap-2 px-3 py-2.5 sm:px-4">
          <label htmlFor="msg" className="sr-only">Escribe un mensaje</label>
          <textarea
            id="msg"
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={2000}
            placeholder="Escribe un mensaje…"
            className="input max-h-[140px] min-h-[44px] flex-1 resize-none py-2.5"
          />
          <button type="submit" disabled={!text.trim() || sending} className="btn-primary h-11 w-11 shrink-0 p-0" aria-label="Enviar mensaje">
            {sending ? <Spinner className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
