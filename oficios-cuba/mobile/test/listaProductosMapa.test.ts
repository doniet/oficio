import type { ProductoMapa, PuntoMapa } from '@oficio/shared';
import { etiquetaVolverProductos, limitesDeCaja, pegarPagina } from '../src/lib/productosMapa';
import {
  ESTADO_PANEL_VACIO, contenidoHoja, reduceAbrirLista, reduceAbrirProductos, reduceAbrirPunto, reduceCerrar,
  reduceElegirDeLista, reduceElegirProducto, textoBotonProductos,
} from '../src/lib/panelMapa';
import { fondoHoja } from '../src/lib/hojaPunto';

const punto = (id: string): PuntoMapa => ({ id, tipo: 'negocio', nombre: id, lat: 20, lng: -79, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: 'x' });
const producto = (id: string): ProductoMapa => ({
  id, name: id, provider_id: 'u1', provider_name: 'Ana', provider_avatar: null, subscription_plan: 'pro',
  contact_mode: 'whatsapp', whatsapp: null, province_name: null, municipality_name: null,
  lat: 22.05, lng: -79.95, tipo: 'negocio', aproximado: false,
} as ProductoMapa);

describe('contenidoHoja', () => {
  it('cerrada sin nada', () => {
    expect(contenidoHoja(ESTADO_PANEL_VACIO)).toBeNull();
  });
  it('la lista de productos sola', () => {
    expect(contenidoHoja(reduceAbrirProductos(ESTADO_PANEL_VACIO))).toBe('productos');
  });
  it('una ficha abierta desde productos tapa la lista', () => {
    expect(contenidoHoja(reduceElegirProducto(reduceAbrirProductos(ESTADO_PANEL_VACIO), producto('a')))).toBe('ficha');
  });
  it('una celda abierta con productos detrás es la celda', () => {
    const e = reduceAbrirLista(reduceAbrirProductos(ESTADO_PANEL_VACIO), [punto('a'), punto('b')]);
    expect(contenidoHoja(e)).toBe('celda');
  });
  it('una ficha elegida de la celda', () => {
    const e = reduceElegirDeLista(reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('a'), punto('b')]), punto('a'));
    expect(contenidoHoja(e)).toBe('ficha');
  });
});

describe('textoBotonProductos', () => {
  const cerrada = reduceCerrar(reduceAbrirProductos(ESTADO_PANEL_VACIO));
  it('con la lista cerrada en la pestaña Productos, la reabre', () => {
    expect(textoBotonProductos({ enProductos: true, panel: cerrada, total: 12, fuera: 3 })).toBe('Ver 12 productos');
    expect(textoBotonProductos({ enProductos: true, panel: cerrada, total: 1, fuera: 0 })).toBe('Ver 1 producto');
    expect(textoBotonProductos({ enProductos: true, panel: cerrada, total: 0, fuera: 2 })).toBe('Ver productos cercanos');
  });
  it('nada que enseñar: sin botón', () => {
    expect(textoBotonProductos({ enProductos: true, panel: cerrada, total: 0, fuera: 0 })).toBeNull();
  });
  it('fuera de la pestaña Productos (o de la vista mapa): sin botón', () => {
    expect(textoBotonProductos({ enProductos: false, panel: cerrada, total: 12, fuera: 0 })).toBeNull();
  });
  // Sin esto, un fallo de red con la lista cerrada deja 0/0, esconde el botón y no queda forma de
  // volver a la lista ni a su «Reintentar».
  it('con error y nada contado, sigue ofreciendo volver a la lista', () => {
    expect(textoBotonProductos({ enProductos: true, panel: cerrada, total: 0, fuera: 0, error: true })).toBe('Ver productos');
  });
  it('con error y la hoja abierta: sin botón', () => {
    const abierta = reduceAbrirProductos(ESTADO_PANEL_VACIO);
    expect(textoBotonProductos({ enProductos: true, panel: abierta, total: 0, fuera: 0, error: true })).toBeNull();
  });
  it('con error fuera de la pestaña Productos: sin botón', () => {
    expect(textoBotonProductos({ enProductos: false, panel: cerrada, total: 0, fuera: 0, error: true })).toBeNull();
  });
  it('sin error y nada contado: sin botón, como antes', () => {
    expect(textoBotonProductos({ enProductos: true, panel: cerrada, total: 0, fuera: 0, error: false })).toBeNull();
  });
  it('oculto mientras haya hoja abierta, sea la lista, una ficha o una celda', () => {
    const abierta = reduceAbrirProductos(ESTADO_PANEL_VACIO);
    expect(textoBotonProductos({ enProductos: true, panel: abierta, total: 12, fuera: 0 })).toBeNull();
    expect(textoBotonProductos({ enProductos: true, panel: reduceAbrirPunto(cerrada, punto('a')), total: 12, fuera: 0 })).toBeNull();
    expect(textoBotonProductos({ enProductos: true, panel: reduceAbrirLista(cerrada, [punto('a'), punto('b')]), total: 12, fuera: 0 })).toBeNull();
  });
});

describe('fondoHoja', () => {
  // Con la lista de productos asomada el mapa tiene que seguir usable: el fondo ni se ve ni
  // intercepta toques hasta el anclaje abierto. `disappearsOnIndex` es lo que decide si recibe
  // toques (la librería los deja pasar con el índice <= ese valor), no solo si se ve.
  it('lista de productos: aparece al abrir del todo y deja pasar toques asomada', () => {
    expect(fondoHoja('productos')).toEqual({ appearsOnIndex: 1, disappearsOnIndex: 0 });
  });
  it('ficha y celda: como siempre, desde asomada', () => {
    expect(fondoHoja('ficha')).toEqual({ appearsOnIndex: 0, disappearsOnIndex: -1 });
    expect(fondoHoja('celda')).toEqual({ appearsOnIndex: 0, disappearsOnIndex: -1 });
    expect(fondoHoja(null)).toEqual({ appearsOnIndex: 0, disappearsOnIndex: -1 });
  });
});

describe('etiquetaVolverProductos', () => {
  it('singular y plural', () => {
    expect(etiquetaVolverProductos(1)).toBe('1 producto');
    expect(etiquetaVolverProductos(7)).toBe('7 productos');
    expect(etiquetaVolverProductos(0)).toBe('0 productos');
  });
});

describe('limitesDeCaja', () => {
  it('en el orden de MapLibre: oeste, sur, este, norte', () => {
    expect(limitesDeCaja({ sur: 22, oeste: -80, norte: 22.1, este: -79.9 })).toEqual([-80, 22, -79.9, 22.1]);
  });
});

describe('pegarPagina', () => {
  const k1 = 'zona-1';
  it('pega la página siguiente si la búsqueda no cambió mientras llegaba', () => {
    expect(pegarPagina([producto('a')], [producto('b')], k1, k1)!.map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('descarta la página de otra zona o de otra búsqueda', () => {
    expect(pegarPagina([producto('a')], [producto('b')], k1, 'zona-2')).toBeNull();
  });
  it('no repite uno que ya estaba (un empate de orden entre páginas)', () => {
    expect(pegarPagina([producto('a')], [producto('a'), producto('b')], k1, k1)!.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
