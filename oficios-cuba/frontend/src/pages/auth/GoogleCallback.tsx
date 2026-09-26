import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiError } from '../../services/api';
import type { UserType } from '../../types';
import { Alert, Spinner } from '../../components/ui';
import { leerPendiente, UserTypeStep, useDestinoGoogle, type GooglePendiente } from '../../components/GoogleButton';
import { AuthShell, safeNext } from './AuthShell';

export default function GoogleCallback() {
  const { loginWithGoogle } = useAuth();
  const destino = useDestinoGoogle();
  const [error, setError] = useState('');
  const [preguntar, setPreguntar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const datos = useRef<{ id_token: string; pendiente: GooglePendiente } | null>(null);
  const iniciado = useRef(false);

  const entrar = async (userType?: UserType) => {
    const d = datos.current;
    if (!d) return;
    setError('');
    setLoading(true);
    try {
      const r = await loginWithGoogle({ mode: 'google', id_token: d.id_token, nonce: d.pendiente.nonce, user_type: userType ?? d.pendiente.user_type });
      if ('needs_user_type' in r) {
        setPreguntar(r.full_name);
        setLoading(false);
        return;
      }
      destino(r.user, r.isNew, safeNext(d.pendiente.next ?? null));
    } catch (err) {
      setError(apiError(err, 'No pudimos entrar con Google.'));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    const pendiente = leerPendiente();
    const idToken = hash.get('id_token');
    if (hash.get('error')) {
      setError('Cancelaste el acceso con Google o Google no lo permitió.');
      return;
    }
    if (!idToken || !pendiente || hash.get('state') !== pendiente.state) {
      setError('La respuesta de Google no es válida o caducó. Vuelve a intentarlo.');
      return;
    }
    datos.current = { id_token: idToken, pendiente };
    entrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell title="Entrando con Google" subtitle="Un momento, estamos comprobando tu cuenta.">
      {error ? (
        <div className="space-y-4">
          <Alert>{error}</Alert>
          <Link to="/login" className="btn-primary w-full">Volver a entrar</Link>
        </div>
      ) : preguntar !== null ? (
        <UserTypeStep nombre={preguntar} loading={loading} onPick={(t) => entrar(t)} />
      ) : (
        <div className="flex items-center gap-3 text-ink-500"><Spinner /> Comprobando…</div>
      )}
    </AuthShell>
  );
}
