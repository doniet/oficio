import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ErrorApi, esquemaMensaje, ETIQUETA_TIPO_PRECIO, precioDetalle, relativeTime, Review, ServiceDetail } from '@oficio/shared';
import { Campo } from '../../src/componentes/Campo';
import { Boton } from '../../src/componentes/Boton';
import { Avatar, EstadoError, EstadoVacio, Estrellas, Insignia, InsigniaPlan, Portada, Tarjeta, u, Valoracion } from '../../src/componentes/ui';
import { requiereSesion, useSesion } from '../../src/lib/contexto';
import { opcionesContacto } from '../../src/lib/contacto';
import { useTasa } from '../../src/lib/tasa';
import { fuentes, ink, paper, sand, sombra } from '../../src/lib/tema';

// Solo lectura: la app muestra las primeras; el resto y el formulario de reseña siguen en la web.
const RESEÑAS_VISIBLES = 3;

function BloquePrecio({ service }: { service: ServiceDetail }) {
  const tasa = useTasa();
  const p = precioDetalle(service, tasa);
  return (
    <View>
      {/* "A convenir" ya es la cifra: repetirlo como etiqueta encima sobra. */}
      {service.price_type !== 'negotiable' && p.alt ? <Text style={e.tipoPrecio}>{ETIQUETA_TIPO_PRECIO[service.price_type].toUpperCase()}</Text> : null}
      <Text style={e.cifra}>
        {p.principal}
        {p.sufijo ? <Text style={e.sufijo}> {p.sufijo}</Text> : null}
      </Text>
      {p.alt ? <Text style={[u.suave, { marginTop: 2 }]}>{p.alt} <Text style={{ color: ink[400] }}>· tasa informal</Text></Text> : null}
    </View>
  );
}

function Reseña({ r }: { r: Review }) {
  return (
    <View style={e.reseña}>
      <Avatar src={r.client_avatar} nombre={r.client_name} tamano={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={e.reseñaCabeza}>
          <Text style={[e.reseñaNombre, { flexShrink: 1 }]} numberOfLines={1}>{r.client_name}</Text>
          <Text style={[u.tenue, { fontSize: 12 }]}>{relativeTime(r.created_at)}</Text>
        </View>
        <View style={{ marginTop: 4 }}><Estrellas valor={r.rating} /></View>
        {r.comment ? <Text style={[u.texto, { marginTop: 8 }]}>{r.comment}</Text> : null}
      </View>
    </View>
  );
}

export default function Servicio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, usuario } = useSesion();
  const consulta = useQuery({ queryKey: ['servicio', id], queryFn: () => api.servicios.detalle(id) });
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  if (consulta.isLoading) {
    return <View style={[e.raiz, u.centro]}><Text style={u.suave}>Cargando…</Text></View>;
  }

  if (consulta.isError || !consulta.data) {
    const noExiste = consulta.error instanceof ErrorApi && consulta.error.status === 404;
    return (
      <View style={[e.raiz, { padding: 16, paddingTop: 24 }]}>
        {noExiste ? (
          <EstadoVacio icono="search-outline" titulo="Este servicio ya no está disponible" texto="Puede que el profesional lo haya pausado o eliminado."
            accion={<Boton titulo="Buscar otros servicios" onPress={() => router.navigate('/buscar')} />} />
        ) : (
          <EstadoError mensaje={consulta.error instanceof ErrorApi ? consulta.error.message : 'No pudimos cargar el servicio.'} alReintentar={() => consulta.refetch()} />
        )}
      </View>
    );
  }

  const { service, reviews } = consulta.data;
  const contacto = opcionesContacto(service, usuario);
  const nombre = service.business_name || service.owner_name;
  const lugar = [service.municipality_name, service.province_name].filter(Boolean).join(', ');

  function abrirExterno(url: string, via: 'whatsapp' | 'call') {
    // Constancia del contacto (sirve para poder reseñar). Si falla, no importa: lo importante es contactar.
    if (usuario?.user_type === 'client') api.proveedores.contacto(service.provider_id, via).catch(() => {});
    Linking.openURL(url).catch(() => setError(via === 'call' ? 'No se pudo abrir el teléfono.' : 'No se pudo abrir WhatsApp. ¿Lo tienes instalado?'));
  }

  function pedirPresupuesto() {
    if (!requiereSesion(router, usuario, `/servicio/${id}`)) return;
    setMensaje(`Hola, me interesa «${service.title}». ¿Tienes disponibilidad?`);
    setError(undefined);
    setAbierto(true);
  }

  async function enviarSolicitud() {
    const d = esquemaMensaje.safeParse({ content: mensaje });
    if (!d.success) return setError(d.error.issues[0].message);
    setEnviando(true);
    setError(undefined);
    try {
      const { conversation } = await api.conversaciones.crear({ provider_id: service.provider_id, service_id: id, initial_message: d.data.content });
      router.replace(`/conversacion/${conversation.id}`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const hayAcciones = !!(contacto.chat || contacto.whatsapp || contacto.llamar);

  return (
    <SafeAreaView style={e.raiz} edges={['bottom']}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.portada}>
          <Portada src={service.images[0]} semilla={service.parent_category_slug || service.category_slug} icono={service.category_icon} tamanoIcono={64} />
          {service.images.length > 1 ? (
            <View style={e.contadorFotos}>
              <Ionicons name="images-outline" size={13} color="#fff" />
              <Text style={[u.badgeTexto, { color: '#fff' }]}>{service.images.length}</Text>
            </View>
          ) : null}
        </View>

        <View>
          <Insignia tipo="suave" texto={`${service.category_icon} ${service.category_name}`} />
          <Text style={e.titulo}>{service.title}</Text>
          <View style={e.meta}>
            <Valoracion rating={service.rating} count={service.review_count} />
            {lugar ? (
              <View style={u.fila}>
                <Ionicons name="location-outline" size={15} color={ink[500]} />
                <Text style={u.suave}>{lugar}</Text>
              </View>
            ) : null}
            <View style={u.fila}>
              <Ionicons name="time-outline" size={15} color={ink[500]} />
              <Text style={u.suave}>Publicado {relativeTime(service.created_at)}</Text>
            </View>
          </View>
        </View>

        <View style={e.precio}>
          <BloquePrecio service={service} />
          {hayAcciones && !abierto ? (
            <View style={e.acciones}>
              {contacto.whatsapp ? (
                <Boton variante="whatsapp" icono="logo-whatsapp" titulo={contacto.chat ? undefined : 'WhatsApp'} etiquetaAccesible="Escribir por WhatsApp"
                  onPress={() => abrirExterno(contacto.whatsapp!, 'whatsapp')} estilo={contacto.chat ? e.cuadrado : { flex: 1 }} />
              ) : null}
              {contacto.llamar ? (
                <Boton variante="secundario" icono="call-outline" titulo={contacto.chat ? undefined : 'Llamar'} etiquetaAccesible="Llamar"
                  onPress={() => abrirExterno(contacto.llamar!, 'call')} estilo={contacto.chat ? e.cuadrado : { flex: 1 }} />
              ) : null}
              {contacto.chat ? <Boton titulo="Pedir presupuesto" icono="chatbubble-ellipses-outline" onPress={pedirPresupuesto} estilo={{ flex: 1 }} /> : null}
            </View>
          ) : null}
          {contacto.nada ? <Text style={[u.suave, { marginTop: 12 }]}>Este profesional aún no ha puesto un teléfono de contacto.</Text> : null}
          {error && !abierto ? <Text style={[u.suave, { marginTop: 12, color: '#b42318' }]}>{error}</Text> : null}
          {abierto ? (
            <View style={{ gap: 12, marginTop: 16 }}>
              <Campo etiqueta="Mensaje" value={mensaje} onChangeText={setMensaje} multiline numberOfLines={4} error={error} />
              <Boton titulo="Enviar solicitud" icono="send-outline" onPress={enviarSolicitud} cargando={enviando} />
              <Boton titulo="Cancelar" variante="fantasma" onPress={() => { setAbierto(false); setError(undefined); }} />
            </View>
          ) : null}
        </View>

        <View style={{ gap: 12 }}>
          <Text style={u.h3}>Sobre este servicio</Text>
          {service.description
            ? <Text style={u.texto}>{service.description}</Text>
            : <Text style={[u.texto, { color: ink[400] }]}>El profesional no añadió una descripción. Escríbele para conocer los detalles.</Text>}
        </View>

        <Tarjeta estilo={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
            <Avatar src={service.avatar_url} nombre={nombre} tamano={64} cuadrado />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={e.nombreProfesional}>{nombre}</Text>
              {service.subscription_plan === 'pro' || service.kind === 'negocio' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <InsigniaPlan plan={service.subscription_plan} />
                  {service.kind === 'negocio' ? <Insignia tipo="negocio" /> : null}
                </View>
              ) : null}
              {service.business_name ? <Text style={u.suave}>{service.owner_name}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4, marginTop: 2 }}>
                <Valoracion rating={service.rating} count={service.review_count} />
                {service.years_experience > 0 ? (
                  <View style={u.fila}>
                    <Ionicons name="briefcase-outline" size={15} color={ink[500]} />
                    <Text style={u.suave}>{service.years_experience} años de oficio</Text>
                  </View>
                ) : null}
              </View>
              {service.kind === 'negocio' && service.horario ? (
                <View style={[u.fila, { alignItems: 'flex-start' }]}>
                  <Ionicons name="time-outline" size={15} color={ink[500]} style={{ marginTop: 2 }} />
                  <Text style={[u.suave, { flex: 1 }]}>{service.horario}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {service.provider_description ? (
            <Text style={[u.texto, { fontSize: 14, color: ink[600], marginTop: 16 }]} numberOfLines={4}>{service.provider_description}</Text>
          ) : null}
        </Tarjeta>

        <Tarjeta estilo={{ padding: 20 }}>
          <Text style={u.h3}>Reseñas del servicio</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            <Valoracion rating={service.rating} count={service.review_count} />
            {service.review_count > 0 ? <Text style={[u.tenue, { fontSize: 12 }]}>(valoración general del profesional)</Text> : null}
          </View>
          {reviews.length === 0 ? (
            <Text style={[u.tenue, { fontSize: 14, textAlign: 'center', paddingVertical: 24 }]}>Este servicio todavía no tiene reseñas. ¡Sé el primero en contar tu experiencia!</Text>
          ) : (
            <View style={{ marginTop: 20 }}>
              {reviews.slice(0, RESEÑAS_VISIBLES).map((r, i) => (
                <View key={r.id} style={i > 0 ? e.separador : undefined}><Reseña r={r} /></View>
              ))}
            </View>
          )}
          {service.review_count > Math.min(reviews.length, RESEÑAS_VISIBLES) ? (
            <Text style={[u.tenue, { marginTop: 16 }]}>Todas las reseñas están en oficio.dardoit.com</Text>
          ) : null}
        </Tarjeta>
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: paper },
  contenido: { padding: 16, paddingTop: 8, gap: 24 },
  portada: { width: '100%', aspectRatio: 4 / 3, borderRadius: 24, overflow: 'hidden', backgroundColor: sand[100] },
  contadorFotos: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: 'rgba(22,33,62,0.7)' },
  titulo: { marginTop: 12, fontFamily: fuentes.titulo, fontSize: 30, lineHeight: 35, color: ink[900], letterSpacing: -0.5 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8, marginTop: 12 },
  precio: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, ...sombra.card },
  tipoPrecio: { fontFamily: fuentes.textoFuerte, fontSize: 12, letterSpacing: 0.6, color: ink[400] },
  cifra: { fontFamily: fuentes.titulo, fontSize: 24, lineHeight: 30, color: ink[900] },
  sufijo: { fontFamily: fuentes.textoFuerte, fontSize: 16, color: ink[400] },
  acciones: { flexDirection: 'row', gap: 8, marginTop: 16 },
  cuadrado: { width: 48, paddingHorizontal: 0 },
  nombreProfesional: { fontFamily: fuentes.textoNegrita, fontSize: 18, lineHeight: 23, color: ink[900] },
  reseña: { flexDirection: 'row', gap: 12 },
  reseñaCabeza: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  reseñaNombre: { fontFamily: fuentes.textoFuerte, fontSize: 15, color: ink[900] },
  separador: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: sand[200] },
});
