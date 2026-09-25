import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ClienteApi } from '@oficio/shared';

// Token FCM nativo (getDevicePushTokenAsync), NO el de Expo: así el teléfono no depende
// de los servidores de Expo, cuya disponibilidad desde Cuba no está verificada.
// Con `pedirPermiso: false` nunca muestra el diálogo del sistema: solo da token si el permiso
// ya estaba concedido (cerrar sesión no debe preguntar nada).
export async function obtenerTokenFcm({ pedirPermiso = true }: { pedirPermiso?: boolean } = {}): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('mensajes', { name: 'Mensajes', importance: Notifications.AndroidImportance.HIGH });
    }
    const actual = await Notifications.getPermissionsAsync();
    const permiso = actual.granted || !pedirPermiso ? actual : await Notifications.requestPermissionsAsync();
    if (!permiso.granted) return null;
    return (await Notifications.getDevicePushTokenAsync()).data as string;
  } catch {
    // Sin credenciales de Firebase (google-services.json), getDevicePushTokenAsync lanza en Android.
    // No debe tumbar la app: sencillamente no hay push hasta que el proyecto tenga credenciales.
    return null;
  }
}

export type EstadoPush = 'activas' | 'sin_permiso' | 'no_disponibles';

export const TEXTO_ESTADO_PUSH: Record<EstadoPush, string> = {
  activas: 'Notificaciones: activas',
  sin_permiso: 'Notificaciones: sin permiso',
  no_disponibles: 'Notificaciones: no disponibles',
};

// Estado para mostrar en Cuenta. Nunca pide permiso: solo lee el que hay.
// "no disponibles" = emulador/simulador o build sin credenciales de Firebase (no hay token FCM).
export async function estadoPush(): Promise<EstadoPush> {
  try {
    if (!Device.isDevice) return 'no_disponibles';
    if (!(await Notifications.getPermissionsAsync()).granted) return 'sin_permiso';
    return (await Notifications.getDevicePushTokenAsync()).data ? 'activas' : 'no_disponibles';
  } catch {
    return 'no_disponibles';
  }
}

export const pendientesDeBorrar = {
  leer: async () => JSON.parse((await SecureStore.getItemAsync('push_pendientes')) ?? '[]') as string[],
  guardar: (l: string[]) => SecureStore.setItemAsync('push_pendientes', JSON.stringify(l)),
};

// Último token que se registró con éxito contra el backend. Sin esto, si el permiso de notificaciones
// se revoca a mitad de sesión, `alSalir` no tiene forma de saber qué token borrar (obtenerToken() da
// null) y el token queda vivo en el backend recibiendo los avisos del siguiente usuario del teléfono.
export const ultimoTokenRegistrado = {
  leer: () => SecureStore.getItemAsync('push_ultimo_token'),
  guardar: (t: string | null) => (t ? SecureStore.setItemAsync('push_ultimo_token', t) : SecureStore.deleteItemAsync('push_ultimo_token')),
};

type Deps = {
  api: Pick<ClienteApi, 'push'>;
  obtenerToken(opciones?: { pedirPermiso: boolean }): Promise<string | null>;
  plataforma: 'android' | 'ios';
  version: string;
  pendientes: { leer(): Promise<string[]>; guardar(l: string[]): Promise<void> };
  ultimoToken: { leer(): Promise<string | null>; guardar(t: string | null): Promise<void> };
};

export function crearGestorPush({ api, obtenerToken, plataforma, version, pendientes, ultimoToken }: Deps) {
  async function registrar(token: string) {
    await api.push.registrar({ canal: 'fcm', token, plataforma, app_version: version });
    await ultimoToken.guardar(token);
  }
  return {
    async alEntrar() {
      const token = await obtenerToken();
      if (token) await registrar(token);
    },
    // FCM puede rotar el token en caliente (poco común, pero ocurre). Sin re-registrarlo, el backend
    // sigue mandando al token viejo (ya inválido) y el usuario deja de recibir avisos en silencio.
    async alRenovarToken(token: string) {
      await registrar(token);
    },
    // Se borra el ÚLTIMO TOKEN REGISTRADO (persistido), no el que devuelva obtenerToken() ahora mismo:
    // si el usuario revocó el permiso de notificaciones a mitad de sesión, obtenerToken() da null pero
    // el backend todavía tiene un token válido de este usuario que hay que borrar igual.
    // Si el borrado falla (sin red), el siguiente usuario del teléfono no debe recibir avisos del anterior:
    // se guarda y se reintenta en el próximo arranque (con la sesión que haya: el backend borra por token).
    // Sin token guardado, solo se consulta el del dispositivo si el permiso YA estaba concedido:
    // cerrar sesión nunca debe abrir el diálogo de permiso de notificaciones.
    async alSalir() {
      const token = (await ultimoToken.leer()) ?? (await obtenerToken({ pedirPermiso: false }).catch(() => null));
      if (!token) return;
      try {
        await api.push.borrar(token);
        await ultimoToken.guardar(null);
      } catch {
        await pendientes.guardar([...new Set([...(await pendientes.leer()), token])]);
      }
    },
    async reintentarPendientes() {
      const quedan: string[] = [];
      for (const t of await pendientes.leer()) {
        try { await api.push.borrar(t); } catch { quedan.push(t); }
      }
      await pendientes.guardar(quedan);
    },
  };
}

export type AccionToque = { tipo: 'abrir'; ruta: string } | { tipo: 'entrar'; volver: string } | { tipo: 'esperar' } | null;

// Qué hacer al tocar una notificación. Mientras arranca la sesión se espera (no se sabe si hay
// usuario). Sin sesión se va a Entrar con `volver` = el chat, en vez de abrir un chat que daría 401.
// Con `sinRed` hay token guardado sin comprobar: se abre el chat, que reintenta solo al volver la red.
export function accionDeToque(datos: Record<string, unknown> | undefined, s: { cargando: boolean; sinRed: boolean; hayUsuario: boolean }): AccionToque {
  const ruta = rutaDeNotificacion(datos);
  if (!ruta) return null;
  if (s.cargando) return { tipo: 'esperar' };
  return s.hayUsuario || s.sinRed ? { tipo: 'abrir', ruta } : { tipo: 'entrar', volver: ruta };
}

export function rutaDeNotificacion(datos: Record<string, unknown> | undefined): string | null {
  return datos?.tipo === 'mensaje' && typeof datos.conversation_id === 'string' ? `/conversacion/${datos.conversation_id}` : null;
}
