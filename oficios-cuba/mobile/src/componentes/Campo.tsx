import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colores, espacio, fuentes } from '../lib/tema';

export function Campo({ etiqueta, error, ...props }: TextInputProps & { etiqueta: string; error?: string }) {
  return (
    <View style={{ gap: espacio(1) }}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput placeholderTextColor={colores.tintaTenue} {...props} style={[s.input, error && { borderColor: colores.error }]} accessibilityLabel={etiqueta} />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  etiqueta: { fontFamily: fuentes.textoFuerte, color: colores.tinta },
  input: { minHeight: 48, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, paddingHorizontal: espacio(3), backgroundColor: colores.superficie, fontFamily: fuentes.texto, fontSize: 16, color: colores.tinta },
  error: { color: colores.error, fontFamily: fuentes.texto },
});
