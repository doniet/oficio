import type { PuntoMapa } from '@oficio/shared';
import {
  contenidoDeCelda,
  ESTADO_PANEL_VACIO,
  reduceAbrirLista,
  reduceAbrirPunto,
  reduceCerrar,
  reduceElegirDeLista,
  reduceVolverALista,
} from '../src/lib/panelMapa';

const punto = (id: string): PuntoMapa => ({ id, tipo: 'oficio', nombre: id, lat: 20, lng: -79, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: 'x' });

describe('estado del panel del mapa', () => {
  it('abrir un punto deja la ficha y ninguna lista', () => {
    const s = reduceAbrirPunto(ESTADO_PANEL_VACIO, punto('p1'));
    expect(s.punto?.id).toBe('p1');
    expect(s.lista).toBeNull();
    expect(s.listaPrevia).toBeNull();
    expect(s.errorLista).toBe('');
  });

  it('abrir la lista cierra la ficha que hubiera', () => {
    const conFicha = reduceAbrirPunto(ESTADO_PANEL_VACIO, punto('p1'));
    const s = reduceAbrirLista(conFicha, [punto('a'), punto('b')]);
    expect(s.punto).toBeNull();
    expect(s.lista?.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('la lista puede abrirse con un error y su reintento', () => {
    const reintento = () => {};
    const s = reduceAbrirLista(ESTADO_PANEL_VACIO, [], 'No pudimos cargar los negocios de esta zona.', reintento);
    expect(s.lista).toEqual([]);
    expect(s.errorLista).toBe('No pudimos cargar los negocios de esta zona.');
    expect(s.reintentarLista).toBe(reintento);
  });

  // La razón de ser de listaPrevia: volver a la celda sin pedirla otra vez.
  it('elegir de la lista recuerda la lista para poder volver', () => {
    const conLista = reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('a'), punto('b')]);
    const s = reduceElegirDeLista(conLista, punto('b'));
    expect(s.punto?.id).toBe('b');
    expect(s.lista).toBeNull();
    expect(s.listaPrevia?.map((p) => p.id)).toEqual(['a', 'b']);

    const vuelta = reduceVolverALista(s);
    expect(vuelta.punto).toBeNull();
    expect(vuelta.lista?.map((p) => p.id)).toEqual(['a', 'b']);
    expect(vuelta.listaPrevia).toBeNull();
  });

  // El otro lado de listaPrevia: si sobreviviera a un contenido nuevo, el Atrás desde un pin suelto
  // volvería a una celda de la que ese punto nunca salió.
  it('abrir un punto o una lista nuevos descartan la lista previa', () => {
    const conListaPrevia = reduceElegirDeLista(
      reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('a'), punto('b')]),
      punto('b'),
    );
    expect(conListaPrevia.listaPrevia?.map((p) => p.id)).toEqual(['a', 'b']);
    expect(reduceAbrirPunto(conListaPrevia, punto('otro')).listaPrevia).toBeNull();
    expect(reduceAbrirLista(conListaPrevia, [punto('c'), punto('d')]).listaPrevia).toBeNull();
  });

  // Review Focus 4: la zona se recargó entre el toque y la elección, y el punto elegido ya no está
  // en `puntos`. El panel no puede romperse por eso: solo guarda lo que le dan.
  it('elegir un punto que el mapa ya no tiene sigue abriendo su ficha', () => {
    const conLista = reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('fantasma')]);
    const s = reduceElegirDeLista(conLista, punto('fantasma'));
    expect(s.punto?.id).toBe('fantasma');
  });

  it('volver a la lista sin lista previa no inventa una', () => {
    const conFicha = reduceAbrirPunto(ESTADO_PANEL_VACIO, punto('p1'));
    const s = reduceVolverALista(conFicha);
    expect(s.lista).toBeNull();
    expect(s.punto?.id).toBe('p1');
  });

  // Review Focus 3: el spec solo nombra el punto abierto, pero una lista pertenece igual de fuerte
  // a la búsqueda que la produjo.
  it('cerrar limpia TODO, incluida la lista previa y el error', () => {
    const s = reduceCerrar(reduceElegirDeLista(
      reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('a')], 'fallo', () => {}),
      punto('a'),
    ));
    expect(s).toEqual(ESTADO_PANEL_VACIO);
  });
});

describe('contenidoDeCelda', () => {
  it('con varios, lista', () => {
    expect(contenidoDeCelda(punto('tocado'), [punto('a'), punto('b')]))
      .toEqual({ clase: 'lista', puntos: [punto('a'), punto('b')] });
  });

  // Review Focus 5: el «+N» prometía varios pero el servidor solo nombra uno (datos cambiados, o el
  // filtro excluyó al resto). Una lista de un elemento es un paso extra por nada.
  it('con uno solo, su ficha directa en vez de una lista de uno', () => {
    expect(contenidoDeCelda(punto('tocado'), [punto('solo')]))
      .toEqual({ clase: 'ficha', punto: punto('solo') });
  });

  it('con la celda vacía, la ficha del punto que se tocó: el «+N» prometía algo', () => {
    expect(contenidoDeCelda(punto('tocado'), []))
      .toEqual({ clase: 'ficha', punto: punto('tocado') });
  });
});
