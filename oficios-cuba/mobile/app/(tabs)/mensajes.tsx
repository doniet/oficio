import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { relativeTime } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Boton } from '../../src/componentes/Boton';
import { BannerSinRed } from '../../src/componentes/BannerSinRed';
import { requiereSesion, useSesion } from '../../src/lib/contexto';
import { estadoSesion } from '../../src/lib/estadoSesion';
import { colores, espacio, fuentes } from '../../src/lib/tema';

export default function Mensajes() {
  const { usuario, api, cargando, sinRed, reintentar } = useSesion();
  // El hook se llama siempre (regla de hooks): sin sesión se deshabilita la consulta, no se omite.
  const consulta = useQuery({
    queryKey: ['conversaciones'],
    queryFn: () => api.conversaciones.listar(),
    enabled: !!usuario,
    refetchOnWindowFocus: true,
  });
  const estado = estadoSesion({ cargando, sinRed, usuario });

  // Mientras se comprueba el token guardado, no se flashea "Entra para ver tus mensajes".
  if (estado === 'cargando') {
    return (
      <Pantalla titulo="Mensajes">
        <ActivityIndicator color={colores.acento} />
      </Pantalla>
    );
  }

  if (!usuario) {
    return (
      <Pantalla titulo="Mensajes">
        {estado === 'sinRed' ? <BannerSinRed onReintentar={reintentar} /> : null}
        <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave }}>Entra para ver tus mensajes</Text>
        <Boton titulo="Entrar" onPress={() => requiereSesion(router, null, '/mensajes')} />
      </Pantalla>
    );
  }

  const conversaciones = consulta.data?.conversations ?? [];

  return (
    <Pantalla titulo="Mensajes" scroll={false}>
      <FlatList
        style={{ flex: 1 }}
        data={conversaciones}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ gap: espacio(2) }}
        refreshing={consulta.isRefetching}
        onRefresh={() => consulta.refetch()}
        ListEmptyComponent={!consulta.isLoading ? <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave }}>Todavía no tienes mensajes.</Text> : null}
        renderItem={({ item }) => {
          const otro = usuario.user_type === 'client' ? item.provider_name : item.client_name;
          return (
            <Pressable onPress={() => router.push(`/conversacion/${item.id}`)} style={{ flexDirection: 'row', gap: espacio(3), padding: espacio(3), backgroundColor: colores.superficie, borderRadius: 16, borderWidth: 1, borderColor: colores.borde, alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fuentes.textoFuerte, color: colores.tinta }} numberOfLines={1}>{otro}</Text>
                {item.service_title ? <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave, fontSize: 13 }} numberOfLines={1}>{item.service_title}</Text> : null}
                <Text style={{ fontFamily: fuentes.texto, color: colores.tintaTenue, fontSize: 13 }} numberOfLines={1}>{item.last_message ?? ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontFamily: fuentes.texto, color: colores.tintaTenue, fontSize: 12 }}>{relativeTime(item.last_message_at)}</Text>
                {item.unread_count ? (
                  <View style={{ backgroundColor: colores.acento, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                    <Text style={{ color: colores.acentoTexto, fontSize: 12, fontFamily: fuentes.textoFuerte }}>{item.unread_count}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </Pantalla>
  );
}
