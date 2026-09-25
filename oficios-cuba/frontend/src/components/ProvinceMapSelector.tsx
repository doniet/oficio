import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, X, CheckCircle, Search } from 'lucide-react';
import type { Province, Municipality } from '../types';

const CubaBounds: [[number, number], [number, number]] = [[19.8, -85.0], [23.5, -74.0]];
const CubaCenter: [number, number] = [21.5, -79.5];

const provinceCenters: Record<string, [number, number]> = {
  'Pinar del Río': [22.4123, -83.6919],
  'Artemisa': [22.8136, -82.7633],
  'La Habana': [23.1136, -82.3666],
  'Mayabeque': [22.9583, -82.1542],
  'Matanzas': [23.0494, -81.5736],
  'Cienfuegos': [22.1456, -80.4364],
  'Villa Clara': [22.4067, -79.9647],
  'Sancti Spíritus': [21.9339, -79.4433],
  'Ciego de Ávila': [21.8408, -78.7633],
  'Camagüey': [21.3814, -77.9167],
  'Las Tunas': [20.9611, -76.9517],
  'Granma': [20.3789, -76.6453],
  'Holguín': [20.8870, -76.2636],
  'Santiago de Cuba': [20.0217, -75.8294],
  'Guantánamo': [20.1411, -75.2092],
  'Isla de la Juventud': [21.8333, -82.7833],
};

const provinceColors: Record<string, string> = {
  'Pinar del Río': '#1e40af',
  'Artemisa': '#047857',
  'La Habana': '#dc2626',
  'Mayabeque': '#7c3aed',
  'Matanzas': '#ea580c',
  'Cienfuegos': '#0891b2',
  'Villa Clara': '#65a30d',
  'Sancti Spíritus': '#db2777',
  'Ciego de Ávila': '#c2410c',
  'Camagüey': '#4338ca',
  'Las Tunas': '#e11d48',
  'Granma': '#059669',
  'Holguín': '#d97706',
  'Santiago de Cuba': '#9333ea',
  'Guantánamo': '#0d9488',
  'Isla de la Juventud': '#475569',
};

function MapEvents({
  selectedProvince,
  setSelectedProvince,
  selectedMunicipality,
  setSelectedMunicipality,
  municipalities,
}: {
  selectedProvince: Province | null;
  setSelectedProvince: (province: Province | null) => void;
  selectedMunicipality: Municipality | null;
  setSelectedMunicipality: (municipality: Municipality | null) => void;
  municipalities: Municipality[];
}) {
  const map = useMapEvents({
    click(e) {
      if (!selectedProvince) return;
      const { lat, lng } = e.latlng;
      const closest = municipalities.reduce((closest, muni) => {
        const dist = Math.hypot(muni.lat - lat, muni.lng - lng);
        const closestDist = Math.hypot(closest.lat - lat, closest.lng - lng);
        return dist < closestDist ? muni : closest;
      }, municipalities[0]);
      if (closest) {
        setSelectedMunicipality(closest);
      }
    },
  });

  useEffect(() => {
    if (selectedProvince) {
      const center = provinceCenters[selectedProvince.name] || CubaCenter;
      map.setView(center, selectedProvince.zoom || 9);
    } else {
      map.fitBounds(CubaBounds);
    }
  }, [selectedProvince, map]);

  return null;
}

function ProvinceMarker({ province, isSelected, onClick }: { province: Province; isSelected: boolean; onClick: () => void }) {
  const color = provinceColors[province.name] || '#0ea5e9';
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <Marker position={[province.lat, province.lng]} icon={icon} onClick={onClick}>
      <Popup>
        <div className="p-2 min-w-[180px]">
          <h3 className="font-semibold text-gray-900">{province.name}</h3>
          <p className="text-sm text-gray-500">Capital: {province.capital}</p>
          <button
            onClick={onClick}
            className={`mt-2 w-full py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isSelected ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {isSelected ? 'Seleccionada ✓' : 'Seleccionar provincia'}
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

function MunicipalityMarker({ municipality, isSelected, onClick }: { municipality: Municipality; isSelected: boolean; onClick: () => void }) {
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #0ea5e9;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  return (
    <Marker position={[municipality.lat, municipality.lng]} icon={icon} onClick={onClick}>
      <Popup>
        <div className="p-2 min-w-[160px]">
          <h3 className="font-semibold text-gray-900">{municipality.name}</h3>
          <button
            onClick={onClick}
            className={`mt-2 w-full py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isSelected ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {isSelected ? 'Seleccionado ✓' : 'Seleccionar municipio'}
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

export default function ProvinceMapSelector({
  provinces,
  municipalities,
  selectedProvince,
  setSelectedProvince,
  selectedMunicipality,
  setSelectedMunicipality,
  onConfirm,
  className = '',
}: {
  provinces: Province[];
  municipalities: Municipality[];
  selectedProvince: Province | null;
  setSelectedProvince: (province: Province | null) => void;
  selectedMunicipality: Municipality | null;
  setSelectedMunicipality: (municipality: Municipality | null) => void;
  onConfirm?: () => void;
  className?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const mapRef = useRef<L.Map | null>(null);

  const filteredProvinces = provinces.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMunicipalities = municipalities.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProvinceClick = (province: Province) => {
    setSelectedProvince(province);
    setSelectedMunicipality(null);
    setSearchQuery('');
  };

  const handleMunicipalityClick = (municipality: Municipality) => {
    setSelectedMunicipality(municipality);
  };

  const handleConfirm = () => {
    if (selectedProvince) {
      onConfirm?.();
    }
  };

  const handleLocate = async () => {
    if (!navigator.geolocation) {
      alert('Geolocalización no soportada');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 12);
        }
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=es`,
            { headers: { 'User-Agent': 'OficiosCuba/1.0' } }
          );
          const data = await response.json();
          const provinceName = data.address?.state || data.address?.province || data.address?.region;
          if (provinceName) {
            const province = provinces.find((p) => p.name.includes(provinceName) || provinceName.includes(p.name));
            if (province) {
              setSelectedProvince(province);
              setSelectedMunicipality(null);
            }
          }
        } catch (error) {
          console.error('Error reverse geocoding:', error);
        }
      },
      (error) => {
        alert('No se pudo obtener la ubicación: ' + error.message);
      }
    );
  };

  return (
    <div className={`relative ${className}`}>
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={selectedProvince ? 'Buscar municipio...' : 'Buscar provincia...'}
            className="w-full pl-10 pr-4 py-2 bg-white/95 backdrop-blur-sm rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleLocate}
            className="btn-secondary text-sm gap-2"
            title="Usar mi ubicación"
          >
            <MapPin className="w-4 h-4" />
            <span className="hidden sm:inline">Mi ubicación</span>
          </button>
        </div>
      </div>

      <MapContainer
        ref={mapRef}
        center={selectedProvince ? (provinceCenters[selectedProvince.name] || CubaCenter) : CubaCenter}
        zoom={selectedProvince ? (selectedProvince.zoom || 9) : 6}
        bounds={CubaBounds}
        maxBounds={CubaBounds}
        maxBoundsViscosity={1.0}
        className="w-full h-[500px] rounded-xl overflow-hidden shadow-lg"
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={18}
        />

        {!selectedProvince && (
          <>
            {provinces.map((province) => (
              <ProvinceMarker
                key={province.id}
                province={province}
                isSelected={selectedProvince?.id === province.id}
                onClick={() => handleProvinceClick(province)}
              />
            ))}
          </>
        )}

        {selectedProvince && (
          <>
            <MapEvents
              selectedProvince={selectedProvince}
              setSelectedProvince={setSelectedProvince}
              selectedMunicipality={selectedMunicipality}
              setSelectedMunicipality={setSelectedMunicipality}
              municipalities={municipalities}
            />
            {municipalities.map((municipality) => (
              <MunicipalityMarker
                key={municipality.id}
                municipality={municipality}
                isSelected={selectedMunicipality?.id === municipality.id}
                onClick={() => handleMunicipalityClick(municipality)}
              />
            ))}
          </>
        )}
      </MapContainer>

      <div className="mt-4 p-4 bg-white rounded-xl border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Provincia seleccionada</label>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedProvince ? selectedProvince.name : 'Ninguna seleccionada'}
                  </p>
                  {selectedProvince && (
                    <p className="text-sm text-gray-500">Capital: {selectedProvince.capital}</p>
                  )}
                </div>
              </div>
              {selectedProvince && (
                <button
                  onClick={() => {
                    setSelectedProvince(null);
                    setSelectedMunicipality(null);
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Cambiar
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="label">Municipio seleccionado</label>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedMunicipality ? selectedMunicipality.name : 'Ninguno (opcional)'}
                  </p>
                </div>
              </div>
              {selectedMunicipality && (
                <button
                  onClick={() => setSelectedMunicipality(null)}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>

        {selectedProvince && onConfirm && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleConfirm}
              className="btn-primary w-full"
            >
              Confirmar selección
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          {selectedProvince ? `Municipios de ${selectedProvince.name}` : 'Provincias de Cuba'}
        </h4>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto scrollbar-hide">
          {selectedProvince
            ? municipalities.map((muni) => (
                <button
                  key={muni.id}
                  onClick={() => handleMunicipalityClick(muni)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedMunicipality?.id === muni.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {muni.name}
                </button>
              ))
            : filteredProvinces.map((province) => (
                <button
                  key={province.id}
                  onClick={() => handleProvinceClick(province)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedProvince?.id === province.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {province.name}
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}