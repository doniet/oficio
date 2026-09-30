# Despliegue del porte a Postgres — procedimiento

Este documento cubre **un despliegue que solo se hace una vez**: el que cambia el motor de base de
datos de SQLite a Postgres 18 + PostGIS. Para los despliegues normales, la skill
`oficio-deploy-vps2` sigue siendo la referencia — pero ojo, **sus comandos de copia de seguridad y
de verificación usan `better-sqlite3`, que este despliegue desinstala**: a partir de aquí hay que
usar los de aquí abajo.

Todo se ejecuta en vps2, desde `~/docker/oficio/oficios-cuba`.

## Lo que ya está hecho (2026-09-30)

- ✅ **Copia de seguridad consistente de SQLite**, con `.backup()` (incluye el WAL, que una copia del
  `.db` a secas se dejaría): `data/oficios-2026-09-30-0022-pre-postgres.db`, 909 KB.
- ✅ **`oficio_db` levantado y sano**: Postgres 18.6 con PostGIS, en la red interna `oficio_net`, sin
  puertos publicados y sin rutas en Traefik (verificado con `docker compose config`).
- ✅ **`.env` completo**: `JWT_SECRET`, `DEMO_MODE`, `POSTGRES_PASSWORD`, `MEILI_MASTER_KEY`, en `600`.
  `DATABASE_URL` no hace falta ahí: el compose la inyecta.
- ✅ **El código en `master`** (48 commits), con 264 tests en verde y typecheck en cero.

**El estado actual es estable y seguro:** la base nueva existe y está vacía, nadie la usa, y la API
sigue sirviendo con SQLite desde la imagen anterior. Se puede dejar así indefinidamente.

## Lo que falta: un solo comando, y sus verificaciones

### 1. Construir y arrancar

```bash
cd ~/docker/oficio/oficios-cuba
docker compose --profile telegram up -d --build
```

`--profile telegram` no es opcional: sin él, `oficio_notifier` se queda con la imagen anterior, que
espera SQLite y ya no encontrará su base.

### 2. Comprobar que migró y sembró

```bash
docker compose --profile telegram ps
docker logs oficio_api --tail 30
docker logs oficio_notifier --tail 10
```

Los cuatro contenedores en `healthy`. En el log de la API debe verse que aplicó el esquema y sembró.
**Si la migración falla, el proceso muere con código distinto de cero en vez de servir con la base a
medias** — eso es deliberado: si ves la API reiniciándose en bucle, lee el log antes de tocar nada.

### 3. Verificar la base

```bash
docker exec oficio_db psql -U oficio -d oficio -c "SELECT max(version) FROM schema_migrations"
docker exec oficio_db psql -U oficio -d oficio -c "SELECT count(*) FROM provinces"
docker exec oficio_db psql -U oficio -d oficio -c "SELECT count(*) FROM categories"
docker exec oficio_db psql -U oficio -d oficio -c "SELECT count(*) FROM provider_profiles"
docker exec oficio_db psql -U oficio -d oficio -c "SELECT postgis_version()"
```

Esperado: versión de esquema `1`, 16 provincias, las categorías del seed base, perfiles demo
(`DEMO_MODE=true` siembra) y PostGIS respondiendo.

### 4. Verificar desde fuera, por Cloudflare — no desde el servidor

```bash
curl -s https://oficio.dardoit.com/api/config
curl -s https://oficio.dardoit.com/api/stats
curl -s "https://oficio.dardoit.com/api/services?q=plomeria" | head -c 400
curl -s "https://oficio.dardoit.com/api/mapa?bbox=19,-85,24,-74&tab=servicios" | head -c 400
curl -sI https://oficio.dardoit.com/ | head -3
```

Y a mano en el navegador, que es donde se ve lo que los `curl` no cuentan: las tres pestañas de
`/explorar`, el cambio a vista de mapa, abrir un grupo de celda, una ficha de proveedor, y pedir una
cita. **Buscar sin acentos** (`jabon`) y **a medias** (`toma`) para comprobar el `tsvector` con
prefijos.

### 5. Verificar que el aislamiento de red sigue en pie

```bash
docker exec oficio_api node -e "fetch('https://www.google.com').then(()=>console.log('SALE A INTERNET — MAL')).catch(e=>console.log('sin salida, correcto:', e.cause?.code))"
docker exec oficio_notifier node -e "fetch('https://api.telegram.org').then(r=>console.log('con salida, correcto:', r.status)).catch(e=>console.log('SIN SALIDA — MAL:', e.cause?.code))"
```

`oficio_api` **no** debe salir a internet (`EAI_AGAIN`); `oficio_notifier` **sí**. Si la API sale,
algo cambió en la red: parar y revisar.

### 6. Las dos herramientas de administración

Estas dos reventaban antes del último arreglo del porte, y son el único camino para cobrar:

```bash
docker exec oficio_api node dist/scripts/pagos.js listar
docker exec oficio_api node dist/scripts/admin.js listar
```

Ninguna debe dar `TypeError ... slice is not a function`. `pagos listar` con cero pagos pendientes
dice "No hay pagos pendientes" — eso es correcto, pero **no prueba nada**: el fallo original solo
aparecía con un pago real. Si hay alguno pendiente, mejor.

### 7. Copia de seguridad nueva, y verificarla

A partir de aquí, la copia se hace así (y el `better-sqlite3` de la skill ya no existe):

```bash
docker exec oficio_db pg_dump -U oficio -d oficio -Fc > oficio-$(date +%F-%H%M).dump
```

El procedimiento completo, con la restauración y el aviso de parar la API antes de restaurar sobre
una base en uso, está en `DOCKER.md`. **Está verificado**: el volcado incluye esquema, extensiones e
índices GiST, y la restauración devuelve 0.

## Si algo va mal: volver atrás

El rollback es barato **porque `data/oficios.db` no se toca en ningún momento**. Los datos de SQLite
siguen enteros, y además hay la copia del paso 0.

```bash
cd ~/docker/oficio
git checkout 1ab0c56                  # el commit anterior al porte
cd oficios-cuba
docker compose --profile telegram up -d --build
docker compose stop oficio_db         # la base nueva se queda parada, sin borrar
```

Eso devuelve el servicio a SQLite en lo que tarde el build. Después, `git checkout master` para
recuperar el código nuevo cuando se quiera reintentar.

## Lo que este despliegue borra, y estaba autorizado

`DEMO_MODE=true` sigue puesto, así que la base nueva se siembra con datos demo nuevos. **No se migra
nada de SQLite.** Se pierden: 319 usuarios demo (uno con login real de Google), 313 perfiles, 322
servicios, 35 conversaciones, 34 reseñas, 3 citas, 8 pagos simulados, 9 descargas de APK contadas y
5 registros de fotos subidas. Los archivos de las fotos sobreviven en `data/uploads/` (bind mount),
pero quedan huérfanos: ninguna fila los referencia.

Dariel autorizó expresamente no mantener compatibilidad con los datos existentes.
