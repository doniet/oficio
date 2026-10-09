import type { PuntoMapa } from '@oficio/shared';

export type EstadoHoja = {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  /** Hay una lista a la que volver: esta ficha se abrió eligiendo de ella. */
  hayListaPrevia: boolean;
  /** La ficha se abrió tocando un producto (y no hay celda detrás). */
  desdeProductos: boolean;
  /** La lista de productos está a la vista (sola, sin ficha ni celda). Atrás la cierra. */
  productos?: boolean;
};

export type AccionAtras = 'nada' | 'cerrar' | 'volver-a-lista' | 'volver-a-productos';

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
 *
 * La lista previa gana a «desde productos»: una ficha abierta desde una celda vuelve a la celda
 * aunque antes se hubiera pasado por productos (el recorrido que falló en la web).
 */
export function accionAtras({ punto, lista, hayListaPrevia, desdeProductos, productos }: EstadoHoja): AccionAtras {
  if (punto && hayListaPrevia) return 'volver-a-lista';
  if (punto && desdeProductos) return 'volver-a-productos';
  if (punto || lista || productos) return 'cerrar';
  return 'nada';
}

/**
 * El fondo oscuro de la hoja según lo que enseña. Con la lista de productos el mapa tiene que
 * seguir usable a media altura (se explora moviéndolo), así que el fondo aparece solo al abrirla
 * del todo. `disappearsOnIndex` es lo que importa de verdad: @gorhom/bottom-sheet deja pasar los
 * toques a través del fondo solo con el índice <= ese valor, y con -1 un fondo invisible seguiría
 * comiéndose los toques del mapa en el anclaje asomado.
 */
export function fondoHoja(contenido: 'celda' | 'ficha' | 'productos' | null): { appearsOnIndex: number; disappearsOnIndex: number } {
  return contenido === 'productos' ? { appearsOnIndex: 1, disappearsOnIndex: 0 } : { appearsOnIndex: 0, disappearsOnIndex: -1 };
}
