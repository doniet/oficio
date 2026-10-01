import { tituloCelda } from '../src/lib/listaCelda';

describe('tituloCelda', () => {
  it('singular con uno', () => {
    expect(tituloCelda(1)).toBe('1 negocio en esta zona');
  });

  it('plural con varios', () => {
    expect(tituloCelda(4)).toBe('4 negocios en esta zona');
  });

  // Una celda que vuelve vacía se abre con el propio punto tocado, así que 0 no debería llegar —
  // pero si llega, el título no puede decir «0 negocios» en una lista que muestra uno.
  it('con cero cae en el título neutro, sin contar', () => {
    expect(tituloCelda(0)).toBe('Negocios de esta zona');
  });
});
