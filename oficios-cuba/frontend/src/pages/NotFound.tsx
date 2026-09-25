import { Link } from 'react-router-dom';
import { Home, Search, MapPin, RotateCcw } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-8">
          <span className="text-9xl font-bold text-primary-100">404</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Página no encontrada</h1>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          Lo sentimos, la página que buscas no existe o ha sido movida.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/" className="btn-primary gap-2">
            <Home className="w-5 h-5" />
            Ir al inicio
          </Link>
          <Link to="/buscar" className="btn-secondary gap-2">
            <Search className="w-5 h-5" />
            Buscar servicios
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn-outline gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            Volver atrás
          </button>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
          <Link to="/buscar" className="card p-6 hover:border-primary-300 transition-colors">
            <MapPin className="w-10 h-10 text-primary-600 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Explorar por zona</h3>
            <p className="text-sm text-gray-500">Encuentra servicios en tu provincia</p>
          </Link>
          <Link to="/buscar" className="card p-6 hover:border-primary-300 transition-colors">
            <Search className="w-10 h-10 text-primary-600 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Buscar oficios</h3>
            <p className="text-sm text-gray-500">Electricista, plomero, pintor...</p>
          </Link>
          <Link to="/registro" className="card p-6 hover:border-primary-300 transition-colors">
            <MapPin className="w-10 h-10 text-primary-600 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Registrarse</h3>
            <p className="text-sm text-gray-500">Como cliente o proveedor</p>
          </Link>
        </div>
      </div>
    </div>
  );
}