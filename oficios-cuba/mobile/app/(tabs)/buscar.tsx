import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ErrorApi } from '@oficio/shared';
import { Cabecera } from '../../src/componentes/Cabecera';
import { Boton } from '../../src/componentes/Boton';
import { TarjetaServicio, TarjetaServicioEsqueleto } from '../../src/componentes/TarjetaServicio';
import { Chip, EstadoError, EstadoVacio, u } from '../../src/componentes/ui';
import { useSesion } from '../../src/lib/contexto';
import { brand, fuentes, ink, paper, radios, sand } from '../../src/lib/tema';

type Categoria = { slug: string; nombre: string };

export default function Buscar() {
  // `t` cambia en cada navegación desde Inicio: así un mismo chip vuelve a aplicarse aunque el
  // usuario hubiera cambiado la búsqueda aquí mientras tanto.
  const params = useLocalSearchParams<{ q?: string; categoria?: string; nombre?: string; t?: string }>();
  const { api } = useSesion();
  const lista = useRef<FlatList>(null);
  useScrollToTop(lista);
  const [texto, setTexto] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [categoria, setCategoria] = useState<Categoria | null>(params.categoria ? { slug: params.categoria, nombre: params.nombre ?? params.categoria } : null);

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

  const encabezado = (
    <View style={{ gap: 16, paddingBottom: 4 }}>
      <Text style={u.h1}>Explorar servicios</Text>
      <View style={e.filaBuscar}>
        <View style={e.campo}>
          <Ionicons name="search-outline" size={20} color={ink[300]} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Electricista, clases de inglés…"
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

      {total !== undefined && !consulta.isError ? (
        <Text style={u.suave}>
          {total === 0 ? 'Sin resultados' : `${total} ${total === 1 ? 'servicio' : 'servicios'}`}
          {q ? <Text> para «{q}»</Text> : null}
        </Text>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }} edges={['top']}>
      <Cabecera />
      <FlatList
        ref={lista}
        data={servicios}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <TarjetaServicio s={item} />}
        ListHeaderComponent={encabezado}
        ListEmptyComponent={vacio}
        contentContainerStyle={{ padding: 16, paddingTop: 24, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => { if (consulta.hasNextPage && !consulta.isFetchingNextPage) void consulta.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        refreshing={consulta.isRefetching && !consulta.isFetchingNextPage}
        onRefresh={() => consulta.refetch()}
        ListFooterComponent={consulta.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={brand[600]} /> : null}
      />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  filaBuscar: { flexDirection: 'row', gap: 8 },
  campo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderWidth: 1, borderColor: sand[300], borderRadius: radios.campo, backgroundColor: '#ffffff', paddingHorizontal: 12 },
  input: { flex: 1, minHeight: 46, fontFamily: fuentes.texto, fontSize: 15, color: ink[900] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // El carrusel sale hasta el borde de la pantalla (como en la web) pero arranca alineado al contenido.
  chipsFuera: { marginHorizontal: -16 },
  chipsScroll: { gap: 8, paddingHorizontal: 16 },
});
