import { useState, type FormEvent } from 'react';
import { Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError } from '../../services/api';
import { adminApi, adminSession } from '../../services/adminApi';
import { Alert, Field, Spinner } from '../../components/ui';
import { CodeInput } from './parts';

/** Alta del 2FA (primera vez) o código para abrir la sesión de administración. */
export default function Gate2fa({ enabled, onSession }: { enabled: boolean; onSession: () => void }) {
  const toast = useToast();
  const [alta, setAlta] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const empezar = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await adminApi.setup2fa();
      const QR = await import('qrcode');
      const qr = await QR.toDataURL(data.uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
      setAlta({ ...data, qr });
    } catch (err) {
      setError(apiError(err, 'No se pudo generar el código QR.'));
    } finally {
      setBusy(false);
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setError('Escribe las 6 cifras de tu app'); return; }
    setBusy(true);
    setError('');
    try {
      const { data } = enabled ? await adminApi.verify2fa(code) : await adminApi.enable2fa(code);
      adminSession.set(data);
      if (!enabled) toast('Verificación en dos pasos activada');
      onSession();
    } catch (err) {
      setError(apiError(err, 'Código incorrecto.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(alta!.secret); toast('Clave copiada'); } catch { toast('No se pudo copiar', 'error'); }
  };

  const formulario = (
    <form onSubmit={enviar} noValidate className="space-y-3">
      <Field label="Código de 6 cifras de tu app" htmlFor="adm-code">
        <CodeInput id="adm-code" value={code} onChange={setCode} autoFocus />
      </Field>
      <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full sm:w-auto">
        {busy && <Spinner className="h-4 w-4" />} {enabled ? 'Entrar al panel' : 'Activar y entrar'}
      </button>
    </form>
  );

  return (
    <div className="card mx-auto max-w-lg space-y-5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sea-100 text-sea-700">
          {enabled ? <KeyRound className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        </span>
        <div>
          <h2 className="text-lg font-bold">{enabled ? 'Confirma que eres tú' : 'Activa la verificación en dos pasos'}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {enabled
              ? 'Escribe el código que muestra ahora tu app de autenticación. La sesión del panel dura 30 minutos.'
              : 'El panel técnico pide, además de tu contraseña, un código que cambia cada 30 segundos en tu móvil.'}
          </p>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {enabled ? formulario : !alta ? (
        <div className="space-y-3 text-sm text-ink-600">
          <p>Necesitas una app de autenticación: Google Authenticator, Aegis (Android), Authy o la de tu gestor de contraseñas.</p>
          <button type="button" onClick={empezar} disabled={busy} className="btn-primary w-full sm:w-auto">
            {busy && <Spinner className="h-4 w-4" />} Empezar
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
            <li>Abre tu app y elige «Añadir cuenta» o «Escanear código QR».</li>
            <li>Escanea este código. Si no puedes, escribe la clave a mano.</li>
            <li>Escribe abajo el código de 6 cifras que aparece.</li>
          </ol>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <img src={alta.qr} alt="Código QR para tu app de autenticación" width={220} height={220} className="rounded-xl border border-sand-200 bg-white p-1" />
            <div className="min-w-0 space-y-2 text-sm">
              <p className="label">Clave (si escribes a mano)</p>
              <code className="block break-all rounded-xl bg-sand-100 px-3 py-2 font-mono text-sm tracking-wider text-ink-800">
                {alta.secret.match(/.{1,4}/g)!.join(' ')}
              </code>
              <button type="button" onClick={copiar} className="btn-ghost btn-sm"><Copy className="h-4 w-4" /> Copiar clave</button>
              <p className="text-xs text-ink-400">Guárdala en un sitio seguro: si pierdes el móvil, el 2FA solo se reinicia desde el servidor.</p>
            </div>
          </div>
          {formulario}
        </div>
      )}
    </div>
  );
}
