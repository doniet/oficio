import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { brand, colores, fuentes, ink, radios, sand } from '../lib/tema';

// .label + .input + .hint de la web: borde sand-300, foco en brand-500.
export function Campo({ etiqueta, error, ayuda, ...props }: TextInputProps & { etiqueta: string; error?: string; ayuda?: string }) {
  const [foco, setFoco] = useState(false);
  return (
    <View>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput
        placeholderTextColor={ink[300]}
        {...props}
        onFocus={(e) => { setFoco(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFoco(false); props.onBlur?.(e); }}
        style={[s.input, props.multiline && s.multilinea, foco && s.foco, error && { borderColor: '#f87171' }]}
        accessibilityLabel={etiqueta}
      />
      {error ? <Text style={s.error}>{error}</Text> : ayuda ? <Text style={s.ayuda}>{ayuda}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  etiqueta: { fontFamily: fuentes.textoFuerte, fontSize: 14, color: ink[700], marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: sand[300], borderRadius: radios.campo, paddingHorizontal: 14, backgroundColor: '#ffffff', fontFamily: fuentes.texto, fontSize: 15, color: ink[900] },
  multilinea: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  foco: { borderColor: brand[500] },
  error: { marginTop: 4, fontSize: 12, color: colores.error, fontFamily: fuentes.textoMedio },
  ayuda: { marginTop: 4, fontSize: 12, color: ink[400], fontFamily: fuentes.texto },
});
