import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, ChevronDown, Phone, Share2, X } from 'lucide-react';
import { apiError, providerApi } from '../../services/api';
import { telLink, whatsappLink, priceFrom } from '../../lib/format';
import { useTasa } from '../../hooks/useTasa';
import { useToast } from '../../hooks/useToast';
import { Avatar, cn, CoverImage, ErrorState, RatingInline } from '../ui';
import { NegocioChip } from '../cards';
import { ReviewItem } from '../ReviewList';
import { WhatsAppIcon } from '../ContactActions';
import BookingModal from '../BookingModal';
import type { ProviderPublic, ProviderServiceItem, PuntoMapa, Review } from '../../types';

/**
 * Tarjeta compacta de un servicio dentro del panel del mapa: foto, categoría, título y precio.
 * Vive en su propia sección colapsada — ver `SeccionServicios` — para que sus fotos (lo más
 * pesado de la ficha) no bajen hasta que alguien pida verlas de verdad.
 */
function ServicioMiniCard({ service }: { service: ProviderServiceItem }) {
  const tasa = useTasa();
  const price = priceFrom(service, tasa);
  return (
    <Link
      to={`/servicio/${service.id}`}
      className="group flex gap-3 rounded-xl border border-sand-200 p-2 transition hover:border-brand-300 hover:shadow-card"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-sand-100">
        <CoverImage src={service.cover} seed={service.category_slug} icon={service.category_icon} alt="" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-xs font-semibold text-ink-400"><span aria-hidden="true">{service.category_icon}</span> {service.category_name}</p>
        <h4 className="line-clamp-1 text-sm font-bold leading-snug text-ink-900 group-hover:text-brand-700">{service.title}</h4>
        <p className="mt-0.5 leading-none">
          {price.prefix && <span className="mr-1 text-xs text-ink-400">{price.prefix}</span>}
          <span className="font-display text-sm font-bold text-ink-900">{price.amount}</span>
          {price.suffix && <span className="ml-0.5 text-xs text-ink-400">{price.suffix}</span>}
        </p>
      </div>
    </Link>
  );
}

/**
 * Acordeón cerrado por defecto: nadie baja una sola foto de servicio hasta tocar "Servicios".
 * Las tarjetas (y sus `<img>`) ni siquiera existen en el DOM mientras está cerrado — no basta con
 * `loading="lazy"` del navegador, que igual las pide si el panel es corto y entran en pantalla.
 */
function SeccionServicios({ servicios, abierta, onToggle }: { servicios: ProviderServiceItem[]; abierta: boolean; onToggle: () => void }) {
  if (servicios.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between py-1 text-sm font-bold text-ink-900"
      >
        <span>Servicios <span className="font-sans font-semibold text-ink-400">({servicios.length})</span></span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', abierta && 'rotate-180')} aria-hidden="true" />
      </button>
      {abierta && (
        <ul className="mt-2 animate-fade-in space-y-2">
          {servicios.map((s) => <li key={s.id}><ServicioMiniCard service={s} /></li>)}
        </ul>
      )}
    </div>
  );
}

const MAX_RESENAS_ADELANTO = 3;

/** Mismo acordeón cerrado que `SeccionServicios`, con las reseñas más recientes (el backend ya
 *  las manda ordenadas así). Si hay más de las que caben, un enlace lleva a verlas todas. */
function SeccionResenas({ resenas, providerId, abierta, onToggle }: { resenas: Review[]; providerId: string; abierta: boolean; onToggle: () => void }) {
  if (resenas.length === 0) return null;
  const adelanto = resenas.slice(0, MAX_RESENAS_ADELANTO);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between py-1 text-sm font-bold text-ink-900"
      >
        <span>Reseñas <span className="font-sans font-semibold text-ink-400">({resenas.length})</span></span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', abierta && 'rotate-180')} aria-hidden="true" />
      </button>
      {abierta && (
        <div className="mt-2 animate-fade-in">
          <ul className="divide-y divide-sand-200">
            {adelanto.map((r) => <ReviewItem key={r.id} review={r} showService />)}
          </ul>
          {resenas.length > adelanto.length && (
            <Link to={`/proveedor/${providerId}#resenas`} className="link mt-1 inline-block text-sm">
              Ver las {resenas.length} reseñas
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El CONTENIDO de la ficha de un punto del mapa. No sabe nada del envoltorio que lo contiene:
 * sirve igual dentro de la hoja inferior de móvil que del panel lateral de escritorio.
 *
 * `expandida` es lo que decide si se pide el perfil completo. La hoja móvil lo pone a true solo
 * cuando el usuario la despliega — en la conexión que esta app apunta a servir, no se pide lo que
 * no se está mirando —; el panel lateral, donde sobra sitio y no hay dos alturas, lo pone siempre.
 */
export default function FichaPunto({ punto, tituloId, expandida, onCerrar, onAntesDeNavegar, onVolverALista }: {
  punto: PuntoMapa;
  tituloId: string;
  expandida: boolean;
  onCerrar(): void;
  /** Se llama justo antes de navegar a /proveedor/:id, para soltar la entrada de historial. */
  onAntesDeNavegar(): void;
  /** Ausente = no se llegó desde una lista de celda. Presente = pinta «Volver a la lista». */
  onVolverALista?: () => void;
}) {
  const [perfil, setPerfil] = useState<ProviderPublic | null>(null);
  // Van en la MISMA respuesta que `perfil` (GET /providers/:id ya los incluye: pedirlos aparte
  // sería una segunda vuelta por la red para datos que ya llegaron). Lo que de verdad se difiere
  // al clic es su RENDERIZADO — y con él, la descarga de sus fotos — en `SeccionServicios`.
  const [servicios, setServicios] = useState<ProviderServiceItem[]>([]);
  const [serviciosAbiertos, setServiciosAbiertos] = useState(false);
  const [resenas, setResenas] = useState<Review[]>([]);
  const [resenasAbiertas, setResenasAbiertas] = useState(false);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState('');
  const [reintentos, setReintentos] = useState(0);
  const [reservando, setReservando] = useState(false);
  const toast = useToast();

  // Un punto nuevo empieza siempre con las secciones cerradas: si no, al pasar de un negocio con
  // algo desplegado a otro, el acordeón seguiría abierto mostrando (por un instante) lo del
  // anterior mientras llega la respuesta.
  useEffect(() => { setServiciosAbiertos(false); setResenasAbiertas(false); }, [punto.id]);

  // El id ya pedido. Antes esto se hacía con un efecto que ponía `setPerfil(null)` al cambiar de
  // punto y con `perfil` entre las dependencias del efecto de carga: el resultado era que al pasar
  // de A a B se pedía B DOS veces — una con el perfil de A todavía puesto, y otra en cuanto el
  // reset cambiaba esa dependencia. Con un ref no hay dependencia que cambiar.
  const pedidoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!expandida) return;
    if (pedidoRef.current === punto.id) return;
    pedidoRef.current = punto.id;
    let cancelado = false;
    setCargandoPerfil(true);
    setErrorPerfil('');
    providerApi.getById(punto.id)
      // Sin `.finally()`: `setPerfil` cambia una dependencia de este mismo efecto, así que React
      // lo desmonta (pone `cancelado = true`) en cuanto se aplica — antes de que un `.finally()`
      // aparte llegue a mirar la misma variable. Con `.finally()` eso dejaba `cargandoPerfil` en
      // true para siempre pese a haber cargado bien: apagarlo junto con `setPerfil`, en la misma
      // pasada, evita la ventana entre un microtask y el otro.
      .then((r) => {
        if (cancelado) return;
        setPerfil(r.data.provider);
        setServicios(r.data.services ?? []);
        setResenas(r.data.reviews ?? []);
        setCargandoPerfil(false);
      })
      .catch((err) => {
        if (cancelado) return;
        setErrorPerfil(apiError(err, 'No pudimos cargar la ficha completa.'));
        setCargandoPerfil(false);
      });
    return () => { cancelado = true; };
    // `reintentos` no lo lee el cuerpo: solo está para que "Reintentar" fuerce otra pasada (el
    // manejador borra antes `pedidoRef`, que si no bloquearía el reintento del mismo id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto.id, expandida, reintentos]);

  // Lo que se pinta tiene que ser el perfil DE ESTE punto: entre que se toca otro y llega su
  // respuesta, `perfil` todavía guarda el anterior, y pintarlo mostraría el teléfono de un
  // negocio bajo el nombre de otro.
  const perfilVigente = perfil?.id === punto.id ? perfil : null;
  // `servicios`/`resenas` se guardan en el mismo `.then()` que `perfil`: si uno es del punto
  // vigente, los otros también. Nada que comparar aparte.
  const serviciosVigentes = perfilVigente ? servicios : [];
  const resenasVigentes = perfilVigente ? resenas : [];

  const telefonoContacto = perfilVigente?.whatsapp ?? null;
  const mostrarWhatsapp = Boolean(telefonoContacto) && perfilVigente?.contact_mode !== 'call';
  const mostrarLlamar = Boolean(telefonoContacto) && perfilVigente?.contact_mode !== 'whatsapp';
  const lugar = [perfilVigente?.municipality_name, perfilVigente?.province_name].filter(Boolean).join(', ');

  const compartir = async () => {
    const url = `${window.location.origin}/proveedor/${punto.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: punto.nombre, url }); } catch { /* el usuario cerró el panel de compartir: no es un error */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado');
    } catch {
      toast('No se pudo copiar el enlace', 'error');
    }
  };

  return (
    <div className="relative">
      {/* Flotante y SIEMPRE en el mismo sitio: con o sin portada, cargando o no, el botón de
          cerrar no se mueve. bg-white/90 + backdrop-blur es el mismo recurso que ya usa
          ProviderProfile.tsx para su botón «Explorar» sobre la foto de portada. */}
      <button
        type="button"
        onClick={onCerrar}
        className="absolute -right-1 -top-1 z-10 rounded-xl bg-white/90 p-2 text-ink-500 shadow-sm backdrop-blur hover:bg-white hover:text-ink-700"
        aria-label="Cerrar la ficha"
      >
        <X className="h-5 w-5" />
      </button>

      {onVolverALista && (
        <button type="button" onClick={onVolverALista} className="btn-ghost btn-sm -ml-2 mb-2">
          <ArrowLeft className="h-4 w-4" /> Volver a la lista
        </button>
      )}

      {/* Esqueleto mientras carga, en el MISMO lugar que ocupará la foto real: si solo apareciera
          al terminar la carga, el avatar y el nombre de abajo saltarían hacia abajo de golpe. */}
      {expandida && (cargandoPerfil || perfilVigente) && (
        <div className="-mt-1 mb-4 h-32 w-full overflow-hidden rounded-xl bg-sand-100">
          {perfilVigente ? (
            <CoverImage src={perfilVigente.cover} seed={perfilVigente.categories[0] ?? punto.nombre} alt="" />
          ) : (
            <div className="skeleton h-full w-full" role="status" aria-label="Cargando la ficha completa" />
          )}
        </div>
      )}

      <div className="flex items-start gap-3 pr-9">
        <Avatar name={punto.nombre} size="md" square={punto.tipo === 'negocio'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={tituloId} className="truncate text-lg font-bold text-ink-900">{punto.nombre}</h2>
            {punto.tipo === 'negocio' && <NegocioChip />}
          </div>
          {punto.resumen && <p className="mt-1 line-clamp-2 text-sm text-ink-600">{punto.resumen}</p>}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Link to={`/proveedor/${punto.id}`} onClick={onAntesDeNavegar} className="link text-sm">
          Ver perfil completo
        </Link>
        {/* Accesos rápidos de contacto, condicionados a lo que el perfil de verdad ofrezca: solo
            existen una vez que carga (antes no se sabe si hay teléfono, WhatsApp o agenda). Igual
            criterio que ya usa ContactActions (showWhatsapp/showCall/hasAgenda) — aquí en iconos,
            porque esta fila vive siempre visible, incluso antes de bajar al resto de la ficha. */}
        <div className="-mr-2 flex shrink-0 items-center gap-0.5">
          {mostrarLlamar && telefonoContacto && (
            <a
              href={telLink(telefonoContacto)}
              onClick={() => providerApi.contact(punto.id, 'call')}
              className="rounded-xl p-2 text-ink-500 hover:bg-sand-100 hover:text-ink-800"
              aria-label="Llamar"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          {mostrarWhatsapp && telefonoContacto && (
            <a
              href={whatsappLink(telefonoContacto, 'Hola, vi tu perfil en Encuentrauno y me gustaría consultarte un trabajo.')}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => providerApi.contact(punto.id, 'whatsapp')}
              className="rounded-xl p-2 text-[#25D366] hover:bg-sand-100"
              aria-label="WhatsApp"
            >
              <WhatsAppIcon className="h-4 w-4" />
            </a>
          )}
          {perfilVigente?.has_agenda && (
            <button
              type="button"
              onClick={() => setReservando(true)}
              className="rounded-xl p-2 text-ink-500 hover:bg-sand-100 hover:text-ink-800"
              aria-label="Pedir cita"
            >
              <CalendarPlus className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={compartir} className="rounded-xl p-2 text-ink-500 hover:bg-sand-100 hover:text-ink-800" aria-label="Compartir">
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expandida && (
        <div className="mt-5 border-t border-sand-200 pt-5">
          {errorPerfil && <ErrorState message={errorPerfil} onRetry={() => { pedidoRef.current = null; setReintentos((n) => n + 1); }} />}
          {perfilVigente && !cargandoPerfil && (
            <div className="space-y-4">
              {perfilVigente.description && <p className="text-sm text-ink-700">{perfilVigente.description}</p>}
              {lugar && <p className="text-sm text-ink-500">{lugar}</p>}
              {perfilVigente.horario && <p className="text-sm text-ink-500">Horario: {perfilVigente.horario}</p>}
              {perfilVigente.categories.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {perfilVigente.categories.map((c) => <li key={c} className="badge bg-sand-100 text-ink-700">{c}</li>)}
                </ul>
              )}
              <SeccionServicios
                servicios={serviciosVigentes}
                abierta={serviciosAbiertos}
                onToggle={() => setServiciosAbiertos((v) => !v)}
              />
              {/* La calificación va PEGADA a las reseñas, no arriba con el resto de los datos: es
                  el mismo dato que "lo que dicen los demás" — y ambos, al final del todo. Antes el
                  resumen de estrellas abría la ficha, lo que dejaba la ficha leyéndose como
                  "reseñas primero, qué ofrece después". */}
              <RatingInline rating={perfilVigente.rating} count={perfilVigente.review_count} />
              <SeccionResenas
                resenas={resenasVigentes}
                providerId={punto.id}
                abierta={resenasAbiertas}
                onToggle={() => setResenasAbiertas((v) => !v)}
              />
            </div>
          )}
        </div>
      )}

      {perfilVigente?.has_agenda && (
        <BookingModal open={reservando} onClose={() => setReservando(false)} providerId={punto.id} providerName={punto.nombre} />
      )}
    </div>
  );
}
