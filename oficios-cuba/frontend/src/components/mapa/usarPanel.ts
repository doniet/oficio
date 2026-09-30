import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * La conducta que comparten los dos envoltorios del panel del mapa — la hoja inferior de móvil
 * (`HojaPunto`) y el panel lateral de escritorio (`PanelLateral`) —, extraída para no escribirla
 * dos veces: entrada propia en el historial, cierre por Esc y por el botón Atrás, trampa de foco
 * con devolución a quien abrió, y bloqueo del scroll de fondo.
 *
 * Es la parte del panel que más fácil se rompe sin que nada se entere, así que vive en un solo
 * sitio y tiene las pruebas de `PanelMapa.test.tsx` encima.
 *
 * `abierta` es una CLAVE, no un objeto: `null` = cerrado, y cambiar de una clave a otra (de un
 * punto a otro, o de la lista a una ficha) NO empuja una entrada de historial nueva. Si empujara
 * una por cada cambio, recorrer cinco negocios de una celda dejaría cinco entradas y haría falta
 * pulsar Atrás cinco veces para salir de Explorar.
 */
export function usarPanel({ abierta, onCerrar, focoOrigen, contenedorRef }: {
  abierta: string | null;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
  contenedorRef: React.RefObject<HTMLElement>;
}) {
  const onCerrarRef = useRef(onCerrar);
  const elementoAlAbrirRef = useRef<HTMLElement | null>(null);
  const historiaEmpujadaRef = useRef(false);
  const habiaAbiertaRef = useRef(false);
  const teniaAbiertaParaFocoRef = useRef(false);
  // Asignada DURANTE el render, no en un efecto: el manejador de `popstate` tiene que saber si
  // el panel está abierto aunque el evento llegue antes de que corra ningún efecto.
  const abiertaRef = useRef(abierta);

  onCerrarRef.current = onCerrar;
  abiertaRef.current = abierta;

  // Cierra: si el panel dejó una entrada propia en el historial, retrocede (el popstate de abajo
  // hace el resto); si no, avisa directo. Así el botón Atrás y las demás formas de cerrar
  // (Esc, la X, soltar arrastrando bastante) pasan siempre por el mismo camino.
  const cerrar = useCallback(() => {
    if (historiaEmpujadaRef.current && window.history.state?.hojaPunto) {
      window.history.back();
    } else {
      onCerrarRef.current();
    }
  }, []);

  // Quita la marca de nuestra entrada sin navegar, para cuando el panel se cierra por una vía
  // que NO es cerrar() (el enlace "Ver perfil completo", u otro que el padre decida): si no se
  // limpiara, la entrada {hojaPunto:true} queda huérfana bajo la ruta nueva y hace falta un
  // segundo Atrás, sin efecto visible, para salir de verdad de Explorar.
  const limpiarEntradaPropia = useCallback(() => {
    if (historiaEmpujadaRef.current && window.history.state?.hojaPunto) {
      window.history.replaceState(null, '');
    }
    historiaEmpujadaRef.current = false;
  }, []);

  // Al abrir: recuerda quién tenía el foco para devolvérselo al cerrar.
  useEffect(() => {
    if (!abierta) return;
    elementoAlAbrirRef.current = focoOrigen ?? (document.activeElement as HTMLElement | null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  // Una sola entrada de historial por apertura (cambiar de contenido sin cerrar no añade otra).
  // Si `abierta` pasa a null sin haber pasado por cerrar() (el padre lo puso en null por su
  // cuenta), limpia igual la entrada en vez de dejarla huérfana.
  useEffect(() => {
    const hay = Boolean(abierta);
    if (hay && !habiaAbiertaRef.current) {
      window.history.pushState({ hojaPunto: true }, '');
      historiaEmpujadaRef.current = true;
    } else if (!hay) {
      limpiarEntradaPropia();
    }
    habiaAbiertaRef.current = hay;
  }, [Boolean(abierta), limpiarEntradaPropia]);

  // Red de seguridad: si el componente se desmonta entero (p. ej. cambia de ruta) mientras
  // nuestra entrada de historial sigue siendo la actual, sin haber pasado por ningún camino
  // de cierre, límpiala igual.
  useEffect(() => () => limpiarEntradaPropia(), [limpiarEntradaPropia]);

  // El botón Atrás del navegador (o cualquier otro pop del historial) cierra el panel sin
  // recargar la página ni sacar al usuario de Explorar.
  useEffect(() => {
    const onPopState = () => {
      if (abiertaRef.current) onCerrarRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Devuelve el foco a quien abrió el panel justo cuando termina de cerrarse. Lleva su propia
  // referencia de "había algo abierto" (en vez de reusar habiaAbiertaRef) porque ese otro ref ya
  // lo actualiza, para este mismo render, el efecto del historial que corre antes que este.
  useEffect(() => {
    if (!abierta && teniaAbiertaParaFocoRef.current && elementoAlAbrirRef.current) {
      elementoAlAbrirRef.current.focus?.();
      elementoAlAbrirRef.current = null;
    }
    teniaAbiertaParaFocoRef.current = Boolean(abierta);
  }, [abierta]);

  // Esc cierra.
  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierta, cerrar]);

  // Con el panel abierto, el fondo no hace scroll (igual que el resto de los diálogos del sitio).
  useEffect(() => {
    if (!abierta) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [abierta]);

  // Atrapa el foco de teclado dentro del panel y lo manda al primer control al abrir.
  useEffect(() => {
    if (!abierta) return;
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    const enfocables = () => Array.from(
      contenedor.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null);

    (enfocables()[0] ?? contenedor).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = enfocables();
      if (els.length === 0) { e.preventDefault(); return; }
      const primero = els[0];
      const ultimo = els[els.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    contenedor.addEventListener('keydown', onKey);
    return () => contenedor.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  return { cerrar, limpiarEntradaPropia };
}

/**
 * La firma que comparten los dos envoltorios. `PanelMapa` elige uno u otro sin cambiar nada más,
 * y por eso tiene que ser literalmente la misma en los dos.
 *
 * `children` es una función y no un nodo porque el contenido necesita tres cosas que solo sabe el
 * envoltorio: si hay sitio para pedir los datos caros (`expandida` — en la hoja móvil solo al
 * desplegarla; en el panel lateral, siempre), cómo soltar la entrada de historial antes de navegar
 * a otra ruta, y cómo cerrarse.
 *
 * `cerrar` NO es el `onCerrar` del padre: pasa antes por el historial, así que la X del contenido
 * deshace la entrada que la apertura empujó. Llamar al `onCerrar` crudo cierra el panel pero deja
 * la entrada puesta, y entonces hace falta un Atrás de más, sin efecto visible, para salir de
 * Explorar. Una prueba cazó exactamente eso durante la extracción.
 */
export type PropsEnvoltorio = {
  abierta: string | null;
  tituloId: string;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
  children: (estado: { expandida: boolean; onAntesDeNavegar(): void; cerrar(): void }) => React.ReactNode;
};

/**
 * Si hay sitio para el panel lateral. 1024 px es el punto de corte `lg` de Tailwind, el mismo que
 * ya separa la barra de filtros de escritorio del cajón móvil en `Search.tsx`: no se introduce un
 * corte nuevo. Ojo, NO es el mismo corte que el de la barra inferior de navegación, que es `md`
 * (768 px): entre 768 y 1024 no hay barra abajo pero tampoco hay panel lateral.
 */
export function usarEsEscritorio() {
  const [esEscritorio, setEsEscritorio] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches === true,
  );
  useEffect(() => {
    // Sin matchMedia (jsdom sin parchear, o cualquier entorno raro) se asume móvil: la hoja
    // funciona en cualquier ancho, el panel lateral no.
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const alCambiar = () => setEsEscritorio(mq.matches);
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return esEscritorio;
}
