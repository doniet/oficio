import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CatalogItem, ProviderPublic, ProviderServiceItem, PuntoMapa, Review } from '@oficio/shared';
import { precioCatalogo, priceFrom, relativeTime, telLink, whatsappLink } from '@oficio/shared';
import { Boton } from './Boton';
import { ModalArticulo, type VendedorCatalogo } from './ModalArticulo';
import { Acordeon, Avatar, BotonCompartir, Estrellas, EstadoError, Insignia, Portada, Valoracion, u } from './ui';
import { useSesion } from '../lib/contexto';
import { urlPerfil } from '../lib/compartir';
import { etiquetaAccesibleVolver, vistaSeccionProductos } from '../lib/productosMapa';
import { RESENAS_POR_PAGINA, tituloServicioResena } from '../lib/resenas';
import { useTasa } from '../lib/tasa';
import { brand, fuentes, ink, sand } from '../lib/tema';

/** Fila compacta de un servicio dentro del acordeón: foto, categoría, título y precio. */
function FilaServicio({ servicio }: { servicio: ProviderServiceItem }) {
  const tasa = useTasa();
  const precio = priceFrom(servicio, tasa);
  return (
    <Pressable
      onPress={() => router.push(`/servicio/${servicio.id}`)}
      accessibilityRole="link"
      accessibilityLabel={servicio.title}
      style={({ pressed }) => [e.fila, pressed && { opacity: 0.9 }]}
    >
      <View style={e.filaFoto}>
        <Portada src={servicio.cover} semilla={servicio.category_slug} icono={servicio.category_icon} tamanoIcono={24} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={e.filaEtiqueta} numberOfLines={1}>{servicio.category_icon} {servicio.category_name}</Text>
        <Text style={e.filaTitulo} numberOfLines={1}>{servicio.title}</Text>
        <Text numberOfLines={1}>
          {precio.prefix ? <Text style={e.menor}>{precio.prefix} </Text> : null}
          <Text style={e.precio}>{precio.amount}</Text>
          {precio.suffix ? <Text style={e.menor}> {precio.suffix}</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
}

/** Cuántas reseñas se adelantan en la hoja. Mismo tope que la web (`SeccionResenas`,
 *  frontend/src/components/mapa/FichaPunto.tsx:152): el resto se ven en el perfil. */
const MAX_RESENAS_ADELANTO = 3;

/** Una reseña del adelanto: quién, cuándo, cuántas estrellas, sobre qué servicio y qué dijo. */
function FilaResena({ resena }: { resena: Review }) {
  const servicio = tituloServicioResena(resena);
  return (
    <View style={e.resena}>
      <Avatar src={resena.client_avatar} nombre={resena.client_name} tamano={36} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={e.resenaCabecera}>
          <Text style={e.resenaNombre} numberOfLines={1}>{resena.client_name}</Text>
          <Text style={u.tenue}>{relativeTime(resena.created_at)}</Text>
        </View>
        <Estrellas valor={resena.rating} tamano={13} />
        {servicio ? <Text style={e.resenaServicio} numberOfLines={1}>{servicio}</Text> : null}
        {resena.comment ? <Text style={u.texto}>{resena.comment}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Las últimas reseñas del proveedor (el backend las manda por `created_at DESC`), con el enlace a
 * verlas todas en el perfil.
 *
 * 🚨 La petición vive en el efecto de MONTAJE de este componente, y este componente es hijo del
 * `Acordeon`, que plegado no monta sus hijos. Por eso desplegar una hoja no pide ninguna reseña:
 * hasta que alguien toca «Reseñas», esta función no se ejecuta. Si la petición se subiera a
 * `FichaCompleta` (o al propio `FichaPunto`), cada hoja que alguien despliegue costaría una vuelta
 * de red por unas reseñas que no pidió ver — y el acordeón dejaría de servir para nada.
 */
function ListaResenas({ proveedorId }: { proveedorId: string }) {
  const { api } = useSesion();
  const [resenas, setResenas] = useState<Review[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setError(false);
    // La primera página basta: de las 10 que trae se pintan 3, y el resto están en el perfil. Las
    // 20 que viajan en `GET /providers/:id` se ignoran a propósito (ver lib/resenas.ts).
    api.resenas.deProveedor(proveedorId, { page: 1, limit: RESENAS_POR_PAGINA })
      .then((d) => {
        if (cancelado) return;
        setResenas(d.reviews);
        setTotal(d.pagination.total);
      })
      .catch(() => {
        if (cancelado) return;
        setError(true);
      });
    return () => { cancelado = true; };
  }, [proveedorId, intento]);

  // Un fallo aquí NO tumba la ficha: el contacto y los servicios siguen arriba, intactos. Lo que se
  // ofrece es reintentar solo esta sección.
  if (error) return <View style={{ marginTop: 8 }}><EstadoError mensaje="No pudimos cargar las reseñas." alReintentar={() => setIntento((n) => n + 1)} /></View>;
  if (!resenas) return <Text style={[u.suave, { marginTop: 8 }]}>Cargando…</Text>;
  if (resenas.length === 0) return <Text style={[u.suave, { marginTop: 8 }]}>Todavía no tiene reseñas.</Text>;

  const adelanto = resenas.slice(0, MAX_RESENAS_ADELANTO);
  return (
    <View style={{ marginTop: 4, gap: 12 }}>
      {adelanto.map((r) => <FilaResena key={r.id} resena={r} />)}
      {total > adelanto.length ? (
        <Pressable onPress={() => router.push(`/proveedor/${proveedorId}`)} accessibilityRole="link" hitSlop={6}>
          <Text style={u.enlace}>Ver las {total} reseñas</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Tarjeta pequeña de un producto: foto o inicial, nombre en 2 líneas y precio. */
function ProductoMini({ item, marcado, alAbrir }: { item: CatalogItem; marcado: boolean; alAbrir: () => void }) {
  const tasa = useTasa();
  const precio = precioCatalogo(item, tasa);
  return (
    <Pressable
      onPress={alAbrir}
      accessibilityRole="button"
      accessibilityLabel={marcado ? `Lo que tocaste: ${item.name}` : item.name}
      accessibilityHint="Ver el detalle del artículo"
      style={({ pressed }) => [e.fila, marcado && e.filaMarcada, !item.available && { opacity: 0.6 }, pressed && { opacity: 0.9 }]}
    >
      <View style={e.filaFoto}>
        <Portada src={item.image} semilla={item.name} icono={item.name.trim().charAt(0).toUpperCase() || '·'} tamanoIcono={24} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {marcado ? <Text style={e.marca}>Lo que tocaste</Text> : null}
        <Text style={e.filaTitulo} numberOfLines={2}>{item.name}</Text>
        <Text numberOfLines={1}>
          {precio.prefijo ? <Text style={e.menor}>{precio.prefijo} </Text> : null}
          <Text style={e.precio}>{precio.cifra}</Text>
          {precio.alt ? <Text style={e.menor}>  {precio.alt}</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Lo que reemplaza a «Servicios» en la pestaña Productos: el negocio solo está en el mapa porque
 * algún artículo suyo coincidió con la búsqueda, así que se enseña de una vez, sin acordeón.
 * Se monta solo con la ficha desplegada, así que la petición no se hace a media altura. El
 * producto marcado NO va aquí: su tarjeta está arriba, fuera de la ficha completa (ver FichaPunto).
 */
function SeccionProductos({ punto, q, marcado, vendedor }: {
  punto: PuntoMapa; q: string; marcado: CatalogItem | null; vendedor: VendedorCatalogo;
}) {
  const { api } = useSesion();
  const [productos, setProductos] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [abierto, setAbierto] = useState<CatalogItem | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    // Sin antirrebote: `q` solo cambia al enviar la búsqueda, y enviarla devuelve la hoja a la lista
    // de productos (explorar.tsx), así que esta sección no ve dos `q` seguidos.
    api.catalogo.deProveedor(punto.id, { q: q || undefined })
      .then((r) => {
        if (cancelado) return;
        setProductos(r.items);
        setTotal(r.total);
        setCargando(false);
      })
      .catch(() => {
        if (cancelado) return;
        setError(true);
        setCargando(false);
      });
    return () => { cancelado = true; };
  }, [punto.id, q, intento]);

  const vista = vistaSeccionProductos({ items: productos, total, marcado, cargando, error });
  if (vista.clase === 'error') return <EstadoError mensaje="No pudimos cargar el catálogo." alReintentar={() => setIntento((n) => n + 1)} />;
  if (vista.clase === 'cargando') return <Text style={u.suave}>Cargando…</Text>;
  if (vista.clase === 'vacia') return <Text style={u.suave}>No encontramos productos de este negocio que coincidan con la búsqueda.</Text>;
  if (vista.clase === 'nada') return null;

  const { otros, cuantos, verTodos } = vista;
  return (
    <View style={{ gap: 8 }}>
      <Text style={u.acordeonTitulo}>Productos ({cuantos})</Text>
      {otros.map((p) => <ProductoMini key={p.id} item={p} marcado={false} alAbrir={() => setAbierto(p)} />)}
      {verTodos ? (
        <Pressable onPress={() => router.push(`/proveedor/${punto.id}`)} accessibilityRole="link" hitSlop={6}>
          <Text style={u.enlace}>Ver los {cuantos} productos</Text>
        </Pressable>
      ) : null}
      {abierto ? <ModalArticulo item={abierto} vendedor={vendedor} alCerrar={() => setAbierto(null)} /> : null}
    </View>
  );
}

/** Ficha completa (rating, descripción, categorías, contacto) — solo se pide al desplegar la hoja. */
function FichaCompleta({ punto, tab, q, productoMarcado, abrirMarcado, alCerrarMarcado }: {
  punto: PuntoMapa; tab?: string; q: string; productoMarcado: CatalogItem | null;
  /** Se tocó la tarjeta del marcado (fuera de aquí): su detalle se abre en cuanto haya perfil,
   *  porque `ModalArticulo` necesita del vendedor lo que solo trae el perfil (`has_chat`). */
  abrirMarcado: boolean;
  alCerrarMarcado(): void;
}) {
  const { usuario, api } = useSesion();
  const [perfil, setPerfil] = useState<ProviderPublic | null>(null);
  // Vienen en la MISMA respuesta que el perfil (GET /providers/:id ya los trae): lo que se difiere
  // no es pedirlos, es RENDERIZARLOS — y con ellos sus fotos — hasta que se abra el acordeón.
  const [servicios, setServicios] = useState<ProviderServiceItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  // Reintentar (tras un error) sin duplicar el efecto de abajo: solo cambia esto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    // El cliente compartido trae su propio tiempo de espera (20 s en `crearCliente`) y no acepta
    // una señal de fuera: lo único que hace falta aquí es no pintar la respuesta de un punto que
    // ya no se está mirando.
    let cancelado = false;
    setPerfil(null);
    setServicios([]);
    setError(false);
    setCargando(true);
    api.proveedores.detalle(punto.id)
      .then((d) => {
        if (cancelado) return;
        setPerfil(d.provider);
        setServicios(d.services ?? []);
        setCargando(false);
      })
      .catch(() => {
        if (cancelado) return;
        setError(true);
        setCargando(false);
      });
    return () => { cancelado = true; };
  }, [punto.id, intento]);

  if (cargando) {
    return <View style={{ paddingVertical: 24, alignItems: 'center' }}><Text style={u.suave}>Cargando…</Text></View>;
  }
  if (error || !perfil) {
    return <EstadoError mensaje="No pudimos cargar la ficha completa." alReintentar={() => setIntento((n) => n + 1)} />;
  }

  const lugar = [perfil.municipality_name, perfil.province_name].filter(Boolean).join(', ');
  const telefono = perfil.whatsapp?.trim() || null;
  const mostrarWhatsapp = !!telefono && perfil.contact_mode !== 'call';
  const mostrarLlamar = !!telefono && perfil.contact_mode !== 'whatsapp';

  function contactar(via: 'whatsapp' | 'call') {
    // Constancia del contacto (habilita la reseña); si falla, no bloquea abrir WhatsApp/llamar.
    if (usuario?.user_type === 'client') api.proveedores.contacto(punto.id, via).catch(() => {});
    const url = via === 'whatsapp' ? whatsappLink(telefono!, `Hola, vi tu perfil en Encuentrauno y me gustaría consultarte un trabajo.`) : telLink(telefono!);
    Linking.openURL(url).catch(() => {});
  }

  const vendedor: VendedorCatalogo = {
    id: perfil.id, nombre: punto.nombre, whatsapp: perfil.whatsapp, contactMode: perfil.contact_mode, hasChat: perfil.has_chat,
  };
  const catalogo = tab === 'productos' ? (
    // `key` por punto: al cambiar de negocio la sección nace de nuevo, sin los productos del anterior.
    <SeccionProductos key={`productos-${punto.id}`} punto={punto} q={q} marcado={productoMarcado} vendedor={vendedor} />
  ) : servicios.length > 0 ? (
    // `key` por punto: al pasar de un negocio con el acordeón abierto a otro, el acordeón
    // vuelve a nacer plegado en vez de enseñar los servicios del anterior.
    <Acordeon key={punto.id} titulo={`Servicios (${servicios.length})`} defaultAbierto={false}>
      <View style={{ gap: 8, marginTop: 4 }}>
        {servicios.map((s) => <FilaServicio key={s.id} servicio={s} />)}
      </View>
    </Acordeon>
  ) : null;

  return (
    <View style={{ gap: 12 }}>
      <Valoracion rating={perfil.rating} count={perfil.review_count} />
      {/* Abierta desde un producto, el resto de lo que coincide va ANTES de la descripción: es lo
          que se vino a ver (lección de la web). El tocado no está aquí: va arriba, fuera. */}
      {productoMarcado ? catalogo : null}
      {perfil.description ? <Text style={u.texto}>{perfil.description}</Text> : null}
      {lugar ? <Text style={u.suave}>{lugar}</Text> : null}
      {perfil.kind === 'negocio' && perfil.horario ? <Text style={u.suave}>Horario: {perfil.horario}</Text> : null}
      {perfil.categories.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {perfil.categories.map((c) => <Insignia key={c} tipo="suave" texto={c} />)}
        </View>
      ) : null}
      {!productoMarcado ? catalogo : null}
      {perfil.review_count > 0 ? (
        // El número del título sale de `review_count` (ya vino con el perfil), no de contar las
        // reseñas: pedirlas para poner el número obligaría a pedirlas plegado, que es justo lo que
        // este acordeón evita. `key` por punto por lo mismo que el de arriba: al cambiar de negocio
        // vuelve a nacer plegado, y con él se desmonta `ListaResenas` y su petición.
        <Acordeon key={`resenas-${punto.id}`} titulo={`Reseñas (${perfil.review_count})`} defaultAbierto={false}>
          <ListaResenas proveedorId={punto.id} />
        </Acordeon>
      ) : null}
      {mostrarWhatsapp || mostrarLlamar ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {mostrarWhatsapp ? <Boton variante="whatsapp" icono="logo-whatsapp" titulo="WhatsApp" onPress={() => contactar('whatsapp')} estilo={{ flex: 1 }} /> : null}
          {mostrarLlamar ? <Boton variante="secundario" icono="call-outline" titulo="Llamar" onPress={() => contactar('call')} estilo={{ flex: 1 }} /> : null}
        </View>
      ) : null}
      {abrirMarcado && productoMarcado ? <ModalArticulo item={productoMarcado} vendedor={vendedor} alCerrar={alCerrarMarcado} /> : null}
    </View>
  );
}

/**
 * Contenido de la hoja cuando lo que se mira es un punto. Va aparte del envoltorio (HojaPunto.tsx)
 * porque la hoja tiene que poder mostrar también otra cosa, igual que en la web.
 *
 * Devuelve un fragmento, no una View: sus hijos son hijos directos del contenedor del scroll de la
 * hoja, que es quien pone el `gap` entre ellos.
 */
export default function FichaPunto({ punto, desplegada, onCerrar, onDesplegar, onVolverALista, tab, q = '', productoMarcado = null, etiquetaVolver }: {
  punto: PuntoMapa;
  /** La hoja está en el anclaje «abierta» (índice 1): solo entonces se pide la ficha completa, igual
   *  que en la web — a «asomada» alcanza con el resumen y el enlace. */
  desplegada: boolean;
  onCerrar(): void;
  /** Lleva la hoja a «abierta». Lo usa la tarjeta del producto marcado, que se ve asomada. */
  onDesplegar?(): void;
  /** Ausente = no se llegó desde la lista de una celda. Presente = sí, y entonces se pinta
   *  «Volver a la lista». Misma señal que ya usa `accionAtras` (lib/hojaPunto.ts) para el botón
   *  físico Atrás: que el manejador exista ES la evidencia de que hay una lista detrás. */
  onVolverALista?(): void;
  /** Con `'productos'` la ficha enseña el catálogo filtrado por `q` en lugar de Servicios. */
  tab?: string;
  q?: string;
  /** El producto tocado en la lista: su tarjeta va arriba del todo, a la vista con la hoja asomada. */
  productoMarcado?: CatalogItem | null;
  /** Texto del botón de volver. Por defecto «Volver a la lista». */
  etiquetaVolver?: string;
}) {
  const verPerfil = useCallback(() => {
    router.push(`/proveedor/${punto.id}`);
  }, [punto.id]);

  // Tocar la tarjeta del marcado pide su detalle; quien lo abre es la ficha completa, cuando tenga
  // el perfil. Se olvida si cambia el producto o si la hoja vuelve a asomarse antes de abrirlo: si
  // no, desplegarla más tarde abriría un detalle que nadie acaba de pedir.
  const [abrirMarcado, setAbrirMarcado] = useState(false);
  useEffect(() => { setAbrirMarcado(false); }, [productoMarcado?.id, punto.id]);
  useEffect(() => { if (!desplegada) setAbrirMarcado(false); }, [desplegada]);
  const tocarMarcado = useCallback(() => {
    setAbrirMarcado(true);
    if (!desplegada) onDesplegar?.();
  }, [desplegada, onDesplegar]);

  return (
    <>
      {onVolverALista ? (
        <Pressable onPress={onVolverALista} hitSlop={8} accessibilityRole="button" accessibilityLabel={etiquetaAccesibleVolver(etiquetaVolver)} style={e.volver}>
          <Ionicons name="arrow-back" size={16} color={brand[700]} />
          <Text style={u.enlace}>{etiquetaVolver ?? 'Volver a la lista'}</Text>
        </Pressable>
      ) : null}

      {/* Lo que se tocó va ANTES de la cabecera y fuera de la ficha completa: con la hoja asomada
          es lo único que cabe, y se pinta con lo que ya trajo la lista, sin esperar a la red (la
          ficha completa solo se pide al desplegar y puede fallar). La sección de productos de
          abajo no lo repite. */}
      {productoMarcado ? <ProductoMini item={productoMarcado} marcado alAbrir={tocarMarcado} /> : null}

      <View style={e.cabecera}>
        <Avatar nombre={punto.nombre} tamano={48} cuadrado={punto.tipo === 'negocio'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text style={e.nombre} numberOfLines={1}>{punto.nombre}</Text>
            {punto.tipo === 'negocio' ? <Insignia tipo="negocio" /> : null}
          </View>
          {punto.resumen ? <Text style={[u.suave, e.resumen]} numberOfLines={2}>{punto.resumen}</Text> : null}
        </View>
        {/* La X se queda donde estaba y sigue cerrando la hoja entera: «Volver a la lista» es otra
            cosa (cambia el contenido de la hoja), no su sustituto. */}
        <Pressable onPress={onCerrar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar la ficha">
          <Ionicons name="close" size={22} color={ink[400]} />
        </Pressable>
      </View>

      <View style={e.filaAcciones}>
        <Pressable onPress={verPerfil} accessibilityRole="link" hitSlop={6}>
          <Text style={u.enlace}>Ver perfil completo</Text>
        </Pressable>
        {/* Comparte la URL WEB del perfil (`urlPerfil`), no un deep link: a quien la reciba sin la
            app instalada le tiene que abrir algo. Cancelar no es un error — lo traga el botón. */}
        <BotonCompartir titulo={punto.nombre} url={urlPerfil(punto.id)} tamano={20} />
      </View>

      {/* La ficha completa se pide a la API solo al desplegar (igual que en la web): a
          "asomada" ya alcanza con el resumen y el enlace de arriba. */}
      {desplegada ? (
        <>
          <View style={e.separador} />
          <FichaCompleta punto={punto} tab={tab} q={q} productoMarcado={productoMarcado}
            abrirMarcado={abrirMarcado} alCerrarMarcado={() => setAbrirMarcado(false)} />
        </>
      ) : null}
    </>
  );
}

const e = StyleSheet.create({
  volver: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nombre: { fontFamily: fuentes.textoNegrita, fontSize: 17, color: ink[900], flexShrink: 1 },
  resumen: { marginTop: 2 },
  filaAcciones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  separador: { height: 1, backgroundColor: sand[200], marginTop: 4 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderColor: sand[200], borderRadius: 12, padding: 8 },
  filaFoto: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: sand[100] },
  filaMarcada: { borderColor: brand[400], backgroundColor: brand[50] },
  marca: { alignSelf: 'flex-start', fontFamily: fuentes.textoNegrita, fontSize: 11, color: brand[700], backgroundColor: brand[100], borderRadius: 999, paddingHorizontal: 8 },
  filaEtiqueta: { fontFamily: fuentes.textoFuerte, fontSize: 12, color: ink[400] },
  filaTitulo: { fontFamily: fuentes.textoNegrita, fontSize: 14, lineHeight: 19, color: ink[900] },
  precio: { fontFamily: fuentes.titulo, fontSize: 14, color: ink[900] },
  menor: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400] },
  resena: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  resenaCabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  resenaNombre: { fontFamily: fuentes.textoNegrita, fontSize: 14, color: ink[900], flexShrink: 1 },
  resenaServicio: { fontFamily: fuentes.textoFuerte, fontSize: 12, color: ink[500] },
});
