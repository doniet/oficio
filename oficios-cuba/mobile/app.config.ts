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
  name: 'Encuentrauno',
  slug: 'oficios-cuba',
  scheme: 'oficio',
  version: '0.2.2',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/images/icon.png',
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
      backgroundColor: '#FAF6EF',
    },
    package: 'com.dardoit.oficios',
    // Android solo instala encima si sube: cada APK publicado lleva uno mayor que el anterior.
    versionCode: 5,
    ...(existsSync(googleServicesFile) ? { googleServicesFile } : {}),
    permissions: ['POST_NOTIFICATIONS'],
    // Permisos que Expo y sus módulos añaden por defecto y la app no usa. El antivirus de Huawei (Avast)
    // marcó el APK 0.1.0 como virus: SYSTEM_ALERT_WINDOW (dibujar sobre otras apps) y arrancar con el
    // teléfono son el patrón de los troyanos bancarios. SecureStore va sin biometría y no hay avisos
    // locales programados que reponer al reiniciar (solo push remoto).
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
    ],
  },
  ios: { bundleIdentifier: 'com.dardoit.oficios' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', backgroundColor: '#FAF6EF', imageWidth: 200 }],
    'expo-secure-store',
    // Firma de release con la llave de Oficios Cuba (ver plugins/firma-release.js).
    './plugins/firma-release',
    // Android pinta el icono de la notificación solo con su canal alfa: blanco sobre transparente.
    ['expo-notifications', { defaultChannel: 'mensajes', icon: './assets/images/notification-icon.png', color: '#FF7A00' }],
    // Teselas raster de OpenStreetMap en el mapa de Explorar (MapaExplorar.tsx). Sin claves de API.
    '@maplibre/maplibre-react-native',
    // «Cerca de mí» del mapa de Explorar: ubicación puntual, nunca en segundo plano.
    ['expo-location', { locationWhenInUsePermission: 'Encuentrauno necesita tu ubicación para mostrarte profesionales cerca de ti en el mapa.' }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
