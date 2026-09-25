import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { providerApi, reviewApi } from '../services/api';
import type { ProviderProfile, Service, Review } from '../../types';
import { MapPin, Star, MessageSquare, Phone, Mail, Building2, User, CheckCircle, Clock, Calendar, Shield, Heart, ArrowLeft, Briefcase, MapPin as MapPinIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function ProviderProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const [providerRes, reviewsRes] = await Promise.all([
          providerApi.getById(id),
          reviewApi.getByProvider(id, { limit: 10 }),
        ]);
        setProvider(providerRes.data.provider);
        setServices(providerRes.data.services || []);
        setReviews(reviewsRes.data.reviews || []);
      } catch (error) {
        console.error('Error fetching provider:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleContact = async (type: 'whatsapp' | 'phone' | 'email') => {
    if (!provider) return;
    if (!user) {
      alert('Debes iniciar sesión para contactar al proveedor');
      return;
    }
    let url = '';
    if (type === 'whatsapp' && provider.whatsapp) {
      const message = encodeURIComponent(`Hola, vi tu perfil en Oficios Cuba y me interesa contratar tus servicios. ¿Podrías darme más información?`);
      url = `https://wa.me/${provider.whatsapp.replace(/\D/g, '')}?text=${message}`;
    } else if (type === 'phone' && provider.telegram) {
      url = `tel:${provider.telegram}`;
    } else if (type === 'email' && provider.email_contact) {
      url = `mailto:${provider.email_contact}?subject=Consulta sobre tus servicios`;
    }
    if (url) window.open(url, '_blank');
    else alert('Este proveedor no tiene este método de contacto configurado');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Proveedor no encontrado</h2>
          <Link to="/buscar" className="btn-primary">Buscar otros proveedores</Link>
        </div>
      </div>
    );
  }

  const getSubscriptionBadge = (plan: string) => {
    switch (plan) {
      case 'premium': return { label: 'Premium', className: 'bg-purple-100 text-purple-800' };
      case 'pro': return { label: 'Profesional', className: 'bg-blue-100 text-blue-800' };
      case 'basic': return { label: 'Básico', className: 'bg-green-100 text-green-800' };
      default: return { label: 'Gratuito', className: 'bg-gray-100 text-gray-800' };
    }
  };

  const subscriptionBadge = getSubscriptionBadge(provider.subscription_plan);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <ol className="flex items-center gap-2 text-sm text-gray-500">
            <li><Link to="/" className="hover:text-primary-600">Inicio</Link></li>
            <li><span className="mx-2">/</span></li>
            <li><Link to="/buscar" className="hover:text-primary-600">Buscar</Link></li>
            <li><span className="mx-2">/</span></li>
            <li className="text-gray-900 font-medium truncate max-w-xs">{provider.business_name || provider.owner_name}</li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="card overflow-hidden">
              <div className="relative h-48 bg-gradient-to-br from-primary-600 to-primary-800">
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                      {provider.avatar_url ? (
                        <img src={provider.avatar_url} alt="" className="w-20 h-20 rounded-xl" />
                      ) : (
                        <Building2 className="w-10 h-10 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-white truncate">
                          {provider.business_name || provider.owner_name}
                        </h1>
                        <span className={`badge ${subscriptionBadge.className}`}>
                          {subscriptionBadge.label}
                        </span>
                      </div>
                      <p className="text-primary-100 mt-1">{provider.province_name}</p>
                    </div>
                    <div className="flex items-center gap-4 text-white">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{provider.rating.toFixed(1)}</p>
                        <p className="text-xs text-primary-200">Calificación</p>
                      </div>
                      <div className="border-l border-white/20 px-4 text-center">
                        <p className="text-2xl font-bold">{provider.review_count}</p>
                        <p className="text-xs text-primary-200">Reseñas</p>
                      </div>
                      <div className="border-l border-white/20 px-4 text-center">
                        <p className="text-2xl font-bold">{provider.years_experience || 0}+</p>
                        <p className="text-xs text-primary-200">Años exp.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {provider.whatsapp && (
                    <button
                      onClick={() => handleContact('whatsapp')}
                      className="btn-primary gap-3 justify-start h-auto py-4"
                    >
                      <MessageSquare className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-500">WhatsApp</p>
                        <p className="font-medium">{provider.whatsapp}</p>
                      </div>
                    </button>
                  )}
                  {provider.telegram && (
                    <button
                      onClick={() => handleContact('phone')}
                      className="btn-secondary gap-3 justify-start h-auto py-4"
                    >
                      <Phone className="w-6 h-6" />
                      <div>
                        <p className="text-sm text-gray-500">Teléfono</p>
                        <p className="font-medium">{provider.telegram}</p>
                      </div>
                    </button>
                  )}
                  {provider.email_contact && (
                    <button
                      onClick={() => handleContact('email')}
                      className="btn-secondary gap-3 justify-start h-auto py-4 sm:col-span-2"
                    >
                      <Mail className="w-6 h-6" />
                      <div>
                        <p className="text-sm text-gray-500">Email</p>
                        <p className="font-medium">{provider.email_contact}</p>
                      </div>
                    </button>
                  )}
                  {(!provider.whatsapp && !provider.telegram && !provider.email_contact) && (
                    <div className="col-span-2 text-center py-4 text-gray-500">
                      Este proveedor no tiene métodos de contacto públicos configurados.
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Sobre el proveedor</h2>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {provider.description || 'Este proveedor no ha agregado una descripción aún.'}
                  </p>
                </div>

                {provider.address && (
                  <div className="border-t border-gray-100 pt-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Ubicación</h2>
                    <div className="flex items-start gap-3">
                      <MapPinIcon className="w-5 h-5 text-primary-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900">{provider.address}</p>
                        <p className="text-sm text-gray-500">
                          {provider.municipality_name}, {provider.province_name}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Información adicional</h2>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-gray-500">Experiencia</dt>
                      <dd className="font-medium">{provider.years_experience || 0} años</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Calificación promedio</dt>
                      <dd className="font-medium flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        {provider.rating.toFixed(1)} ({provider.review_count} reseñas)
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Plan de suscripción</dt>
                      <dd className="font-medium capitalize">{provider.subscription_plan}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Miembro desde</dt>
                      <dd className="font-medium">
                        {provider.created_at ? new Date(provider.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long' }) : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Servicios ofrecidos</h2>
                  <Link to="/buscar" className="text-sm text-primary-600 hover:text-primary-700">Ver todos</Link>
                </div>
              </div>
              <div className="p-6">
                {services.length > 0 ? (
                  <div className="space-y-4">
                    {services.slice(0, 5).map((service) => (
                      <Link
                        key={service.id}
                        to={`/servicio/${service.id}`}
                        className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group"
                      >
                        <div className="w-14 h-14 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl">{service.category_icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">
                            {service.title}
                          </h3>
                          <p className="text-sm text-gray-500 truncate">{service.description}</p>
                        </div>
                        <span className="font-semibold text-primary-600 whitespace-nowrap">
                          {service.price_type === 'negotiable' ? 'Negociable' : `$${service.price_min || service.price_max}`}
                        </span>
                      </Link>
                    ))}
                    {services.length > 5 && (
                      <Link
                        to="/buscar"
                        className="w-full btn-outline"
                      >
                        Ver {services.length - 5} servicios más
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-medium text-gray-900 mb-1">Sin servicios publicados</h3>
                    <p className="text-gray-500 text-sm">Este proveedor aún no ha publicado servicios.</p>
                  </div>
                )}
              </div>
            </div>

            {reviews.length > 0 && (
              <div className="card">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Reseñas recientes</h2>
                  <Link to="#" className="text-sm text-primary-600 hover:text-primary-700">Ver todas ({reviews.length})</Link>
                </div>
                <div className="p-6 space-y-4">
                  {reviews.slice(0, 5).map((review) => (
                    <div key={review.id} className="border-b border-gray-100 pb-4 last:border-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{review.client_name}</p>
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${i < review.rating ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                              />
                            ))}
                            <span className="text-sm text-gray-500 ml-2">
                              {new Date(review.created_at).toLocaleDateString('es-ES')}
                            </span>
                          </div>
                        </div>
                      </div>
                      {review.service_title && (
                        <p className="text-sm text-gray-500 mb-2">Servicio: {review.service_title}</p>
                      )}
                      <p className="text-gray-700">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24 space-y-6">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-xl bg-primary-100 flex items-center justify-center">
                  {provider.avatar_url ? (
                    <img src={provider.avatar_url} alt="" className="w-24 h-24 rounded-xl" />
                  ) : (
                    <Building2 className="w-12 h-12 text-primary-600" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-gray-900">{provider.business_name || provider.owner_name}</h2>
                <p className="text-gray-500 mt-1">{provider.province_name}</p>
              </div>

              <div className="border-t border-gray-100 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Calificación</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-yellow-500 fill-current" />
                    <span className="font-bold text-lg">{provider.rating.toFixed(1)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Reseñas totales</span>
                  <span className="font-bold">{provider.review_count}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Experiencia</span>
                  <span className="font-bold">{provider.years_experience || 0} años</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Plan</span>
                  <span className={`badge ${subscriptionBadge.className}`}>{subscriptionBadge.label}</span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6 space-y-2">
                {provider.whatsapp && (
                  <button
                    onClick={() => handleContact('whatsapp')}
                    className="w-full btn-primary gap-2 justify-center"
                  >
                    <MessageSquare className="w-5 h-5" />
                    WhatsApp
                  </button>
                )}
                {provider.telegram && (
                  <button
                    onClick={() => handleContact('phone')}
                    className="w-full btn-secondary gap-2 justify-center"
                  >
                    <Phone className="w-5 h-5" />
                    Llamar
                  </button>
                )}
                {provider.email_contact && (
                  <button
                    onClick={() => handleContact('email')}
                    className="w-full btn-secondary gap-2 justify-center"
                  >
                    <Mail className="w-5 h-5" />
                    Email
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}