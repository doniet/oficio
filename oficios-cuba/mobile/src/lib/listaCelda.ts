/**
 * El título de la lista de una celda. El neutro (sin número) es el del caso de error: cuando la
 * celda no se pudo cargar no se puede afirmar cuántos hay, y «0 negocios» sobre una lista que
 * muestra uno sería mentira.
 */
export function tituloCelda(n: number): string {
  if (n <= 0) return 'Negocios de esta zona';
  return n === 1 ? '1 negocio en esta zona' : `${n} negocios en esta zona`;
}
