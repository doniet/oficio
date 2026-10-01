import type { PuntoMapa } from '@oficio/shared';

export type EstadoHoja = {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  /** Hay una lista a la que volver: esta ficha se abrió eligiendo de ella. */
  hayListaPrevia: boolean;
};

export type AccionAtras = 'nada' | 'cerrar' | 'volver-a-lista';

/**
 * Qué debe hacer el botón físico Atrás con la hoja del mapa. Vive aparte de HojaPunto.tsx (que solo
 * hace `BackHandler.addEventListener` y llama a esto) para poder probar la decisión sin la
 * maquinaria nativa de gestos ni @gorhom/bottom-sheet.
 *
 * Es el defecto más común de este patrón (brief de la Tarea 10): si se rompe, quien toca un punto y
 * pulsa Atrás sale de Explorar y pierde su búsqueda.
 *
 * 🚨 El ORDEN de las ramas es la decisión, no un detalle: con una ficha que vino de una lista, Atrás
 * tiene que devolver a la lista. Si se cerrara, quien entró en una celda de cinco y se equivocó de
 * negocio pierde la celda y tiene que volver a acertarle al pin.
 */
export function accionAtras({ punto, lista, hayListaPrevia }: EstadoHoja): AccionAtras {
  if (punto && hayListaPrevia) return 'volver-a-lista';
  if (punto || lista) return 'cerrar';
  return 'nada';
}
