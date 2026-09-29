/**
 * El término de búsqueda, traducido a SQL. Único punto donde se decide qué
 * significa "buscar", para que la lista y el mapa no puedan interpretarlo
 * distinto — el defecto que obligaba a repetir el filtro en tres archivos.
 *
 * En el Plan 2 este módulo gana un adaptador de Meilisearch y esta
 * implementación pasa a ser el respaldo.
 */

// Solo letras/dígitos Unicode cuentan como "palabra": todo lo demás (comillas, paréntesis, los
// operadores de tsquery — &, |, !, : — puntuación suelta) se descarta aquí, en JS, ANTES de
// tocar SQL. to_tsquery, a diferencia de websearch_to_tsquery, SÍ lanza con una entrada mal
// formada ('jabon & (' → "syntax error in tsquery"; '(jabon' → lo mismo): construir la consulta
// a mano, palabra por palabra, es lo que permite buscar por prefijo sin arriesgarse a esa
// excepción con la entrada de un usuario cualquiera, que puede escribir lo que quiera.
function palabras(texto: string): string[] {
  return texto.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function termino(
  bruto: string | undefined,
  columna: string,
  siguienteParam: number,
): { sql: string; params: unknown[] } | null {
  const limpio = (bruto ?? '').trim();
  if (!limpio) return null;
  // Por prefijo: "toma" encuentra "Tomacorriente" — el buscador se usa desde el móvil, con
  // prisa, y la gente escribe la palabra a medio terminar (Review Focus). Cada palabra lleva su
  // propio `:*`; varias palabras se unen con `&` (todas obligatorias), igual que interpretaba
  // websearch_to_tsquery un término de varias palabras.
  //
  // Si el texto era solo puntuación ("!!!"), `palabras()` da un array vacío y la consulta
  // construida es la cadena vacía: to_tsquery('') no lanza, da un tsquery vacío que no coincide
  // con ninguna fila — el mismo "sin resultados" que ya daba websearch_to_tsquery en ese caso,
  // no un error.
  const consultaTxt = palabras(limpio).map((p) => `${p}:*`).join(' & ');
  return {
    sql: `${columna} @@ ${consultaSQL(siguienteParam)}`,
    params: [consultaTxt],
  };
}

/**
 * La expresión de consulta que ya construyó `termino()`, para reusarla contra OTRA columna (un
 * OR entre varias tablas — el negocio, la categoría, el dueño) o como ranking (`ts_rank`).
 * SIEMPRE el mismo número de parámetro que ya puso `termino()` en el WHERE, nunca uno nuevo: el
 * valor ya está en `params`, solo hace falta referenciar de nuevo su posición.
 */
export function consultaSQL(paramIndex: number): string {
  return `to_tsquery('spanish', unaccent($${paramIndex}))`;
}
