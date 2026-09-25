import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores, espacio, fuentes } from '../lib/tema';

export function Pantalla({ titulo, scroll = true, children }: { titulo?: string; scroll?: boolean; children: ReactNode }) {
  const cuerpo = (
    <>
      {titulo ? <Text style={s.titulo}>{titulo}</Text> : null}
      {children}
    </>
  );
  return (
    <SafeAreaView style={s.raiz} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">{cuerpo}</ScrollView> : <View style={[s.contenido, { flex: 1 }]}>{cuerpo}</View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio(4), gap: espacio(3) },
  titulo: { fontFamily: fuentes.titulo, fontSize: 28, color: colores.tinta },
});
