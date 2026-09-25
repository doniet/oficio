import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Boton } from '../../src/componentes/Boton';
import { BannerSinRed } from '../../src/componentes/BannerSinRed';
import { useSesion } from '../../src/lib/contexto';
import { estadoSesion } from '../../src/lib/estadoSesion';
import { colores, espacio, fuentes } from '../../src/lib/tema';

const TIPO_TEXTO = { client: 'Cliente', provider: 'Profesional' } as const;

export default function Cuenta() {
  const { usuario, salir, cargando, sinRed, reintentar } = useSesion();
  const estado = estadoSesion({ cargando, sinRed, usuario });

  // Mientras se comprueba el token guardado, no se flashea la vista de invitado.
  if (estado === 'cargando') {
    return (
      <Pantalla titulo="Cuenta">
        <ActivityIndicator color={colores.acento} />
      </Pantalla>
    );
  }

  return (
    <Pantalla titulo="Cuenta">
      {estado === 'sinRed' ? <BannerSinRed onReintentar={reintentar} /> : null}
      {usuario ? (
        <View style={{ gap: espacio(1) }}>
          <Text style={{ fontFamily: fuentes.textoFuerte, fontSize: 18, color: colores.tinta }}>{usuario.full_name}</Text>
          <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave }}>{usuario.email}</Text>
          <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave }}>{TIPO_TEXTO[usuario.user_type]}</Text>
        </View>
      ) : (
        <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave }}>Entra o crea una cuenta para publicar servicios, escribir a profesionales y guardar tus favoritos.</Text>
      )}

      {usuario ? (
        <Boton titulo="Cerrar sesión" variante="secundario" onPress={() => salir()} />
      ) : (
        <View style={{ gap: espacio(2) }}>
          <Boton titulo="Entrar" onPress={() => router.push('/(auth)/entrar')} />
          <Boton titulo="Crear cuenta" variante="secundario" onPress={() => router.push('/(auth)/registro')} />
        </View>
      )}

      <Text style={{ fontFamily: fuentes.texto, color: colores.tintaTenue, fontSize: 12, textAlign: 'center' }}>
        Versión {Constants.expoConfig?.version}
      </Text>
    </Pantalla>
  );
}
