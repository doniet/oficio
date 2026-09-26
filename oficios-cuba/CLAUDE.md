# CLAUDE.md — Oficios Cuba

Directorio/marketplace de oficios y servicios en Cuba: los clientes buscan por oficio y lugar, leen reseñas y escriben directo al profesional (chat o WhatsApp); los profesionales publican servicios y pagan un plan para tener más visibilidad.

- **Repo:** `github.com/doniet/oficio` (rama `master`), **compartido con Doniet**. La app vive en la subcarpeta `oficios-cuba/`.
- **Producción:** `oficio.dardoit.com` en **vps2** (`~/docker/oficio`), detrás de Traefik (`net_dmz`) + túnel Cloudflare de la cuenta Doniet.
- **Desarrollo:** j-u (`~/Documentos/dev/oficio`).
- Antes de tocar nada: leer `STATUS.md` (orden cronológico: lo más reciente está al final).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 22 · Express 4 · TypeScript · better-sqlite3 12 (SQLite, WAL) · JWT · zod |
| Frontend | React 18 · Vite 5 · Tailwind 3 · React Router 6 · Leaflet · axios |
| Producción | `oficio_web` (nginx: SPA + proxy `/api`) en `net_dmz` → `oficio_api` en red **interna sin salida** (`oficio_net`) |

## Estructura

```
oficios-cuba/
├── backend/src/
│   ├── index.ts          # arranque: esquema → seedBase() → seedDemo() si DEMO_MODE
│   ├── config.ts         # DEMO_MODE, JWT_SECRET (falla en prod si es débil), PLANS y límites
│   ├── app.ts            # la app Express (sin listen): la importan index.ts y los tests
│   ├── db/               # index.ts = esquema + MIGRACIONES + reglas (límite de plan, caducidad); pagos.ts; seeds
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
| Proveedores | `GET /providers`, `/providers/featured`, `/providers/:id` (P) · `POST /providers/:id/contact` (P; registra el contacto de un cliente con sesión) · `GET\|PUT /providers/me/profile` (Pr) |
| Citas | `GET /appointments/provider/:id/slots?service_id=` (P, solo Profesional) · `GET /appointments/mine`, `PATCH /:id`, `POST /:id/reschedule` (A) · `POST /` (C) · `GET\|PUT /config`, `GET /calendar?desde&hasta`, `POST /manual`, `POST\|DELETE /blocks` (Pr) |
| Catálogo | `GET /catalog/provider/:id?q&section&page`, `GET /catalog/search?q&province_id&municipality_id&page` (P) · `GET /catalog/mine`, `POST`, `PUT\|DELETE /:id`, `PATCH /:id/available` (Pr) |
| Telegram | `GET /telegram/status`, `POST\|DELETE /telegram/link`, `PUT /telegram/prefs`, `POST /telegram/test` (A) |
| Admin | `GET /admin/me`, `POST /admin/2fa/setup\|enable\|verify` · con `X-Admin-Token`: `GET /admin/system\|telegram\|audit`, `PUT\|DELETE /admin/telegram/token` |
| Servicios | `GET /services`, `/services/:id` (P; el dueño ve los inactivos) · `GET /services/mine`, `POST`, `PUT\|DELETE /:id`, `PATCH /:id/toggle` (Pr) |
| Subidas | `POST /uploads` (Pr, base64, 1,5 MB, tipo por firma: jpg/png/webp) · `GET /uploads/*` (estático) |
| Suscripciones | `GET /subscriptions/plans` (P) · `GET /me`, `POST /checkout\|confirm-manual\|cancel` (Pr) |
| Conversaciones | `GET /conversations`, `/unread-count`, `/:id?after=` · `POST /` (C) · `POST /:id/messages` (A, filtrado por participante) |
| Reseñas | `GET /reviews/provider/:id` (P) · `GET /eligibility/:serviceId`, `POST`, `DELETE /:id` (C) |
| Favoritos | `GET\|POST /favorites`, `/ids`, `/check/:id`, `DELETE /:providerId` (C) |

### Modelo de datos

`users` (client|provider) 1–1 `provider_profiles` (plan, `expires_at`, `rating`/`review_count` desnormalizados) 1–N `services` (`images` = JSON) · `service_areas` N–M `municipalities` · `provinces` 1–N `municipalities` · `categories` en 2 niveles (`parent_id`) · `reviews(service, client, provider)` · `conversations(client, provider, service?)` 1–N `messages` · `favorites(client, provider)` único · `subscriptions` 1–N `payments` · `appointments(provider, client?, service?, starts_at/ends_at UTC, origin online|manual, rescheduled_from)` · `agenda_blocks(provider, rango)` · `catalog_items(provider, precio fixed|from|ask, image?, section?, available, hidden_by_plan)` · `contacts(client, provider, via)`. `provider_profiles` lleva además `contact_mode`, `kind` (oficio|negocio), `horario`, `gallery` (JSON), `agenda` (JSON), `show_on_map`; `users.google_sub`. IDs UUID. 🚨 `conversations.provider_id` y `reviews.provider_id` son el id del **perfil**, no del usuario. `foreign_keys=ON` y WAL.

### Páginas

Públicas: `/`, `/buscar`, `/profesionales`, `/planes`, `/servicio/:id`, `/proveedor/:id`, `/login`, `/registro`. Panel `/dashboard`: `mensajes`, `cuenta` (todos); `favoritos` (cliente); `perfil`, `servicios`, `servicios/nuevo`, `servicios/:id/editar`, `catalogo`, `suscripcion`, `agenda`, `agenda/ajustes` (proveedor); `citas` (cliente). `/auth/google` = vuelta del login real de Google. `/dashboard/mensajes/:id` va fuera del layout del panel.

## Reglas de negocio (con test)

- **Planes** (`config.ts` → `PLANS`, `planDe()`): **Gratis** 1 oficio, sin fotos, contacto por WhatsApp/llamada · **Básico** $1/mes, 5 oficios, 10 fotos de galería · **Profesional** $10/mes, oficios ilimitados, 30 fotos, negocio + horario, agenda de citas, chat, enlace al punto de venta DardoVentas. `premium` ya no existe (la migración 3 lo pasa a `pro`). Al bajar de plan fotos/negocio no se borran: dejan de mostrarse.
- **Agenda** (`lib/agenda.ts` + `lib/hora.ts`, JSON v2 en `provider_profiles.agenda`; el v1 se sigue leyendo): tramos por día, excepciones por fecha, bloqueos, duración por servicio (`services.duration_min`), márgenes, antelación, horizonte, máximo por día, confirmación manual/auto y plazo de cambio del cliente. Toda hora de pared es de Cuba vía tzdata (nunca desfases fijos; el cambio de hora cubano es a las 0:00). Un hueco está ocupado por **solape** con citas no canceladas (pendientes incluidas) o bloqueos; se revalida dentro de la transacción del insert. El profesional apunta citas manuales y reprograma a cualquier hora (409 `code: 'choque'` → reintento con `forzar`); "hecha"/"no vino" solo pasada la hora.
- **Catálogo** (`routes/catalog.ts`): Gratis 0 · Básico 50 · Profesional 1000 (`PLANS.maxCatalog`). Al cambiar de plan `enforcePlanLimit` recalcula `hidden_by_plan` (se ven los más antiguos; al subir de plan reaparecen). Fotos opcionales con cuota propia (`uploads.purpose='catalog'`): tantas como el tope del plan en 24 h. Al cambiar o borrar la foto de un artículo, `borrarSiHuerfana` la quita del disco si nada más la usa. La búsqueda de productos intercala profesionales (`ROW_NUMBER` por perfil) y omite los agotados.
- **Avisos por Telegram** (`lib/avisos.ts`, `routes/telegram.ts`, `src/notifier/`): la API **solo apunta** avisos en `notifications` (no tiene salida a internet) si el usuario vinculó Telegram y no apagó ese grupo (`users.notify_prefs`: citas, recordatorios, chat, reseñas, plan). Los envía `oficio_notifier` (misma imagen, `node dist/notifier/index.js`, perfil de compose `telegram`): único con salida (net_dmz), long polling sin puertos abiertos, y único que puede leer el token: publica su clave pública en `telegram_state` (privada en `secrets/notifier/`, solo la monta él), la API guarda el token cifrado (RSA-OAEP) y el notificador lo relee cada 10 s. Vinculación: código de un solo uso (hash en `telegram_link_tokens`, 10 min) → `t.me/<bot>?start=<código>`. El chat avisa sin el texto del mensaje, uno por tramo de 10 min. Recordatorios/resumen/vencimiento los programa la API cada 5 min con `dedupe_key`. El notificador no importa `db/index.ts` (cargaría `config.ts` y exigiría `JWT_SECRET`).
- **Push de las apps** (`push/avisos.ts`, `notifier/push.ts`, `push/fcm.ts`): igual que Telegram, la API **solo apunta** en `push_outbox` (una fila por dispositivo de `push_devices`, con el `user_id` dueño al apuntar) y `oficio_notifier` la envía por FCM HTTP v1 si tiene `secrets/fcm/cuenta.json`. Chat: "Nueva solicitud" / "Nuevo mensaje", sin el texto. Caduca a las 24 h; 5 intentos; `UNREGISTERED`/404 borra el dispositivo (nunca por grep del mensaje: `SENDER_ID_MISMATCH` también menciona el token); si el dispositivo cambió de dueño, no se envía.
- **Panel técnico** (`routes/admin.ts`, `/admin`): `users.is_admin` solo se da por CLI (`scripts/admin.ts`); a quien no es admin, 404. 2FA TOTP propio (`lib/totp.ts`, un código no vale dos veces, 5 fallos / 15 min) que abre una sesión de 30 min (`X-Admin-Token`, JWT `scope: admin`, se invalida al cambiar contraseña o reiniciar el 2FA); acciones sensibles piden un código nuevo; todo en `admin_audit`.
- **Chat solo Profesional:** no se abren conversaciones con Gratis/Básico; las viejas se leen pero no se puede escribir.
- **Precios:** cada servicio lleva `price_currency` (CUP por defecto, o USD); el frontend muestra la otra moneda con la tasa de `/api/tasas`.
- **Google:** con `GOOGLE_CLIENT_ID` → verificación real del `id_token` (flujo de redirección, sin script de Google). Sin él y con `DEMO_MODE` → selector de cuentas ficticias. Una cuenta con contraseña no se toma con el Google simulado. Fuera de demo y con Google real, pedir cita exige cuenta de Google.
- **Ubicación pública:** `lat/lng` solo salen en `/providers/:id` si el profesional marcó `show_on_map`.
- **Plan:** el máximo de servicios se aplica al crear, al reactivar (`toggle`) y al bajar de plan (caducidad, cancelación): se pausan los más nuevos.
- **Reseñas:** una por cliente y proveedor; solo si hubo trato (respuesta en el chat, cita confirmada/hecha, o contacto por WhatsApp/llamada con sesión — tabla `contacts`); nunca sobre un servicio pausado. Borrar un servicio conserva sus reseñas (`service_id` → NULL).
- **Sesiones:** cambiar la contraseña invalida los tokens anteriores (`users.password_changed_at`); el endpoint devuelve uno nuevo.
- **Imágenes:** solo `/demo/*.webp` o subidas propias (tabla `uploads`), máx. 60 subidas / 24 h por usuario.
- **Login:** además del límite por IP, 10 fallos / 15 min por cuenta.

## Gotchas

- **`/api/tasas` lo sirve nginx** (`location =`, gana a `^~ /api/`) desde dardoventas.com con caché y `use_stale`; si nunca respondió, cae a la API (`TASA_CUP_USD`). oficio_web sí tiene salida (net_dmz); oficio_api no.
- **nginx: una `location` por regex gana a un prefijo sin `^~`.** Por eso `/api/`, `/assets/` y `/demo/` llevan `^~`; sin él las fotos subidas daban 404 en prod.
- **`DEMO_MODE=true` = cuentas con contraseña pública + planes de pago gratis.** Solo para dev/staging.
- `CF-Connecting-IP` es fiable solo porque Traefik en vps2 no publica puertos (todo entra por el túnel). Si eso cambia, el rate limit por IP se puede falsificar.
- El backend compila con `strict:false` y `global.d.ts` tipa better-sqlite3 como `any`: el tipado protege poco; verificar en ejecución.

`DOCKER.md` y buena parte del `README.md` son del commit `init` y están **desactualizados** (mencionan `docker-compose.override.yml`, scripts `.ps1`, Stripe, perfil `db-init` — ya no existen). Fuente de verdad: el código y este archivo.

## Desarrollo local (j-u)

```bash
# Backend — :3000
cd oficios-cuba/backend
npm install
cp ../.env.example .env && chmod 600 .env   # JWT_SECRET: openssl rand -base64 48 ; DEMO_MODE=true
npm run dev                                  # crea backend/data/oficios.db y siembra solo

# Frontend — siguiente puerto libre 5173+ (en j-u: 5176)
cd oficios-cuba/frontend
npm install
npx vite --port 5176 --strictPort            # /api se reenvía a BACKEND_URL (def. http://localhost:3000)
```

- Cuentas demo (con `DEMO_MODE=true`): contraseña `Demo123!` — ver `backend/src/db/seed-demo.ts`.
- Para empezar de cero: parar el backend y mover `backend/data/` a otro sitio.
- Verificación: `npm test` y `npm run typecheck` (backend); `npx tsc --noEmit && npm run build` (frontend).
- Pagos manuales en local: `npm run pagos -- listar | confirmar <id> | rechazar <id>`.

## Esquema y migraciones

- Base nueva: se crea con `schema` y se marca `PRAGMA user_version = ESQUEMA_VERSION`.
- Base existente: `initDatabase()` aplica las migraciones pendientes de `MIGRACIONES` (en `db/index.ts`), una transacción cada una, con `foreign_key_check` antes de subir la versión.
- **Cambio de esquema = tocar DOS sitios:** `schema` (bases nuevas) y una migración nueva al final de `MIGRACIONES` (bases existentes). Nunca editar una migración ya publicada.
- Probar cada migración contra una copia de la base de producción antes de desplegar (`test/fixtures/esquema-v0.sql` = esquema con el que nació prod).

## Producción (vps2)

- Deploy y pagos manuales: ver `DOCKER.md`. El compose y el `.env` (chmod 600) viven en vps2.
- La base de datos real está en `~/docker/oficio/oficios-cuba/data/` (bind mount). **Copia de seguridad antes de cualquier deploy que cambie el esquema.**
- Cambios en red/exposición (Traefik, túnel, puertos, CORS, auth, reglas de subida): **consultar con Dariel antes**.
- `DEMO_MODE=true` en producción siembra datos falsos y **simula los pagos de planes**: no ponerlo a `false` sin datos de pago reales definidos.

## Convenciones

- Todo el texto de la UI en español de Cuba; el tuteo es la norma.
- Contenido pensado para conexiones lentas: imágenes `.webp` locales, sin CDNs ni Google Fonts.
- Commits en español, descriptivos. Coordinar con Doniet antes de reescrituras grandes o de reescribir historia en `master`.
- Al cerrar una tarea, añadir una entrada a `STATUS.md` con el formato de las existentes.
