# Apps móviles de Oficios Cuba — diseño

- Fecha: 2026-09-25 · Autor: cc-jarvis-ubuntu con Dariel · Estado: pendiente de revisión
- Desarrollador / publicador en las tiendas: **DARDOIT**

## 1. Objetivo y criterio de éxito

Oficios Cuba pasa de web a **web + apps nativas de Android e iOS**. Las apps son el canal principal para quien busca y ofrece oficios desde el teléfono, en Cuba, con datos móviles caros y conexión intermitente.

**La v1 está hecha cuando:** un familiar de Doniet en Cuba instala la APK, se registra, abre una solicitud a un proveedor, y el proveedor **recibe la notificación push**, o, si FCM no llega a Cuba, se ha decidido el plan B de push con ese dato real (§6).

### Lo que dijo Dariel (decisiones cerradas)
- Tecnología: **Expo / React Native**. Descartados Kotlin+Swift (doble trabajo) y la web empaquetada (TWA/Capacitor).
- Distribución: **APK directa / Apklis (Cuba) + Google Play + App Store**. La diáspora no es foco de la v1.
- Alcance v1: **cliente + proveedor básico** (§4).
- Repo: **opción A** (`shared/` + `mobile/` junto a lo existente), pero "el proyecto va en serio": A tiene que poder pasar a monorepo con workspaces (B) sin reescribir imports.
- **Push en v1:** el proveedor recibe aviso cuando le llega una solicitud.
- Desarrollador en las tiendas: **DARDOIT**.

### Supuestos (corregibles)
- El push también avisa de **mensajes nuevos** (a los dos lados), no solo de la solicitud inicial.
- El backend actual y su API siguen siendo la única fuente de datos; la app no tiene base de datos propia salvo caché.

## 2. Estructura del repo

```
oficios-cuba/
├── backend/        API Express (cambios: §6 push y §7 versión de app)
├── frontend/       web, sin cambios en la v1 de las apps
├── shared/         paquete @oficio/shared (NUEVO)
└── mobile/         app Expo SDK 57 + expo-router (NUEVO)
```

- `shared/` es un paquete completo (`package.json` con `"name": "@oficio/shared"`, `tsconfig`, tests). `mobile/` lo consume con `"@oficio/shared": "file:../shared"`. La web **no** lo adopta aún: exigiría cambiar el contexto de build de Docker en vps2.
- **Preparado para B:** los imports son siempre `@oficio/shared`; pasar a workspaces es mover carpetas y declarar `workspaces`, sin tocar código.
- Metro (bundler de Expo) tiene que resolver `../shared` enlazado por `file:`; cómo se configura en SDK 57 (symlinks / `watchFolders`) se comprueba contra la documentación al escribir el plan, no se supone.

## 3. Paquete `@oficio/shared`

TypeScript puro: **sin DOM, sin React, sin `localStorage`, sin axios**. Dependencia de runtime única: `zod`.

| Módulo | Contenido |
|---|---|
| `tipos.ts` | Entidades tal como las devuelve la API hoy: `ServiceSummary`, `ServiceDetail`, `ProviderCard`, `ProviderDetail`, `Review`, `Conversation`, `Message`, `User`, `Category`, `Province`, `Municipality`, `Plan`. Punto de partida: `frontend/src/types`, **ajustado a las respuestas reales** (p. ej. ya no hay `lat`/`lng` públicos). |
| `api.ts` | `crearCliente({ baseUrl, getToken, onUnauthorized, timeoutMs = 20000 })` sobre `fetch`. Un método por endpoint usado en la v1. Errores normalizados: `{ status, mensaje }` con el `error` del backend; `status: 0` = sin red / timeout. |
| `validacion.ts` | Esquemas zod de formularios que coinciden con los del backend: registro, login, servicio, reseña, mensaje. |
| `formato.ts` | Precio (`desde $15`, `$5 / hora`, `A convenir`), fecha relativa, nombre visible del proveedor (`business_name || owner_name`). Punto de partida: `frontend/src/lib/format.ts`. |

## 4. App: navegación y pantallas (v1)

Diseño visual: el de la web (paleta arena / tinta / mar / coral; Bricolage Grotesque + Figtree **empaquetadas en la app**, sin descargas), con patrones nativos: pestañas, pilas y hojas modales.

**Pestañas por rol** (sin sesión = visitante, con las pestañas del cliente):

| Cliente / visitante | Proveedor |
|---|---|
| Inicio · Buscar · Mensajes · Favoritos · Cuenta | Inicio · Mensajes · Mis servicios · Cuenta |

**Rutas (expo-router):**

| Ruta | Qué hace | Endpoints |
|---|---|---|
| `(tabs)/index` | Buscador, categorías, destacados, servicios nuevos | `/stats`, `/stats/categories`, `/providers/featured`, `/services?sort=newest` |
| `(tabs)/buscar` | Filtros (oficio, provincia, precio máx., orden), lista infinita | `/services`, `/categories`, `/provinces` |
| `(tabs)/mensajes` | Conversaciones + no leídos | `/conversations`, `/conversations/unread-count` |
| `(tabs)/favoritos` | Cliente | `/favorites`, `DELETE /favorites/:providerId` |
| `(tabs)/servicios` | Proveedor: lista, pausar/activar, límite del plan visible, crear | `/services/mine`, `PATCH /services/:id/toggle` |
| `(tabs)/cuenta` | Perfil, avatar (proveedor), contraseña, cerrar sesión, enlace a la web (planes, perfil completo) | `/auth/me`, `PUT /auth/profile`, `PUT /auth/password`, `POST /uploads` |
| `servicio/[id]` | Galería, precio, proveedor, reseñas; Chatear / WhatsApp / Llamar | `/services/:id` |
| `proveedor/[id]` | Ficha, servicios, reseñas y distribución | `/providers/:id` |
| `conversacion/[id]` | Chat; botón Reseñar si `can_review` | `/conversations/:id?after=`, `POST /:id/messages`, `/reviews/eligibility/:id` |
| `servicio/editar/[id]` (`nuevo`) | Formulario con fotos de cámara o galería | `POST`/`PUT /services`, `POST /uploads`, `/categories` |
| `resena/[serviceId]` | Hoja modal de reseña | `POST /reviews` |
| `(auth)/entrar`, `(auth)/registro` | Login / registro (cliente o proveedor) | `/auth/login`, `/auth/register` |

- Sin sesión se navega todo; el login aparece **solo al hacer algo que lo necesita** (chatear, favorito, reseñar) y vuelve a donde estaba.
- **Fuera de la v1:** planes y pagos, perfil completo del proveedor (zonas de servicio, contacto), mapa de provincias. Siguen en la web.
- **Enlaces profundos** (`oficio.dardoit.com/servicio/:id` → app): el esquema `oficio://` y los `intentFilters` / `associatedDomains` quedan configurados; la verificación del dominio (`assetlinks.json`, `apple-app-site-association`) se publica cuando el dominio sea definitivo.

## 5. Sesión, datos y mala conexión

- **Token** en `expo-secure-store` (Keychain / Keystore). Arranque: `/auth/me`; un 401 limpia la sesión y deja al usuario como visitante (cubre la revocación por cambio de contraseña).
- **URL de la API:** `EXPO_PUBLIC_API_URL`, por defecto `https://oficio.dardoit.com/api`.
- **TanStack Query** con caché **persistida en disco**: sin red se muestra lo último cargado con un aviso "Sin conexión · datos de hace X". Lecturas: 2 reintentos con espera creciente. **Las escrituras no se encolan en la v1**: error claro + reintentar.
- **Chat:** sondeo cada 10 s con `?after=`, solo con la conversación abierta y la app en primer plano.
- **Ahorro de datos:** `expo-image` con caché en disco; fotos redimensionadas en el teléfono a ≤1280 px y JPEG 70 % antes de subir (≈200–400 KB; siempre bajo el límite de 1,5 MB del backend).

## 6. Notificaciones push

**Qué avisa:**
- Al **proveedor**, cuando un cliente abre una conversación nueva (una solicitud): "Nueva solicitud de Laura · Plomería".
- A **cualquiera de los dos**, cuando llega un mensaje en una conversación que no tiene abierta: "Nuevo mensaje de Laura".
- **Sin el texto del mensaje** en la notificación: el contenido privado no pasa por los servidores de Google ni de Apple.
- Tocarla abre `conversacion/[id]`.

**Backend:**
- Tabla nueva `push_devices (id, user_id, canal, token, plataforma, app_version, created_at, last_seen_at)`, con `UNIQUE(canal, token)`. Llega con una migración nueva (v3).
- `POST /api/push/devices` (A) registra o refresca un dispositivo; `DELETE /api/push/devices/:token` (A) lo quita al cerrar sesión.
- `avisar(userId, notificacion)` recorre los dispositivos del destinatario y llama al canal de cada uno. **No bloquea la respuesta** del endpoint de mensajes (se ejecuta después de responder); sus fallos se registran en el log y el chat sigue funcionando. Los tokens que el proveedor de push declara inválidos se borran.
- Interfaz de canal: `enviar(token, { titulo, cuerpo, datos }) → 'ok' | 'token_invalido' | 'error'`.

**Canales:**
1. **`expo`**: Expo Push Service → FCM (Android) / APNs (iOS). Es el que se implementa en la v1.
2. **`propio`** (plan B, solo Android): servidor **ntfy** autoalojado (UnifiedPush) + un servicio en primer plano en la app que mantiene la conexión sin depender de Google. Tiene coste: una notificación fija ("Oficios Cuba conectado"), algo de batería y de datos, y ntfy como superficie nueva en vps2. **Se implementa solo si la prueba de §6.1 falla**, y el despliegue de ntfy exige el OK de Dariel.

### 6.1 Prueba de entrega en Cuba (antes de cerrar la v1)
**No está verificado** que FCM entregue a teléfonos dentro de Cuba. El único indicio es un testimonio publicado en Aporrea (push web vía Firebase que "no llega porque Cuba no está registrada como destino"), no confirmado.

Prueba: un build de desarrollo con el canal `expo`, instalado por la familia de Doniet (Android, en Cuba), con datos móviles **y** con WiFi. Se envían 10 notificaciones espaciadas y se anota cuántas llegan y con qué retraso. Resultado:
- ≥ 9/10 en menos de 1 minuto → el canal `expo` basta.
- Si no → plan B (`propio`) para Android.

iOS en Cuba: la misma prueba en cuanto haya cuenta Apple y un iPhone disponible allí.

## 7. Build y distribución

**Identidad:** desarrollador **DARDOIT**, nombre visible "Oficios Cuba", `applicationId` / `bundleIdentifier` **`com.dardoit.oficios`** (no se puede cambiar una vez publicado).

**Android** (se compila en j-u: SDK, NDK y emulador ya instalados):
- 🚨 **Una sola firma para todos los canales.** En Play se sube nuestra propia clave de firma, en vez de dejar que Play genere la suya, para que la APK de Apklis/descarga directa y la de Play sean intercambiables al actualizar.
- **Keystore:** se genera una vez, en un archivo 600, y se respalda **en dos sitios desde el primer día**. Su contraseña nunca pasa por el chat (regla #7).
- Salidas: **AAB** para Play; **APK por arquitectura** (arm64-v8a, armeabi-v7a) para descarga directa y Apklis.
- **Descarga directa:** `oficio.dardoit.com/app/` (estáticos en el nginx existente).
- **Actualizaciones fuera de tiendas:** `GET /api/app/version` → `{ ultima, minima, url_apk }`. La app compara con su versión y muestra "Hay una versión nueva" (o bloquea si está por debajo de la mínima). **Sin actualizaciones OTA de Expo**: su disponibilidad desde Cuba tampoco está verificada.

**iOS:** requiere una **cuenta Apple Developer** a nombre de DARDOIT ($99 al año). Se compila en la MacBook o con EAS Build. El código es el mismo que el de Android.

## 8. Pruebas

| Capa | Cómo |
|---|---|
| `shared` | vitest: cliente API con fetch simulado (errores, timeout, 401 → `onUnauthorized`), formato |
| Backend push | vitest + supertest: registro y borrado de dispositivos, aviso al abrir una conversación y al enviar un mensaje (con un canal falso), borrado de tokens inválidos, que un fallo del canal no rompa el mensaje. Prueba de mutación como en la tanda anterior. |
| `mobile` lógica | jest-expo: sesión (arranque, 401), redimensionado de fotos, comparación de versiones |
| `mobile` pantallas | lista de comprobación manual en emulador + teléfono real (Android) por cada pantalla de §4 |
| Real | prueba de entrega en Cuba (§6.1) |

## 9. Fuera de alcance (v1)
Pagos y planes en la app, mapa, perfil completo del proveedor, cola de envío sin conexión, OTA, diáspora, adopción de `shared` por la web, migración a workspaces (B), y el canal de push `propio` salvo que §6.1 lo exija.

## 10. Abierto
- Cuenta **Apple Developer** a nombre de DARDOIT: quién la paga y la gestiona.
- ¿La cuenta de **Google Play** es la misma que la de DardoVentas (de Doniet)?
- Cuenta de **Apklis**: requisitos de registro para publicar **sin verificar**; averiguarlos antes de prometer esa vía.
- Dónde se guarda la segunda copia del keystore (R2 de DH Systems o de Doniet).
