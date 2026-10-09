import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ErrorApi, type PuntoMapa } from '@oficio/shared';
import { Boton } from '../../src/componentes/Boton';
import { TarjetaServicio, TarjetaServicioEsqueleto } from '../../src/componentes/TarjetaServicio';
import { Chip, EstadoError, EstadoVacio, u } from '../../src/componentes/ui';
import MapaExplorar from '../../src/componentes/MapaExplorar';
import HojaPunto, { ANCLA_ABIERTA, ANCLA_ASOMADA } from '../../src/componentes/HojaPunto';
import { useSesion } from '../../src/lib/contexto';
import {
  ESTADO_PANEL_VACIO,
  type EstadoPanel,
  reduceAbrirLista,
  reduceAbrirPunto,
  reduceCerrar,
  reduceElegirDeLista,
  reduceVolverALista,
} from '../../src/lib/panelMapa';
import { brand, fuentes, ink, paper, radios, sand } from '../../src/lib/tema';

type Categoria = { slug: string; nombre: string };
type Vista = 'lista' | 'mapa';
type PestanaMapa = 'servicios' | 'negocios' | 'productos';

const PESTANAS_MAPA: { valor: PestanaMapa; etiqueta: string; placeholder: string }[] = [
  { valor: 'servicios', etiqueta: 'Servicios', placeholder: 'Electricista, clases de inglés…' },
  { valor: 'negocios', etiqueta: 'Negocios', placeholder: 'Panadería, cafetería, taller…' },
  { valor: 'productos', etiqueta: 'Productos', placeholder: 'Cake, breaker, zapatos, pintura…' },
];

export default function Explorar() {
  // `t` cambia en cada navegación desde Inicio: así un mismo chip vuelve a aplicarse aunque el
  // usuario hubiera cambiado la búsqueda aquí mientras tanto.
  const params = useLocalSearchParams<{ q?: string; categoria?: string; nombre?: string; t?: string }>();
  const { api } = useSesion();
  const lista = useRef<FlatList>(null);
  useScrollToTop(lista);
  const [texto, setTexto] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [categoria, setCategoria] = useState<Categoria | null>(params.categoria ? { slug: params.categoria, nombre: params.nombre ?? params.categoria } : null);

  // La lista sigue siendo la vista inicial, igual que en la web: el switch la cambia a mapa, no
  // aterriza en él. Un mapa es la vista más cara de cargar en una conexión cubana lenta, y un
  // servicio se elige por precio y foto — algo que un mapa no puede mostrar.
  const [vista, setVista] = useState<Vista>('lista');
  const [tab, setTab] = useState<PestanaMapa>('servicios');
  const [panel, setPanel] = useState<EstadoPanel>(ESTADO_PANEL_VACIO);
  // -1 cerrada, 0 asomada, 1 abierta. Lo mantiene esta pantalla (no HojaPunto) porque también lo
  // necesita el mapa, para no quedar tapado — ver `altoReservado` más abajo.
  const [indiceHoja, setIndiceHoja] = useState(-1);
  // Alto real del contenedor que comparten el mapa y la hoja (medido, no adivinado con las
  // dimensiones de toda la ventana): así ambos usan la misma referencia pase lo que pase con la
  // cabecera o la barra de pestañas, y no pueden desalinearse entre sí.
  const [altoContenedor, setAltoContenedor] = useState(0);

  useEffect(() => {
    setTexto(params.q ?? '');
    setQ(params.q ?? '');
    setCategoria(params.categoria ? { slug: params.categoria, nombre: params.nombre ?? params.categoria } : null);
  }, [params.q, params.categoria, params.nombre, params.t]);

  const categorias = useQuery({ queryKey: ['categorias', 'estadisticas'], queryFn: () => api.categorias.estadisticas(), staleTime: 300_000 });
  const consulta = useInfiniteQuery({
    queryKey: ['buscar', q, categoria?.slug ?? ''],
    queryFn: ({ pageParam }) => api.servicios.listar({ q: q || undefined, category: categoria?.slug, page: pageParam, limit: 12 }),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.pagination.page < ultima.pagination.totalPages ? ultima.pagination.page + 1 : undefined),
  });

  const servicios = consulta.data?.pages.flatMap((p) => p.services) ?? [];
  const total = consulta.data?.pages[0]?.pagination.total;
  const hayFiltros = !!q || !!categoria;
  const sinRed = consulta.error instanceof ErrorApi && consulta.error.status === 0;

  const enviar = () => setQ(texto.trim());
  const quitarFiltros = () => { setTexto(''); setQ(''); setCategoria(null); };

  const alAbrirPunto = useCallback((p: PuntoMapa) => {
    setPanel((e) => reduceAbrirPunto(e, p));
    setIndiceHoja(0); // coincide con el snapToIndex(0) que hace HojaPunto al recibir contenido nuevo.
  }, []);

  const alAbrirLista = useCallback((puntos: PuntoMapa[], error?: string, reintentar?: () => void) => {
    setPanel((e) => reduceAbrirLista(e, puntos, error ?? '', reintentar ?? null));
    setIndiceHoja(0);
  }, []);

  const alElegirDeLista = useCallback((p: PuntoMapa) => { setPanel((e) => reduceElegirDeLista(e, p)); }, []);
  const alVolverALista = useCallback(() => { setPanel((e) => reduceVolverALista(e)); }, []);
  const alCerrarHoja = useCallback(() => { setPanel(reduceCerrar); setIndiceHoja(-1); }, []);

  // Cambiar de categoría o de texto cierra la hoja: lo abierto puede no pertenecer ya a lo que el
  // mapa muestra, y eso vale igual para una lista que para una ficha.
  useEffect(() => {
    setPanel(reduceCerrar);
    setIndiceHoja(-1);
  }, [q, categoria?.slug, tab]);

  // 0 % cuando está cerrada; si no, la fracción del anclaje actual (30 % o 85 %) del mismo
  // contenedor que mide `onLayout` más abajo — el mismo que usa HojaPunto para sus snapPoints
  // en porcentaje, así que ambos números están atados a una sola medida real.
  const altoReservado = indiceHoja === 1 ? altoContenedor * ANCLA_ABIERTA : indiceHoja === 0 ? altoContenedor * ANCLA_ASOMADA : 0;

  const filtros = (
    <View style={{ gap: 16 }}>
      <View style={e.switch}>
        <Pressable
          onPress={() => setVista('lista')}
          accessibilityRole="button"
          accessibilityState={{ selected: vista === 'lista' }}
          accessibilityLabel="Ver en lista"
          style={[e.switchBoton, vista === 'lista' && e.switchBotonActivo]}
        >
          <Ionicons name="list-outline" size={16} color={vista === 'lista' ? '#ffffff' : ink[700]} />
          <Text style={[e.switchTexto, vista === 'lista' && e.switchTextoActivo]}>Lista</Text>
        </Pressable>
        <Pressable
          onPress={() => setVista('mapa')}
          accessibilityRole="button"
          accessibilityState={{ selected: vista === 'mapa' }}
          accessibilityLabel="Ver en mapa"
          style={[e.switchBoton, vista === 'mapa' && e.switchBotonActivo]}
        >
          <Ionicons name="map-outline" size={16} color={vista === 'mapa' ? '#ffffff' : ink[700]} />
          <Text style={[e.switchTexto, vista === 'mapa' && e.switchTextoActivo]}>Mapa</Text>
        </Pressable>
      </View>

      <View style={e.filaBuscar}>
        <View style={e.campo}>
          <Ionicons name="search-outline" size={20} color={ink[300]} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder={vista === 'mapa' ? PESTANAS_MAPA.find((p) => p.valor === tab)!.placeholder : PESTANAS_MAPA[0].placeholder}
            placeholderTextColor={ink[300]}
            returnKeyType="search"
            onSubmitEditing={(ev) => setQ(ev.nativeEvent.text.trim())}
            accessibilityLabel="Buscar servicios"
            style={e.input}
          />
          {texto ? (
            <Pressable onPress={() => { setTexto(''); setQ(''); }} hitSlop={10} accessibilityLabel="Borrar búsqueda">
              <Ionicons name="close-circle" size={18} color={ink[300]} />
            </Pressable>
          ) : null}
        </View>
        <Boton titulo="Buscar" onPress={enviar} />
      </View>

      {vista === 'mapa' ? (
        <View style={e.switch} accessibilityRole="tablist">
          {PESTANAS_MAPA.map((p) => (
            <Pressable
              key={p.valor}
              onPress={() => setTab(p.valor)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === p.valor }}
              style={[e.switchBoton, e.pestana, tab === p.valor && e.switchBotonActivo]}
            >
              <Text style={[e.switchTexto, tab === p.valor && e.switchTextoActivo]} numberOfLines={1}>{p.etiqueta}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {categoria ? (
        <View style={e.chips}>
          <Pressable onPress={() => setCategoria(null)} accessibilityRole="button" accessibilityLabel={`Quitar filtro ${categoria.nombre}`}>
            <Chip texto={categoria.nombre} activo icono={<Ionicons name="close" size={15} color="#ffffff" />} />
          </Pressable>
        </View>
      ) : categorias.data ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.chipsScroll} style={e.chipsFuera}>
          {categorias.data.categories.map((c) => (
            <Pressable key={c.id} onPress={() => setCategoria({ slug: c.slug, nombre: c.name })} accessibilityRole="button">
              <Chip texto={`${c.icon} ${c.name}`} pequeno />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  let vacio = null;
  if (consulta.isLoading) {
    vacio = <View style={{ gap: 20 }}><TarjetaServicioEsqueleto /><TarjetaServicioEsqueleto /></View>;
  } else if (consulta.isError) {
    vacio = sinRed ? (
      <EstadoVacio icono="cloud-offline-outline" titulo="Sin conexión" texto="Revisa tu internet e inténtalo de nuevo."
        accion={<Boton titulo="Reintentar" variante="secundario" onPress={() => consulta.refetch()} />} />
    ) : (
      <EstadoError mensaje={consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar los servicios.'} alReintentar={() => consulta.refetch()} />
    );
  } else {
    vacio = (
      <EstadoVacio icono="search-outline" titulo="No encontramos servicios con esos filtros"
        texto={categoria ? 'Prueba con otra palabra o quita el filtro de categoría.' : q ? 'Prueba con otra palabra o busca por categoría.' : 'Todavía no hay servicios publicados.'}
        accion={hayFiltros ? <Boton titulo="Quitar todos los filtros" variante="secundario" onPress={quitarFiltros} /> : undefined} />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: paper }} edges={['top']}>

        {vista === 'mapa' ? <View style={e.filtrosFijos}>{filtros}</View> : null}

        <View style={{ flex: 1 }} onLayout={(ev) => setAltoContenedor(ev.nativeEvent.layout.height)}>
          {vista === 'lista' ? (
            <FlatList
              ref={lista}
              data={servicios}
              keyExtractor={(s) => s.id}
              renderItem={({ item }) => <TarjetaServicio s={item} />}
              ListHeaderComponent={
                <View style={{ gap: 16, paddingBottom: 4 }}>
                  {filtros}
                  {total !== undefined && !consulta.isError ? (
                    <Text style={u.suave}>
                      {total === 0 ? 'Sin resultados' : `${total} ${total === 1 ? 'servicio' : 'servicios'}`}
                      {q ? <Text> para «{q}»</Text> : null}
                    </Text>
                  ) : null}
                </View>
              }
              ListEmptyComponent={vacio}
              contentContainerStyle={{ padding: 16, paddingTop: 24, gap: 20 }}
              keyboardShouldPersistTaps="handled"
              onEndReached={() => { if (consulta.hasNextPage && !consulta.isFetchingNextPage) void consulta.fetchNextPage(); }}
              onEndReachedThreshold={0.5}
              refreshing={consulta.isRefetching && !consulta.isFetchingNextPage}
              onRefresh={() => consulta.refetch()}
              ListFooterComponent={consulta.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={brand[600]} /> : null}
            />
          ) : (
            // Se encoge por abajo tanto como ocupa la hoja ahora mismo, para que el botón «Buscar
            // en esta zona» de MapaExplorar (que esta tarea no puede tocar) nunca quede debajo de
            // ella. Este cálculo se actualiza recién la hoja termina de asentarse en un anclaje
            // (ver onCambiaIndice de HojaPunto), no en cada cuadro del arrastre — es la única vía
            // sin acoplar esta pantalla a los valores animados internos de HojaPunto.
            <View style={{ flex: 1, paddingBottom: altoReservado }}>
              <MapaExplorar
                tab={tab}
                q={q}
                category={categoria?.slug ?? ''}
                seleccionadoId={panel.punto?.id ?? null}
                onAbrir={alAbrirPunto}
                onAbrirLista={alAbrirLista}
              />
            </View>
          )}

          <HojaPunto
            punto={panel.punto}
            lista={panel.lista}
            errorLista={panel.errorLista || undefined}
            onReintentarLista={panel.reintentarLista ?? undefined}
            onElegirDeLista={alElegirDeLista}
            onVolverALista={panel.listaPrevia ? alVolverALista : undefined}
            onCerrar={alCerrarHoja}
            onCambiaIndice={setIndiceHoja}
            tab={tab}
            q={q}
            productoMarcado={panel.productoMarcado}
          />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const e = StyleSheet.create({
  filtrosFijos: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16 },
  switch: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: sand[100], borderRadius: radios.chip, padding: 3, gap: 3 },
  switchBoton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radios.chip },
  // Indicador de selección: siempre brand-600, nunca brand-500 (2,43:1, no pasa WCAG con texto blanco).
  switchBotonActivo: { backgroundColor: brand[600] },
  switchTexto: { fontFamily: fuentes.textoFuerte, fontSize: 13, color: ink[700] },
  switchTextoActivo: { color: '#ffffff' },
  pestana: { paddingHorizontal: 12 },
  filaBuscar: { flexDirection: 'row', gap: 8 },
  campo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderWidth: 1, borderColor: sand[300], borderRadius: radios.campo, backgroundColor: '#ffffff', paddingHorizontal: 12 },
  input: { flex: 1, minHeight: 46, fontFamily: fuentes.texto, fontSize: 15, color: ink[900] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // El carrusel sale hasta el borde de la pantalla (como en la web) pero arranca alineado al contenido.
  chipsFuera: { marginHorizontal: -16 },
  chipsScroll: { gap: 8, paddingHorizontal: 16 },
});
