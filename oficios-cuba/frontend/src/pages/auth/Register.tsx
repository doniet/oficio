import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Mail, Lock, Eye, EyeOff, User, MapPin, Building2, Briefcase, Shield, CheckCircle } from 'lucide-react';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultUserType = searchParams.get('type') === 'provider' ? 'provider' : 'client';

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    user_type: defaultUserType as 'client' | 'provider',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirm_password) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      await register({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        phone: formData.phone || undefined,
        user_type: formData.user_type,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  const benefits = {
    client: [
      { icon: Search, text: 'Busca servicios en tu zona' },
      { icon: Heart, text: 'Guarda tus favoritos' },
      { icon: MessageSquare, text: 'Chatea con proveedores' },
      { icon: Star, text: 'Califica y reseña servicios' },
    ],
    provider: [
      { icon: Briefcase, text: 'Publica tus servicios' },
      { icon: MapPin, text: 'Llega a clientes en toda Cuba' },
      { icon: Building2, text: 'Gestiona tu perfil profesional' },
      { icon: Shield, text: 'Recibe pagos seguros' },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 rounded-2xl p-8 text-white overflow-hidden">
            <Link to="/" className="inline-flex items-center gap-2 mb-8">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <MapPin className="w-6 h-6" />
              </div>
              <span className="text-xl font-bold">Oficios Cuba</span>
            </Link>

            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-4">
                {formData.user_type === 'provider' ? 'Únete como profesional' : 'Crea tu cuenta gratis'}
              </h2>
              <p className="text-primary-100 text-lg mb-8">
                {formData.user_type === 'provider'
                  ? 'Conecta con miles de clientes en Cuba y haz crecer tu negocio con nuestra plataforma.'
                  : 'Encuentra los mejores profesionales para tus necesidades. Rápido, seguro y cerca de ti.'}
              </p>

              <div className="space-y-4">
                {benefits[formData.user_type].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="w-5 h-5" />
                    </div>
                    <span className="text-primary-100">{benefit.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute bottom-8 left-8 right-8 flex gap-4">
              <button
                onClick={() => setFormData(prev => ({ ...prev, user_type: 'client' }))}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                  formData.user_type === 'client'
                    ? 'bg-white text-primary-600 shadow-lg'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                <User className="w-4 h-4 mr-2" />
                Buscar servicios
              </button>
              <button
                onClick={() => setFormData(prev => ({ ...prev, user_type: 'provider' }))}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                  formData.user_type === 'provider'
                    ? 'bg-white text-primary-600 shadow-lg'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                <Briefcase className="w-4 h-4 mr-2" />
                Ofrecer servicios
              </button>
            </div>
          </div>

          <div className="card p-8 lg:p-10">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Crear cuenta</h1>
              <p className="mt-2 text-gray-600">Solo toma un minuto</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="full_name" className="label">Nombre completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    autoComplete="name"
                    required
                    value={formData.full_name}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="Juan Pérez"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="label">Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="juan@ejemplo.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="label">Teléfono (opcional)</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="+53 5 XXX XXXX"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="label">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="input pl-10 pr-10"
                    placeholder="••••••••"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm_password" className="label">Confirmar contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="confirm_password"
                    name="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={formData.confirm_password}
                    onChange={handleChange}
                    className="input pl-10 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  required
                  className="mt-1 w-4 h-4 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="terms" className="text-sm text-gray-600">
                  Acepto los <Link to="/terminos" className="text-primary-600 hover:text-primary-500">Términos y Condiciones</Link> y la <Link to="/privacidad" className="text-primary-600 hover:text-primary-500">Política de Privacidad</Link>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 text-lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creando cuenta...
                  </span>
                ) : (
                  `Crear cuenta ${formData.user_type === 'provider' ? 'de proveedor' : 'de cliente'}`
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Search } from 'lucide-react';