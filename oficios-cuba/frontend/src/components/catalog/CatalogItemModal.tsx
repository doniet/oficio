import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Phone, Store } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTasa } from '../../hooks/useTasa';
import { useToast } from '../../hooks/useToast';
import { apiError, conversationApi, providerApi } from '../../services/api';
import { catalogPrice, telLink, whatsappLink } from '../../lib/format';
import type { CatalogItem, ContactMode } from '../../types';
import { Alert, Modal, Spinner } from '../ui';
import { CatalogImage, PrecioArticulo } from './CatalogCard';

export interface VendedorCatalogo {
  id: string;
  name: string;
  whatsapp?: string | null;
  contactMode: ContactMode;
  hasChat: boolean;
}

/**
 * Detalle de un artículo con el botón "Lo quiero": chat interno si el profesional lo tiene
 * (plan Profesional), si no WhatsApp, y llamada cuando solo acepta llamadas.
 */
export default function CatalogItemModal({ item, vendedor, onClose, profileLink = false }: {
  item: CatalogItem | null;
  vendedor: VendedorCatalogo | null;
  onClose: () => void;
  /** En la búsqueda general: enlace al catálogo completo del profesional. */
  profileLink?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const tasa = useTasa();
  const [escribiendo, setEscribiendo] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setEscribiendo(false); setError(''); }, [item]);

  if (!item || !vendedor) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const p = catalogPrice(item, tasa);
  const precio = [p.prefix, p.amount].filter(Boolean).join(' ');
  const mensaje = item.available
    ? `Hola, me interesa «${item.name}» (${precio}) que vi en Oficios Cuba.`
    : `Hola, vi «${item.name}» en tu catálogo de Oficios Cuba. ¿Vuelve a haber?`;
  const accion = item.available ? 'Lo quiero' : 'Preguntar si vuelve a haber';
  const phone = vendedor.whatsapp;
  const conWhatsapp = Boolean(phone) && vendedor.contactMode !== 'call';
  const conLlamada = Boolean(phone) && vendedor.contactMode !== 'whatsapp';
  const esCliente = user?.user_type === 'client';

  const abrirChat = () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setText(mensaje);
    setError('');
    setEscribiendo(true);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await conversationApi.create({ provider_id: vendedor.id, initial_message: text.trim() });
      toast('Mensaje enviado');
      navigate(`/dashboard/mensajes/${res.data.conversation.id}`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  const registrar = (via: 'whatsapp' | 'call') => { providerApi.contact(vendedor.id, via); };

  return (
    <Modal open onClose={onClose} title={item.name}>
      <div className="space-y-5">
        <div className="-mx-6 -mt-2 aspect-[4/3] overflow-hidden bg-sand-100 sm:mx-0 sm:rounded-2xl">
          <CatalogImage item={item} eager className="[&>span]:text-7xl" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {item.section && <span className="badge bg-sand-100 font-medium text-ink-700">{item.section}</span>}
          {!item.available && <span className="badge bg-ink-900 text-white">Agotado</span>}
          <span className="text-sm text-ink-500">de <strong className="font-semibold text-ink-700">{vendedor.name}</strong></span>
        </div>

        <PrecioArticulo item={item} size="lg" />

        {item.description && <p className="whitespace-pre-line break-words leading-relaxed text-ink-700">{item.description}</p>}

        {escribiendo ? (
          <form onSubmit={enviar} className="space-y-3 border-t border-sand-200 pt-5">
            {error && <Alert>{error}</Alert>}
            <label htmlFor="cat-msg" className="label">Tu mensaje a {vendedor.name}</label>
            <textarea id="cat-msg" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} className="input resize-none" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEscribiendo(false)} className="btn-secondary flex-1">Volver</button>
              <button type="submit" disabled={sending || !text.trim()} className="btn-primary flex-[2]">
                {sending && <Spinner className="h-4 w-4" />} Enviar
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 border-t border-sand-200 pt-5">
            {user?.user_type === 'provider' && vendedor.hasChat && (
              <Alert tone="info">Estás usando una cuenta profesional. Para escribir por el chat necesitas una cuenta de cliente.</Alert>
            )}
            {vendedor.hasChat && (!user || esCliente) && (
              <button type="button" onClick={abrirChat} className="btn-primary w-full">
                <MessageCircle className="h-4 w-4" /> {accion}{user ? '' : ' (entra para escribir)'}
              </button>
            )}
            {conWhatsapp && phone && (
              <a
                href={whatsappLink(phone, mensaje)}
                onClick={() => registrar('whatsapp')}
                target="_blank"
                rel="noopener noreferrer"
                className={vendedor.hasChat ? 'btn-secondary w-full' : 'btn-whatsapp w-full'}
              >
                <MessageCircle className="h-4 w-4" /> {vendedor.hasChat ? 'Por WhatsApp' : accion}
              </a>
            )}
            {conLlamada && phone && (
              <a href={telLink(phone)} onClick={() => registrar('call')} className={!vendedor.hasChat && !conWhatsapp ? 'btn-primary w-full' : 'btn-secondary w-full'}>
                <Phone className="h-4 w-4" /> {!vendedor.hasChat && !conWhatsapp ? `${accion}: llamar` : `Llamar a ${vendedor.name}`}
              </a>
            )}
            {!vendedor.hasChat && !phone && (
              <p className="text-center text-sm text-ink-400">Este profesional no ha dejado un teléfono de contacto.</p>
            )}
            {profileLink && (
              <Link to={`/proveedor/${vendedor.id}#catalogo`} className="btn-ghost w-full">
                <Store className="h-4 w-4" /> Ver catálogo completo
              </Link>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
