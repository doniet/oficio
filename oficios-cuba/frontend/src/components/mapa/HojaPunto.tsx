import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usarTrampaFoco, type PropsEnvoltorio } from './usarPanel';

// Nombre de la variable CSS que expone cuánto de la parte de abajo del viewport ocupa la
// hoja ahora mismo (en px; "0px" cuando está cerrada). El mapa la lee para recolocar el botón
// «Cerca de mí» por encima — ver el comentario al final del archivo.
const VAR_ALTO_HOJA = '--hoja-punto-alto';

const ALTO_ABIERTA_VH = 85;
// Bastante más que un asomo: tiene que caber ya la portada y la cabecera —lo que antes solo se
// veía al desplegar del todo— sin que el usuario tenga que adivinar que hay que arrastrar para
// ver algo más que el nombre. Deja igual la mitad de la pantalla larga para seguir viendo el mapa.
const ALTO_ASOMADA_VH = 55;
// Distancia mínima de arrastre (px) para que cuente como arrastre y no como toque en el asa.
const UMBRAL_TOQUE = 6;
// Cuánto hay que pasarse de "asomada" arrastrando hacia abajo para que la hoja se cierre.
const HOLGURA_CIERRE = 60;
// Rebote permitido arrastrando hacia arriba, más allá de "abierta" del todo (sensación de tope
// blando en vez de un corte seco).
const REBOTE_ARRIBA = 24;
// Cuánto se deja arrastrar hacia abajo pasado el umbral de cierre antes de topar del todo
// (algo de margen visual mientras `terminarArrastre` decide si cierra).
const REBOTE_CIERRE = 80;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

type Posicion = 'asomada' | 'abierta';

/**
 * El envoltorio MÓVIL del panel del mapa: una hoja que sale desde abajo, se arrastra entre dos
 * alturas y se cierra tirando de ella. Su contenido lo pone quien la monta (`PanelMapa`), que es
 * lo que permite que sirva tanto para la ficha de un punto como para la lista de una celda.
 *
 * Lo que comparte con el panel lateral —historial, Esc, foco, scroll— vive en `usarPanel`.
 * Lo que es solo suyo —el arrastre, las dos alturas y `--hoja-punto-alto`— vive aquí.
 */
export default function HojaPunto({ abierta, tituloId, cerrar, onAntesDeNavegar, children }: PropsEnvoltorio) {
  const [posicion, setPosicion] = useState<Posicion>('asomada');
  const [offsetArrastre, setOffsetArrastre] = useState<number | null>(null);
  // Fuerza a recalcular las anclas (en px) si cambia el tamaño de la ventana.
  const [, tocar] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<{ inicioY: number } | null>(null);
  const huboArrastreRef = useRef(false);

  // Degradado + flecha en el borde inferior: dicen "hay más si sigues bajando" sin que haya que
  // arrastrar a ciegas para descubrirlo. Antes se medía scrollHeight/clientHeight (vía
  // ResizeObserver) para saber si "de verdad" sobraba contenido, pero eso tarda en reflejar el
  // primer toque — el perfil carga asíncrono, y el aviso aparecía recién al abrir un SEGUNDO
  // punto. Como "asomada" (55vh) nunca alcanza para portada + cabecera + lo que hay debajo de
  // "Ver perfil completo" (rating, descripción, acordeones…), basta con la posición: es síncrono,
  // así que sale desde el primer toque, sin esperar ninguna medida real del DOM.
  const hayMasAbajo = posicion === 'asomada';

  // La hoja tapa la pantalla entera: aquí atrapar el foco es lo correcto.
  usarTrampaFoco(sheetRef, abierta);

  // Al abrir algo nuevo, la hoja vuelve a asomarse: nadie espera que un punto distinto aparezca
  // ya desplegado a pantalla casi completa.
  useEffect(() => {
    if (abierta) setPosicion('asomada');
  }, [abierta]);

  useEffect(() => {
    const onResize = () => tocar((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const altoVentana = typeof window !== 'undefined' ? window.innerHeight : 800;
  const altoAbierta = Math.round((altoVentana * ALTO_ABIERTA_VH) / 100);
  const altoAsomada = Math.round((altoVentana * ALTO_ASOMADA_VH) / 100);
  const offsetAsomada = altoAbierta - altoAsomada;
  const offsetBase = posicion === 'abierta' ? 0 : offsetAsomada;
  const offsetActual = offsetArrastre === null
    ? offsetBase
    : clamp(offsetBase + offsetArrastre, -REBOTE_ARRIBA, offsetAsomada + HOLGURA_CIERRE + REBOTE_CIERRE);

  // Comunica al mapa (fuera de nuestro control) cuánto tapa la hoja ahora mismo.
  useEffect(() => {
    const altoVisible = abierta ? Math.max(0, altoAbierta - offsetActual) : 0;
    document.documentElement.style.setProperty(VAR_ALTO_HOJA, `${Math.round(altoVisible)}px`);
  }, [abierta, altoAbierta, offsetActual]);

  useEffect(() => () => { document.documentElement.style.removeProperty(VAR_ALTO_HOJA); }, []);

  const onAsaPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { inicioY: e.clientY };
    huboArrastreRef.current = false;
    setOffsetArrastre(0);
  };
  const onAsaPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!arrastreRef.current) return;
    const delta = e.clientY - arrastreRef.current.inicioY;
    if (Math.abs(delta) > UMBRAL_TOQUE) huboArrastreRef.current = true;
    setOffsetArrastre(delta);
  };
  const terminarArrastre = () => {
    if (!arrastreRef.current) return;
    const delta = offsetArrastre ?? 0;
    arrastreRef.current = null;
    setOffsetArrastre(null);
    if (!huboArrastreRef.current) return; // fue un toque: lo resuelve el onClick del asa
    const final = offsetBase + delta;
    if (final > offsetAsomada + HOLGURA_CIERRE) { cerrar(); return; }
    setPosicion(final > offsetAsomada / 2 ? 'asomada' : 'abierta');
  };
  const onAsaClick = () => {
    if (huboArrastreRef.current) { huboArrastreRef.current = false; return; }
    setPosicion((p) => (p === 'abierta' ? 'asomada' : 'abierta'));
  };

  if (!abierta) return null;

  return (
    /* pointer-events-none: el mapa detrás sigue recibiendo toques salvo bajo la propia hoja.
      La escala de Leaflet (leaflet.css) NO acaba en 400: los paneles van de 200 a 700, pero los
      contenedores de controles (.leaflet-top/.leaflet-bottom, donde viven el zoom y la atribución)
      son z-index 1000. Por eso nada del mapa puede quedarse en 400 o 500 y esperar estar encima:
      el control de zoom se pintaba sobre el panel y recortaba el título de la lista.
       Por encima también de la barra flotante (1010) y del botón «Cerca de mí»: la variable CSS
       --hoja-punto-alto no sirve de nada si el botón, aun recolocado, se pinta sobre la hoja. */
    <div className="pointer-events-none fixed inset-0 z-[1020]">
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="pointer-events-auto fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift outline-none"
        style={{
          height: `${altoAbierta}px`,
          transform: `translateY(${offsetActual}px)`,
          transition: offsetArrastre === null ? 'transform .32s cubic-bezier(.2,.7,.2,1)' : 'none',
        }}
      >
        <button
          type="button"
          onClick={onAsaClick}
          onPointerDown={onAsaPointerDown}
          onPointerMove={onAsaPointerMove}
          onPointerUp={terminarArrastre}
          onPointerCancel={terminarArrastre}
          aria-label={posicion === 'abierta' ? 'Recoger la ficha' : 'Ver la ficha completa'}
          className="flex w-full shrink-0 cursor-grab touch-none items-center justify-center py-2.5 active:cursor-grabbing"
        >
          <span className="h-1.5 w-10 rounded-full bg-sand-300" aria-hidden="true" />
        </button>

        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children({ expandida: true, onAntesDeNavegar, cerrar })}
          </div>
          {hayMasAbajo && (
            <div
              data-testid="hoja-indicador-mas"
              className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-white via-white/80 to-transparent pb-1 pt-8"
              aria-hidden="true"
            >
              <ChevronDown className="h-5 w-5 animate-bounce text-ink-300" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Contrato con quien monte esta hoja junto al mapa: mientras está abierta, mantiene la variable
// CSS `--hoja-punto-alto` en `document.documentElement` con la altura (en px, p. ej. "320px") que
// ocupa desde abajo del viewport en cada instante — "0px" cuando está cerrada, y cambia en vivo
// mientras se arrastra. El botón «Cerca de mí» de `MapaExplorar.tsx` la lee en su `bottom` para no
// quedar debajo.
