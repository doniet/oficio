import { Circle, MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = L.divIcon({
  className: 'map-pin',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: '<span class="flex h-7 w-7 items-center justify-center"><span class="block h-5 w-5 rounded-full border-2 border-white bg-brand-600 shadow ring-4 ring-brand-500/30"></span></span>',
});

// El perfil promete "un radio de más o menos 1 000 metros" (Register.tsx, ProviderProfileEdit.tsx),
// así que el RADIO tiene que ser 1 000, no la mitad. El peor caso real es la esquina de la celda
// "zona" del backend (CELDA_ZONA = 0,01°, db/index.ts): media celda son ~555 m en latitud y ~518 m
// en longitud a 21,5°N, y la esquina queda a √(555²+518²) ≈ 760 m del centro. Con 500 m de radio esa
// esquina caía FUERA del círculo dibujado — la promesa no se cumplía. Con 1 000 sí, sobrando margen.
const RADIO_APROX_M = 1000;

interface PlaceMapProps {
  lat: number;
  lng: number;
  label: string;
  /**
   * El endpoint público de perfiles no manda `map_precision` (a propósito: si lo mandara,
   * cualquiera podría distinguir qué profesionales pidieron ocultarse). Por eso este dato solo
   * llega aquí cuando el propio dueño ve su perfil (ya lo sabe por su panel). Sin él, se asume
   * "zona": es la lectura segura, porque un punto que en realidad es de zona pero se muestra
   * clavado puede caer sobre la casa de un vecino.
   */
  precision?: 'exacta' | 'zona' | null;
}

export default function PlaceMap({ lat, lng, label, precision }: PlaceMapProps) {
  const esExacta = precision === 'exacta';
  return (
    <div>
      {/* El borde/recorte va aquí, alrededor SOLO del mapa: si envolviera también la leyenda de
          abajo, el texto quedaría dibujado dentro de la caja del mapa en vez de debajo de ella. */}
      <div className="relative z-0 overflow-hidden rounded-2xl border border-sand-200">
        <MapContainer center={[lat, lng]} zoom={esExacta ? 15 : 14} scrollWheelZoom={false} className="h-56 w-full" attributionControl>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {esExacta ? (
            <Marker position={[lat, lng]} icon={pin} title={label} />
          ) : (
            <Circle
              center={[lat, lng]}
              radius={RADIO_APROX_M}
              pathOptions={{ color: '#B85400', weight: 2, fillColor: '#B85400', fillOpacity: 0.15 }}
            />
          )}
        </MapContainer>
      </div>
      {!esExacta && (
        <p className="mt-2 text-xs text-ink-500">
          Ubicación aproximada: el punto marca la zona, no la dirección exacta.
        </p>
      )}
    </div>
  );
}
