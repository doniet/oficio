import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
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

// divIcon en vez del icono por defecto de Leaflet, igual que PlaceMap/MapPointPicker: el default
// carga PNGs por URL relativa que Vite no empaqueta.
function pinIcon(plan: PuntoMapa['plan'], detras: number, aproximado: boolean) {
  // Solo el plan pro usa brand-600: brand-500 no lleva texto ni sirve de indicador sobre fondo
  // claro (2,43:1, por debajo del 3:1 que pide WCAG 1.4.11). Los demás planes van en ink-700.
  const color = plan === 'pro' ? 'bg-brand-600' : 'bg-ink-700';
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

function Eventos({ zoomRecien, alMover }: { zoomRecien: React.MutableRefObject<boolean>; alMover: (b: Bbox, porZoom: boolean) => void }) {
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

  return null;
}

export default function MapaExplorar({ tab, q, category, onAbrir, onAbrirLista, alMapa }: {
  tab: string; q: string; category: string;
  onAbrir: (p: PuntoMapa) => void;
  /**
   * Se llama con los negocios de una celda cuando se toca un grupo (un «+N» o un área). Si la
   * celda no se pudo cargar, llega con la lista vacía y el mensaje: el panel se abre igual.
   */
  onAbrirLista: (puntos: PuntoMapa[], error?: string) => void;
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
        .catch(() => onAbrirLista([], 'No pudimos cargar los negocios de esta zona.'));
    } else onAbrir(p);
  }, [mapa, onAbrir, onAbrirLista]);
  const zoomRecien = useRef(false);
  const mapRef = useRef<LeafletMap | null>(null);
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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapContainer
        ref={(m) => { mapRef.current = m; if (m) alMapa?.(m); }}
        center={CUBA_CENTER}
        zoom={7}
        minZoom={6}
        maxBounds={CUBA_BOUNDS}
        className="h-full w-full"
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Eventos zoomRecien={zoomRecien} alMover={mapa.alMover} />
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
              icon={pinIcon(p.plan, p.detras, p.aproximado)}
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
        {localizando ? <Spinner className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />} Cerca de mí
      </button>
    </div>
  );
}
