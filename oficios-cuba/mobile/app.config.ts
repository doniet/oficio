import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Oficios Cuba',
  slug: 'oficios-cuba',
  scheme: 'oficio',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.dardoit.oficios',
    // Fuera de git (repo público): lo aporta Dariel/Doniet desde la consola de Firebase (Task 7).
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    permissions: ['POST_NOTIFICATIONS'],
  },
  ios: { bundleIdentifier: 'com.dardoit.oficios' },
  plugins: ['expo-router', 'expo-secure-store', ['expo-notifications', { defaultChannel: 'mensajes' }]],
  experiments: { typedRoutes: true },
};

export default config;
