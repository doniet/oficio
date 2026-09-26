import { useEffect, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorApi, esquemaMensaje, Message, shortTime } from '@oficio/shared';
import { Boton } from '../../src/componentes/Boton';
import { chatVacio, trasEnviar, trasSondeo } from '../../src/lib/chat';
import { useSesion } from '../../src/lib/contexto';
import { brand, colores, espacio, fuentes, ink, paper, sand } from '../../src/lib/tema';

export default function Conversacion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, usuario } = useSesion();
  const navegacion = useNavigation();
  // La fila de escribir va pegada abajo: sin el margen inferior, Enviar queda bajo la barra de gestos.
  const abajo = useSafeAreaInsets().bottom;
  const [mensajes, setMensajes] = useState<Message[]>([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  // 403 al enviar = el profesional ya no tiene el plan con chat: se lee, pero no se puede escribir.
  const [cerrado, setCerrado] = useState<string>();
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
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 403) { setCerrado(e.message); setError(undefined); }
      else setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar. Inténtalo de nuevo.');
    }
    finally { setEnviando(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={mensajes}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: espacio(4), gap: espacio(2) }}
        renderItem={({ item }) => {
          const mio = item.sender_type === usuario?.user_type;
          return (
            <View style={[s.burbuja, mio ? s.mia : s.suya]}>
              <Text style={[s.texto, { color: mio ? '#ffffff' : ink[900] }]}>{item.content}</Text>
              <Text style={[s.hora, { color: mio ? brand[100] : ink[400] }]}>{shortTime(item.created_at)}</Text>
            </View>
          );
        }}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      {cerrado ? (
        <View style={[s.barra, { flexDirection: 'row', gap: espacio(3), padding: espacio(4), paddingBottom: espacio(4) + abajo }]}>
          <Ionicons name="lock-closed-outline" size={16} color={ink[400]} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontFamily: fuentes.texto, fontSize: 14, color: ink[600] }}>{cerrado}</Text>
        </View>
      ) : (
      <View style={[s.barra, { flexDirection: 'row', alignItems: 'flex-end', gap: espacio(2), padding: espacio(3), paddingBottom: espacio(3) + abajo }]}>
        <TextInput value={texto} onChangeText={setTexto} placeholder="Escribe un mensaje…" placeholderTextColor={ink[300]} multiline maxLength={2000} accessibilityLabel="Mensaje"
          style={s.entrada} />
        <Boton icono="send" etiquetaAccesible="Enviar mensaje" onPress={enviar} cargando={enviando} deshabilitado={!texto.trim()} estilo={s.enviar} />
      </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  burbuja: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, boxShadow: '0px 1px 2px rgba(0,0,0,0.05)' },
  mia: { alignSelf: 'flex-end', backgroundColor: brand[600], borderBottomRightRadius: 6 },
  suya: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderBottomLeftRadius: 6 },
  texto: { fontFamily: fuentes.texto, fontSize: 15, lineHeight: 20 },
  hora: { alignSelf: 'flex-end', fontFamily: fuentes.texto, fontSize: 11, marginTop: 2 },
  error: { color: colores.error, fontFamily: fuentes.texto, paddingHorizontal: espacio(4), paddingBottom: espacio(2) },
  barra: { borderTopWidth: 1, borderColor: sand[200], backgroundColor: '#ffffff' },
  entrada: { flex: 1, minHeight: 44, maxHeight: 140, borderWidth: 1, borderColor: sand[300], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fuentes.texto, fontSize: 15, color: ink[900], backgroundColor: '#ffffff' },
  enviar: { width: 44, minHeight: 44, paddingHorizontal: 0 },
});
