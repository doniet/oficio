import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { PageLoader } from '../ui';
import ControlesMapa from './ControlesMapa';
import PanelMapa from './PanelMapa';
import type { PropsListaProductos } from './ListaProductos';
import { usarEsEscritorio } from './usarPanel';
import { usarProductosMapa } from './usarProductosMapa';
import type { Bbox, Category, OrdenProductos, ProductoMapa, PuntoMapa } from '../../types';

// Leaflet pesa ~150 KB: solo se descarga si el usuario abre el mapa.
const MapaExplorar = lazy(() => import('./MapaExplorar'));

/** El ancho del panel lateral en px. Tiene que seguir cuadrando con el `w-[22rem]` de PanelLateral. */
export const ANCHO_PANEL_PX = 352;
/** Holgura entre el borde del panel y el punto, para que no quede pegado. */
const MARGEN_PANEL_PX = 32;
const ORDENES: OrdenProductos[] = ['relevance', 'price_asc', 'price_desc'];

/**
 * La vista de mapa de /explorar: el mapa ES la página. Dueño del layout a sangre y del estado del
 * panel. Vive aparte de `Search.tsx` porque esa página ya lleva tres pestañas, dos vistas, el
 * formulario, la barra de filtros de escritorio, el cajón móvil y los chips: meterle un segundo
 * layout completo la habría llevado por encima de 800 líneas con un `enMapa ?` en cada rama.
 */
export default function ExplorarMapa({ get, update, categorias }: {
  get(k: string): string;
  update(patch: Record<string, string | null>, opts?: { replace?: boolean }): void;
  categorias: Category[];
}) {
  const [punto, setPunto] = useState<PuntoMapa | null>(null);
  const [lista, setLista] = useState<PuntoMapa[] | null>(null);
  const [listaPrevia, setListaPrevia] = useState<PuntoMapa[] | null>(null);
  const [errorLista, setErrorLista] = useState('');
  // Cómo volver a pedir la celda que falló. Lo entrega el mapa, que es quien sabe pedirla.
  const [reintentarLista, setReintentarLista] = useState<(() => void) | null>(null);
  const [zona, setZona] = useState<Bbox | null>(null);
  const [verProductos, setVerProductos] = useState(false);
  // El producto tocado: marca su fila al volver y va primero en la ficha de su negocio.
  const [productoMarcado, setProductoMarcado] = useState<ProductoMapa | null>(null);
  // La ficha abierta salió de la lista de productos (y no de un pin o de una celda): solo entonces
  // ofrece volver a ella. `productoMarcado` sobrevive a la vuelta para desplazar la lista.
  const [fichaDeProductos, setFichaDeProductos] = useState(false);
  const [resaltado, setResaltado] = useState<{ id: string; lat: number; lng: number } | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const esEscritorio = usarEsEscritorio();

  const tab = get('tab') || 'servicios';
  const category = get('category');
  const q = get('q');
  const orden = (ORDENES as string[]).includes(get('orden')) ? (get('orden') as OrdenProductos) : 'relevance';
  const productos = usarProductosMapa({ zona, q, category, sort: orden, activo: tab === 'productos' });

  // Cambiar de pestaña o de categoría cierra el panel: el punto abierto puede no pertenecer a la
  // pestaña nueva, y dejarlo ahí mostraría algo que ya no está en el mapa.
  useEffect(() => {
    setPunto(null);
    setLista(null);
    setListaPrevia(null);
    setErrorLista('');
    setVerProductos(tab === 'productos');
    setProductoMarcado(null);
    setResaltado(null);
  }, [tab, category]);

  // Una búsqueda nueva vuelve a la lista aunque hubiera una ficha abierta.
  useEffect(() => {
    if (tab !== 'productos') return;
    setPunto(null);
    setLista(null);
    setListaPrevia(null);
    setProductoMarcado(null);
    setVerProductos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // El mapa avisa que la pestaña activa se quedó sin resultados: se salta a la que propone,
  // con la misma convención de URL que el resto de aquí (`servicios` no ensucia la barra).
  const alAgotarPestaña = useCallback((siguiente: string) => {
    update({ tab: siguiente === 'servicios' ? null : siguiente });
  }, [update]);

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

  // Para un producto de fuera: alejar lo justo para que su negocio entre, sin perder lo que se
  // veía. Aquí SÍ cambia el zoom (a diferencia de apartarDelPanel): la zona tiene que crecer.
  const ampliarHasta = useCallback((p: { lat: number; lng: number }) => {
    const m = mapRef.current;
    if (!m) return;
    const altoHoja = esEscritorio ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hoja-punto-alto')) || 0;
    m.flyToBounds(m.getBounds().extend([p.lat, p.lng]), {
      paddingTopLeft: [esEscritorio ? ANCHO_PANEL_PX + MARGEN_PANEL_PX : 16, 120],
      paddingBottomRight: [16, altoHoja + 16],
      duration: 0.6,
    });
  }, [esEscritorio]);

  const abrirPunto = useCallback((p: PuntoMapa) => {
    setProductoMarcado(null);
    setFichaDeProductos(false);
    setLista(null);
    setErrorLista('');
    setPunto(p);
    apartarDelPanel(p);
  }, [apartarDelPanel]);

  const abrirLista = useCallback((ps: PuntoMapa[], error?: string, reintentar?: () => void) => {
    setFichaDeProductos(false);
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
    setFichaDeProductos(false);
    setLista(null);
    setPunto(p);
    apartarDelPanel(p);
  }, [lista, apartarDelPanel]);

  const volverALista = useCallback(() => {
    setPunto(null);
    setLista(listaPrevia);
    setListaPrevia(null);
  }, [listaPrevia]);

  const elegirProducto = useCallback((p: ProductoMapa, deFuera: boolean) => {
    const negocio: PuntoMapa = {
      id: p.provider_id, tipo: p.tipo, nombre: p.provider_name, lat: p.lat, lng: p.lng,
      plan: p.subscription_plan,
      aproximado: p.aproximado, detras: 0, cy: 0, cx: 0, resumen: '',
    };
    setResaltado(null);
    setProductoMarcado(p);
    setFichaDeProductos(true);
    setLista(null);
    setListaPrevia(null);
    setPunto(negocio);
    if (deFuera) ampliarHasta(negocio); else apartarDelPanel(negocio);
  }, [ampliarHasta, apartarDelPanel]);

  const volverAProductos = useCallback(() => { setPunto(null); }, []);

  const cerrarPanel = useCallback(() => {
    setVerProductos(false);
    setResaltado(null);
    setPunto(null);
    setLista(null);
    setListaPrevia(null);
    setErrorLista('');
  }, []);

  // Hay panel lateral tapando la izquierda del mapa. Lo miran dos: los controles flotantes, que se
  // apartan a su derecha, y el CSS del control de zoom, que vive abajo a la izquierda — es decir,
  // debajo del panel — y sin apartarse deja de recibir clics.
  const desdeProductos = Boolean(fichaDeProductos && punto && productoMarcado && punto.id === productoMarcado.provider_id);
  const panelProductos: PropsListaProductos | null = tab === 'productos' && verProductos ? {
    dentro: productos.dentro, total: productos.total, fuera: productos.fuera,
    orden, onOrden: (o) => update({ orden: o === 'relevance' ? null : o }, { replace: true }),
    cargando: productos.cargando, error: productos.error, onReintentar: productos.reintentar,
    hayMas: productos.hayMas, cargandoMas: productos.cargandoMas, onVerMas: productos.verMas,
    onElegir: elegirProducto,
    onResaltar: esEscritorio ? (p) => setResaltado(p ? { id: p.provider_id, lat: p.lat, lng: p.lng } : null) : undefined,
    ultimoElegidoId: productoMarcado?.id ?? null,
  } : null;
  const hayProductos = productos.total > 0 || productos.fuera.length > 0;
  const conPanel = esEscritorio && Boolean(punto || lista || panelProductos);

  return (
    <div className={`region-mapa relative w-full overflow-hidden${conPanel ? ' region-mapa--con-panel' : ''}`}>
      <Suspense fallback={<PageLoader />}>
        <MapaExplorar
          tab={tab}
          q={q}
          category={category}
          seleccionado={punto ?? resaltado}
          alMapa={(m) => { mapRef.current = m; }}
          onAbrir={abrirPunto}
          onAbrirLista={abrirLista}
          onCerrarPanel={cerrarPanel}
          onAgotada={alAgotarPestaña}
          onZona={setZona}
        />
      </Suspense>

      <ControlesMapa
        q={get('q')}
        tab={tab}
        category={category}
        categorias={categorias}
        conPanel={conPanel}
        onBuscar={(q) => update({ q: q || null })}
        // `servicios` se manda como null: es la convención de URL de Search.tsx para no ensuciar
        // la barra de direcciones. ControlesMapa no tiene por qué conocerla.
        onCambiar={(patch) => update('tab' in patch && patch.tab === 'servicios' ? { ...patch, tab: null } : patch)}
      />

      <PanelMapa
        punto={punto}
        lista={lista}
        productos={panelProductos}
        tab={tab}
        q={q}
        errorLista={errorLista || undefined}
        onReintentarLista={reintentarLista ? () => { setErrorLista(''); reintentarLista(); } : undefined}
        onElegirDeLista={elegirDeLista}
        productoMarcado={desdeProductos ? productoMarcado : null}
        etiquetaVolver={desdeProductos ? `${productos.total} ${productos.total === 1 ? 'producto' : 'productos'}` : undefined}
        onVolverALista={listaPrevia ? volverALista : desdeProductos ? volverAProductos : undefined}
        onCerrar={cerrarPanel}
      />

      {/* Cerrada la lista, que no se pierda: en móvil la hoja tapa medio mapa y es normal cerrarla
          para mirar; reabrirla no puede exigir volver a buscar. */}
      {tab === 'productos' && !verProductos && !punto && !lista && hayProductos && (
        <button
          type="button"
          onClick={() => setVerProductos(true)}
          className="btn-primary btn-sm absolute bottom-4 left-1/2 z-[1015] -translate-x-1/2 shadow-lift"
        >
          {productos.total > 0 ? `Ver ${productos.total} ${productos.total === 1 ? 'producto' : 'productos'}` : 'Ver productos cercanos'}
        </button>
      )}
    </div>
  );
}
