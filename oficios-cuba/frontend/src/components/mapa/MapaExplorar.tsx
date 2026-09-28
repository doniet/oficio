import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L, { type LatLngBounds, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';
import { Spinner } from '../ui';
import { acotarACuba, usarMapa } from './usarMapa';
import type { Bbox, PuntoMapa } from '../../types';

const CUBA_CENTER: [number, number] = [21.6, -79.6];
const CUBA_BOUNDS: L.LatLngBoundsExpression = [[19, -85.5], [24, -73.5]];

function aBbox(b: LatLngBounds): Bbox {
  return { sur: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), este: b.getEast() };
}

// divIcon en vez del icono por defecto de Leaflet, igual que PlaceMap/MapPointPicker: el default
// carga PNGs por URL relativa que Vite no empaqueta.
function pinIcon(plan: PuntoMapa['plan'], detras: number) {
  // Solo el plan pro usa brand-600: brand-500 no lleva texto ni sirve de indicador sobre fondo
  // claro (2,43:1, por debajo del 3:1 que pide WCAG 1.4.11). Los demás planes van en ink-700.
  const color = plan === 'pro' ? 'bg-brand-600' : 'bg-ink-700';
  const insignia = detras > 0
    ? `<span class="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ink-950 px-1 text-[10px] font-bold leading-none text-white">+${detras}</span>`
    : '';
  return L.divIcon({
    className: 'map-pin',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<span class="relative flex h-7 w-7 items-center justify-center">
      <span class="block h-5 w-5 rounded-full border-2 border-white ${color} shadow"></span>
      ${insignia}
    </span>`,
  });
}

function Eventos({ zoomRecien, alMover }: { zoomRecien: React.MutableRefObject<boolean>; alMover: (b: Bbox, porZoom: boolean) => void }) {
  const map = useMapEvents({
    zoomend: (e) => {
      // `moveend` dispara también después de un zoom; este flag se lo indica al handler de abajo
      // para que no ensucie la zona ni saque el botón «Buscar en esta zona» sin motivo.
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
  // Cuenta como zoom (no como paneo): la carga inicial no debe dejar puesto el botón «Buscar en
  // esta zona» — el usuario no debería tener que pedir ver lo que el mapa acaba de abrir.
  useEffect(() => {
    alMover(aBbox(map.getBounds()), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function MapaExplorar({ tab, q, category, onAbrir }: {
  tab: string; q: string; category: string; onAbrir: (p: PuntoMapa) => void;
}) {
  const mapa = usarMapa({ tab, q, category });
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
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-sand-200">
      <MapContainer
        ref={mapRef}
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
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p.plan, p.detras)}
            eventHandlers={{ click: () => onAbrir(p) }}
          />
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] flex flex-col items-center gap-2 px-3">
        {mapa.cargando && (
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 shadow-card">
            <Spinner className="h-3.5 w-3.5" /> Cargando…
          </span>
        )}
        {mapa.error && (
          <span className="pointer-events-auto rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-card" role="alert">
            {mapa.error}
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

      {mapa.zonaSucia && (
        // `bottom` lee la variable CSS que publica HojaPunto (Tarea 6) en <html>: "0px" con la
        // hoja cerrada, y el alto que ocupa desde abajo del viewport mientras está asomada o
        // abierta (incluso durante el arrastre). Sin esto la hoja tapa este botón.
        <div className="absolute left-1/2 z-[400] -translate-x-1/2" style={{ bottom: 'calc(var(--hoja-punto-alto, 0px) + 1rem)' }}>
          <button type="button" onClick={mapa.buscarZona} className="btn-primary btn-sm shadow-lift">
            Buscar en esta zona
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={cercaDeMi}
        disabled={localizando}
        className="btn-secondary btn-sm absolute bottom-3 right-3 z-[400] shadow-card"
      >
        {localizando ? <Spinner className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />} Cerca de mí
      </button>
    </div>
  );
}
