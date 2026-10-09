import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Avatar, cn, ErrorState } from '../ui';
import { CatalogImage, PrecioArticulo } from '../catalog/CatalogCard';
import type { OrdenProductos, ProductoMapa } from '../../types';

export type PropsListaProductos = {
  dentro: ProductoMapa[];
  total: number;
  fuera: ProductoMapa[];
  orden: OrdenProductos;
  onOrden(o: OrdenProductos): void;
  cargando: boolean;
  error: string;
  onReintentar(): void;
  hayMas: boolean;
  cargandoMas: boolean;
  onVerMas(): void;
  onElegir(p: ProductoMapa, deFuera: boolean): void;
  onResaltar?(p: ProductoMapa | null): void;
  /** El último producto tocado: al volver de su ficha, la lista se desplaza hasta él. */
  ultimoElegidoId?: string | null;
};

const ORDENES: [OrdenProductos, string][] = [
  ['relevance', 'Relevancia'],
  ['price_asc', 'Menor precio'],
  ['price_desc', 'Mayor precio'],
];

function Fila({ p, deFuera, onElegir, onResaltar }: {
  p: ProductoMapa; deFuera: boolean; onElegir: PropsListaProductos['onElegir']; onResaltar?: PropsListaProductos['onResaltar'];
}) {
  const lugar = p.municipality_name || p.province_name;
  return (
    <button
      type="button"
      data-producto-id={p.id}
      onClick={() => onElegir(p, deFuera)}
      onMouseEnter={() => onResaltar?.(p)}
      onMouseLeave={() => onResaltar?.(null)}
      className="grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 px-5 py-2 text-left transition hover:bg-brand-50"
    >
      <span className="h-12 w-12 overflow-hidden rounded-lg bg-sand-100"><CatalogImage item={p} /></span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{p.name}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-500">
          {/* El logo de 16 px: Avatar no tiene ese tamaño, se lo fuerza la clase. */}
          <Avatar src={p.provider_avatar} name={p.provider_name} size="xs" className="!h-4 !w-4 !text-[8px]" />
          <span className="truncate">{p.provider_name}</span>
          {deFuera && p.distancia_km != null && (
            <span className="shrink-0 text-ink-400">· {lugar ? `${lugar}, ` : ''}{String(p.distancia_km).replace('.', ',')} km</span>
          )}
        </span>
      </span>
      <span className="text-right tabular-nums"><PrecioArticulo item={p} /></span>
    </button>
  );
}

/**
 * Los productos de la zona visible, como CONTENIDO del panel del mapa (hermano de `ListaCelda` y
 * `FichaPunto`; el envoltorio lo pone `PanelMapa`). Fila compacta: lo que se compara es el precio,
 * así que va solo y alineado a la derecha; el negocio va pequeño debajo del nombre.
 */
export default function ListaProductos({
  tituloId, onCerrar, dentro, total, fuera, orden, onOrden, cargando, error, onReintentar,
  hayMas, cargandoMas, onVerMas, onElegir, onResaltar, ultimoElegidoId,
}: PropsListaProductos & { tituloId: string; onCerrar(): void }) {
  const raiz = useRef<HTMLDivElement>(null);

  // Al volver de la ficha, la lista se monta de nuevo dentro de un contenedor que ya no recuerda
  // su scroll (es del envoltorio, no de aquí): llevarla a la fila tocada es lo que la persona espera.
  useEffect(() => {
    if (!ultimoElegidoId) return;
    raiz.current?.querySelector(`[data-producto-id="${CSS.escape(ultimoElegidoId)}"]`)?.scrollIntoView?.({ block: 'center' });
    // Solo al montar: con cada «Ver más» no hay que volver a saltar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={raiz}>
      <div className="-mx-5 mb-1 border-b border-sand-200 px-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={tituloId} className="font-sans text-base font-bold text-ink-900">
              {total === 1 ? '1 producto en esta zona' : `${total} productos en esta zona`}
            </h2>
            <p className="text-xs text-ink-400">Mueve el mapa para ver otros</p>
          </div>
          <button type="button" onClick={onCerrar} className="btn-ghost btn-sm rounded-full p-1.5" aria-label="Cerrar la lista de productos">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="Ordenar productos">
          {ORDENES.map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={orden === valor}
              onClick={() => onOrden(valor)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition',
                orden === valor ? 'border-ink-900 bg-ink-900 text-white' : 'border-sand-300 bg-white text-ink-500 hover:border-ink-300',
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="py-2"><ErrorState message={error} onRetry={onReintentar} /></div>}

      {cargando ? (
        <div className="space-y-3 py-2" role="status" aria-label="Buscando productos">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-12 w-12 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2"><div className="skeleton h-4 w-4/5 rounded" /><div className="skeleton h-3 w-1/3 rounded" /></div>
              <div className="skeleton h-4 w-14 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {dentro.length === 0 && !error && <p className="py-3 text-sm text-ink-500">No hay productos en esta zona.</p>}
          <ul className="-mx-5 divide-y divide-sand-200">
            {dentro.map((p) => <li key={p.id}><Fila p={p} deFuera={false} onElegir={onElegir} onResaltar={onResaltar} /></li>)}
          </ul>
          {hayMas && (
            <button type="button" onClick={onVerMas} disabled={cargandoMas} className="btn-secondary btn-sm mt-3 w-full">
              Ver más productos
            </button>
          )}

          {fuera.length > 0 && (
            <section aria-label={`Fuera de esta zona · ${fuera.length}`} className="-mx-5 mt-3">
              <div className="border-y border-sand-200 bg-sand-100 px-5 py-2.5">
                <p className="text-sm font-bold text-ink-900">Fuera de esta zona · {fuera.length}</p>
                <p className="text-xs text-ink-400">Toca uno y el mapa se amplía para incluirlo</p>
              </div>
              <ul className="divide-y divide-sand-200">
                {fuera.map((p) => <li key={p.id}><Fila p={p} deFuera onElegir={onElegir} onResaltar={onResaltar} /></li>)}
              </ul>
            </section>
          )}

          {orden !== 'relevance' && (dentro.length > 0 || fuera.length > 0) && (
            <p className="pt-3 text-xs text-ink-400">Los precios en USD se comparan a la tasa de referencia. «A consultar» va al final.</p>
          )}
        </>
      )}
    </div>
  );
}
