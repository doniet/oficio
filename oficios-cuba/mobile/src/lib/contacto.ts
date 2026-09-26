import { ContactMode, telLink, UserType, whatsappLink } from '@oficio/shared';

interface ServicioContacto { is_owner: boolean; has_chat: boolean; contact_mode: ContactMode; whatsapp?: string | null; title: string }

// Mismas reglas que ContactActions de la web: el chat es del plan Profesional (el backend lo exige y
// responde 403 si no); WhatsApp y llamada según contact_mode, con el teléfono de `whatsapp`.
// `nada` = no hay ninguna forma de contacto, para decirlo en vez de dejar la pantalla sin botones.
export function opcionesContacto(s: ServicioContacto, usuario: { user_type: UserType } | null) {
  if (s.is_owner) return { chat: false, whatsapp: null, llamar: null, nada: false };
  const tel = s.whatsapp?.trim() || null;
  const chat = s.has_chat && usuario?.user_type !== 'provider';
  const whatsapp = tel && s.contact_mode !== 'call'
    ? whatsappLink(tel, `Hola, vi tu servicio «${s.title}» en Oficios Cuba y me interesa.`)
    : null;
  const llamar = tel && s.contact_mode !== 'whatsapp' ? telLink(tel) : null;
  return { chat, whatsapp, llamar, nada: !chat && !whatsapp && !llamar };
}
