import type { ProductoMapa, PuntoMapa } from '@oficio/shared';
import { puntoDesdeProducto, textoVerProductos } from './productosMapa';

/**
 * Qué muestra la hoja del mapa. Gemelo del estado que ExplorarMapa.tsx gobierna en la web, aquí
 * aparte de la pantalla para poder probar las transiciones: el proyecto no renderiza componentes en
 * las pruebas, así que una decisión que vive dentro de un `useState` no se puede verificar.
 *
 * Invariante: `punto` y `lista` nunca son ambos no nulos. HojaPunto da prioridad a la lista, pero
 * no debería tener que ejercerla.
 */
export type EstadoPanel = {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  /** La lista a la que volver cuando se eligió uno de sus negocios. Evita volver a pedir la celda. */
  listaPrevia: PuntoMapa[] | null;
  errorLista: string;
  reintentarLista: (() => void) | null;
  /** La lista de productos está a la vista (o detrás de una ficha abierta desde ella). */
  productos: boolean;
  /** El producto tocado: va primero y marcado en la ficha de su negocio. */
  productoMarcado: ProductoMapa | null;
  /** La ficha actual se abrió tocando un producto (no un pin ni una celda). */
  fichaDeProductos: boolean;
};

export const ESTADO_PANEL_VACIO: EstadoPanel = {
  punto: null, lista: null, listaPrevia: null, errorLista: '', reintentarLista: null,
  productos: false, productoMarcado: null, fichaDeProductos: false,
};

export function reduceAbrirPunto(e: EstadoPanel, punto: PuntoMapa): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, punto, productos: e.productos };
}

export function reduceAbrirLista(
  e: EstadoPanel, lista: PuntoMapa[], errorLista = '', reintentarLista: (() => void) | null = null,
): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, lista, errorLista, reintentarLista, productos: e.productos };
}

export function reduceElegirDeLista(e: EstadoPanel, punto: PuntoMapa): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, punto, listaPrevia: e.lista, productos: e.productos };
}

export function reduceVolverALista(e: EstadoPanel): EstadoPanel {
  if (!e.listaPrevia) return e;
  return { ...ESTADO_PANEL_VACIO, lista: e.listaPrevia, productos: e.productos };
}

export function reduceAbrirProductos(_e: EstadoPanel): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, productos: true };
}

export function reduceElegirProducto(_e: EstadoPanel, p: ProductoMapa): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, punto: puntoDesdeProducto(p), productoMarcado: p, fichaDeProductos: true, productos: true };
}

export function reduceVolverAProductos(e: EstadoPanel): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, productos: true, productoMarcado: e.productoMarcado };
}

/** Atrás vuelve a productos solo si no hay una celda detrás: la lista previa gana. */
export function desdeProductos(e: EstadoPanel): boolean {
  return e.fichaDeProductos && e.punto !== null && e.listaPrevia === null;
}

export function reduceCerrar(_e: EstadoPanel): EstadoPanel {
  return ESTADO_PANEL_VACIO;
}

export type ContenidoCelda =
  | { clase: 'ficha'; punto: PuntoMapa }
  | { clase: 'lista'; puntos: PuntoMapa[] };

/**
 * Qué enseñar tras pedir la celda de un grupo.
 *
 * Con uno o ninguno se enseña una ficha, no una lista: el «+N» prometía varios, pero si el servidor
 * solo puede nombrar uno (datos cambiados entre la carga del área y el toque, o el filtro excluyó al
 * resto), una lista de un elemento es un paso extra por nada. Vacía → la ficha del punto que se
 * tocó, para no dejar la hoja en blanco tras una promesa.
 *
 * 🚨 Divergencia deliberada con la web, que en estos casos abre una lista de uno.
 */
export function contenidoDeCelda(tocado: PuntoMapa, devueltos: PuntoMapa[]): ContenidoCelda {
  if (devueltos.length <= 1) return { clase: 'ficha', punto: devueltos[0] ?? tocado };
  return { clase: 'lista', puntos: devueltos };
}

export type ContenidoHoja = 'celda' | 'ficha' | 'productos' | null;

/** Qué enseña la hoja. Misma prioridad que HojaPunto: celda, ficha y, solo sin ninguna, productos. */
export function contenidoHoja(e: Pick<EstadoPanel, 'punto' | 'lista' | 'productos'>): ContenidoHoja {
  if (e.lista) return 'celda';
  if (e.punto) return 'ficha';
  return e.productos ? 'productos' : null;
}

/**
 * El botón flotante que reabre la lista de productos cerrada. Solo en la pestaña Productos de la
 * vista mapa (`enProductos`) y nunca con la hoja abierta, sea lo que sea lo que enseñe: taparía el
 * mismo sitio que la hoja.
 */
export function textoBotonProductos({ enProductos, panel, total, fuera }: {
  enProductos: boolean; panel: EstadoPanel; total: number; fuera: number;
}): string | null {
  if (!enProductos || contenidoHoja(panel) !== null) return null;
  return textoVerProductos(total, fuera);
}
