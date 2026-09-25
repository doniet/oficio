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
│   ├── db/               # index.ts = esquema SQLite; seed.ts = provincias/municipios/categorías; seed-demo.ts
│   ├── middleware/       # auth (JWT), errorHandler
│   └── routes/           # auth, categories, conversations, favorites, providers, provinces,
│                         # reviews, services, stats, subscriptions, uploads
├── frontend/src/
│   ├── components/       # ui.tsx (sistema de diseño), cards, Layout, DashboardLayout, ContactActions, ReviewList, ProvinceMapSelector
│   ├── pages/            # públicas + auth/ + dashboard/
│   ├── services/api.ts   # cliente axios, baseURL `/api`
│   └── types/index.ts
├── frontend/nginx.conf   # SPA, proxy /api, cabeceras, client_max_body_size
└── docker-compose.yml    # compose de PRODUCCIÓN (vps2)
```

### API (`/api`) — P = pública · A = con sesión · Pr = solo proveedor · C = solo cliente

| Recurso | Rutas |
|---|---|
| Sistema | `GET /health`, `GET /config` (P) |
| Auth | `POST /auth/register\|login` (P, 30 intentos / 15 min) · `GET /auth/me`, `PUT /auth/profile\|password` (A) |
| Catálogos | `/provinces[/:id[/municipalities]]`, `/categories[...]`, `/stats`, `/stats/categories` (P) |
| Proveedores | `GET /providers`, `/providers/featured`, `/providers/:id` (P) · `GET\|PUT /providers/me/profile` (Pr) |
| Servicios | `GET /services`, `/services/:id` (P; el dueño ve los inactivos) · `GET /services/mine`, `POST`, `PUT\|DELETE /:id`, `PATCH /:id/toggle` (Pr) |
| Subidas | `POST /uploads` (Pr, base64, 1,5 MB, tipo por firma: jpg/png/webp) · `GET /uploads/*` (estático) |
| Suscripciones | `GET /subscriptions/plans` (P) · `GET /me`, `POST /checkout\|confirm-manual\|cancel` (Pr) |
| Conversaciones | `GET /conversations`, `/unread-count`, `/:id?after=` · `POST /` (C) · `POST /:id/messages` (A, filtrado por participante) |
| Reseñas | `GET /reviews/provider/:id` (P) · `GET /eligibility/:serviceId`, `POST`, `DELETE /:id` (C) |
| Favoritos | `GET\|POST /favorites`, `/ids`, `/check/:id`, `DELETE /:providerId` (C) |

### Modelo de datos

`users` (client|provider) 1–1 `provider_profiles` (plan, `expires_at`, `rating`/`review_count` desnormalizados) 1–N `services` (`images` = JSON) · `service_areas` N–M `municipalities` · `provinces` 1–N `municipalities` · `categories` en 2 niveles (`parent_id`) · `reviews(service, client, provider)` · `conversations(client, provider, service?)` 1–N `messages` · `favorites(client, provider)` único · `subscriptions` 1–N `payments`. IDs UUID. 🚨 `conversations.provider_id` y `reviews.provider_id` son el id del **perfil**, no del usuario. `foreign_keys=ON` y WAL.

### Páginas

Públicas: `/`, `/buscar`, `/profesionales`, `/planes`, `/servicio/:id`, `/proveedor/:id`, `/login`, `/registro`. Panel `/dashboard`: `mensajes`, `cuenta` (todos); `favoritos` (cliente); `perfil`, `servicios`, `servicios/nuevo`, `servicios/:id/editar`, `suscripcion` (proveedor). `/dashboard/mensajes/:id` va fuera del layout del panel.

## Gotchas

- **nginx: una `location` por regex gana a un prefijo sin `^~`.** La regex de extensiones de `nginx.conf` captura `/api/uploads/*.webp` antes que `location /api/` → las fotos subidas dan 404 en prod (confirmado 25-sep). Cualquier prefijo que deba ganar lleva `^~`.
- **`DEMO_MODE=true` = cuentas con contraseña pública + planes de pago gratis.** Solo para dev/staging.
- **Sin migraciones:** una columna nueva no llega a una DB existente.
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
- Para empezar de cero: parar el backend y mover `backend/data/` a otro sitio (no hay migraciones: el esquema se crea con `CREATE TABLE IF NOT EXISTS`).
- Verificación mínima: `npm run typecheck` (backend) y `npx tsc --noEmit && npm run build` (frontend). **No hay tests automatizados.**

## Producción (vps2)

- Deploy: en `~/docker/oficio/oficios-cuba`, `git pull` + `docker compose up -d --build`. El compose y el `.env` (chmod 600) viven allí.
- La base de datos real está en `~/docker/oficio/oficios-cuba/data/` (bind mount). **Copia de seguridad antes de cualquier deploy que cambie el esquema.**
- Cambios en red/exposición (Traefik, túnel, puertos, CORS, auth, reglas de subida): **consultar con Dariel antes**.
- `DEMO_MODE=true` en producción siembra datos falsos y **simula los pagos de planes**: no ponerlo a `false` sin datos de pago reales definidos.

## Convenciones

- Todo el texto de la UI en español de Cuba; el tuteo es la norma.
- Contenido pensado para conexiones lentas: imágenes `.webp` locales, sin CDNs ni Google Fonts.
- Commits en español, descriptivos. Coordinar con Doniet antes de reescrituras grandes o de reescribir historia en `master`.
- Al cerrar una tarea, añadir una entrada a `STATUS.md` con el formato de las existentes.
