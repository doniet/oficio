import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, LogIn, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiError } from '../../services/api';
import { Alert, Spinner } from '../../components/ui';
import { AuthShell, PasswordInput, safeNext } from './AuthShell';
import GoogleButton, { OrDivider } from '../../components/GoogleButton';

// Cuentas creadas por backend/src/db/seed-demo.ts cuando DEMO_MODE está activo.
const DEMO_PASSWORD = 'Demo123!';
const DEMO_ACCOUNTS = [
  { email: 'cliente@demo.com', label: 'Cliente', detail: 'Laura Méndez · busca y contrata', icon: <User className="h-5 w-5" /> },
  { email: 'proveedor@demo.com', label: 'Profesional', detail: 'ElectroHogar Vedado · plan Profesional', icon: <Briefcase className="h-5 w-5" /> },
];

export default function Login() {
  const { login, demo, googleMode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doLogin = async (e: string, p: string) => {
    setError('');
    setLoading(true);
    try {
      await login(e, p);
      navigate(next ?? '/dashboard', { replace: true });
    } catch (err) {
      setError(apiError(err, 'No pudimos iniciar sesión.'));
      setLoading(false);
    }
  };

  const registerLink = next ? `/registro?next=${encodeURIComponent(next)}` : '/registro';

  return (
    <AuthShell title="Entra a tu cuenta" subtitle={<>¿No tienes cuenta? <Link to={registerLink} className="link">Regístrate gratis</Link></>}>
      {next && (
        <div className="mb-6"><Alert tone="info">Entra para continuar. Te llevaremos de vuelta a donde estabas.</Alert></div>
      )}

      {googleMode && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doLogin(email, password);
        }}
        className="space-y-5"
        noValidate
      >
        {error && <Alert>{error}</Alert>}
        <div>
          <label htmlFor="email" className="label">Correo electrónico</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="tu@correo.com"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Contraseña</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        <button type="submit" disabled={loading || !email || !password} className="btn-primary btn-lg w-full">
          {loading ? <Spinner className="h-4 w-4" /> : <LogIn className="h-5 w-5" />} Entrar
        </button>
      </form>

      {demo && (
        <section aria-labelledby="demo-title" className="mt-10 rounded-2xl border border-dashed border-sand-300 bg-white/70 p-5">
          <h2 id="demo-title" className="font-sans text-base font-bold">Prueba la demo</h2>
          <p className="mt-1 text-sm text-ink-500">Entra con una cuenta de ejemplo. Contraseña: <code className="rounded bg-sand-100 px-1.5 py-0.5 text-ink-800">{DEMO_PASSWORD}</code></p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                disabled={loading}
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  doLogin(a.email, DEMO_PASSWORD);
                }}
                className="flex items-center gap-3 rounded-xl border border-sand-200 bg-white p-3 text-left transition hover:border-brand-300 hover:shadow-card disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-ink-600">{a.icon}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink-900">{a.label}</span>
                  <span className="block truncate text-xs text-ink-500">{a.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </AuthShell>
  );
}
