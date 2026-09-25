import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Menu, X, User, LogOut, LayoutDashboard, Heart, MessageSquare, CreditCard, Settings, ChevronDown, Search, MapPin, Briefcase } from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isDashboard = location.pathname.startsWith('/dashboard');

  const navLinks = [
    { href: '/', label: 'Inicio', icon: 'home' },
    { href: '/buscar', label: 'Buscar', icon: 'search' },
  ];

  const providerLinks = [
    { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
    { href: '/dashboard/servicios', label: 'Mis Servicios', icon: Briefcase },
    { href: '/dashboard/suscripciones', label: 'Suscripción', icon: CreditCard },
    { href: '/dashboard/mensajes', label: 'Mensajes', icon: MessageSquare },
  ];

  const clientLinks = [
    { href: '/dashboard/favoritos', label: 'Favoritos', icon: Heart },
    { href: '/dashboard/mensajes', label: 'Mensajes', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2" aria-label="Oficios Cuba - Inicio">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl text-gray-900">Oficios Cuba</span>
              </Link>

              <div className="hidden md:flex items-center gap-6">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={`text-sm font-medium transition-colors ${
                      location.pathname === link.href
                        ? 'text-primary-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:block relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <User className="w-5 h-5 text-primary-600" />
                    )}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-gray-700">
                    {user?.full_name || 'Usuario'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 animate-fade-in">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{user?.user_type}</p>
                    </div>
                    {user?.user_type === 'provider' && (
                      <>
                        <Link
                          to="/dashboard"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <LayoutDashboard className="w-4 h-4" /> Panel
                        </Link>
                        <Link
                          to="/dashboard/servicios"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <Briefcase className="w-4 h-4" /> Mis Servicios
                        </Link>
                        <Link
                          to="/dashboard/suscripciones"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <CreditCard className="w-4 h-4" /> Suscripción
                        </Link>
                      </>
                    )}
                    {user?.user_type === 'client' && (
                      <>
                        <Link
                          to="/dashboard/favoritos"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <Heart className="w-4 h-4" /> Favoritos
                        </Link>
                      </>
                    )}
                    <Link
                      to="/dashboard/mensajes"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <MessageSquare className="w-4 h-4" /> Mensajes
                    </Link>
                    <Link
                      to="/dashboard/cuenta"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings className="w-4 h-4" /> Cuenta
                    </Link>
                    <hr className="my-1 border-gray-100" />
                    <button
                      onClick={logout}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4" /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>

              {user ? (
                <div className="hidden sm:flex items-center gap-3">
                  {user.user_type === 'provider' && (
                    <Link
                      to="/dashboard/servicios/nuevo"
                      className="btn-primary text-sm"
                    >
                      <span className="hidden sm:inline">Publicar Servicio</span>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-3">
                  <Link to="/login" className="btn-secondary text-sm">
                    Iniciar sesión
                  </Link>
                  <Link to="/registro" className="btn-primary text-sm">
                    Registrarse
                  </Link>
                </div>
              )}

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden py-4 border-t border-gray-100 animate-slide-up">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    location.pathname === link.href
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <hr className="my-2" />
              {user ? (
                <>
                  {user.user_type === 'provider' && (
                    <>
                      <Link to="/dashboard" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={() => setMobileMenuOpen(false)}>Panel</Link>
                      <Link to="/dashboard/servicios" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={() => setMobileMenuOpen(false)}>Mis Servicios</Link>
                      <Link to="/dashboard/suscripciones" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={() => setMobileMenuOpen(false)}>Suscripción</Link>
                    </>
                  )}
                  {user.user_type === 'client' && (
                    <Link to="/dashboard/favoritos" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={() => setMobileMenuOpen(false)}>Favoritos</Link>
                  )}
                  <Link to="/dashboard/mensajes" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={() => setMobileMenuOpen(false)}>Mensajes</Link>
                  <Link to="/dashboard/cuenta" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={() => setMobileMenuOpen(false)}>Cuenta</Link>
                  <button onClick={logout} className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 text-left">Cerrar sesión</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50" onClick={() => setMobileMenuOpen(false)}>Iniciar sesión</Link>
                  <Link to="/registro" className="btn-primary mx-4 text-center" onClick={() => setMobileMenuOpen(false)}>Registrarse</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl text-white">Oficios Cuba</span>
              </Link>
              <p className="text-sm">Conectando clientes con profesionales de confianza en toda Cuba.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Para Clientes</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/buscar" className="hover:text-white">Buscar servicios</Link></li>
                <li><Link to="/buscar" className="hover:text-white">Ver categorías</Link></li>
                <li><Link to="/dashboard/favoritos" className="hover:text-white">Mis favoritos</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Para Proveedores</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/registro" className="hover:text-white">Registrarse como proveedor</Link></li>
                <li><Link to="/dashboard/servicios/nuevo" className="hover:text-white">Publicar servicios</Link></li>
                <li><Link to="/dashboard/suscripciones" className="hover:text-white">Planes y precios</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Contacto</h4>
              <ul className="space-y-2 text-sm">
                <li>Cuba</li>
                <li>soporte@oficioscuba.com</li>
                <li>WhatsApp: +53 5 XXX XXXX</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
            <p>© 2024 Oficios Cuba. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}