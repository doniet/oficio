import { useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import type { PuntoMapa } from '../../types';

/**
 * Los negocios de una celda del mapa. Existe porque hasta esta entrega `detras` era solo una
 * insignia: si una celda tenía cinco, veías uno y los otros cuatro eran inalcanzables. Es la
 * misma interacción para el «+N» de un pin y para un área en modo zona.
 *
 * Se monta como hermano del mapa, igual que HojaPunto: así sobrevive a los re-render del mapa.
 */
export default function ListaCelda({ puntos, onElegir, onCerrar }: {
  puntos: PuntoMapa[] | null;
  onElegir(p: PuntoMapa): void;
  onCerrar(): void;
}) {
  const cerrarRef = useRef<HTMLButtonElement | null>(null);

  // Esc cierra, igual que la hoja. El teclado tiene que poder salir de aquí sin el ratón.
  useEffect(() => {
    if (!puntos) return;
    cerrarRef.current?.focus();
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [puntos, onCerrar]);

  if (!puntos) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[500] mx-auto max-h-[70vh] w-full max-w-lg overflow-hidden rounded-t-3xl border border-sand-200 bg-white shadow-lift pb-safe">
      <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-4 py-3">
        <h2 className="font-sans text-base font-bold text-ink-900">
          {puntos.length === 1 ? '1 negocio en esta zona' : `${puntos.length} negocios en esta zona`}
        </h2>
        <button
          ref={cerrarRef}
          type="button"
          onClick={onCerrar}
          className="btn-ghost btn-sm rounded-full p-1.5"
          aria-label="Cerrar la lista"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="max-h-[calc(70vh-3.5rem)] divide-y divide-sand-200 overflow-y-auto">
        {puntos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onElegir(p)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-sand-100"
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
    </div>
  );
}
