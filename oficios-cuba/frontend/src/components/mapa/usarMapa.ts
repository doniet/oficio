import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError, mapaApi } from '../../services/api';
import type { Bbox, PuntoMapa } from '../../types';

// Gemelo de mobile/src/lib/mapa.ts (Expo): mismas cinco reglas de carga del mapa, implementadas
// dos veces a propósito porque unificarlas exigiría meter React en un paquete que no lo tiene.
// Si tocas una regla aquí, revisa que el otro archivo siga de acuerdo — el bug que motivó este
// comentario fue justo que dejaron de estarlo y ningún review lo vio por mirar solo uno.

// El zoom es la petición de más detalle: recarga sola, pero con un poco de aire para no lanzar
// una petición por cada paso de la rueda del ratón.
const ANTIRREBOTE_ZOOM_MS = 250;
// Arrastrar recarga solo (decisión de Dariel, 2026-09-29; antes era un botón «Buscar en esta zona»),
// pero espera más que el zoom: un arrastre es una ráfaga de movimientos y la zona buena es la
// donde el dedo se suelta.
const ANTIRREBOTE_PANEO_MS = 500;
// Escribir o cambiar pestaña/categoría también es deliberado, igual que el zoom.
const ANTIRREBOTE_TEXTO_MS = 300;

/**
 * Recorta el rectángulo visible a los mismos límites. En un móvil en vertical el mapa a zoom 7 abarca
 * más latitud que la propia isla (18,5–24,5) y /api/mapa lo rechazaba con 400: el mapa se abría vacío.
 * Lo que queda fuera de Cuba es mar, así que recortarlo no esconde ningún negocio.
 */
export function acotarBbox(b: Bbox): Bbox {
  return {
    sur: Math.max(19, b.sur),
    oeste: Math.max(-85.5, b.oeste),
    norte: Math.min(24, b.norte),
    este: Math.min(-73.5, b.este),
  };
}

/**
 * Recorta a los límites geográficos que acepta /api/mapa (lat 19–24, lng −85,5 a −73,5).
 * Un cubano en Miami, o detrás de una VPN, se geolocaliza fuera de Cuba: centrar el mapa ahí
 * daría un bbox que el endpoint rechaza con 400 en vez de mostrar el mapa.
 */
export function acotarACuba(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.min(24, Math.max(19, lat)),
    lng: Math.min(-73.5, Math.max(-85.5, lng)),
  };
}

// Mismos límites que acotarBbox/acotarACuba: el rectángulo con el que se pregunta "¿existe esta
// búsqueda en ALGÚN lado de Cuba?" cuando la zona visible no tiene nada.
const CUBA_ENTERA: Bbox = { sur: 19, oeste: -85.5, norte: 24, este: -73.5 };

// El orden en que se prueban las pestañas cuando una se queda sin resultados (ver `onAgotada`
// más abajo). Mismo orden que ve el usuario en los controles del mapa (`ControlesMapa.tsx`).
const ORDEN_PESTANAS = ['servicios', 'negocios', 'productos'] as const;

export function usarMapa(
  params: { tab: string; q: string; category: string },
  onAgotada?: (siguiente: string) => void,
  onZona?: (b: Bbox) => void,
) {
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [celda, setCelda] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  // Adónde saltar cuando la búsqueda actual no tiene NINGÚN resultado en la zona visible, pero sí
  // en algún otro punto de Cuba: quien monta el mapa de Leaflet (MapaExplorar.tsx) reacciona a
  // este cambio con un flyTo. null = no hay salto pendiente.
  const [sugerencia, setSugerencia] = useState<{ lat: number; lng: number } | null>(null);
  // Para no repetir la petición de "¿existe en algún lado?" en cada arrastre/zoom mientras el
  // texto de búsqueda no cambie: una vez que se sabe la respuesta para ESTA búsqueda (haya o no
  // sugerencia), repetirla en cada movimiento sería gastar peticiones de sobra sin necesidad.
  const intentadaRef = useRef(false);
  // Para avisar "esta pestaña está agotada" UNA sola vez por búsqueda en ella, no en cada
  // arrastre/zoom mientras siga sin resultados (eso repetiría el salto a la siguiente sin parar).
  const agotadaRef = useRef(false);
  // Qué pestañas ya se probaron sin suerte para la búsqueda actual (mismo texto/categoría),
  // venga el cambio de pestaña del usuario o del salto automático. Vive fuera de `agotadaRef`
  // porque sobrevive a los saltos (si no, el ciclo rebotaría entre las mismas dos pestañas) y se
  // reinicia solo cuando cambia lo que se busca, no la pestaña.
  const probadasRef = useRef<Set<string>>(new Set());

  // La última zona visible que reportó el mapa; no hay estado de React para esto porque cambiarla
  // no debe, por sí sola, disparar un render.
  const bboxRef = useRef<Bbox | null>(null);
  // La zona con la que se pidió lo que hay pintado. Es distinta de la anterior durante el antirrebote
  // y mientras una petición vuela: los «+N» de pantalla pertenecen a ESTA, no a la que el mapa lleva ya.
  const bboxPintadoRef = useRef<Bbox | null>(null);
  // El controlador de la petición en vuelo: la siguiente carga lo aborta antes de empezar, y una
  // respuesta que llega con su señal ya abortada se descarta en vez de pintarse encima de la nueva.
  const controladorRef = useRef<AbortController | null>(null);
  const antirreboteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Los efectos de abajo no deben repetirse por un `params` que cambia de identidad en cada
  // render; cargar() siempre lee el valor más fresco desde aquí.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  // Idem para `onAgotada`: si el que llama no lo memoriza, cambia de identidad en cada render y
  // dejarlo en las deps de un useCallback de vida larga (avisarAgotada) lo dejaría llamando
  // siempre a la versión del primer render.
  const onAgotadaRef = useRef(onAgotada);
  onAgotadaRef.current = onAgotada;
  // La zona con que se piden los pines, para quien tenga que pedir algo de ESA misma zona (la
  // lista de productos): se avisa al pedir, no al pintar, para que ambas peticiones viajen en
  // paralelo y no una detrás de otra.
  const onZonaRef = useRef(onZona);
  onZonaRef.current = onZona;

  // La próxima pestaña sin probar para esta búsqueda, en el orden fijo de ORDEN_PESTANAS,
  // arrancando justo después de la actual. null si ya se probaron las tres.
  const siguientePestaña = useCallback((actual: string) => {
    probadasRef.current.add(actual);
    const i0 = ORDEN_PESTANAS.indexOf(actual as typeof ORDEN_PESTANAS[number]);
    for (let i = 1; i <= ORDEN_PESTANAS.length; i++) {
      const candidata = ORDEN_PESTANAS[(i0 + i) % ORDEN_PESTANAS.length];
      if (!probadasRef.current.has(candidata)) return candidata;
    }
    return null;
  }, []);

  // Confirmado que esta pestaña no tiene nada (ni en la zona visible ni, si había texto, en toda
  // Cuba): se avisa para saltar a la siguiente. Una sola vez por pestaña (agotadaRef) — si el
  // salto deja igual sin resultados, la pestaña nueva vuelve a correr este mismo camino con su
  // propio agotadaRef, reiniciado por el efecto de [tab, q, category] de más abajo.
  const avisarAgotada = useCallback(() => {
    if (agotadaRef.current) return;
    agotadaRef.current = true;
    const siguiente = siguientePestaña(paramsRef.current.tab);
    if (siguiente) onAgotadaRef.current?.(siguiente);
  }, [siguientePestaña]);

  // Sin resultados en la zona visible, pero con un texto de búsqueda real: puede que el negocio
  // exista en otra parte de Cuba. Se pregunta UNA vez por búsqueda (intentadaRef), con el mismo
  // bbox inflado de siempre pero del tamaño del país entero, así que el servidor lo trata como
  // cualquier otro — agrupa en celdas grandes y devuelve un representante por zona con datos.
  // Si tampoco hay nada ahí, la pestaña queda agotada de verdad y toca saltar a la siguiente.
  // En error se queda callado (como antes): un fallo de red no es "confirmado sin resultados".
  const buscarEnTodaCuba = useCallback(() => {
    const { tab, q, category } = paramsRef.current;
    mapaApi.buscar(CUBA_ENTERA, { tab: tab || undefined, q: q || undefined, category: category || undefined })
      .then((r) => {
        if (r.puntos.length > 0) setSugerencia({ lat: r.puntos[0].lat, lng: r.puntos[0].lng });
        else avisarAgotada();
      })
      .catch(() => {});
  }, [avisarAgotada]);

  const cargar = useCallback(() => {
    const bbox = bboxRef.current;
    if (!bbox) return; // todavía no hay zona visible que pedir

    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;

    setCargando(true);
    setError('');
    const { tab, q, category } = paramsRef.current;

    onZonaRef.current?.(bbox);
    mapaApi.buscar(bbox, { tab: tab || undefined, q: q || undefined, category: category || undefined }, controlador.signal)
      .then((r) => {
        if (controlador.signal.aborted) return; // ya salió otra petición: esta respuesta llegó tarde
        setPuntos(r.puntos);
        setCelda(r.celda);
        setHayMas(r.hay_mas);
        setCargando(false);
        bboxPintadoRef.current = bbox;
        if (r.puntos.length === 0) {
          if (paramsRef.current.q) {
            if (!intentadaRef.current) {
              intentadaRef.current = true;
              buscarEnTodaCuba();
            }
          } else {
            // Sin texto no hay "¿existe en otro lado?" que probar: la zona visible ya es toda la
            // pregunta, así que la pestaña queda confirmada vacía en el acto.
            avisarAgotada();
          }
        }
      })
      .catch((err) => {
        if (controlador.signal.aborted) return;
        setError(apiError(err, 'No se pudo cargar el mapa. Inténtalo de nuevo.'));
        setCargando(false);
      });
  }, [buscarEnTodaCuba, avisarAgotada]);

  const programar = useCallback((ms: number) => {
    if (antirreboteRef.current) clearTimeout(antirreboteRef.current);
    antirreboteRef.current = setTimeout(cargar, ms);
  }, [cargar]);

  const alMover = useCallback((b: Bbox, porZoom: boolean) => {
    // Un rectángulo sin área es el mapa antes de tener tamaño: al montar, Leaflet devuelve unos
    // bounds colapsados a un punto si el contenedor todavía no tiene altura (CSS que aún no
    // aplicó, pestaña oculta, contenedor que la recibe por clase). Pedirlo gasta una petición que
    // no puede devolver nada, y encima deja `bboxPintadoRef` apuntando a un rectángulo degenerado,
    // del que luego `cargarCelda` deduciría un tamaño de celda absurdo. Se ignora y se espera al
    // siguiente movimiento, que llega solo en cuanto el mapa se dimensiona.
    if (b.norte <= b.sur || b.este <= b.oeste) return;
    bboxRef.current = b;
    programar(porZoom ? ANTIRREBOTE_ZOOM_MS : ANTIRREBOTE_PANEO_MS);
  }, [programar]);

  // «Reintentar» tras un error pide la misma zona (bboxRef.current), así que es cargar() otra vez.
  const buscarZona = cargar;

  // Cambiar de pestaña, texto o categoría recarga sola, con su propio antirrebote — pero solo si
  // ya hay una zona visible (el primer bbox lo trae el mapa, no este efecto). La búsqueda nueva
  // es un caso distinto del que ya se investigó: se puede volver a intentar "¿existe en algún
  // lado?" y cualquier salto pendiente de la búsqueda anterior deja de tener sentido.
  useEffect(() => {
    intentadaRef.current = false;
    agotadaRef.current = false;
    setSugerencia(null);
    if (!bboxRef.current) return;
    programar(ANTIRREBOTE_TEXTO_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab, params.q, params.category]);

  // Qué pestañas ya se probaron solo se olvida con una búsqueda de verdad distinta (otro texto u
  // otra categoría) — cambiar de pestaña, a mano o por el salto automático, no la reinicia: si lo
  // hiciera, el ciclo rebotaría para siempre entre las mismas dos pestañas vacías.
  useEffect(() => {
    probadasRef.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, params.category]);

  useEffect(() => () => {
    if (antirreboteRef.current) clearTimeout(antirreboteRef.current);
    controladorRef.current?.abort();
  }, []);

  /**
   * Los negocios de una celda concreta. Usa el bbox con el que se pintó el mapa (no el que lleva
   * ahora tras un arrastre) porque el servidor deduce de él el tamaño de celda: pedirlo con otro rectángulo haría
   * que los índices significaran otra cosa y la lista no cuadrara con el «+N» que la anunció.
   */
  const cargarCelda = useCallback((cy: number, cx: number) => {
    const bbox = bboxPintadoRef.current;
    if (!bbox) return Promise.resolve([] as PuntoMapa[]);
    const { tab, q, category } = paramsRef.current;
    return mapaApi.celda(bbox, cy, cx, { tab: tab || undefined, q: q || undefined, category: category || undefined })
      .then((r) => r.puntos);
  }, []);

  return { puntos, celda, hayMas, cargando, error, sugerencia, alMover, buscarZona, cargarCelda };
}
