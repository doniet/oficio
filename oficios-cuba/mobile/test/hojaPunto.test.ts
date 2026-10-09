import type { PuntoMapa } from '@oficio/shared';
import { accionAtras } from '../src/lib/hojaPunto';

const punto = (id: string): PuntoMapa => ({ id, tipo: 'oficio', nombre: 'Ana', lat: 20, lng: -79, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: 'x' });

describe('accionAtras', () => {
  it('con la hoja cerrada, deja pasar el Atrás — sale de la pantalla', () => {
    expect(accionAtras({ punto: null, lista: null, hayListaPrevia: false, desdeProductos: false })).toBe('nada');
  });

  it('con una ficha abierta que no vino de una lista, cierra la hoja', () => {
    expect(accionAtras({ punto: punto('p1'), lista: null, hayListaPrevia: false, desdeProductos: false })).toBe('cerrar');
  });

  it('con la lista abierta, cierra la hoja y no saca al usuario de Explorar', () => {
    expect(accionAtras({ punto: null, lista: [punto('p1'), punto('p2')], hayListaPrevia: false, desdeProductos: false })).toBe('cerrar');
  });

  // El caso que motiva el cambio: quien entra en una celda de cinco y se equivoca de negocio no
  // puede perder la celda y tener que volver a acertarle al pin.
  it('con una ficha que vino de una lista, VUELVE a la lista en vez de cerrar', () => {
    expect(accionAtras({ punto: punto('p1'), lista: null, hayListaPrevia: true, desdeProductos: false })).toBe('volver-a-lista');
  });

  it('volver a la lista gana a cerrar: el orden de las ramas importa', () => {
    // Si la rama de «cerrar» se evaluara primero, este caso cerraría la hoja y el usuario perdería
    // la celda. Se fija aquí para que un reordenado futuro rompa una prueba y no la experiencia.
    expect(accionAtras({ punto: punto('p1'), lista: [punto('p2')], hayListaPrevia: true, desdeProductos: false })).toBe('volver-a-lista');
  });

  it('sin ficha y sin lista, una lista previa colgada no inventa un Atrás', () => {
    expect(accionAtras({ punto: null, lista: null, hayListaPrevia: true, desdeProductos: false })).toBe('nada');
  });

  it('con una ficha abierta desde un producto, VUELVE a la lista de productos', () => {
    expect(accionAtras({ punto: punto('p1'), lista: null, hayListaPrevia: false, desdeProductos: true })).toBe('volver-a-productos');
  });

  it('con lista previa, volver a la lista gana a volver a productos', () => {
    expect(accionAtras({ punto: punto('p1'), lista: null, hayListaPrevia: true, desdeProductos: true })).toBe('volver-a-lista');
  });

  it('con solo la lista de productos a la vista (sin punto ni celda), cierra', () => {
    expect(accionAtras({ punto: null, lista: null, hayListaPrevia: false, desdeProductos: false, productos: true })).toBe('cerrar');
  });
});
