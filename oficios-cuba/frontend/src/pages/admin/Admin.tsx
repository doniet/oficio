import { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Activity, LogOut, ScrollText, Send } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiError } from '../../services/api';
import { ADMIN_2FA_EVENT, adminApi, adminSession } from '../../services/adminApi';
import { PageTitle } from '../../components/DashboardLayout';
import { ErrorState, PageLoader, cn } from '../../components/ui';
import Gate2fa from './Gate2fa';
import SistemaTab from './SistemaTab';
import TelegramTab from './TelegramTab';
import RegistroTab from './RegistroTab';

const TABS = [
  { id: 'sistema', label: 'Sistema', icon: Activity },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'registro', label: 'Registro', icon: ScrollText },
] as const;
type TabId = typeof TABS[number]['id'];

export default function Admin() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [totp, setTotp] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [sesion, setSesion] = useState(() => adminSession.get());
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      setTotp((await adminApi.me()).data.totp_enabled);
    } catch (err) {
      setError(apiError(err, 'No se pudo abrir el panel.'));
    }
  }, []);

  useEffect(() => { if (user?.is_admin) load(); }, [user, load]);

  // Al caducar (o ante un 401 del panel) se vuelve a pedir el código sin salir de la página.
  useEffect(() => {
    const caducada = () => setSesion(null);
    window.addEventListener(ADMIN_2FA_EVENT, caducada);
    const reloj = window.setInterval(() => {
      if (!adminSession.get()) setSesion(null);
      tick((n) => n + 1);
    }, 30_000);
    return () => { window.removeEventListener(ADMIN_2FA_EVENT, caducada); window.clearInterval(reloj); };
  }, []);

  if (!user?.is_admin) return <Navigate to="/dashboard" replace />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (totp === null) return <PageLoader />;

  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'sistema') as TabId;
  const minutos = sesion ? Math.max(0, Math.ceil((Date.parse(sesion.expires_at) - Date.now()) / 60_000)) : 0;

  return (
    <div>
      <PageTitle
        title="Técnico"
        subtitle={sesion ? `Sesión de administración: quedan ${minutos} min.` : 'Apartado de administración del sistema.'}
        action={sesion ? (
          <button type="button" onClick={() => { adminSession.clear(); setSesion(null); }} className="btn-secondary btn-sm self-start">
            <LogOut className="h-4 w-4" /> Cerrar panel
          </button>
        ) : undefined}
      />

      {!sesion ? (
        <Gate2fa enabled={totp} onSession={() => { setTotp(true); setSesion(adminSession.get()); }} />
      ) : (
        <>
          <div className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                onClick={() => setParams(t.id === 'sistema' ? {} : { tab: t.id }, { replace: true })}
                className={cn('chip shrink-0', tab === t.id && 'chip-active')}>
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
          {tab === 'sistema' && <SistemaTab />}
          {tab === 'telegram' && <TelegramTab />}
          {tab === 'registro' && <RegistroTab />}
        </>
      )}
    </div>
  );
}
