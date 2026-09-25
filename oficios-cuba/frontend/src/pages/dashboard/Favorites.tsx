import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { favoriteApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Favorite } from '../../types';
import { Heart, Loader2, Building2, MapPin, Star, MessageSquare, Trash2, Briefcase, Search } from 'lucide-react';

export default function Favorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.user_type !== 'client') return;

    const fetchFavorites = async () => {
      try {
        const res = await favoriteApi.getAll();
        setFavorites(res.data.favorites || []);
      } catch (error) {
        console.error('Error fetching favorites:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFavorites();
  }, [user]);

  const handleRemove = async (providerId: string) => {
    if (!confirm('¿Quitar de favoritos?')) return;
    
    setRemovingId(providerId);
    try {
      await favoriteApi.remove(providerId);
      setFavorites(prev => prev.filter(f => f.provider_id !== providerId));
    } catch (error) {
      console.error('Error removing favorite:', error);
      alert('Error al quitar de favoritos');
    } finally {
      setRemovingId(null);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Heart className="w-8 h-8 text-red-500" />
              Mis Favoritos
            </h1>
            <p className="text-gray-600 mt-1">Proveedores guardados para contactar después</p>
          </div>
        </div>

        {favorites.length === 0 ? (
          <div className="card p-12 text-center">
            <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No tienes favoritos aún</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Cuando encuentres un proveedor que te interese, haz clic en el corazón para guardarlo aquí.
            </p>
            <Link to="/buscar" className="btn-primary inline-flex gap-2">
              <Search className="w-5 h-5" />
              Buscar proveedores
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((fav) => {
              const provider = fav.provider;
              if (!provider) return null;

              return (
                <Link
                  key={provider.id}
                  to={`/proveedor/${provider.id}`}
                  className="card overflow-hidden hover:shadow-lg hover:border-primary-200 group relative"
                >
                  <div className="absolute top-3 right-3 z-10">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemove(provider.id);
                      }}
                      disabled={removingId === provider.id}
                      className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label="Quitar de favoritos"
                    >
                      {removingId === provider.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Heart className="w-5 h-5 fill-current" />
                      )}
                    </button>
                  </div>

                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
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
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-gray-600 mb-4">
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        {provider.rating.toFixed(1)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" />
                        {provider.review_count} reseñas
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {provider.service_areas?.slice(0, 3).map((area) => (
                        <span key={area.municipality_id} className="badge bg-gray-100 text-gray-700">
                          {area.municipality_name}
                        </span>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                      <span className={`badge ${
                        provider.subscription_plan === 'premium' ? 'bg-purple-100 text-purple-800' :
                        provider.subscription_plan === 'pro' ? 'bg-blue-100 text-blue-800' :
                        provider.subscription_plan === 'basic' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {provider.subscription_plan.charAt(0).toUpperCase() + provider.subscription_plan.slice(1)}
                      </span>
                      <span className="text-sm text-primary-600 font-medium">Ver perfil</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}