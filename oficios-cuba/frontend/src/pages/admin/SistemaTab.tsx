import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiError } from '../../services/api';
import { adminApi } from '../../services/adminApi';
import type { AdminSystem } from '../../types';
import { ErrorState, PageLoader, Spinner, cn } from '../../components/ui';
import { Stat, bytes, duracion } from './parts';

export default function SistemaTab() {
  const [data, setData] = useState<AdminSystem | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData((await adminApi.system()).data);
    } catch (err) {
      setError(apiError(err, 'No se pudo leer el estado del sistema.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return error ? <ErrorState message={error} onRetry={load} /> : <PageLoader />;

  const libre = data.disk.total_bytes ? data.disk.free_bytes / data.disk.total_bytes : 1;
  const c = data.counts;
  const d = data.app_downloads;
  const esquemaOk = data.schema_version === data.schema_expected;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Estado del sistema</h2>
        <button type="button" onClick={load} disabled={loading} className="btn-secondary btn-sm">
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Refrescar
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Esquema de la base" value={`v${data.schema_version}`} tone={esquemaOk ? undefined : 'bad'}
          hint={esquemaOk ? 'Al día' : `El código espera la v${data.schema_expected}`} />
        <Stat label="Modo" value={data.demo_mode ? <span className="badge bg-amber-100 text-amber-800">DEMO activo</span> : 'Producción'}
          tone={data.demo_mode ? 'warn' : undefined} hint={data.demo_mode ? 'Cuentas públicas y pagos simulados' : undefined} />
        <Stat label="Node" value={data.node} />
        <Stat label="Encendida" value={duracion(data.uptime_s)} hint="Desde el último arranque de la API" />
        <Stat label="Base de datos" value={bytes(data.db_bytes)} />
        <Stat label="Fotos subidas" value={bytes(data.uploads.bytes)} hint={`${data.uploads.files.toLocaleString('es-ES')} archivos`} />
        <div className={cn('card col-span-2 p-4', libre < 0.1 && 'ring-1 ring-red-300')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Disco del servidor</p>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">{bytes(data.disk.free_bytes)} libres <span className="text-sm font-normal text-ink-400">de {bytes(data.disk.total_bytes)}</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={Math.round((1 - libre) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Disco usado">
            <div className={cn('h-full rounded-full', libre < 0.1 ? 'bg-red-500' : libre < 0.2 ? 'bg-amber-500' : 'bg-sea-500')} style={{ width: `${Math.round((1 - libre) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-500">{Math.round((1 - libre) * 100)} % usado{libre < 0.1 && ' — hay que liberar espacio'}</p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-bold">Contenido</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Usuarios" value={c.users} hint={`${c.clients} clientes`} />
          <Stat label="Profesionales" value={c.providers_free + c.providers_basic + c.providers_pro}
            hint={`Gratis ${c.providers_free} · Básico ${c.providers_basic} · Profesional ${c.providers_pro}`} />
          <Stat label="Oficios publicados" value={c.services} />
          <Stat label="Artículos de catálogo" value={c.catalog_items} />
          <Stat label="Citas próximas" value={c.appointments_upcoming} />
          <Stat label="Pagos pendientes" value={c.pending_payments} tone={c.pending_payments ? 'warn' : undefined}
            hint={c.pending_payments ? 'Se confirman con npm run pagos en el servidor' : undefined} />
          <Stat label="Descargas de la app" value={d.total.toLocaleString('es-ES')}
            hint={d.total ? `${d.last7d.toLocaleString('es-ES')} en 7 días${d.by_version.length > 1 ? ` · ${d.by_version.map((v) => `v${v.version}: ${v.n}`).join(' · ')}` : ` · v${d.by_version[0].version}`}` : 'APK de Android desde la web'} />
        </div>
      </div>
    </div>
  );
}
