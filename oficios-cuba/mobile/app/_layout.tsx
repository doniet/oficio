import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_400Regular, Figtree_600SemiBold } from '@expo-google-fonts/figtree';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProveedorSesion } from '../src/lib/contexto';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30_000 } } });

export default function Raiz() {
  // Las fuentes vienen empaquetadas en node_modules: no se descargan en el teléfono.
  const [listas] = useFonts({ BricolageGrotesque_700Bold, Figtree_400Regular, Figtree_600SemiBold });
  if (!listas) return null;
  return (
    <QueryClientProvider client={queryClient}>
      {/* Fondo claro (colores.fondo) en toda la app: iconos oscuros para que se lean. */}
      <StatusBar style="dark" />
      <ProveedorSesion>
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
