#!/usr/bin/env bash
# APK de release firmado con la llave DEFINITIVA de Oficios Cuba (la misma para APK directo, Apklis y Play).
#   ./scripts/apk-release.sh            → dist/oficios-cuba-<versión>.apk
# La llave NO está en el repo (es público): OFICIO_FIRMA_DIR (por defecto ~/.claude/.oficio-firma) con
# oficios-cuba.p12 + clave.txt. Copia en vps2: ~/docker/oficio/oficios-cuba/secrets/firma-android/.
set -euo pipefail

FIRMA_DIR="${OFICIO_FIRMA_DIR:-$HOME/.claude/.oficio-firma}"
ALMACEN="$FIRMA_DIR/oficios-cuba.p12"
CLAVE="$FIRMA_DIR/clave.txt"
ALIAS=oficios
# Huella del certificado: si el APK sale firmado con otra llave, los teléfonos no podrán actualizar.
HUELLA=111a8cec4d10b6ac282598b9777fe370af5753523c5566a4cee78a43e5099257

cd "$(dirname "$0")/.."
[ -r "$ALMACEN" ] && [ -r "$CLAVE" ] || { echo "Falta la llave en $FIRMA_DIR (oficios-cuba.p12 + clave.txt)" >&2; exit 1; }
[ -f google-services.json ] || { echo "Falta google-services.json: sin él la app no recibe avisos push" >&2; exit 1; }

# El release apunta siempre a producción: una URL de desarrollo quedaría grabada en el bundle.
unset EXPO_PUBLIC_API_URL
REQUIRE_PUSH=1 npx expo prebuild --platform android --no-install

# Solo ARM: los teléfonos de Cuba lo son todos, y x86/x86_64 (emuladores, PC) sumaban ~40 MB a la descarga.
# La firma la pone plugins/firma-release.js en build.gradle, leyendo estas variables. La contraseña va
# por el entorno del proceso de Gradle, no por la línea de comandos (que ve `ps`).
(cd android && OFICIO_FIRMA_ALMACEN="$ALMACEN" OFICIO_FIRMA_CLAVE="$(cat "$CLAVE")" OFICIO_FIRMA_ALIAS="$ALIAS" ./gradlew assembleRelease -q -PreactNativeArchitectures=armeabi-v7a,arm64-v8a)

APK=android/app/build/outputs/apk/release/app-release.apk
APKSIGNER=$(ls -d "$HOME"/Android/Sdk/build-tools/*/apksigner | sort -V | tail -1)
real=$("$APKSIGNER" verify --print-certs "$APK" | awk -F': ' '/certificate SHA-256 digest/{print $2; exit}')
[ "$real" = "$HUELLA" ] || { echo "El APK NO está firmado con la llave de Oficios Cuba (SHA-256 $real)" >&2; exit 1; }

# La versión que ve el usuario es la de app.config.ts, no la de package.json.
version=$(grep -oP "^\s*version: '\K[^']+" app.config.ts)
mkdir -p dist
cp "$APK" "dist/oficios-cuba-$version.apk"
echo "OK: dist/oficios-cuba-$version.apk ($(du -h "dist/oficios-cuba-$version.apk" | cut -f1)), firma $HUELLA"
