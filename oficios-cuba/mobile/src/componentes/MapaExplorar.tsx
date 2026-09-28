import { useCallback, useRef, useState } from 'react';
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
import type { Bbox, PuntoMapa } from '@oficio/shared';
import { Boton } from './Boton';
import { acotarACuba, CUBA, usarMapa } from '../lib/mapa';
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
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const LIMITES_CUBA: LngLatBounds = [CUBA.oeste, CUBA.sur, CUBA.este, CUBA.norte];
// Centro geográfico aproximado de Cuba, con zoom para ver la isla completa al abrir.
const CENTRO_INICIAL: [number, number] = [-79.5, 21.55];
const ZOOM_INICIAL = 6.3;
// Zoom al que se acerca «Cerca de mí»: nivel de ciudad, suficiente para distinguir profesionales cercanos.
const ZOOM_CERCA_DE_MI = 13;
// Diferencia de zoom mínima para tratar un cambio de región como "hizo zoom" y no como paneo.
const UMBRAL_ZOOM = 0.05;

function bboxDeLimites([oeste, sur, este, norte]: LngLatBounds): Bbox {
  return { sur, oeste, norte, este };
}

const COLOR_PIN: Record<PuntoMapa['plan'], string> = {
  // brand-500 nunca lleva texto/ícono blanco encima (no pasa contraste WCAG en fondo claro):
  // el plan Profesional usa brand-600, que sí lo soporta.
  pro: brand[600],
  basic: ink[700],
  free: ink[500],
};

function Pin({ punto, onPress }: { punto: PuntoMapa; onPress: () => void }) {
  return (
    <Marker id={punto.id} lngLat={[punto.lng, punto.lat]} onPress={onPress}>
      <View style={e.pinEnvoltorio}>
        <View style={[e.pin, { backgroundColor: COLOR_PIN[punto.plan] }]}>
          <Ionicons name={punto.tipo === 'negocio' ? 'storefront-outline' : 'construct-outline'} size={16} color="#ffffff" />
        </View>
        {punto.detras > 0 ? (
          <View style={e.insignia}>
            <Text style={e.insigniaTexto}>+{punto.detras}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

export default function MapaExplorar({ tab, q, category, onAbrir }: { tab: string; q: string; category: string; onAbrir(p: PuntoMapa): void }) {
  const { puntos, cargando, error, zonaSucia, alMoverMapa, buscarZonaVisible } = usarMapa({ tab, q, category });

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

  return (
    <View style={e.contenedor}>
      <MapaLibre
        ref={mapaRef}
        style={e.mapa}
        mapStyle={ESTILO_OSM}
        attribution
        compass={false}
        touchPitch={false}
        touchRotate={false}
        onDidFinishLoadingMap={alTerminarDeCargarMapa}
        onRegionDidChange={alCambiarRegion}
      >
        <Camera ref={camaraRef} initialViewState={{ center: CENTRO_INICIAL, zoom: ZOOM_INICIAL }} maxBounds={LIMITES_CUBA} />
        {puntos.map((p) => <Pin key={p.id} punto={p} onPress={() => onAbrir(p)} />)}
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

      {zonaSucia ? (
        <View style={e.filaBoton}>
          <Boton titulo="Buscar en esta zona" icono="refresh" onPress={() => buscarZonaVisible()} estilo={sombra.lift} />
        </View>
      ) : null}
    </View>
  );
}

const e = StyleSheet.create({
  contenedor: { flex: 1 },
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
  filaBoton: { position: 'absolute', bottom: 24, alignSelf: 'center' },
});
