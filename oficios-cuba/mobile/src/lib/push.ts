import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ClienteApi } from '@oficio/shared';

// Token FCM nativo (getDevicePushTokenAsync), NO el de Expo: así el teléfono no depende
// de los servidores de Expo, cuya disponibilidad desde Cuba no está verificada.
export async function obtenerTokenFcm(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('mensajes', { name: 'Mensajes', importance: Notifications.AndroidImportance.HIGH });
    }
    const actual = await Notifications.getPermissionsAsync();
    const permiso = actual.granted ? actual : await Notifications.requestPermissionsAsync();
    if (!permiso.granted) return null;
    return (await Notifications.getDevicePushTokenAsync()).data as string;
  } catch {
    // Sin credenciales de Firebase (google-services.json), getDevicePushTokenAsync lanza en Android.
    // No debe tumbar la app: sencillamente no hay push hasta que el proyecto tenga credenciales.
    return null;
  }
}

export const pendientesDeBorrar = {
  leer: async () => JSON.parse((await SecureStore.getItemAsync('push_pendientes')) ?? '[]') as string[],
  guardar: (l: string[]) => SecureStore.setItemAsync('push_pendientes', JSON.stringify(l)),
};

type Deps = {
  api: Pick<ClienteApi, 'push'>;
  obtenerToken(): Promise<string | null>;
  plataforma: 'android' | 'ios';
  version: string;
  pendientes: { leer(): Promise<string[]>; guardar(l: string[]): Promise<void> };
};

export function crearGestorPush({ api, obtenerToken, plataforma, version, pendientes }: Deps) {
  return {
    async alEntrar() {
      const token = await obtenerToken();
      if (token) await api.push.registrar({ canal: 'fcm', token, plataforma, app_version: version });
    },
    // Si el borrado falla (sin red), el siguiente usuario del teléfono no debe recibir avisos del anterior:
    // se guarda y se reintenta en el próximo arranque.
    async alSalir() {
      const token = await obtenerToken().catch(() => null);
      if (!token) return;
      try { await api.push.borrar(token); } catch { await pendientes.guardar([...new Set([...(await pendientes.leer()), token])]); }
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

export function rutaDeNotificacion(datos: Record<string, unknown> | undefined): string | null {
  return datos?.tipo === 'mensaje' && typeof datos.conversation_id === 'string' ? `/conversacion/${datos.conversation_id}` : null;
}
