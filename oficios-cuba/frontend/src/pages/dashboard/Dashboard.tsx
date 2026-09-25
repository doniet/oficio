import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, CalendarDays, CheckCircle2, Circle, Compass, ExternalLink, Heart, Lock, MessageCircle, Plus, Star, Store } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { appointmentApi, conversationApi, favoriteApi, providerApi, serviceApi, apiError } from '../../services/api';
import type { Appointment, Conversation, Favorite, MyProviderProfile, Plan, PlanLimits, ServiceSummary } from '../../types';
import { DARDOVENTAS_URL, parseDate, relativeTime } from '../../lib/format';
import { ServiceThumb } from './parts';
import { Avatar, EmptyState, ErrorState, PageLoader, PlanPill, RatingInline, cn } from '../../components/ui';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function StatCard({ label, value, icon, to, children }: { label: string; value: React.ReactNode; icon: React.ReactNode; to: string; children?: React.ReactNode }) {
  return (
    <Link to={to} className="card card-hover flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sand-100 text-ink-600">{icon}</span>
      </div>
      <div className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">{value}</div>
      {children}
    </Link>
  );
}

function RecentConversations({ conversations, isProvider }: { conversations: Conversation[]; isProvider: boolean }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Mensajes recientes</h2>
        <Link to="/dashboard/mensajes" className="link text-sm">Ver todos</Link>
      </div>
      {conversations.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">
          {isProvider ? 'Cuando un cliente te escriba, verás su mensaje aquí.' : 'Aún no has escrito a ningún profesional.'}
        </p>
      ) : (
        <ul className="-mx-2 divide-y divide-sand-200">
          {conversations.slice(0, 3).map((c) => {
            const name = isProvider ? c.client_name : c.provider_name;
            const avatar = isProvider ? c.client_avatar : c.provider_avatar;
            const unread = (c.unread_count ?? 0) > 0;
            return (
              <li key={c.id}>
                <Link to={`/dashboard/mensajes/${c.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-sand-100">
                  <Avatar src={avatar} name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate text-sm', unread ? 'font-bold' : 'font-semibold')}>{name}</p>
                      <span className="shrink-0 text-xs text-ink-400">{relativeTime(c.last_message_at)}</span>
                    </div>
                    <p className={cn('truncate text-sm', unread ? 'text-ink-800' : 'text-ink-400')}>{c.last_message}</p>
                  </div>
                  {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" aria-label="Sin leer" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProviderDashboard() {
  const { user, unread } = useAuth();
  const [profile, setProfile] = useState<MyProviderProfile | null>(null);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [plan, setPlan] = useState<Plan>('free');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [areas, setAreas] = useState(0);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s, c, a] = await Promise.all([
        providerApi.getMyProfile(), serviceApi.mine(), conversationApi.getAll(),
        appointmentApi.mine().catch(() => ({ data: { appointments: [] } })),
      ]);
      setProfile(p.data.provider);
      setLimits(p.data.limits);
      setAppointments(a.data.appointments);
      setAreas(p.data.serviceAreas?.length ?? 0);
      setServices(s.data.services);
      setPlan(s.data.plan);
      setConversations(c.data.conversations);
    } catch (err) {
      setError(apiError(err, 'No se pudo cargar tu panel.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error || !profile) return <ErrorState message={error || 'Perfil no encontrado'} onRetry={load} />;

  const active = services.filter((s) => s.is_active).length;
  const checklist = [
    { done: Boolean(profile.business_name), label: 'Nombre de tu negocio', to: '/dashboard/perfil' },
    { done: Boolean(profile.description && profile.description.length >= 30), label: 'Descripción de tu trabajo', to: '/dashboard/perfil' },
    { done: Boolean(profile.whatsapp), label: 'Teléfono de contacto', to: '/dashboard/perfil' },
    { done: Boolean(profile.municipality_id) || areas > 0, label: 'Municipio donde trabajas', to: '/dashboard/perfil' },
    { done: services.length > 0, label: 'Tu primer oficio publicado', to: '/dashboard/servicios/nuevo' },
    { done: Boolean(user?.avatar_url), label: 'Logo de tu negocio', to: '/dashboard/perfil' },
  ];
  const now = Date.now();
  const upcoming = appointments.filter((a) => (a.status === 'pending' || a.status === 'confirmed') && parseDate(a.starts_at).getTime() >= now);
  const pendingCount = upcoming.filter((a) => a.status === 'pending').length;
  const next = [...upcoming].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-400">{greeting()},</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{profile.business_name || user?.full_name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/proveedor/${profile.id}`} className="btn-secondary"><ExternalLink className="h-4 w-4" /> Ver perfil público</Link>
          <Link to="/dashboard/servicios/nuevo" className="btn-primary"><Plus className="h-4 w-4" /> Publicar oficio</Link>
        </div>
      </div>

      {pct < 100 && (
        <section className="card overflow-hidden">
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Completa tu perfil</h2>
                <p className="text-sm text-ink-500">Los perfiles completos reciben más mensajes.</p>
              </div>
              <span className="font-display text-2xl font-bold text-brand-600">{pct}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <ul className="grid border-t border-sand-200 sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link to={c.to} className={cn('flex items-center gap-3 px-5 py-3 text-sm hover:bg-sand-100', c.done ? 'text-ink-400' : 'font-semibold text-ink-800')}>
                  {c.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-sea-600" /> : <Circle className="h-5 w-5 shrink-0 text-sand-300" />}
                  <span className={cn('flex-1', c.done && 'line-through')}>{c.label}</span>
                  {!c.done && <ArrowRight className="h-4 w-4 text-ink-300" />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Oficios activos" value={active} icon={<Briefcase className="h-5 w-5" />} to="/dashboard/servicios">
          <span className="text-xs text-ink-400">{services.length} en total</span>
        </StatCard>
        <StatCard label="Sin leer" value={unread} icon={<MessageCircle className="h-5 w-5" />} to="/dashboard/mensajes">
          <span className="text-xs text-ink-400">{conversations.length} conversaciones</span>
        </StatCard>
        <StatCard label="Valoración" value={profile.review_count ? profile.rating.toFixed(1) : '—'} icon={<Star className="h-5 w-5" />} to={`/proveedor/${profile.id}`}>
          <RatingInline rating={profile.rating} count={profile.review_count} className="text-xs" />
        </StatCard>
        <StatCard label="Tu plan" value={<PlanPill plan={plan} />} icon={<Compass className="h-5 w-5" />} to="/dashboard/suscripcion">
          <span className="text-xs font-semibold text-brand-700">{plan === 'free' ? 'Mejorar plan' : 'Gestionar'}</span>
        </StatCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <section className="card flex flex-col p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sea-100 text-sea-800"><CalendarDays className="h-5 w-5" /></span>
            <h2 className="text-lg font-bold">Agenda de citas</h2>
          </div>
          {limits?.agenda ? (
            <>
              <p className="mt-3 flex-1 text-sm text-ink-600">
                {upcoming.length === 0 ? 'No tienes citas próximas.' : <>
                  <strong>{upcoming.length}</strong> {upcoming.length === 1 ? 'cita próxima' : 'citas próximas'}
                  {pendingCount > 0 && <> · <strong className="text-amber-700">{pendingCount} por confirmar</strong></>}
                  {next && <span className="block text-ink-400">Siguiente: {parseDate(next.starts_at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {next.client_name}</span>}
                </>}
              </p>
              <Link to="/dashboard/agenda" className="btn-secondary mt-4 self-start">Abrir agenda <ArrowRight className="h-4 w-4" /></Link>
            </>
          ) : (
            <>
              <p className="mt-3 flex-1 text-sm text-ink-500">Deja que tus clientes pidan cita en los horarios que tú elijas.</p>
              <Link to="/dashboard/suscripcion" className="btn-ghost mt-4 self-start"><Lock className="h-4 w-4" /> Plan Profesional</Link>
            </>
          )}
        </section>
        <section className="card flex flex-col p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Store className="h-5 w-5" /></span>
            <h2 className="text-lg font-bold">Punto de venta DardoVentas</h2>
          </div>
          <p className="mt-3 flex-1 text-sm text-ink-500">Vende desde tu teléfono Android: inventario, cobros y cuadre del día, incluso sin internet.</p>
          {limits?.pos ? (
            <a href={DARDOVENTAS_URL} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 self-start">
              Abrir DardoVentas <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <Link to="/dashboard/suscripcion" className="btn-ghost mt-4 self-start"><Lock className="h-4 w-4" /> Plan Profesional</Link>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <RecentConversations conversations={conversations} isProvider />
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Tus oficios</h2>
            <Link to="/dashboard/servicios" className="link text-sm">Gestionar</Link>
          </div>
          {services.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-ink-400">Todavía no has publicado ningún oficio.</p>
              <Link to="/dashboard/servicios/nuevo" className="btn-primary mt-4"><Plus className="h-4 w-4" /> Publicar el primero</Link>
            </div>
          ) : (
            <ul className="-mx-2 divide-y divide-sand-200">
              {services.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <Link to={`/dashboard/servicios/${s.id}/editar`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-sand-100">
                    <ServiceThumb src={s.cover} icon={s.category_icon} className="h-11 w-14" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.title}</p>
                      <p className="truncate text-xs text-ink-400">{s.category_name}</p>
                    </div>
                    <span className={cn('badge', s.is_active ? 'bg-sea-100 text-sea-800' : 'bg-sand-100 text-ink-500')}>{s.is_active ? 'Activo' : 'Pausado'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ClientDashboard() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, f, a] = await Promise.all([
        conversationApi.getAll(), favoriteApi.getAll(),
        appointmentApi.mine().catch(() => ({ data: { appointments: [] } })),
      ]);
      setConversations(c.data.conversations);
      setAppointments(a.data.appointments);
      setFavorites(f.data.favorites);
    } catch (err) {
      setError(apiError(err, 'No se pudo cargar tu panel.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const upcoming = appointments.filter((a) => (a.status === 'pending' || a.status === 'confirmed') && parseDate(a.starts_at).getTime() >= Date.now());

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-ink-400">{greeting()},</p>
        <h1 className="text-2xl font-bold sm:text-3xl">{user?.full_name.split(' ')[0]}</h1>
      </div>

      <section className="relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white sm:p-8">
        <div className="relative max-w-md">
          <h2 className="text-2xl font-bold text-white">¿Qué necesitas solucionar hoy?</h2>
          <p className="mt-2 text-ink-200">Busca por oficio y provincia, compara reseñas y escribe directo al profesional.</p>
          <Link to="/buscar" className="btn-primary mt-5"><Compass className="h-4 w-4" /> Explorar servicios</Link>
        </div>
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-600/30 blur-2xl" aria-hidden="true" />
      </section>

      <Link to="/dashboard/citas" className="card card-hover flex items-center gap-4 p-4 sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sea-100 text-sea-800"><CalendarDays className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Mis citas</p>
          <p className="truncate text-sm text-ink-500">
            {upcoming.length === 0 ? 'No tienes citas próximas.' : `${upcoming.length} ${upcoming.length === 1 ? 'cita próxima' : 'citas próximas'}`}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-ink-300" />
      </Link>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <RecentConversations conversations={conversations} isProvider={false} />
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Tus favoritos</h2>
            <Link to="/dashboard/favoritos" className="link text-sm">Ver todos</Link>
          </div>
          {favorites.length === 0 ? (
            <EmptyState icon={<Heart className="h-6 w-6" />} title="Sin favoritos">
              Guarda a los profesionales que te gusten para encontrarlos rápido.
            </EmptyState>
          ) : (
            <ul className="-mx-2 divide-y divide-sand-200">
              {favorites.slice(0, 3).map((f) => {
                const name = f.business_name || f.owner_name;
                return (
                  <li key={f.id}>
                    <Link to={`/proveedor/${f.provider_id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-sand-100">
                      <Avatar src={f.avatar_url} name={name} size="sm" square />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{name}</p>
                        <p className="truncate text-xs text-ink-400">{[f.municipality_name, f.province_name].filter(Boolean).join(', ')}</p>
                      </div>
                      <RatingInline rating={f.rating} count={f.review_count} className="text-xs" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  return user?.user_type === 'provider' ? <ProviderDashboard /> : <ClientDashboard />;
}
