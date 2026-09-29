import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { u } from './ui';
import { colores, espacio } from '../lib/tema';

/**
 * `cabecera`: pantalla de pestaña (respeta el borde superior). Ya no pinta la barra con el logo ni el
 * título grande: en la app los da la barra de pestañas (decisión de Dariel, 29-sep). Las pantallas del
 * Stack traen su propia cabecera nativa y siguen mostrando `titulo`.
 */
export function Pantalla({ titulo, subtitulo, scroll = true, cabecera = false, children }: { titulo?: string; subtitulo?: string; scroll?: boolean; cabecera?: boolean; children: ReactNode }) {
  const cuerpo = (
    <>
      {titulo || subtitulo ? (
        <View style={{ gap: 4, marginBottom: espacio(1) }}>
          {titulo ? <Text style={u.h1}>{titulo}</Text> : null}
          {subtitulo ? <Text style={u.subtitulo}>{subtitulo}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  );
  return (
    <SafeAreaView style={s.raiz} edges={cabecera ? ['top'] : ['bottom']}>
      {scroll ? <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">{cuerpo}</ScrollView> : <View style={[s.contenido, { flex: 1 }]}>{cuerpo}</View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio(4), paddingTop: espacio(6), gap: espacio(4) },
});
