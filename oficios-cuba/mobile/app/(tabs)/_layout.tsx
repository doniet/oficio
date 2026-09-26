import { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { brand, fuentes, ink, sand } from '../../src/lib/tema';

type Icono = ComponentProps<typeof Ionicons>['name'];
// Barra inferior móvil de la web (Layout.tsx): iconos de trazo, activa en brand, el resto en ink-400.
const icono = (nombre: Icono) => ({ color }: { color: ColorValue }) => <Ionicons name={nombre} size={23} color={color as string} />;

export default function Pestañas() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand[600],
        tabBarInactiveTintColor: ink[400],
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: sand[200], borderTopWidth: 1, elevation: 0 },
        tabBarLabelStyle: { fontFamily: fuentes.textoFuerte, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icono('home-outline') }} />
      <Tabs.Screen name="buscar" options={{ title: 'Buscar', tabBarIcon: icono('search-outline') }} />
      <Tabs.Screen name="mensajes" options={{ title: 'Mensajes', tabBarIcon: icono('chatbubble-outline') }} />
      <Tabs.Screen name="cuenta" options={{ title: 'Cuenta', tabBarIcon: icono('person-outline') }} />
    </Tabs>
  );
}
