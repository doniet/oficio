import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CatalogItem, ContactMode, ErrorApi, esquemaMensaje, precioCatalogo, telLink, whatsappLink } from '@oficio/shared';
import { Boton } from './Boton';
import { Campo } from './Campo';
import { Aviso, Insignia, Portada, u } from './ui';
import { accionArticulo, mensajeArticulo } from '../lib/perfil';
import { requiereSesion, useSesion } from '../lib/contexto';
import { useTasa } from '../lib/tasa';
import { fuentes, ink, paper, sand } from '../lib/tema';

/** Lo que hace falta saber del dueño del catálogo para poder escribirle por un artículo. */
export interface VendedorCatalogo {
  id: string;
  nombre: string;
  whatsapp?: string | null;
  contactMode: ContactMode;
  hasChat: boolean;
}

/**
 * Detalle de un artículo del catálogo y contacto sobre ESE artículo — el `CatalogItemModal` de la
 * web. Existe porque la tarjeta del catálogo no cabe la `description`: sin este modal, el texto que
 * el profesional escribió de su producto no se alcanza desde la app por ningún camino.
 *
 * Se monta solo cuando hay artículo abierto (el padre hace `{abierto ? <ModalArticulo …/> : null}`),
 * así que `item` nunca es nulo y el estado del formulario nace limpio en cada apertura sin tener
 * que reiniciarlo a mano.
 *
 * Cierra por las tres vías que un usuario de Android espera: el botón ✕, el Atrás del sistema
 * (`onRequestClose`) y tocando fuera de la hoja (el `Pressable` del fondo).
 */
export function ModalArticulo({ item, vendedor, alCerrar }: { item: CatalogItem; vendedor: VendedorCatalogo; alCerrar: () => void }) {
  const { api, usuario } = useSesion();
  const tasa = useTasa();
  const [escribiendo, setEscribiendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string>();

  const precio = precioCatalogo(item, tasa);
  const mensaje = mensajeArticulo(item, [precio.prefijo, precio.cifra].filter(Boolean).join(' '));
  const accion = accionArticulo(item.available);

  const tel = vendedor.whatsapp?.trim() || null;
  const conWhatsapp = tel && vendedor.contactMode !== 'call' ? tel : null;
  const conLlamada = tel && vendedor.contactMode !== 'whatsapp' ? tel : null;
  const esCliente = usuario?.user_type === 'client';

  function abrirChat() {
    if (!requiereSesion(router, usuario, `/proveedor/${vendedor.id}`)) return;
    setTexto(mensaje);
    setError(undefined);
    setEscribiendo(true);
  }

  function abrirExterno(url: string, via: 'whatsapp' | 'call') {
    // Constancia del contacto (sirve para poder reseñar). Si falla, no importa: lo que importa es contactar.
    if (usuario?.user_type === 'client') api.proveedores.contacto(vendedor.id, via).catch(() => {});
    Linking.openURL(url).catch(() => setError(via === 'call' ? 'No se pudo abrir el teléfono.' : 'No se pudo abrir WhatsApp. ¿Lo tienes instalado?'));
  }

  async function enviar() {
    const d = esquemaMensaje.safeParse({ content: texto });
    if (!d.success) return setError(d.error.issues[0].message);
    setEnviando(true);
    setError(undefined);
    try {
      const { conversation } = await api.conversaciones.crear({ provider_id: vendedor.id, initial_message: d.data.content });
      alCerrar();
      router.replace(`/conversacion/${conversation.id}`);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={alCerrar}>
      <View style={e.fondo}>
        {/* Tocar fuera cierra. Va DETRÁS de la hoja (misma pila, pintado antes), así que los toques
            dentro de la hoja no lo alcanzan y no hace falta frenar la propagación a mano. */}
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={alCerrar} />
        <View style={e.hoja}>
          <View style={e.cabecera}>
            <Text style={[u.h3, { flex: 1 }]} numberOfLines={2}>{item.name}</Text>
            <Pressable onPress={alCerrar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color={ink[400]} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={e.cuerpo} keyboardShouldPersistTaps="handled">
            <View style={e.foto}>
              {/* Sin foto cae a la inicial del nombre, igual que la tarjeta del catálogo. */}
              <Portada src={item.image} semilla={item.name} icono={item.name.trim().charAt(0).toUpperCase() || '·'} tamanoIcono={64} />
            </View>

            <View style={e.insignias}>
              {item.section ? <Insignia tipo="suave" texto={item.section} /> : null}
              {!item.available ? (
                <View style={e.agotado}><Text style={[u.badgeTexto, { color: '#ffffff' }]}>Agotado</Text></View>
              ) : null}
              <Text style={u.suave} numberOfLines={1}>de {vendedor.nombre}</Text>
            </View>

            <View>
              <Text numberOfLines={1}>
                {precio.prefijo ? <Text style={e.menor}>{precio.prefijo} </Text> : null}
                <Text style={e.cifra}>{precio.cifra}</Text>
              </Text>
              {precio.alt ? <Text style={[e.menor, { marginTop: 2 }]}>{precio.alt}</Text> : null}
            </View>

            {item.description ? <Text style={u.texto}>{item.description}</Text> : null}

            <View style={e.separador}>
              {escribiendo ? (
                <View style={{ gap: 12 }}>
                  <Campo
                    etiqueta={`Tu mensaje a ${vendedor.nombre}`}
                    value={texto}
                    onChangeText={setTexto}
                    multiline
                    numberOfLines={4}
                    error={error}
                  />
                  <Boton titulo="Enviar" icono="send-outline" onPress={enviar} cargando={enviando} />
                  <Boton titulo="Volver" variante="fantasma" onPress={() => { setEscribiendo(false); setError(undefined); }} />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {usuario?.user_type === 'provider' && vendedor.hasChat ? (
                    <Aviso tono="info">Estás usando una cuenta profesional. Para escribir por el chat necesitas una cuenta de cliente.</Aviso>
                  ) : null}
                  {vendedor.hasChat && (!usuario || esCliente) ? (
                    <Boton titulo={usuario ? accion : `${accion} (entra para escribir)`} icono="chatbubble-ellipses-outline" onPress={abrirChat} />
                  ) : null}
                  {conWhatsapp ? (
                    <Boton
                      titulo={vendedor.hasChat ? 'Por WhatsApp' : accion}
                      variante={vendedor.hasChat ? 'secundario' : 'whatsapp'}
                      icono="logo-whatsapp"
                      onPress={() => abrirExterno(whatsappLink(conWhatsapp, mensaje), 'whatsapp')}
                    />
                  ) : null}
                  {conLlamada ? (
                    <Boton
                      titulo={!vendedor.hasChat && !conWhatsapp ? `${accion}: llamar` : `Llamar a ${vendedor.nombre}`}
                      variante={!vendedor.hasChat && !conWhatsapp ? 'primario' : 'secundario'}
                      icono="call-outline"
                      onPress={() => abrirExterno(telLink(conLlamada), 'call')}
                    />
                  ) : null}
                  {!vendedor.hasChat && !tel ? (
                    <Text style={[u.suave, { textAlign: 'center' }]}>Este profesional no ha dejado un teléfono de contacto.</Text>
                  ) : null}
                  {error ? <Text style={[u.suave, { color: '#b42318' }]}>{error}</Text> : null}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,23,26,0.5)' },
  // Hoja inferior, como el `Modal` de la web en móvil (ui.tsx:206, `items-end` + `rounded-t-3xl`).
  hoja: { maxHeight: '92%', backgroundColor: paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20, paddingBottom: 12 },
  cuerpo: { paddingHorizontal: 20, paddingBottom: 28, gap: 16 },
  foto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, overflow: 'hidden', backgroundColor: sand[100] },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  agotado: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: ink[900] },
  cifra: { fontFamily: fuentes.titulo, fontSize: 24, color: ink[900] },
  menor: { fontFamily: fuentes.texto, fontSize: 12, color: ink[400] },
  separador: { borderTopWidth: 1, borderTopColor: sand[200], paddingTop: 16 },
});
