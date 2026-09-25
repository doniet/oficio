import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { User, Mail, Lock, Phone, MapPin, Save, Loader2, Bell, Shield, Eye, EyeOff } from 'lucide-react';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    avatar_url: user?.avatar_url || '',
  });

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [notifications, setNotifications] = useState({
    email_new_message: true,
    email_new_review: true,
    email_promotions: false,
    push_new_message: true,
    push_new_review: true,
  });

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await authApi.updateProfile(profileData);
      updateUser(profileData);
      setSuccess('Perfil actualizado correctamente');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al actualizar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwordData.new_password !== passwordData.confirm_password) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (passwordData.new_password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setSaving(true);

    try {
      await authApi.updatePassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
      setSuccess('Contraseña actualizada correctamente');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
    // In a real app, you would save to backend
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Mi Cuenta</h1>
          <p className="text-gray-600 mt-1">Gestiona tu perfil, seguridad y preferencias</p>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-gray-100">
            <nav className="flex -mb-px" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'profile'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Perfil
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'security'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Seguridad
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'notifications'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Notificaciones
              </button>
            </nav>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700" role="alert">
                {success}
              </div>
            )}

            {activeTab === 'profile' && (
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div>
                  <label className="label">Información personal</label>
                </div>

                <div>
                  <label htmlFor="full_name" className="label">Nombre completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="full_name"
                      type="text"
                      value={profileData.full_name}
                      onChange={(e) => setProfileData(prev => ({ ...prev, full_name: e.target.value }))}
                      required
                      className="input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="label">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="input pl-10 bg-gray-50"
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">El correo no se puede cambiar por seguridad</p>
                </div>

                <div>
                  <label htmlFor="phone" className="label">Teléfono</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="phone"
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                      className="input pl-10"
                      placeholder="+53 XX XXXXXXX"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Avatar</label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-primary-100 flex items-center justify-center overflow-hidden">
                      {profileData.avatar_url ? (
                        <img src={profileData.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 text-primary-600" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        type="url"
                        value={profileData.avatar_url}
                        onChange={(e) => setProfileData(prev => ({ ...prev, avatar_url: e.target.value }))}
                        className="input"
                        placeholder="https://ejemplo.com/avatar.jpg"
                      />
                      <p className="text-sm text-gray-500">URL de tu imagen de perfil (opcional)</p>
                    </div>
                  </div>
                </div>

                {user?.user_type === 'provider' && (
                  <div className="pt-6 border-t border-gray-100">
                    <label className="label">Información de Proveedor</label>
                    <p className="text-sm text-gray-500 mb-4">
                      Para editar tu información profesional (nombre del negocio, descripción, ubicación, etc.),
                      ve a la sección <Link to="/dashboard/perfil" className="text-primary-600 hover:underline">Editar Perfil Profesional</Link>.
                    </p>
                  </div>
                )}

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary gap-2">
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'security' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-6 max-w-md">
                <div>
                  <label className="label">Cambiar contraseña</label>
                  <p className="text-sm text-gray-500 mb-4">Tu contraseña debe tener al menos 6 caracteres</p>
                </div>

                <div>
                  <label htmlFor="current_password" className="label">Contraseña actual</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="current_password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={passwordData.current_password}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, current_password: e.target.value }))}
                      required
                      className="input pl-10 pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="new_password" className="label">Nueva contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="new_password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={passwordData.new_password}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, new_password: e.target.value }))}
                      required
                      minLength={6}
                      className="input pl-10 pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm_password" className="label">Confirmar nueva contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="confirm_password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={passwordData.confirm_password}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirm_password: e.target.value }))}
                      required
                      minLength={6}
                      className="input pl-10 pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary gap-2">
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                    {saving ? 'Actualizando...' : 'Cambiar contraseña'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <label className="label">Preferencias de notificación</label>
                  <p className="text-sm text-gray-500">Configura cómo quieres recibir actualizaciones</p>
                </div>

                <div className="space-y-4">
                  <NotificationItem
                    label="Nuevos mensajes"
                    description="Recibir notificación cuando alguien te escribe"
                    email={notifications.email_new_message}
                    push={notifications.push_new_message}
                    onEmailChange={(v) => handleNotificationChange('email_new_message', v)}
                    onPushChange={(v) => handleNotificationChange('push_new_message', v)}
                  />
                  <NotificationItem
                    label="Nuevas reseñas"
                    description="Recibir notificación cuando te dejan una reseña"
                    email={notifications.email_new_review}
                    push={notifications.push_new_review}
                    onEmailChange={(v) => handleNotificationChange('email_new_review', v)}
                    onPushChange={(v) => handleNotificationChange('push_new_review', v)}
                  />
                  <NotificationItem
                    label="Promociones y novedades"
                    description="Recibir ofertas especiales y noticias de Oficios Cuba"
                    email={notifications.email_promotions}
                    push={false}
                    onEmailChange={(v) => handleNotificationChange('email_promotions', v)}
                    onPushChange={() => {}}
                    showPush={false}
                  />
                </div>

                <div className="pt-6 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    Las notificaciones push requieren permisos del navegador. Puedes gestionarlos en la configuración de tu navegador.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationItem(props: {
  label: string;
  description: string;
  email: boolean;
  push: boolean;
  onEmailChange: (v: boolean) => void;
  onPushChange: (v: boolean) => void;
  showPush?: boolean;
}) {
  const { label, description, email, push, onEmailChange, onPushChange, showPush = true } = props;

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
      <div className="flex-1">
        <h4 className="font-medium text-gray-900">{label}</h4>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => onEmailChange(e.target.checked)}
            className="w-4 h-4 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-600">Email</span>
        </label>
        {showPush && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={push}
              onChange={(e) => onPushChange(e.target.checked)}
              className="w-4 h-4 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-gray-600">Push</span>
          </label>
        )}
      </div>
    </div>
  );
}