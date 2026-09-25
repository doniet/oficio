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
import { ProveedorSesion, requiereSesion, useSesion } from '../src/lib/contexto';
import { accionDeToque, crearGestorPush, obtenerTokenFcm, pendientesDeBorrar, ultimoTokenRegistrado } from '../src/lib/push';

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
  const { usuario, api, cargando, sinRed } = useSesion();
  const queryClient = useQueryClient();

  const gestor = useMemo(() => crearGestorPush({
    api,
    obtenerToken: obtenerTokenFcm,
    plataforma: Platform.OS as 'android' | 'ios',
    version: Constants.expoConfig?.version ?? '0.0.0',
    pendientes: pendientesDeBorrar,
    ultimoToken: ultimoTokenRegistrado,
  }), [api]);
  gestorRef.current = gestor;

  useEffect(() => {
    if (!usuario) return;
    // Primero se reintenta el borrado pendiente (posible usuario anterior en este teléfono) y luego
    // se registra el token del usuario actual.
    gestor.reintentarPendientes().then(() => gestor.alEntrar()).catch(() => {});
  }, [usuario, gestor]);

  // FCM puede rotar el token en caliente mientras hay sesión: solo se escucha con usuario logueado,
  // y se deja de escuchar al cerrar sesión o desmontar (evita re-registrar a nombre de nadie).
  useEffect(() => {
    if (!usuario) return;
    const sub = Notifications.addPushTokenListener((token) => {
      if (typeof token.data === 'string') gestor.alRenovarToken(token.data).catch(() => {});
    });
    return () => sub.remove();
  }, [usuario, gestor]);

  const respuesta = Notifications.useLastNotificationResponse();
  const tocada = useRef<string | null>(null);
  useEffect(() => {
    if (!respuesta || tocada.current === respuesta.notification.request.identifier) return;
    const accion = accionDeToque(respuesta.notification.request.content.data, { cargando, sinRed, hayUsuario: !!usuario });
    // Arranque en frío: aún no se sabe si hay sesión; el efecto se repite cuando termine de cargar.
    if (accion?.tipo === 'esperar') return;
    tocada.current = respuesta.notification.request.identifier;
    if (accion?.tipo === 'abrir') router.push(accion.ruta as never);
    // Sin sesión: a Entrar, y tras entrar vuelve a la conversación (nunca un chat con 401).
    if (accion?.tipo === 'entrar') requiereSesion(router, null, accion.volver);
    // Se limpia DESPUÉS de navegar (nunca antes): si se limpiara antes, un tap real en cold start
    // se perdería. Sin limpiar, un tap viejo reabre la misma conversación en cada apertura futura.
    Notifications.clearLastNotificationResponse();
  }, [respuesta, cargando, sinRed, usuario]);

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
