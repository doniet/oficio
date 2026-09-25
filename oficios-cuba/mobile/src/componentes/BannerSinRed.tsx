import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colores, espacio, fuentes } from '../lib/tema';

// No bloqueante a propósito: se usa donde la pantalla ya puede tener contenido (invitado/autenticado
// obsoleto) debajo — solo avisa que la sesión no se pudo comprobar por falta de red, sin taparlo.
export function BannerSinRed({ onReintentar }: { onReintentar: () => void }) {
  return (
    <View style={s.banner}>
      <Text style={s.texto}>Sin conexión — no pudimos comprobar tu sesión</Text>
      <Pressable onPress={onReintentar} accessibilityRole="button" hitSlop={8}>
        <Text style={s.boton}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacio(3),
    backgroundColor: 'rgba(180, 35, 24, 0.08)',
    borderWidth: 1,
    borderColor: colores.error,
    borderRadius: 12,
    paddingVertical: espacio(2),
    paddingHorizontal: espacio(3),
  },
  texto: { flex: 1, fontFamily: fuentes.texto, color: colores.error, fontSize: 13 },
  boton: { fontFamily: fuentes.textoFuerte, color: colores.acento, fontSize: 13 },
});
