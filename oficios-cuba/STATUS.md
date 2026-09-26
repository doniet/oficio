# STATUS — Oficios Cuba

## 2026-09-25 05:50 — claude-code (vps2) — Rediseño completo backend + frontend y despliegue local
- Changes: backend refactorizado (config central, stats, uploads con detección de firma, búsqueda/filtros, límites de plan, elegibilidad de reseñas, seed demo con 8 proveedores). Frontend reescrito entero: sistema de diseño, componentes (`ui`, `cards`, `ContactActions`, `ReviewList`), Layout/DashboardLayout, todas las páginas públicas (Home, Buscar, Profesionales, Planes, Servicio, Proveedor, Login, Registro, 404) y del panel (Resumen, Perfil, Mis servicios, Formulario, Mi plan, Mensajes, Conversación, Favoritos, Cuenta). Compose de producción: `oficio_web` (nginx, net_dmz + labels Traefik) y `oficio_api` en red interna sin salida.
- Tests: pass — `tsc` + build de imagen OK; E2E con Playwright (contenedor en net_dmz) a 390 px y 1280 px sobre 25 rutas: 0 errores de consola/red, 0 desbordes horizontales. Flujos con escritura OK: enviar mensaje, crear → listar → pausar → borrar servicio. Bugs arreglados en la verificación: regex sin comillas en nginx.conf (el contenedor no arrancaba), desborde del resumen del proveedor en móvil, barra inferior tapando la caja de texto del chat.
- Security: N/A cambios de superficie. Se intentó abrir `/api/uploads` a clientes (para su avatar) y se revirtió: queda pendiente de decisión de Dariel.
- Next:
  - ~~Publicar `oficio.dardoit.com`~~ hecho (ver entrada siguiente).
  - Decidir si los clientes pueden subir avatar (quitar `requireProvider` en `backend/src/routes/uploads.ts` y el `canUpload` de `Account.tsx`).
  - Definir datos de pago reales (cuenta de transferencia/contacto) antes de poner `DEMO_MODE=false`.
  - La conversación demo de `proveedor@demo.com` contiene un mensaje "Prueba E2E …" de la verificación.
- Blockers: el hostname del túnel requiere acceso al panel Cloudflare de Doniet (Dariel).

## 2026-09-25 06:10 — claude-code (vps2) — Publicación en oficio.dardoit.com
- Changes: Dariel añadió el Public Hostname `oficio.dardoit.com` → `http://traefik:80` en el túnel Doniet. Sin cambios de código.
- Tests: pass — E2E Playwright contra la URL pública, 25 rutas a 390 px, login demo cliente y proveedor OK, 0 desbordes. `/api/*` 200, asset inexistente 404 real (sin envenenar caché), CSP y X-Frame-Options presentes.
- Security: OK. Único error de consola: la CSP bloquea el beacon de Cloudflare Web Analytics que inyecta el edge. Inofensivo; decidir si se desactiva la inyección en CF o se permite `static.cloudflareinsights.com` en la CSP.
- Next: avatar para clientes (pendiente de decisión), datos de pago reales antes de `DEMO_MODE=false`, decidir sobre el beacon de CF.
- Blockers: ninguno.

## 2026-09-25 06:10 UTC — cc-jarvis-ubuntu — Arranque en j-u, CLAUDE.md y revisión a fondo del código
- Changes: clon en j-u (`~/Documentos/dev/oficio`). El commit del rediseño (`d68b13f`) estaba solo en vps2, sin push a GitHub: se trajo con `git fetch vps2:docker/oficio master` (lectura en vps2). Nuevo `CLAUDE.md` (stack, API, modelo, páginas, dev/prod, gotchas). `frontend/vite.config.ts`: proxy `/api` solo para `vite dev` (el build no cambia).
- Tests: typecheck N/A (sin cambios de lógica). Dev local OK: API :3000 (demo, 12 proveedores / 22 servicios), vite :5176, home sin errores de consola.
- Security: revisión de solo lectura. Sin IDOR ni inyección SQL; subida con detección por firma. Hallazgos que importan (detalle abajo).
- Revisión — ALTO:
  1. `nginx.conf`: la regex de extensiones gana a `location /api/` → **las fotos subidas dan 404 en prod** (confirmado en vivo: `/api/uploads/x.webp` responde el 404 de nginx). Arreglo: `^~` en `/api/`, `/assets/`, `/demo/` (arregla también la caché de assets).
  2. Borrar un servicio borra en cascada sus reseñas y no recalcula `rating`/`review_count` → se pueden lavar las malas reseñas.
  3. Con `DEMO_MODE=false` nadie puede activar un plan de pago: no hay admin que confirme pagos.
  4. **Prod es pública con `DEMO_MODE=true`** (`/api/config` → `{"demo":true}`): el login muestra `proveedor@demo.com`/`Demo123!`, cualquiera entra y cambia datos; cualquier proveedor se pone Premium gratis con insignia "Verificado".
  5. El límite de servicios del plan se salta bajando de plan (expirar/cancelar no pausa el excedente; `toggle` no revisa el límite).
- Revisión — MEDIO: reseñas con requisito trivial (basta un "hola"; varias por proveedor); "Verificado" = paga Premium; subidas sin cuota ni limpieza; rate limit con `CF-Connecting-IP` falsificable si Traefik recibe tráfico directo; `address`/`lat`/`lng` públicos en la API y WhatsApp copiado del teléfono sin preguntar; sin migraciones; proveedor sin `business_name` no sale en /profesionales.
- Revisión — BAJO: FK de zonas → 500; parámetros duplicados → 500; JWT sin revocación al cambiar contraseña; enumeración de emails; registro de proveedor sin transacción; URLs de imagen externas que la CSP bloquea; lat/lng no se pueden borrar; fechas en dos formatos; `./data` creado como root; `DOCKER.md` obsoleto; `strict:false`; endpoints muertos; **sin tests**.
- Next: decidir con Dariel/Doniet (a) el push de `d68b13f` + este commit a GitHub, (b) quitar el modo demo de prod o esconder la web hasta tenerlo, (c) orden de arreglos: nginx `^~` → cascada de reseñas → límite de plan → admin de pagos.
- Blockers: los cambios en prod (vps2) y el modo demo tocan superficie pública → OK de Dariel.

## 2026-09-25 07:00 UTC — cc-jarvis-ubuntu — Corrección de los hallazgos de la revisión
- Changes:
  - **nginx** `^~` en `/api/`, `/assets/`, `/demo/`: las fotos subidas llegan a la API y la caché de assets se aplica.
  - **Migraciones versionadas** (`PRAGMA user_version`, `MIGRACIONES` en `db/index.ts`): v1 reconstruye `reviews` con `service_id` NULL / `ON DELETE SET NULL`; v2 añade `users.password_changed_at`. Tabla nueva `uploads`.
  - **Reseñas:** borrar un servicio ya no las borra y recalcula la valoración; una por cliente y proveedor; exige respuesta del proveedor en el chat; no sobre servicios pausados.
  - **Límite de plan:** se pausa el excedente al caducar/cancelar/bajar de plan; `toggle` respeta el límite.
  - **Pagos manuales:** `db/pagos.ts` + CLI `scripts/pagos.ts` (listar / confirmar / rechazar). Sin endpoint web nuevo.
  - **Sesiones:** tokens revocados al cambiar contraseña (devuelve token nuevo; el frontend lo guarda) y al borrar el usuario; login con comparación bcrypt también para emails inexistentes; límite de 10 fallos / 15 min por cuenta; registro en transacción.
  - **Datos:** sin `lat`/`lng` en las respuestas públicas; `lat`/`lng` se pueden borrar; proveedores sin nombre de negocio salen en /profesionales; zonas inexistentes → 400; parámetros repetidos → sin 500; favoritos con zod.
  - **Imágenes:** solo `/demo/*.webp` o subidas propias (fin de URLs externas y de usar la subida de otro como avatar); cuota de 60 subidas / 24 h.
  - **Insignia:** "Verificado" → "Premium" (no había verificación real detrás).
  - `app.ts` separado de `index.ts`; `DOCKER.md` reescrito; `CLAUDE.md` actualizado.
- Tests: pass — 24 tests nuevos (vitest + supertest, `npm test`); prueba de mutación: 20 mutaciones, cada arreglo la detecta su test. Migración probada sobre copia de la base de prod (v0→v2, conteos idénticos, `foreign_key_check` e `integrity_check` limpios). E2E del nginx real contra la API: subida → GET 200 `image/png`. `tsc` backend y frontend OK, `vite build` OK, imágenes Docker de api y web construyen.
- Security: cambios de lógica de auth/subidas dentro de la app; sin cambios de red, puertos, CORS ni Access. Comprobado que Traefik en vps2 no publica puertos → `CF-Connecting-IP` no es falsificable hoy.
- Next:
  - **Prod (vps2) sigue con el código anterior y `DEMO_MODE=true` públicamente.** Desplegar con el procedimiento de `DOCKER.md` (backup → pull → up --build) y decidir el modo demo — requiere OK de Dariel.
  - Pendiente menor: fechas en dos formatos (`CURRENT_TIMESTAMP` vs ISO), `strict:false` del backend, endpoints sin uso, limpieza de fotos huérfanas, backup automático de `data/`, mostrar la dirección del local en el perfil público.
- Blockers: ninguno para seguir desarrollando.

## 2026-09-25 07:12 UTC — cc-jarvis-ubuntu — Despliegue en vps2 (oficio.dardoit.com), DEMO_MODE=true
- Changes: backup `data/oficios-2026-09-25-0708-pre-deploy.db` (API `.backup()`), vps2 alineado con `origin/master` (su commit local `66b4db6` integrado en GitHub como `56fba14`; queda la rama `respaldo-vps2-66b4db6` allí), `docker compose up -d --build`. Migración 0→2 aplicada al arrancar. `DEMO_MODE=true` a propósito: es entorno de desarrollo con HTTPS.
- Tests: pass — ambos contenedores healthy; `user_version=2`, `foreign_key_check` vacío, `integrity_check` ok, conteos iguales a antes (17 usuarios, 22 servicios, 34 reseñas, 35 conversaciones, 9 mensajes). Por Cloudflare: subida de foto → GET 200 `image/png` (antes 404); home y /buscar 200; asset inexistente 404; sin `lat` en el listado; UI a 390 px OK con la insignia "Premium".
- Security: sin cambios de red/Traefik/túnel. Único error de consola: la CSP bloquea el beacon de CF Web Analytics (pendiente de decidir, ver entrada 06:10).
- Next: queda en `data/uploads/` un PNG de prueba de 72 bytes de la verificación (del proveedor demo, sin usar). Pendientes menores en la entrada de las 07:00.
- Blockers: ninguno.

## 2026-09-25 11:00 UTC — cc-jarvis-ubuntu — Apps móviles, Parte 1 (rama feat/apps-moviles, sin mergear)
- Changes: plan `docs/superpowers/plans/2026-09-25-apps-moviles-parte-1-fundacion-y-push.md` ejecutado con subagentes (implementador + revisor por tarea, revisión final de rama). Tasks 1–6, 8, 9 hechas:
  - `shared/` (@oficio/shared): tipos, formato, validación zod, cliente API sobre fetch.
  - `mobile/` (Expo SDK 57 + expo-router): sesión en SecureStore, entrar/registro, inicio, servicio → solicitud → chat con sondeo, iconos, aviso "sin conexión" con reintentar, estado del push en Cuenta, registro de push con token FCM nativo (refresco, borrado al salir, abrir chat al tocar).
  - `backend/`: `push_devices` (migración v3), POST/DELETE `/api/push/devices`, avisos de solicitud/mensaje sin el texto del mensaje, canal FCM HTTP v1 directo, script `push-prueba`; la API arranca aunque falten las credenciales FCM.
- Tests: pass — shared 15/15, backend 48/48, mobile 27/27, tsc limpio en los tres; `expo export` android OK; flujo verificado en emulador (capturas en el workspace de SDD). Mutaciones en cada arreglo importante.
- Security: el DELETE de dispositivos borra por token para cualquier usuario autenticado (decisión documentada); cambiar la contraseña borra los dispositivos push del usuario; `.gitignore` cubre `secrets/`, `google-services.json`, `*firebase-adminsdk*.json`.
- Next: Task 7 (Dariel/Doniet: proyecto Firebase "oficios-cuba" + google-services.json + clave de cuenta de servicio), Task 10 (push de punta a punta en emulador con Google Play), Task 11 (🚨 OK de Dariel: salida a internet para `oficio_api`; deploy; APK de prueba; protocolo en Cuba). Merge de la rama a master pendiente de decisión.
- Blockers: credenciales de Firebase y OK de Dariel para la salida de red.

## 2026-09-25 21:50 UTC — claude-code (vps2) — Planes nuevos, precios CUP/USD, Google simulado y agenda de citas
- Changes:
  - **Portada:** "El que te lo soluciona vive cerca."
  - **Planes** (`config.ts`): Gratis (1 oficio, sin fotos, WhatsApp/llamada) · Básico $1 USD/mes (5 oficios, 10 fotos de galería) · Profesional $10 USD/mes (negocio + horario, agenda de citas, chat, enlace a DardoVentas, oficios ilimitados, 30 fotos). Premium eliminado (migración 3 → `pro`); tarjeta "Contáctanos" → dardoit.com.
  - **Precios:** `services.price_currency` (CUP por defecto / USD); el frontend muestra la otra moneda con la tasa de `dardoventas.com/tasas.json`, que sirve nginx en `/api/tasas` con caché y respaldo en la API (`TASA_CUP_USD`, 730). Demo con precios cubanos aproximados. El filtro de precio convierte los USD.
  - **Google:** `POST /auth/google`. Simulado con `DEMO_MODE` (selector de cuentas ficticias); flujo real (redirección + verificación del `id_token` con `jose`) escrito y apagado hasta tener `GOOGLE_CLIENT_ID` y salida de la API a Google. Email/contraseña se mantienen.
  - **Perfil Gratis:** nombre, logo, descripción, dirección opcional + punto en el mapa (`show_on_map`; lat/lng públicos solo si lo marca), teléfono y modo de contacto WhatsApp / llamada / ambos.
  - **Chat solo Profesional**; las conversaciones viejas se leen pero no admiten mensajes nuevos. Reseñas: además del chat, valen una cita confirmada/hecha o un contacto por WhatsApp/llamada con sesión (tabla `contacts`).
  - **Agenda** (`routes/appointments.ts`, páginas `/dashboard/agenda` y `/dashboard/citas`, `BookingModal`): horario configurable, huecos de 14 días, confirmar/cancelar/hecha.
  - Migración 3 (users.google_sub; provider_profiles contact_mode/kind/horario/gallery/agenda/show_on_map; services.price_currency; tablas appointments y contacts).
- Tests: pass — backend 42 (18 nuevos: planes, fotos, negocio, chat, reseñas por contacto, agenda, Google simulado y verificación real del id_token con claves locales, filtro de precio, migración v0→v3). Migración probada sobre copia de la base de prod (`integrity_check` ok, FK limpias). `tsc` backend/frontend y `vite build` OK. E2E Playwright en local (demo) a 390 y 1280 px: portada, planes, búsqueda, perfiles (negocio con mapa, gratis solo llamada), pedir cita como cliente, alta con Google simulado como profesional, panel/agenda/DardoVentas: 0 errores de consola, 0 desbordes. nginx `/api/tasas` probado en contenedor contra dardoventas.com.
- Security: nuevo tráfico saliente de `oficio_web` a `dardoventas.com` (URL fija, sin cookies ni IP del visitante). Sin cambios de Traefik, túnel, puertos ni CSP. Google real pendiente de decisión (Client ID + salida de la API).
- Next: desplegar en vps2 (backup → build → up); en prod la base demo conserva sus precios viejos en USD salvo que se re-siembre. Google real: crear OAuth Client y decidir la salida de red de `oficio_api`.
- Blockers: ninguno.

## 2026-09-25 22:50 — claude-code (vps2) — Despliegue de planes/CUP-USD/agenda en oficio.dardoit.com
- Changes: backup `data/oficios-2026-09-25-2240-pre-deploy.db`; base anterior movida a `data/reemplazada-2026-09-25/` y re-sembrada (demo con precios cubanos); build + up de `oficio_api` y `oficio_web` con b1a7e39.
- Tests: pass — base en `user_version` 3, `integrity_check` ok, FK limpias (17 usuarios, 12 perfiles, 22 servicios, 34 reseñas, 3 citas). Por Cloudflare: `/`, `/buscar`, `/planes`, `/api/health`, `/api/config`, `/api/providers/featured` → 200; `/api/tasas` sirve elTOQUE vía dardoventas; `/api/subscriptions/plans` ya da Gratis/Básico/Profesional; login + subida de foto de punta a punta → 200 image/png.
- Security: sin cambios de red, túnel ni `.env`.
- Next: Google real (OAuth Client + salida de red de `oficio_api`), pendiente de decisión.
- Blockers: ninguno.

## 2026-09-26 00:20 UTC — claude-code (vps2) — Agenda profesional (calendario) y despliegue en oficio.dardoit.com
- Changes (beef176):
  - **Motor** (`backend/src/lib/hora.ts`, `lib/agenda.ts`): horas de pared de Cuba con tzdata (el cambio de hora cubano es a las 0:00), tramos por día, excepciones por fecha, bloqueos, duración por servicio, margen antes/después, antelación, horizonte (1–90 días), máximo por día, confirmación manual/auto, plazo de cambio del cliente. Ocupación por solape (pendientes incluidas) revalidada en la transacción del insert. El JSON v1 de la agenda se sigue leyendo.
  - **API** (`routes/appointments.ts`): `slots?service_id`, `calendar`, `manual` (sin cuenta; 409 `code:'choque'` → `forzar`), `blocks`, `/:id/reschedule` (cita nueva enlazada), estado `no_show` solo pasada la hora, contador de ausencias por cliente, `can_change`/`cancel_until` para el cliente. `AppError` acepta `code`.
  - **Migración 4:** appointments reconstruida (ends_at, origin, client_name/phone, no_show, cancelled_by, rescheduled_from, client_id opcional), tabla `agenda_blocks`, `services.duration_min`.
  - **Frontend:** `/dashboard/agenda` (vista Día con línea de "ahora", sombreado fuera de horario, bloqueos rayados, solapes lado a lado; vista Lista; fichas de cita y de alta rápida; recordatorio por WhatsApp), `/dashboard/agenda/ajustes`, reserva por pasos (servicio → día/hora → confirmar) con .ics/Google Calendar, Mis citas con cambiar/cancelar dentro de plazo o WhatsApp fuera de él, duración en el formulario del servicio. Horas siempre de Cuba (`lib/cuba.ts`), con etiqueta "Horas de Cuba" si el dispositivo tiene otro desfase.
  - Deploy: backup `data/oficios-2026-09-26-0009-pre-deploy.db`, `docker compose up -d --build`, migrada a v4 al arrancar.
- Tests: pass — backend 61 (19 nuevos: cambio de hora 8-mar y 1-nov-2026, solapes con márgenes, excepciones, reservas simultáneas, plazo de cancelación, reprogramar, manuales con choque, bloqueos, límite diario y antelación, migración 3→4). Migración probada antes sobre copia de la base de prod. `tsc` y `vite build` OK. E2E Playwright (imagen Docker oficial; el Chromium local no tiene libs del sistema) a 390 y 1280 px en local: panel, fichas, ajustes, reserva completa, Mis citas; acciones de guardar ajustes, cita manual, bloqueo y reprogramación del cliente; 0 errores, 0 desbordes. En prod: v4, `integrity_check` ok, FK limpias, conteos iguales (17/12/22/34/35/5, 3 citas con ends_at), `/`, `/buscar`, `/api/*` 200, `/nada.js` 404, huecos en `America/Havana`, subida de foto → 200 image/png, Playwright 390 px solo lectura sin errores salvo el beacon de CF ya conocido.
- Security: sin cambios de red, Traefik, túnel, CORS ni `.env`. Endpoints nuevos con auth (solo profesional o dueño de la cita); el feed iCal suscribible quedó fuera a propósito (endpoint público con datos de clientes, decisión de Dariel).
- Next: catálogo de productos (foto + precio + descripción; Básico 50 / Profesional 1000) — presentar diseño. Queda en `data/uploads/` un PNG de 1×1 de la verificación. Opcional: feed iCal, colores por servicio.
- Blockers: ninguno.

## 2026-09-26 01:05 UTC — claude-code (vps2) — Catálogo de productos o servicios y despliegue en oficio.dardoit.com
- Changes (334999d):
  - Decisiones de Dariel: foto opcional; fotos del catálogo sin espera, hasta el tope del plan; los productos también aparecen en /buscar (pestaña aparte).
  - **Backend:** `catalog_items` (migración 5 + `uploads.purpose`), `routes/catalog.ts`. Límites `PLANS.maxCatalog`: Gratis 0 · Básico 50 · Profesional 1000; `enforcePlanLimit` recalcula `hidden_by_plan` en cada cambio de plan (bajan los más nuevos, reaparecen al subir). Cuota de fotos del catálogo = tope del plan en 24 h (borrar y resubir no la salta); `borrarSiHuerfana` quita del disco la foto que ya nadie usa. Búsqueda de productos intercalada por profesional (`ROW_NUMBER`), solo disponibles. Ventajas de los planes actualizadas.
  - **Frontend:** `/dashboard/catalogo` (contador con barra, buscador, secciones, disponible/agotado con un toque, alta/edición con foto y "Guardar y añadir otro", aviso de ocultos por el plan); sección `#catalogo` en el perfil (buscador, secciones, de 24 en 24, detalle con "Lo quiero": chat si es Profesional, WhatsApp o llamada, registrando el contacto); pestaña Productos en `/buscar` (`?tab=productos`).
  - Deploy: backup `data/oficios-2026-09-26-0059-pre-deploy.db`, build + up, migrada a v5.
- Tests: pass — backend 67 (6 nuevos del catálogo + v5 en la de migraciones). Migración probada antes sobre copia de prod. `tsc` y `vite build` OK. E2E Playwright local a 390 y 1280 px: panel, alta con foto, agotado con un toque, perfil con catálogo, detalle, búsqueda de productos; 0 errores, 0 desbordes. En prod: v5, `integrity_check` ok, FK limpias, conteos iguales; por Cloudflare subida de catálogo → alta → foto 200 image/png → borrado → foto 404 (se limpió del disco); rutas nuevas 200.
- Security: sin cambios de red, túnel, CORS ni `.env`. Endpoints de escritura solo para el dueño; imágenes solo propias o demo. Disco de vps2 al 83 % (14 GB libres): con 1000 fotos por Profesional (~60 KB c/u) conviene vigilarlo.
- Next: la base de prod no tiene catálogos demo (la semilla solo corre en base nueva). Opcional: importar catálogo desde CSV, ordenar artículos a mano.
- Blockers: ninguno.

## 2026-09-26 01:40 UTC — claude-code (vps2) — Avisos por Telegram: terreno preparado (notificador sin arrancar)
- Changes (13c66e1):
  - Decisiones de Dariel: envío desde un contenedor aparte (la API sigue sin salida); avisos de citas, recordatorios, chat, reseñas y plan, y cada usuario elige cuáles.
  - **API:** `lib/avisos.ts` apunta en `notifications` (si hay Telegram vinculado y el grupo está encendido): cita nueva/confirmada/cancelada/movida a la otra parte, recordatorios 24 h y 2 h al cliente, resumen de mañana al profesional a las 20:00, vencimiento del plan a 3 días (programados cada 5 min con `dedupe_key`), chat sin texto y agrupado cada 10 min, reseña nueva. `routes/telegram.ts`: estado, código de vinculación de un solo uso (hash, 10 min), preferencias, prueba, desvincular. Migración 6 (users.telegram_chat_id/linked_at/notify_prefs; tablas notifications, telegram_link_tokens, telegram_state). `busy_timeout` por compartir la base entre dos procesos.
  - **oficio_notifier** (`src/notifier/`, misma imagen): long polling, `/start <código>` vincula y `/stop` desvincula; envía la bandeja con botón a la web; 429 espera, 403 desvincula, 5 intentos, caduca a las 24 h; el token nunca sale en errores; no carga `config.ts` (no necesita `JWT_SECRET`). En compose con `profiles: ["telegram"]`, secreto `secrets/telegram_bot_token` (creado vacío, `chmod 600`, en `.gitignore`), red net_dmz, healthcheck por latido.
  - **Web:** sección "Avisos por Telegram" en Cuenta (muy pronto / conectar con sondeo hasta vincular / conectado con interruptores, prueba y desconectar). `DOCKER.md`: pasos de activación.
  - Deploy: backup `data/oficios-2026-09-26-0135-pre-deploy.db`, build + up de api/web, migrada a v6. oficio_notifier NO arrancado.
- Tests: pass — backend 76 (9 nuevos de Telegram + v6); prueba de mutación (quitar preferencias o el ocultado del token → sus tests fallan). Notificador real contra un Telegram falso local: getMe, `/start` vincula, contesta y envía un aviso de la bandeja con botón. Migración probada antes sobre copia de prod. E2E Playwright 390 px de la sección en sus tres estados, 0 errores. En prod: v6, `integrity_check` ok, FK limpias, conteos iguales; `/api/telegram/status` → available:false y `link` → 503 (correcto sin bot).
- Security: sin cambios de red en marcha. Pendiente de OK: arrancar oficio_notifier (salida a internet desde un contenedor nuevo, solo hacia Telegram; ningún puerto ni ruta nueva hacia dentro). Token solo en el secreto de Docker.
- Next: Dariel crea el bot (@BotFather), pega el token en `secrets/telegram_bot_token` y da el OK → `docker compose --profile telegram up -d`.
- Blockers: token del bot y OK de red (Dariel).

## 2026-09-26 03:20 UTC — claude-code (vps2) — Panel técnico /admin (2FA) y token de Telegram desde el panel; oficio_notifier arrancado
- Changes (dc89324):
  - Decisiones de Dariel: 2FA en la app (sin Cloudflare Access); token guardado cifrado para que solo lo lea el notificador; arrancar oficio_notifier.
  - **Admin:** `users.is_admin` solo por CLI (`docker exec oficio_api node dist/scripts/admin.js dar|quitar|reset-2fa|listar`); `/api/admin` → 404 a quien no es admin. 2FA TOTP propio (`lib/totp.ts`, vectores RFC 6238 comprobados; sin reutilizar códigos; 5 fallos / 15 min) → sesión de administración de 30 min (`X-Admin-Token`, se invalida al cambiar contraseña o reiniciar el 2FA); acciones sensibles con código nuevo; registro en `admin_audit`. Migración 7.
  - **Token:** el notificador genera su par RSA en `secrets/notifier/` (solo lo monta él, `600`) y publica la pública; la API cifra el token con ella (RSA-OAEP/SHA-256) y el panel solo muestra los 4 últimos. El notificador arranca sin token, lo relee cada 10 s, se reconecta y guarda `token_error` si no vale. Quitado el secreto de Docker `telegram_bot_token`.
  - **Web /admin:** puerta 2FA con QR generado en local (`qrcode`), pestañas Sistema / Telegram / Registro; entrada "Técnico" en el menú solo para admins.
  - Deploy: backup `data/oficios-2026-09-26-0313-pre-deploy.db`, build + up, migrada a v7; `docker compose --profile telegram up -d oficio_notifier` (healthy, esperando token).
- Tests: pass — backend 80 (4 nuevos del panel + v7); mutaciones de reutilización de códigos y de sesión detectadas. Notificador real contra Telegram falso: sin token espera, con token cifrado se conecta en ≤10 s, al borrarlo se desconecta. E2E Playwright 390 px: cliente → 404, activar 2FA con QR, Sistema, pegar token → "Activo como @bot" sin que el token aparezca en la página, Registro; 0 errores. En prod: v7, `integrity_check` ok, FK limpias, conteos iguales; notifier llega a api.telegram.org, la API sigue sin salida, el notifier no escucha puertos (solo el DNS interno de Docker); `/api/admin/me` 404 cliente / 401 sin sesión.
- Security: cambio de red aprobado por Dariel: oficio_notifier en net_dmz con salida (solo usa api.telegram.org), sin puertos ni rutas. Nueva superficie: /admin (rol por CLI + 2FA + registro). Token del bot nunca en claro fuera del notificador.
- Next: Dariel se registra en la web (o dice su email) → `admin.js dar <email>` → activa 2FA en /admin → crea el bot en @BotFather y pega el token. Luego probar vinculando una cuenta.
- Blockers: email de la cuenta de Dariel para darle el rol.

## 2026-09-26 00:55 UTC — cc-jarvis-ubuntu — feat/apps-moviles integrada con origin/master (fa545a6)
- Changes: merge de `origin/master` en `feat/apps-moviles` (sin rebase: la rama no estaba publicada, un solo punto de resolución). 9 conflictos resueltos uniendo ambos lados. **Migración de `push_devices` renumerada de 3 a 8** (prod está en v7). En `conversations.ts` el aviso sale por los dos canales: push (`avisarNuevaSolicitud`/`avisarNuevoMensaje`) y Telegram (`avisarChat`). `.gitignore` conserva `secrets/` para ambos.
- Tests: pass — backend 104 (migración v0→v8), shared 15, mobile 27; `tsc` backend/shared/mobile/frontend OK.
- Security: N/A (sin cambios de red ni despliegue).
- Next: adaptar la app al chat solo Profesional y a las fotos según plan; decidir si el push FCM lo envía `oficio_notifier` (ya tiene salida) en vez de la API; Task 7 (Firebase), 10, 11. Push a `origin` pendiente del OK de Dariel.
- Blockers: ninguno.

## 2026-09-26 01:40 UTC — cc-jarvis-ubuntu — Push de las apps enviado por oficio_notifier (bandeja push_outbox)
- Changes: decisión de Dariel: el push FCM sale de `oficio_notifier` y no de la API, que sigue sin salida a internet. La API apunta en `push_outbox` (una fila por dispositivo, dentro de la migración 8, que aún no está en prod) y `notifier/push.ts` la envía: 5 intentos con espera exponencial, caduca a las 24 h, `token_invalido` borra el dispositivo, y se descarta si el teléfono cambió de cuenta antes del envío. Quitados de la API la carga de FCM, `usarCanal`, `esperarAvisosPendientes` y `borrarToken`. `push-prueba` corre ahora en `oficio_notifier`. Compose: el notificador monta `secrets/fcm/` (ro) con `FCM_SERVICE_ACCOUNT_FILE=/app/fcm/cuenta.json`. `DOCKER.md`, `CLAUDE.md` y `.env.example` al día.
- Tests: pass — backend 108 (push-avisos reescrito: 4 de la bandeja + 6 del envío), mobile 27; `tsc` OK; 7 mutaciones (dueño, caducidad, destinatario, token inválido, tope de intentos, espera, sin canal) detectadas cada una por su test. Prueba de humo del `dist/` real: API arranca y el notificador sin cuenta o con cuenta rota dice "Push FCM desactivado" y sigue.
- Security: sin cambio de red: `oficio_notifier` ya tenía salida (net_dmz). Nuevos destinos cuando haya cuenta de Firebase: `oauth2.googleapis.com` y `fcm.googleapis.com`. La cuenta de servicio solo la monta el notificador.
- Next: la app debe respetar chat solo Profesional y fotos según plan; Task 7 (proyecto Firebase + `google-services.json`); prueba real con un teléfono en Cuba.
- Blockers: ninguno.

## 2026-09-26 01:55 UTC — cc-jarvis-ubuntu — App: chat solo Profesional, precios CUP/USD y contacto por WhatsApp/llamada
- Changes:
  - **shared:** tipos al día con la API (`Plan` sin `premium`; `price_currency`, `contact_mode`, `kind`, `has_chat`, `has_agenda`, `horario`). `formatPrice`/`priceFrom` con moneda y conversión (mismo redondeo que la web, sin `Intl` por Hermes, miles con U+00A0), `TASA_RESPALDO`, `telLink`. Cliente: `proveedores.contacto` y `tasa`. **Bug que corrige:** la app mostraba "800 – 1.500 CUP/hora" como "$800 – $1.500 / hora".
  - **mobile:** `src/lib/contacto.ts` (qué botones: chat solo con `has_chat` y no proveedor; WhatsApp/llamada según `contact_mode`; aviso si no hay contacto) y `src/lib/tasa.ts` (`/api/tasas` con respaldo). Pantalla de servicio: Pedir presupuesto / Escribir por WhatsApp / Llamar, registrando el contacto del cliente. Conversación: un 403 al enviar oculta la caja y deja el aviso del servidor. **Fila de escribir con el margen inferior del área segura** (Enviar quedaba bajo la barra de gestos: fallaban los toques).
  - Fotos según plan: no aplica aún (la app v1 no tiene pantallas de proveedor; Parte 2).
- Tests: pass — shared 17, mobile 33 (6 nuevos de contacto), backend 108; `tsc` OK; `expo export` OK. E2E en emulador (AVD API 34, dev build + Metro, backend demo local :3010): lista con precios CUP/USD; Profesional → 3 botones, Gratis "llamada" → Llamar, Básico "WhatsApp" → WhatsApp (abre wa.me); cliente con chat de un proveedor bajado a Básico → al enviar aparece el aviso y se oculta la caja; chat abierto envía al primer toque tras el arreglo del margen.
- Security: N/A.
- Next: Task 7 (proyecto Firebase de Dariel + `google-services.json`), prueba de push real con un teléfono en Cuba; Parte 2 (proveedor: servicios con fotos según plan).
- Blockers: Firebase (Dariel).

## 2026-09-26 06:15 UTC — cc-jarvis-ubuntu — Task 7: Firebase configurado y push de punta a punta verificado
- Changes: proyecto Firebase `oficios-cuba` en la cuenta **hdarielc** (decisión de Dariel), sin Analytics, app Android `com.dardoit.oficios`. `mobile/google-services.json` (600, gitignorado) y clave de cuenta de servicio en `~/.claude/.oficio-fcm.json` (600, fuera del repo; va a `secrets/fcm/cuenta.json` de vps2 al desplegar). `expo prebuild` + APK de desarrollo recompilado con el plugin de Google. `src/lib/push.ts`: fuera el filtro `Device.isDevice` (heredado de los tokens de Expo): un emulador con servicios de Google también tiene token FCM nativo; sin ellos, la llamada lanza y cae en el `catch` como antes.
- Tests: pass — mobile 33 (el de estado ajustado). Clave validada contra Google sin enviar nada (OAuth 200; `messages:send` con `validate_only` → 400 INVALID_ARGUMENT = API activa). **E2E real en emulador:** backend demo local + `oficio_notifier` local con la clave → el profesional acepta el permiso, se registra su token (142 car.), un cliente le escribe → fila en `push_outbox` → enviada por FCM en ~2 s → notificación "Nueva solicitud de …" en Android → al tocarla abre esa conversación.
- Security: la clave de la cuenta de servicio no está en el repo ni en el chat; solo en j-u (600). Pendiente llevarla a vps2 al desplegar.
- Next: icono monocromo propio para la notificación (sale el genérico); desplegar a vps2 (merge a `master` + migración 8 + `secrets/fcm/cuenta.json`) con OK de Dariel; APK para la prueba en Cuba (Task 10).
- Blockers: OK de Dariel para el despliegue y para mergear a `master` (repo de Doniet).

## 2026-09-26 06:25 UTC — cc-jarvis-ubuntu — Despliegue en vps2: push de las apps (migración 8) + iconos de la app
- Changes: `feat/apps-moviles` integrada en `master` por avance directo (`6e1e3d2`, luego `09fcb80` con los iconos; `origin/master` estaba contenido en la rama). vps2: backup `data/oficios-2026-09-26-0618-pre-deploy.db`, clave de Firebase en `secrets/fcm/cuenta.json` (700/600, uid 1000 = el del contenedor), `git pull --ff-only`, `docker compose --profile telegram up -d --build`. Migrada a v8 al arrancar. Iconos (subagente, revisados): lanzador, adaptativo de Android (foreground/background/monochrome) e icono monocromo de notificación desde `frontend/public/favicon.svg`; `app.config.ts` no referenciaba ningún icono (salía el de Expo).
- Tests: pass — migración 7→8 probada antes sobre copia de la base de prod (v8, FK limpias, integridad ok, conteos iguales; copia borrada después). En prod: los 3 contenedores healthy; `user_version` 8, `foreign_key_check` vacío, `integrity_check` ok, conteos iguales a antes (19 usuarios, 13 perfiles, 22 servicios, 34 reseñas, 35 conversaciones); `oficio_notifier`: "Notificador activo como @…" y "Push FCM activo (proyecto oficios-cuba)". Por Cloudflare: `/`, `/buscar`, `/api/config`, `/api/health` 200; `/nada.js` 404; `POST /api/push/devices` sin sesión 401. **Red:** `oficio_api` sigue sin salida (EAI_AGAIN) y `oficio_notifier` llega a Google. Web sin cambios en este despliegue (no se probó la subida de fotos).
- Security: sin cambios de red, túnel ni Traefik. Nueva: clave de cuenta de servicio de Firebase, montada solo en `oficio_notifier` (ro).
- Next: APK para la prueba en Cuba (Task 10); `colorPrimary` (#023c69 de Expo), splash y `expo.icon` de iOS siguen siendo de plantilla.
- Blockers: ninguno.
