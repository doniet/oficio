import { Tabs } from 'expo-router';
import { colores } from '../../src/lib/tema';

export default function Pestañas() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colores.acento }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="mensajes" options={{ title: 'Mensajes' }} />
      <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
    </Tabs>
  );
}
