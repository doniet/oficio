import { useEffect, useState } from 'react';
import { List, Package, Search as SearchIcon, SlidersHorizontal, Store, Wrench } from 'lucide-react';
import { cn } from '../ui';
import type { Category } from '../../types';

const PESTANAS = [
  ['servicios', 'Servicios', Wrench],
  ['productos', 'Productos', Package],
  ['negocios', 'Negocios', Store],
] as const;

const MARCADORES: Record<string, string> = {
  servicios: 'Electricista, clases de inglés, arreglo de celulares…',
  productos: 'Cake, breaker, zapatos, pintura…',
  negocios: 'Panadería, cafetería, taller…',
};

/**
 * Los controles que flotan sobre el mapa. Solo llevan lo que `/api/mapa` honra de verdad —
 * buscador, pestaña y categoría —: provincia, municipio, precio y orden no los mira ese endpoint,
 * porque el rectángulo visible ya es la ubicación y el mapa no ordena nada.
 *
 * Avisa con los valores tal cual (`tab: 'servicios'`, no `null`): la convención de URL que usa
 * `Search.tsx` para no ensuciar la barra de direcciones la aplica quien consume este componente.
 */
export default function ControlesMapa({ q, tab, category, categorias, conPanel, onBuscar, onCambiar }: {
  q: string;
  tab: string;
  category: string;
  categorias: Category[];
  /** Hay un panel lateral abierto a la izquierda: los controles se apartan para no quedar debajo. */
  conPanel?: boolean;
  onBuscar(q: string): void;
  onCambiar(patch: Record<string, string | null>): void;
}) {
  const [texto, setTexto] = useState(q);
  const [abierto, setAbierto] = useState(false);

  // Si la URL cambia por fuera (Atrás, un enlace compartido), el campo la sigue.
  useEffect(() => { setTexto(q); }, [q]);

  return (
    // pointer-events-none en el contenedor: el mapa sigue recibiendo arrastres a los lados de la
    // tarjeta.
    /* El desplazamiento va con transición: el panel aparece al tocar un punto, y un salto seco de
       la barra de búsqueda en ese momento se lee como un fallo, no como una respuesta.
      La escala de Leaflet (leaflet.css) NO acaba en 400: los paneles van de 200 a 700, pero los
      contenedores de controles (.leaflet-top/.leaflet-bottom, donde viven el zoom y la atribución)
      son z-index 1000. Por eso nada del mapa puede quedarse en 400 o 500 y esperar estar encima:
      el control de zoom se pintaba sobre el panel y recortaba el título de la lista. */
    <div className={cn(
      'pointer-events-none absolute inset-x-0 top-0 z-[1010] p-3 transition-[padding] duration-300',
      conPanel && 'lg:pl-[23.5rem]',
    )}>
      <div className="pointer-events-auto mx-auto w-full max-w-2xl rounded-2xl bg-white/95 p-2 shadow-card backdrop-blur">
        <form
          onSubmit={(e) => { e.preventDefault(); onBuscar(texto.trim()); }}
          className="flex gap-2"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar en el mapa</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={MARCADORES[tab] ?? MARCADORES.servicios}
              className="input py-2 pl-9 text-sm"
            />
          </label>
          <button type="submit" className="btn-primary btn-sm px-4">Buscar</button>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="btn-secondary btn-sm px-3"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="sr-only">Más filtros</span>
          </button>
        </form>

        <div className="mt-2 inline-grid grid-cols-3 gap-1 rounded-2xl bg-sand-100 p-1" role="tablist" aria-label="Qué buscar">
          {PESTANAS.map(([valor, etiqueta, Icono]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={tab === valor}
              onClick={() => onCambiar({ tab: valor })}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition',
                tab === valor ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500',
              )}
            >
              <Icono className="h-4 w-4" /> {etiqueta}
            </button>
          ))}
        </div>

        {abierto && (
          <div className="mt-2 space-y-2 border-t border-sand-200 pt-2">
            <select
              className="input py-2 text-sm"
              value={category}
              onChange={(e) => onCambiar({ category: e.target.value || null })}
              aria-label="Categoría"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <optgroup key={c.id} label={`${c.icon} ${c.name}`}>
                  <option value={c.slug}>Todo en {c.name}</option>
                  {c.subcategories?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
                </optgroup>
              ))}
            </select>
            <button type="button" onClick={() => onCambiar({ vista: null })} className="btn-secondary btn-sm w-full">
              <List className="h-4 w-4" /> Ver en lista
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
