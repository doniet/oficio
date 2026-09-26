import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Check, Search, UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { apiError } from '../../services/api';
import type { UserType } from '../../types';
import { Alert, Field, Spinner, cn } from '../../components/ui';
import { AuthShell, PasswordInput, safeNext } from './AuthShell';
import GoogleButton, { OrDivider } from '../../components/GoogleButton';

type Errors = Partial<Record<'full_name' | 'email' | 'phone' | 'password', string>>;

function validate(f: { full_name: string; email: string; phone: string; password: string }, type: UserType): Errors {
  const e: Errors = {};
  if (f.full_name.trim().length < 2) e.full_name = 'Escribe tu nombre completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Revisa el correo: parece incompleto.';
  if (type === 'provider' && !f.phone.trim()) e.phone = 'Los clientes te contactarán por este número.';
  else if (f.phone.trim() && !/^\+?[\d\s-]{8,20}$/.test(f.phone.trim())) e.phone = 'Usa solo números, por ejemplo +53 5 123 4567.';
  if (f.password.length < 8) e.password = 'Usa al menos 8 caracteres.';
  return e;
}

const TYPES: { value: UserType; title: string; text: string; icon: React.ReactNode }[] = [
  { value: 'client', title: 'Busco un profesional', text: 'Encuentra, escribe y valora.', icon: <Search className="h-5 w-5" /> },
  { value: 'provider', title: 'Ofrezco mi oficio o negocio', text: 'Empieza gratis y recibe clientes.', icon: <Briefcase className="h-5 w-5" /> },
];

export default function Register() {
  const { register, googleMode } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [type, setType] = useState<UserType>(['profesional', 'provider'].includes(params.get('tipo') ?? '') ? 'provider' : 'client');
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const errors = touched ? validate(form, type) : {};
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const found = validate(form, type);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        user_type: type,
      });
      if (type === 'provider') {
        toast('¡Cuenta creada! Completa tu perfil para aparecer en las búsquedas.');
        navigate('/dashboard/perfil', { replace: true });
      } else {
        toast('¡Te damos la bienvenida a Oficios Cuba!');
        navigate(next ?? '/dashboard', { replace: true });
      }
    } catch (err) {
      setError(apiError(err, 'No pudimos crear tu cuenta.'));
      setLoading(false);
    }
  };

  const loginLink = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  return (
    <AuthShell title="Crea tu cuenta gratis" subtitle={<>¿Ya tienes cuenta? <Link to={loginLink} className="link">Entra aquí</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <fieldset>
          <legend className="label">¿Qué quieres hacer?</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <label
                  key={t.value}
                  className={cn(
                    'relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 bg-white p-3.5 transition sm:p-4',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-2',
                    active ? 'border-brand-500 shadow-card' : 'border-sand-200 hover:border-sand-300',
                  )}
                >
                  <input type="radio" name="user_type" value={t.value} checked={active} onChange={() => setType(t.value)} className="sr-only" />
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', active ? 'bg-brand-600 text-white' : 'bg-sand-100 text-ink-600')}>{t.icon}</span>
                  <span className="text-sm font-bold leading-snug text-ink-900">{t.title}</span>
                  <span className="text-xs leading-snug text-ink-500">{t.text}</span>
                  {active && <Check className="absolute right-3 top-3 h-5 w-5 text-brand-600" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </fieldset>

        {type === 'provider' && (
          <p className="rounded-xl bg-sand-100 px-3.5 py-2.5 text-sm text-ink-600">
            <strong className="text-ink-900">Empieza gratis:</strong> nombre, logo, descripción, dirección y teléfono. Mejora cuando quieras.
          </p>
        )}

        {googleMode && (
          <div>
            <GoogleButton userType={type} next={next} label={type === 'provider' ? 'Registrarme con Google' : 'Continuar con Google'} />
            <OrDivider />
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        <Field label={type === 'provider' ? 'Tu nombre (el negocio lo añades después)' : 'Nombre completo'} htmlFor="full_name" error={errors.full_name}>
          <input id="full_name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} autoComplete="name" className={cn('input', errors.full_name && 'input-error')} aria-invalid={!!errors.full_name || undefined} maxLength={80} required />
        </Field>

        <Field label="Correo electrónico" htmlFor="email" error={errors.email}>
          <input id="email" type="email" inputMode="email" value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" className={cn('input', errors.email && 'input-error')} aria-invalid={!!errors.email || undefined} placeholder="tu@correo.com" required />
        </Field>

        <Field
          label={type === 'provider' ? 'Teléfono / WhatsApp' : 'Teléfono (opcional)'}
          htmlFor="phone"
          error={errors.phone}
          hint={type === 'provider' ? 'Aparecerá en tu perfil para que te escriban por WhatsApp.' : 'Solo lo verán los profesionales con los que hables.'}
        >
          <input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} autoComplete="tel" className={cn('input', errors.phone && 'input-error')} aria-invalid={!!errors.phone || undefined} placeholder="+53 5 123 4567" maxLength={20} />
        </Field>

        <Field label="Contraseña" htmlFor="password" error={errors.password} hint="Mínimo 8 caracteres.">
          <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="new-password" invalid={!!errors.password} />
        </Field>

        <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
          {loading ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-5 w-5" />}
          {type === 'provider' ? 'Crear cuenta profesional' : 'Crear cuenta'}
        </button>
        <p className="text-center text-xs text-ink-400">Buscar y publicar tu oficio es gratis. Los planes Básico y Profesional son opcionales.</p>
      </form>
    </AuthShell>
  );
}
