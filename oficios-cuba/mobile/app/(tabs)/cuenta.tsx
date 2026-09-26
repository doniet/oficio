import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Boton } from '../../src/componentes/Boton';
import { BannerSinRed } from '../../src/componentes/BannerSinRed';
import { Avatar, Insignia, Tarjeta, u } from '../../src/componentes/ui';
import { useSesion } from '../../src/lib/contexto';
import { estadoSesion } from '../../src/lib/estadoSesion';
import { estadoPush, EstadoPush, TEXTO_ESTADO_PUSH } from '../../src/lib/push';
import { colores, fuentes, ink, sand } from '../../src/lib/tema';

const TIPO_TEXTO = { client: 'Cliente', provider: 'Profesional' } as const;

export default function Cuenta() {
  const { usuario, salir, cargando, sinRed, reintentar } = useSesion();
  const estado = estadoSesion({ cargando, sinRed, usuario });
  const [saliendo, setSaliendo] = useState(false);
  const [push, setPush] = useState<EstadoPush>();

  // Se relee al enfocar la pestaña y al volver a la app (el permiso puede cambiar en Ajustes
  // o en el diálogo que abre el registro tras entrar). Solo lee: nunca pide permiso.
  const leerPush = useCallback(() => { estadoPush().then(setPush); }, []);
  useFocusEffect(leerPush);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') leerPush(); });
    return () => sub.remove();
  }, [leerPush]);

  async function cerrarSesion() {
    setSaliendo(true);
    try { await salir(); } catch { /* la sesión local ya se cerró; el borrado del token queda pendiente */ } finally { setSaliendo(false); }
  }

  // Mientras se comprueba el token guardado, no se flashea la vista de invitado.
  if (estado === 'cargando') {
    return (
      <Pantalla cabecera titulo="Cuenta">
        <ActivityIndicator color={colores.acento} />
      </Pantalla>
    );
  }

  return (
    <Pantalla cabecera titulo="Cuenta" subtitulo={usuario ? 'Tus datos de acceso.' : undefined}>
      {estado === 'sinRed' ? <BannerSinRed onReintentar={reintentar} /> : null}
      {usuario ? (
        <Tarjeta estilo={s.tarjeta}>
          <View style={s.perfil}>
            <Avatar src={usuario.avatar_url} nombre={usuario.full_name} tamano={56} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={s.nombre} numberOfLines={2}>{usuario.full_name}</Text>
              <Text style={u.suave} numberOfLines={1}>{usuario.email}</Text>
              <View style={{ marginTop: 4 }}><Insignia tipo="suave" texto={TIPO_TEXTO[usuario.user_type]} /></View>
            </View>
          </View>
          {push ? (
            <View style={s.push}>
              <Ionicons name="notifications-outline" size={16} color={ink[400]} />
              <Text style={[u.tenue, { flex: 1 }]}>{TEXTO_ESTADO_PUSH[push]}</Text>
            </View>
          ) : null}
        </Tarjeta>
      ) : (
        <Tarjeta estilo={s.tarjeta}>
          <Text style={u.h3}>Entra o crea tu cuenta</Text>
          <Text style={[u.suave, { marginTop: 6, lineHeight: 20 }]}>Entra o crea una cuenta para publicar servicios, escribir a profesionales y guardar tus favoritos.</Text>
          <View style={{ gap: 8, marginTop: 20 }}>
            <Boton titulo="Entrar" icono="log-in-outline" onPress={() => router.push('/(auth)/entrar')} />
            <Boton titulo="Crear cuenta gratis" variante="secundario" onPress={() => router.push('/(auth)/registro')} />
          </View>
        </Tarjeta>
      )}

      {usuario ? <Boton titulo="Cerrar sesión" icono="log-out-outline" variante="secundario" onPress={cerrarSesion} cargando={saliendo} /> : null}

      <Text style={[u.tenue, { fontSize: 12, textAlign: 'center' }]}>
        Versión {Constants.expoConfig?.version}
      </Text>
    </Pantalla>
  );
}

const s = StyleSheet.create({
  tarjeta: { padding: 20 },
  perfil: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  nombre: { fontFamily: fuentes.textoNegrita, fontSize: 18, color: ink[900] },
  push: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: sand[200] },
});
