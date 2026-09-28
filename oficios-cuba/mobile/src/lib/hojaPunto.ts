import type { PuntoMapa } from '@oficio/shared';

/**
 * Qué debe hacer el botón físico Atrás con la hoja de un punto del mapa: con un punto abierto,
 * la hoja se queda con el evento (se cierra) y Atrás NO debe sacar al usuario de la pantalla; sin
 * punto abierto, Atrás sigue su curso normal. Es el defecto más común de este patrón (brief de la
 * Tarea 10): si se rompe, quien toca un punto y pulsa Atrás sale de Explorar y pierde su búsqueda.
 *
 * Aparte de HojaPunto.tsx (que solo hace `BackHandler.addEventListener` y llama a esto) para
 * poder probar la decisión sin la maquinaria nativa de gestos ni @gorhom/bottom-sheet.
 */
export function atrasCierraHoja(punto: PuntoMapa | null): boolean {
  return punto !== null;
}
