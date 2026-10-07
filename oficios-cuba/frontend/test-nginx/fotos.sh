#!/usr/bin/env bash
# Prueba del proxy de fotos de DardoVentas (nginx.conf, location ^~ /ext/dv/foto/) sin salir a internet:
# un nginx "doble" hace de ventas.dardoit.com con un certificado autofirmado (el proxy no verifica,
# igual que /api/tasas) y el nginx.conf real se monta en un nginx limpio. No construye la SPA.
set -euo pipefail
cd "$(dirname "$0")"
RED=oficio-dv-prueba-$$
TMP=$(mktemp -d)
PUERTO=18089
limpiar() { docker rm -f "$RED-doble" "$RED-web" >/dev/null 2>&1 || true; docker network rm "$RED" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpiar EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=ventas.dardoit.com" \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null
chmod 644 "$TMP"/*.pem
docker network create "$RED" >/dev/null
docker run -d --name "$RED-doble" --network "$RED" --network-alias ventas.dardoit.com --network-alias oficio_api \
  -v "$PWD/doble.conf:/etc/nginx/conf.d/default.conf:ro" -v "$TMP:/certs:ro" nginx:1.27-alpine >/dev/null
docker run -d --name "$RED-web" --network "$RED" -p 127.0.0.1:$PUERTO:80 \
  -v "$PWD/../nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine >/dev/null
sleep 2

URL=http://127.0.0.1:$PUERTO/ext/dv/foto
S=AAAAAAAAAAAAAAAAAAAAAA
fallos=0
espera() { # descripción, valor obtenido, valor esperado
  if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FALLO $1: obtuve «$2», esperaba «$3»"; fallos=$((fallos + 1)); fi
}
estado() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
cabecera() { curl -s -D - -o /dev/null "$1" | tr -d '\r' | awk -v h="$2" 'tolower($0) ~ "^"tolower(h)":" { sub(/^[^:]*: /, ""); print; exit }'; }

espera "foto vigente: 200"                 "$(estado "$URL/$S/u1.jpg?v=7")" 200
espera "foto vigente: cuerpo"               "$(curl -s "$URL/$S/u1.jpg?v=7")" "JPEG-DE-PRUEBA"
espera "foto vigente: caché un año"         "$(cabecera "$URL/$S/u1.jpg?v=7" Cache-Control)" "public, max-age=31536000, immutable"
espera "versión vieja: 301"                 "$(estado "$URL/$S/u1.jpg?v=6")" 301
espera "versión vieja: Location local"      "$(cabecera "$URL/$S/u1.jpg?v=6" Location)" "/ext/dv/foto/$S/u1.jpg?v=7"
espera "versión vieja: caché corta"         "$(cabecera "$URL/$S/u1.jpg?v=6" Cache-Control)" "public, max-age=300"
espera "sin versión: 404"                   "$(estado "$URL/$S/u1.jpg")" 404
espera "versión con barra: 404"             "$(estado "$URL/$S/u1.jpg?v=a%2Fb")" 404
espera "slug corto: 404"                    "$(estado "$URL/corto/u1.jpg?v=7")" 404
espera "otra extensión: 404"                "$(estado "$URL/$S/u1.png?v=7")" 404
espera "subir de carpeta: 404"              "$(estado "$URL/$S/..%2F..%2Fapi/u1.jpg?v=7")" 404
espera "HTML del otro lado: sandbox"        "$(cabecera "$URL/$S/html.jpg?v=1" Content-Security-Policy)" "default-src 'none'; sandbox"
espera "HTML del otro lado: nosniff"        "$(cabecera "$URL/$S/html.jpg?v=1" X-Content-Type-Options)" "nosniff"
grep -q 'keys_zone=dvfotos:[0-9]*m max_size=64m' ../nginx.conf && espera "caché acotada" ok ok || espera "caché acotada" "sin max_size" ok

docker stop "$RED-doble" >/dev/null
espera "DardoVentas caído: sigue sirviendo la caché" "$(curl -s "$URL/$S/u1.jpg?v=7")" "JPEG-DE-PRUEBA"

[[ $fallos -eq 0 ]] && echo "Todo bien." || { echo "$fallos fallos."; exit 1; }
