import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { serviceApi, categoryApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { providerApi } from '../../services/api';
import type { Service, Category } from '../../types';
import { Plus, Edit, Trash2, Eye, ToggleLeft, ToggleRight, Loader2, Building2, Search, Filter, ChevronDown } from 'lucide-react';

export default function MyServices() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string>('');

  useEffect(() => {
    if (user?.user_type !== 'provider') return;

    const fetchData = async () => {
      try {
        const [providerRes, servicesRes, categoriesRes] = await Promise.all([
          providerApi.getMyProfile(),
          serviceApi.getAll({ provider_id: '', page: 1, limit: 50 }),
          categoryApi.getFlat(),
        ]);
        setProviderId(providerRes.data.provider.id);
        setServices(servicesRes.data.services);
        setCategories(categoriesRes.data.categories);
      } catch (error) {
        console.error('Error fetching services:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const handleToggle = async (service: Service) => {
    setTogglingId(service.id);
    try {
      await serviceApi.toggle(service.id);
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: !s.is_active } : s));
    } catch (error) {
      console.error('Error toggling service:', error);
      alert('Error al cambiar el estado');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este servicio? Esta acción no se puede deshacer.')) return;
    
    setDeletingId(id);
    try {
      await serviceApi.delete(id);
      setServices(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error deleting service:', error);
      alert('Error al eliminar el servicio');
    } finally {
      setDeletingId(null);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || 'Sin categoría';
  };

  const getCategoryIcon = (categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.icon || '🔧';
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mis Servicios</h1>
            <p className="text-gray-600 mt-1">Gestiona y publica tus servicios profesionales</p>
          </div>
          <Link to="/dashboard/servicios/nuevo" className="btn-primary gap-2">
            <Plus className="w-5 h-5" />
            Nuevo servicio
          </Link>
        </div>

        {services.length === 0 ? (
          <div className="card p-12 text-center">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No tienes servicios publicados</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Crea tu primer servicio para empezar a aparecer en las búsquedas de clientes en tu zona.
            </p>
            <Link to="/dashboard/servicios/nuevo" className="btn-primary inline-flex gap-2">
              <Plus className="w-5 h-5" />
              Crear mi primer servicio
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Servicio</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {services.map((service) => (
                    <tr key={service.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                            <span className="text-lg">{getCategoryIcon(service.category_id)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{service.title}</p>
                            <p className="text-sm text-gray-500 truncate max-w-xs">{service.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="badge bg-primary-100 text-primary-800">{getCategoryName(service.category_id)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">
                          {service.price_type === 'negotiable' ? (
                            'Negociable'
                          ) : service.price_min && service.price_max && service.price_min !== service.price_max ? (
                            `$${service.price_min} - $${service.price_max}`
                          ) : (
                            `$${service.price_min || service.price_max}`
                          )}
                          {service.price_type !== 'negotiable' && service.price_type !== 'fixed' && (
                            <span className="text-sm text-gray-500 ml-1">/{service.price_type === 'hourly' ? 'h' : 'día'}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggle(service)}
                          disabled={togglingId === service.id}
                          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors ${
                            service.is_active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                          }`}
                        >
                          {togglingId === service.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : service.is_active ? (
                            <>
                              <ToggleRight className="w-4 h-4" />
                              Activo
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4" />
                              Inactivo
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/servicio/${service.id}`}
                            target="_blank"
                            className="btn-secondary p-2 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700"
                            title="Ver público"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            to={`/dashboard/servicios/${service.id}/editar`}
                            className="btn-secondary p-2"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(service.id)}
                            disabled={deletingId === service.id}
                            className="btn-secondary p-2 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                            title="Eliminar"
                          >
                            {deletingId === service.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  }
