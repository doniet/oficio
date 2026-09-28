import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bbox, MapaRespuesta, PuntoMapa } from '@oficio/shared';
import { configApi } from './api';

// Mismos límites que exige GET /api/mapa (ver backend/src/lib/mapa.ts): fuera de este rango
// responde 400. Duplicado a propósito, igual que los tipos: unificar con la web exigiría meter
// React en @oficio/shared, que hoy no lo tiene.
export const CUBA = { sur: 19, oeste: -85.5, norte: 24, este: -73.5 } as const;

// Regla 5: un cubano en Miami, o cualquiera detrás de una VPN, recibe una geolocalización fuera
// de Cuba. Centrar el mapa ahí produce un rectángulo que el endpoint rechaza con 400 y el usuario
// ve un error en vez de un mapa — mejor mostrarle el punto de Cuba más cercano a donde está.
export function acotarACuba(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.min(CUBA.norte, Math.max(CUBA.sur, lat)),
    lng: Math.min(CUBA.este, Math.max(CUBA.oeste, lng)),
  };
}

const ANTIRREBOTE_ZOOM_MS = 250;
const ANTIRREBOTE_TEXTO_MS = 300;
// Mismo valor que el timeout interno de crearCliente (shared/src/api.ts) y el de axios en la web
// (frontend/src/services/api.ts): `fetch` no tiene tiempo de espera propio, así que sin este
// temporizador una conexión cubana lenta que se cuelga deja `cargando: true` para siempre.
const TIEMPO_ESPERA_MS = 20000;

async function pedirMapa(
  bbox: Bbox,
  params: { tab: string; q?: string; category?: string },
  signal: AbortSignal,
): Promise<MapaRespuesta> {
  const qs = new URLSearchParams({ bbox: `${bbox.sur},${bbox.oeste},${bbox.norte},${bbox.este}`, tab: params.tab });
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  const res = await fetch(`${configApi.baseUrl}/mapa?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error('No se pudo cargar el mapa');
  return (await res.json()) as MapaRespuesta;
}

export type EstadoMapa = {
  puntos: PuntoMapa[];
  cargando: boolean;
  error: boolean;
  /** Regla 2: el usuario paneó sin recargar — hay que ofrecerle «Buscar en esta zona». */
  zonaSucia: boolean;
  hayMas: boolean;
};

const ESTADO_INICIAL: EstadoMapa = { puntos: [], cargando: true, error: false, zonaSucia: false, hayMas: false };

/**
 * El mismo hook de carga que usarMapa.ts de la web (frontend/src/components/mapa/), con las
 * mismas cinco reglas: el zoom recarga solo (250 ms), el paneo solo ensucia la zona, el texto
 * recarga solo (300 ms), toda carga cancela la anterior en vuelo, y el centro se acota a Cuba.
 */
export function usarMapa({ tab, q, category }: { tab: string; q: string; category: string }) {
  const [estado, setEstado] = useState<EstadoMapa>(ESTADO_INICIAL);
  const bboxVisible = useRef<Bbox | null>(null);
  const controlador = useRef<AbortController | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiempoEspera = useRef<ReturnType<typeof setTimeout> | null>(null);

  function limpiarTiempoEspera() {
    if (tiempoEspera.current) { clearTimeout(tiempoEspera.current); tiempoEspera.current = null; }
  }

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
        setEstado({ puntos: r.puntos, cargando: false, error: false, zonaSucia: false, hayMas: r.hay_mas });
      })
      .catch(() => {
        limpiarTiempoEspera();
        // Cancelada a propósito porque llegó otra petición (regla 4): no es un error que mostrar.
        // Cancelada porque expiró el tiempo de espera: sí lo es, y hay que soltar `cargando`.
        if (propio.signal.aborted && !expiroPorTiempo) return;
        setEstado((e) => ({ ...e, cargando: false, error: true }));
      });
  }, [tab, q, category]);

  function limpiarTemporizador() {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; }
  }

  // Regla 3: escribir en el buscador (o cambiar categoría/pestaña) recarga solo, con el mismo
  // tipo de antirrebote que el zoom — es una petición deliberada, igual que hacer zoom.
  useEffect(() => {
    if (!bboxVisible.current) return;
    limpiarTemporizador();
    temporizador.current = setTimeout(() => cargar(bboxVisible.current!), ANTIRREBOTE_TEXTO_MS);
    return limpiarTemporizador;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, category]);

  useEffect(() => () => { controlador.current?.abort(); limpiarTemporizador(); limpiarTiempoEspera(); }, []);

  /** El mapa llama a esto en cada cambio de región (onRegionDidChange). */
  const alMoverMapa = useCallback((bbox: Bbox, esZoom: boolean) => {
    bboxVisible.current = bbox;
    if (esZoom) {
      // Regla 1: el zoom recarga solo — hacer zoom EN SÍ es pedir más detalle.
      limpiarTemporizador();
      temporizador.current = setTimeout(() => cargar(bbox), ANTIRREBOTE_ZOOM_MS);
    } else {
      // Regla 2: el paneo no dispara nada; solo se marca la zona como sucia.
      setEstado((e) => (e.zonaSucia ? e : { ...e, zonaSucia: true }));
    }
  }, [cargar]);

  /** Carga inicial (al montar el mapa) o el botón «Buscar en esta zona». */
  const buscarZonaVisible = useCallback((bbox?: Bbox) => {
    const objetivo = bbox ?? bboxVisible.current;
    if (!objetivo) return;
    bboxVisible.current = objetivo;
    limpiarTemporizador();
    cargar(objetivo);
  }, [cargar]);

  return { ...estado, alMoverMapa, buscarZonaVisible };
}
