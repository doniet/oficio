import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ChevronRight, Search, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiError, type GoogleLogin } from '../services/api';
import type { User, UserType } from '../types';
import { Alert, Avatar, Modal, Spinner, cn } from './ui';

const DEMO_ACCOUNTS = [
  { email: 'yudit.fernandez.demo@gmail.com', full_name: 'Yudit Fernández' },
  { email: 'reinier.oficios.demo@gmail.com', full_name: 'Reinier Castillo' },
  { email: 'taller.lamoderna.demo@gmail.com', full_name: 'Taller La Moderna' },
];

const PENDIENTE_KEY = 'oc_google_pendiente';

export interface GooglePendiente {
  state: string;
  nonce: string;
  user_type?: UserType;
  next?: string | null;
}

export function leerPendiente(): GooglePendiente | null {
  try {
    const raw = sessionStorage.getItem(PENDIENTE_KEY);
    sessionStorage.removeItem(PENDIENTE_KEY);
    return raw ? (JSON.parse(raw) as GooglePendiente) : null;
  } catch {
    return null;
  }
}

function aleatorio() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function redirigirAGoogle(clientId: string, userType: UserType | undefined, next: string | null) {
  const pendiente: GooglePendiente = { state: aleatorio(), nonce: aleatorio(), user_type: userType, next };
  try {
    sessionStorage.setItem(PENDIENTE_KEY, JSON.stringify(pendiente));
  } catch {
    // Sin sessionStorage el callback no podrá comprobar el state y mostrará el error.
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/google`,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: pendiente.nonce,
    state: pendiente.state,
    prompt: 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/** Lleva al usuario a su sitio tras entrar con Google: un profesional nuevo, a completar su perfil. */
export function useDestinoGoogle() {
  const navigate = useNavigate();
  const toast = useToast();
  return (user: User, isNew: boolean, next: string | null | undefined) => {
    if (isNew && user.user_type === 'provider') {
      toast('¡Cuenta creada en el plan Gratis! Completa tu perfil para aparecer en las búsquedas.');
      navigate('/dashboard/perfil', { replace: true });
    } else {
      if (isNew) toast('¡Te damos la bienvenida a Oficios Cuba!');
      navigate(next ?? '/dashboard', { replace: true });
    }
  };
}

export function GoogleMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-sand-200 bg-white font-sans text-sm font-bold text-brand-600', className)} aria-hidden="true">
      G
    </span>
  );
}

export function UserTypeStep({ nombre, loading, onPick }: { nombre?: string; loading: boolean; onPick: (t: UserType) => void }) {
  const opciones: { value: UserType; title: string; text: string; icon: React.ReactNode }[] = [
    { value: 'client', title: 'Busco un profesional', text: 'Encuentra, contacta y valora.', icon: <Search className="h-5 w-5" /> },
    { value: 'provider', title: 'Ofrezco mi oficio o negocio — plan Gratis', text: 'Nombre, logo, descripción, dirección y teléfono. Mejora cuando quieras.', icon: <Briefcase className="h-5 w-5" /> },
  ];
  return (
    <div>
      <p className="font-bold text-ink-900">¿Cómo vas a usar Oficios Cuba?</p>
      {nombre && <p className="mt-1 text-sm text-ink-500">Es la primera vez que entras, {nombre}.</p>}
      <div className="mt-4 grid gap-2.5">
        {opciones.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={loading}
            onClick={() => onPick(o.value)}
            className="flex items-center gap-3 rounded-2xl border-2 border-sand-200 bg-white p-3.5 text-left transition hover:border-brand-300 hover:shadow-card disabled:opacity-60"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-ink-600">{o.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold leading-snug text-ink-900">{o.title}</span>
              <span className="block text-xs leading-snug text-ink-500">{o.text}</span>
            </span>
            {loading ? <Spinner className="h-4 w-4" /> : <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GoogleButton({ userType, next = null, label = 'Continuar con Google' }: {
  userType?: UserType; next?: string | null; label?: string;
}) {
  const { googleMode, googleClientId, loginWithGoogle } = useAuth();
  const destino = useDestinoGoogle();
  const [open, setOpen] = useState(false);
  const [otra, setOtra] = useState(false);
  const [custom, setCustom] = useState({ full_name: '', email: '' });
  const [pendiente, setPendiente] = useState<{ email: string; full_name: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!googleMode) return null;

  const cerrar = () => {
    if (loading) return;
    setOpen(false);
    setOtra(false);
    setPendiente(null);
    setError('');
  };

  const entrar = async (payload: GoogleLogin) => {
    setError('');
    setLoading(true);
    try {
      const r = await loginWithGoogle(payload);
      if ('needs_user_type' in r) {
        setPendiente({ email: r.email, full_name: r.full_name });
        setLoading(false);
        return;
      }
      destino(r.user, r.isNew, next);
    } catch (err) {
      setError(apiError(err, 'No pudimos entrar con Google.'));
      setLoading(false);
    }
  };

  const elegir = (cuenta: { email: string; full_name: string }) => entrar({ mode: 'demo', ...cuenta, user_type: userType });

  const onClick = () => {
    if (googleMode === 'real' && googleClientId) redirigirAGoogle(googleClientId, userType, next);
    else setOpen(true);
  };

  const enviarOtra = () => elegir({ full_name: custom.full_name.trim(), email: custom.email.trim() });
  // Sin <form>: el botón puede ir dentro del formulario de registro y los formularios no se anidan.
  const customValido = custom.full_name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custom.email.trim());

  return (
    <>
      <button type="button" onClick={onClick} className="btn-secondary btn-lg w-full">
        <GoogleMark /> {label}
      </button>

      <Modal open={open} onClose={cerrar} title={pendiente ? 'Un paso más' : 'Elige una cuenta de Google (ficticia)'}>
        <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Simulación de Google — modo demostración. No se conecta con Google ni se usan cuentas reales.
        </div>
        {error && <div className="mb-4"><Alert>{error}</Alert></div>}

        {pendiente ? (
          <UserTypeStep nombre={pendiente.full_name} loading={loading} onPick={(t) => entrar({ mode: 'demo', ...pendiente, user_type: t })} />
        ) : otra ? (
          <div
            className="space-y-4"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (customValido && !loading) enviarOtra();
            }}
          >
            <div>
              <label htmlFor="g-name" className="label">Nombre</label>
              <input id="g-name" value={custom.full_name} onChange={(e) => setCustom((c) => ({ ...c, full_name: e.target.value }))} className="input" maxLength={80} autoComplete="name" />
            </div>
            <div>
              <label htmlFor="g-email" className="label">Correo de Google</label>
              <input id="g-email" type="email" inputMode="email" value={custom.email} onChange={(e) => setCustom((c) => ({ ...c, email: e.target.value }))} className="input" placeholder="tu.nombre@gmail.com" autoComplete="email" />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOtra(false)} className="btn-ghost">Volver</button>
              <button type="button" onClick={enviarOtra} disabled={!customValido || loading} className="btn-primary">
                {loading && <Spinner className="h-4 w-4" />} Continuar
              </button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-sand-100 overflow-hidden rounded-2xl border border-sand-200">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button type="button" disabled={loading} onClick={() => elegir(a)} className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-sand-50 disabled:opacity-60">
                  <Avatar name={a.full_name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">{a.full_name}</span>
                    <span className="block truncate text-xs text-ink-500">{a.email}</span>
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" disabled={loading} onClick={() => setOtra(true)} className="flex w-full items-center gap-3 p-3.5 text-left text-sm font-semibold text-ink-700 transition hover:bg-sand-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-100 text-ink-500"><UserPlus className="h-4 w-4" /></span>
                Usar otra cuenta
              </button>
            </li>
          </ul>
        )}
      </Modal>
    </>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
      <span className="h-px flex-1 bg-sand-200" /> o con tu correo <span className="h-px flex-1 bg-sand-200" />
    </div>
  );
}
