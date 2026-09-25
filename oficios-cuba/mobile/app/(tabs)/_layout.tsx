import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colores } from '../../src/lib/tema';

export default function Pestañas() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colores.acento, tabBarInactiveTintColor: colores.tintaTenue }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="mensajes"
        options={{ title: 'Mensajes', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="cuenta"
        options={{ title: 'Cuenta', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} /> }}
      />
    </Tabs>
  );
}
