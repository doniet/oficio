import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { serviceApi, provinceApi, categoryApi } from '../services/api';
import type { Service, Province, Category, Municipality } from '../types';
import ProvinceMapSelector from '../components/ProvinceMapSelector';
import { Search as SearchIcon, Filter, X, MapPin, Tag, DollarSign, Star, Truck, Building2, ChevronLeft, ChevronRight, MapPin as MapPinIcon } from 'lucide-react';

const priceTypes = [
  { value: 'fixed', label: 'Precio fijo' },
  { value: 'hourly', label: 'Por hora' },
  { value: 'daily', label: 'Por día' },
  { value: 'negotiable', label: 'Negociable' },
];

const sortOptions = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'rating', label: 'Mejor valorados' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'newest', label: 'Más recientes' },
];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 0 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState<Province | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [selectedPriceType, setSelectedPriceType] = useState<string>('');
  const [sortBy, setSortBy] = useState('relevance');

  const query = searchParams.get('q') || '';
  const provinceParam = searchParams.get('province');
  const categoryParam = searchParams.get('category');
  const municipalityParam = searchParams.get('municipality');

  useEffect(() => {
    const fetchProvinces = async () => {
      try {
        const res = await provinceApi.getAll();
        setProvinces(res.data.provinces);
      } catch (error) {
        console.error('Error fetching provinces:', error);
      }
    };
    fetchProvinces();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await categoryApi.getFlat();
        setCategories(res.data.categories);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    fetchCategories();
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

  useEffect(() => {
    if (provinceParam) {
      const province = provinces.find(p => p.id === provinceParam);
      if (province) setSelectedProvince(province);
    }
    if (categoryParam) setSelectedCategory(categoryParam);
    if (municipalityParam) {
      const municipality = municipalities.find(m => m.id === municipalityParam);
      if (municipality) setSelectedMunicipality(municipality);
    }
  }, [provinceParam, categoryParam, municipalityParam, provinces, municipalities]);

  const fetchServices = async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        limit: 12,
        sort: sortBy,
      };
      if (query) params.q = query;
      if (selectedProvince) params.province_id = selectedProvince.id;
      if (selectedMunicipality) params.municipality_id = selectedMunicipality.id;
      if (selectedCategory) params.category_id = selectedCategory;
      if (priceRange[0] > 0) params.price_min = priceRange[0];
      if (priceRange[1] < 10000) params.price_max = priceRange[1];
      if (selectedPriceType) params.price_type = selectedPriceType;

      const res = await serviceApi.getAll(params);
      setServices(res.data.services);
      setPagination(res.data.pagination);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices(1);
  }, [query, selectedProvince, selectedMunicipality, selectedCategory, priceRange, selectedPriceType, sortBy]);

  const handleProvinceSelect = (province: Province | null) => {
    setSelectedProvince(province);
    setSelectedMunicipality(null);
    const params = new URLSearchParams(searchParams);
    if (province) {
      params.set('province', province.id);
    } else {
      params.delete('province');
    }
    params.delete('municipality');
    setSearchParams(params);
  };

  const handleMunicipalitySelect = (municipality: Municipality | null) => {
    setSelectedMunicipality(municipality);
    const params = new URLSearchParams(searchParams);
    if (municipality) {
      params.set('municipality', municipality.id);
    } else {
      params.delete('municipality');
    }
    setSearchParams(params);
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const params = new URLSearchParams(searchParams);
    if (categoryId) {
      params.set('category', categoryId);
    } else {
      params.delete('category');
    }
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSelectedCategory('');
    setPriceRange([0, 10000]);
    setSelectedPriceType('');
    setSortBy('relevance');
    const params = new URLSearchParams(searchParams);
    params.delete('category');
    params.delete('price_min');
    params.delete('price_max');
    params.delete('price_type');
    params.delete('sort');
    setSearchParams(params);
  };

  const hasActiveFilters = selectedCategory || priceRange[0] > 0 || priceRange[1] < 10000 || selectedPriceType;

  const selectedCategoryData = useMemo(() => 
    categories.find(c => c.id === selectedCategory), [categories, selectedCategory]);

  const selectedProvinceName = selectedProvince?.name;
  const selectedMunicipalityName = selectedMunicipality?.name;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  const params = new URLSearchParams(searchParams);
                  if (e.target.value) params.set('q', e.target.value);
                  else params.delete('q');
                  setSearchParams(params);
                }}
                placeholder="¿Qué servicio necesitas? (ej. electricista, plomero...)"
                className="input pl-10"
              />
            </div>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`btn-secondary gap-2 ${hasActiveFilters ? 'bg-primary-50 border-primary-200 text-primary-700' : ''}`}
            >
              <Filter className="w-5 h-5" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && <span className="badge bg-primary-100 text-primary-800">Activos</span>}
            </button>
          </div>

          {filtersOpen && (
            <div className="mt-4 animate-slide-up">
              <ProvinceMapSelector
                provinces={provinces}
                municipalities={municipalities}
                selectedProvince={selectedProvince}
                setSelectedProvince={handleProvinceSelect}
                selectedMunicipality={selectedMunicipality}
                setSelectedMunicipality={handleMunicipalitySelect}
              />
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="label">Categoría</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategorySelect(e.target.value)}
                    className="input"
                  >
                    <option value="">Todas las categorías</option>
                    {categories.filter(c => !c.parent_id).map((cat) => (
                      <optgroup key={cat.id} label={cat.name}>
                        {cat.subcategories?.map((sub) => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Rango de precio (USD)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={priceRange[0]}
                      onChange={(e) => setPriceRange([Math.min(Number(e.target.value), priceRange[1]), priceRange[1]])}
                      placeholder="Mín"
                      className="input w-1/2"
                      min="0"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="number"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([priceRange[0], Math.max(Number(e.target.value), priceRange[0])])}
                      placeholder="Máx"
                      className="input w-1/2"
                      min="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Tipo de precio</label>
                  <select
                    value={selectedPriceType}
                    onChange={(e) => setSelectedPriceType(e.target.value)}
                    className="input"
                  >
                    <option value="">Cualquiera</option>
                    {priceTypes.map((pt) => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Ordenar por</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="input"
                  >
                    {sortOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {hasActiveFilters && (
                <div className="mt-4 flex justify-end">
                  <button onClick={clearFilters} className="btn-secondary text-sm gap-2">
                    <X className="w-4 h-4" />
                    Limpiar filtros
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-72 flex-shrink-0">
            <div className="card p-4 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Resumen de búsqueda</h3>
              <div className="space-y-3">
                {selectedProvinceName && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPinIcon className="w-4 h-4 text-primary-600" />
                    <span className="font-medium">{selectedProvinceName}</span>
                    {selectedMunicipalityName && (
                      <>
                        <span className="text-gray-300">/</span>
                        <span>{selectedMunicipalityName}</span>
                      </>
                    )}
                  </div>
                )}
                {selectedCategoryData && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Tag className="w-4 h-4 text-primary-600" />
                    <span className="font-medium">{selectedCategoryData.name}</span>
                  </div>
                )}
                {priceRange[0] > 0 || priceRange[1] < 10000 ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <DollarSign className="w-4 h-4 text-primary-600" />
                    <span className="font-medium">${priceRange[0]} - ${priceRange[1]}</span>
                  </div>
                ) : null}
                {selectedPriceType && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Tag className="w-4 h-4 text-primary-600" />
                    <span className="font-medium">
                      {priceTypes.find(pt => pt.value === selectedPriceType)?.label}
                    </span>
                  </div>
                )}
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="w-full mt-4 text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Limpiar todos los filtros
                </button>
              )}
            </div>
          </aside>

          <main className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {services.length} {services.length === 1 ? 'servicio' : 'servicios'} encontrado{services.length !== 1 ? 's' : ''}
                </h2>
                {query && (
                  <p className="text-gray-500 mt-1">Resultados para: <span className="font-medium">"{query}"</span></p>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="h-40 bg-gray-200" />
                    <div className="p-4 space-y-3">
                      <div className="h-6 bg-gray-200 rounded w-3/4" />
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                      <div className="h-4 bg-gray-200 rounded w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : services.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {services.map((service) => (
                    <ServiceCard key={service.id} service={service} />
                  ))}
                </div>

                {pagination.totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                      onClick={() => fetchServices(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="btn-secondary"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="px-4 text-sm font-medium text-gray-700">
                      Página {pagination.page} de {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => fetchServices(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                      className="btn-secondary"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="card p-12 text-center">
                <SearchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron servicios</h3>
                <p className="text-gray-500 mb-6">Intenta ajustar tus filtros o busca en otra zona</p>
                <button onClick={clearFilters} className="btn-primary">
                  Limpiar filtros
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: Service }) {
  const formatPrice = (service: Service) => {
    if (service.price_type === 'negotiable' || (!service.price_min && !service.price_max)) {
      return 'Precio negociable';
    }
    if (service.price_min && service.price_max && service.price_min !== service.price_max) {
      return `$${service.price_min} - $${service.price_max} ${service.price_type === 'hourly' ? '/hora' : service.price_type === 'daily' ? '/día' : ''}`;
    }
    return `$${service.price_min || service.price_max} ${service.price_type === 'hourly' ? '/hora' : service.price_type === 'daily' ? '/día' : ''}`;
  };

  return (
    <Link to={`/servicio/${service.id}`} className="card overflow-hidden hover:shadow-lg hover:border-primary-200 group">
      <div className="relative h-40 bg-gray-100">
        {service.images && service.images.length > 0 ? (
          <img
            src={service.images[0]}
            alt={service.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <Building2 className="w-12 h-12 text-gray-400" />
          </div>
        )}
        {service.provider_subscription_plan !== 'free' && (
          <span className={`absolute top-2 right-2 badge ${
            service.provider_subscription_plan === 'premium' ? 'bg-purple-600 text-white' :
            service.provider_subscription_plan === 'pro' ? 'bg-blue-600 text-white' :
            'bg-gray-600 text-white'
          }`}>
            {service.provider_subscription_plan.charAt(0).toUpperCase() + service.provider_subscription_plan.slice(1)}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="badge bg-primary-100 text-primary-800">{service.category_icon} {service.category_name}</span>
        </div>
        <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1 group-hover:text-primary-600 transition-colors">
          {service.title}
        </h3>
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{service.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            {service.provider_business_name && (
              <span className="font-medium text-gray-900">{service.provider_business_name}</span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {service.province_name}
              {service.municipality_name && `, ${service.municipality_name}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-primary-600">{formatPrice(service)}</span>
            {service.provider_rating > 0 && (
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                {service.provider_rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}