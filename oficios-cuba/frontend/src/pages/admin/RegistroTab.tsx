import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiError } from '../../services/api';
import { adminApi } from '../../services/adminApi';
import type { AdminAuditEntry } from '../../types';
import { ErrorState, PageLoader, cn } from '../../components/ui';
import { fechaHora } from './parts';

const ACCIONES: Record<string, { texto: string; alerta?: boolean }> = {
  entrada_panel: { texto: 'Entró al panel' },
  '2fa_activado': { texto: 'Activó la verificación en dos pasos' },
  '2fa_fallido': { texto: 'Código de verificación incorrecto', alerta: true },
  '2fa_reiniciado': { texto: 'Se reinició su 2FA (servidor)', alerta: true },
  telegram_token_cambiado: { texto: 'Cambió el token del bot de Telegram' },
  telegram_token_borrado: { texto: 'Quitó el token del bot de Telegram', alerta: true },
  admin_dado: { texto: 'Recibió permisos de administrador (servidor)' },
  admin_quitado: { texto: 'Perdió los permisos de administrador (servidor)', alerta: true },
};

export default function RegistroTab() {
  const [entries, setEntries] = useState<AdminAuditEntry[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setEntries((await adminApi.audit()).data.entries);
      setError('');
    } catch (err) {
      setError(apiError(err, 'No se pudo leer el registro.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!entries) return error ? <ErrorState message={error} onRetry={load} /> : <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Registro de acciones</h2>
        <button type="button" onClick={load} className="btn-secondary btn-sm"><RefreshCw className="h-4 w-4" /> Refrescar</button>
      </div>
      {entries.length === 0 ? (
        <p className="card p-4 text-sm text-ink-400">Todavía no hay acciones registradas.</p>
      ) : (
        <ul className="card divide-y divide-sand-200">
          {entries.map((e, i) => {
            const a = ACCIONES[e.action] ?? { texto: e.action };
            return (
              <li key={i} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-start sm:gap-4">
                <span className="w-32 shrink-0 text-xs text-ink-400">{fechaHora(e.created_at)}</span>
                <div className="min-w-0 flex-1">
                  <p className={cn('font-semibold', a.alerta ? 'text-red-700' : 'text-ink-800')}>{a.texto}{e.detail && <span className="font-normal text-ink-500"> — {e.detail}</span>}</p>
                  <p className="break-all text-xs text-ink-400">{e.email ?? 'usuario borrado'}{e.ip && ` · IP ${e.ip}`}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
