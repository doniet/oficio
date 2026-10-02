import type { CatalogItem, CatalogPage } from '@oficio/shared';

/** Mismo valor que la web (ProviderCatalog.tsx): espera a que el usuario deje de teclear. */
export const ANTIRREBOTE_BUSQUEDA_MS = 400;

/**
 * Si el perfil no tiene catálogo (`total_all === 0`) la sección entera no se monta: ni siquiera
 * un hueco vacío, como hace la web (ProviderCatalog.tsx:69-72). Es distinto de un filtro sin
 * resultados (`total_all > 0` y `total === 0`), que SÍ monta la sección y enseña un vacío — son
 * casos distintos a propósito y no hay que confundirlos.
 */
export function montarCatalogo(pagina: CatalogPage | undefined): boolean {
  return Boolean(pagina && pagina.total_all > 0);
}

/** Para `getNextPageParam`: la página siguiente mientras queden, si no, se corta la cadena. */
export function siguientePagina(ultima: CatalogPage): number | undefined {
  return ultima.page < ultima.pages ? ultima.page + 1 : undefined;
}

/**
 * Aplana las páginas acumuladas de `useInfiniteQuery` en una sola lista de artículos.
 * Los agotados (`available === false`) NO se filtran aquí: se pintan atenuados con la insignia
 * «Agotado», igual que la web (CatalogCard.tsx:47,51). Si algún día esta función empieza a
 * filtrar por `available`, está mal: el artículo agotado tiene que seguir en la lista.
 */
export function articulosDeCatalogo(paginas: CatalogPage[] | undefined): CatalogItem[] {
  return paginas?.flatMap((p) => p.items) ?? [];
}
