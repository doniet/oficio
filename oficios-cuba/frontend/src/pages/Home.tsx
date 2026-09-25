import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { provinceApi, categoryApi, providerApi, serviceApi } from '../services/api';
import type { Province, Category, ProviderProfile } from '../types';
import { MapPin, Briefcase, Star, Shield, Users, ArrowRight, Search, Building2, Truck, Wrench, Paintbrush, Zap, Droplets, Wind } from 'lucide-react';

const popularCategories = [
  { name: 'Electricidad', icon: Zap, slug: 'electricidad', color: 'bg-yellow-100 text-yellow-600' },
  { name: 'Plomería', icon: Droplets, slug: 'fontaneria-plomeria', color: 'bg-blue-100 text-blue-600' },
  { name: 'Pintura', icon: Paintbrush, slug: 'pintura', color: 'bg-purple-100 text-purple-600' },
  { name: 'Carpintería', icon: Wrench, slug: 'carpinteria', color: 'bg-orange-100 text-orange-600' },
  { name: 'Albañilería', icon: Building2, slug: 'albanileria', color: 'bg-red-100 text-red-600' },
  { name: 'Aire Acondicionado', icon: Wind, slug: 'aire-acondicionado', color: 'bg-cyan-100 text-cyan-600' },
];

const features = [
  { icon: Search, title: 'Búsqueda Inteligente', description: 'Encuentra el servicio que necesitas filtrando por provincia, categoría y precio.' },
  { icon: MapPin, title: 'Cobertura Nacional', description: 'Servicios disponibles en las 15 provincias y la Isla de la Juventud.' },
  { icon: Shield, title: 'Profesionales Verificados', description: 'Proveedores con reseñas reales y calificaciones de clientes anteriores.' },
  { icon: Users, title: 'Chat Directo', description: 'Comunícate directamente con el proveedor para acordar detalles y precios.' },
];

export default function Home() {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [featuredProviders, setFeaturedProviders] = useState<ProviderProfile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [provincesRes, categoriesRes, providersRes] = await Promise.all([
          provinceApi.getAll(),
          categoryApi.getAll(),
          providerApi.getFeatured({ limit: 6 }),
        ]);
        setProvinces(provincesRes.data.provinces);
        setCategories(categoriesRes.data.categories);
        setFeaturedProviders(providersRes.data.providers);
      } catch (error) {
        console.error('Error loading home data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen">
      <section className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6 animate-fade-in">
              Encuentra el <span className="text-yellow-300">profesional</span> que necesitas
            </h1>
            <p className="text-lg sm:text-xl text-primary-100 mb-8 animate-slide-up">
              La plataforma #1 en Cuba para conectar con electricistas, plomeros, pintores, carpinteros y más de 50 oficios. Rápido, seguro y cerca de ti.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 animate-slide-up">
              <Link to="/buscar" className="btn bg-white text-primary-600 hover:bg-primary-50 w-full sm:w-auto py-3 px-8 text-lg">
                Buscar servicios
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link to="/registro" className="btn border-2 border-white text-white hover:bg-primary-700 w-full sm:w-auto py-3 px-8 text-lg">
                Ofrecer mis servicios
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-50 to-transparent" />
      </section>

      <section className="py-16 -mt-16 relative z-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Link
              key={feature.title}
              to="/buscar"
              className="card p-6 group hover:shadow-lg hover:border-primary-200"
            >
              <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary-600 group-hover:text-white transition-colors">
                <feature.icon className="w-6 h-6 text-primary-600 group-hover:text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="py-16 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Categorías populares</h2>
              <p className="text-gray-600 mt-1">Más de 50 categorías de servicios disponibles</p>
            </div>
            <Link to="/buscar" className="btn-outline">
              Ver todas
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {popularCategories.map((cat) => (
              <Link
                key={cat.name}
                to={`/buscar?category=${cat.slug}`}
                className="card p-5 text-center group hover:shadow-lg hover:border-primary-200"
              >
                <div className={`w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center ${cat.color}`}>
                  <cat.icon className="w-7 h-7" />
                </div>
                <h3 className="font-medium text-gray-900">{cat.name}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Profesionales destacados</h2>
              <p className="text-gray-600 mt-1">Proveedores con mejor calificación en tu zona</p>
            </div>
            <Link to="/buscar" className="btn-outline">
              Ver todos
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card p-6 animate-pulse">
                  <div className="h-10 bg-gray-200 rounded w-3/4 mb-4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : featuredProviders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProviders.map((provider) => (
                <Link
                  key={provider.id}
                  to={`/proveedor/${provider.id}`}
                  className="card p-6 hover:shadow-lg hover:border-primary-200 group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      {provider.avatar_url ? (
                        <img src={provider.avatar_url} alt="" className="w-14 h-14 rounded-xl" />
                      ) : (
                        <Building2 className="w-7 h-7 text-primary-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary-600 transition-colors">
                        {provider.business_name || provider.owner_name}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">{provider.province_name}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <Star className="w-4 h-4 text-yellow-500 fill-current" />
                          {provider.rating.toFixed(1)} ({provider.review_count})
                        </span>
                        <span className={`badge ${provider.subscription_plan === 'premium' ? 'bg-purple-100 text-purple-800' : provider.subscription_plan === 'pro' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {provider.subscription_plan.charAt(0).toUpperCase() + provider.subscription_plan.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay profesionales destacados</h3>
              <p className="text-gray-500">Sé el primero en registrarte como proveedor</p>
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Explora por provincia</h2>
              <p className="text-gray-600 mt-1">Encuentra servicios cerca de ti</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-3">
            {provinces.map((province) => (
              <Link
                key={province.id}
                to={`/buscar?province=${province.id}`}
                className="card p-4 text-center group hover:shadow-md hover:border-primary-300 hover:bg-primary-50"
              >
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary-100 flex items-center justify-center group-hover:bg-primary-600 group-hover:text-white transition-colors">
                  <MapPin className="w-5 h-5 text-primary-600 group-hover:text-white" />
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{province.name}</p>
                <p className="text-xs text-gray-500">{province.capital}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-primary-600 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">¿Eres profesional?</h2>
          <p className="text-primary-100 text-lg mb-8 max-w-2xl mx-auto">
            Únete a miles de profesionales que ya usan Oficios Cuba para conseguir más clientes y hacer crecer su negocio.
          </p>
          <Link to="/registro" className="btn bg-white text-primary-600 hover:bg-primary-50 px-8 py-3 text-lg">
            Registrarse como proveedor
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </section>
    </div>
  );
}