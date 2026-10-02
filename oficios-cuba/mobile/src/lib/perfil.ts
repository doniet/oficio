import { ContactMode, ProviderServiceArea, telLink, UserType, whatsappLink } from '@oficio/shared';

// El texto con el que la web abre la conversación cuando se escribe al PERFIL y no a un servicio
// concreto — el mismo para WhatsApp y para el chat (ContactActions.tsx: `waText` y `openMessage`
// sin `serviceTitle`). No se reusa `opcionesContacto` de `lib/contacto.ts` justamente por esto:
// esa función arma el mensaje con «vi tu servicio «X»», que aquí sería falso.
export const MENSAJE_INICIAL = 'Hola, vi tu perfil en Encuentrauno y me gustaría consultarte un trabajo.';

/**
 * «1 reseña» / «3 reseñas». Existe porque las etiquetas de lector de pantalla de esta pantalla
 * decían «1 reseñas»: el número y la palabra se escribían en sitios distintos y solo uno de los
 * dos pluralizaba.
 */
export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export interface ZonaProvincia {
  provincia: string;
  municipios: string[];
}

/**
 * Agrupa las zonas de trabajo por provincia conservando el orden en que llegan, igual que la web
 * (`ProviderProfile.tsx:71-78`, un `reduce` sobre un objeto). El backend ya las manda ordenadas:
 * reordenarlas aquí cambiaría la lista respecto a la web sin que nadie lo pidiera.
 */
export function zonasPorProvincia(areas: ProviderServiceArea[]): ZonaProvincia[] {
  const porProvincia = new Map<string, string[]>();
  for (const a of areas) {
    const municipios = porProvincia.get(a.province_name);
    if (municipios) municipios.push(a.municipality_name);
    else porProvincia.set(a.province_name, [a.municipality_name]);
  }
  return [...porProvincia].map(([provincia, municipios]) => ({ provincia, municipios }));
}

/**
 * `https://t.me/<usuario>` con el `@` y el `+` de delante quitados, como la web
 * (`ProviderProfile.tsx:190`). El usuario va escapado porque acaba en una URL que abre `Linking`:
 * la web no lo hace, pero un espacio o un acento colado en el campo dejaría el enlace roto.
 */
export function enlaceTelegram(usuario: string | null | undefined): string | null {
  const limpio = (usuario ?? '').trim().replace(/^@/, '').replace(/^\+/, '');
  return limpio ? `https://t.me/${encodeURIComponent(limpio)}` : null;
}

export function enlaceCorreo(correo: string | null | undefined): string | null {
  const limpio = (correo ?? '').trim();
  return limpio ? `mailto:${limpio}` : null;
}

interface PerfilContactable {
  whatsapp?: string | null;
  telegram?: string | null;
  email_contact?: string | null;
  contact_mode: ContactMode;
  has_chat: boolean;
}

/**
 * Las formas de contactar con el PERFIL. Mismas reglas que `ContactActions` de la web: el chat es
 * del plan Profesional (el backend responde 403 si no) y nunca para una cuenta profesional;
 * WhatsApp y llamada según `contact_mode`.
 *
 * 🚨 `sinTelefono` y `sinContacto` NO son lo mismo, y confundirlos fue un fallo real: el perfil
 * decía «no se puede contactar» a quien solo había dejado Telegram.
 * - `sinTelefono` → no hay chat ni teléfono: es lo que justifica decir «aún no ha puesto un
 *   teléfono de contacto», que sigue siendo cierto aunque haya Telegram o correo.
 * - `sinContacto` → no hay NINGUNA vía, ni teléfono ni Telegram ni correo. Solo con esto se puede
 *   afirmar que no hay por dónde escribirle.
 */
export function contactoPerfil(p: PerfilContactable, usuario: { user_type: UserType } | null) {
  const tel = p.whatsapp?.trim() || null;
  const chat = p.has_chat && usuario?.user_type !== 'provider';
  const whatsapp = tel && p.contact_mode !== 'call' ? whatsappLink(tel, MENSAJE_INICIAL) : null;
  const llamar = tel && p.contact_mode !== 'whatsapp' ? telLink(tel) : null;
  const telegram = enlaceTelegram(p.telegram);
  const correo = enlaceCorreo(p.email_contact);
  const sinTelefono = !chat && !whatsapp && !llamar;
  return { chat, whatsapp, llamar, telegram, correo, sinTelefono, sinContacto: sinTelefono && !telegram && !correo };
}

/** El mensaje con el que se escribe por UN artículo del catálogo (CatalogItemModal.tsx:45-48). */
export function mensajeArticulo(item: { name: string; available: boolean }, precio: string): string {
  return item.available
    ? `Hola, me interesa «${item.name}» (${precio}) que vi en Encuentrauno.`
    : `Hola, vi «${item.name}» en tu catálogo de Encuentrauno. ¿Vuelve a haber?`;
}

/** El título del botón de contacto del artículo (CatalogItemModal.tsx:49). */
export function accionArticulo(disponible: boolean): string {
  return disponible ? 'Lo quiero' : 'Preguntar si vuelve a haber';
}

/**
 * La etiqueta de la región viva del catálogo. Devuelve `null` cuando no se está filtrando: sin
 * filtro el conteo ya está en el título de la sección y anunciarlo otra vez sería ruido.
 *
 * 🚨 `cargando` es `isPlaceholderData`, no `isLoading`. Con `keepPreviousData` la rejilla sigue
 * enseñando la página de la clave ANTERIOR mientras llega la nueva, así que su `total` es el del
 * filtro viejo: anunciarlo le lee a TalkBack «30 artículos» y lo corrige a «2» un segundo después.
 * Mientras los datos no correspondan a lo que se está mostrando, esta etiqueta no da ninguna cifra.
 */
export function etiquetaConteoCatalogo({ filtrando, cargando, total }: { filtrando: boolean; cargando: boolean; total: number }): string | null {
  if (!filtrando) return null;
  if (cargando) return 'Buscando…';
  return plural(total, 'artículo', 'artículos');
}

/**
 * La etiqueta de una barra de la distribución de estrellas. Lleva el porcentaje porque la fila
 * entera es un solo elemento accesible: el «5» y el «40 %» que se ven quedan plegados dentro y, de
 * leerse por separado, el lector de pantalla cantaría números sueltos sin decir de qué son.
 */
export function etiquetaBarraResenas(fila: { rating: number; count: number; porcentaje: number }): string {
  return `${plural(fila.count, 'reseña', 'reseñas')} de ${plural(fila.rating, 'estrella', 'estrellas')}, ${fila.porcentaje} %`;
}
