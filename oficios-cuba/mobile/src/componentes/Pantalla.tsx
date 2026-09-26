import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Cabecera } from './Cabecera';
import { u } from './ui';
import { colores, espacio } from '../lib/tema';

/** `cabecera`: la barra con el logo, como en la web (pestañas). Las pantallas del Stack ya traen la suya. */
export function Pantalla({ titulo, subtitulo, scroll = true, cabecera = false, children }: { titulo?: string; subtitulo?: string; scroll?: boolean; cabecera?: boolean; children: ReactNode }) {
  const cuerpo = (
    <>
      {titulo ? (
        <View style={{ gap: 4, marginBottom: espacio(1) }}>
          <Text style={u.h1}>{titulo}</Text>
          {subtitulo ? <Text style={u.subtitulo}>{subtitulo}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  );
  return (
    <SafeAreaView style={s.raiz} edges={cabecera ? ['top'] : ['bottom']}>
      {cabecera ? <Cabecera /> : null}
      {scroll ? <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">{cuerpo}</ScrollView> : <View style={[s.contenido, { flex: 1 }]}>{cuerpo}</View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio(4), paddingTop: espacio(6), gap: espacio(4) },
});
