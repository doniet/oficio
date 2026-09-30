import { MapPin, X } from 'lucide-react';
import type { PuntoMapa } from '../../types';

/**
 * Los negocios de una celda del mapa, como CONTENIDO del panel: el envoltorio (hoja en móvil,
 * panel lateral en escritorio) lo pone `PanelMapa`, igual que con la ficha.
 *
 * Existe porque `detras` era solo una insignia: si una celda tenía cinco, veías uno y los otros
 * cuatro eran inalcanzables. Es la misma interacción para el «+N» de un pin y para un área en
 * modo zona.
 */
export default function ListaCelda({ puntos, tituloId, onElegir, onCerrar, error, onReintentar }: {
  puntos: PuntoMapa[];
  tituloId: string;
  onElegir(p: PuntoMapa): void;
  onCerrar(): void;
  /** Mensaje si la celda no se pudo cargar. Con él se pinta «Reintentar». */
  error?: string;
  onReintentar?: () => void;
}) {
  return (
    <>
      <div className="-mx-5 mb-3 flex items-center justify-between gap-3 border-b border-sand-200 px-5 py-3">
        <h2 id={tituloId} className="font-sans text-base font-bold text-ink-900">
          {error
            ? 'Negocios de esta zona'
            : puntos.length === 1 ? '1 negocio en esta zona' : `${puntos.length} negocios en esta zona`}
        </h2>
        <button type="button" onClick={onCerrar} className="btn-ghost btn-sm rounded-full p-1.5" aria-label="Cerrar la lista">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sin esto, un fallo de red deja al usuario mirando una lista vacía sin saber si la zona
          está vacía o si algo se rompió. No es lo mismo y no puede parecerlo. */}
      {error && (
        <p className="px-1 py-2 text-sm text-red-700" role="alert">
          {error}{' '}
          <button type="button" onClick={onReintentar} className="font-semibold underline decoration-2 underline-offset-2">
            Reintentar
          </button>
        </p>
      )}

      <ul className="-mx-5 divide-y divide-sand-200">
        {puntos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onElegir(p)}
              className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-sand-100"
            >
              <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${p.plan === 'pro' ? 'text-brand-600' : 'text-ink-400'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink-900">{p.nombre}</span>
                {p.resumen && <span className="block truncate text-sm text-ink-500">{p.resumen}</span>}
              </span>
              {/* Que se sepa cuál es aproximado ANTES de entrar: si no, el usuario los lee a
                  todos como direcciones exactas y solo se entera al abrir uno. */}
              {p.aproximado && (
                <span className="shrink-0 self-center rounded-full border border-dashed border-brand-600/60 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                  Zona
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
