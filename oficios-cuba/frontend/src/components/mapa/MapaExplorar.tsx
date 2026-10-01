import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet';
import L, { type LatLngBounds, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';
import { Spinner } from '../ui';
import { acotarACuba, acotarBbox, usarMapa } from './usarMapa';
import { RADIO_APROX_M, ZONA_DESDE_GRADOS, type Bbox, type PuntoMapa } from '../../types';

const CUBA_CENTER: [number, number] = [21.6, -79.6];
const CUBA_BOUNDS: L.LatLngBoundsExpression = [[19, -85.5], [24, -73.5]];

function aBbox(b: LatLngBounds): Bbox {
  return acotarBbox({ sur: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), este: b.getEast() });
}

// El color dice el TIPO de perfil (negocio o servicio/oficio suelto), no el plan: los dos tonos
// son naranja —ink-700 "no quedó bien", a ojo de Dariel—, diferenciados por intensidad: brand-600
// (fuerte) para negocio, brand-400 (claro) para oficio. Las clases van completas y literales en
// cada sitio (nunca `bg-${...}`, que Tailwind no puede extraer de una interpolación): JIT escanea
// el código fuente buscando el texto exacto de la clase.

// divIcon en vez del icono por defecto de Leaflet, igual que PlaceMap/MapPointPicker: el default
// carga PNGs por URL relativa que Vite no empaqueta.
function pinIcon(tipo: PuntoMapa['tipo'], detras: number, aproximado: boolean) {
  const color = tipo === 'negocio' ? 'bg-brand-600' : 'bg-brand-400';
  const insignia = detras > 0
    ? `<span class="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ink-950 px-1 text-[10px] font-bold leading-none text-white">+${detras}</span>`
    : '';
  // El aro de lo aproximado es de TAMAÑO FIJO en píxeles: no crece con el zoom, así que no puede
  // solaparse con el del vecino. Dice «esto es aproximado» sin afirmar cuánto; el cuánto lo dice
  // el círculo cuando el mapa entra en modo zona.
  const aro = aproximado
    ? '<span class="absolute inset-0 rounded-full border-2 border-dashed border-brand-600/70"></span>'
    : '';
  return L.divIcon({
    className: 'map-pin',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<span class="relative flex h-7 w-7 items-center justify-center">
      ${aro}
      <span class="block h-5 w-5 rounded-full border-2 border-white ${color} shadow"></span>
      ${insignia}
    </span>`,
  });
}

// Misma silueta que el glifo de la marca (frontend/public/favicon.svg): la gota original mide
// 56×75 con centro del círculo en (28,28) y r=19 — coordenadas trasladadas aquí tal cual, para
// poder reescalarlas sin tocar el trazado. El punto tocado dice «este soy yo» con la MISMA forma
// que usa la marca para señalar un lugar, en vez del círculo genérico del resto de los pines.
const GOTA_PATH = 'M28 0C43.5 0 56 12.5 56 28C56 41 47 51 37 63L28 75L19 63C9 51 0 41 0 28C0 12.5 12.5 0 28 0Z';

// El pin del seleccionado: el ancla va en la PUNTA (abajo), no en el centro como el círculo — es
// la punta la que tiene que caer sobre la coordenada real, o el punto "se movería" al seleccionarlo.
function pinSeleccionadoIcon(tipo: PuntoMapa['tipo'], detras: number) {
  const color = tipo === 'negocio' ? 'text-brand-600' : 'text-brand-400';
  const insignia = detras > 0
    ? '<span class="absolute -right-1.5 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ink-950 px-1 text-[10px] font-bold leading-none text-white">+' + detras + '</span>'
    : '';
  return L.divIcon({
    className: 'map-pin map-pin--seleccionado',
    iconSize: [34, 45.5],
    iconAnchor: [17, 45.5],
    html: `<span class="relative block h-full w-full drop-shadow-md ${color}">
      <svg viewBox="0 0 56 75" class="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <path d="${GOTA_PATH}" fill="currentColor"/>
        <circle cx="28" cy="28" r="19" fill="#FFFFFF"/>
      </svg>
      ${insignia}
    </span>`,
  });
}

/** La etiqueta que va en el centro de un área: «N negocios en esta zona». */
function etiquetaZona(n: number) {
  return L.divIcon({
    className: 'map-zona',
    iconSize: [120, 22],
    iconAnchor: [60, 11],
    html: `<span class="flex h-[22px] items-center justify-center rounded-full bg-white/95 px-2 text-[11px] font-bold text-ink-800 shadow-card backdrop-blur">
      ${n === 1 ? '1 negocio aquí' : `${n} negocios aquí`}
    </span>`,
  });
}

function Eventos({ zoomRecien, alMover, onClicVacio }: {
  zoomRecien: React.MutableRefObject<boolean>; alMover: (b: Bbox, porZoom: boolean) => void; onClicVacio: () => void;
}) {
  const map = useMapEvents({
    zoomend: (e) => {
      // `moveend` dispara también después de un zoom; este flag se lo indica al handler de abajo
      // para que no se trate como un arrastre y retrase la recarga del zoom (250 ms) a la del paneo (500).
      zoomRecien.current = true;
      alMover(aBbox(e.target.getBounds()), true);
      setTimeout(() => { zoomRecien.current = false; }, 0);
    },
    moveend: (e) => {
      if (!zoomRecien.current) alMover(aBbox(e.target.getBounds()), false);
    },
    // Leaflet no deja que esto llegue aquí si el toque fue sobre un Marker o un Circle: esas capas
    // detienen la propagación del clic hacia el mapa por su cuenta (si no, cada punto cerraría su
    // propia ficha apenas se abriera). Solo se dispara sobre las teselas, el mar o tierra vacía.
    click: () => onClicVacio(),
  });

  // `MapContainer` llama a `map.setView()` de forma síncrona dentro del callback de ref del div
  // que monta Leaflet — en ese momento `context` todavía es null y este componente (con los
  // listeners de arriba) ni existe. Ese `setView` ya dispara `moveend`/`zoomend` en el acto, así
  // que `useMapEvents` (que los engancha en un `useEffect`, siempre posterior al primer commit)
  // nunca los ve: sin este efecto de montaje el mapa se abre sin haber pedido nunca su primera
  // área — cero marcadores, y si el usuario solo panea, ni siquiera aparece el botón para pedirla.
  // Cuenta como zoom (no como paneo): la carga inicial no debe esperar los 500 ms del arrastre.
  useEffect(() => {
    alMover(aBbox(map.getBounds()), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el contenedor se monta sin altura, `usarMapa` ignora ese rectángulo sin área a propósito
  // —no gasta una petición que no puede devolver nada—, pero entonces NO queda bbox y el mapa se
  // quedaría mudo para siempre: ni recarga al escribir, ni error, ni spinner. Leaflet solo se
  // entera de un cambio de tamaño por el `resize` de la ventana o por un `invalidateSize()`
  // explícito, y en escritorio ese `resize` puede no llegar nunca. El observador cierra ese
  // agujero, y de paso cubre volver desde una pestaña oculta.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() => map.invalidateSize());
    observador.observe(map.getContainer());
    return () => observador.disconnect();
  }, [map]);

  return null;
}

export default function MapaExplorar({ tab, q, category, seleccionadoId, onAbrir, onAbrirLista, onCerrarPanel, alMapa }: {
  tab: string; q: string; category: string;
  /** El `id` del punto que tiene su ficha abierta: su marcador cambia de círculo a pin. */
  seleccionadoId?: string | null;
  onAbrir: (p: PuntoMapa) => void;
  /**
   * Se llama con los negocios de una celda cuando se toca un grupo (un «+N» o un área). Si la
   * celda no se pudo cargar, llega con la lista vacía y el mensaje: el panel se abre igual.
   */
  onAbrirLista: (puntos: PuntoMapa[], error?: string, reintentar?: () => void) => void;
  /** Tocar el mapa donde no hay ningún punto cierra la ficha o lista abierta, igual que el botón «Cerrar». */
  onCerrarPanel: () => void;
  /** Se llama una vez, al montar, con el mapa de Leaflet ya creado. */
  alMapa?: (m: LeafletMap) => void;
}) {
  const mapa = usarMapa({ tab, q, category });

  // Modo zona: por debajo de este tamaño de celda el área de 600 m ya no cabe en ella, así que
  // los círculos de celdas vecinas se solaparían por fuerza. Sale de la geometría, no del gusto.
  const modoZona = mapa.celda > 0 && mapa.celda < ZONA_DESDE_GRADOS;

  // Un punto suelto abre su ficha; un grupo abre la lista de su celda. Es la misma interacción
  // para el «+N» y para el área: enseñarle al usuario dos formas de decir «aquí hay varios»
  // sería pedirle que aprenda dos cosas para el mismo hecho.
  const abrir = useCallback((p: PuntoMapa) => {
    if (p.detras > 0) {
      mapa.cargarCelda(p.cy, p.cx)
        .then((lista) => onAbrirLista(lista.length ? lista : [p]))
        // Sin este catch, un fallo de red es un rechazo no capturado: el usuario toca un grupo y
        // no pasa NADA, ni panel ni mensaje. Se abre igual, con el error y su «Reintentar».
        // Se entrega también CÓMO reintentar: quien abre el panel (ExplorarMapa) no sabe pedir
        // celdas — eso vive en usarMapa —, así que sin esto el botón «Reintentar» existe y no
        // hace nada, que es peor que no tenerlo.
        .catch(() => onAbrirLista([], 'No pudimos cargar los negocios de esta zona.', () => abrir(p)));
    } else onAbrir(p);
  }, [mapa, onAbrir, onAbrirLista]);
  const zoomRecien = useRef(false);
  const mapRef = useRef<LeafletMap | null>(null);
  // `alMapa` va por ref y el callback del ref es ESTABLE: un `ref={(m) => …}` escrito en línea
  // cambia de identidad en cada render, y React lo vuelve a invocar (null y luego el mapa) cada
  // vez. Con MapContainer eso es pedir que la costura entre React y Leaflet se vuelva a montar —
  // y una carga doble del área es justo lo que la prueba «no dobla la carga» existe para cazar.
  const alMapaRef = useRef(alMapa);
  alMapaRef.current = alMapa;
  const guardarMapa = useCallback((m: LeafletMap | null) => {
    mapRef.current = m;
    if (m) alMapaRef.current?.(m);
  }, []);
  const [localizando, setLocalizando] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState('');

  const cercaDeMi = useCallback(() => {
    setErrorUbicacion('');
    if (!navigator.geolocation) {
      setErrorUbicacion('Tu navegador no permite obtener la ubicación.');
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizando(false);
        // Acotado a Cuba: quien busca desde Miami o detrás de una VPN no debe recibir un
        // rectángulo que el endpoint rechace con 400. El mapa se queda donde estaba si algo falla.
        const p = acotarACuba(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.flyTo([p.lat, p.lng], 13, { duration: 0.6 });
      },
      () => {
        setLocalizando(false);
        setErrorUbicacion('No se pudo obtener tu ubicación. Mueve el mapa a la zona que buscas.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, []);

  // La búsqueda no tiene nada en la zona visible pero sí en algún otro punto de Cuba (usarMapa ya
  // lo averiguó): salta allá solo. Mismo zoom/duración que «Yo», por la misma razón —
  // ambos son "llévame a donde hay algo", uno por geolocalización y el otro por búsqueda.
  useEffect(() => {
    if (!mapa.sugerencia) return;
    mapRef.current?.flyTo([mapa.sugerencia.lat, mapa.sugerencia.lng], 13, { duration: 0.8 });
  }, [mapa.sugerencia]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapContainer
        ref={guardarMapa}
        center={CUBA_CENTER}
        zoom={7}
        minZoom={6}
        maxBounds={CUBA_BOUNDS}
        className="h-full w-full"
        // El zoom por defecto va arriba a la izquierda, justo donde ahora vive la barra flotante:
        // encima tapaba los controles y debajo quedaba inservible. Abajo a la izquierda no estorba
        // a nada — «Yo» está abajo a la derecha — y sube con la hoja (ver index.css).
        zoomControl={false}
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <ZoomControl position="bottomleft" />
        <Eventos zoomRecien={zoomRecien} alMover={mapa.alMover} onClicVacio={onCerrarPanel} />
        {mapa.puntos.map((p) => (
          // En modo zona un punto aproximado deja de fingir un punto y se dibuja como área. Los
          // exactos siguen siendo pin, porque el suyo sí es cierto: mezclarlos mentiría sobre los
          // dos. Una celda puede tener de los dos tipos y el servidor devuelve UN representante,
          // así que la representación sigue a ese representante y la celda no se parte en dos
          // marcadores — que es de lo que depende que nada se solape.
          modoZona && p.aproximado ? (
            <Circle
              key={p.id}
              center={[p.lat, p.lng]}
              radius={RADIO_APROX_M}
              pathOptions={{ color: '#B85400', weight: 2, fillColor: '#B85400', fillOpacity: 0.12 }}
              eventHandlers={{ click: () => abrir(p) }}
            />
          ) : null
        ))}
        {mapa.puntos.map((p) => (
          modoZona && p.aproximado ? (
            <Marker
              key={`etq-${p.id}`}
              position={[p.lat, p.lng]}
              icon={etiquetaZona(p.detras + 1)}
              eventHandlers={{ click: () => abrir(p) }}
            />
          ) : (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={p.id === seleccionadoId ? pinSeleccionadoIcon(p.tipo, p.detras) : pinIcon(p.tipo, p.detras, p.aproximado)}
              // Por encima del resto: si dos pines caen muy cerca, el que tiene la ficha abierta
              // no debe quedar tapado por uno vecino sin seleccionar.
              zIndexOffset={p.id === seleccionadoId ? 1000 : 0}
              eventHandlers={{ click: () => abrir(p) }}
            />
          )
        ))}
      </MapContainer>

      <div // top-28: por debajo de la barra flotante de ControlesMapa, que ocupa la franja de arriba.
        className="pointer-events-none absolute inset-x-0 top-28 z-[400] flex flex-col items-center gap-2 px-3">
        {mapa.cargando && (
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 shadow-card">
            <Spinner className="h-3.5 w-3.5" /> Cargando…
          </span>
        )}
        {mapa.error && (
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-card" role="alert">
            {mapa.error}
            {/* Sin esto el usuario se queda atascado: en la conexión que esta app apunta a
                servir, un fallo de carga es el camino probable, no el caso raro. */}
            <button type="button" onClick={mapa.buscarZona} className="underline decoration-2 underline-offset-2">
              Reintentar
            </button>
          </span>
        )}
        {mapa.hayMas && (
          <span className="pointer-events-auto rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-500 shadow-card">
            Hay más negocios aquí. Acerca el mapa.
          </span>
        )}
        {errorUbicacion && (
          <span className="pointer-events-auto rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-500 shadow-card" role="alert">
            {errorUbicacion}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={cercaDeMi}
        disabled={localizando}
        className="btn-secondary btn-sm absolute right-3 z-[400] shadow-card"
        // La hoja publica cuánto tapa en --hoja-punto-alto y cambia en vivo mientras se arrastra;
        // sin leerla, este botón queda debajo de ella en cuanto se abre una ficha.
        style={{ bottom: 'calc(var(--hoja-punto-alto, 0px) + 12px)' }}
      >
        {localizando ? <Spinner className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />} Yo
      </button>
    </div>
  );
}
