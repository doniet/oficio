import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { serviceApi } from '../services/api';
import type { Service, Review } from '../../types';
import { MapPin, Star, MessageSquare, Phone, Mail, Share2, ArrowLeft, Heart, CheckCircle, Clock, DollarSign, MapPin as MapPinIcon, Building2, User, Shield, Copy } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchService = async () => {
      try {
        const res = await serviceApi.getById(id);
        setService(res.data.service);
        setReviews(res.data.reviews || []);
      } catch (error) {
        console.error('Error fetching service:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchService();
  }, [id]);

  const formatPrice = (service: Service) => {
    if (service.price_type === 'negotiable' || (!service.price_min && !service.price_max)) {
      return 'Precio negociable';
    }
    if (service.price_min && service.price_max && service.price_min !== service.price_max) {
      return `$${service.price_min} - $${service.price_max} ${service.price_type === 'hourly' ? '/hora' : service.price_type === 'daily' ? '/día' : ''}`;
    }
    return `$${service.price_min || service.price_max} ${service.price_type === 'hourly' ? '/hora' : service.price_type === 'daily' ? '/día' : ''}`;
  };

  const handleContact = async (type: 'whatsapp' | 'phone' | 'email') => {
    if (!service) return;
    
    if (!user) {
      alert('Debes iniciar sesión para contactar al proveedor');
      return;
    }

    let url = '';
    if (type === 'whatsapp' && service.whatsapp) {
      const message = encodeURIComponent(`Hola, vi tu servicio "${service.title}" en Oficios Cuba y me interesa. ¿Podrías darme más información?`);
      url = `https://wa.me/${service.whatsapp.replace(/\D/g, '')}?text=${message}`;
    } else if (type === 'phone' && service.telegram) {
      url = `tel:${service.telegram}`;
    } else if (type === 'email' && service.email_contact) {
      url = `mailto:${service.email_contact}?subject=Consulta sobre ${encodeURIComponent(service.title)}`;
    }

    if (url) {
      window.open(url, '_blank');
    } else {
      alert('Este proveedor no tiene este método de contacto configurado');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Servicio no encontrado</h2>
          <Link to="/buscar" className="btn-primary">Volver a buscar</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <ol className="flex items-center gap-2 text-sm text-gray-500">
            <li><Link to="/" className="hover:text-primary-600">Inicio</Link></li>
            <li><span className="mx-2">/</span></li>
            <li><Link to="/buscar" className="hover:text-primary-600">Buscar</Link></li>
            <li><span className="mx-2">/</span></li>
            <li className="text-gray-900 font-medium truncate max-w-xs">{service.title}</li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="card overflow-hidden">
              <div className="relative h-64 bg-gray-100">
                {service.images && service.images.length > 0 ? (
                  <img
                    src={service.images[0]}
                    alt={service.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 className="w-20 h-20 text-gray-400" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 text-white">
                  <span className="badge bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
                    {service.category_icon} {service.category_name}
                  </span>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">{service.title}</h1>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="w-4 h-4" />
                        {service.province_name}
                        {service.municipality_name && `, ${service.municipality_name}`}
                      </span>
                      {service.provider_business_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {service.provider_business_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {service.provider_subscription_plan !== 'free' && (
                    <span className={`badge ${service.provider_subscription_plan === 'premium' ? 'bg-purple-100 text-purple-800' : service.provider_subscription_plan === 'pro' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                      {service.provider_subscription_plan.charAt(0).toUpperCase() + service.provider_subscription_plan.slice(1)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-6 mb-6 p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-6 h-6 text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">Precio</p>
                      <p className="text-xl font-bold text-gray-900">{formatPrice(service)}</p>
                    </div>
                  </div>
                  <div className="border-l border-gray-200 pl-4 flex items-center gap-2">
                    <Star className="w-6 h-6 text-yellow-500 fill-current" />
                    <div>
                      <p className="text-sm text-gray-500">Calificación</p>
                      <p className="text-xl font-bold text-gray-900">
                        {service.provider_rating > 0 ? service.provider_rating.toFixed(1) : 'Sin calificar'}
                        {service.provider_review_count > 0 && ` (${service.provider_review_count} reseñas)`}
                      </p>
                    </div>
                  </div>
                  <div className="border-l border-gray-200 pl-4 flex items-center gap-2">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="text-sm text-gray-500">Experiencia</p>
                      <p className="text-xl font-bold text-gray-900">{service.years_experience || 0} años</p>
                    </div>
                  </div>
                </div>

                <div className="prose prose-gray max-w-none">
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">Descripción del servicio</h2>
                  <p className="text-gray-700 whitespace-pre-wrap">{service.description || 'No hay descripción disponible.'}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-semibold text-gray-900">Información del proveedor</h2>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-xl bg-primary-100 flex items-center justify-center">
                    {service.avatar_url ? (
                      <img src={service.avatar_url} alt="" className="w-16 h-16 rounded-xl" />
                    ) : (
                      <User className="w-8 h-8 text-primary-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{service.owner_name}</h3>
                    <p className="text-sm text-gray-500">{service.provider_business_name || 'Profesional independiente'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      <span className="font-medium">{service.provider_rating.toFixed(1)}</span>
                      <span className="text-gray-500">({service.provider_review_count} reseñas)</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {service.whatsapp && (
                    <button
                      onClick={() => handleContact('whatsapp')}
                      className="w-full btn-secondary gap-3 justify-start"
                    >
                      <MessageSquare className="w-5 h-5 text-green-600" />
                      <span>WhatsApp</span>
                    </button>
                  )}
                  {service.telegram && (
                    <button
                      onClick={() => handleContact('phone')}
                      className="w-full btn-secondary gap-3 justify-start"
                    >
                      <Phone className="w-5 h-5" />
                      <span>Llamar</span>
                    </button>
                  )}
                  {service.email_contact && (
                    <button
                      onClick={() => handleContact('email')}
                      className="w-full btn-secondary gap-3 justify-start"
                    >
                      <Mail className="w-5 h-5" />
                      <span>Email</span>
                    </button>
                  )}
                  <Link
                    to={`/proveedor/${service.provider_id}`}
                    className="w-full btn-outline gap-3 justify-start"
                  >
                    <Building2 className="w-5 h-5" />
                    <span>Ver perfil completo</span>
                  </Link>
                </div>
              </div>
            </div>

            {reviews.length > 0 && (
              <div className="card">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Reseñas ({reviews.length})</h2>
                  <Link to="#" className="text-sm text-primary-600 hover:text-primary-700">Ver todas</Link>
                </div>
                <div className="p-6 space-y-4">
                  {reviews.slice(0, 3).map((review) => (
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
                          </div>
                        </div>
                      </div>
                      <p className="text-gray-700">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24 space-y-6">
              <div className="bg-primary-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Contactar proveedor</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {service.provider_business_name || service.owner_name} te responderá lo antes posible.
                </p>
                <div className="space-y-2">
                  {service.whatsapp && (
                    <button
                      onClick={() => handleContact('whatsapp')}
                      className="w-full btn-primary gap-2 justify-center"
                    >
                      <MessageSquare className="w-5 h-5" />
                      Chatear por WhatsApp
                    </button>
                  )}
                  {service.telegram && (
                    <button
                      onClick={() => handleContact('phone')}
                      className="w-full btn-secondary gap-2 justify-center"
                    >
                      <Phone className="w-5 h-5" />
                      Llamar por teléfono
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="font-semibold text-gray-900">Detalles del servicio</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Categoría</dt>
                    <dd className="font-medium text-gray-900">{service.category_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Tipo de precio</dt>
                    <dd className="font-medium text-gray-900 capitalize">{service.price_type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Provincia</dt>
                    <dd className="font-medium text-gray-900">{service.province_name}</dd>
                  </div>
                  {service.municipality_name && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Municipio</dt>
                      <dd className="font-medium text-gray-900">{service.municipality_name}</dd>
                    </div>
                  )}
                  {service.years_experience && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Años de experiencia</dt>
                      <dd className="font-medium text-gray-900">{service.years_experience}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Compartir</h3>
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1 gap-2 justify-center" onClick={() => navigator.share?.({ title: service.title, url: window.location.href })}>
                    <Share2 className="w-4 h-4" />
                    Compartir
                  </button>
                  <button className="btn-secondary flex-1 gap-2 justify-center" onClick={() => navigator.clipboard.writeText(window.location.href)}>
                    <Copy className="w-4 h-4" />
                    Copiar enlace
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}