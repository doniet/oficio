import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CatalogItem, CatalogPage, ProviderPublic, ProviderServiceItem, PuntoMapa } from '@oficio/shared';
import { precioRenglon, priceFrom, telLink, whatsappLink } from '@oficio/shared';
import { Boton } from './Boton';
import { Acordeon, Avatar, BotonCompartir, EstadoError, Insignia, Portada, Valoracion, u } from './ui';
import { useSesion } from '../lib/contexto';
import { articulosDeCatalogo, montarCatalogo } from '../lib/catalogo';
import { urlPerfil } from '../lib/compartir';
import { useTasa } from '../lib/tasa';
import { brand, fuentes, ink, sand } from '../lib/tema';

/** Mismo tope que la web (MAX_PRODUCTOS_ADELANTO en frontend/src/components/mapa/FichaPunto.tsx:99). */
const MAX_PRODUCTOS_ADELANTO = 6;

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

/**
 * Lo mismo que `catalogPrice` de la web (frontend/src/lib/format.ts:146-150): el precio de un
 * artículo no es el de un servicio — `price_type` es `'fixed' | 'from' | 'ask'`, otra unión — así
 * que `priceFrom` no sirve aquí. `shared/` no tiene todavía un helper de catálogo y este archivo
 * no es dueño de ese paquete: se arma con `precioRenglon`, que es exactamente lo que usa la web.
 */
function precioArticulo(item: CatalogItem, tasa: number) {
  if (item.price_type === 'ask' || item.price == null) return { prefix: '', amount: 'A consultar' };
  const p = precioRenglon(item.price, item.price_currency, tasa);
  return { prefix: item.price_type === 'from' ? 'desde' : '', amount: p.principal };
}

/** Fila de un artículo del catálogo. Sin foto cae a su inicial, igual que `CatalogImage` en la web. */
function FilaArticulo({ item }: { item: CatalogItem }) {
  const tasa = useTasa();
  const precio = precioArticulo(item, tasa);
  return (
    // Los agotados NO se filtran (ver lib/catalogo.ts): se pintan atenuados con su insignia.
    <View style={[e.fila, !item.available && { opacity: 0.6 }]}>
      <View style={e.filaFoto}>
        <Portada src={item.image} semilla={item.name} icono={item.name.trim().charAt(0).toUpperCase() || '·'} tamanoIcono={22} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={e.filaTitulo} numberOfLines={2}>{item.name}</Text>
        <Text numberOfLines={1}>
          {precio.prefix ? <Text style={e.menor}>{precio.prefix} </Text> : null}
          <Text style={e.precio}>{precio.amount}</Text>
        </Text>
        {!item.available ? <Insignia tipo="suave" texto="Agotado" /> : null}
      </View>
    </View>
  );
}

/**
 * Adelanto del catálogo: unos pocos artículos y un enlace al perfil. NO es el catálogo: el
 * buscador, los chips de sección y la paginación son de la pantalla completa (`proveedor/[id]`).
 *
 * Si el perfil no tiene catálogo (`total_all === 0`) no se monta nada — ni un hueco vacío, igual
 * que la web (ProviderCatalog.tsx:69-72). Esa decisión vive en `montarCatalogo`.
 */
function AdelantoCatalogo({ puntoId }: { puntoId: string }) {
  const { api } = useSesion();
  const [pagina, setPagina] = useState<CatalogPage | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    setPagina(undefined);
    api.catalogo.deProveedor(puntoId)
      .then((p) => { if (!cancelado) setPagina(p); })
      // El adelanto es un extra sobre la ficha: si falla, la ficha se queda entera y el catálogo
      // de verdad (con su propio reintento) está a un toque en «Ver perfil completo». Un recuadro
      // de error por algo que el usuario no pidió sería ruido, no información.
      .catch(() => {});
    return () => { cancelado = true; };
  }, [puntoId]);

  if (!pagina || !montarCatalogo(pagina)) return null;
  const adelanto = articulosDeCatalogo([pagina]).slice(0, MAX_PRODUCTOS_ADELANTO);
  if (adelanto.length === 0) return null;

  return (
    <View>
      <Text style={u.acordeonTitulo}>Productos <Text style={e.conteo}>({pagina.total_all})</Text></Text>
      <View style={{ gap: 8, marginTop: 8 }}>
        {adelanto.map((a) => <FilaArticulo key={a.id} item={a} />)}
      </View>
      {pagina.total_all > adelanto.length ? (
        <Pressable onPress={() => router.push(`/proveedor/${puntoId}`)} accessibilityRole="link" hitSlop={6} style={{ marginTop: 8 }}>
          <Text style={u.enlace}>Ver los {pagina.total_all} productos</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Ficha completa (rating, descripción, categorías, contacto) — solo se pide al desplegar la hoja. */
function FichaCompleta({ punto }: { punto: PuntoMapa }) {
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

  return (
    <View style={{ gap: 12 }}>
      <Valoracion rating={perfil.rating} count={perfil.review_count} />
      {perfil.description ? <Text style={u.texto}>{perfil.description}</Text> : null}
      {lugar ? <Text style={u.suave}>{lugar}</Text> : null}
      {perfil.kind === 'negocio' && perfil.horario ? <Text style={u.suave}>Horario: {perfil.horario}</Text> : null}
      {perfil.categories.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {perfil.categories.map((c) => <Insignia key={c} tipo="suave" texto={c} />)}
        </View>
      ) : null}
      {servicios.length > 0 ? (
        // `key` por punto: al pasar de un negocio con el acordeón abierto a otro, el acordeón
        // vuelve a nacer plegado en vez de enseñar los servicios del anterior (lo mismo que la web
        // consigue reseteando `serviciosAbiertos` en un efecto por `punto.id`).
        <Acordeon key={punto.id} titulo={`Servicios (${servicios.length})`} defaultAbierto={false}>
          <View style={{ gap: 8, marginTop: 4 }}>
            {servicios.map((s) => <FilaServicio key={s.id} servicio={s} />)}
          </View>
        </Acordeon>
      ) : null}
      <AdelantoCatalogo puntoId={punto.id} />
      {mostrarWhatsapp || mostrarLlamar ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {mostrarWhatsapp ? <Boton variante="whatsapp" icono="logo-whatsapp" titulo="WhatsApp" onPress={() => contactar('whatsapp')} estilo={{ flex: 1 }} /> : null}
          {mostrarLlamar ? <Boton variante="secundario" icono="call-outline" titulo="Llamar" onPress={() => contactar('call')} estilo={{ flex: 1 }} /> : null}
        </View>
      ) : null}
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
export default function FichaPunto({ punto, desplegada, onCerrar, onVolverALista }: {
  punto: PuntoMapa;
  /** La hoja está en el anclaje «abierta» (índice 1): solo entonces se pide la ficha completa, igual
   *  que en la web — a «asomada» alcanza con el resumen y el enlace. */
  desplegada: boolean;
  onCerrar(): void;
  /** Ausente = no se llegó desde la lista de una celda. Presente = sí, y entonces se pinta
   *  «Volver a la lista». Misma señal que ya usa `accionAtras` (lib/hojaPunto.ts) para el botón
   *  físico Atrás: que el manejador exista ES la evidencia de que hay una lista detrás. */
  onVolverALista?(): void;
}) {
  const verPerfil = useCallback(() => {
    router.push(`/proveedor/${punto.id}`);
  }, [punto.id]);

  return (
    <>
      {onVolverALista ? (
        <Pressable onPress={onVolverALista} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver a la lista" style={e.volver}>
          <Ionicons name="arrow-back" size={16} color={brand[700]} />
          <Text style={u.enlace}>Volver a la lista</Text>
        </Pressable>
      ) : null}

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
          <FichaCompleta punto={punto} />
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
  filaEtiqueta: { fontFamily: fuentes.textoFuerte, fontSize: 12, color: ink[400] },
  filaTitulo: { fontFamily: fuentes.textoNegrita, fontSize: 14, lineHeight: 19, color: ink[900] },
  precio: { fontFamily: fuentes.titulo, fontSize: 14, color: ink[900] },
  menor: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400] },
  conteo: { fontFamily: fuentes.textoFuerte, fontSize: 14, color: ink[400] },
});
