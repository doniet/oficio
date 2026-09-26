import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = L.divIcon({
  className: 'map-pin',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: '<span class="flex h-7 w-7 items-center justify-center"><span class="block h-5 w-5 rounded-full border-2 border-white bg-brand-600 shadow ring-4 ring-brand-500/30"></span></span>',
});

export default function PlaceMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} className="h-56 w-full rounded-2xl" attributionControl>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Marker position={[lat, lng]} icon={pin} title={label} />
    </MapContainer>
  );
}
