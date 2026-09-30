import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { PageLoader } from '../ui';
import ControlesMapa from './ControlesMapa';
import PanelMapa from './PanelMapa';
import { usarEsEscritorio } from './usarPanel';
import type { Category, PuntoMapa } from '../../types';

// Leaflet pesa ~150 KB: solo se descarga si el usuario abre el mapa.
const MapaExplorar = lazy(() => import('./MapaExplorar'));

/** El ancho del panel lateral en px. Tiene que seguir cuadrando con el `w-[22rem]` de PanelLateral. */
export const ANCHO_PANEL_PX = 352;
/** Holgura entre el borde del panel y el punto, para que no quede pegado. */
const MARGEN_PANEL_PX = 32;

/**
 * La vista de mapa de /explorar: el mapa ES la página. Dueño del layout a sangre y del estado del
 * panel. Vive aparte de `Search.tsx` porque esa página ya lleva tres pestañas, dos vistas, el
 * formulario, la barra de filtros de escritorio, el cajón móvil y los chips: meterle un segundo
 * layout completo la habría llevado por encima de 800 líneas con un `enMapa ?` en cada rama.
 */
export default function ExplorarMapa({ get, update, categorias }: {
  get(k: string): string;
  update(patch: Record<string, string | null>): void;
  categorias: Category[];
}) {
  const [punto, setPunto] = useState<PuntoMapa | null>(null);
  const [lista, setLista] = useState<PuntoMapa[] | null>(null);
  const [listaPrevia, setListaPrevia] = useState<PuntoMapa[] | null>(null);
  const [errorLista, setErrorLista] = useState('');
  // Cómo volver a pedir la celda que falló. Lo entrega el mapa, que es quien sabe pedirla.
  const [reintentarLista, setReintentarLista] = useState<(() => void) | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const esEscritorio = usarEsEscritorio();

  const tab = get('tab') || 'servicios';
  const category = get('category');

  // Cambiar de pestaña o de categoría cierra el panel: el punto abierto puede no pertenecer a la
  // pestaña nueva, y dejarlo ahí mostraría algo que ya no está en el mapa.
  useEffect(() => {
    setPunto(null);
    setLista(null);
    setListaPrevia(null);
    setErrorLista('');
  }, [tab, category]);

  // Saca el punto elegido de debajo del panel. `panBy` y NO `flyTo`/`setZoom`: cambiar el zoom
  // cambia el tamaño de celda que calcula el servidor, y el punto recién tocado podría
  // reagruparse bajo los pies del usuario. Un paneo solo cambia el rectángulo, y para eso ya
  // está el antirrebote de usarMapa.
  const apartarDelPanel = useCallback((p: PuntoMapa) => {
    const m = mapRef.current;
    if (!m || !esEscritorio) return;
    const pt = m.latLngToContainerPoint([p.lat, p.lng]);
    const margen = ANCHO_PANEL_PX + MARGEN_PANEL_PX;
    if (pt.x < margen) m.panBy([pt.x - margen, 0], { animate: true });
  }, [esEscritorio]);

  const abrirPunto = useCallback((p: PuntoMapa) => {
    setLista(null);
    setErrorLista('');
    setPunto(p);
    apartarDelPanel(p);
  }, [apartarDelPanel]);

  const abrirLista = useCallback((ps: PuntoMapa[], error?: string, reintentar?: () => void) => {
    setPunto(null);
    setListaPrevia(null);
    setErrorLista(error ?? '');
    // El envoltorio de función es obligatorio: setState interpreta una función suelta como
    // actualizador y llamaría al reintento en vez de guardarlo.
    setReintentarLista(() => reintentar ?? null);
    setLista(ps);
  }, []);

  const elegirDeLista = useCallback((p: PuntoMapa) => {
    // Se recuerda la lista para poder volver a ella sin pedirla otra vez.
    setListaPrevia(lista);
    setLista(null);
    setPunto(p);
    apartarDelPanel(p);
  }, [lista, apartarDelPanel]);

  const volverALista = useCallback(() => {
    setPunto(null);
    setLista(listaPrevia);
    setListaPrevia(null);
  }, [listaPrevia]);

  const cerrarPanel = useCallback(() => {
    setPunto(null);
    setLista(null);
    setListaPrevia(null);
    setErrorLista('');
  }, []);

  return (
    <div className="region-mapa relative w-full overflow-hidden">
      <Suspense fallback={<PageLoader />}>
        <MapaExplorar
          tab={tab}
          q={get('q')}
          category={category}
          alMapa={(m) => { mapRef.current = m; }}
          onAbrir={abrirPunto}
          onAbrirLista={abrirLista}
        />
      </Suspense>

      <ControlesMapa
        q={get('q')}
        tab={tab}
        category={category}
        categorias={categorias}
        conPanel={esEscritorio && Boolean(punto || lista)}
        onBuscar={(q) => update({ q: q || null })}
        // `servicios` se manda como null: es la convención de URL de Search.tsx para no ensuciar
        // la barra de direcciones. ControlesMapa no tiene por qué conocerla.
        onCambiar={(patch) => update('tab' in patch && patch.tab === 'servicios' ? { ...patch, tab: null } : patch)}
      />

      <PanelMapa
        punto={punto}
        lista={lista}
        errorLista={errorLista || undefined}
        onReintentarLista={reintentarLista ? () => { setErrorLista(''); reintentarLista(); } : undefined}
        onElegirDeLista={elegirDeLista}
        onVolverALista={listaPrevia ? volverALista : undefined}
        onCerrar={cerrarPanel}
      />
    </div>
  );
}
