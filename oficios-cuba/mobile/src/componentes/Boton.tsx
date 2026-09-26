import { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, fuentes, ink, radios, sand, whatsapp } from '../lib/tema';

type Variante = 'primario' | 'secundario' | 'oscuro' | 'whatsapp' | 'fantasma';
type Props = {
  titulo?: string;
  onPress: () => void;
  variante?: Variante;
  icono?: ComponentProps<typeof Ionicons>['name'];
  cargando?: boolean;
  deshabilitado?: boolean;
  pequeno?: boolean;
  estilo?: StyleProp<ViewStyle>;
  etiquetaAccesible?: string;
};

// .btn-primary / .btn-secondary / .btn-dark / .btn-whatsapp / .btn-ghost de la web.
const FONDO: Record<Variante, string> = { primario: colores.acento, secundario: '#ffffff', oscuro: ink[900], whatsapp, fantasma: 'transparent' };
const TEXTO: Record<Variante, string> = { primario: '#ffffff', secundario: ink[800], oscuro: '#ffffff', whatsapp: '#ffffff', fantasma: ink[700] };

export function Boton({ titulo, onPress, variante = 'primario', icono, cargando, deshabilitado, pequeno, estilo, etiquetaAccesible }: Props) {
  const color = TEXTO[variante];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible ?? titulo}
      onPress={onPress}
      disabled={deshabilitado || cargando}
      style={({ pressed }) => [
        s.base,
        pequeno && s.pequeno,
        { backgroundColor: FONDO[variante] },
        variante === 'secundario' && s.borde,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        deshabilitado && { opacity: 0.5 },
        estilo,
      ]}
    >
      {cargando ? <ActivityIndicator color={color} /> : (
        <>
          {icono ? <Ionicons name={icono} size={pequeno ? 16 : 18} color={color} /> : null}
          {titulo ? <Text style={[s.texto, pequeno && { fontSize: 13 }, { color }]} numberOfLines={1}>{titulo}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { minHeight: 48, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  pequeno: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10 },
  borde: { borderWidth: 1, borderColor: sand[300] },
  texto: { fontFamily: fuentes.textoFuerte, fontSize: 15 },
});
