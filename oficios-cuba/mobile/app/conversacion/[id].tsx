import { useEffect, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { ErrorApi, esquemaMensaje, Message, shortTime } from '@oficio/shared';
import { Boton } from '../../src/componentes/Boton';
import { chatVacio, trasEnviar, trasSondeo } from '../../src/lib/chat';
import { useSesion } from '../../src/lib/contexto';
import { colores, espacio, fuentes } from '../../src/lib/tema';

export default function Conversacion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, usuario } = useSesion();
  const navegacion = useNavigation();
  const [mensajes, setMensajes] = useState<Message[]>([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  // Ref (no estado) para que sondeo y envío partan siempre del último valor, sin carreras de render.
  const chat = useRef(chatVacio);

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setInterval> | undefined;
    async function traer() {
      try {
        const r = await api.conversaciones.detalle(id, chat.current.cursor);
        if (!vivo) return;
        if (!chat.current.cursor) navegacion.setOptions({ title: usuario?.user_type === 'client' ? r.conversation.provider_name : r.conversation.client_name });
        chat.current = trasSondeo(chat.current, r.messages);
        setMensajes(chat.current.mensajes);
        setError(undefined);
      } catch (e) { if (vivo) setError(e instanceof ErrorApi ? e.message : 'No se pudo actualizar'); }
    }
    // Sondeo solo en primer plano: en segundo plano no se gastan datos.
    const iniciar = () => { void traer(); reloj = setInterval(traer, 10_000); };
    const parar = () => { if (reloj) clearInterval(reloj); reloj = undefined; };
    iniciar();
    const sub = AppState.addEventListener('change', (e) => (e === 'active' ? (parar(), iniciar()) : parar()));
    return () => { vivo = false; parar(); sub.remove(); };
  }, [api, id]);

  async function enviar() {
    const d = esquemaMensaje.safeParse({ content: texto });
    if (!d.success) return;
    setEnviando(true);
    try {
      const { message } = await api.conversaciones.enviar(id, d.data.content);
      chat.current = trasEnviar(chat.current, message);
      setMensajes(chat.current.mensajes);
      setTexto(''); setError(undefined);
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar. Inténtalo de nuevo.'); }
    finally { setEnviando(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colores.fondo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={mensajes}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: espacio(4), gap: espacio(2) }}
        renderItem={({ item }) => {
          const mio = item.sender_type === usuario?.user_type;
          return (
            <View style={{ alignSelf: mio ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: mio ? colores.acento : colores.superficie, borderRadius: 16, padding: espacio(3) }}>
              <Text style={{ fontFamily: fuentes.texto, color: mio ? colores.acentoTexto : colores.tinta }}>{item.content}</Text>
              <Text style={{ fontSize: 11, marginTop: 2, color: mio ? colores.acentoTexto : colores.tintaTenue }}>{shortTime(item.created_at)}</Text>
            </View>
          );
        }}
      />
      {error ? <Text style={{ color: colores.error, paddingHorizontal: espacio(4) }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: espacio(2), padding: espacio(3), borderTopWidth: 1, borderColor: colores.borde, backgroundColor: colores.superficie }}>
        <TextInput value={texto} onChangeText={setTexto} placeholder="Escribe un mensaje" multiline maxLength={2000} accessibilityLabel="Mensaje"
          style={{ flex: 1, minHeight: 44, maxHeight: 120, fontFamily: fuentes.texto, fontSize: 16, color: colores.tinta }} />
        <Boton titulo="Enviar" onPress={enviar} cargando={enviando} deshabilitado={!texto.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}
