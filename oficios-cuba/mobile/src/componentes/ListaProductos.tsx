import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { precioCatalogo, type OrdenProductos, type ProductoMapa } from '@oficio/shared';
import { ORDENES_PRODUCTOS, lugarYDistancia, tituloListaProductos } from '../lib/productosMapa';
import { useTasa } from '../lib/tasa';
import { brand, fuentes, ink, radios, sand } from '../lib/tema';
import { Avatar, Esqueleto, Portada } from './ui';

export type PropsListaProductos = {
  dentro: ProductoMapa[];
  total: number;
  fuera: ProductoMapa[];
  orden: OrdenProductos;
  onOrden(o: OrdenProductos): void;
  cargando: boolean;
  error: string;
  onReintentar(): void;
  hayMas: boolean;
  cargandoMas: boolean;
  onVerMas(): void;
  onElegir(p: ProductoMapa, deFuera: boolean): void;
  /** El último producto tocado: su fila va marcada al volver de la ficha. */
  marcadoId?: string | null;
};

function Fila({ p, deFuera, marcado, onElegir }: {
  p: ProductoMapa; deFuera: boolean; marcado: boolean; onElegir: PropsListaProductos['onElegir'];
}) {
  const tasa = useTasa();
  const precio = precioCatalogo(p, tasa);
  const lugar = deFuera ? lugarYDistancia(p) : null;
  return (
    <Pressable
      onPress={() => onElegir(p, deFuera)}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${p.provider_name}, ${precio.prefijo ? `${precio.prefijo} ` : ''}${precio.cifra}${lugar ? `, ${lugar}` : ''}`}
      style={({ pressed }) => [e.fila, marcado && e.filaMarcada, pressed && { backgroundColor: sand[100] }]}
    >
      <View style={e.foto}>
        <Portada src={p.image} semilla={p.name} icono={p.name.trim().charAt(0).toUpperCase() || '·'} tamanoIcono={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={e.nombre} numberOfLines={2}>{p.name}</Text>
        <View style={e.negocio}>
          <Avatar src={p.provider_avatar} nombre={p.provider_name} tamano={16} />
          <Text style={e.negocioTexto} numberOfLines={1}>{p.provider_name}</Text>
        </View>
        {lugar ? <Text style={e.lugar} numberOfLines={1}>{lugar}</Text> : null}
      </View>
      {/* Lo que se compara es el precio: va solo, a la derecha, y es la columna que NO encoge —
          cede el nombre, que tiene dos líneas. Cada pieza en su línea («desde» encima, la cifra, la
          equivalencia debajo) para que la columna mida lo que la cifra y no corte un «120 000 CUP». */}
      <View style={e.precio}>
        {precio.prefijo ? <Text style={e.precioMenor} numberOfLines={1}>{precio.prefijo}</Text> : null}
        <Text style={e.precioCifra} numberOfLines={1}>{precio.cifra}</Text>
        {precio.alt ? <Text style={e.precioMenor} numberOfLines={1}>{precio.alt}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * Los productos de la zona visible, como CONTENIDO de la hoja (hermano de ListaCelda y FichaPunto;
 * el envoltorio lo pone HojaPunto). Gemelo de frontend/src/components/mapa/ListaProductos.tsx.
 */
export default function ListaProductos({
  onCerrar, dentro, total, fuera, orden, onOrden, cargando, error, onReintentar,
  hayMas, cargandoMas, onVerMas, onElegir, marcadoId,
}: PropsListaProductos & { onCerrar(): void }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={e.cabecera}>
        <View style={e.cabeceraFila}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={e.titulo} accessibilityRole="header">{tituloListaProductos({ total, cargando, error })}</Text>
            <Text style={e.sub}>Mueve el mapa para ver otros</Text>
          </View>
          <Pressable onPress={onCerrar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar la lista de productos">
            <Ionicons name="close" size={22} color={ink[400]} />
          </Pressable>
        </View>
        <View style={e.ordenes} accessibilityLabel="Ordenar productos">
          {ORDENES_PRODUCTOS.map(({ valor, etiqueta }) => (
            <Pressable
              key={valor}
              onPress={() => onOrden(valor)}
              accessibilityRole="button"
              accessibilityState={{ selected: orden === valor }}
              hitSlop={4}
              style={[e.orden, orden === valor && e.ordenActivo]}
            >
              <Text style={[e.ordenTexto, orden === valor && e.ordenTextoActivo]}>{etiqueta}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <View style={e.error} accessibilityRole="alert">
          <Text style={e.errorTexto}>{error}</Text>
          <Pressable onPress={onReintentar} hitSlop={8} accessibilityRole="button">
            <Text style={e.errorEnlace}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {cargando ? (
        <View style={{ gap: 14, paddingVertical: 8 }} accessibilityLabel="Buscando productos">
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Esqueleto estilo={{ width: 48, height: 48 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Esqueleto estilo={{ height: 14, width: '80%' }} />
                <Esqueleto estilo={{ height: 11, width: '35%' }} />
              </View>
              <Esqueleto estilo={{ height: 14, width: 56 }} />
            </View>
          ))}
        </View>
      ) : (
        <>
          {dentro.length === 0 && !error ? <Text style={e.vacio}>No hay productos en esta zona.</Text> : null}
          {dentro.map((p) => <Fila key={p.id} p={p} deFuera={false} marcado={p.id === marcadoId} onElegir={onElegir} />)}
          {hayMas ? (
            <Pressable
              onPress={onVerMas}
              disabled={cargandoMas}
              accessibilityRole="button"
              accessibilityState={{ disabled: cargandoMas, busy: cargandoMas }}
              style={[e.verMas, cargandoMas && { opacity: 0.6 }]}
            >
              <Text style={e.verMasTexto}>Ver más productos</Text>
            </Pressable>
          ) : null}

          {fuera.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <View style={e.fueraCabecera}>
                <Text style={e.fueraTitulo} accessibilityRole="header">Fuera de esta zona · {fuera.length}</Text>
                <Text style={e.sub}>Toca uno y el mapa se amplía para incluirlo</Text>
              </View>
              {fuera.map((p) => <Fila key={p.id} p={p} deFuera marcado={p.id === marcadoId} onElegir={onElegir} />)}
            </View>
          ) : null}

          {orden !== 'relevance' && (dentro.length > 0 || fuera.length > 0) ? (
            <Text style={[e.sub, { paddingTop: 10 }]}>
              Los precios en USD se comparan a la tasa de referencia. «A consultar» va al final.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  cabecera: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: sand[200], gap: 10 },
  cabeceraFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titulo: { fontFamily: fuentes.textoNegrita, fontSize: 16, color: ink[900] },
  sub: { fontFamily: fuentes.texto, fontSize: 12, lineHeight: 17, color: ink[400] },
  // En fila con salto y no en un carrusel: a 360 dp caben los tres, y un ScrollView horizontal
  // dentro del de la hoja pelearía con su gesto.
  ordenes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  orden: { borderWidth: 1, borderColor: sand[300], backgroundColor: '#ffffff', borderRadius: radios.chip, paddingHorizontal: 12, paddingVertical: 6 },
  ordenActivo: { borderColor: ink[900], backgroundColor: ink[900] },
  ordenTexto: { fontFamily: fuentes.textoFuerte, fontSize: 12, color: ink[500] },
  ordenTextoActivo: { color: '#ffffff' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: sand[200] },
  filaMarcada: { backgroundColor: brand[50] },
  foto: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: sand[100] },
  nombre: { fontFamily: fuentes.textoFuerte, fontSize: 14, lineHeight: 18, color: ink[900] },
  negocio: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  negocioTexto: { fontFamily: fuentes.texto, fontSize: 12, color: ink[500], flexShrink: 1 },
  lugar: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400] },
  precio: { alignItems: 'flex-end', flexShrink: 0 },
  precioCifra: { fontFamily: fuentes.titulo, fontSize: 14, color: ink[900] },
  precioMenor: { fontFamily: fuentes.texto, fontSize: 11, color: ink[400] },
  vacio: { fontFamily: fuentes.texto, fontSize: 14, color: ink[500], paddingVertical: 12 },
  verMas: {
    marginTop: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: sand[300], borderRadius: radios.campo, backgroundColor: '#ffffff',
  },
  verMasTexto: { fontFamily: fuentes.textoFuerte, fontSize: 14, color: ink[800] },
  fueraCabecera: { backgroundColor: sand[100], marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 10, gap: 2 },
  fueraTitulo: { fontFamily: fuentes.textoNegrita, fontSize: 14, color: ink[900] },
  error: { paddingVertical: 8, gap: 4 },
  errorTexto: { fontFamily: fuentes.texto, fontSize: 13, color: '#991b1b' },
  errorEnlace: { fontFamily: fuentes.textoFuerte, fontSize: 13, color: '#991b1b', textDecorationLine: 'underline' },
});
