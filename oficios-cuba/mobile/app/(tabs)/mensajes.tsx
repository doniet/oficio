import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ErrorApi, relativeTime } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Boton } from '../../src/componentes/Boton';
import { BannerSinRed } from '../../src/componentes/BannerSinRed';
import { Avatar, EstadoError, EstadoVacio, u } from '../../src/componentes/ui';
import { requiereSesion, useSesion } from '../../src/lib/contexto';
import { estadoSesion } from '../../src/lib/estadoSesion';
import { brand, colores, fuentes, ink, sand } from '../../src/lib/tema';

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
  const esProfesional = usuario?.user_type === 'provider';
  const subtitulo = usuario
    ? esProfesional ? 'Conversaciones con clientes interesados en tus oficios. El chat es del plan Profesional.' : 'Tus conversaciones con profesionales.'
    : undefined;

  // Mientras se comprueba el token guardado, no se flashea "Entra para ver tus mensajes".
  if (estado === 'cargando') {
    return (
      <Pantalla cabecera titulo="Mensajes">
        <ActivityIndicator color={colores.acento} />
      </Pantalla>
    );
  }

  if (!usuario) {
    return (
      <Pantalla cabecera titulo="Mensajes">
        {estado === 'sinRed' ? <BannerSinRed onReintentar={reintentar} /> : null}
        <EstadoVacio icono="chatbubble-outline" titulo="Entra para ver tus mensajes"
          texto="Tus conversaciones con los profesionales aparecen aquí."
          accion={<Boton titulo="Entrar" onPress={() => requiereSesion(router, null, '/mensajes')} />} />
      </Pantalla>
    );
  }

  const conversaciones = consulta.data?.conversations ?? [];

  return (
    <Pantalla cabecera titulo="Mensajes" subtitulo={subtitulo} scroll={false}>
      {consulta.isLoading ? <ActivityIndicator color={colores.acento} /> : null}
      {consulta.isError ? (
        <EstadoError mensaje={consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar tus mensajes.'} alReintentar={() => consulta.refetch()} />
      ) : null}
      {!consulta.isLoading && !consulta.isError && conversaciones.length === 0 ? (
        <EstadoVacio icono="chatbubble-outline" titulo="Aún no tienes mensajes"
          texto={esProfesional
            ? 'Cuando un cliente te escriba desde uno de tus servicios, la conversación aparecerá aquí.'
            : 'Escribe por el chat a un profesional con plan Profesional y sigue la conversación aquí.'}
          accion={esProfesional ? undefined : <Boton titulo="Buscar profesionales" onPress={() => router.navigate('/buscar')} />} />
      ) : null}
      {conversaciones.length > 0 ? (
        <View style={[u.tarjeta, s.lista]}>
          <FlatList
            data={conversaciones}
            keyExtractor={(c) => c.id}
            refreshing={consulta.isRefetching}
            onRefresh={() => consulta.refetch()}
            ItemSeparatorComponent={() => <View style={s.separador} />}
            renderItem={({ item }) => {
              const nombre = esProfesional ? item.client_name : item.provider_name;
              const avatar = esProfesional ? item.client_avatar : item.provider_avatar;
              const noLeidos = item.unread_count ?? 0;
              return (
                <Pressable onPress={() => router.push(`/conversacion/${item.id}`)} style={({ pressed }) => [s.fila, pressed && { backgroundColor: sand[100] }]}>
                  <Avatar src={avatar} nombre={nombre} tamano={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={s.cabezaFila}>
                      <Text style={[s.nombre, noLeidos ? { fontFamily: fuentes.textoNegrita, color: ink[900] } : null]} numberOfLines={1}>{nombre}</Text>
                      <Text style={[s.hora, noLeidos ? { fontFamily: fuentes.textoFuerte, color: brand[700] } : null]}>{relativeTime(item.last_message_at)}</Text>
                    </View>
                    {item.service_title ? <Text style={s.servicio} numberOfLines={1}>{item.service_title}</Text> : null}
                    <View style={s.cabezaFila}>
                      <Text style={[s.ultimo, noLeidos ? { color: ink[800] } : null]} numberOfLines={1}>{item.last_message ?? ''}</Text>
                      {noLeidos ? (
                        <View style={s.contador} accessibilityLabel={`${noLeidos} sin leer`}>
                          <Text style={s.contadorTexto}>{noLeidos}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}
    </Pantalla>
  );
}

const s = StyleSheet.create({
  lista: { flexShrink: 1, overflow: 'hidden' },
  separador: { height: 1, backgroundColor: sand[200] },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  cabezaFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nombre: { flex: 1, fontFamily: fuentes.textoFuerte, fontSize: 15, color: ink[800] },
  hora: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400] },
  servicio: { fontFamily: fuentes.textoMedio, fontSize: 12, color: ink[400] },
  ultimo: { flex: 1, fontFamily: fuentes.texto, fontSize: 14, color: ink[500] },
  contador: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: brand[600], alignItems: 'center', justifyContent: 'center' },
  contadorTexto: { fontFamily: fuentes.textoNegrita, fontSize: 11, color: '#ffffff' },
});
