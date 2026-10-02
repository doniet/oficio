import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  CatalogItem, ErrorApi, esquemaMensaje, nombreVisible, precioCatalogo, priceFrom,
  ProviderServiceItem, relativeTime, Review,
} from '@oficio/shared';
import { Boton } from '../../src/componentes/Boton';
import { Campo } from '../../src/componentes/Campo';
import { ModalArticulo, VendedorCatalogo } from '../../src/componentes/ModalArticulo';
import {
  Aviso, Avatar, BotonCompartir, Chip, Esqueleto, EstadoError, EstadoVacio, Estrellas, Insignia, Portada,
  Tarjeta, u, Valoracion,
} from '../../src/componentes/ui';
import { ANTIRREBOTE_BUSQUEDA_MS, articulosDeCatalogo, montarCatalogo, siguientePagina } from '../../src/lib/catalogo';
import { RESENAS_POR_PAGINA, resumenEstrellas, siguientePaginaResenas, tituloServicioResena } from '../../src/lib/resenas';
import {
  contactoPerfil, etiquetaBarraResenas, etiquetaConteoCatalogo, MENSAJE_INICIAL, plural, zonasPorProvincia,
} from '../../src/lib/perfil';
import { urlPerfil } from '../../src/lib/compartir';
import { requiereSesion, useSesion } from '../../src/lib/contexto';
import { useTasa } from '../../src/lib/tasa';
import { ambar, fuentes, ink, paper, panel, sand } from '../../src/lib/tema';

/** Cifra de un artículo del catálogo: «A consultar», o la cifra con «desde» cuando el precio es un mínimo. */
function FilaServicio({ s }: { s: ProviderServiceItem }) {
  const tasa = useTasa();
  const precio = priceFrom(s, tasa);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={s.title}
      onPress={() => router.push(`/servicio/${s.id}`)}
      style={({ pressed }) => [u.tarjeta, e.filaServicio, pressed && { opacity: 0.92 }]}
    >
      <View style={e.filaServicioFoto}>
        <Portada src={s.cover} semilla={s.category_slug} icono={s.category_icon} tamanoIcono={34} />
      </View>
      <View style={e.filaServicioCuerpo}>
        <Text style={u.tenue} numberOfLines={1}>{s.category_icon} {s.category_name}</Text>
        <Text style={e.filaServicioTitulo} numberOfLines={2}>{s.title}</Text>
        <Text numberOfLines={1} style={{ marginTop: 8 }}>
          {precio.prefix ? <Text style={e.menor}>{precio.prefix} </Text> : null}
          <Text style={e.precio}>{precio.amount}</Text>
          {precio.suffix ? <Text style={e.menor}> {precio.suffix}</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
}

function TarjetaArticulo({ item, alAbrir }: { item: CatalogItem; alAbrir: () => void }) {
  const tasa = useTasa();
  const precio = precioCatalogo(item, tasa);
  return (
    // Agotado no se esconde: se atenúa y lleva su insignia, igual que la web (CatalogCard.tsx:47,51).
    // Se toca para ver el detalle: la `description` del artículo no cabe en la tarjeta y sin esto no
    // se alcanza desde ningún sitio de la app.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      accessibilityHint="Ver el detalle del artículo"
      onPress={alAbrir}
      style={({ pressed }) => [u.tarjeta, e.articulo, !item.available && { opacity: 0.6 }, pressed && { opacity: 0.92 }]}
    >
      <View style={e.articuloFoto}>
        {/* Sin foto cae a la inicial del nombre sobre el panel de categoría, como la web. */}
        <Portada src={item.image} semilla={item.name} icono={item.name.trim().charAt(0).toUpperCase() || '·'} tamanoIcono={44} />
        {!item.available ? (
          <View style={e.articuloAgotado}>
            <Text style={[u.badgeTexto, { color: '#ffffff' }]}>Agotado</Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: 12, gap: 8, flex: 1 }}>
        <Text style={e.articuloNombre} numberOfLines={2}>{item.name}</Text>
        <View style={{ marginTop: 'auto' }}>
          <Text numberOfLines={1}>
            {precio.prefijo ? <Text style={e.menor}>{precio.prefijo} </Text> : null}
            <Text style={e.articuloPrecio}>{precio.cifra}</Text>
          </Text>
          {precio.alt ? <Text style={[e.menor, { marginTop: 2 }]}>{precio.alt}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Catálogo del perfil: consulta propia, independiente de la del perfil. Si falla, esta sección
 * enseña su error y reintenta sola — la pantalla sigue en pie.
 */
function SeccionCatalogo({ vendedor }: { vendedor: VendedorCatalogo }) {
  const { api } = useSesion();
  const id = vendedor.id;
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [seccion, setSeccion] = useState('');
  const [abierto, setAbierto] = useState<CatalogItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), ANTIRREBOTE_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const consulta = useInfiniteQuery({
    queryKey: ['catalogo', id, busqueda, seccion],
    queryFn: ({ pageParam }) => api.catalogo.deProveedor(id, { q: busqueda || undefined, section: seccion || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: siguientePagina,
    // Al cambiar la búsqueda o la sección cambia la clave, y sin esto la sección entera volvería a
    // «cargando»: el buscador se desmontaría en cada tecleo y el usuario perdería el foco. Con la
    // página anterior en pie, la rejilla solo se atenúa — lo mismo que hace la web.
    placeholderData: keepPreviousData,
  });

  const primera = consulta.data?.pages[0];
  const articulos = articulosDeCatalogo(consulta.data?.pages);

  // Mientras la primera página viene NO se reserva altura, al contrario que las reseñas: aquí
  // todavía no se sabe si hay catálogo, y la mayoría de perfiles no tiene (Gratis no tiene nunca).
  // Un esqueleto de título + cuatro tarjetas que luego desaparece al llegar `total_all === 0` sube
  // ~300 px todo lo de abajo: provocaba el salto que pretendía evitar. La web lo razona igual
  // (ProviderCatalog.tsx:69-71). Las reseñas sí lo reservan porque esa sección se monta siempre.

  // El error se mira ANTES de decidir si la sección se monta: sin primera página no se sabe si el
  // perfil tiene catálogo, y callarse dejaría la sección en blanco sin que nadie pueda reintentar.
  if (consulta.isError && !primera) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={u.h3}>Catálogo</Text>
        <EstadoError
          mensaje={consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar el catálogo.'}
          alReintentar={() => consulta.refetch()}
        />
      </View>
    );
  }

  if (!montarCatalogo(primera)) return null;
  const pagina = primera!;

  const filtrando = Boolean(busqueda || seccion);
  const restantes = pagina.total - articulos.length;
  const atenuado = consulta.isFetching && !consulta.isFetchingNextPage;
  // `pagina` es la página de la clave ANTERIOR mientras `isPlaceholderData` esté puesto, así que su
  // `total` no es el del filtro que se está aplicando: la etiqueta no canta cifra hasta que lo sea.
  const etiquetaConteo = etiquetaConteoCatalogo({ filtrando, cargando: consulta.isPlaceholderData, total: pagina.total });

  return (
    <View style={{ gap: 12 }}>
      <Text style={u.h3}>Catálogo <Text style={e.cuenta}>({pagina.total_all})</Text></Text>

      {pagina.total_all > 8 ? (
        <Campo etiqueta="Buscar en el catálogo" value={texto} onChangeText={setTexto} placeholder="Nombre del artículo…" autoCorrect={false} />
      ) : null}

      {/* `sections` son las del catálogo ENTERO, no las del filtro: el backend las calcula aparte. */}
      {pagina.sections.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !seccion }} onPress={() => setSeccion('')}>
            <Chip texto="Todo" activo={!seccion} pequeno />
          </Pressable>
          {pagina.sections.map((s) => (
            <Pressable
              key={s.name}
              accessibilityRole="button"
              accessibilityState={{ selected: seccion === s.name }}
              onPress={() => setSeccion(seccion === s.name ? '' : s.name)}
            >
              <Chip texto={`${s.name} ${s.count}`} activo={seccion === s.name} pequeno />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {etiquetaConteo ? (
        <Text style={u.suave} accessibilityLiveRegion="polite">{etiquetaConteo}</Text>
      ) : null}

      {/* Fallar con páginas ya en pantalla no borra lo que se ve: se avisa y el botón sigue ahí. */}
      {consulta.isError ? (
        <Aviso tono="error">{consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar más artículos.'}</Aviso>
      ) : null}

      {articulos.length === 0 ? (
        <EstadoVacio
          icono="search-outline"
          titulo="Nada coincide con tu búsqueda"
          accion={<Boton titulo="Ver todo el catálogo" variante="secundario" onPress={() => { setTexto(''); setBusqueda(''); setSeccion(''); }} />}
        />
      ) : (
        <>
          <View style={[e.rejilla, atenuado && { opacity: 0.5 }]} aria-busy={atenuado}>
            {articulos.map((it) => <TarjetaArticulo key={it.id} item={it} alAbrir={() => setAbierto(it)} />)}
          </View>
          {consulta.hasNextPage ? (
            // Fallar aquí deja la lista como está y el botón en su sitio: volver a tocarlo reintenta.
            <Boton
              titulo={restantes > 0 ? `Ver más (${restantes})` : 'Ver más'}
              variante="secundario"
              cargando={consulta.isFetchingNextPage}
              onPress={() => consulta.fetchNextPage()}
            />
          ) : null}
        </>
      )}

      {/* Solo se monta con un artículo abierto: así el formulario de dentro nace limpio cada vez. */}
      {abierto ? <ModalArticulo item={abierto} vendedor={vendedor} alCerrar={() => setAbierto(null)} /> : null}
    </View>
  );
}

function FilaResena({ r }: { r: Review }) {
  const servicio = tituloServicioResena(r);
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Avatar src={r.client_avatar} nombre={r.client_name} tamano={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={e.resenaCabeza}>
          <Text style={[e.resenaNombre, { flexShrink: 1 }]} numberOfLines={1}>{r.client_name}</Text>
          <Text style={[u.tenue, { fontSize: 12 }]}>{relativeTime(r.created_at)}</Text>
        </View>
        <View style={{ marginTop: 4 }}><Estrellas valor={r.rating} /></View>
        {servicio ? <Text style={[u.tenue, { marginTop: 6, fontFamily: fuentes.textoMedio }]} numberOfLines={1}>{servicio}</Text> : null}
        {r.comment ? <Text style={[u.texto, { marginTop: 8 }]}>{r.comment}</Text> : null}
      </View>
    </View>
  );
}

function ResumenEstrellas({ rating, count, distribution }: { rating: number; count: number; distribution: { rating: number; count: number }[] }) {
  return (
    <View style={e.resumen}>
      <View style={{ alignItems: 'center' }}>
        <Text style={e.resumenNota}>{rating.toFixed(1)}</Text>
        <View style={{ marginTop: 8 }}><Estrellas valor={rating} tamano={16} /></View>
        <Text style={[u.tenue, { fontSize: 12, marginTop: 4 }]}>{plural(count, 'reseña', 'reseñas')}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        {resumenEstrellas(distribution).map((fila) => (
          // La fila entera es UN elemento accesible con su etiqueta: así el «5» y el «40 %» que se
          // ven quedan plegados dentro en vez de leerse como dos números sueltos sin contexto.
          <View key={fila.rating} style={e.barraFila} accessible accessibilityLabel={etiquetaBarraResenas(fila)}>
            <Text style={e.barraValor}>{fila.rating}</Text>
            <View style={e.barra}>
              <View style={[e.barraRelleno, { width: `${fila.porcentaje}%` }]} />
            </View>
            <Text style={e.barraPct}>{fila.porcentaje}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Reseñas del perfil: su propia consulta paginada (`GET /reviews/provider/:id`), independiente de
 * la del perfil. Las 20 reseñas que `GET /providers/:id` trae en `reviews` NO se usan: no paginan y
 * mezclarlas duplicaría filas en la primera página (ver el aviso de `src/lib/resenas.ts`). De esa
 * respuesta solo se aprovecha `distribution`, para el resumen.
 */
function SeccionResenas({ id, rating, count, distribution }: { id: string; rating: number; count: number; distribution: { rating: number; count: number }[] }) {
  const { api } = useSesion();
  const consulta = useInfiniteQuery({
    queryKey: ['resenas', id],
    queryFn: ({ pageParam }) => api.resenas.deProveedor(id, { page: pageParam, limit: RESENAS_POR_PAGINA }),
    initialPageParam: 1,
    getNextPageParam: (ultima) => siguientePaginaResenas(ultima.pagination),
  });

  const resenas = consulta.data?.pages.flatMap((p) => p.reviews) ?? [];
  const hayDatos = Boolean(consulta.data);

  return (
    <Tarjeta estilo={{ padding: 20, gap: 20 }}>
      <Text style={u.h3}>Reseñas</Text>
      {count > 0 ? <ResumenEstrellas rating={rating} count={count} distribution={distribution} /> : null}

      {/* Fallar con reseñas ya en pantalla no las borra: se avisa y el botón «Ver más» sigue ahí
          para reintentar — el mismo trato que el catálogo. Sin esto, tocar «Ver más reseñas» y que
          fallara dejaba de cargar el botón y no decía nada. */}
      {consulta.isError && hayDatos ? (
        <Aviso tono="error">{consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar más reseñas.'}</Aviso>
      ) : null}

      {consulta.isPending ? (
        // Igual que el catálogo: altura reservada para que la pantalla no salte al llegar los datos.
        <View style={{ gap: 20 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
              <Esqueleto estilo={{ width: 36, height: 36, borderRadius: 18 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <Esqueleto estilo={{ height: 14, width: '45%' }} />
                <Esqueleto estilo={{ height: 14, width: '80%' }} />
              </View>
            </View>
          ))}
        </View>
      ) : consulta.isError && !hayDatos ? (
        <EstadoError
          mensaje={consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar las reseñas.'}
          alReintentar={() => consulta.refetch()}
        />
      ) : resenas.length === 0 ? (
        <Text style={[u.tenue, { textAlign: 'center', paddingVertical: 16 }]}>
          Todavía no tiene reseñas. Los clientes que lo contacten por WhatsApp, llamada, chat o cita podrán valorarlo.
        </Text>
      ) : (
        <View>
          {resenas.map((r, i) => (
            <View key={r.id} style={i > 0 ? e.separador : undefined}><FilaResena r={r} /></View>
          ))}
          {consulta.hasNextPage ? (
            <View style={{ marginTop: 20 }}>
              <Boton titulo="Ver más reseñas" variante="secundario" cargando={consulta.isFetchingNextPage} onPress={() => consulta.fetchNextPage()} />
            </View>
          ) : null}
        </View>
      )}
    </Tarjeta>
  );
}

export default function Proveedor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, usuario } = useSesion();
  const consulta = useQuery({ queryKey: ['proveedor', id], queryFn: () => api.proveedores.detalle(id) });
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string>();
  // Aparte de `error`: ese alimenta el error del Campo del formulario, y un fallo al abrir Telegram
  // no es un error de lo que el usuario escribió.
  const [errorEnlace, setErrorEnlace] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  if (consulta.isLoading) {
    return <View style={[e.raiz, u.centro]}><Text style={u.suave}>Cargando…</Text></View>;
  }

  if (consulta.isError || !consulta.data) {
    const noExiste = consulta.error instanceof ErrorApi && consulta.error.status === 404;
    return (
      <View style={[e.raiz, { padding: 16, paddingTop: 24 }]}>
        {noExiste ? (
          <EstadoVacio
            icono="person-outline"
            titulo="Este perfil no está disponible"
            texto="Puede que el profesional haya desactivado su cuenta."
            accion={<Boton titulo="Ver otros profesionales" onPress={() => router.navigate('/explorar')} />}
          />
        ) : (
          <EstadoError
            mensaje={consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar el perfil.'}
            alReintentar={() => consulta.refetch()}
          />
        )}
      </View>
    );
  }

  const { provider, services, serviceAreas, distribution } = consulta.data;
  const nombre = nombreVisible(provider);
  const lugar = [provider.municipality_name, provider.province_name].filter(Boolean).join(', ');
  const zonas = zonasPorProvincia(serviceAreas);

  // Ninguna regla de plan vive aquí: el backend ya decidió si hay portada, catálogo o chat. La
  // pantalla solo reacciona a lo que viene.
  const { chat, whatsapp, llamar, telegram, correo, sinTelefono, sinContacto } = contactoPerfil(provider, usuario);
  const vendedor: VendedorCatalogo = {
    id: provider.id, nombre, whatsapp: provider.whatsapp, contactMode: provider.contact_mode, hasChat: provider.has_chat,
  };

  function abrirEnlace(url: string, que: 'Telegram' | 'el correo') {
    Linking.openURL(url).catch(() => setErrorEnlace(`No se pudo abrir ${que}.`));
  }

  function abrirExterno(url: string, via: 'whatsapp' | 'call') {
    // Constancia del contacto (sirve para poder reseñar). Si falla, no importa: lo que importa es contactar.
    if (usuario?.user_type === 'client') api.proveedores.contacto(provider.id, via).catch(() => {});
    Linking.openURL(url).catch(() => setError(via === 'call' ? 'No se pudo abrir el teléfono.' : 'No se pudo abrir WhatsApp. ¿Lo tienes instalado?'));
  }

  function escribir() {
    if (!requiereSesion(router, usuario, `/proveedor/${id}`)) return;
    setMensaje(MENSAJE_INICIAL);
    setError(undefined);
    setAbierto(true);
  }

  async function enviarSolicitud() {
    const d = esquemaMensaje.safeParse({ content: mensaje });
    if (!d.success) return setError(d.error.issues[0].message);
    setEnviando(true);
    setError(undefined);
    try {
      const { conversation } = await api.conversaciones.crear({ provider_id: provider.id, initial_message: d.data.content });
      router.replace(`/conversacion/${conversation.id}`);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={e.raiz} edges={['bottom']}>
      <Stack.Screen options={{ headerRight: () => <BotonCompartir titulo={nombre} url={urlPerfil(provider.id)} /> }} />
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.portada}>
          <Portada src={provider.cover} semilla={provider.categories[0] ?? nombre} tamanoIcono={56} />
        </View>

        <View style={e.cabecera}>
          {/* Solo el avatar invade la portada, como en la web: lleva su propio borde de papel. */}
          <Avatar src={provider.avatar_url} nombre={nombre} tamano={88} cuadrado estilo={e.avatar} />
          <View style={{ gap: 6 }}>
            <View style={e.filaNombre}>
              <Text style={[u.h1, { flexShrink: 1 }]}>{nombre}</Text>
              {provider.kind === 'negocio' ? <Insignia tipo="negocio" /> : null}
            </View>
            {provider.business_name ? <Text style={u.suave}>{provider.owner_name}</Text> : null}
            <View style={e.meta}>
              <Valoracion rating={provider.rating} count={provider.review_count} />
              {lugar ? (
                <View style={u.fila}>
                  <Ionicons name="location-outline" size={15} color={ink[500]} />
                  <Text style={u.suave}>{lugar}</Text>
                </View>
              ) : null}
              {provider.years_experience > 0 ? (
                <View style={u.fila}>
                  <Ionicons name="briefcase-outline" size={15} color={ink[500]} />
                  <Text style={u.suave}>{provider.years_experience} años de oficio</Text>
                </View>
              ) : null}
              {provider.kind === 'negocio' && provider.horario ? (
                <View style={[u.fila, { alignItems: 'flex-start' }]}>
                  <Ionicons name="time-outline" size={15} color={ink[500]} style={{ marginTop: 2 }} />
                  <Text style={[u.suave, { flexShrink: 1 }]}>{provider.horario}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Text style={u.h3}>Sobre {provider.business_name ? 'el negocio' : 'mí'}</Text>
          {provider.description
            ? <Text style={u.texto}>{provider.description}</Text>
            : <Text style={[u.texto, { color: ink[400] }]}>Este profesional aún no ha escrito una presentación.</Text>}
          {provider.categories.length > 0 ? (
            <View style={e.chips} accessibilityLabel="Especialidades">
              {provider.categories.map((c) => <Chip key={c} texto={c} pequeno />)}
            </View>
          ) : null}
        </View>

        {provider.gallery?.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={u.h3}>Fotos {provider.kind === 'negocio' ? 'del negocio' : 'de mis trabajos'}</Text>
            <View style={e.galeria}>
              {provider.gallery.map((src, i) => (
                <View key={`${src}-${i}`} style={e.galeriaItem} accessibilityLabel={`${nombre} — foto ${i + 1}`}>
                  <View style={e.galeriaFoto}>
                    <Portada src={src} semilla={nombre} icono="📷" tamanoIcono={28} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {provider.address ? (
          <View style={{ gap: 12 }}>
            <Text style={u.h3}>Dónde {provider.kind === 'negocio' ? 'estamos' : 'estoy'}</Text>
            {/* Sin mapa a propósito: un segundo MapLibre dentro de un ScrollView se pelea por los
                gestos con el scroll. La dirección es lo que hace falta para llegar. */}
            <View style={[u.fila, { alignItems: 'flex-start' }]}>
              <Ionicons name="location-outline" size={16} color={ink[400]} style={{ marginTop: 3 }} />
              <Text style={[u.texto, { flex: 1 }]}>{[provider.address, lugar].filter(Boolean).join(', ')}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <Text style={u.h3}>Servicios <Text style={e.cuenta}>({services.length})</Text></Text>
          {services.length === 0 ? (
            // Invitar a escribirle solo si hay por dónde: sin ninguna vía de contacto, esta frase y
            // el «aún no ha puesto un teléfono» de dos secciones más abajo se contradecían.
            <EstadoVacio
              icono="construct-outline"
              titulo="Sin servicios publicados"
              texto={sinContacto ? undefined : 'Puedes escribirle igualmente para consultar un trabajo.'}
            />
          ) : (
            <View style={{ gap: 12 }}>
              {services.map((s) => <FilaServicio key={s.id} s={s} />)}
            </View>
          )}
        </View>

        <SeccionCatalogo vendedor={vendedor} />

        {/* «¿Trabaja en mi municipio?» es lo que decide a quién escribir, y hasta ahora el dato
            llegaba en `serviceAreas` y no se pintaba en ninguna pantalla de la app. La web lo
            enseña igual, agrupado por provincia (ProviderProfile.tsx:316-321). */}
        {zonas.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={u.h3}>Zonas donde trabaja</Text>
            {zonas.map((z) => (
              <View key={z.provincia} style={{ gap: 6 }}>
                <Text style={e.zonaProvincia}>{z.provincia.toUpperCase()}</Text>
                <View style={e.chips}>
                  {z.municipios.map((m) => <Chip key={m} texto={m} pequeno />)}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <SeccionResenas id={provider.id} rating={provider.rating} count={provider.review_count} distribution={distribution} />

        <Tarjeta estilo={{ padding: 20, gap: 12 }}>
          <Text style={u.h3}>Contactar</Text>
          {abierto ? (
            <View style={{ gap: 12 }}>
              <Campo etiqueta="Tu mensaje" value={mensaje} onChangeText={setMensaje} multiline numberOfLines={4} error={error}
                ayuda="Dile qué necesitas, dónde y cuándo. La respuesta llega a tus Mensajes." />
              <Boton titulo="Enviar mensaje" icono="send-outline" onPress={enviarSolicitud} cargando={enviando} />
              <Boton titulo="Cancelar" variante="fantasma" onPress={() => { setAbierto(false); setError(undefined); }} />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {chat ? <Boton titulo="Enviar mensaje" icono="chatbubble-ellipses-outline" onPress={escribir} /> : null}
              {whatsapp ? <Boton titulo="WhatsApp" variante="whatsapp" icono="logo-whatsapp" onPress={() => abrirExterno(whatsapp, 'whatsapp')} /> : null}
              {llamar ? <Boton titulo="Llamar" variante="secundario" icono="call-outline" onPress={() => abrirExterno(llamar, 'call')} /> : null}
              {/* Sigue diciéndose cuando solo hay Telegram o correo: es cierto, no hay teléfono. Lo
                  que ya no pasa es que un perfil localizable por Telegram se quede sin ninguna vía
                  pintada (ver `sinTelefono` vs `sinContacto` en lib/perfil.ts). */}
              {sinTelefono ? <Text style={u.suave}>Este profesional aún no ha puesto un teléfono de contacto.</Text> : null}
              {error ? <Text style={[u.suave, { color: '#b42318' }]}>{error}</Text> : null}
            </View>
          )}

          {/* Telegram y correo, como la web (ProviderProfile.tsx:188-205). */}
          {telegram || correo ? (
            <View style={e.contactoExtra}>
              {telegram ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Telegram: ${provider.telegram}`}
                  onPress={() => abrirEnlace(telegram, 'Telegram')}
                  style={({ pressed }) => [u.fila, { gap: 8 }, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="paper-plane-outline" size={16} color="#0ea5e9" />
                  <Text style={u.texto}>Telegram</Text>
                  <Text style={[u.tenue, { flexShrink: 1 }]} numberOfLines={1}>{provider.telegram}</Text>
                </Pressable>
              ) : null}
              {correo ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Correo: ${provider.email_contact}`}
                  onPress={() => abrirEnlace(correo, 'el correo')}
                  style={({ pressed }) => [u.fila, { gap: 8 }, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="mail-outline" size={16} color={ink[400]} />
                  <Text style={[u.texto, { flexShrink: 1 }]} numberOfLines={1}>{provider.email_contact}</Text>
                </Pressable>
              ) : null}
              {errorEnlace ? <Text style={[u.suave, { color: '#b42318' }]}>{errorEnlace}</Text> : null}
            </View>
          ) : null}
        </Tarjeta>
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: paper },
  contenido: { padding: 16, paddingTop: 0, gap: 24 },
  portada: { width: '100%', aspectRatio: 16 / 7, borderRadius: 24, overflow: 'hidden', backgroundColor: sand[100] },
  cabecera: { gap: 12, marginTop: -68 },
  avatar: { borderWidth: 4, borderColor: paper },
  filaNombre: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  meta: { gap: 8, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  zonaProvincia: { fontFamily: fuentes.textoNegrita, fontSize: 12, letterSpacing: 1.2, color: ink[400] },
  contactoExtra: { gap: 10, borderTopWidth: 1, borderTopColor: sand[200], paddingTop: 16, marginTop: 4 },
  cuenta: { fontFamily: fuentes.textoFuerte, fontSize: 16, color: ink[400] },
  galeria: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 🚨 El ancho en porcentaje va en el hijo de la fila y el `aspectRatio` en una caja interna al
  // 100%, nunca los dos en el mismo nodo: juntos en un hijo de `flexDirection:'row'` la caja se
  // mide bien (ocupa su hueco) pero no pinta nada — ni la foto ni su propio fondo. Es el mismo
  // reparto en dos nodos que ya usa la rejilla del catálogo (`rejilla`/`articulo`/`articuloFoto`),
  // y el patrón de los otros cinco `aspectRatio` de la app, todos sobre `width:'100%'`.
  galeriaItem: { width: '31.5%' },
  galeriaFoto: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: panel },
  filaServicio: { flexDirection: 'row', overflow: 'hidden' },
  filaServicioFoto: { width: 112, backgroundColor: sand[100] },
  filaServicioCuerpo: { flex: 1, minWidth: 0, padding: 14 },
  filaServicioTitulo: { marginTop: 4, fontFamily: fuentes.textoNegrita, fontSize: 15.5, lineHeight: 21, color: ink[900] },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // Dos por fila con el hueco de 12: sin `flexGrow`, porque un último artículo solo se estiraría a
  // todo el ancho y se leería como otra cosa.
  articulo: { width: '47.5%', overflow: 'hidden' },
  articuloFoto: { width: '100%', aspectRatio: 1, backgroundColor: sand[100] },
  articuloAgotado: { position: 'absolute', top: 8, left: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: ink[900] },
  articuloNombre: { fontFamily: fuentes.textoNegrita, fontSize: 14, lineHeight: 19, color: ink[900] },
  articuloPrecio: { fontFamily: fuentes.titulo, fontSize: 16, color: ink[900] },
  precio: { fontFamily: fuentes.titulo, fontSize: 17, color: ink[900] },
  menor: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400] },
  resumen: { flexDirection: 'row', alignItems: 'center', gap: 20, borderBottomWidth: 1, borderBottomColor: sand[200], paddingBottom: 20 },
  resumenNota: { fontFamily: fuentes.titulo, fontSize: 40, lineHeight: 42, color: ink[900] },
  barraFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barraValor: { width: 12, textAlign: 'right', fontFamily: fuentes.textoFuerte, fontSize: 12, color: ink[500] },
  barra: { flex: 1, height: 8, borderRadius: 999, backgroundColor: sand[100], overflow: 'hidden' },
  barraRelleno: { height: '100%', borderRadius: 999, backgroundColor: ambar[400] },
  barraPct: { width: 34, textAlign: 'right', fontFamily: fuentes.texto, fontSize: 12, color: ink[500] },
  resenaCabeza: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  resenaNombre: { fontFamily: fuentes.textoFuerte, fontSize: 15, color: ink[900] },
  separador: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: sand[200] },
});
