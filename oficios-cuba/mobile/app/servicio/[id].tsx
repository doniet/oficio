import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ErrorApi, esquemaMensaje, formatPrice, nombreVisible } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Campo } from '../../src/componentes/Campo';
import { Boton } from '../../src/componentes/Boton';
import { requiereSesion, useSesion } from '../../src/lib/contexto';
import { urlImagen } from '../../src/lib/api';
import { opcionesContacto } from '../../src/lib/contacto';
import { useTasa } from '../../src/lib/tasa';
import { colores, espacio, fuentes } from '../../src/lib/tema';

export default function Servicio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, usuario } = useSesion();
  const tasa = useTasa();
  const consulta = useQuery({ queryKey: ['servicio', id], queryFn: () => api.servicios.detalle(id) });
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  if (consulta.isLoading) {
    return (
      <Pantalla>
        <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave }}>Cargando…</Text>
      </Pantalla>
    );
  }

  if (consulta.isError || !consulta.data) {
    return (
      <Pantalla>
        <Text style={{ fontFamily: fuentes.texto, color: colores.tinta }}>
          {consulta.error instanceof ErrorApi ? consulta.error.message : 'No se pudo cargar el servicio.'}
        </Text>
        <Boton titulo="Reintentar" onPress={() => consulta.refetch()} />
      </Pantalla>
    );
  }

  const { service } = consulta.data;
  const contacto = opcionesContacto(service, usuario);

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

  return (
    <Pantalla>
      {service.images[0] ? (
        <Image source={urlImagen(service.images[0])} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16 }} contentFit="cover" cachePolicy="disk" />
      ) : null}
      <Text style={{ fontFamily: fuentes.titulo, fontSize: 24, color: colores.tinta }}>{service.title}</Text>
      <Text style={{ fontFamily: fuentes.textoFuerte, color: colores.tintaSuave }}>
        {nombreVisible(service)} · {service.municipality_name ?? service.province_name ?? ''}
      </Text>
      <Text style={{ fontFamily: fuentes.textoFuerte, fontSize: 18, color: colores.acento }}>{formatPrice(service, tasa)}</Text>
      {service.description ? <Text style={{ fontFamily: fuentes.texto, color: colores.tinta }}>{service.description}</Text> : null}

      {contacto.chat && !abierto ? <Boton titulo="Pedir presupuesto" onPress={pedirPresupuesto} /> : null}
      {contacto.whatsapp ? <Boton titulo="Escribir por WhatsApp" variante={contacto.chat ? 'secundario' : 'primario'} onPress={() => abrirExterno(contacto.whatsapp!, 'whatsapp')} /> : null}
      {contacto.llamar ? <Boton titulo="Llamar" variante={contacto.chat || contacto.whatsapp ? 'secundario' : 'primario'} onPress={() => abrirExterno(contacto.llamar!, 'call')} /> : null}
      {contacto.nada ? <Text style={{ fontFamily: fuentes.texto, color: colores.tintaSuave }}>Este profesional aún no ha puesto un teléfono de contacto.</Text> : null}
      {error && !abierto ? <Text style={{ fontFamily: fuentes.texto, color: colores.error }}>{error}</Text> : null}

      {abierto ? (
        <View style={{ gap: espacio(2) }}>
          <Campo etiqueta="Mensaje" value={mensaje} onChangeText={setMensaje} multiline numberOfLines={4} error={error} />
          <Boton titulo="Enviar solicitud" onPress={enviarSolicitud} cargando={enviando} />
        </View>
      ) : null}
    </Pantalla>
  );
}
