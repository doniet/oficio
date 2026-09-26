import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import DashboardLayout from './components/DashboardLayout';
import { PageLoader } from './components/ui';
import Home from './pages/Home';
import type { UserType } from './types';

// La portada va en el bundle inicial; el resto se descarga al navegar.
const Search = lazy(() => import('./pages/Search'));
const Providers = lazy(() => import('./pages/Providers'));
const Plans = lazy(() => import('./pages/Plans'));
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'));
const ProviderProfile = lazy(() => import('./pages/ProviderProfile'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const ProviderProfileEdit = lazy(() => import('./pages/dashboard/ProviderProfileEdit'));
const MyServices = lazy(() => import('./pages/dashboard/MyServices'));
const ServiceForm = lazy(() => import('./pages/dashboard/ServiceForm'));
const MySubscription = lazy(() => import('./pages/dashboard/MySubscription'));
const Messages = lazy(() => import('./pages/dashboard/Messages'));
const Conversation = lazy(() => import('./pages/dashboard/Conversation'));
const Favorites = lazy(() => import('./pages/dashboard/Favorites'));
const Account = lazy(() => import('./pages/dashboard/Account'));
const Agenda = lazy(() => import('./pages/dashboard/Agenda'));
const AgendaAjustes = lazy(() => import('./pages/dashboard/AgendaAjustes'));
const MisCitas = lazy(() => import('./pages/dashboard/MisCitas'));
const Catalogo = lazy(() => import('./pages/dashboard/Catalogo'));
const GoogleCallback = lazy(() => import('./pages/auth/GoogleCallback'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children, only }: { children: ReactNode; only?: UserType }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (only && user.user_type !== only) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [params] = useSearchParams();
  if (isLoading) return <PageLoader />;
  if (user) {
    const next = params.get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="buscar" element={<Search />} />
          <Route path="profesionales" element={<Providers />} />
          <Route path="planes" element={<Plans />} />
          <Route path="servicio/:id" element={<ServiceDetail />} />
          <Route path="proveedor/:id" element={<ProviderProfile />} />
          <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="registro" element={<GuestOnly><Register /></GuestOnly>} />
          <Route path="auth/google" element={<GoogleCallback />} />

          <Route path="dashboard/mensajes/:id" element={<RequireAuth><Conversation /></RequireAuth>} />
          <Route path="dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="mensajes" element={<Messages />} />
            <Route path="cuenta" element={<Account />} />
            <Route path="favoritos" element={<RequireAuth only="client"><Favorites /></RequireAuth>} />
            <Route path="perfil" element={<RequireAuth only="provider"><ProviderProfileEdit /></RequireAuth>} />
            <Route path="servicios" element={<RequireAuth only="provider"><MyServices /></RequireAuth>} />
            <Route path="catalogo" element={<RequireAuth only="provider"><Catalogo /></RequireAuth>} />
            <Route path="servicios/nuevo" element={<RequireAuth only="provider"><ServiceForm /></RequireAuth>} />
            <Route path="servicios/:id/editar" element={<RequireAuth only="provider"><ServiceForm /></RequireAuth>} />
            <Route path="suscripcion" element={<RequireAuth only="provider"><MySubscription /></RequireAuth>} />
            <Route path="agenda" element={<RequireAuth only="provider"><Agenda /></RequireAuth>} />
            <Route path="agenda/ajustes" element={<RequireAuth only="provider"><AgendaAjustes /></RequireAuth>} />
            <Route path="citas" element={<RequireAuth only="client"><MisCitas /></RequireAuth>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
