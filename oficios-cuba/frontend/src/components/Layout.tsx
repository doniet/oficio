import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, ChevronDown, CreditCard, Heart, Home, LayoutDashboard, LogOut, MessageCircle, Plus, Search, Settings, User as UserIcon, UserRound,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Avatar, Logo, cn } from './ui';

function UnreadDot({ count, className = '' }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cn('inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-[1.15rem] text-white', className)}>
      {count > 9 ? '9+' : count}
    </span>
  );
}

function UserMenu() {
  const { user, logout, unread } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!user) return null;
  const isProvider = user.user_type === 'provider';
  const items = [
    { to: '/dashboard', label: 'Mi panel', icon: LayoutDashboard },
    ...(isProvider
      ? [{ to: '/dashboard/servicios', label: 'Mis servicios', icon: Briefcase }, { to: '/dashboard/perfil', label: 'Perfil profesional', icon: UserRound }, { to: '/dashboard/suscripcion', label: 'Mi plan', icon: CreditCard }]
      : [{ to: '/dashboard/favoritos', label: 'Favoritos', icon: Heart }]),
    { to: '/dashboard/mensajes', label: 'Mensajes', icon: MessageCircle, badge: unread },
    { to: '/dashboard/cuenta', label: 'Ajustes de cuenta', icon: Settings },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-sand-300 bg-white py-1 pl-1 pr-2.5 transition hover:border-ink-300"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="relative">
          <Avatar src={user.avatar_url} name={user.full_name} size="xs" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600" />}
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-ink-800 lg:inline">{user.full_name.split(' ')[0]}</span>
        <ChevronDown className="h-4 w-4 text-ink-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 animate-scale-in overflow-hidden rounded-2xl border border-sand-200 bg-white p-1.5 shadow-lift">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-bold">{user.full_name}</p>
            <p className="truncate text-xs text-ink-400">{user.email}</p>
            <p className="mt-1.5 inline-block rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
              {isProvider ? 'Cuenta profesional' : 'Cuenta de cliente'}
            </p>
          </div>
          <div className="my-1 h-px bg-sand-200" />
          {items.map((it) => (
            <Link key={it.to} to={it.to} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-700 hover:bg-sand-100">
              <it.icon className="h-4 w-4 text-ink-400" /> <span className="flex-1">{it.label}</span>
              {'badge' in it && <UnreadDot count={it.badge ?? 0} />}
            </Link>
          ))}
          <div className="my-1 h-px bg-sand-200" />
          <button
            role="menuitem"
            onClick={() => { logout(); navigate('/'); }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function MobileTabBar() {
  const { user, unread } = useAuth();
  const tabs = [
    { to: '/', label: 'Inicio', icon: Home, end: true },
    { to: '/buscar', label: 'Buscar', icon: Search },
    ...(user
      ? [
          user.user_type === 'provider'
            ? { to: '/dashboard/servicios/nuevo', label: 'Publicar', icon: Plus }
            : { to: '/dashboard/favoritos', label: 'Favoritos', icon: Heart },
          { to: '/dashboard/mensajes', label: 'Mensajes', icon: MessageCircle, badge: unread },
          { to: '/dashboard', label: 'Mi panel', icon: UserIcon, end: true },
        ]
      : [{ to: '/login', label: 'Entrar', icon: UserIcon }]),
  ];
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 backdrop-blur md:hidden" aria-label="Navegación principal">
      <ul className="flex">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={'end' in t ? t.end : false}
              className={({ isActive }) => cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-brand-700' : 'text-ink-400')}
            >
              <span className="relative">
                <t.icon className="h-[22px] w-[22px]" strokeWidth={2} />
                {'badge' in t && <UnreadDot count={t.badge ?? 0} className="absolute -right-2.5 -top-1.5" />}
              </span>
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Layout() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const inChat = /^\/dashboard\/mensajes\/.+/.test(location.pathname);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 border-b border-sand-200/80 bg-paper/90 backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link to="/" aria-label="Oficios Cuba, inicio"><Logo /></Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Secciones">
              <NavLink to="/buscar" className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-semibold transition', isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-900')}>
                Explorar servicios
              </NavLink>
              <NavLink to="/profesionales" className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-semibold transition', isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-900')}>
                Profesionales
              </NavLink>
              <NavLink to="/planes" className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-semibold transition', isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-900')}>
                Planes
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <div className="skeleton h-9 w-24 rounded-full" />
            ) : user ? (
              <>
                {user.user_type === 'provider' && (
                  <Link to="/dashboard/servicios/nuevo" className="btn-primary hidden sm:inline-flex">
                    <Plus className="h-4 w-4" /> Publicar servicio
                  </Link>
                )}
                <UserMenu />
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Entrar</Link>
                <Link to="/registro" className="btn-dark hidden sm:inline-flex">Crear cuenta</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="contenido" className={cn('flex-1', !inChat && 'pb-20 md:pb-0')}>
        <Outlet />
      </main>

      {!inChat && (
        <footer className="mt-16 bg-ink-950 pb-24 pt-14 text-ink-300 md:pb-10">
          <div className="container-page">
            <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <Logo light />
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">
                  El directorio de oficios de Cuba: encuentra quién te arregle, construya o enseñe cerca de tu casa, y habla directo con él.
                </p>
              </div>
              <div>
                <h4 className="mb-3 font-sans text-sm font-bold text-white">Para clientes</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link to="/buscar" className="hover:text-white">Explorar servicios</Link></li>
                  <li><Link to="/profesionales" className="hover:text-white">Ver profesionales</Link></li>
                  <li><Link to="/registro" className="hover:text-white">Crear cuenta gratis</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-3 font-sans text-sm font-bold text-white">Para profesionales</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link to="/registro?tipo=profesional" className="hover:text-white">Anunciar mi oficio</Link></li>
                  <li><Link to="/planes" className="hover:text-white">Planes y precios</Link></li>
                  <li><Link to="/dashboard" className="hover:text-white">Mi panel</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-3 font-sans text-sm font-bold text-white">Cobertura</h4>
                <p className="text-sm text-ink-400">Las 15 provincias y el municipio especial Isla de la Juventud.</p>
              </div>
            </div>
            <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-ink-500 sm:flex-row sm:justify-between">
              <p>© {new Date().getFullYear()} Oficios Cuba · Un proyecto de DARDOIT</p>
              <p>Hecho para funcionar bien con poca conexión.</p>
            </div>
          </div>
        </footer>
      )}

      {/* En el chat la barra inferior tapaba la caja de texto: la conversación ocupa toda la pantalla. */}
      {!inChat && <MobileTabBar />}
    </div>
  );
}
