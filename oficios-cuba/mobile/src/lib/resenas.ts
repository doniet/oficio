import type { Pagination, Review } from '@oficio/shared';

// 🚨 Las 20 reseñas que trae `GET /providers/:id` en su campo `reviews` NO se usan aquí ni en la
// pantalla que consuma este archivo. Ese campo es un atajo del backend que NO pagina; mezclarlas
// con la lista paginada de `GET /reviews/provider/:id` (la que sí recorre esta página) duplicaría
// filas en la primera página. Se ignoran por completo — lo único que se aprovecha de esa respuesta
// es `distribution`, para `resumenEstrellas` más abajo.

/** El tope por defecto de `GET /reviews/provider/:id`. */
export const RESENAS_POR_PAGINA = 10;

/** Para `getNextPageParam`: la página siguiente mientras queden, si no `undefined`. */
export function siguientePaginaResenas(paginacion: Pagination): number | undefined {
  return paginacion.page < paginacion.totalPages ? paginacion.page + 1 : undefined;
}

export interface FilaEstrellas {
  rating: number;
  count: number;
  porcentaje: number;
}

/**
 * Resumen 5→1 a partir de `distribution` (que ya trae `GET /providers/:id`). `distribution` puede
 * venir con huecos — si nadie puso 2 estrellas, no llega esa fila — así que el resumen completa las
 * cinco con 0 en vez de asumir que están todas.
 *
 * El total para el porcentaje sale de sumar esta misma distribución, no de `review_count` del
 * perfil: el backend ya avisa que esa suma puede no cuadrar con el conteo desnormalizado, así que
 * usar `review_count` aquí podría dar porcentajes que no suman 100 sobre las filas que sí se ven.
 */
export function resumenEstrellas(distribution: { rating: number; count: number }[]): FilaEstrellas[] {
  const porValor = new Map(distribution.map((d) => [d.rating, d.count]));
  const total = distribution.reduce((acc, d) => acc + d.count, 0);
  return [5, 4, 3, 2, 1].map((rating) => {
    const count = porValor.get(rating) ?? 0;
    return { rating, count, porcentaje: total ? Math.round((count / total) * 100) : 0 };
  });
}

/**
 * «Servicio: X», o null si la reseña no tiene servicio asociado. `service_title` puede ser null
 * porque borrar un servicio conserva sus reseñas (`reviews.service_id` pasa a NULL) en vez de
 * borrarlas con él.
 */
export function tituloServicioResena(review: Review): string | null {
  return review.service_title ? `Servicio: ${review.service_title}` : null;
}
