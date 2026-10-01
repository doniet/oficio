import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bbox, MapaRespuesta, PuntoMapa } from '@oficio/shared';
import { configApi } from './api';

// Mismos límites que exige GET /api/mapa (ver backend/src/lib/mapa.ts): fuera de este rango
// responde 400. Duplicado a propósito, igual que los tipos: unificar con la web exigiría meter
// React en @oficio/shared, que hoy no lo tiene.
export const CUBA = { sur: 19, oeste: -85.5, norte: 24, este: -73.5 } as const;

// El rectángulo con el que se pregunta «¿existe esta búsqueda en ALGÚN lado de Cuba?» cuando la
// zona visible no tiene nada. Mismos límites que CUBA: el servidor lo trata como cualquier otro
// bbox — agrupa en celdas grandes y devuelve un representante por zona con datos.
const CUBA_ENTERA: Bbox = { sur: CUBA.sur, oeste: CUBA.oeste, norte: CUBA.norte, este: CUBA.este };

// Regla 5: un cubano en Miami, o cualquiera detrás de una VPN, recibe una geolocalización fuera
// de Cuba. Centrar el mapa ahí produce un rectángulo que el endpoint rechaza con 400 y el usuario
// ve un error en vez de un mapa — mejor mostrarle el punto de Cuba más cercano a donde está.
export function acotarACuba(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.min(CUBA.norte, Math.max(CUBA.sur, lat)),
    lng: Math.min(CUBA.este, Math.max(CUBA.oeste, lng)),
  };
}

// Recorta el rectángulo visible a esos límites. Un teléfono en vertical a zoom 6,3 ve más latitud
// que la isla y el endpoint lo rechazaba con 400. Lo que queda fuera es mar: no esconde a nadie.
export function acotarBbox(b: Bbox): Bbox {
  return {
    sur: Math.max(CUBA.sur, b.sur),
    oeste: Math.max(CUBA.oeste, b.oeste),
    norte: Math.min(CUBA.norte, b.norte),
    este: Math.min(CUBA.este, b.este),
  };
}

const ANTIRREBOTE_ZOOM_MS = 250;
// Arrastrar recarga solo (decisión de Dariel, 2026-09-29; antes sacaba «Buscar en esta zona»), pero
// espera más que el zoom: un arrastre llega en ráfaga y la zona buena es donde se suelta el dedo.
const ANTIRREBOTE_PANEO_MS = 500;
const ANTIRREBOTE_TEXTO_MS = 300;
// Mismo valor que el timeout interno de crearCliente (shared/src/api.ts) y el de axios en la web
// (frontend/src/services/api.ts): `fetch` no tiene tiempo de espera propio, así que sin este
// temporizador una conexión cubana lenta que se cuelga deja `cargando: true` para siempre.
const TIEMPO_ESPERA_MS = 20000;

// Compartida entre pedirMapa y pedirCelda a propósito: el backend comparte este mismo filtro entre
// GET /mapa y GET /mapa/celda (filtroDeVisibles en backend/src/routes/mapa.ts) precisamente para
// que, si cada endpoint escribiera el suyo, la lista de una celda no acabe sin coincidir con el
// «+N» que la anuncia. Duplicarlo aquí reintroduciría esa misma divergencia del lado del cliente.
function qsDeMapa(bbox: Bbox, params: { tab: string; q?: string; category?: string }): URLSearchParams {
  const qs = new URLSearchParams({ bbox: `${bbox.sur},${bbox.oeste},${bbox.norte},${bbox.este}`, tab: params.tab });
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  return qs;
}

async function pedirMapa(
  bbox: Bbox,
  params: { tab: string; q?: string; category?: string },
  signal: AbortSignal,
): Promise<MapaRespuesta> {
  const qs = qsDeMapa(bbox, params);
  const res = await fetch(`${configApi.baseUrl}/mapa?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error('No se pudo cargar el mapa');
  return (await res.json()) as MapaRespuesta;
}

async function pedirCelda(
  bbox: Bbox,
  cy: number,
  cx: number,
  params: { tab: string; q?: string; category?: string },
  signal: AbortSignal,
): Promise<MapaRespuesta> {
  const qs = qsDeMapa(bbox, params);
  qs.set('cy', String(cy));
  qs.set('cx', String(cx));
  const res = await fetch(`${configApi.baseUrl}/mapa/celda?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error('No se pudo cargar la celda');
  return (await res.json()) as MapaRespuesta;
}

export type EstadoMapa = {
  puntos: PuntoMapa[];
  cargando: boolean;
  error: boolean;
  hayMas: boolean;
  /** Tamaño de celda que devolvió el servidor. Decide si lo aproximado se dibuja como área. */
  celda: number;
  /** Adónde saltar cuando la búsqueda no tiene NADA en la zona visible pero sí en otra parte de
   *  Cuba. null = no hay salto pendiente. Quien monta el mapa reacciona con un flyTo. */
  sugerencia: { lat: number; lng: number } | null;
};

const ESTADO_INICIAL: EstadoMapa = { puntos: [], cargando: true, error: false, hayMas: false, celda: 0, sugerencia: null };

/**
 * El mismo hook de carga que usarMapa.ts de la web (frontend/src/components/mapa/), con las
 * mismas cinco reglas: el zoom recarga solo (250 ms), el paneo también (500 ms), el texto
 * recarga solo (300 ms), toda carga cancela la anterior en vuelo, y el centro se acota a Cuba.
 */
export function usarMapa({ tab, q, category }: { tab: string; q: string; category: string }) {
  const [estado, setEstado] = useState<EstadoMapa>(ESTADO_INICIAL);
  const bboxVisible = useRef<Bbox | null>(null);
  const controlador = useRef<AbortController | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiempoEspera = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La zona con la que se pidió lo que está pintado AHORA. Distinta de `bboxVisible` durante el
  // antirrebote y mientras una petición vuela: el servidor deduce el tamaño de celda del bbox, así
  // que los cy/cx de los puntos en pantalla solo significan algo respecto a ESTE rectángulo.
  const bboxPintado = useRef<Bbox | null>(null);
  // Controlador propio de la celda: NO es el del área. Abortar la celda porque el mapa se movió
  // dejaría la hoja abierta y sin contenido.
  const controladorCelda = useRef<AbortController | null>(null);
  // Una vez sabida la respuesta para ESTA búsqueda (haya salto o no), repetir la pregunta en cada
  // arrastre sería gastar peticiones de sobra. MapaExplorar reacciona a cambios de `sugerencia` con
  // un flyTo, así que sin esta guarda cada arrastre en zona vacía produciría un nuevo objeto de
  // sugerencia y un vuelo no solicitado.
  const intentada = useRef(false);
  const controladorCuba = useRef<AbortController | null>(null);

  function limpiarTiempoEspera() {
    if (tiempoEspera.current) { clearTimeout(tiempoEspera.current); tiempoEspera.current = null; }
  }

  const buscarEnTodaCuba = useCallback(() => {
    controladorCuba.current?.abort();
    const propio = new AbortController();
    controladorCuba.current = propio;
    pedirMapa(CUBA_ENTERA, { tab, q: q || undefined, category: category || undefined }, propio.signal)
      .then((r) => {
        if (propio.signal.aborted || r.puntos.length === 0) return;
        setEstado((e) => ({ ...e, sugerencia: { lat: r.puntos[0].lat, lng: r.puntos[0].lng } }));
      })
      // Silencioso a propósito: si falla, se queda el «sin resultados» normal. No es crítico.
      .catch(() => {});
  }, [tab, q, category]);

  const cargar = useCallback((bbox: Bbox) => {
    // Regla 4: se cancela la petición en vuelo antes de lanzar la siguiente. Sin esto, escribir
    // mientras una zona grande sigue cargando pinta el resultado viejo encima del fresco.
    controlador.current?.abort();
    limpiarTiempoEspera();
    const propio = new AbortController();
    controlador.current = propio;
    // Se distingue de la cancelación de la regla 4 con esta bandera propia del cierre: un abort
    // por "llegó otra petición" no es un error (rama de abajo), uno por tiempo de espera sí lo es.
    let expiroPorTiempo = false;
    tiempoEspera.current = setTimeout(() => { expiroPorTiempo = true; propio.abort(); }, TIEMPO_ESPERA_MS);
    setEstado((e) => ({ ...e, cargando: true, error: false }));
    pedirMapa(bbox, { tab, q: q || undefined, category: category || undefined }, propio.signal)
      .then((r) => {
        limpiarTiempoEspera();
        if (propio.signal.aborted) return;
        bboxPintado.current = bbox;
        setEstado((e) => ({ ...e, puntos: r.puntos, cargando: false, error: false, hayMas: r.hay_mas, celda: r.celda }));
        // Solo con texto: sin término, «¿existe en algún lado?» no significa nada, y abrir el mapa
        // sobre el mar dispararía una petición de Cuba entera y un salto que nadie pidió.
        if (r.puntos.length === 0 && q && !intentada.current) {
          intentada.current = true;
          buscarEnTodaCuba();
        }
      })
      .catch(() => {
        limpiarTiempoEspera();
        // Cancelada a propósito porque llegó otra petición (regla 4): no es un error que mostrar.
        // Cancelada porque expiró el tiempo de espera: sí lo es, y hay que soltar `cargando`.
        if (propio.signal.aborted && !expiroPorTiempo) return;
        setEstado((e) => ({ ...e, cargando: false, error: true }));
      });
  }, [tab, q, category, buscarEnTodaCuba]);

  function limpiarTemporizador() {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; }
  }

  // Regla 3: escribir en el buscador (o cambiar categoría/pestaña) recarga solo, con el mismo
  // tipo de antirrebote que el zoom — es una petición deliberada, igual que hacer zoom.
  useEffect(() => {
    // Va con los otros dos reinicios y no es orden: la pregunta por Cuba entera del término
    // anterior sigue en vuelo, y si llega sin abortar escribe `sugerencia` con las coordenadas de
    // una búsqueda que el usuario ya abandonó — MapaExplorar vuela hasta allá, lejos de los
    // resultados del término nuevo. Es la diferencia entre un vuelo que se pidió y uno que no.
    controladorCuba.current?.abort();
    intentada.current = false;
    setEstado((e) => (e.sugerencia === null ? e : { ...e, sugerencia: null }));
    if (!bboxVisible.current) return;
    limpiarTemporizador();
    temporizador.current = setTimeout(() => cargar(bboxVisible.current!), ANTIRREBOTE_TEXTO_MS);
    return limpiarTemporizador;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, category]);

  useEffect(() => () => {
    controlador.current?.abort();
    controladorCelda.current?.abort();
    controladorCuba.current?.abort();
    limpiarTemporizador();
    limpiarTiempoEspera();
  }, []);

  /** El mapa llama a esto en cada cambio de región (onRegionDidChange). */
  const alMoverMapa = useCallback((bbox: Bbox, esZoom: boolean) => {
    // MapLibre devuelve bounds colapsados a un punto si el contenedor todavía no tiene altura.
    // Pedirlos gasta una petición que no puede devolver nada y, peor, dejaría `bboxPintado`
    // apuntando a un rectángulo degenerado del que luego se deduciría una celda absurda.
    if (bbox.norte <= bbox.sur || bbox.este <= bbox.oeste) return;
    bboxVisible.current = bbox;
    // Reglas 1 y 2: zoom y paneo recargan solos; el zoom antes, porque es un gesto deliberado.
    limpiarTemporizador();
    temporizador.current = setTimeout(() => cargar(bbox), esZoom ? ANTIRREBOTE_ZOOM_MS : ANTIRREBOTE_PANEO_MS);
  }, [cargar]);

  /** Carga inicial (al montar el mapa) o «Reintentar» tras un error. */
  const buscarZonaVisible = useCallback((bbox?: Bbox) => {
    const objetivo = bbox ?? bboxVisible.current;
    if (!objetivo) return;
    bboxVisible.current = objetivo;
    limpiarTemporizador();
    cargar(objetivo);
  }, [cargar]);

  const cargarCelda = useCallback((cy: number, cx: number): Promise<PuntoMapa[]> => {
    const bbox = bboxPintado.current;
    if (!bbox) return Promise.resolve([]);
    // Un segundo toque abandona el primero: la respuesta vieja no puede pintarse encima.
    controladorCelda.current?.abort();
    const propio = new AbortController();
    controladorCelda.current = propio;
    // Mismo tiempo de espera que `cargar()`, por el mismo motivo y uno más: una conexión que se
    // CUELGA sin fallar nunca asienta esta promesa, así que quien tocó un «+N» no ve nada en
    // absoluto — ni hoja, ni error, ni «Reintentar». Con esto el cuelgue rechaza y cae en el
    // camino de error que ya existe. La bandera separa las dos cancelaciones: la del segundo
    // toque sigue resolviendo vacía y en silencio; la del tiempo agotado sí tiene que rechazar.
    let expiroPorTiempo = false;
    const tiempoEsperaCelda = setTimeout(() => { expiroPorTiempo = true; propio.abort(); }, TIEMPO_ESPERA_MS);
    return pedirCelda(bbox, cy, cx, { tab, q: q || undefined, category: category || undefined }, propio.signal)
      .then((r) => {
        clearTimeout(tiempoEsperaCelda);
        return propio.signal.aborted ? [] : r.puntos;
      })
      // Abandonada (otro toque o desmontaje): no es un error que mostrar, resuelve vacía y quien
      // llama lo trata como «la celda no trajo nada». Cualquier otro fallo sí se propaga.
      .catch((e: unknown) => {
        clearTimeout(tiempoEsperaCelda);
        if (propio.signal.aborted && !expiroPorTiempo) return [];
        throw e;
      });
  }, [tab, q, category]);

  return { ...estado, alMoverMapa, buscarZonaVisible, cargarCelda };
}
