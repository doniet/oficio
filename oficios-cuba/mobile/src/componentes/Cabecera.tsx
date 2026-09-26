import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSesion } from '../lib/contexto';
import { brand, fuentes, ink, paper, sand } from '../lib/tema';

const ICONO = require('../../assets/images/icon.png');

/** Logo de la web: el cuadro terracota con la casa y la estrella + "Oficios" en tinta y "Cuba" en brand. */
export function Logo() {
  return (
    <View style={s.logo} accessibilityRole="header" accessibilityLabel="Oficios Cuba">
      <Image source={ICONO} style={s.icono} contentFit="cover" />
      <Text style={s.nombre}>Oficios<Text style={{ color: brand[500] }}>Cuba</Text></Text>
    </View>
  );
}

/** Cabecera de la web en móvil: logo a la izquierda y "Entrar" a la derecha si no hay sesión. */
export function Cabecera() {
  const { usuario, cargando } = useSesion();
  return (
    <View style={s.cabecera}>
      <Pressable onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel="Oficios Cuba, inicio" hitSlop={6}>
        <Logo />
      </Pressable>
      {!usuario && !cargando ? (
        <Pressable onPress={() => router.push('/(auth)/entrar')} accessibilityRole="button" hitSlop={10} style={s.entrar}>
          <Text style={s.entrarTexto}>Entrar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  cabecera: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: paper, borderBottomWidth: 1, borderBottomColor: sand[200] },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icono: { width: 36, height: 36, borderRadius: 10 },
  nombre: { fontFamily: fuentes.titulo, fontSize: 19, color: ink[900], letterSpacing: -0.4 },
  entrar: { paddingHorizontal: 8, paddingVertical: 6 },
  entrarTexto: { fontFamily: fuentes.textoFuerte, fontSize: 14, color: ink[700] },
});
