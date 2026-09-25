import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MapPin } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, favoriteApi } from '../../services/api';
import type { Favorite } from '../../types';
import { plural } from '../../lib/format';
import { PageTitle } from '../../components/DashboardLayout';
import { ProviderCardSkeleton } from '../../components/cards';
import { Avatar, CoverImage, EmptyState, ErrorState, PlanBadge, RatingInline, Spinner } from '../../components/ui';

export default function Favorites() {
  const toast = useToast();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await favoriteApi.getAll();
      setFavorites(res.data.favorites);
    } catch (err) {
      setError(apiError(err, 'No se pudieron cargar tus favoritos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (f: Favorite) => {
    setRemoving(f.provider_id);
    try {
      await favoriteApi.remove(f.provider_id);
      setFavorites((list) => list.filter((x) => x.provider_id !== f.provider_id));
      toast(`${f.business_name || f.owner_name} ya no está en tus favoritos`);
    } catch (err) {
      toast(apiError(err, 'No se pudo quitar de favoritos.'), 'error');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <PageTitle
        title="Favoritos"
        subtitle={favorites.length ? `${plural(favorites.length, 'profesional guardado', 'profesionales guardados')}.` : 'Los profesionales que guardes aparecerán aquí.'}
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <ProviderCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : favorites.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-6 w-6" />}
          title="Aún no tienes favoritos"
          action={<Link to="/profesionales" className="btn-primary">Explorar profesionales</Link>}
        >
          Toca el corazón en el perfil de un profesional para guardarlo y encontrarlo rápido después.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((f) => {
            const name = f.business_name || f.owner_name;
            const place = [f.municipality_name, f.province_name].filter(Boolean).join(', ');
            return (
              <li key={f.id} className="card relative flex flex-col overflow-hidden">
                <Link to={`/proveedor/${f.provider_id}`} className="group flex flex-1 flex-col">
                  <div className="relative h-24 overflow-hidden bg-sand-100">
                    <CoverImage src={f.cover} seed={name} alt="" className="transition duration-500 group-hover:scale-[1.04]" />
                    <PlanBadge plan={f.subscription_plan} className="absolute left-3 top-3 shadow-sm" />
                  </div>
                  <div className="flex flex-1 flex-col px-4 pb-4">
                    <Avatar src={f.avatar_url} name={name} size="lg" square className="-mt-8 border-4 border-white shadow-card" />
                    <h2 className="mt-2 font-sans text-[1.05rem] font-bold leading-snug group-hover:text-brand-700">{name}</h2>
                    {place && (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{place}</span>
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-4 text-sm">
                      <RatingInline rating={f.rating} count={f.review_count} />
                      <span className="text-ink-400">{plural(f.service_count, 'servicio', 'servicios')}</span>
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  disabled={removing === f.provider_id}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-brand-600 shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60"
                  aria-label={`Quitar a ${name} de favoritos`}
                >
                  {removing === f.provider_id ? <Spinner className="h-4 w-4" /> : <Heart className="h-4 w-4 fill-current" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
