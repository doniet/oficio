import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Phone, Send } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiError, conversationApi, favoriteApi } from '../services/api';
import { whatsappLink } from '../lib/format';
import { Alert, Modal, Spinner, cn } from './ui';

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.01c0-5.2 4.23-9.43 9.44-9.43a9.37 9.37 0 0 1 9.42 9.44c0 5.2-4.23 9.43-9.43 9.43m8.03-17.46A11.3 11.3 0 0 0 12.05.7C5.8.7.7 5.8.7 12.05c0 2 .52 3.95 1.52 5.67L.6 23.3l5.7-1.5a11.3 11.3 0 0 0 5.74 1.46h.01c6.25 0 11.34-5.09 11.35-11.34 0-3.03-1.18-5.88-3.32-8.02" />
    </svg>
  );
}

export function useFavorite(providerId: string) {
  const { user } = useAuth();
  const toast = useToast();
  const [isFav, setIsFav] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = user?.user_type === 'client';

  useEffect(() => {
    if (!enabled) return;
    favoriteApi.ids().then((r) => setIsFav(r.data.ids.includes(providerId))).catch(() => {});
  }, [enabled, providerId]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (isFav) {
        await favoriteApi.remove(providerId);
        setIsFav(false);
        toast('Quitado de favoritos');
      } else {
        await favoriteApi.add(providerId);
        setIsFav(true);
        toast('Guardado en favoritos');
      }
    } catch (e) {
      toast(apiError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { enabled, isFav, busy, toggle };
}

interface Props {
  providerId: string;
  providerName: string;
  serviceId?: string;
  serviceTitle?: string;
  whatsapp?: string | null;
  phone?: string | null;
  /** panel: bloque vertical en la barra lateral; bar: barra fija inferior en móvil. */
  variant?: 'panel' | 'bar';
  hideFavorite?: boolean;
}

export default function ContactActions({ providerId, providerName, serviceId, serviceTitle, whatsapp, phone, variant = 'panel', hideFavorite }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const fav = useFavorite(providerId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const openMessage = () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setText(serviceTitle ? `Hola, vi tu servicio "${serviceTitle}" en Oficios Cuba. ¿Tienes disponibilidad esta semana?` : 'Hola, vi tu perfil en Oficios Cuba y me gustaría consultarte un trabajo.');
    setError('');
    setOpen(true);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await conversationApi.create({ provider_id: providerId, service_id: serviceId, initial_message: text.trim() });
      toast('Mensaje enviado');
      navigate(`/dashboard/mensajes/${res.data.conversation.id}`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  const waText = serviceTitle
    ? `Hola, vi tu servicio "${serviceTitle}" en Oficios Cuba y me interesa.`
    : 'Hola, vi tu perfil en Oficios Cuba y me gustaría consultarte un trabajo.';

  const favButton = !hideFavorite && fav.enabled && (
    <button
      onClick={fav.toggle}
      disabled={fav.busy}
      className={cn('btn-secondary', variant === 'bar' ? 'px-3' : '')}
      aria-pressed={fav.isFav}
      aria-label={fav.isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
    >
      <Heart className={cn('h-4 w-4', fav.isFav && 'fill-brand-600 text-brand-600')} />
      {variant === 'panel' && (fav.isFav ? 'Guardado' : 'Guardar')}
    </button>
  );

  const modal = (
    <Modal open={open} onClose={() => setOpen(false)} title={`Escribir a ${providerName}`}>
      {user?.user_type === 'provider' ? (
        <div className="space-y-4">
          <Alert tone="info">
            Estás usando una cuenta profesional. Para contratar a otros profesionales necesitas una cuenta de cliente.
          </Alert>
          {whatsapp && (
            <a href={whatsappLink(whatsapp, waText)} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
              <WhatsAppIcon /> Escribir por WhatsApp
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={send} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <label htmlFor="contact-msg" className="label">Tu mensaje</label>
            <textarea
              id="contact-msg"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={2000}
              className="input resize-none"
              placeholder="Cuéntale qué necesitas, dónde y cuándo."
              required
            />
            <p className="hint">Tip: incluye tu municipio y cuándo te vendría bien. La respuesta llega a tus Mensajes.</p>
          </div>
          <button type="submit" disabled={sending || !text.trim()} className="btn-primary btn-lg w-full">
            {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Enviar mensaje
          </button>
        </form>
      )}
    </Modal>
  );

  if (variant === 'bar') {
    return (
      <>
        <div className="fixed inset-x-0 bottom-[64px] z-30 border-t border-sand-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex gap-2">
            {favButton}
            {whatsapp && (
              <a href={whatsappLink(whatsapp, waText)} target="_blank" rel="noopener noreferrer" className="btn-whatsapp px-3" aria-label="WhatsApp">
                <WhatsAppIcon className="h-5 w-5" />
              </a>
            )}
            <button onClick={openMessage} className="btn-primary flex-1">
              <MessageCircle className="h-4 w-4" /> Enviar mensaje
            </button>
          </div>
        </div>
        {modal}
      </>
    );
  }

  return (
    <div className="space-y-2.5">
      <button onClick={openMessage} className="btn-primary btn-lg w-full">
        <MessageCircle className="h-5 w-5" /> Enviar mensaje
      </button>
      {whatsapp && (
        <a href={whatsappLink(whatsapp, waText)} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
          <WhatsAppIcon /> WhatsApp
        </a>
      )}
      <div className="flex gap-2.5">
        {phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="btn-secondary flex-1">
            <Phone className="h-4 w-4" /> Llamar
          </a>
        )}
        {favButton && <div className={phone ? '' : 'flex-1 [&>button]:w-full'}>{favButton}</div>}
      </div>
      {!user && (
        <p className="pt-1 text-center text-xs text-ink-400">
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="link">Entra</Link> para escribir por el chat y guardar favoritos.
        </p>
      )}
      {modal}
    </div>
  );
}
