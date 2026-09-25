import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronLeft, Check, LocateFixed, MapPin, Search } from 'lucide-react';
import type { Municipality, Province } from '../types';
import { Spinner, cn } from './ui';

const CUBA_CENTER: [number, number] = [21.6, -79.6];
const CUBA_BOUNDS: L.LatLngBoundsExpression = [[19.5, -85.3], [23.6, -73.9]];

function pinIcon(label: string, active: boolean, small = false) {
  const size = small ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return L.divIcon({
    className: 'map-pin',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<span title="${label.replace(/"/g, '')}" class="flex h-6 w-6 items-center justify-center">
      <span class="${size} block rounded-full border-2 border-white shadow ${active ? 'bg-brand-600 ring-4 ring-brand-500/30' : 'bg-ink-900'}"></span>
    </span>`,
  });
}

function MapView({ province }: { province: Province | null }) {
  const map = useMap();
  useEffect(() => {
    if (province) map.flyTo([province.lat, province.lng], Math.max(province.zoom, 9), { duration: 0.6 });
    else map.flyTo(CUBA_CENTER, 6, { duration: 0.6 });
  }, [province, map]);
  return null;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function nearest<T extends { lat: number; lng: number }>(items: T[], lat: number, lng: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = (it.lat - lat) ** 2 + ((it.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = it; }
  }
  return best;
}

interface Props {
  provinces: Province[];
  municipalities: Municipality[];
  selectedProvince: Province | null;
  setSelectedProvince: (province: Province | null) => void;
  selectedMunicipality: Municipality | null;
  setSelectedMunicipality: (municipality: Municipality | null) => void;
  onConfirm?: () => void;
  className?: string;
}

export default function ProvinceMapSelector({
  provinces, municipalities, selectedProvince, setSelectedProvince, selectedMunicipality, setSelectedMunicipality, onConfirm, className = '',
}: Props) {
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  // La ubicación se resuelve en local contra las coordenadas conocidas: no se envía a ningún servicio externo.
  const pendingCoords = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const coords = pendingCoords.current;
    if (!coords || !municipalities.length) return;
    pendingCoords.current = null;
    const m = nearest(municipalities, coords.lat, coords.lng);
    if (m) setSelectedMunicipality(m);
  }, [municipalities, setSelectedMunicipality]);

  useEffect(() => setQuery(''), [selectedProvince?.id]);

  const listing = selectedProvince ? municipalities : provinces;
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? listing.filter((x) => normalize(x.name).includes(q)) : listing;
  }, [listing, query]);

  const pickProvince = (p: Province | null) => {
    setSelectedProvince(p);
    setSelectedMunicipality(null);
  };

  const locate = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no permite obtener la ubicación.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const p = nearest(provinces, coords.latitude, coords.longitude);
        if (!p) return;
        pendingCoords.current = { lat: coords.latitude, lng: coords.longitude };
        if (p.id === selectedProvince?.id) {
          const m = nearest(municipalities, coords.latitude, coords.longitude);
          if (m) setSelectedMunicipality(m);
          pendingCoords.current = null;
        } else {
          pickProvince(p);
        }
      },
      () => {
        setLocating(false);
        setGeoError('No pudimos obtener tu ubicación. Elige la provincia en la lista.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div className={cn('grid overflow-hidden rounded-2xl border border-sand-200 bg-white md:grid-cols-[1fr_17rem]', className)}>
      <div className="relative h-64 md:h-[26rem]">
        <MapContainer
          center={CUBA_CENTER}
          zoom={6}
          minZoom={5}
          maxBounds={CUBA_BOUNDS}
          scrollWheelZoom={false}
          className="h-full w-full"
          attributionControl
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapView province={selectedProvince} />
          {!selectedProvince && provinces.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.name, false)} eventHandlers={{ click: () => pickProvince(p) }}>
              <Tooltip direction="top" offset={[0, -8]}>{p.name}</Tooltip>
            </Marker>
          ))}
          {selectedProvince && municipalities.map((m) => (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              icon={pinIcon(m.name, m.id === selectedMunicipality?.id, true)}
              eventHandlers={{ click: () => setSelectedMunicipality(m.id === selectedMunicipality?.id ? null : m) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>{m.name}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="btn-secondary btn-sm absolute bottom-3 left-3 z-[400] shadow-card"
        >
          {locating ? <Spinner className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />} Usar mi ubicación
        </button>
      </div>

      <div className="flex min-h-0 flex-col border-t border-sand-200 md:border-l md:border-t-0">
        <div className="space-y-2 border-b border-sand-200 p-3">
          {selectedProvince ? (
            <button type="button" onClick={() => pickProvince(null)} className="flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-900">
              <ChevronLeft className="h-4 w-4" /> Todas las provincias
            </button>
          ) : (
            <p className="text-sm font-semibold text-ink-700">Elige una provincia</p>
          )}
          {selectedProvince && <p className="font-display text-lg font-bold leading-tight">{selectedProvince.name}</p>}
          <label className="relative block">
            <span className="sr-only">{selectedProvince ? 'Buscar municipio' : 'Buscar provincia'}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={selectedProvince ? 'Buscar municipio…' : 'Buscar provincia…'}
              className="input py-2 pl-9 text-sm"
            />
          </label>
          {geoError && <p className="text-xs text-red-700" role="alert">{geoError}</p>}
        </div>

        <ul className="max-h-56 flex-1 overflow-y-auto p-1.5 md:max-h-none" role="listbox" aria-label={selectedProvince ? 'Municipios' : 'Provincias'}>
          {selectedProvince && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!selectedMunicipality}
                onClick={() => setSelectedMunicipality(null)}
                className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', !selectedMunicipality ? 'bg-ink-900 font-semibold text-white' : 'text-ink-700 hover:bg-sand-100')}
              >
                <MapPin className="h-4 w-4 shrink-0 opacity-60" /> Toda la provincia
              </button>
            </li>
          )}
          {filtered.map((item) => {
            const active = selectedProvince ? item.id === selectedMunicipality?.id : false;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => (selectedProvince ? setSelectedMunicipality(item as Municipality) : pickProvince(item as Province))}
                  className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm', active ? 'bg-ink-900 font-semibold text-white' : 'text-ink-700 hover:bg-sand-100')}
                >
                  <span className="truncate">{item.name}</span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
          {selectedProvince && !municipalities.length && (
            <li className="flex justify-center py-6 text-ink-300"><Spinner /></li>
          )}
          {filtered.length === 0 && query && (
            <li className="px-3 py-6 text-center text-sm text-ink-400">Sin resultados para “{query}”.</li>
          )}
        </ul>

        {onConfirm && (
          <div className="border-t border-sand-200 p-3">
            <button type="button" onClick={onConfirm} className="btn-primary w-full">
              {selectedProvince
                ? `Ver en ${selectedMunicipality?.name ?? selectedProvince.name}`
                : 'Ver en toda Cuba'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
