import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';
import { apiError, dardoventasApi } from '../../../services/api';
import { relativeTime } from '../../../lib/format';
import type { EstadoDardoVentas as Estado } from '../../../types';
import { ConfirmDialog } from '../../../pages/dashboard/parts';

/** Solo se pinta si el catálogo está conectado: conectar se empieza desde mi.dardoventas.com. */
export default function EstadoDardoVentas({ onCambio }: { onCambio: () => void }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { dardoventasApi.estado().then((r) => setEstado(r.data)).catch(() => {}); }, []);
  if (!estado?.vinculado) return null;

  const desconectar = async () => {
    setBusy(true);
    try {
      await dardoventasApi.desvincular();
      setEstado({ ...estado, vinculado: false });
      toast('Catálogo de DardoVentas desconectado');
      onCambio();
    } catch (err) {
      toast(apiError(err, 'No se pudo desconectar.'), 'error');
    } finally {
      setBusy(false);
      setConfirmar(false);
    }
  };

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <Store className="h-5 w-5 shrink-0 text-sea-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-ink-900">Conectado con DardoVentas</span>
        <span className="text-ink-500">
          {' · '}{estado.articulos} {estado.articulos === 1 ? 'artículo' : 'artículos'}
          {estado.synced_at ? ` · actualizado ${relativeTime(estado.synced_at)}` : ' · importando…'}
        </span>
      </p>
      <button type="button" onClick={() => setConfirmar(true)} className="btn-ghost btn-sm text-red-600 hover:bg-red-50">Desconectar</button>
      <ConfirmDialog
        open={confirmar}
        title="¿Desconectar DardoVentas?"
        confirmLabel="Sí, desconectar"
        busy={busy}
        onConfirm={desconectar}
        onClose={() => setConfirmar(false)}
      >
        Se quitarán de tu catálogo los artículos que vienen de tu punto de venta. Los que añadiste tú se quedan.
      </ConfirmDialog>
    </div>
  );
}
