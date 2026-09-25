import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_400Regular, Figtree_600SemiBold } from '@expo-google-fonts/figtree';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30_000 } } });

export default function Raiz() {
  // Las fuentes vienen empaquetadas en node_modules: no se descargan en el teléfono.
  const [listas] = useFonts({ BricolageGrotesque_700Bold, Figtree_400Regular, Figtree_600SemiBold });
  if (!listas) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: 'Figtree_600SemiBold' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
