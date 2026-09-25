import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { providerApi, provinceApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { ProviderProfile, Province, Municipality } from '../../types';
import ProvinceMapSelector from '../../components/ProvinceMapSelector';
import { MapPin, Building2, Phone, Mail, MessageSquare, Clock, Save, Loader2, ArrowLeft } from 'lucide-react';

export default function ProviderProfileEdit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    business_name: '',
    description: '',
    province_id: '',
    municipality_id: '',
    address: '',
    lat: 0,
    lng: 0,
    whatsapp: '',
    telegram: '',
    email_contact: '',
    years_experience: 0,
    service_area_ids: [] as string[],
  });

  const [selectedProvince, setSelectedProvince] = useState<Province | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [providerRes, provincesRes] = await Promise.all([
          providerApi.getMyProfile(),
          provinceApi.getAll(),
        ]);
        setProvider(providerRes.data.provider);
        setProvinces(provincesRes.data.provinces);

        if (providerRes.data.provider) {
          const p = providerRes.data.provider;
          const province = provincesRes.data.provinces.find(pr => pr.id === p.province_id);
          const municipality = p.municipality_id ? p.municipality_id : null;

          setFormData({
            business_name: p.business_name || '',
            description: p.description || '',
            province_id: p.province_id,
            municipality_id: p.municipality_id || '',
            address: p.address || '',
            lat: p.lat || 0,
            lng: p.lng || 0,
            whatsapp: p.whatsapp || '',
            telegram: p.telegram || '',
            email_contact: p.email_contact || '',
            years_experience: p.years_experience || 0,
            service_area_ids: p.service_areas?.map(sa => sa.municipality_id) || [],
          });

          if (province) setSelectedProvince(province);
          if (municipality) {
            const muni = municipalities.find(m => m.id === municipality);
            if (muni) setSelectedMunicipality(muni);
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        setError('Error al cargar el perfil');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedProvince) {
      const fetchMunicipalities = async () => {
        try {
          const res = await provinceApi.getMunicipalities(selectedProvince.id);
          setMunicipalities(res.data.municipalities);
        } catch (error) {
          console.error('Error fetching municipalities:', error);
        }
      };
      fetchMunicipalities();
    } else {
      setMunicipalities([]);
    }
  }, [selectedProvince]);

  const handleProvinceSelect = (province: Province | null) => {
    setSelectedProvince(province);
    setSelectedMunicipality(null);
    setFormData(prev => ({ ...prev, province_id: province?.id || '', municipality_id: '', lat: province?.lat || 0, lng: province?.lng || 0 }));
  };

  const handleMunicipalitySelect = (municipality: Municipality | null) => {
    setSelectedMunicipality(municipality);
    setFormData(prev => ({ ...prev, municipality_id: municipality?.id || '', lat: municipality?.lat || 0, lng: municipality?.lng || 0 }));
  };

  const handleServiceAreaToggle = (municipalityId: string) => {
    setFormData(prev => ({
      ...prev,
      service_area_ids: prev.service_area_ids.includes(municipalityId)
        ? prev.service_area_ids.filter(id => id !== municipalityId)
        : [...prev.service_area_ids, municipalityId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await providerApi.updateMyProfile(formData);
      setSuccess('Perfil actualizado correctamente');
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al actualizar el perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-5 h-5" />
            Volver al panel
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Editar Perfil Profesional</h1>
          <p className="text-gray-600 mt-1">Completa tu información para que los clientes te encuentren fácilmente</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700" role="alert">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary-600" />
              Información del Negocio
            </h2>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label htmlFor="business_name" className="label">Nombre del negocio / Marca personal</label>
              <input
                id="business_name"
                type="text"
                value={formData.business_name}
                onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
                className="input"
                placeholder="Ej: Electricista Juan, Construcciones Pérez..."
              />
              <p className="text-sm text-gray-500 mt-1">Este nombre aparecerá públicamente en tu perfil y servicios</p>
            </div>

            <div>
              <label htmlFor="description" className="label">Descripción profesional</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="input min-h-[120px] resize-y"
                placeholder="Describe tu experiencia, especialidades, certificaciones, años en el oficio..."
                rows={5}
              />
            </div>

            <div>
              <label className="label">Ubicación principal</label>
              <ProvinceMapSelector
                provinces={provinces}
                municipalities={municipalities}
                selectedProvince={selectedProvince}
                setSelectedProvince={handleProvinceSelect}
                selectedMunicipality={selectedMunicipality}
                setSelectedMunicipality={handleMunicipalitySelect}
              />
            </div>

            <div>
              <label htmlFor="address" className="label">Dirección detallada (opcional)</label>
              <input
                id="address"
                type="text"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="input"
                placeholder="Calle, número, reparto, puntos de referencia..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="years_experience" className="label">Años de experiencia</label>
                <input
                  id="years_experience"
                  type="number"
                  min="0"
                  max="60"
                  value={formData.years_experience}
                  onChange={(e) => setFormData(prev => ({ ...prev, years_experience: Number(e.target.value) || 0 }))}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary-600" />
              Métodos de Contacto
            </h2>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label htmlFor="whatsapp" className="label flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-600" />
                WhatsApp
              </label>
              <input
                id="whatsapp"
                type="tel"
                value={formData.whatsapp}
                onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                className="input"
                placeholder="+53 5 XXX XXXX"
              />
              <p className="text-sm text-gray-500 mt-1">Formato: +53 5 XXXXXXX (recomendado para clientes)</p>
            </div>

            <div>
              <label htmlFor="telegram" className="label flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Teléfono
              </label>
              <input
                id="telegram"
                type="tel"
                value={formData.telegram}
                onChange={(e) => setFormData(prev => ({ ...prev, telegram: e.target.value }))}
                className="input"
                placeholder="+53 XX XXXXXXX"
              />
            </div>

            <div>
              <label htmlFor="email_contact" className="label flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Email de contacto
              </label>
              <input
                id="email_contact"
                type="email"
                value={formData.email_contact}
                onChange={(e) => setFormData(prev => ({ ...prev, email_contact: e.target.value }))}
                className="input"
                placeholder="contacto@ejemplo.com"
              />
            </div>
          </div>

          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary-600" />
              Área de Servicio
            </h2>
            <p className="text-sm text-gray-500 mt-1">Selecciona los municipios donde ofreces tus servicios</p>
          </div>

          <div className="p-6">
            {selectedProvince && municipalities.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                {municipalities.map((muni) => (
                  <label
                    key={muni.id}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                      formData.service_area_ids.includes(muni.id)
                        ? 'bg-primary-100 text-primary-800 ring-2 ring-primary-500'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.service_area_ids.includes(muni.id)}
                      onChange={() => handleServiceAreaToggle(muni.id)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    {muni.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Selecciona una provincia arriba para ver los municipios disponibles</p>
            )}
          </div>

          <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar cambios
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  }
