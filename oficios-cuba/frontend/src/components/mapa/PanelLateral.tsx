import { useRef } from 'react';
import { usarPanel, type PropsEnvoltorio } from './usarPanel';

/**
 * El envoltorio de ESCRITORIO del panel del mapa: una tarjeta fija a la izquierda, sobre el mapa.
 * No se arrastra ni tiene dos alturas — hay sitio de sobra —, así que todo lo suyo es colocación:
 * la conducta compartida está en `usarPanel`.
 *
 * Su ancho tiene que seguir cuadrando con `ANCHO_PANEL_PX` de `ExplorarMapa.tsx`, que es lo que el
 * paneo usa para saber qué zona del mapa queda tapada.
 */
export default function PanelLateral({ abierta, tituloId, onCerrar, focoOrigen, children }: PropsEnvoltorio) {
  const ref = useRef<HTMLDivElement>(null);
  const { cerrar, limpiarEntradaPropia } = usarPanel({ abierta, onCerrar, focoOrigen, contenedorRef: ref });

  if (!abierta) return null;

  return (
    <div
      ref={ref}
      data-testid="panel-lateral"
      role="dialog"
      // aria-modal="false" a propósito, al revés que la hoja móvil: el mapa a su derecha sigue
      // siendo usable, y decir "true" le mentiría a un lector de pantalla sobre lo que puede tocar.
      aria-modal="false"
      aria-labelledby={tituloId}
      tabIndex={-1}
      className="absolute bottom-4 left-4 top-4 z-[500] flex w-[22rem] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-lift outline-none"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {children({ expandida: true, onAntesDeNavegar: limpiarEntradaPropia, cerrar })}
      </div>
    </div>
  );
}
