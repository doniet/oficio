import type { Bbox, CatalogItem, MapaProductosRespuesta, OrdenProductos, ProductoMapa, PuntoMapa } from '@oficio/shared';
import { configApi } from './api';

export const ORDENES_PRODUCTOS: { valor: OrdenProductos; etiqueta: string }[] = [
  { valor: 'relevance', etiqueta: 'Relevancia' },
  { valor: 'price_asc', etiqueta: 'Menor precio' },
  { valor: 'price_desc', etiqueta: 'Mayor precio' },
];

export function tituloProductos(n: number): string {
  return `${n} ${n === 1 ? 'producto' : 'productos'} en esta zona`;
}

export function textoVerProductos(total: number, fuera: number): string | null {
  if (total > 0) return `Ver ${total} ${total === 1 ? 'producto' : 'productos'}`;
  return fuera > 0 ? 'Ver productos cercanos' : null;
}

export function lugarYDistancia(p: ProductoMapa): string {
  const km = `${(p.distancia_km ?? 0).toFixed(1).replace('.', ',')} km`;
  const lugar = p.municipality_name || p.province_name;
  return lugar ? `${lugar}, ${km}` : km;
}

export function puntoDesdeProducto(p: ProductoMapa): PuntoMapa {
  return {
    id: p.provider_id, nombre: p.provider_name, tipo: p.tipo, lat: p.lat, lng: p.lng,
    aproximado: p.aproximado, plan: p.subscription_plan, detras: 0, cy: 0, cx: 0, resumen: '',
  };
}

type ParamsProductos = { q?: string; category?: string; sort: OrdenProductos; page: number };

export function qsProductos(bbox: Bbox, p: ParamsProductos): string {
  const qs = new URLSearchParams({
    bbox: `${bbox.sur},${bbox.oeste},${bbox.norte},${bbox.este}`, sort: p.sort, page: String(p.page),
  });
  if (p.q) qs.set('q', p.q);
  if (p.category) qs.set('category', p.category);
  return qs.toString();
}

export async function pedirProductos(bbox: Bbox, p: ParamsProductos, signal: AbortSignal): Promise<MapaProductosRespuesta> {
  const res = await fetch(`${configApi.baseUrl}/mapa/productos?${qsProductos(bbox, p)}`, { signal });
  if (!res.ok) throw new Error('No se pudieron cargar los productos');
  return (await res.json()) as MapaProductosRespuesta;
}

export function cajaQueIncluye(b: Bbox, punto: { lat: number; lng: number }): Bbox {
  return {
    sur: Math.min(b.sur, punto.lat), norte: Math.max(b.norte, punto.lat),
    oeste: Math.min(b.oeste, punto.lng), este: Math.max(b.este, punto.lng),
  };
}

export function claveProductos(zona: Bbox | null, q: string, category: string, sort: OrdenProductos): string {
  if (!zona) return '';
  return JSON.stringify([zona.sur, zona.oeste, zona.norte, zona.este, q, category, sort]);
}

/** El tocado va primero aunque el catálogo filtrado no lo traiga: si la búsqueda coincidió por el
 *  nombre del negocio, el catálogo del negocio (que solo mira el artículo) no lo devuelve. */
export function articulosConMarcado<T extends CatalogItem>(items: T[], marcado: T | null | undefined): T[] {
  return marcado ? [marcado, ...items.filter((i) => i.id !== marcado.id)] : items;
}

/** El botón de volver de una ficha abierta desde la lista: «‹ N productos». */
export function etiquetaVolverProductos(total: number): string {
  return `${total} ${total === 1 ? 'producto' : 'productos'}`;
}

/** Bbox → el `LngLatBounds` de MapLibre RN, que va en orden GeoJSON (oeste, sur, este, norte). */
export function limitesDeCaja(b: Bbox): [number, number, number, number] {
  return [b.oeste, b.sur, b.este, b.norte];
}

/**
 * «Ver más»: la página siguiente se pega solo si la búsqueda (zona, texto, categoría y orden) sigue
 * siendo la misma con la que se pidió; si no, es de otra lista y se descarta (`null`). Sin repetir
 * ids: un empate de orden entre dos páginas podría traer el mismo artículo dos veces.
 */
export function pegarPagina(
  actuales: ProductoMapa[], nuevos: ProductoMapa[], claveAlPedir: string, claveAhora: string,
): ProductoMapa[] | null {
  if (claveAlPedir !== claveAhora) return null;
  const vistos = new Set(actuales.map((p) => p.id));
  return [...actuales, ...nuevos.filter((p) => !vistos.has(p.id))];
}
