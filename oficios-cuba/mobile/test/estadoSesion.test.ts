import { estadoSesion } from '../src/lib/estadoSesion';

const usuario = { id: 'u1' } as any;

describe('estadoSesion', () => {
  it('cargando manda sobre sinRed y usuario', () => {
    expect(estadoSesion({ cargando: true, sinRed: true, usuario })).toBe('cargando');
    expect(estadoSesion({ cargando: true, sinRed: false, usuario: null })).toBe('cargando');
  });

  it('sinRed (token conservado, no se pudo comprobar) sin flashear invitado/autenticado', () => {
    expect(estadoSesion({ cargando: false, sinRed: true, usuario: null })).toBe('sinRed');
  });

  it('sin cargando ni sinRed y sin usuario → invitado', () => {
    expect(estadoSesion({ cargando: false, sinRed: false, usuario: null })).toBe('invitado');
  });

  it('sin cargando ni sinRed y con usuario → autenticado', () => {
    expect(estadoSesion({ cargando: false, sinRed: false, usuario })).toBe('autenticado');
  });
});
