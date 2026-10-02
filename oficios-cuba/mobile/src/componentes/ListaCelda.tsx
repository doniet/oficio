import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PuntoMapa } from '@oficio/shared';
import { tituloCelda } from '../lib/listaCelda';
import { PIN_POR_TIPO } from '../lib/pines';
import { fuentes, ink, radios, sand } from '../lib/tema';
import { u } from './ui';

/**
 * Los negocios de UNA celda del mapa, como CONTENIDO de la hoja: el envoltorio lo pone HojaPunto,
 * igual que con la ficha.
 *
 * Existe porque `detras` era solo una insignia: si una celda tenía cinco, se veía uno y los otros
 * cuatro eran inalcanzables. Es la misma interacción para el «+N» de un pin y para un área en modo
 * zona.
 */
export default function ListaCelda({ puntos, onElegir, onCerrar, error, onReintentar }: {
  puntos: PuntoMapa[];
  onElegir(p: PuntoMapa): void;
  onCerrar(): void;
  /** Mensaje si la celda no se pudo cargar. Con él se pinta «Reintentar». */
  error?: string;
  onReintentar?(): void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={e.cabecera}>
        <Text style={e.titulo}>{error ? tituloCelda(0) : tituloCelda(puntos.length)}</Text>
        <Pressable onPress={onCerrar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar la lista">
          <Ionicons name="close" size={22} color={ink[400]} />
        </Pressable>
      </View>

      {/* Sin esto, un fallo de red deja al usuario mirando una lista corta sin saber si la zona
          tiene eso o si algo se rompió. No es lo mismo y no puede parecerlo. */}
      {error ? (
        <View style={e.error} accessibilityRole="alert">
          <Text style={e.errorTexto}>{error}</Text>
          {onReintentar ? (
            <Pressable onPress={onReintentar} hitSlop={8} accessibilityRole="button">
              <Text style={e.errorEnlace}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {puntos.map((p) => {
        // Mismo par relleno+glifo que el pin del mapa (PIN_POR_TIPO), no el icono suelto de antes:
        // ese icono coloreado sobre fondo claro daba ≈2,2:1, bajo el 3:1 que WCAG pide para un
        // elemento gráfico. Puesto en un círculo relleno, el contraste pasa a ser glifo-contra-fondo,
        // que es el par que esa tabla sí tiene validado (ver el comentario de pines.ts).
        const { fondo, glifo } = PIN_POR_TIPO[p.tipo];
        // El color nunca puede ser el único canal: el tipo también se dice en texto aquí.
        const tipoTexto = p.tipo === 'negocio' ? 'Negocio' : 'Oficio';
        return (
          <Pressable
            key={p.id}
            onPress={() => onElegir(p)}
            accessibilityRole="button"
            accessibilityLabel={`${p.nombre}, ${tipoTexto}`}
            style={({ pressed }) => [e.fila, pressed && { backgroundColor: sand[100] }]}
          >
            <View style={[e.miniPin, { backgroundColor: fondo }]}>
              <Ionicons name="location" size={12} color={glifo} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={e.nombre} numberOfLines={1}>{p.nombre}</Text>
              {p.resumen ? <Text style={[u.suave, { fontSize: 13 }]} numberOfLines={1}>{p.resumen}</Text> : null}
            </View>
            {/* Que se sepa cuál es aproximado ANTES de entrar: si no, se leen todos como direcciones
                exactas y solo se descubre al abrir uno. */}
            {p.aproximado ? (
              <View style={e.zona}><Text style={e.zonaTexto}>Zona</Text></View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const e = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: sand[200],
  },
  titulo: { fontFamily: fuentes.textoNegrita, fontSize: 16, color: ink[900], flexShrink: 1 },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: sand[200] },
  nombre: { fontFamily: fuentes.textoFuerte, fontSize: 15, color: ink[900] },
  // Círculo pequeño, misma lógica que el pin del mapa a otra escala: un marcador de fila, no uno
  // sobre teselas, así que no lleva el borde blanco ni la sombra de aquel.
  miniPin: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  zona: {
    alignSelf: 'center', borderRadius: radios.chip, borderWidth: 1, borderStyle: 'dashed',
    borderColor: ink[300], paddingHorizontal: 8, paddingVertical: 2,
  },
  zonaTexto: { fontFamily: fuentes.textoFuerte, fontSize: 11, color: ink[700] },
  error: { paddingVertical: 8, gap: 4 },
  errorTexto: { fontFamily: fuentes.texto, fontSize: 13, color: '#991b1b' },
  errorEnlace: { fontFamily: fuentes.textoFuerte, fontSize: 13, color: '#991b1b', textDecorationLine: 'underline' },
});
