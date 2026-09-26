import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { nombreVisible, priceFrom, ServiceSummary } from '@oficio/shared';
import { useTasa } from '../lib/tasa';
import { fuentes, ink, sand } from '../lib/tema';
import { Esqueleto, Insignia, InsigniaPlan, Portada, u, Valoracion } from './ui';

/** ServiceCard de la web. */
export function TarjetaServicio({ s }: { s: ServiceSummary }) {
  const tasa = useTasa();
  const precio = priceFrom(s, tasa);
  const lugar = [s.municipality_name, s.province_name].filter(Boolean).join(', ');
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={s.title} onPress={() => router.push(`/servicio/${s.id}`)}
      style={({ pressed }) => [u.tarjeta, e.tarjeta, pressed && { opacity: 0.92 }]}>
      <View style={e.foto}>
        <Portada src={s.cover} semilla={s.parent_category_slug || s.category_slug} icono={s.category_icon} />
        <View style={e.insignias}>
          <Insignia tipo="blanca" texto={`${s.category_icon} ${s.category_name}`} />
          {s.kind === 'negocio' ? <Insignia tipo="negocio" /> : null}
        </View>
        {s.image_count > 1 ? (
          <View style={e.fotos}>
            <Ionicons name="images-outline" size={13} color="#fff" />
            <Text style={[u.badgeTexto, { color: '#fff' }]}>{s.image_count}</Text>
          </View>
        ) : null}
      </View>
      <View style={e.cuerpo}>
        <View style={e.filaArriba}>
          <Valoracion rating={s.rating} count={s.review_count} />
          <InsigniaPlan plan={s.subscription_plan} />
        </View>
        <Text style={e.titulo} numberOfLines={2}>{s.title}</Text>
        <Text style={e.negocio} numberOfLines={1}>{nombreVisible(s)}</Text>
        <View style={e.pie}>
          {lugar ? (
            <View style={[u.fila, { flexShrink: 1 }]}>
              <Ionicons name="location-outline" size={14} color={ink[400]} />
              <Text style={e.lugar} numberOfLines={1}>{lugar}</Text>
            </View>
          ) : <View />}
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <Text numberOfLines={1}>
              {precio.prefix ? <Text style={e.menor}>{precio.prefix} </Text> : null}
              <Text style={e.precio}>{precio.amount}</Text>
              {precio.suffix ? <Text style={e.menor}> {precio.suffix}</Text> : null}
            </Text>
            {precio.alt ? <Text style={[e.menor, { marginTop: 2 }]}>{precio.alt}</Text> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function TarjetaServicioEsqueleto() {
  return (
    <View style={[u.tarjeta, e.tarjeta]}>
      <Esqueleto estilo={[e.foto, { borderRadius: 0 }]} />
      <View style={[e.cuerpo, { gap: 12 }]}>
        <Esqueleto estilo={{ height: 16, width: 96 }} />
        <Esqueleto estilo={{ height: 20, width: '80%' }} />
        <Esqueleto estilo={{ height: 16, width: '50%' }} />
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  tarjeta: { overflow: 'hidden' },
  foto: { width: '100%', aspectRatio: 4 / 3, backgroundColor: sand[100], overflow: 'hidden' },
  insignias: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fotos: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: 'rgba(22,33,62,0.7)' },
  cuerpo: { padding: 16 },
  filaArriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  titulo: { fontFamily: fuentes.textoNegrita, fontSize: 16.5, lineHeight: 22, color: ink[900] },
  negocio: { marginTop: 4, fontFamily: fuentes.texto, fontSize: 14, color: ink[500] },
  pie: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 16 },
  lugar: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400], flexShrink: 1 },
  precio: { fontFamily: fuentes.titulo, fontSize: 18, color: ink[900] },
  menor: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400] },
});
