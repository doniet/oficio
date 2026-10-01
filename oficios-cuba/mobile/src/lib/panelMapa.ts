import type { PuntoMapa } from '@oficio/shared';

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
};

export const ESTADO_PANEL_VACIO: EstadoPanel = {
  punto: null, lista: null, listaPrevia: null, errorLista: '', reintentarLista: null,
};

export function reduceAbrirPunto(_e: EstadoPanel, punto: PuntoMapa): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, punto };
}

export function reduceAbrirLista(
  _e: EstadoPanel, lista: PuntoMapa[], errorLista = '', reintentarLista: (() => void) | null = null,
): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, lista, errorLista, reintentarLista };
}

export function reduceElegirDeLista(e: EstadoPanel, punto: PuntoMapa): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, punto, listaPrevia: e.lista };
}

export function reduceVolverALista(e: EstadoPanel): EstadoPanel {
  if (!e.listaPrevia) return e;
  return { ...ESTADO_PANEL_VACIO, lista: e.listaPrevia };
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
