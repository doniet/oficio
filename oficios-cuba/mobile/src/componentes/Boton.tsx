import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colores, espacio, fuentes } from '../lib/tema';

type Props = { titulo: string; onPress: () => void; variante?: 'primario' | 'secundario'; cargando?: boolean; deshabilitado?: boolean };

export function Boton({ titulo, onPress, variante = 'primario', cargando, deshabilitado }: Props) {
  const primario = variante === 'primario';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={deshabilitado || cargando}
      style={({ pressed }) => [s.base, primario ? s.primario : s.secundario, (pressed || deshabilitado) && { opacity: 0.6 }]}
    >
      {cargando ? <ActivityIndicator color={primario ? colores.acentoTexto : colores.tinta} /> : <Text style={[s.texto, { color: primario ? colores.acentoTexto : colores.tinta }]}>{titulo}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio(4) },
  primario: { backgroundColor: colores.acento },
  secundario: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde },
  texto: { fontFamily: fuentes.textoFuerte, fontSize: 16 },
});
