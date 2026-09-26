import { ReactNode, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { initials, Plan } from '@oficio/shared';
import { urlImagen } from '../lib/api';
import { ambar, brand, fuentes, ink, radios, sand, sea, sombra } from '../lib/tema';

/** .card de la web: blanca, borde sand-200, radio 16 y shadow-card. */
export function Tarjeta({ children, estilo }: { children: ReactNode; estilo?: StyleProp<ViewStyle> }) {
  return <View style={[u.tarjeta, estilo]}>{children}</View>;
}

/** .eyebrow: mayúsculas pequeñas en brand-600. */
export function Eyebrow({ children }: { children: string }) {
  return <Text style={u.eyebrow}>{children.toUpperCase()}</Text>;
}

export function TituloSeccion({ eyebrow, titulo, subtitulo }: { eyebrow?: string; titulo: string; subtitulo?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Text style={u.h2}>{titulo}</Text>
      {subtitulo ? <Text style={u.subtitulo}>{subtitulo}</Text> : null}
    </View>
  );
}

/** .chip (y .chip-active: tinta con texto blanco). */
export function Chip({ texto, activo, icono, pequeno }: { texto: string; activo?: boolean; icono?: ReactNode; pequeno?: boolean }) {
  return (
    <View style={[u.chip, pequeno && u.chipPequeno, activo && u.chipActivo]}>
      <Text style={[u.chipTexto, pequeno && { fontSize: 13 }, activo && { color: '#ffffff' }]} numberOfLines={1}>{texto}</Text>
      {icono}
    </View>
  );
}

/** .badge. `plan` = PlanBadge (solo Profesional), `negocio` = NegocioChip, `suave` = categoría. */
export function Insignia({ tipo, texto }: { tipo: 'plan' | 'negocio' | 'suave' | 'blanca'; texto?: string }) {
  if (tipo === 'plan') {
    return (
      <View style={[u.badge, { backgroundColor: ink[900] }]}>
        {/* La corona de la web (lucide Crown): Ionicons no tiene corona. */}
        <MaterialCommunityIcons name="crown-outline" size={14} color={ambar[300]} />
        <Text style={[u.badgeTexto, { color: ambar[300] }]}>Profesional</Text>
      </View>
    );
  }
  if (tipo === 'negocio') {
    return (
      <View style={[u.badge, { backgroundColor: sea[100] }]}>
        <Ionicons name="storefront-outline" size={13} color={sea[800]} />
        <Text style={[u.badgeTexto, { color: sea[800] }]}>Negocio</Text>
      </View>
    );
  }
  return (
    <View style={[u.badge, tipo === 'blanca' ? [{ backgroundColor: 'rgba(255,255,255,0.95)' }, sombra.card] : { backgroundColor: sand[100] }]}>
      <Text style={[u.badgeTexto, { color: tipo === 'blanca' ? ink[800] : ink[700] }]} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

export const InsigniaPlan = ({ plan }: { plan: Plan }) => (plan === 'pro' ? <Insignia tipo="plan" /> : null);

/** RatingInline de la web. */
export function Valoracion({ rating, count, tamano = 14 }: { rating: number; count: number; tamano?: number }) {
  if (!count) return <Text style={[u.tenue, { fontSize: tamano }]}>Sin reseñas aún</Text>;
  return (
    <View style={u.fila}>
      <Ionicons name="star" size={tamano + 2} color={ambar[400]} />
      <Text style={{ fontFamily: fuentes.textoNegrita, fontSize: tamano, color: ink[900] }}>{rating.toFixed(1)}</Text>
      <Text style={[u.tenue, { fontSize: tamano }]}>({count})</Text>
    </View>
  );
}

export function Estrellas({ valor, tamano = 14 }: { valor: number; tamano?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${valor.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => <Ionicons key={i} name="star" size={tamano} color={i <= Math.round(valor) ? ambar[400] : sand[200]} />)}
    </View>
  );
}

const TONOS_AVATAR = [
  [brand[100], brand[800]], [sea[100], sea[800]], ['#FEF3C7', '#92400E'], [ink[100], ink[700]], ['#FFE4E6', '#9F1239'],
];
function hash(seed: string, mult: number) {
  let h = 0;
  for (const ch of seed) h = (h * mult + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Avatar de la web: foto o iniciales sobre un tono estable por nombre. */
export function Avatar({ src, nombre, tamano = 44, cuadrado, estilo }: { src?: string | null; nombre?: string | null; tamano?: number; cuadrado?: boolean; estilo?: StyleProp<ViewStyle> }) {
  const radio = cuadrado ? 16 : tamano / 2;
  // Si la foto no carga (sin red, o un servidor que no sirve /demo), iniciales en vez de un hueco.
  const [fallo, setFallo] = useState(false);
  if (src && !fallo) return <Image source={urlImagen(src)} onError={() => setFallo(true)} style={[{ width: tamano, height: tamano, borderRadius: radio }, estilo as never]} contentFit="cover" cachePolicy="disk" />;
  const [fondo, texto] = TONOS_AVATAR[hash(nombre ?? '?', 31) % TONOS_AVATAR.length];
  return (
    <View style={[{ width: tamano, height: tamano, borderRadius: radio, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }, estilo]}>
      <Text style={{ fontFamily: fuentes.titulo, fontSize: tamano * 0.36, color: texto }}>{initials(nombre)}</Text>
    </View>
  );
}

// CategoryCover de la web: color estable por categoría + el emoji grande.
const TONOS_PORTADA = [
  ['#F6CBBD', '#EFA78F'], ['#D3F1EC', '#A8E2DA'], ['#FDE7B0', '#F6D27A'], ['#E6EAF2', '#CBD2E1'],
  ['#F9D8E0', '#F2B4C3'], ['#E3F0D2', '#C6E0A6'], ['#EADFF7', '#D4C1F0'], ['#FBE6DF', '#F6CBBD'],
];

// Las rayas diagonales de la web. RN no tiene repeating-linear-gradient: se arma un linear-gradient
// con paradas duras (línea de ~1 px cada ~4 % de la diagonal).
const RAYAS = `linear-gradient(135deg, ${Array.from({ length: 28 }, (_, i) => {
  const x = ((i + 1) * 100) / 29;
  return `transparent ${(x - 0.35).toFixed(2)}%, #16213E ${(x - 0.35).toFixed(2)}%, #16213E ${x.toFixed(2)}%, transparent ${x.toFixed(2)}%`;
}).join(', ')})`;

export function PortadaCategoria({ semilla, icono, tamanoIcono = 48 }: { semilla: string; icono?: string | null; tamanoIcono?: number }) {
  const [a, b] = TONOS_PORTADA[hash(semilla, 33) % TONOS_PORTADA.length];
  return (
    <View
      style={[StyleSheet.absoluteFill, u.centro, { backgroundColor: b, experimental_backgroundImage: `radial-gradient(120% 90% at 20% 10%, ${a} 0%, ${b} 100%)` }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[StyleSheet.absoluteFill, { opacity: 0.18, experimental_backgroundImage: RAYAS }]} />
      <Text style={{ fontSize: tamanoIcono }}>{icono || '🛠️'}</Text>
    </View>
  );
}

/** CoverImage: la foto si la hay; si no, la portada de la categoría. Ocupa todo su contenedor. */
export function Portada({ src, semilla, icono, tamanoIcono }: { src?: string | null; semilla: string; icono?: string | null; tamanoIcono?: number }) {
  if (!src) return <PortadaCategoria semilla={semilla} icono={icono} tamanoIcono={tamanoIcono} />;
  return <Image source={urlImagen(src)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={150} />;
}

/** .skeleton */
export function Esqueleto({ estilo }: { estilo?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: 'rgba(234,225,210,0.7)', borderRadius: 8 }, estilo]} />;
}

/** EmptyState de la web: caja punteada con icono, título y texto. */
export function EstadoVacio({ icono, titulo, texto, accion }: { icono: React.ComponentProps<typeof Ionicons>['name']; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <View style={u.vacio}>
      <View style={u.vacioIcono}><Ionicons name={icono} size={26} color={ink[400]} /></View>
      <Text style={u.vacioTitulo}>{titulo}</Text>
      {texto ? <Text style={u.vacioTexto}>{texto}</Text> : null}
      {accion ? <View style={{ marginTop: 20, alignSelf: 'stretch' }}>{accion}</View> : null}
    </View>
  );
}

/** Alert de la web (error / éxito / info). */
export function Aviso({ tono, children }: { tono: 'error' | 'exito' | 'info'; children: ReactNode }) {
  const c = { error: ['#fecaca', '#fef2f2', '#991b1b'], exito: [sea[200], sea[50], sea[800]], info: [sand[300], sand[100], ink[700]] }[tono];
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: c[0], backgroundColor: c[1], paddingHorizontal: 16, paddingVertical: 12 }} accessibilityRole={tono === 'error' ? 'alert' : undefined}>
      <Text style={{ fontFamily: fuentes.texto, fontSize: 14, lineHeight: 20, color: c[2] }}>{children}</Text>
    </View>
  );
}

/** ErrorState de la web (caja roja con "Reintentar"). */
export function EstadoError({ mensaje, alReintentar }: { mensaje: string; alReintentar?: () => void }) {
  return (
    <View style={u.error} accessibilityRole="alert">
      <Text style={u.errorTexto}>{mensaje}</Text>
      {alReintentar ? <Text onPress={alReintentar} style={[u.errorTexto, { fontFamily: fuentes.textoFuerte, textDecorationLine: 'underline', marginTop: 8 }]}>Reintentar</Text> : null}
    </View>
  );
}

export const u = StyleSheet.create({
  tarjeta: { backgroundColor: '#ffffff', borderRadius: radios.tarjeta, borderWidth: 1, borderColor: sand[200], ...sombra.card },
  eyebrow: { fontFamily: fuentes.textoNegrita, fontSize: 12, letterSpacing: 1.7, color: brand[600] },
  h1: { fontFamily: fuentes.titulo, fontSize: 30, lineHeight: 34, color: ink[900], letterSpacing: -0.5 },
  h2: { fontFamily: fuentes.titulo, fontSize: 28, lineHeight: 32, color: ink[900], letterSpacing: -0.5 },
  h3: { fontFamily: fuentes.titulo, fontSize: 20, lineHeight: 25, color: ink[900], letterSpacing: -0.3 },
  subtitulo: { fontFamily: fuentes.texto, fontSize: 15, color: ink[500], lineHeight: 21 },
  texto: { fontFamily: fuentes.texto, fontSize: 15, color: ink[700], lineHeight: 22 },
  suave: { fontFamily: fuentes.texto, fontSize: 14, color: ink[500] },
  tenue: { fontFamily: fuentes.texto, fontSize: 13, color: ink[400] },
  enlace: { fontFamily: fuentes.textoFuerte, fontSize: 14, color: brand[700] },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  centro: { alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radios.chip, borderWidth: 1, borderColor: sand[300], backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 6 },
  chipPequeno: { paddingHorizontal: 12, paddingVertical: 4 },
  chipActivo: { backgroundColor: ink[900], borderColor: ink[900] },
  chipTexto: { fontFamily: fuentes.textoMedio, fontSize: 14, color: ink[700] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radios.chip, paddingHorizontal: 10, paddingVertical: 2, maxWidth: '100%' },
  badgeTexto: { fontFamily: fuentes.textoFuerte, fontSize: 12, lineHeight: 18 },
  vacio: { alignItems: 'center', borderRadius: radios.grande, borderWidth: 1, borderStyle: 'dashed', borderColor: sand[300], backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 24, paddingVertical: 48 },
  vacioIcono: { width: 56, height: 56, borderRadius: 16, backgroundColor: sand[100], alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  vacioTitulo: { fontFamily: fuentes.titulo, fontSize: 18, color: ink[900], textAlign: 'center' },
  vacioTexto: { marginTop: 6, fontFamily: fuentes.texto, fontSize: 14, color: ink[500], textAlign: 'center', lineHeight: 20 },
  error: { borderRadius: radios.tarjeta, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', paddingHorizontal: 20, paddingVertical: 16 },
  errorTexto: { fontFamily: fuentes.texto, fontSize: 14, color: '#991b1b' },
});
