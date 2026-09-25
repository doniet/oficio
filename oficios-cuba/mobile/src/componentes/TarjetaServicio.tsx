import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatPrice, nombreVisible, ServiceSummary } from '@oficio/shared';
import { urlImagen } from '../lib/api';
import { colores, espacio, fuentes } from '../lib/tema';

export function TarjetaServicio({ s }: { s: ServiceSummary }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/servicio/${s.id}`)} style={e.tarjeta}>
      {s.cover ? <Image source={urlImagen(s.cover)} style={e.foto} contentFit="cover" cachePolicy="disk" /> : <View style={[e.foto, { backgroundColor: colores.borde }]} />}
      <View style={{ padding: espacio(3), gap: 2 }}>
        <Text style={e.titulo} numberOfLines={2}>{s.title}</Text>
        <Text style={e.sub} numberOfLines={1}>{nombreVisible(s)} · {s.municipality_name ?? s.province_name ?? ''}</Text>
        <Text style={e.precio}>{formatPrice(s)}</Text>
      </View>
    </Pressable>
  );
}

const e = StyleSheet.create({
  tarjeta: { backgroundColor: colores.superficie, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colores.borde },
  foto: { width: '100%', aspectRatio: 16 / 9 },
  titulo: { fontFamily: fuentes.textoFuerte, fontSize: 16, color: colores.tinta },
  sub: { fontFamily: fuentes.texto, color: colores.tintaSuave },
  precio: { fontFamily: fuentes.textoFuerte, color: colores.acento },
});
