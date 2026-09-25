import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import ServiceDetail from './pages/ServiceDetail';
import ProviderProfile from './pages/ProviderProfile';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/dashboard/Dashboard';
import ProviderProfileEdit from './pages/dashboard/ProviderProfileEdit';
import MyServices from './pages/dashboard/MyServices';
import ServiceForm from './pages/dashboard/ServiceForm';
import MySubscriptions from './pages/dashboard/MySubscriptions';
import Messages from './pages/dashboard/Messages';
import Conversation from './pages/dashboard/Conversation';
import Favorites from './pages/dashboard/Favorites';
import Profile from './pages/dashboard/Profile';
import NotFound from './pages/NotFound';

function PrivateRoute({ children, allowedTypes }: { children: React.ReactNode; allowedTypes?: ('client' | 'provider')[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedTypes && !allowedTypes.includes(user.user_type)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="buscar" element={<Search />} />
        <Route path="servicio/:id" element={<ServiceDetail />} />
        <Route path="proveedor/:id" element={<ProviderProfile />} />

        <Route path="login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="registro" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />

        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="dashboard/perfil" element={<ProviderProfileEdit />} />
          <Route path="dashboard/servicios" element={<MyServices />} />
          <Route path="dashboard/servicios/nuevo" element={<ServiceForm />} />
          <Route path="dashboard/servicios/:id/editar" element={<ServiceForm />} />
          <Route path="dashboard/suscripciones" element={<MySubscriptions />} />
          <Route path="dashboard/mensajes" element={<Messages />} />
          <Route path="dashboard/mensajes/:id" element={<Conversation />} />
          <Route path="dashboard/favoritos" element={<Favorites />} />
          <Route path="dashboard/cuenta" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;