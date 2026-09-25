import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Platform } from 'react-native';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_400Regular, Figtree_600SemiBold } from '@expo-google-fonts/figtree';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ProveedorSesion, useSesion } from '../src/lib/contexto';
import { crearGestorPush, obtenerTokenFcm, pendientesDeBorrar, rutaDeNotificacion } from '../src/lib/push';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30_000 } } });

// Si el handler no responde, el sistema descarta la notificación: se declara antes de montar nada.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

type GestorRef = MutableRefObject<ReturnType<typeof crearGestorPush> | null>;

// Vive dentro de ProveedorSesion porque el gestor necesita el `api` de la sesión (con el token
// del usuario ya autenticado). Expone el gestor al layout vía `gestorRef` para que `salir()` pueda
// borrar el token del dispositivo antes de cerrar sesión.
function Push({ gestorRef }: { gestorRef: GestorRef }) {
  const { usuario, api } = useSesion();
  const queryClient = useQueryClient();

  const gestor = useMemo(() => crearGestorPush({
    api,
    obtenerToken: obtenerTokenFcm,
    plataforma: Platform.OS as 'android' | 'ios',
    version: Constants.expoConfig?.version ?? '0.0.0',
    pendientes: pendientesDeBorrar,
  }), [api]);
  gestorRef.current = gestor;

  useEffect(() => {
    if (!usuario) return;
    // Primero se reintenta el borrado pendiente (posible usuario anterior en este teléfono) y luego
    // se registra el token del usuario actual.
    gestor.reintentarPendientes().then(() => gestor.alEntrar()).catch(() => {});
  }, [usuario, gestor]);

  const respuesta = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!respuesta) return;
    const ruta = rutaDeNotificacion(respuesta.notification.request.content.data);
    if (ruta) router.push(ruta as never);
  }, [respuesta]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['conversaciones'] });
    });
    return () => sub.remove();
  }, [queryClient]);

  return null;
}

export default function Raiz() {
  // Las fuentes vienen empaquetadas en node_modules: no se descargan en el teléfono.
  const [listas] = useFonts({ BricolageGrotesque_700Bold, Figtree_400Regular, Figtree_600SemiBold });
  const gestorRef = useRef<ReturnType<typeof crearGestorPush> | null>(null);
  if (!listas) return null;
  return (
    <QueryClientProvider client={queryClient}>
      {/* Fondo claro (colores.fondo) en toda la app: iconos oscuros para que se lean. */}
      <StatusBar style="dark" />
      <ProveedorSesion alSalir={() => gestorRef.current?.alSalir() ?? Promise.resolve()}>
        <Push gestorRef={gestorRef} />
        <Stack screenOptions={{ headerTitleStyle: { fontFamily: 'Figtree_600SemiBold' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/entrar" options={{ presentation: 'modal', title: 'Entrar' }} />
          <Stack.Screen name="(auth)/registro" options={{ presentation: 'modal', title: 'Crear cuenta' }} />
          <Stack.Screen name="servicio/[id]" options={{ title: '' }} />
          <Stack.Screen name="conversacion/[id]" options={{ title: 'Conversación' }} />
        </Stack>
      </ProveedorSesion>
    </QueryClientProvider>
  );
}
