import { ActivityIndicator, FlatList, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ErrorApi } from '@oficio/shared';
import { TarjetaServicio } from '../../src/componentes/TarjetaServicio';
import { Boton } from '../../src/componentes/Boton';
import { useSesion } from '../../src/lib/contexto';
import { colores, espacio, fuentes } from '../../src/lib/tema';

export default function Inicio() {
  const { api } = useSesion();
  const consulta = useInfiniteQuery({
    queryKey: ['servicios', 'nuevos'],
    queryFn: ({ pageParam }) => api.servicios.listar({ sort: 'newest', page: pageParam, limit: 12 }),
    initialPageParam: 1,
    getNextPageParam: (u) => (u.pagination.page < u.pagination.totalPages ? u.pagination.page + 1 : undefined),
  });

  const servicios = consulta.data?.pages.flatMap((p) => p.services) ?? [];

  if (consulta.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo, alignItems: 'center', justifyContent: 'center', gap: espacio(3), padding: espacio(4) }} edges={['top']}>
        <Text style={{ fontFamily: fuentes.texto, color: colores.tinta, textAlign: 'center' }}>
          {consulta.error instanceof ErrorApi ? consulta.error.message : 'Algo salió mal. Inténtalo de nuevo.'}
        </Text>
        <Boton titulo="Reintentar" onPress={() => consulta.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }} edges={['top']}>
      <FlatList
        style={{ flex: 1 }}
        data={servicios}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: espacio(4), gap: espacio(3) }}
        ListHeaderComponent={<Text style={{ fontFamily: fuentes.titulo, fontSize: 28, color: colores.tinta, marginBottom: espacio(1) }}>Servicios nuevos</Text>}
        renderItem={({ item }) => <TarjetaServicio s={item} />}
        onEndReached={() => { if (consulta.hasNextPage && !consulta.isFetchingNextPage) void consulta.fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        refreshing={consulta.isRefetching}
        onRefresh={() => consulta.refetch()}
        ListFooterComponent={consulta.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: espacio(4) }} color={colores.acento} /> : null}
        ListEmptyComponent={!consulta.isLoading ? <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave, textAlign: 'center', marginTop: espacio(6) }}>Todavía no hay servicios.</Text> : null}
      />
      {consulta.isLoading ? <ActivityIndicator style={{ marginTop: espacio(6) }} color={colores.acento} /> : null}
    </SafeAreaView>
  );
}
