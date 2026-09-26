import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProviderCard } from '@oficio/shared';
import { fuentes, ink, sand } from '../lib/tema';
import { Avatar, Esqueleto, Insignia, InsigniaPlan, Portada, u, Valoracion } from './ui';

/**
 * ProviderCard de la web. Sin enlace: el perfil del profesional todavía no existe en la app
 * (sigue en la web), así que la tarjeta es informativa.
 */
export function TarjetaProfesional({ p }: { p: ProviderCard }) {
  const nombre = p.business_name || p.owner_name;
  const lugar = [p.municipality_name, p.province_name].filter(Boolean).join(', ');
  return (
    <View style={[u.tarjeta, { overflow: 'hidden' }]}>
      <View style={e.portada}>
        <Portada src={p.cover} semilla={p.categories[0] ?? nombre} />
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(to top, rgba(14,21,41,0.4), transparent)' }]} />
        <View style={{ position: 'absolute', top: 12, right: 12 }}><InsigniaPlan plan={p.subscription_plan} /></View>
      </View>
      <View style={e.cuerpo}>
        <Avatar src={p.avatar_url} nombre={nombre} tamano={64} cuadrado estilo={e.avatar} />
        <Text style={e.nombre}>{nombre}</Text>
        {lugar ? (
          <View style={[u.fila, { marginTop: 2 }]}>
            <Ionicons name="location-outline" size={14} color={ink[500]} />
            <Text style={u.suave} numberOfLines={1}>{lugar}</Text>
          </View>
        ) : null}
        {p.categories.length > 0 || p.kind === 'negocio' ? (
          <View style={e.etiquetas}>
            {p.kind === 'negocio' ? <Insignia tipo="negocio" /> : null}
            {p.categories.slice(0, 2).map((c) => <Insignia key={c} tipo="suave" texto={c} />)}
          </View>
        ) : null}
        <View style={e.pie}>
          <Valoracion rating={p.rating} count={p.review_count} />
          <Text style={[u.suave, { color: ink[400] }]}>{p.years_experience} años de oficio</Text>
        </View>
      </View>
    </View>
  );
}

export function TarjetaProfesionalEsqueleto() {
  return (
    <View style={[u.tarjeta, { overflow: 'hidden' }]}>
      <Esqueleto estilo={{ height: 112, borderRadius: 0 }} />
      <View style={[e.cuerpo, { gap: 12 }]}>
        <Esqueleto estilo={{ height: 64, width: 64, borderRadius: 16, marginTop: -32 }} />
        <Esqueleto estilo={{ height: 20, width: '60%' }} />
        <Esqueleto estilo={{ height: 16, width: '40%' }} />
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  portada: { height: 112, backgroundColor: sand[100], overflow: 'hidden' },
  cuerpo: { paddingHorizontal: 16, paddingBottom: 16 },
  avatar: { marginTop: -32, borderWidth: 4, borderColor: '#ffffff' },
  nombre: { marginTop: 8, fontFamily: fuentes.textoNegrita, fontSize: 17, lineHeight: 22, color: ink[900] },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  pie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16 },
});
