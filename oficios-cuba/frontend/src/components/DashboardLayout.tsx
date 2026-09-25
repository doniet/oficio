import { NavLink, Outlet } from 'react-router-dom';
import { Briefcase, CreditCard, Heart, LayoutDashboard, MessageCircle, Settings, UserRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Avatar, cn } from './ui';

export default function DashboardLayout() {
  const { user, unread } = useAuth();
  if (!user) return null;
  const isProvider = user.user_type === 'provider';

  const links = [
    { to: '/dashboard', label: 'Resumen', icon: LayoutDashboard, end: true },
    ...(isProvider
      ? [
          { to: '/dashboard/servicios', label: 'Mis servicios', icon: Briefcase },
          { to: '/dashboard/perfil', label: 'Perfil profesional', icon: UserRound },
          { to: '/dashboard/suscripcion', label: 'Mi plan', icon: CreditCard },
        ]
      : [{ to: '/dashboard/favoritos', label: 'Favoritos', icon: Heart }]),
    { to: '/dashboard/mensajes', label: 'Mensajes', icon: MessageCircle, badge: unread },
    { to: '/dashboard/cuenta', label: 'Cuenta', icon: Settings },
  ];

  return (
    <div className="container-page py-6 md:py-10">
      <div className="md:grid md:grid-cols-[230px_1fr] md:gap-10">
        <aside className="hidden md:block">
          <div className="sticky top-24">
            <div className="mb-6 flex items-center gap-3 px-2">
              <Avatar src={user.avatar_url} name={user.full_name} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{user.full_name}</p>
                <p className="text-xs text-ink-400">{isProvider ? 'Profesional' : 'Cliente'}</p>
              </div>
            </div>
            <nav className="space-y-0.5" aria-label="Panel">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={'end' in l ? l.end : false}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                    isActive ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:bg-white/70 hover:text-ink-900',
                  )}
                >
                  <l.icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{l.label}</span>
                  {'badge' in l && l.badge ? (
                    <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-bold leading-5 text-white">{l.badge}</span>
                  ) : null}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        {/* En móvil el menú del panel es una tira horizontal desplazable. */}
        <nav className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:hidden" aria-label="Panel">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={'end' in l ? l.end : false}
              className={({ isActive }) => cn('chip', isActive && 'chip-active')}
            >
              <l.icon className="h-4 w-4" /> {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
