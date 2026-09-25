import { existsSync } from 'node:fs';
import type { ExpoConfig } from 'expo/config';

// Fuera de git (repo público): lo aporta Dariel/Doniet desde la consola de Firebase (Task 7).
// Aún no existe (Task 7 sigue pendiente) — si se pasa igual la ruta a un archivo inexistente,
// `expo prebuild`/`expo run:android` fallan. Solo se declara cuando el archivo está presente.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';

const config: ExpoConfig = {
  name: 'Oficios Cuba',
  slug: 'oficios-cuba',
  scheme: 'oficio',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.dardoit.oficios',
    ...(existsSync(googleServicesFile) ? { googleServicesFile } : {}),
    permissions: ['POST_NOTIFICATIONS'],
  },
  ios: { bundleIdentifier: 'com.dardoit.oficios' },
  plugins: ['expo-router', 'expo-secure-store', ['expo-notifications', { defaultChannel: 'mensajes' }]],
  experiments: { typedRoutes: true },
};

export default config;
