import { ErrorApi } from '@oficio/shared';
import { crearSesion } from '../src/lib/sesion';

function almacenFalso(inicial: string | null = null) {
  let valor = inicial;
  return { leer: jest.fn(async () => valor), guardar: jest.fn(async (t: string) => { valor = t; }), borrar: jest.fn(async () => { valor = null; }), get valor() { return valor; } };
}
const usuario = { id: 'u1', email: 'a@b.cu', full_name: 'Ana', user_type: 'client', is_verified: false } as const;

describe('sesión', () => {
  it('sin token arranca como visitante sin llamar a la API', async () => {
    const api = { auth: { me: jest.fn() } } as any;
    expect(await crearSesion({ almacen: almacenFalso(), api }).arrancar()).toBeNull();
    expect(api.auth.me).not.toHaveBeenCalled();
  });

  it('con token válido recupera el usuario', async () => {
    const api = { auth: { me: jest.fn(async () => ({ user: usuario })) } } as any;
    expect(await crearSesion({ almacen: almacenFalso('T'), api }).arrancar()).toEqual(usuario);
  });

  it('token rechazado (401) → se borra y queda visitante', async () => {
    const almacen = almacenFalso('T');
    const api = { auth: { me: jest.fn(async () => { throw new ErrorApi(401, 'Token inválido'); }) } } as any;
    expect(await crearSesion({ almacen, api }).arrancar()).toBeNull();
    expect(almacen.valor).toBeNull();
  });

  it('sin red al arrancar NO cierra la sesión (se reintenta luego)', async () => {
    const almacen = almacenFalso('T');
    const api = { auth: { me: jest.fn(async () => { throw new ErrorApi(0, 'Sin conexión'); }) } } as any;
    await expect(crearSesion({ almacen, api }).arrancar()).rejects.toMatchObject({ status: 0 });
    expect(almacen.valor).toBe('T');
  });

  it('entrar guarda el token', async () => {
    const almacen = almacenFalso();
    const api = { auth: { login: jest.fn(async () => ({ token: 'NUEVO', user: usuario })) } } as any;
    expect(await crearSesion({ almacen, api }).entrar({ email: 'a@b.cu', password: 'x' })).toEqual(usuario);
    expect(almacen.valor).toBe('NUEVO');
  });
});
