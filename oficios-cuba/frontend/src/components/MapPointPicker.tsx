import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Trash2 } from 'lucide-react';
import { Spinner } from './ui';

const CUBA_CENTER: [number, number] = [21.6, -79.6];
const CUBA_BOUNDS: L.LatLngBoundsExpression = [[19.5, -85.3], [23.6, -73.9]];
const LIMITES = { latMin: 19, latMax: 24, lngMin: -85.5, lngMax: -73.5 };

export interface Punto { lat: number; lng: number }

// divIcon: el icono por defecto de Leaflet carga PNGs por URL relativa que Vite no empaqueta.
const pin = L.divIcon({
  className: 'map-pin',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  html: `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="#e2562f" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>`,
});

const dentroDeCuba = (p: Punto) => p.lat >= LIMITES.latMin && p.lat <= LIMITES.latMax && p.lng >= LIMITES.lngMin && p.lng <= LIMITES.lngMax;
const redondear = (n: number) => Math.round(n * 1e5) / 1e5;

function Clicks({ onPick }: { onPick: (p: Punto) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Enfocar({ destino }: { destino: { center: [number, number]; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (destino) map.flyTo(destino.center, destino.zoom, { duration: 0.6 });
  }, [destino, map]);
  return null;
}

export default function MapPointPicker({ value, onChange, fallbackCenter }: {
  value: Punto | null;
  onChange: (p: Punto | null) => void;
  /** Centro de la provincia/municipio elegido cuando aún no hay punto. */
  fallbackCenter?: { lat: number; lng: number; zoom?: number } | null;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [destino, setDestino] = useState<{ center: [number, number]; zoom: number } | null>(null);

  const inicial = useMemo<{ center: [number, number]; zoom: number }>(() => {
    if (value) return { center: [value.lat, value.lng], zoom: 15 };
    if (fallbackCenter) return { center: [fallbackCenter.lat, fallbackCenter.lng], zoom: fallbackCenter.zoom ?? 11 };
    return { center: CUBA_CENTER, zoom: 6 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value && fallbackCenter) setDestino({ center: [fallbackCenter.lat, fallbackCenter.lng], zoom: fallbackCenter.zoom ?? 11 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackCenter?.lat, fallbackCenter?.lng]);

  const pick = (p: Punto) => {
    if (!dentroDeCuba(p)) { setError('El punto tiene que estar en Cuba.'); return; }
    setError('');
    onChange({ lat: redondear(p.lat), lng: redondear(p.lng) });
  };

  const locate = () => {
    if (!navigator.geolocation) { setError('Tu navegador no permite obtener la ubicación.'); return; }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!dentroDeCuba(p)) { setError('Tu ubicación actual no está en Cuba. Marca el punto en el mapa.'); return; }
        pick(p);
        setDestino({ center: [p.lat, p.lng], zoom: 16 });
      },
      () => { setLocating(false); setError('No se pudo obtener tu ubicación. Marca el punto tocando el mapa.'); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative h-64 overflow-hidden rounded-2xl border border-sand-200 sm:h-72">
        <MapContainer center={inicial.center} zoom={inicial.zoom} maxBounds={CUBA_BOUNDS} minZoom={6} className="h-full w-full" scrollWheelZoom={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Clicks onPick={pick} />
          <Enfocar destino={destino} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pin}
              draggable
              eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); pick({ lat: ll.lat, lng: ll.lng }); } }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={locate} disabled={locating} className="btn-secondary btn-sm">
          {locating ? <Spinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />} Usar mi ubicación
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="btn-ghost btn-sm text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> Quitar punto
          </button>
        )}
        <span className="text-xs text-ink-400">{value ? 'Arrastra el marcador para ajustarlo.' : 'Toca el mapa para marcar tu local.'}</span>
      </div>
      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}
