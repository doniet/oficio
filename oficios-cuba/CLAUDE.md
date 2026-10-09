# CLAUDE.md — Oficios Cuba

Directorio/marketplace de oficios y servicios en Cuba: los clientes buscan por oficio y lugar, leen reseñas y escriben directo al profesional (chat o WhatsApp); los profesionales publican servicios y pagan un plan para tener más visibilidad.

- **Repo:** `github.com/doniet/oficio` (rama `master`), **compartido con Doniet**. La app vive en la subcarpeta `oficios-cuba/`.
- **Producción:** `oficio.dardoit.com` en **vps2** (`~/docker/oficio`), detrás de Traefik (`net_dmz`) + túnel Cloudflare de la cuenta Doniet.
- **Desarrollo:** j-u (`~/Documentos/dev/oficio`).
- Antes de tocar nada: leer `ESTADO.md` (si el proyecto está en DESARROLLO o en PRODUCCIÓN, y qué permite cada uno) y `STATUS.md` (orden cronológico: lo más reciente está al final).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 22 · Express 4 · TypeScript · Postgres 18 + PostGIS 3.6 vía `pg` (driver, `Pool`) · JWT · zod |
| Frontend | React 18 · Vite 5 · Tailwind 3 · React Router 6 · Leaflet · axios |
| Producción | `oficio_web` (nginx: SPA + proxy `/api`) en `net_dmz` → `oficio_api` en red **interna sin salida** (`oficio_net`) → `oficio_db` en `oficio_net`, sin puertos publicados ni labels de Traefik |

## Estructura

```
oficios-cuba/
├── backend/src/
│   ├── index.ts          # arranque ASÍNCRONO: await migrar() → await seedBase() → await seedDemo() si DEMO_MODE → app.listen
│   ├── config.ts         # DEMO_MODE, JWT_SECRET (falla en prod si es débil), PLANS y límites
│   ├── app.ts            # la app Express (sin listen): la importan index.ts y los tests
│   ├── db/               # acceso.ts = q/qOne/tx sobre el pool de `pg`; migrar.ts = esquema.sql + tabla schema_migrations;
│   │                     # index.ts = reglas (límite de plan, caducidad, PLAN_WEIGHT_SQL...), ya NO el esquema; pagos.ts; seeds
│   ├── lib/entrada.ts    # parámetros de query y validación de imágenes (demo / subida propia)
│   ├── middleware/       # auth (JWT revocable), errorHandler
│   ├── scripts/pagos.ts  # CLI de admin: listar / confirmar / rechazar pagos manuales
│   └── routes/           # auth, categories, conversations, favorites, providers, provinces,
│                         # reviews, services, stats, subscriptions, uploads
├── frontend/src/
│   ├── components/       # ui.tsx (sistema de diseño), cards, Layout, DashboardLayout, ContactActions, ReviewList, ProvinceMapSelector
│   ├── pages/            # públicas + auth/ + dashboard/
│   ├── services/api.ts   # cliente axios, baseURL `/api`
│   └── types/index.ts
├── backend/test/        # vitest + supertest; cada archivo con su base temporal
├── frontend/nginx.conf   # SPA, proxy /api, cabeceras, client_max_body_size
└── docker-compose.yml    # compose de PRODUCCIÓN (vps2)
```

### API (`/api`) — P = pública · A = con sesión · Pr = solo proveedor · C = solo cliente

| Recurso | Rutas |
|---|---|
| Sistema | `GET /health`, `GET /config` (P) |
| Sistema+ | `GET /tasas` (P; en prod lo sirve nginx desde `dardoventas.com/tasas.json`, la API da el respaldo) |
| Auth | `POST /auth/register\|login\|google` (P, 30 intentos / 15 min) · `GET /auth/me`, `PUT /auth/profile\|password` (A) |
| Catálogos | `/provinces[/:id[/municipalities]]`, `/categories[...]`, `/stats`, `/stats/categories` (P) |
| Mapa | `GET /mapa?bbox=sur,oeste,norte,este&tab=servicios\|productos\|negocios&q=&category=` (P; un perfil por celda, el de mejor plan, con `detras` = cuántos más hay en esa celda. La celda sale del rectángulo VISIBLE (`min(alto,ancho)/5`) y el servidor infla un 50 % por su cuenta: no hay parámetro `zoom`. `bbox` inválido, invertido o fuera de Cuba → 400; `tab` inventada → 400. Cada punto lleva además `aproximado` y los índices `cy`/`cx` de su celda) · `GET /mapa/celda?bbox=…&cy=&cx=&tab=&q=&category=` (P; los negocios de UNA celda, tope 50 con `hay_mas`. Los `cy`/`cx` los devuelve `/mapa` y el cliente los reenvía tal cual; el bbox tiene que ser el MISMO, porque el servidor deduce de él el tamaño de celda) · `GET /mapa/productos?bbox=…&q=&category=&sort=relevance\|price_asc\|price_desc&page=` (P; productos de la zona visible EXACTA —sin el margen del 50 %— en `dentro`, 20 por página, y en la página 1 los 10 más cercanos de fuera en `fuera`, con `distancia_km`. Precio para ordenar en CUP con `TASA_CUP_USD`; «A consultar» al final. Filtra y mide solo por `punto_pub`) |
| Proveedores | `GET /providers`, `/providers/featured`, `/providers/:id` (P) · `POST /providers/:id/contact` (P; registra el contacto de un cliente con sesión) · `GET\|PUT /providers/me/profile` (Pr) |
| Citas | `GET /appointments/provider/:id/slots?service_id=` (P, solo Profesional) · `GET /appointments/mine`, `PATCH /:id`, `POST /:id/reschedule` (A) · `POST /` (C) · `GET\|PUT /config`, `GET /calendar?desde&hasta`, `POST /manual`, `POST\|DELETE /blocks` (Pr) |
| Catálogo | `GET /catalog/provider/:id?q&section&page`, `GET /catalog/search?q&province_id&municipality_id&page` (P) · `GET /catalog/mine`, `POST`, `PUT\|DELETE /:id`, `PATCH /:id/available` (Pr) |
| DardoVentas | `POST\|DELETE /dardoventas/vincular`, `GET /dardoventas/estado` (Pr; la API solo apunta el código en `dardoventas_canjes`, lo canjea `oficio_notifier`) |
| Telegram | `GET /telegram/status`, `POST\|DELETE /telegram/link`, `PUT /telegram/prefs`, `POST /telegram/test` (A) |
| Admin | `GET /admin/me`, `POST /admin/2fa/setup\|enable\|verify` · `POST /admin/2fa/demo-enter` (solo `admin@demo.com` con `DEMO_MODE=true`, sin código) · con `X-Admin-Token`: `GET /admin/system\|telegram\|audit`, `PUT\|DELETE /admin/telegram/token` |
| Servicios | `GET /services`, `/services/:id` (P; el dueño ve los inactivos) · `GET /services/mine`, `POST`, `PUT\|DELETE /:id`, `PATCH /:id/toggle` (Pr) |
| Subidas | `POST /uploads` (Pr, base64, 1,5 MB, tipo por firma: jpg/png/webp) · `GET /uploads/*` (estático) |
| Suscripciones | `GET /subscriptions/plans` (P) · `GET /me`, `POST /checkout\|confirm-manual\|cancel` (Pr) |
| Conversaciones | `GET /conversations`, `/unread-count`, `/:id?after=` · `POST /` (C) · `POST /:id/messages` (A, filtrado por participante) |
| Reseñas | `GET /reviews/provider/:id` (P) · `GET /eligibility/:serviceId`, `POST`, `DELETE /:id` (C) |
| Favoritos | `GET\|POST /favorites`, `/ids`, `/check/:id`, `DELETE /:providerId` (C) |

### Modelo de datos

`users` (client|provider) 1–1 `provider_profiles` (plan, `expires_at`, `rating`/`review_count` desnormalizados) 1–N `services` (`images` y `price_list` = JSON) · `service_areas` N–M `municipalities` · `provinces` 1–N `municipalities` · `categories` en 2 niveles (`parent_id`) · `reviews(service, client, provider)` · `conversations(client, provider, service?)` 1–N `messages` · `favorites(client, provider)` único · `subscriptions` 1–N `payments` · `appointments(provider, client?, service?, starts_at/ends_at UTC, origin online|manual, rescheduled_from)` · `agenda_blocks(provider, rango)` · `catalog_items(provider, precio fixed|from|ask, image?, section?, available, hidden_by_plan)` · `contacts(client, provider, via)`. `provider_profiles` lleva además `contact_mode`, `kind` (oficio|negocio), `horario`, `gallery` (JSON), `agenda` (JSON), `show_on_map`; `users.google_sub`. IDs UUID. 🚨 `conversations.provider_profile_id` y `reviews.provider_profile_id` son el id del **perfil**, no del usuario (el nombre de la columna ya lo dice, a diferencia de la época SQLite). Postgres, con `ON DELETE`/`ON DELETE CASCADE` reales en las FK (no hace falta `PRAGMA foreign_keys`).

`catalog_items` lleva `origen` (`propio`\|`dardoventas`) y `uid_externo`; `provider_profiles` lleva las columnas `dardoventas_*`; tabla `dardoventas_canjes` (códigos de vínculo apuntados por la API y canjeados por `oficio_notifier`).

### Páginas

Públicas: `/`, `/explorar` (tres pestañas: servicios, productos, negocios; `/buscar` redirige. `&vista=mapa` cambia de la lista al mapa — la lista es la vista por defecto. **En mapa, el mapa ES la página**: ocupa el viewport bajo la cabecera (sin scroll; el pie se oculta, la barra inferior de móvil se queda) y los controles flotan encima — buscador y pestañas siempre, categoría y «Ver en lista» detrás del botón de filtros. Los filtros que el endpoint no honra (provincia, municipio, precio, tipo de precio y orden) no aparecen. Al tocar un punto, su ficha sale en un **panel lateral desde `lg` (1024px)** y en una **hoja inferior colapsable por debajo**; si el punto agrupa varios, ese mismo panel lista los negocios de su celda y desde uno se vuelve a la lista. En la pestaña Productos, el panel abre solo `ListaProductos` (productos de la zona, orden en `&orden=`, y aparte los de fuera); tocar uno abre la ficha de su negocio con el producto marcado y se vuelve a la lista; uno de fuera amplía el mapa con `flyToBounds`. En escritorio, un punto que quedaría bajo el panel hace que el mapa se aparte con `panBy` — nunca con zoom, que cambiaría la agrupación del servidor. Piezas: `ExplorarMapa` (layout y estado) → `ControlesMapa` + `MapaExplorar` + `PanelMapa`; `PanelMapa` elige envoltorio (`HojaPunto` / `PanelLateral`, conducta común en `usarPanel`) y contenido (`FichaPunto` / `ListaCelda` / `ListaProductos`)), `/planes`, `/servicio/:id`, `/proveedor/:id`, `/login`, `/registro`. Panel `/dashboard`: `mensajes`, `cuenta` (todos); `favoritos` (cliente); `perfil`, `servicios`, `servicios/nuevo`, `servicios/:id/editar`, `catalogo`, `suscripcion`, `agenda`, `agenda/ajustes` (proveedor); `citas` (cliente). `/auth/google` = vuelta del login real de Google. `/dashboard/mensajes/:id` va fuera del layout del panel.

## Reglas de negocio (con test)

- **Planes** (`config.ts` → `PLANS`, `planDe()`): **Gratis** 1 oficio con 1 foto, sin galería, contacto por WhatsApp/llamada · **Básico** $1/mes, 5 oficios con 5 fotos cada uno, 10 fotos de galería, lista de precios · **Profesional** $10/mes, oficios ilimitados con 6 fotos cada uno, 30 fotos de galería, negocio + horario, agenda de citas, chat, enlace al punto de venta DardoVentas. `premium` ya no existe (la migración 3 lo pasa a `pro`). Al bajar de plan fotos/negocio/lista de precios no se borran: dejan de mostrarse. Dos topes distintos de fotos: `maxServicePhotos` (las de cada oficio, `services.images`) y `maxPhotos` (la galería del negocio, `provider_profiles.gallery`); el logo (`users.avatar_url`) no tiene tope. En la página de planes el destacado («El más elegido») es el **Básico**.
- **Lista de precios** (`services.price_list`, JSON `[{ name, price }]`): opcional, una por oficio, tipo carta de menú, sin fotos ni descripción. En la moneda del oficio (`price_currency`); el frontend muestra el equivalente con la tasa. Tope `maxPriceRows`: Gratis 0 · Básico 30 · Profesional 100. No va en los listados, solo en `GET /services/:id` y `/services/mine`; el dueño la ve completa aunque su plan la oculte.
- **Agenda** (`lib/agenda.ts` + `lib/hora.ts`, JSON v2 en `provider_profiles.agenda`; el v1 se sigue leyendo): tramos por día, excepciones por fecha, bloqueos, duración por servicio (`services.duration_min`), márgenes, antelación, horizonte, máximo por día, confirmación manual/auto y plazo de cambio del cliente. Toda hora de pared es de Cuba vía tzdata (nunca desfases fijos; el cambio de hora cubano es a las 0:00). Un hueco está ocupado por **solape** con citas no canceladas (pendientes incluidas) o bloqueos; se revalida dentro de la transacción del insert. El profesional apunta citas manuales y reprograma a cualquier hora (409 `code: 'choque'` → reintento con `forzar`); "hecha"/"no vino" solo pasada la hora.
- **Catálogo** (`routes/catalog.ts`): Gratis 0 · Básico 50 · Profesional 1000 (`PLANS.maxCatalog`). Al cambiar de plan `enforcePlanLimit` recalcula `hidden_by_plan` (se ven los más antiguos; al subir de plan reaparecen). Fotos opcionales con cuota propia (`uploads.purpose='catalog'`): tantas como el tope del plan en 24 h. Al cambiar o borrar la foto de un artículo, `borrarSiHuerfana` la quita del disco si nada más la usa. La búsqueda de productos intercala profesionales (`ROW_NUMBER` por perfil) y omite los agotados.
- **Catálogo de DardoVentas** (`notifier/dardoventas.ts`, `db/dardoventas.ts`; spec `docs/superpowers/specs/2026-10-06-dardoventas-catalogo-design.md`, «Precisiones del contrato»): lo importa `oficio_notifier` cada 30 min con `If-None-Match` (304 = nada que hacer); lo importado no se edita (403) ni se convierte de moneda (`convertible=false`, sin «≈»).
  Un fallo del otro lado (red, 5xx, cuerpo inválido) nunca vacía un catálogo: solo borra un 200 válido que ya no trae el artículo. Un 410 lo retira y saca el negocio del mapa (`show_on_map=false`).
  Plan Profesional regalado hasta `DARDOVENTAS_PRO_HASTA` (fecha ISO; vacío = no se regala), sin acortar nunca lo que ya se tenía. El secreto del canje es el archivo `secrets/dardoventas/secreto` (solo lo monta el notificador); sin él el canje queda apagado y los ya vinculados se siguen sondeando.
  Para probar a mano sin el servidor real: `npm run doble:dardoventas` (puerto 4100, referencia ejecutable del contrato; su cabecera dice cómo apuntar el notificador).
- **Avisos por Telegram** (`lib/avisos.ts`, `routes/telegram.ts`, `src/notifier/`): la API **solo apunta** avisos en `notifications` (no tiene salida a internet) si el usuario vinculó Telegram y no apagó ese grupo (`users.notify_prefs`: citas, recordatorios, chat, reseñas, plan). Los envía `oficio_notifier` (misma imagen, `node dist/notifier/index.js`, perfil de compose `telegram`): único con salida (net_dmz), long polling sin puertos abiertos, y único que puede leer el token: publica su clave pública en `telegram_state` (privada en `secrets/notifier/`, solo la monta él), la API guarda el token cifrado (RSA-OAEP) y el notificador lo relee cada 10 s. Vinculación: código de un solo uso (hash en `telegram_link_tokens`, 10 min) → `t.me/<bot>?start=<código>`. El chat avisa sin el texto del mensaje, uno por tramo de 10 min. Recordatorios/resumen/vencimiento los programa la API cada 5 min con `dedupe_key`. El notificador no importa `db/index.ts` (cargaría `config.ts` y exigiría `JWT_SECRET`).
- **Push de las apps** (`push/avisos.ts`, `notifier/push.ts`, `push/fcm.ts`): igual que Telegram, la API **solo apunta** en `push_outbox` (una fila por dispositivo de `push_devices`, con el `user_id` dueño al apuntar) y `oficio_notifier` la envía por FCM HTTP v1 si tiene `secrets/fcm/cuenta.json`. Chat: "Nueva solicitud" / "Nuevo mensaje", sin el texto. Caduca a las 24 h; 5 intentos; `UNREGISTERED`/404 borra el dispositivo (nunca por grep del mensaje: `SENDER_ID_MISMATCH` también menciona el token); si el dispositivo cambió de dueño, no se envía.
- **Panel técnico** (`routes/admin.ts`, `/admin`): `users.is_admin` solo se da por CLI (`scripts/admin.ts`); a quien no es admin, 404. 2FA TOTP propio (`lib/totp.ts`, un código no vale dos veces, 5 fallos / 15 min) que abre una sesión de 30 min (`X-Admin-Token`, JWT `scope: admin`, se invalida al cambiar contraseña o reiniciar el 2FA); acciones sensibles piden un código nuevo; todo en `admin_audit`. En `DEMO_MODE`, `seedDemo()` siembra `admin@demo.com` (contraseña `Demo123!`, is_admin=true, 2FA ya activado con un secreto que nadie ve) y el botón "Administrador" del login la usa para entrar directo al panel sin código, vía `POST /admin/2fa/demo-enter`. Ese atajo comprueba el email exacto además de `DEMO_MODE`: cualquier otro admin (incluido uno real en producción con `DEMO_MODE=true`) sigue exigiendo su código TOTP.
- **Chat solo Profesional:** no se abren conversaciones con Gratis/Básico; las viejas se leen pero no se puede escribir.
- **Precios:** cada servicio lleva `price_currency` (CUP por defecto, o USD); el frontend muestra la otra moneda con la tasa de `/api/tasas`.
- **Google:** con `GOOGLE_CLIENT_ID` → verificación real del `id_token` (flujo de redirección, sin script de Google). Sin él y con `DEMO_MODE` → selector de cuentas ficticias. Una cuenta con contraseña no se toma con el Google simulado. Fuera de demo y con Google real, pedir cita exige cuenta de Google.
- **Ubicación pública** (`lib/ubicacion.ts`): `lat/lng` solo salen en `/providers/:id` si el profesional marcó `show_on_map`, y **nunca son las guardadas**: se publica `punto_pub`, una columna `geography(Point, 4326)` (PostGIS) que se calcula al guardar — `ST_Y`/`ST_X` la leen de vuelta como `LAT_SERVIDA`/`LNG_SERVIDA` (`db/index.ts`). Con `map_precision='exacta'` es la suya; con `'zona'`, un punto desplazado entre **100 y 300 m** en dirección al azar, sorteado UNA sola vez con `node:crypto` (`desplazar()`, sigue en JS: PostGIS solo indexa el resultado, no lo genera) y re-sorteado solo si el dueño mueve la ubicación o cambia de precisión. Sortearlo al servir permitiría pedir el perfil muchas veces y **promediar** hasta recuperar el real; `Math.random` permitiría reconstruir el generador e invertir el desplazamiento de todos — de ahí el test `dos perfiles en la misma coordenada publican puntos distintos` (`test/coordenada-servida.test.ts`), que existe justo para que nadie cambie `randomInt` por algo determinista sin que ningún test lo note. El mapa **filtra por `punto_pub`** (índice GiST), no por `pp.lat`/`pp.lng`: filtrar por la exacta reabre un oráculo de bisección. No hay respaldo a `pp.lat` si la pública es NULL — el perfil desaparece del mapa, que es el fallo seguro. `show_on_map` sigue en `DEFAULT false`.
- **Aviso de la dirección:** `pp.address` se publica **sin condición** en `/providers/:id`, a diferencia de `lat/lng`. Por eso el formulario avisa siempre que el campo tenga texto, detrás de `AVISAR_SIEMPRE_DIRECCION` (`ProviderProfileEdit.tsx`): apagarlo es cambiar un booleano.
- **Plan:** el máximo de servicios se aplica al crear, al reactivar (`toggle`) y al bajar de plan (caducidad, cancelación): se pausan los más nuevos.
- **Reseñas:** una por cliente y proveedor; solo si hubo trato (respuesta en el chat, cita confirmada/hecha, o contacto por WhatsApp/llamada con sesión — tabla `contacts`); nunca sobre un servicio pausado. Borrar un servicio conserva sus reseñas (`service_id` → NULL).
- **Sesiones:** cambiar la contraseña invalida los tokens anteriores (`users.password_changed_at`); el endpoint devuelve uno nuevo.
- **Descarga de la app:** `components/DescargarApp.tsx` (sección en la portada + enlace en el pie) lee `/descargas/android.json`; sin él no se muestra nada. En iPhone no se ofrece el APK. Publicar: `mobile/scripts/publicar-apk.sh` (ver DOCKER.md). El botón apunta a `GET /api/app/descargar?archivo=oficios-cuba-X.Y.Z.apk` (`routes/app-movil.ts`), que cuenta y redirige (302, `no-store`) a `/descargas/…`: contar en nginx no sirve porque Cloudflare guarda el APK en caché. Una descarga por visitante y versión cada 24 h; se guarda un hash con sal de la IP (`apk_descargas`, migración 9), nunca la IP. El total sale en el panel técnico (`/admin/system` → `app_downloads`).
- **Imágenes:** solo `/demo/*.webp` o subidas propias (tabla `uploads`), máx. 60 subidas / 24 h por usuario.
- **Login:** además del límite por IP, 10 fallos / 15 min por cuenta.

## Gotchas

- **`/api/tasas` lo sirve nginx** (`location =`, gana a `^~ /api/`) desde dardoventas.com con caché y `use_stale`; si nunca respondió, cae a la API (`TASA_CUP_USD`). oficio_web sí tiene salida (net_dmz); oficio_api no.
- **nginx: una `location` por regex gana a un prefijo sin `^~`.** Por eso `/api/`, `/assets/` y `/demo/` llevan `^~`; sin él las fotos subidas daban 404 en prod.
- **Fotos de DardoVentas:** `location ^~ /ext/dv/foto/` en `nginx.conf`, caché `dvfotos` con `max_size=64m`. El proxy verifica el TLS de `ventas.dardoit.com` y contiene lo que manda el otro lado (descarta cabeceras como `Set-Cookie`, `Link` o `Content-Disposition`). Se prueba con `frontend/test-nginx/fotos.sh` (Docker, sin internet). En `vite` de desarrollo esas fotos se ven rotas: no hay proxy.
- **`DEMO_MODE=true` = cuentas con contraseña pública + planes de pago gratis.** Solo para dev/staging.
- `CF-Connecting-IP` es fiable solo porque Traefik en vps2 no publica puertos (todo entra por el túnel). Si eso cambia, el rate limit por IP se puede falsificar.
- El backend compila con `strict:false`: el tipado protege poco (por ejemplo, no delata una función `async` llamada sin `await` — ver más abajo); verificar en ejecución.
- **`count(*)` (y `AVG`, y cualquier `bigint`) llega de `pg` como cadena, no como `number`.** `=== 1` contra `'1'` falla y un `> 0` sobre texto da resultados raros. `Number(...)` en todo conteo que se lea (ver `db/index.ts:refreshProviderRating`).
- **Las columnas `jsonb` (`images`, `price_list`, `gallery`, `agenda`, `metadata`, `notify_prefs`) llegan YA PARSEADAS al leer** — nada de `JSON.parse`; usar `parseImages`/`parsePriceList` (`db/index.ts`), que aceptan también la forma en cadena que escriben los seeds. **Al escribir un array en una columna `jsonb` hay que seguir haciendo `JSON.stringify()`**: si se pasa el array crudo, `pg` lo manda como literal de ARRAY de Postgres (`{a,b,c}`), no como JSON, y la columna lo rechaza.
- **Las columnas `timestamptz` llegan de `pg` como objeto `Date`, no como cadena** (aunque un tipo TypeScript declarado `string` no proteste, con `strict:false`). El contrato de la API no cambia porque **`db/conexion.ts`** lleva un `pg.types.setTypeParser` global que las serializa como ISO. Vive junto al driver, y no en `app.ts`, porque es un efecto global sobre `pg` y el proyecto tiene CUATRO puntos de entrada: la API, `oficio_notifier`, los `scripts/*` y el CLI del seed. Cuando estaba en `app.ts`, los tres que no importan Express recibían objetos `Date` y reventaban al tratarlos como cadenas — y no lo veía nadie: el tipo declarado decía `string` y los tests importan `helpers` → `app.ts`, así que en el proceso de test el parser sí estaba puesto — pero las comparaciones ya no son lexicográficas sobre texto, son de fecha real.
- **`ST_MakeEnvelope(oeste, sur, este, norte, srid)` toma las coordenadas en OTRO orden que el `bbox` de la API** (`bbox=sur,oeste,norte,este`, heredado del formato que ya usaba el frontend). Mezclar el orden da un rectángulo válido pero en el sitio equivocado, sin ningún error. Ver el comentario en `routes/mapa.ts` junto al `ST_MakeEnvelope`.
- **`unaccent()` es `STABLE`, no `IMMUTABLE`: no vale dentro de una columna `GENERATED ... STORED`** (las cinco columnas `busca`). El esquema define `inmutable_unaccent()` (una función SQL que fija el diccionario por su nombre calificado) para poder declararla `IMMUTABLE`. Fuera de una columna generada (las consultas de `lib/buscador.ts`) `unaccent()` a secas sigue sirviendo.
- **Un helper `async` llamado sin `await` no lo delata el typecheck con `strict:false`.** `!miHelperAsync(x)` da siempre `false` (una `Promise` es truthy) y una promesa devuelta a un `try/catch` síncrono no se captura: un rechazo se vuelve *unhandled rejection* en vez de un error controlado. Le pasó de verdad durante el porte (validación de imágenes saltada en tres rutas, agenda bloqueada por completo en otras) — ver `.superpowers/sdd/2026-09-29-postgres/trampas-porte.md` para la lista de sitios. Antes de tocar un archivo que llame a un helper de otro dominio: `grep -n "!nombreDeLaFuncion(\|nombreDeLaFuncion(" archivo.ts` y confirmar que lleva `await`.
- **`INSERT OR IGNORE` no existe**: es `INSERT ... ON CONFLICT DO NOTHING` (con o sin columnas del conflicto, según haya o no un índice único que lo pida).
- **Comparar un parámetro de query sin validar contra una columna `uuid` (p. ej. `?province_id=x`) lanza `22P02`, no "sin resultados".** `errorHandler.ts` lo traduce a 404, que es correcto para `/api/services/:id` pero un 404 sobre un listado entero para un filtro de query string. Validar con `z.string().uuid().optional()` los filtros que van contra una columna uuid antes de meterlos en el WHERE Resuelto con `uuidQuery()` en `lib/entrada.ts`, aplicado en `providers.ts`, `services.ts`, `stats.ts` y `catalog.ts`: un filtro con un valor imposible da 200 con lista vacía, como hacía SQLite. El filtro `category` es la excepción y se resuelve distinto (`categoriaColumna()`), porque acepta un uuid **o** un slug y validarlo como uuid rompería la búsqueda por slug.

`DOCKER.md` y buena parte del `README.md` son del commit `init` y están **desactualizados** (mencionan `docker-compose.override.yml`, scripts `.ps1`, Stripe, perfil `db-init` — ya no existen). Fuente de verdad: el código y este archivo.

## Desarrollo local (j-u)

Ahora hace falta una base Postgres+PostGIS levantada: ya no es un archivo que el backend crea solo.

```bash
# Base de datos — igual que el compose de producción pero solo el servicio oficio_db,
# publicando el puerto para llegar desde fuera del contenedor (producción NO lo hace).
cd oficios-cuba
docker compose up -d oficio_db

# Backend — :3000
cd oficios-cuba/backend
npm install
cp ../.env.example .env && chmod 600 .env
# DATABASE_URL=postgresql://oficio:<POSTGRES_PASSWORD>@127.0.0.1:<puerto>/oficio
# JWT_SECRET: openssl rand -base64 48 ; DEMO_MODE=true
# COMPOSE_PROJECT_NAME=<algo distinto de "oficios-cuba"> — ver el aviso de abajo.
npm run dev                                  # await migrar() aplica el esquema si la base está vacía, y siembra solo

# Frontend — siguiente puerto libre 5173+ (en j-u: 5176)
cd oficios-cuba/frontend
npm install
npx vite --port 5176 --strictPort            # /api se reenvía a BACKEND_URL (def. http://localhost:3000)
```

- Cuentas demo (con `DEMO_MODE=true`): contraseña `Demo123!` — ver `backend/src/db/seed-demo.ts`.
- Para empezar de cero: `DROP DATABASE oficio` (o el volumen `oficio_pgdata` del compose de dev) y reiniciar el backend.
- Verificación: `npm test` y `npm run typecheck` (backend, con la base levantada — `npx vitest run` clona el esquema+seed base en una base de plantilla, una vez, y cada archivo de test corre contra su propia copia); `npx tsc --noEmit && npm run build` (frontend).
- Pagos manuales en local: `npm run pagos -- listar | confirmar <id> | rechazar <id>`.
- **⚠️ `.env` de un worktree de desarrollo: fijar `COMPOSE_PROJECT_NAME` a algo que NO sea el nombre del directorio.** Sin él, `docker compose` deriva el nombre de proyecto del directorio (`oficios-cuba`), que es el MISMO que usa `~/docker/oficio/oficios-cuba` en producción (vps2): un `docker compose down` (o cualquier comando que actúe "sobre todo el proyecto") lanzado por error desde un worktree de desarrollo pararía los contenedores de PRODUCCIÓN, no los del worktree. `.env` no se versiona, así que esta nota es la única red que queda — no hay forma de que lo traiga un `git pull`.

## Esquema y migraciones

- El esquema vive en un solo archivo, `backend/src/db/esquema.sql`, aplicado por `db/migrar.ts`.
- `migrar()` (llamada por `index.ts` al arrancar, con `await`, y por cualquier CLI/script que necesite la base) crea `schema_migrations` si no existe, y si la fila `ESQUEMA_VERSION` (constante en `migrar.ts`) no está, aplica `esquema.sql` completo dentro de una transacción y la inserta. Las migraciones posteriores a la v1 están en `db/migraciones.ts`, una por versión y cada una en su transacción. El esquema de Postgres nació limpio en la v1, sin arrastrar las 13 migraciones de la época de SQLite (esa historia solo importa para leer commits viejos).
- Para cambiar el esquema con datos reales en producción se añade una versión al array de `db/migraciones.ts` (una función por versión, cada una en su propia transacción), no se toca `esquema.sql` de la v1.
- **Si `migrar()` falla al arrancar, el proceso tiene que morir** (código de salida distinto de cero) en vez de servir con el esquema a medio aplicar — lo hace el `.catch()` de `start()` en `index.ts`.
- Probar cualquier migración nueva contra una copia de la base de producción antes de desplegar.

## Producción (vps2)

- Deploy y pagos manuales: ver `DOCKER.md`. El compose y el `.env` (chmod 600) viven en vps2.
- La base de datos real está en el volumen Docker `oficio_pgdata` (ya no un bind mount de archivo: `oficio_db` es `postgis/postgis:18-3.6`, sin puertos publicados, red interna `oficio_net`). **Copia de seguridad (`pg_dump`) antes de cualquier deploy que cambie el esquema.**
- Cambios en red/exposición (Traefik, túnel, puertos, CORS, auth, reglas de subida): **consultar con Dariel antes**.
- `DEMO_MODE=true` en producción siembra datos falsos y **simula los pagos de planes**: no ponerlo a `false` sin datos de pago reales definidos.

## Convenciones

- Todo el texto de la UI en español de Cuba; el tuteo es la norma.
- Contenido pensado para conexiones lentas: imágenes `.webp` locales, sin CDNs ni Google Fonts.
- Commits en español, descriptivos. Coordinar con Doniet antes de reescrituras grandes o de reescribir historia en `master`.
- Al cerrar una tarea, añadir una entrada a `STATUS.md` con el formato de las existentes.
