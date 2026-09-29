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
// Escribir o cambiar pestaña/categoría también es deliberado, igual que el zoom.
const ANTIRREBOTE_TEXTO_MS = 300;

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

export function usarMapa(params: { tab: string; q: string; category: string }) {
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [celda, setCelda] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [zonaSucia, setZonaSucia] = useState(false);

  // La última zona visible que reportó el mapa; no hay estado de React para esto porque cambiarla
  // no debe, por sí sola, disparar un render (paneo no recarga: ver alMover).
  const bboxRef = useRef<Bbox | null>(null);
  // El controlador de la petición en vuelo: la siguiente carga lo aborta antes de empezar, y una
  // respuesta que llega con su señal ya abortada se descarta en vez de pintarse encima de la nueva.
  const controladorRef = useRef<AbortController | null>(null);
  const antirreboteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Los efectos de abajo no deben repetirse por un `params` que cambia de identidad en cada
  // render; cargar() siempre lee el valor más fresco desde aquí.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const cargar = useCallback(() => {
    const bbox = bboxRef.current;
    if (!bbox) return; // todavía no hay zona visible que pedir

    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;

    setCargando(true);
    setError('');
    const { tab, q, category } = paramsRef.current;

    mapaApi.buscar(bbox, { tab: tab || undefined, q: q || undefined, category: category || undefined }, controlador.signal)
      .then((r) => {
        if (controlador.signal.aborted) return; // ya salió otra petición: esta respuesta llegó tarde
        setPuntos(r.puntos);
        setCelda(r.celda);
        setHayMas(r.hay_mas);
        setCargando(false);
        // Se limpia aquí, no al pulsar el botón: solo se sabe que la zona visible ya no está
        // sucia cuando la carga de esa zona termina bien. Limpiarla antes deja un reintento
        // fallido sin botón para volver a intentarlo (ver mobile/src/lib/mapa.ts).
        setZonaSucia(false);
      })
      .catch((err) => {
        if (controlador.signal.aborted) return;
        setError(apiError(err, 'No se pudo cargar el mapa. Inténtalo de nuevo.'));
        setCargando(false);
      });
  }, []);

  const programar = useCallback((ms: number) => {
    if (antirreboteRef.current) clearTimeout(antirreboteRef.current);
    antirreboteRef.current = setTimeout(cargar, ms);
  }, [cargar]);

  const alMover = useCallback((b: Bbox, porZoom: boolean) => {
    bboxRef.current = b;
    if (porZoom) {
      programar(ANTIRREBOTE_ZOOM_MS);
    } else {
      // Panear no recarga sola: solo avisa que la zona ya no coincide con lo pedido.
      setZonaSucia(true);
    }
  }, [programar]);

  // Carga inicial, botón «Buscar en esta zona» y «Reintentar» tras un error: las tres piden la
  // misma zona (bboxRef.current), así que es literalmente cargar() otra vez.
  const buscarZona = cargar;

  // Cambiar de pestaña, texto o categoría recarga sola, con su propio antirrebote — pero solo si
  // ya hay una zona visible (el primer bbox lo trae el mapa, no este efecto).
  useEffect(() => {
    if (!bboxRef.current) return;
    programar(ANTIRREBOTE_TEXTO_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab, params.q, params.category]);

  useEffect(() => () => {
    if (antirreboteRef.current) clearTimeout(antirreboteRef.current);
    controladorRef.current?.abort();
  }, []);

  /**
   * Los negocios de una celda concreta. Usa el bbox guardado —el mismo con el que se pintó el
   * mapa— porque el servidor deduce de él el tamaño de celda: pedirlo con otro rectángulo haría
   * que los índices significaran otra cosa y la lista no cuadrara con el «+N» que la anunció.
   */
  const cargarCelda = useCallback((cy: number, cx: number) => {
    const bbox = bboxRef.current;
    if (!bbox) return Promise.resolve([] as PuntoMapa[]);
    const { tab, q, category } = paramsRef.current;
    return mapaApi.celda(bbox, cy, cx, { tab: tab || undefined, q: q || undefined, category: category || undefined })
      .then((r) => r.puntos);
  }, []);

  return { puntos, celda, hayMas, cargando, error, zonaSucia, alMover, buscarZona, cargarCelda };
}
