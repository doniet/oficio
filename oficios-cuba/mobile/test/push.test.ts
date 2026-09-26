import { ErrorApi } from '@oficio/shared';
import { accionDeToque, crearGestorPush, rutaDeNotificacion } from '../src/lib/push';

function deps(api: any, token: string | null = 'FCM-1') {
  let lista: string[] = [];
  let ultimo: string | null = null;
  return {
    api, obtenerToken: jest.fn(async () => token), plataforma: 'android' as const, version: '0.1.0',
    pendientes: { leer: jest.fn(async () => lista), guardar: jest.fn(async (l: string[]) => { lista = l; }) },
    ultimoToken: { leer: jest.fn(async () => ultimo), guardar: jest.fn(async (t: string | null) => { ultimo = t; }) },
    get lista() { return lista; },
    get ultimo() { return ultimo; },
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

  it('el refresco de token (FCM rotado en caliente) se re-registra', async () => {
    const api = { push: { registrar: jest.fn(async () => undefined), borrar: jest.fn() } };
    const d = deps(api);
    const gestor = crearGestorPush(d);
    await gestor.alRenovarToken('FCM-2');
    expect(api.push.registrar).toHaveBeenCalledWith({ canal: 'fcm', token: 'FCM-2', plataforma: 'android', app_version: '0.1.0' });
    expect(d.ultimo).toBe('FCM-2');
  });

  it('permiso revocado a mitad de sesión: al salir igual borra el token que quedó registrado', async () => {
    const api = { push: { registrar: jest.fn(async () => undefined), borrar: jest.fn(async () => undefined) } };
    const d = deps(api);
    const gestor = crearGestorPush(d);
    await gestor.alEntrar(); // registra 'FCM-1' y lo persiste como último token
    d.obtenerToken.mockResolvedValue(null); // el usuario revocó el permiso de notificaciones
    await gestor.alSalir();
    expect(api.push.borrar).toHaveBeenCalledWith('FCM-1');
    expect(d.ultimo).toBeNull();
  });
});

// Imita al backend: DELETE /api/push/devices/:token exige sesión y borra por token, sea de quien sea.
function backendFalso() {
  const dueños = new Map<string, string>();
  let sesion: string | null = null;
  const exigirSesion = () => { if (!sesion) throw new ErrorApi(401, 'No autenticado'); };
  let sinRed = false;
  const red = () => { if (sinRed) throw new ErrorApi(0, 'Sin conexión'); };
  return {
    dueños,
    entrarComo(u: string | null) { sesion = u; },
    cortarRed(v: boolean) { sinRed = v; },
    api: { push: {
      registrar: jest.fn(async (d: { token: string }) => { red(); exigirSesion(); dueños.set(d.token, sesion!); }),
      borrar: jest.fn(async (t: string) => { red(); exigirSesion(); dueños.delete(t); }),
    } },
  };
}

describe('borrado pendiente con otra cuenta', () => {
  it('el token de A que no se pudo borrar al salir se borra cuando entra B en el mismo teléfono', async () => {
    const b = backendFalso();
    const d = deps(b.api);
    const gestor = crearGestorPush(d);

    b.entrarComo('ana');
    await gestor.alEntrar();
    expect(b.dueños.get('FCM-1')).toBe('ana');

    b.cortarRed(true);
    await gestor.alSalir();          // sin red: queda pendiente
    b.entrarComo(null);
    expect(d.lista).toEqual(['FCM-1']);

    // B entra sin permiso de notificaciones (no re-registra FCM-1 a su nombre):
    // el token de A solo desaparece si el reintento con la sesión de B lo borra.
    b.cortarRed(false);
    d.obtenerToken.mockResolvedValue(null);
    b.entrarComo('beto');
    await gestor.reintentarPendientes();
    await gestor.alEntrar();

    expect(b.dueños.has('FCM-1')).toBe(false);
    expect(d.lista).toEqual([]);
  });
});

describe('cerrar sesión no pide permiso', () => {
  it('sin token guardado, alSalir pide el token del dispositivo SIN solicitar permiso', async () => {
    const api = { push: { registrar: jest.fn(), borrar: jest.fn(async () => undefined) } };
    const d = deps(api);
    await crearGestorPush(d).alSalir();
    expect(d.obtenerToken).toHaveBeenCalledWith({ pedirPermiso: false });
    expect(api.push.borrar).toHaveBeenCalledWith('FCM-1');
  });

  it('obtenerTokenFcm({ pedirPermiso: false }) sin permiso concedido no abre el diálogo', async () => {
    jest.resetModules();
    const requestPermissionsAsync = jest.fn(async () => ({ granted: true }));
    jest.doMock('expo-device', () => ({ isDevice: true }));
    jest.doMock('expo-notifications', () => ({
      AndroidImportance: { HIGH: 6 },
      setNotificationChannelAsync: jest.fn(async () => null),
      getPermissionsAsync: jest.fn(async () => ({ granted: false })),
      requestPermissionsAsync,
      getDevicePushTokenAsync: jest.fn(async () => ({ data: 'FCM-X' })),
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    jest.doMock('expo-secure-store', () => ({}));

    const { obtenerTokenFcm } = require('../src/lib/push');
    await expect(obtenerTokenFcm({ pedirPermiso: false })).resolves.toBeNull();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    // Por defecto (al entrar) sí se pide.
    await expect(obtenerTokenFcm()).resolves.toBe('FCM-X');
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);

    jest.dontMock('expo-device');
    jest.dontMock('expo-notifications');
    jest.dontMock('react-native');
    jest.dontMock('expo-secure-store');
    jest.resetModules();
  });
});

describe('estado de push para Cuenta', () => {
  function cargar(n: { isDevice?: boolean; granted?: boolean; token?: () => Promise<{ data: string }> }) {
    jest.resetModules();
    const requestPermissionsAsync = jest.fn();
    jest.doMock('expo-device', () => ({ isDevice: n.isDevice ?? true }));
    jest.doMock('expo-notifications', () => ({
      getPermissionsAsync: jest.fn(async () => ({ granted: n.granted ?? true })),
      requestPermissionsAsync,
      getDevicePushTokenAsync: jest.fn(n.token ?? (async () => ({ data: 'FCM-1' }))),
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    jest.doMock('expo-secure-store', () => ({}));
    return { estadoPush: require('../src/lib/push').estadoPush as () => Promise<string>, requestPermissionsAsync };
  }
  afterEach(() => {
    jest.dontMock('expo-device');
    jest.dontMock('expo-notifications');
    jest.dontMock('react-native');
    jest.dontMock('expo-secure-store');
    jest.resetModules();
  });

  it('activas / sin permiso / no disponibles (sin servicios de Google o sin google-services.json), sin pedir permiso nunca', async () => {
    let m = cargar({});
    await expect(m.estadoPush()).resolves.toBe('activas');
    m = cargar({ granted: false });
    await expect(m.estadoPush()).resolves.toBe('sin_permiso');
    expect(m.requestPermissionsAsync).not.toHaveBeenCalled();
    // Un emulador con servicios de Google también tiene token: no se descarta por no ser "dispositivo".
    m = cargar({ isDevice: false });
    await expect(m.estadoPush()).resolves.toBe('activas');
    m = cargar({ token: async () => { throw new Error('Default FirebaseApp is not initialized'); } });
    await expect(m.estadoPush()).resolves.toBe('no_disponibles');
  });
});

describe('tocar una notificación', () => {
  const datos = { tipo: 'mensaje', conversation_id: 'c1' };
  it('con sesión abre el chat; sin sesión va a Entrar con volver al chat; arrancando espera', () => {
    expect(accionDeToque(datos, { cargando: false, sinRed: false, hayUsuario: true })).toEqual({ tipo: 'abrir', ruta: '/conversacion/c1' });
    expect(accionDeToque(datos, { cargando: false, sinRed: false, hayUsuario: false })).toEqual({ tipo: 'entrar', volver: '/conversacion/c1' });
    expect(accionDeToque(datos, { cargando: true, sinRed: false, hayUsuario: false })).toEqual({ tipo: 'esperar' });
    expect(accionDeToque(datos, { cargando: false, sinRed: true, hayUsuario: false })).toEqual({ tipo: 'abrir', ruta: '/conversacion/c1' });
    expect(accionDeToque({ tipo: 'prueba' }, { cargando: false, sinRed: false, hayUsuario: false })).toBeNull();
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
    jest.doMock('expo-secure-store', () => ({}));

    const { obtenerTokenFcm } = require('../src/lib/push');
    await expect(obtenerTokenFcm()).resolves.toBeNull();

    jest.dontMock('expo-device');
    jest.dontMock('expo-notifications');
    jest.dontMock('react-native');
    jest.dontMock('expo-secure-store');
    jest.resetModules();
  });
});
