import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import type { PuntoMapa, ProviderPublic } from '@oficio/shared';
import { telLink, whatsappLink } from '@oficio/shared';
import { Boton } from './Boton';
import { Avatar, EstadoError, Insignia, Valoracion, u } from './ui';
import { useSesion } from '../lib/contexto';
import { configApi } from '../lib/api';
import { atrasCierraHoja } from '../lib/hojaPunto';
import { fuentes, ink, radios, sand } from '../lib/tema';

// Dos anclajes (30 % / 85 %). Se exportan porque explorar.tsx los necesita para reservar el
// espacio del mapa y que su botón «Buscar en esta zona» no quede tapado — ver el comentario
// junto a `altoReservadoMapa` en explorar.tsx. En la web ese acoplamiento lo resolvía una
// variable CSS que el mapa leía en vivo; en React Native no hay nada parecido a una variable
// global de layout, así que aquí se resuelve con dos números compartidos entre ambos archivos.
export const ANCLA_ASOMADA = 0.3;
export const ANCLA_ABIERTA = 0.85;
const PUNTOS_ANCLAJE = [`${ANCLA_ASOMADA * 100}%`, `${ANCLA_ABIERTA * 100}%`];

// El origen web (oficio.dardoit.com, sin el /api final): la app todavía no tiene una pantalla
// propia de perfil de profesional (ver TarjetaProfesional.tsx), así que «ver el perfil completo»
// abre la ficha real que sí existe, en la web.
const origenWeb = () => configApi.baseUrl.replace(/\/api$/, '');

// Mismo valor que el timeout interno de crearCliente (shared/src/api.ts), el axios de la web
// (frontend/src/services/api.ts) y el que ya usa mobile/src/lib/mapa.ts para su propio fetch
// duplicado: `fetch` no tiene tiempo de espera propio, así que sin esto una conexión cubana
// lenta que se cuelga deja «Cargando…» para siempre.
const TIEMPO_ESPERA_MS = 20000;

async function pedirProveedor(id: string, signal: AbortSignal): Promise<ProviderPublic> {
  const res = await fetch(`${configApi.baseUrl}/providers/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error('No se pudo cargar la ficha');
  const datos = (await res.json()) as { provider: ProviderPublic };
  return datos.provider;
}

/** Ficha completa (rating, descripción, categorías, contacto) — solo se pide al desplegar la hoja. */
function FichaCompleta({ punto }: { punto: PuntoMapa }) {
  const { usuario, api } = useSesion();
  const [perfil, setPerfil] = useState<ProviderPublic | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  // Reintentar (tras un error o una expiración) sin duplicar el efecto de abajo: solo cambia esto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    // Igual que `cargar()` en mobile/src/lib/mapa.ts: un abort porque cambió el punto o el
    // componente se desmontó (limpieza de abajo) no es un error que mostrar; uno porque expiró
    // el tiempo de espera sí lo es, y hay que soltar `cargando` en vez de dejarlo eterno.
    let expiroPorTiempo = false;
    const tiempoEspera = setTimeout(() => { expiroPorTiempo = true; control.abort(); }, TIEMPO_ESPERA_MS);
    setPerfil(null);
    setError(false);
    setCargando(true);
    pedirProveedor(punto.id, control.signal)
      .then((p) => {
        clearTimeout(tiempoEspera);
        if (control.signal.aborted) return;
        setPerfil(p);
        setCargando(false);
      })
      .catch(() => {
        clearTimeout(tiempoEspera);
        if (control.signal.aborted && !expiroPorTiempo) return;
        setError(true);
        setCargando(false);
      });
    return () => { clearTimeout(tiempoEspera); control.abort(); };
  }, [punto.id, intento]);

  if (cargando) {
    return <View style={{ paddingVertical: 24, alignItems: 'center' }}><Text style={u.suave}>Cargando…</Text></View>;
  }
  if (error || !perfil) {
    return <EstadoError mensaje="No pudimos cargar la ficha completa." alReintentar={() => setIntento((n) => n + 1)} />;
  }

  const lugar = [perfil.municipality_name, perfil.province_name].filter(Boolean).join(', ');
  const telefono = perfil.whatsapp?.trim() || null;
  const mostrarWhatsapp = !!telefono && perfil.contact_mode !== 'call';
  const mostrarLlamar = !!telefono && perfil.contact_mode !== 'whatsapp';

  function contactar(via: 'whatsapp' | 'call') {
    // Constancia del contacto (habilita la reseña); si falla, no bloquea abrir WhatsApp/llamar.
    if (usuario?.user_type === 'client') api.proveedores.contacto(punto.id, via).catch(() => {});
    const url = via === 'whatsapp' ? whatsappLink(telefono!, `Hola, vi tu perfil en Encuentrauno y me gustaría consultarte un trabajo.`) : telLink(telefono!);
    Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={{ gap: 12 }}>
      <Valoracion rating={perfil.rating} count={perfil.review_count} />
      {perfil.description ? <Text style={u.texto}>{perfil.description}</Text> : null}
      {lugar ? <Text style={u.suave}>{lugar}</Text> : null}
      {perfil.kind === 'negocio' && perfil.horario ? <Text style={u.suave}>Horario: {perfil.horario}</Text> : null}
      {perfil.categories.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {perfil.categories.map((c) => <Insignia key={c} tipo="suave" texto={c} />)}
        </View>
      ) : null}
      {mostrarWhatsapp || mostrarLlamar ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {mostrarWhatsapp ? <Boton variante="whatsapp" icono="logo-whatsapp" titulo="WhatsApp" onPress={() => contactar('whatsapp')} estilo={{ flex: 1 }} /> : null}
          {mostrarLlamar ? <Boton variante="secundario" icono="call-outline" titulo="Llamar" onPress={() => contactar('call')} estilo={{ flex: 1 }} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Hoja inferior que se abre al tocar un punto del mapa. La monta explorar.tsx (no MapaExplorar):
 * el mapa solo avisa con `onAbrir`, quién está abierto vive en la pantalla, igual que en la web.
 */
export default function HojaPunto({ punto, onCerrar, onCambiaIndice }: {
  punto: PuntoMapa | null;
  onCerrar(): void;
  /**
   * -1 cerrada, 0 asomada, 1 abierta. Opcional: solo lo usa explorar.tsx para reservar el alto
   * del mapa (ver el comentario junto a ANCLA_ASOMADA arriba). Nadie más depende de esto.
   */
  onCambiaIndice?(indice: number): void;
}) {
  const sheetRef = useRef<BottomSheet>(null);
  // El botón físico Atrás y el cierre por `onClose` de la propia hoja necesitan la última
  // versión de `punto`/`onCerrar` sin volver a suscribirse: por eso van en refs, no en deps.
  const puntoRef = useRef(punto);
  const onCerrarRef = useRef(onCerrar);
  puntoRef.current = punto;
  onCerrarRef.current = onCerrar;
  // Solo para decidir cuándo pedir la ficha completa (ver más abajo): la hoja empieza asomada,
  // así que la primera vez que se abre un punto no debe disparar la petición todavía.
  const [indiceActual, setIndiceActual] = useState(-1);

  // Al abrir un punto (o cambiar a otro con la hoja ya abierta) vuelve siempre a "asomada",
  // igual que en la web. Cuando punto pasa a null se cierra (arrastre, X, fondo o Atrás ya
  // dejaron a `punto` en null antes de que esto se dispare — ver más abajo).
  useEffect(() => {
    if (punto) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [punto?.id]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!atrasCierraHoja(puntoRef.current)) return false;
      // No se llama a onCerrar directo: se le pide a la hoja que se cierre con su propia
      // animación, y es su `onClose` (más abajo) quien avisa al padre cuando ya terminó.
      sheetRef.current?.close();
      return true;
    });
    return () => sub.remove();
  }, []);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" opacity={0.3} />
  ), []);

  const verPerfil = useCallback(() => {
    if (!puntoRef.current) return;
    Linking.openURL(`${origenWeb()}/proveedor/${puntoRef.current.id}`).catch(() => {});
  }, []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={PUNTOS_ANCLAJE}
      // Con snapPoints explícitos y el "dynamic sizing" (activado por defecto) puesto, la
      // librería espera a medir el contenido y puede insertar un tercer anclaje por su cuenta —
      // rompería el supuesto de este archivo de que el índice 0 es "asomada" y el 1 "abierta".
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={() => onCerrarRef.current()}
      onChange={(indice) => { setIndiceActual(indice); onCambiaIndice?.(indice); }}
      backdropComponent={renderBackdrop}
      backgroundStyle={e.fondo}
      handleIndicatorStyle={e.asa}
      accessibilityLabel={punto ? `Ficha de ${punto.nombre}` : 'Ficha del punto seleccionado'}
    >
      <BottomSheetScrollView contentContainerStyle={e.contenido}>
        {punto ? (
          <>
            <View style={e.cabecera}>
              <Avatar nombre={punto.nombre} tamano={48} cuadrado={punto.tipo === 'negocio'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <Text style={e.nombre} numberOfLines={1}>{punto.nombre}</Text>
                  {punto.tipo === 'negocio' ? <Insignia tipo="negocio" /> : null}
                </View>
                {punto.resumen ? <Text style={[u.suave, e.resumen]} numberOfLines={2}>{punto.resumen}</Text> : null}
              </View>
              <Pressable onPress={() => sheetRef.current?.close()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar la ficha">
                <Ionicons name="close" size={22} color={ink[400]} />
              </Pressable>
            </View>

            <Pressable onPress={verPerfil} accessibilityRole="link" hitSlop={6}>
              <Text style={u.enlace}>Ver perfil completo</Text>
            </Pressable>

            {/* La ficha completa se pide a la API solo al desplegar (igual que en la web): a
                "asomada" ya alcanza con el resumen y el enlace de arriba. */}
            {indiceActual === 1 ? (
              <>
                <View style={e.separador} />
                <FichaCompleta punto={punto} />
              </>
            ) : null}
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const e = StyleSheet.create({
  fondo: { borderTopLeftRadius: radios.grande, borderTopRightRadius: radios.grande },
  asa: { backgroundColor: sand[300], width: 40 },
  contenido: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nombre: { fontFamily: fuentes.textoNegrita, fontSize: 17, color: ink[900], flexShrink: 1 },
  resumen: { marginTop: 2 },
  separador: { height: 1, backgroundColor: sand[200], marginTop: 4 },
});
