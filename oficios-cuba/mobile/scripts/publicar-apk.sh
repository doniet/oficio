#!/usr/bin/env bash
# Publica el APK de dist/ en https://oficio.dardoit.com/descargas/ (carpeta descargas/ de vps2, que
# nginx sirve en solo lectura) y escribe android.json, que la web lee para mostrar el botón.
#   ./scripts/apk-release.sh && ./scripts/publicar-apk.sh
set -euo pipefail

DESTINO_HOST="${OFICIO_HOST:-vps2}"
DESTINO_DIR='~/docker/oficio/oficios-cuba/descargas'
HUELLA=111a8cec4d10b6ac282598b9777fe370af5753523c5566a4cee78a43e5099257

cd "$(dirname "$0")/.."
version=$(grep -oP "^\s*version: '\K[^']+" app.config.ts)
archivo="oficios-cuba-$version.apk"
APK="dist/$archivo"
[ -f "$APK" ] || { echo "No existe $APK: ejecuta antes scripts/apk-release.sh" >&2; exit 1; }

# Nunca publicar un APK con otra firma: los teléfonos que ya la tienen no podrían actualizar.
BT=$(ls -d "$HOME"/Android/Sdk/build-tools/*/ | sort -V | tail -1)
real=$("${BT}apksigner" verify --print-certs "$APK" | awk -F': ' '/certificate SHA-256 digest/{print $2; exit}')
[ "$real" = "$HUELLA" ] || { echo "$APK no está firmado con la llave de Oficios Cuba" >&2; exit 1; }

sdk=$("${BT}aapt2" dump badging "$APK" | grep -oP "^minSdkVersion:'\K[0-9]+")
declare -A ANDROID=([21]=5.0 [23]=6.0 [24]=7.0 [26]=8.0 [28]=9 [29]=10 [30]=11)
android_min=${ANDROID[$sdk]:-"API $sdk"}
bytes=$(stat -c %s "$APK")
sha=$(sha256sum "$APK" | cut -d' ' -f1)
json=$(printf '{"version":"%s","archivo":"%s","bytes":%s,"sha256":"%s","android_min":"%s","publicado":"%s"}\n' \
  "$version" "$archivo" "$bytes" "$sha" "$android_min" "$(date -u +%FT%TZ)")

# Primero el APK (a un temporal y mv: nadie descarga un archivo a medias), luego el json que lo anuncia,
# y al final se borran las versiones viejas (el disco de vps2 va justo).
ssh "$DESTINO_HOST" "mkdir -p $DESTINO_DIR && chmod 755 $DESTINO_DIR"
scp -q "$APK" "$DESTINO_HOST:$DESTINO_DIR/.$archivo.subiendo"
ssh "$DESTINO_HOST" "cd $DESTINO_DIR && [ \"\$(sha256sum .$archivo.subiendo | cut -d' ' -f1)\" = $sha ] && chmod 644 .$archivo.subiendo && mv .$archivo.subiendo $archivo \
  && printf '%s' '$json' > .android.json && chmod 644 .android.json && mv .android.json android.json \
  && find . -maxdepth 1 -name 'oficios-cuba-*.apk' ! -name '$archivo' -delete && ls -la"
echo "Publicado: https://oficio.dardoit.com/descargas/$archivo"
echo "$json"
