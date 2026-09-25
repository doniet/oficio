import { existsSync } from 'node:fs';
import type { ExpoConfig } from 'expo/config';

// Fuera de git (repo público): lo aporta Dariel/Doniet desde la consola de Firebase (Task 7).
// Aún no existe (Task 7 sigue pendiente) — si se pasa igual la ruta a un archivo inexistente,
// `expo prebuild`/`expo run:android` fallan. Solo se declara cuando el archivo está presente.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';

// Un build sin google-services.json no tiene push y no avisa: con REQUIRE_PUSH=1 (build de
// prueba de campo / release) se aborta en vez de producir un APK sin notificaciones.
if (process.env.REQUIRE_PUSH === '1' && !existsSync(googleServicesFile)) {
  throw new Error(`REQUIRE_PUSH=1 pero no existe ${googleServicesFile}: descárgalo de la consola de Firebase (o apunta GOOGLE_SERVICES_JSON a él). Sin él la app no recibe notificaciones.`);
}

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
