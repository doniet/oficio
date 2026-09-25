import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { providerApi, serviceApi, subscriptionApi, conversationApi, reviewApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { ProviderProfile, Service, Subscription } from '../../types';
import { LayoutDashboard, Briefcase, CreditCard, MessageSquare, Heart, User, Settings, ArrowRight, Star, TrendingUp, Clock, DollarSign, Plus, Building2, MapPin } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [conversationsCount, setConversationsCount] = useState(0);
  const [reviewsStats, setReviewsStats] = useState({ avg_rating: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.user_type !== 'provider') return;

    const fetchData = async () => {
      try {
        const [providerRes, servicesRes, subRes, convRes, reviewsRes] = await Promise.all([
          providerApi.getMyProfile(),
          serviceApi.getAll({ provider_id: '', page: 1, limit: 5 }),
          subscriptionApi.getMySubscription(),
          conversationApi.getAll(),
          reviewApi.getByProvider('').catch(() => ({ data: { reviews: [], stats: {} } })),
        ]);

        setProvider(providerRes.data.provider);
        setServices(servicesRes.data.services);
        setSubscription(subRes.data.subscription);
        setConversationsCount(convRes.data.conversations?.length || 0);
        setReviewsStats(reviewsRes.data.stats || { avg_rating: 0, total: 0 });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  if (user?.user_type === 'client') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <LayoutDashboard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Panel de Cliente</h1>
            <p className="text-gray-600 mb-8">Desde aquí puedes gestionar tus favoritos, ver tus mensajes y configurar tu cuenta.</p>
            <div className="flex justify-center gap-4">
              <Link to="/dashboard/favoritos" className="btn-primary gap-2">
                <Heart className="w-5 h-5" />
                Mis Favoritos
              </Link>
              <Link to="/dashboard/mensajes" className="btn-secondary gap-2">
                <MessageSquare className="w-5 h-5" />
                Mensajes
              </Link>
              <Link to="/dashboard/cuenta" className="btn-secondary gap-2">
                <Settings className="w-5 h-5" />
                Mi Cuenta
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card p-12 text-center">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Completa tu perfil</h1>
            <p className="text-gray-600 mb-6">Para acceder al panel de proveedor, primero debes completar tu perfil profesional.</p>
            <Link to="/dashboard/perfil" className="btn-primary">
              Completar perfil
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Servicios publicados',
      value: services.length,
      icon: Briefcase,
      color: 'text-primary-600 bg-primary-100',
      link: '/dashboard/servicios',
    },
    {
      label: 'Conversaciones activas',
      value: conversationsCount,
      icon: MessageSquare,
      color: 'text-green-600 bg-green-100',
      link: '/dashboard/mensajes',
    },
    {
      label: 'Calificación promedio',
      value: provider.rating > 0 ? provider.rating.toFixed(1) : 'Sin calificar',
      icon: Star,
      color: 'text-yellow-600 bg-yellow-100',
      link: '/proveedor/' + provider.id,
    },
    {
      label: 'Suscripción',
      value: subscription?.plan ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1) : 'Gratuito',
      icon: CreditCard,
      color: subscription?.plan === 'premium' ? 'text-purple-600 bg-purple-100' :
             subscription?.plan === 'pro' ? 'text-blue-600 bg-blue-100' :
             subscription?.plan === 'basic' ? 'text-green-600 bg-green-100' :
             'text-gray-600 bg-gray-100',
      link: '/dashboard/suscripciones',
    },
  ];

  const recentServices = services.slice(0, 4);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Panel de Proveedor</h1>
            <p className="text-gray-600 mt-1">Gestiona tu negocio y servicios</p>
          </div>
          <Link to="/dashboard/servicios/nuevo" className="btn-primary gap-2">
            <Plus className="w-5 h-5" />
            Nuevo servicio
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <Link key={stat.label} to={stat.link} className="card p-6 hover:shadow-lg hover:border-primary-200 group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500 group-hover:text-primary-600">
                <span>Ver detalles</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Mis Servicios</h2>
              <Link to="/dashboard/servicios" className="text-sm text-primary-600 hover:text-primary-700">Ver todos</Link>
            </div>
            <div className="divide-y divide-gray-100">
              {recentServices.length > 0 ? (
                recentServices.map((service) => (
                  <Link
                    key={service.id}
                    to={`/dashboard/servicios/${service.id}/editar`}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">{service.category_icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{service.title}</h3>
                      <p className="text-sm text-gray-500 truncate">{service.category_name}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`badge ${service.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {service.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      <span className="font-semibold text-primary-600">
                        {service.price_type === 'negotiable' ? 'Negociable' : `$${service.price_min || service.price_max}`}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center">
                  <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-medium text-gray-900 mb-1">No tienes servicios publicados</h3>
                  <p className="text-gray-500 text-sm mb-4">Crea tu primer servicio para empezar a recibir clientes</p>
                  <Link to="/dashboard/servicios/nuevo" className="btn-primary inline-flex gap-2">
                    <Plus className="w-4 h-4" />
                    Crear servicio
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Resumen del Perfil</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-primary-100 flex items-center justify-center">
                  {provider.avatar_url ? (
                    <img src={provider.avatar_url} alt="" className="w-16 h-16 rounded-xl" />
                  ) : (
                    <Building2 className="w-8 h-8 text-primary-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{provider.business_name || provider.owner_name}</h3>
                  <p className="text-sm text-gray-500">{provider.province_name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Calificación</p>
                  <p className="font-bold text-lg flex items-center gap-1">
                    <Star className="w-5 h-5 text-yellow-500 fill-current" />
                    {provider.rating.toFixed(1)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Reseñas</p>
                  <p className="font-bold text-lg">{provider.review_count}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Experiencia</p>
                  <p className="font-bold text-lg">{provider.years_experience || 0} años</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Servicios</p>
                  <p className="font-bold text-lg">{services.length}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 space-y-3">
                <Link to="/dashboard/perfil" className="btn-secondary w-full gap-2 justify-center">
                  <User className="w-5 h-5" />
                  Editar perfil
                </Link>
                <Link to="/dashboard/suscripciones" className="btn-outline w-full gap-2 justify-center">
                  <CreditCard className="w-5 h-5" />
                  Gestionar suscripción
                </Link>
                <Link to={`/proveedor/${provider.id}`} target="_blank" className="btn-secondary w-full gap-2 justify-center">
                  <MapPin className="w-5 h-5" />
                  Ver perfil público
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
