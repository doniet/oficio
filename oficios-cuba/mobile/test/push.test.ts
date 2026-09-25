import { ErrorApi } from '@oficio/shared';
import { crearGestorPush, rutaDeNotificacion } from '../src/lib/push';

function deps(api: any, token: string | null = 'FCM-1') {
  let lista: string[] = [];
  return {
    api, obtenerToken: jest.fn(async () => token), plataforma: 'android' as const, version: '0.1.0',
    pendientes: { leer: jest.fn(async () => lista), guardar: jest.fn(async (l: string[]) => { lista = l; }) },
    get lista() { return lista; },
  };
}

describe('gestor de push', () => {
  it('al entrar registra el token FCM del dispositivo', async () => {
    const api = { push: { registrar: jest.fn(async () => undefined), borrar: jest.fn() } };
    await crearGestorPush(deps(api)).alEntrar();
    expect(api.push.registrar).toHaveBeenCalledWith({ canal: 'fcm', token: 'FCM-1', plataforma: 'android', app_version: '0.1.0' });
  });

  it('sin permiso (token null) no registra nada', async () => {
    const api = { push: { registrar: jest.fn(), borrar: jest.fn() } };
    await crearGestorPush(deps(api, null)).alEntrar();
    expect(api.push.registrar).not.toHaveBeenCalled();
  });

  it('al salir sin red guarda el token para borrarlo después, y lo borra al reintentar', async () => {
    const api = { push: { registrar: jest.fn(), borrar: jest.fn().mockRejectedValueOnce(new ErrorApi(0, 'Sin conexión')).mockResolvedValue(undefined) } };
    const d = deps(api);
    const gestor = crearGestorPush(d);
    await gestor.alSalir();
    expect(d.lista).toEqual(['FCM-1']);
    await gestor.reintentarPendientes();
    expect(api.push.borrar).toHaveBeenCalledTimes(2);
    expect(d.lista).toEqual([]);
  });

  it('la notificación de mensaje abre la conversación; otras no navegan', () => {
    expect(rutaDeNotificacion({ tipo: 'mensaje', conversation_id: 'c1' })).toBe('/conversacion/c1');
    expect(rutaDeNotificacion({ tipo: 'prueba', n: '1' })).toBeNull();
    expect(rutaDeNotificacion({ tipo: 'mensaje' })).toBeNull();
  });
});

describe('obtenerTokenFcm sin credenciales de Firebase', () => {
  // Sin google-services.json, getDevicePushTokenAsync() lanza en Android real (jest-expo simula
  // Device.isDevice = false, así que aquí se fuerza el camino de dispositivo real con mocks).
  it('no revienta la app: resuelve a null', async () => {
    jest.resetModules();
    jest.doMock('expo-device', () => ({ isDevice: true }));
    jest.doMock('expo-notifications', () => ({
      AndroidImportance: { HIGH: 6 },
      setNotificationChannelAsync: jest.fn(async () => null),
      getPermissionsAsync: jest.fn(async () => ({ granted: true })),
      requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
      getDevicePushTokenAsync: jest.fn(async () => { throw new Error('Default FirebaseApp is not initialized'); }),
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));

    const { obtenerTokenFcm } = require('../src/lib/push');
    await expect(obtenerTokenFcm()).resolves.toBeNull();

    jest.dontMock('expo-device');
    jest.dontMock('expo-notifications');
    jest.dontMock('react-native');
    jest.resetModules();
  });
});
