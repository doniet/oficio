/**
 * El término de búsqueda, traducido a SQL. Único punto donde se decide qué
 * significa "buscar", para que la lista y el mapa no puedan interpretarlo
 * distinto — el defecto que obligaba a repetir el filtro en tres archivos.
 *
 * En el Plan 2 este módulo gana un adaptador de Meilisearch y esta
 * implementación pasa a ser el respaldo.
 */
export function termino(
  bruto: string | undefined,
  columna: string,
  siguienteParam: number,
): { sql: string; params: unknown[] } | null {
  const limpio = (bruto ?? '').trim();
  if (!limpio) return null;
  // websearch_to_tsquery no lanza con comillas o operadores sueltos, al
  // contrario que to_tsquery: el usuario puede escribir lo que quiera.
  return {
    sql: `${columna} @@ websearch_to_tsquery('spanish', unaccent($${siguienteParam}))`,
    params: [limpio],
  };
}
