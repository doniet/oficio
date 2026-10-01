import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  type CameraRef,
  Map as MapaLibre,
  Marker,
  type MapRef,
  type LngLatBounds,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { ZONA_DESDE_GRADOS, type Bbox, type PuntoMapa } from '@oficio/shared';
import { acotarACuba, acotarBbox, CUBA, usarMapa } from '../lib/mapa';
import { contenidoDeCelda } from '../lib/panelMapa';
import { PIN_POR_TIPO } from '../lib/pines';
import { brand, fuentes, ink, radios, sand, sombra } from '../lib/tema';

// Solo OpenStreetMap: mismas teselas que Leaflet en la web, sin clave de API. `attribution` en
// la fuente es lo que exige la política de uso de OSM (aparece al tocar el botón de atribución).
const ESTILO_OSM: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  // Estilo Positron sin cambiar de teselas (mismo ajuste que el filtro CSS de la web, en
  // frontend/src/index.css): tierra casi lisa, mar gris azulado, y los pines como único color.
  layers: [{
    id: 'osm',
    type: 'raster',
    source: 'osm',
    paint: { 'raster-saturation': -0.78, 'raster-contrast': -0.2, 'raster-brightness-min': 0.1 },
  }],
};

const LIMITES_CUBA: LngLatBounds = [CUBA.oeste, CUBA.sur, CUBA.este, CUBA.norte];
// Centro geográfico aproximado de Cuba, con zoom para ver la isla completa al abrir.
const CENTRO_INICIAL: [number, number] = [-79.5, 21.55];
const ZOOM_INICIAL = 6.3;
// Zoom al que se acerca «Cerca de mí»: nivel de ciudad, suficiente para distinguir profesionales cercanos.
const ZOOM_CERCA_DE_MI = 13;
// Diferencia de zoom mínima para tratar un cambio de región como "hizo zoom" y no como paneo.
// Valor empírico sin verificar en hardware real (no hay emulador en este host): al probar en un
// teléfono, comprobar que un pinch-zoom real siempre cruza este umbral y que la inercia de un
// paneo nunca lo cruza por sí sola — si no, ajustar aquí.
const UMBRAL_ZOOM = 0.05;

function bboxDeLimites([oeste, sur, este, norte]: LngLatBounds): Bbox {
  return acotarBbox({ sur, oeste, norte, este });
}

// Memoizado: sin esto, cada cambio de `cargando` o `buscandoUbicacion` en el padre (que no toca
// `puntos`) volvería a renderizar los hasta 200 marcadores en pantalla por nada. `onAbrir` se pasa
// tal cual (no envuelto en una clausura nueva por marcador) para que la identidad de las props no
// cambie entre renders y el memo funcione de verdad.
const Pin = memo(function Pin({ punto, onAbrir }: { punto: PuntoMapa; onAbrir(p: PuntoMapa): void }) {
  const { fondo, glifo } = PIN_POR_TIPO[punto.tipo];
  return (
    <Marker id={punto.id} lngLat={[punto.lng, punto.lat]} onPress={() => onAbrir(punto)}>
      <View style={e.pinEnvoltorio}>
        {/* Aro de tamaño FIJO en píxeles para lo aproximado: no crece con el zoom, así que nunca
            se solapa con el del vecino. Dice «esto es aproximado» sin afirmar cuánto. */}
        {punto.aproximado ? <View style={e.aroAprox} /> : null}
        <View style={[e.pin, { backgroundColor: fondo }]}>
          <Ionicons name={punto.tipo === 'negocio' ? 'storefront-outline' : 'construct-outline'} size={16} color={glifo} />
        </View>
        {punto.detras > 0 ? (
          <View style={e.insignia}>
            <Text style={e.insigniaTexto}>+{punto.detras}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

/**
 * Un punto aproximado en modo zona: deja de fingir un punto y se dibuja como área con su cuenta.
 *
 * DIVERGENCIA DELIBERADA CON LA WEB, y conviene saberla: en la web el área es un círculo de 300 m
 * REALES (Leaflet tiene `Circle` con radio en metros), así que crece al acercarse. Aquí es un
 * disco de tamaño fijo en píxeles. Dibujar 300 m exactos en MapLibre pide GeoJSONSource + Layer
 * con un polígono, y esto se escribió en un host sin emulador: no había forma de comprobarlo
 * antes de meterlo en un APK que va a teléfonos reales. Comunica lo mismo —«es una zona, no un
 * punto»— sin poder romperse en ejecución. Queda pendiente de igualar tras probarlo en emulador.
 */
const AreaZona = memo(function AreaZona({ punto, onAbrir }: { punto: PuntoMapa; onAbrir(p: PuntoMapa): void }) {
  const n = punto.detras + 1;
  return (
    <Marker id={`zona-${punto.id}`} lngLat={[punto.lng, punto.lat]} onPress={() => onAbrir(punto)}>
      <View style={e.zonaEnvoltorio}>
        <View style={e.zonaDisco} />
        <View style={e.zonaEtiqueta}>
          <Text style={e.zonaTexto}>{n === 1 ? '1 negocio aquí' : `${n} negocios aquí`}</Text>
        </View>
      </View>
    </Marker>
  );
});

/**
 * El punto con su ficha abierta: deja de ser un círculo y pasa a gota, para decir «este soy yo» con
 * la misma forma que la marca usa para señalar un lugar.
 *
 * `anchor="bottom"` es lo que hace que la PUNTA caiga sobre la coordenada real; con el «center» por
 * defecto el punto parecería moverse al seleccionarlo. Verificado en los tipos de MapLibre RN.
 *
 * Dentro va el MISMO relleno y el mismo glifo de PIN_POR_TIPO, no una combinación nueva: así es el
 * pin normal con cola, el contraste ya está validado y no hay un segundo juego de colores que
 * mantener. (La gota de la web lleva un círculo blanco liso porque sus pines nunca llevaron icono.)
 */
const PinSeleccionado = memo(function PinSeleccionado({ punto, onAbrir }: { punto: PuntoMapa; onAbrir(p: PuntoMapa): void }) {
  const { fondo, glifo } = PIN_POR_TIPO[punto.tipo];
  return (
    <Marker id={punto.id} lngLat={[punto.lng, punto.lat]} anchor="bottom" onPress={() => onAbrir(punto)}>
      <View style={e.gotaEnvoltorio}>
        {/* La cola: un cuadrado rotado 45° con tres esquinas redondeadas, debajo del círculo y tapado
            por él en todo su ancho salvo la punta. Sin react-native-svg a propósito (ver el spec,
            decisión 4). */}
        <View style={[e.gotaCola, { backgroundColor: fondo }]} />
        <View style={[e.gotaCirculo, { backgroundColor: fondo }]}>
          <Ionicons name={punto.tipo === 'negocio' ? 'storefront-outline' : 'construct-outline'} size={18} color={glifo} />
        </View>
        {punto.detras > 0 ? (
          <View style={e.insigniaGota}>
            <Text style={e.insigniaTexto}>+{punto.detras}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

export default function MapaExplorar({ tab, q, category, seleccionadoId, onAbrir, onAbrirLista }: {
  tab: string; q: string; category: string;
  /** El `id` del punto con su ficha abierta: su marcador pasa de círculo a gota. */
  seleccionadoId?: string | null;
  onAbrir(p: PuntoMapa): void;
  /** Los negocios de una celda al tocar un grupo. Si la celda falla, llega vacía con el mensaje:
   *  la hoja se abre igual. */
  onAbrirLista(puntos: PuntoMapa[], error?: string, reintentar?: () => void): void;
}) {
  const { puntos, cargando, error, celda, sugerencia, alMoverMapa, buscarZonaVisible, cargarCelda } = usarMapa({ tab, q, category });

  // Mismo umbral que la web (ZONA_DESDE_GRADOS, en @oficio/shared): por debajo de este tamaño de
  // celda el área ya no cabe en ella. Una constante y dos clientes, o el mismo negocio se vería
  // distinto en cada uno.
  const modoZona = celda > 0 && celda < ZONA_DESDE_GRADOS;

  const mapaRef = useRef<MapRef>(null);
  const camaraRef = useRef<CameraRef>(null);
  const zoomAnterior = useRef<number | null>(null);
  // Antes de que termine de cargar el estilo, un onRegionDidChange espurio no debe pedir nada:
  // la carga inicial la dispara onDidFinishLoadingMap, que es el evento que sí está garantizado.
  const cargaInicialHecha = useRef(false);

  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);

  const alTerminarDeCargarMapa = useCallback(async () => {
    const limites = await mapaRef.current?.getBounds();
    if (!limites) return;
    zoomAnterior.current = (await mapaRef.current?.getZoom()) ?? null;
    cargaInicialHecha.current = true;
    buscarZonaVisible(bboxDeLimites(limites));
  }, [buscarZonaVisible]);

  const alCambiarRegion = useCallback((ev: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    if (!cargaInicialHecha.current) return;
    const { bounds, zoom } = ev.nativeEvent;
    const esZoom = zoomAnterior.current === null || Math.abs(zoom - zoomAnterior.current) > UMBRAL_ZOOM;
    zoomAnterior.current = zoom;
    alMoverMapa(bboxDeLimites(bounds), esZoom);
  }, [alMoverMapa]);

  // Cuál es el toque vigente. Existe porque `cargarCelda` resuelve `[]` también cuando ABANDONA la
  // petición (otro toque, desmontaje): sin este token, una respuesta abandonada es indistinguible de
  // una celda vacía y abre una ficha que nadie pidió. Cubre tres casos con una sola guarda:
  // (1) tocar un grupo y luego otro — el primero abriría su ficha y el segundo la taparía al vuelo;
  // (2) irse a la lista mientras la celda carga — la hoja se abriría encima de la lista;
  // (3) cambiar `q`/categoría tras el toque — ahí NADA se abandona, la petición termina bien con los
  // resultados del filtro viejo y reabriría la hoja que el cambio acababa de cerrar. Por (3) no basta
  // con que `cargarCelda` señalara el abandono aparte: el token es lo único que cubre los tres.
  const tokenCelda = useRef(0);
  useEffect(() => () => { tokenCelda.current += 1; }, [tab, q, category]);

  // Un punto suelto abre su ficha; un grupo abre la lista de su celda. Es la misma interacción para
  // el «+N» y para un área: enseñar dos gestos para el mismo hecho sería pedirle al usuario que
  // aprenda dos cosas.
  const abrir = useCallback((p: PuntoMapa) => {
    const token = (tokenCelda.current += 1);
    if (p.detras === 0) { onAbrir(p); return; }
    cargarCelda(p.cy, p.cx)
      .then((devueltos) => {
        if (token !== tokenCelda.current) return;
        const c = contenidoDeCelda(p, devueltos);
        if (c.clase === 'ficha') onAbrir(c.punto);
        else onAbrirLista(c.puntos);
      })
      // Sin este catch, un fallo de red es un rechazo sin capturar: se toca un grupo y no pasa
      // NADA, ni hoja ni mensaje. Se abre igual, con el punto que sí se conoce, el mensaje y CÓMO
      // reintentar — quien abre la hoja no sabe pedir celdas, así que sin la clausura el botón
      // «Reintentar» existiría y no haría nada, que es peor que no tenerlo.
      .catch(() => {
        if (token !== tokenCelda.current) return;
        onAbrirLista([p], 'No pudimos cargar los negocios de esta zona.', () => abrir(p));
      });
  }, [cargarCelda, onAbrir, onAbrirLista]);

  const alPresionarCercaDeMi = useCallback(async () => {
    setErrorUbicacion(null);
    setBuscandoUbicacion(true);
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        // Sin callejón sin salida: se avisa y el mapa sigue usándose con paneo/búsqueda manual.
        setErrorUbicacion('No autorizaste tu ubicación. Puedes mover el mapa a mano para buscar tu zona.');
        return;
      }
      const posicion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { lat, lng } = acotarACuba(posicion.coords.latitude, posicion.coords.longitude);
      // Fuerza a que el próximo cambio de región se trate como zoom (recarga sola), sea cual sea
      // la diferencia real: «Cerca de mí» es una petición tan deliberada como escribir o hacer zoom.
      zoomAnterior.current = null;
      camaraRef.current?.flyTo({ center: [lng, lat], zoom: ZOOM_CERCA_DE_MI, duration: 600 });
    } catch {
      setErrorUbicacion('No se pudo obtener tu ubicación. Inténtalo de nuevo.');
    } finally {
      setBuscandoUbicacion(false);
    }
  }, []);

  // La búsqueda no tiene nada en la zona visible pero sí en otra parte de Cuba (usarMapa ya lo
  // averiguó): el mapa va allá solo. Mismo zoom y duración que «Cerca de mí», por la misma razón:
  // ambos son «llévame a donde hay algo», uno por geolocalización y el otro por búsqueda.
  useEffect(() => {
    if (!sugerencia) return;
    // Igual que en «Cerca de mí»: el próximo cambio de región cuenta como zoom (recarga a los
    // 250 ms, no a los 500 del arrastre), porque este salto es tan deliberado como escribir.
    zoomAnterior.current = null;
    camaraRef.current?.flyTo({ center: [sugerencia.lng, sugerencia.lat], zoom: ZOOM_CERCA_DE_MI, duration: 600 });
  }, [sugerencia]);

  return (
    <View style={e.contenedor}>
      <MapaLibre
        ref={mapaRef}
        style={e.mapa}
        // TextureView en vez del GLSurfaceView por defecto. La superficie GL se compone en una capa
        // aparte de la ventana y en un Huawei P8 Lite (Mali, EMUI) dejaba NEGRO todo lo que hay por
        // encima del mapa —cabecera, buscador, filtros— aunque el mapa se viera bien (foto de
        // Dariel, 29-sep, en Cuba). TextureView dibuja dentro de la jerarquía de vistas como una más.
        androidView="texture"
        mapStyle={ESTILO_OSM}
        attribution
        compass={false}
        touchPitch={false}
        touchRotate={false}
        onDidFinishLoadingMap={alTerminarDeCargarMapa}
        onRegionDidChange={alCambiarRegion}
      >
        <Camera ref={camaraRef} initialViewState={{ center: CENTRO_INICIAL, zoom: ZOOM_INICIAL }} maxBounds={LIMITES_CUBA} />
        {puntos.map((p) => {
          // El área gana a la selección, igual que en la web: una gota se ancla en una coordenada
          // exacta, así que dibujarla sobre un punto aproximado afirmaría una precisión que el dato
          // no tiene — y justo en el punto que el usuario está mirando. El área sigue siendo área
          // con su ficha abierta. Los exactos siguen siendo pin: su punto sí es cierto y mezclarlos
          // mentiría sobre los dos.
          if (modoZona && p.aproximado) return <AreaZona key={p.id} punto={p} onAbrir={abrir} />;
          return p.id === seleccionadoId
            ? <PinSeleccionado key={p.id} punto={p} onAbrir={abrir} />
            : <Pin key={p.id} punto={p} onAbrir={abrir} />;
        })}
      </MapaLibre>

      {cargando ? (
        <View style={e.pildoraCarga} pointerEvents="none">
          <ActivityIndicator size="small" color={brand[600]} />
          <Text style={e.pildoraTexto}>Cargando…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={e.avisoError}>
          <Text style={e.avisoErrorTexto}>No pudimos cargar el mapa.</Text>
          <Pressable onPress={() => buscarZonaVisible()} hitSlop={8}>
            <Text style={e.avisoErrorEnlace}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={alPresionarCercaDeMi}
        disabled={buscandoUbicacion}
        accessibilityRole="button"
        accessibilityLabel="Cerca de mí"
        style={[e.botonUbicacion, buscandoUbicacion && { opacity: 0.6 }]}
      >
        {buscandoUbicacion ? <ActivityIndicator size="small" color={ink[800]} /> : <Ionicons name="locate" size={22} color={ink[800]} />}
      </Pressable>

      {errorUbicacion ? (
        <View style={e.avisoUbicacion}>
          <Text style={e.avisoUbicacionTexto}>{errorUbicacion}</Text>
        </View>
      ) : null}

    </View>
  );
}

const e = StyleSheet.create({
  // Recorta lo que se sale del mapa: en React Native una vista no recorta a sus hijas por defecto,
  // y un pin cerca del borde superior se pintaba encima del buscador y los filtros.
  contenedor: { flex: 1, overflow: 'hidden' },
  mapa: { flex: 1 },
  pinEnvoltorio: { alignItems: 'center', justifyContent: 'center' },
  pin: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#ffffff', ...sombra.card,
  },
  insignia: {
    position: 'absolute', top: -6, right: -10, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: ink[900], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#ffffff',
  },
  insigniaTexto: { fontFamily: fuentes.textoFuerte, fontSize: 10, color: '#ffffff' },
  // Aro de lo aproximado: tamaño fijo en píxeles, así que no puede solaparse con el del vecino.
  aroAprox: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    borderWidth: 2, borderStyle: 'dashed', borderColor: brand[600], opacity: 0.7,
  },
  zonaEnvoltorio: { alignItems: 'center', justifyContent: 'center' },
  zonaDisco: {
    position: 'absolute', width: 96, height: 96, borderRadius: 48,
    backgroundColor: brand[600], opacity: 0.12, borderWidth: 2, borderColor: brand[600],
  },
  zonaEtiqueta: {
    backgroundColor: '#ffffff', borderRadius: radios.chip, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: sand[200], ...sombra.card,
  },
  zonaTexto: { fontFamily: fuentes.textoFuerte, fontSize: 11, color: ink[800] },
  // El envoltorio debe medir exactamente lo que ocupa el dibujo (40 + ~6.14 de cola visible), no más.
  // Con `anchor="bottom"` = {y: 1}, el borde inferior del box cae sobre la coordenada real;
  // si el box es más grande que el dibujo, la punta flota sin alcanzar su punto.
  gotaEnvoltorio: { width: 44, height: 46, alignItems: 'center' },
  gotaCirculo: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#ffffff', ...sombra.lift,
  },
  gotaCola: {
    position: 'absolute', top: 22, width: 20, height: 20,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderTopRightRadius: 3,
    transform: [{ rotate: '45deg' }],
    // `top: 22` deja el centro de la cola en y=32, donde su semiancho (14,14) es MENOR que el del
    // círculo (16): queda tapada justo donde más ancha es, y solo emerge por debajo como punta. Con un
    // `top` MAYOR la cola baja hasta donde el círculo ya se estrecha, sus costados asoman como dos
    // esquinas de rombo y la silueta deja de leerse como gota.
  },
  insigniaGota: {
    position: 'absolute', top: -4, right: 0, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: ink[900], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: '#ffffff',
  },
  pildoraCarga: {
    position: 'absolute', top: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ffffff', borderRadius: radios.chip, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: sand[200], ...sombra.card,
  },
  pildoraTexto: { fontFamily: fuentes.textoMedio, fontSize: 13, color: ink[700] },
  avisoError: {
    position: 'absolute', top: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fef2f2', borderRadius: radios.chip, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#fecaca',
  },
  avisoErrorTexto: { fontFamily: fuentes.texto, fontSize: 13, color: '#991b1b' },
  avisoErrorEnlace: { fontFamily: fuentes.textoFuerte, fontSize: 13, color: '#991b1b', textDecorationLine: 'underline' },
  botonUbicacion: {
    position: 'absolute', right: 16, bottom: 24, width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: sand[200], ...sombra.lift,
  },
  avisoUbicacion: {
    position: 'absolute', right: 16, bottom: 80, maxWidth: 220, backgroundColor: ink[900], borderRadius: radios.campo, paddingHorizontal: 12, paddingVertical: 10,
  },
  avisoUbicacionTexto: { fontFamily: fuentes.texto, fontSize: 12, lineHeight: 17, color: '#ffffff' },
});
