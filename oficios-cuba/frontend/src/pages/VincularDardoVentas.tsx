import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiError, dardoventasApi } from '../services/api';
import { Alert, PageLoader, Spinner } from '../components/ui';

/** Cada cuánto se pregunta por el canje y cuánto se espera. Exportado para que las pruebas lo acorten. */
export const ESPERA = { intervaloMs: 2000, maxMs: 45_000 };

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Aquí llega el comerciante desde mi.dardoventas.com con un código de un solo uso. Es pública: sin
// sesión se le manda a crear su cuenta de negocio y vuelve aquí con el mismo código.
export default function VincularDardoVentas() {
  const { user, isLoading } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState('');
  const code = params.get('code') ?? '';

  if (isLoading) return <PageLoader />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/registro?tipo=provider&next=${next}`} replace />;
  }

  const conectar = async () => {
    setEnCurso(true);
    setError('');
    try {
      const { data } = await dardoventasApi.vincular(code);
      for (let esperado = 0; esperado < ESPERA.maxMs; esperado += ESPERA.intervaloMs) {
        await pausa(ESPERA.intervaloMs);
        const canje = (await dardoventasApi.estado()).data.canje;
        if (canje?.id !== data.id || canje.status === 'pendiente') continue;
        if (canje.status === 'ok') {
          toast('¡Catálogo conectado! Ahora completa tu ficha y marca tu ubicación para salir en el mapa.');
          navigate('/dashboard/perfil', { replace: true });
          return;
        }
        setError(canje.error ?? 'No se pudo conectar el catálogo.');
        setEnCurso(false);
        return;
      }
      setError('DardoVentas está tardando en responder. Mira en «Catálogo» dentro de un rato si ya quedó conectado.');
    } catch (err) {
      setError(apiError(err, 'No se pudo conectar el catálogo.'));
    }
    setEnCurso(false);
  };

  return (
    <div className="container-page max-w-xl py-10">
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sea-50 text-sea-700"><Store className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="font-display text-xl font-bold text-ink-900">Conecta tu catálogo de DardoVentas</h1>
        </div>
        {!code ? (
          <Alert tone="info">Falta el código. Entra en mi.dardoventas.com y pulsa «Publicar mi catálogo en Encuentrauno» otra vez.</Alert>
        ) : user.user_type !== 'provider' ? (
          <Alert tone="info">Entraste con una cuenta de cliente. Para publicar tu catálogo, cierra sesión y entra con la cuenta de tu negocio (o crea una).</Alert>
        ) : (
          <>
            <p className="text-ink-600">
              Tus productos saldrán en tu ficha de Encuentrauno con los mismos precios que cobras en caja, y se
              actualizarán solos. Tu ubicación, tu dirección y tu horario los decides tú en tu perfil.
            </p>
            {error && <Alert>{error}</Alert>}
            <button type="button" onClick={conectar} disabled={enCurso} className="btn-primary w-full">
              {enCurso ? <><Spinner className="h-4 w-4" /> Conectando…</> : 'Conectar mi catálogo'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
