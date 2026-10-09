import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, ChevronDown, Phone, Share2, X } from 'lucide-react';
import { apiError, catalogApi, providerApi } from '../../services/api';
import { telLink, whatsappLink, priceFrom } from '../../lib/format';
import { useTasa } from '../../hooks/useTasa';
import { useToast } from '../../hooks/useToast';
import { Avatar, cn, CoverImage, ErrorState, RatingInline } from '../ui';
import { NegocioChip } from '../cards';
import { ReviewItem } from '../ReviewList';
import { WhatsAppIcon } from '../ContactActions';
import BookingModal from '../BookingModal';
import { CatalogImage, PrecioArticulo } from '../catalog/CatalogCard';
import CatalogItemModal, { type VendedorCatalogo } from '../catalog/CatalogItemModal';
import type { CatalogItem, ProviderPublic, ProviderServiceItem, PuntoMapa, Review } from '../../types';

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

/**
 * Tarjeta compacta de un artículo del catálogo: foto, nombre y precio. A diferencia de
 * `ServicioMiniCard` no enlaza a una página propia —los artículos no tienen una—, abre el mismo
 * modal de detalle que ya usa la búsqueda general (`CatalogItemModal`), con su botón de contacto.
 */
function ProductoMiniCard({ item, onAbrir, marcado = false }: { item: CatalogItem; onAbrir: () => void; marcado?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  // En móvil la hoja asoma baja y la tarjeta marcada puede quedar bajo el pliegue: se trae a la
  // vista una vez, al aparecer. `?.` porque jsdom no implementa scrollIntoView.
  useEffect(() => {
    if (marcado) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [marcado]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onAbrir}
      className={cn(
        'group flex w-full gap-3 rounded-xl border p-2 text-left transition hover:border-brand-300 hover:shadow-card',
        marcado ? 'border-brand-400 bg-brand-50' : 'border-sand-200',
        !item.available && 'opacity-60',
      )}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-sand-100">
        <CatalogImage item={item} />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        {marcado && <span className="mb-0.5 inline-block rounded-full bg-brand-100 px-2 text-[11px] font-bold text-brand-700">Lo que tocaste</span>}
        <h4 className="line-clamp-2 text-sm font-bold leading-snug text-ink-900 group-hover:text-brand-700">{item.name}</h4>
        <div className="mt-0.5"><PrecioArticulo item={item} /></div>
      </div>
    </button>
  );
}

const MAX_PRODUCTOS_ADELANTO = 6;

/**
 * Lo que reemplaza a «Servicios» cuando se busca en la pestaña Productos: el punto solo aparece
 * en el mapa porque ALGÚN artículo suyo coincidió con la búsqueda (el filtro ya lo aplicó el
 * servidor en `/api/mapa`), así que aquí se enseña de una vez, sin acordeón de por medio — es
 * justo lo que se tocó el punto para ver. Las fotos siguen cargando perezosas (`CatalogImage`
 * usa `loading="lazy"`), que es lo que de verdad pesa en una conexión lenta.
 */
function SeccionProductos({ productos, total, cargando, error, providerId, onReintentar, onAbrirProducto, marcadoId }: {
  productos: CatalogItem[];
  marcadoId?: string;
  total: number;
  cargando: boolean;
  error: string;
  providerId: string;
  onReintentar: () => void;
  onAbrirProducto: (item: CatalogItem) => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onReintentar} />;
  if (cargando) {
    return (
      <div className="space-y-2" role="status" aria-label="Buscando productos">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-sand-200 p-2">
            <div className="skeleton h-16 w-16 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2 py-1">
              <div className="skeleton h-4 w-4/5 rounded" />
              <div className="skeleton h-4 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (productos.length === 0) {
    return <p className="text-sm text-ink-500">No encontramos productos de este negocio que coincidan con la búsqueda.</p>;
  }
  const adelanto = productos.slice(0, MAX_PRODUCTOS_ADELANTO);
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink-900">Productos <span className="font-sans font-semibold text-ink-400">({total})</span></p>
      <ul className="space-y-2">
        {adelanto.map((p) => <li key={p.id}><ProductoMiniCard item={p} onAbrir={() => onAbrirProducto(p)} marcado={p.id === marcadoId} /></li>)}
      </ul>
      {total > adelanto.length && (
        <Link to={`/proveedor/${providerId}#catalogo`} className="link mt-2 inline-block text-sm">
          Ver los {total} productos
        </Link>
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
export default function FichaPunto({ punto, tituloId, expandida, tab = 'servicios', q = '', onCerrar, onAntesDeNavegar, onVolverALista, productoMarcado, etiquetaVolver }: {
  punto: PuntoMapa;
  tituloId: string;
  expandida: boolean;
  /** Pestaña activa en /explorar. Con 'productos', lo de abajo de "Ver perfil completo" cambia de
   *  Servicios al catálogo filtrado — ver `SeccionProductos`. */
  tab?: string;
  /** El texto de búsqueda activo, para filtrar ESE catálogo con el mismo criterio. */
  q?: string;
  onCerrar(): void;
  /** Se llama justo antes de navegar a /proveedor/:id, para soltar la entrada de historial. */
  onAntesDeNavegar(): void;
  /** Ausente = no se llegó desde una lista. Presente = pinta el botón de volver (a la lista de una celda o a la de productos). */
  onVolverALista?: () => void;
  /** El producto que se tocó en la lista de productos del mapa: va primero y marcado. */
  productoMarcado?: CatalogItem | null;
  /** Texto del botón de volver. Por defecto «Volver a la lista» (la de una celda). */
  etiquetaVolver?: string;
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
  // El catálogo, aparte: a diferencia de servicios/reseñas no viene en GET /providers/:id, y hace
  // falta volver a pedirlo cada vez que `q` cambia (el usuario puede seguir escribiendo con la
  // ficha ya abierta) — nada que ver con el ciclo de vida del perfil de arriba.
  const [productos, setProductos] = useState<CatalogItem[]>([]);
  const [totalProductos, setTotalProductos] = useState(0);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [errorProductos, setErrorProductos] = useState('');
  const [reintentosProductos, setReintentosProductos] = useState(0);
  const [productoAbierto, setProductoAbierto] = useState<CatalogItem | null>(null);
  const toast = useToast();

  // Un punto nuevo empieza siempre con las secciones cerradas: si no, al pasar de un negocio con
  // algo desplegado a otro, el acordeón seguiría abierto mostrando (por un instante) lo del
  // anterior mientras llega la respuesta.
  useEffect(() => {
    setServiciosAbiertos(false);
    setResenasAbiertas(false);
    setProductos([]);
    setTotalProductos(0);
    setErrorProductos('');
  }, [punto.id]);

  useEffect(() => {
    if (tab !== 'productos' || !expandida) return;
    let cancelado = false;
    setCargandoProductos(true);
    setErrorProductos('');
    // Antirrebote propio: `q` cambia con cada tecla mientras esta ficha sigue abierta (el usuario
    // sigue escribiendo en el buscador del mapa), y sin esto cada tecla dispararía su petición.
    // Mismo valor que usa `usarMapa` para el mismo gesto (ANTIRREBOTE_TEXTO_MS).
    const temporizador = setTimeout(() => {
      catalogApi.ofProvider(punto.id, { q: q || undefined })
        .then((r) => {
          if (cancelado) return;
          setProductos(r.data.items);
          setTotalProductos(r.data.total);
          setCargandoProductos(false);
        })
        .catch((err) => {
          if (cancelado) return;
          setErrorProductos(apiError(err, 'No pudimos cargar el catálogo.'));
          setCargandoProductos(false);
        });
    }, 300);
    return () => { cancelado = true; clearTimeout(temporizador); };
  }, [punto.id, tab, q, expandida, reintentosProductos]);

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

  // Para el modal de detalle de un artículo (CatalogItemModal, el mismo que ya usa la búsqueda
  // general): necesita saber CÓMO contactar al dueño, no solo su nombre.
  const vendedorCatalogo: VendedorCatalogo | null = perfilVigente ? {
    id: punto.id,
    name: punto.nombre,
    whatsapp: perfilVigente.whatsapp,
    contactMode: perfilVigente.contact_mode,
    hasChat: perfilVigente.has_chat,
  } : null;

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

  // El tocado va primero aunque el catálogo filtrado no lo traiga: si la búsqueda coincidió por el
  // nombre del negocio, /catalog/provider/:id?q= (que solo mira el artículo) no lo devuelve.
  const productosVistos = productoMarcado
    ? [productoMarcado, ...productos.filter((p) => p.id !== productoMarcado.id)]
    : productos;

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
          <ArrowLeft className="h-4 w-4" /> {etiquetaVolver ?? 'Volver a la lista'}
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
              {tab === 'productos' ? (
                <SeccionProductos
                  productos={productosVistos}
                  total={Math.max(totalProductos, productosVistos.length)}
                  marcadoId={productoMarcado?.id}
                  cargando={cargandoProductos}
                  error={errorProductos}
                  providerId={punto.id}
                  onReintentar={() => setReintentosProductos((n) => n + 1)}
                  onAbrirProducto={setProductoAbierto}
                />
              ) : (
                <SeccionServicios
                  servicios={serviciosVigentes}
                  abierta={serviciosAbiertos}
                  onToggle={() => setServiciosAbiertos((v) => !v)}
                />
              )}
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

      <CatalogItemModal item={productoAbierto} vendedor={vendedorCatalogo} onClose={() => setProductoAbierto(null)} profileLink />
    </div>
  );
}
