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

## 2026-09-26 07:15 UTC — cc-jarvis-ubuntu — App: diseño igual al de la web (paleta, portada, Buscar, ficha del servicio)
- Changes:
  - **shared:** `api.categorias.estadisticas()` (`/stats/categories`), `api.proveedores.destacados(limit)` (`/providers/featured`), `precioDetalle` (cifra, unidad y conversión por separado), `ETIQUETA_TIPO_PRECIO`, `textoNumServicios`; `CategoryStat.sort_order`.
  - **mobile:** `tema.ts` con las escalas brand/ink/sea/sand/paper de `tailwind.config.js`, radios y las sombras card/lift (`boxShadow`, RN 0.86). Componentes al estilo web: `Boton` (primario/secundario/oscuro/whatsapp/fantasma, con icono), `Campo` (.input/.label/.hint), `ui.tsx` (Tarjeta, Chip, Insignia —Profesional con corona dorada, Negocio en sea—, Valoración, Estrellas, Avatar con iniciales si la foto falla, portada de categoría con degradado + rayas, estados vacío/error, Aviso), `Cabecera` (logo + "Oficios" / "Cuba"). Pestañas Inicio · **Buscar** (nueva) · Mensajes · Cuenta en brand-600. Inicio = portada web en móvil (eyebrow, título, buscador, "Lo más buscado", cuadrícula de categorías, destacados, servicios nuevos). Buscar: texto + filtro por categoría (carrusel de chips / chip quitable), paginación al hacer scroll, esqueletos, vacío, error y "Sin conexión". Servicio como `ServiceDetail` (portada, chip de categoría, precio en caja con "≈ … · tasa informal", WhatsApp/Llamar/Pedir presupuesto, tarjeta del profesional, 3 primeras reseñas). Mensajes, Conversación, Cuenta, Entrar y Registro restilizados (misma lógica). **Arreglo:** en Android el teclado tapaba la fila de escribir del chat (`KeyboardAvoidingView` sin `behavior` + borde a borde): ahora `padding` en ambas plataformas.
- Tests: pass — mobile 33, shared 20 (3 nuevos); `tsc` OK en ambos. Emulador (dev build, sin recompilar): públicas contra **producción en solo lectura** (sin sesión, sin tocar WhatsApp/Llamar); Mensajes/Conversación/Cuenta/chat cerrado (403) contra el backend demo local :3010. Láminas web vs app en `~/.playwright-mcp/oficio-web/app-*.png`.
- Security: N/A (sin cambios de backend ni de red).
- Next: el perfil del profesional, la agenda ("Pedir cita"), la pestaña Productos y el filtro por provincia siguen solo en la web. En prod, buscar "Mecánico" da 0 resultados (la categoría es "Mecánica General"): pasa igual en la web.
- Blockers: ninguno.

## 2026-09-26 07:25 UTC — cc-jarvis-ubuntu — Llave de firma y primer APK de release (0.1.0)
- Changes: **llave de firma definitiva** (PKCS12 `oficios-cuba.p12`, alias `oficios`, RSA 4096, hasta 2126, SHA-256 `111a8cec…5099257`), fuera del repo: j-u `~/.claude/.oficio-firma/` y copia para Doniet en vps2 `secrets/firma-android/` (con LEEME). `mobile/plugins/firma-release.js`: la plantilla de RN firma el release con `signingConfigs.debug` y eso ganaba a `-Pandroid.injected.signing.*` (el primer APK salió con la llave de debug y lo paró la verificación de huella); el plugin pone la firma `release` desde `OFICIO_FIRMA_*` y sobrevive a `prebuild`. `mobile/scripts/apk-release.sh`: prebuild con `REQUIRE_PUSH=1`, sin `EXPO_PUBLIC_API_URL` (siempre producción), solo ARM (`armeabi-v7a,arm64-v8a`: 104 → 60 MB), verifica la huella con apksigner y deja `dist/oficios-cuba-<versión>.apk`. Rediseño de la app como la web: ver entrada anterior.
- Tests: pass — mobile 33, shared 20. APK: firma v2 con la huella esperada, `com.dardoit.oficios` 0.1.0, targetSdk 36. En el emulador x86_64 el APK solo-ARM no arranca (`SoLoader` busca en `lib/x86_64` bajo la traducción ARM: problema del emulador); variante de prueba idéntica + x86_64 contra PRODUCCIÓN en solo lectura: portada, categorías, ficha con precio CUP/USD, buscador con fotos, y **arranque sin red** (abre con los datos guardados), 0 cierres.
- Security: llave y contraseña solo en archivos 600 (j-u y vps2), nunca en el repo ni en el chat.
- Next: primera instalación en un teléfono ARM real (confirma el APK solo-ARM); decidir cómo se reparte el APK (¿descarga desde oficio.dardoit.com? es superficie pública → OK de Dariel); Apklis; R8/minify para bajar de 60 MB (probar antes).
- Blockers: ninguno.

## 2026-09-26 07:50 UTC — cc-jarvis-ubuntu — Botón «Descargar APK» en la web
- Changes: `frontend/src/components/DescargarApp.tsx`: sección «App para Android» en la portada (tarjeta `ink-950` como la franja de estadísticas y el pie, `btn-primary` «Descargar APK», versión · tamaño · Android mínimo, «¿Cómo instalarla?» en 3 pasos, huella SHA-256, icono de la app) y enlace en el pie («Para clientes»). En iPhone: aviso de que es solo Android. Lee `/descargas/android.json`: sin él no pinta nada. `nginx.conf`: `location ^~ /descargas/` (solo `.apk` con tipo de Android + `attachment` + caché 1 año, y `android.json` sin caché; resto 404; el 404 de un APK inexistente sin caché). Compose: `./descargas` montada ro en `oficio_web`. `mobile/scripts/publicar-apk.sh`: verifica firma, sube con temporal + comprobación de SHA-256, escribe `android.json`, borra versiones viejas. `frontend/public/app-icono.png` (320 px).
- Tests: pass — `tsc` + `vite build`. nginx 1.27 real en local con la conf: `nginx -t` ok; APK 200 `application/vnd.android.package-archive` + `attachment` + hash idéntico; `android.json` 200 `no-cache`; otro archivo, el listado y un APK inexistente → 404 (sin caché). Vite + API de producción (solo lectura), Playwright a 390 y 1280 px: sección, pasos, enlace del pie; 0 errores de consola. (Producción ya desbordaba 4 px en escritorio estrecho por el círculo decorativo de «Para profesionales»; no es de este cambio.)
- Security: superficie pública nueva pedida por Dariel: `/descargas/` solo sirve el APK y su JSON (lista blanca por extensión), carpeta en solo lectura para nginx.
- Next: publicar y desplegar; primera instalación en un teléfono real.
- Blockers: ninguno.

## 2026-09-26 07:55 UTC — cc-jarvis-ubuntu — Despliegue del botón de descarga + index.html sin caché
- Changes: APK 0.1.0 publicado con `publicar-apk.sh` en `descargas/` de vps2 (se quitó la carpeta provisional `~/docker/oficio/apk`). Desplegado `36d31c1` (backup previo). Arreglo descubierto al verificar: `location /` hace `try_files … /index.html` y la redirección interna caía en la regex de extensiones → **el HTML salía sin `Cache-Control`** y el navegador seguía cargando el bundle viejo tras un despliegue (le pasó a Playwright con el botón nuevo). Nueva `location = /index.html` con `no-cache` y todas las cabeceras de seguridad.
- Tests: pass — por Cloudflare: APK 200 `application/vnd.android.package-archive` + `attachment` + mismo SHA-256 que el original; `android.json` 200 `no-cache`; listado, otro archivo y APK inexistente → 404. En la web de producción a 390 px: sección «App para Android», botón y enlace del pie visibles con «Versión 0.1.0 · 59 MB · Android 7.0 o superior». nginx 1.27 local: `/`, `/buscar`, `/servicio/x`, `/index.html` → `no-cache` + CSP + X-Frame-Options.
- Security: sin cambios de red; `/descargas/` con lista blanca (solo `.apk` y `android.json`).
- Next: primera instalación en un teléfono real.
- Blockers: ninguno.

## 2026-09-26 08:10 UTC — cc-jarvis-ubuntu — Contador de descargas del APK en el panel técnico
- Changes: `GET /api/app/descargar?archivo=` (`routes/app-movil.ts`): valida `^oficios-cuba-X.Y.Z.apk$`, cuenta y redirige 302 (`no-store`) a `/descargas/<archivo>`. Se cuenta en la API y no en nginx porque Cloudflare cachea el APK (desde la 2.ª descarga no llega al servidor). Una por visitante+versión cada 24 h (reintentos de descargas cortadas); visitante = sha256 con sal (`JWT_SECRET`) de la IP, nunca la IP. Tabla `apk_descargas` (migración **9**). `/admin/system` → `app_downloads {total, last7d, by_version}` (versiones por descarga más reciente). Panel → Sistema → Contenido: tarjeta «Descargas de la app» (mismo `Stat`). El botón y el enlace del pie apuntan al contador. `lib/cliente.ts` (IP del cliente, antes dentro de `app.ts`).
- Tests: pass — backend 113 (5 nuevos: redirige + no-store, deduplicado 24 h / por versión, sin IP en claro, nombres inválidos y sin redirección abierta, datos del panel; migración v0→v9). 5 mutaciones detectadas (la del ancla inicial de la regex sobrevivía: añadidos `../` y `x/`). E2E local: web + API, admin con 2FA en el navegador → tarjeta «3 · 3 en 7 días · v0.1.0»; el botón redirige al APK.
- Security: endpoint público nuevo sin datos personales (hash con sal), rate limit general de `/api/`, redirección solo a una ruta fija del propio sitio.
- Next: desplegar (migración 9).
- Blockers: ninguno.

## 2026-09-26 13:20 UTC — claude-code (vps2) — Planes: foto en el Gratis, 5 fotos por oficio en el Básico, lista de precios y destaque al Básico
- Changes: `config.ts` gana dos topes por plan: `maxServicePhotos` (fotos de **cada oficio**: Gratis **1**, Básico **5**, Profesional 6 — antes eran 6 fijas y el Gratis ninguna) y `maxPriceRows` (Gratis 0, Básico 30, Profesional 100); `maxPhotos` sigue siendo solo la galería del negocio (0/10/30), así que ahora son dos conceptos separados y el logo (`avatar_url`) sigue sin tope. **Lista de precios renglón a renglón** (opcional, tipo carta de menú, sin fotos): columna nueva `services.price_list` (JSON `[{name, price}]`, migración **10**), en la moneda del oficio; entra/sale por `POST`/`PUT /services/:id`, sale en `GET /services/:id` y `/services/mine` (no en los listados). `fotosVisibles`/`preciosVisibles` cortan por el tope del plan: al bajar de plan nada se borra, deja de mostrarse, y el dueño lo sigue viendo todo. `/services/mine` devuelve `max_service_photos` y `max_price_rows` (sustituyen a `photos_allowed`). Frontend: `ServiceForm` usa los topes del plan (contador `n/5`, aviso «Oculta por tu plan» en las de más) y trae el editor de renglones; bloque «Lista de precios» en `ServiceDetail` y en la app (`mobile/app/servicio/[id].tsx`); helpers `priceRow`/`precioRenglon`. `Plans.tsx`: **el destaque («El más elegido», tarjeta oscura, botón ámbar) pasa del Profesional al Básico**, más taglines, dos FAQ nuevas y el párrafo de planes de la portada. Seed demo: carta de precios en el salón (Básico) y en la mecánica (Profesional). CLAUDE.md al día.
- Tests: pass — backend 117 (nuevos: 1 foto en Gratis y 2 → 403; Gratis sin lista de precios; 5 fotos por oficio en Básico y 6 → 403; 30 renglones y 31 → 403; 100 en Profesional; al bajar a Gratis solo se ve la 1.ª foto y la lista desaparece, el dueño lo ve todo; migración v0→v10). `typecheck` backend, `tsc --noEmit` de shared y frontend, `vite build`. Flujo real contra la API de desarrollo con la sesión del salón: topes correctos en `/services/mine`, los 6 renglones del demo, PUT que añade uno → 200, renglón sin concepto → 400, 31 renglones → 403, y los oficios de los planes Gratis mostrando ya su foto.
- Security: sin cambios de red ni de auth. Renglón: concepto 1–80 caracteres y precio 0–10^8, tope por plan aplicado en el servidor.
- Next: desplegar con la skill `oficio-deploy-vps2` (migración 10 → copia de seguridad antes). Sin verificar en navegador: en vps2 chromium no arranca (faltan librerías de sistema, `libatk-1.0.so.0`; instalarlas pide sudo).
- Blockers: ninguno.

## 2026-09-26 13:45 UTC — claude-code (vps2) — Despliegue de los cambios de planes (migración 10)
- Changes: desplegado `a72d449` en `oficio.dardoit.com` (build de `oficio-api` y `oficio-web` + recreado con `--profile telegram`). Migración **10** aplicada en la base real (`services.price_list`). Probada antes sobre una copia del backup: v9→v10, `integrity_check` ok, `foreign_key_check` vacío, conteos idénticos, columna presente y NULL en los 22 oficios existentes (la copia se borró al terminar). Para que la función se vea en el demo desplegado se le puso la carta de precios al oficio «Corte, color y peinado» del salón (el cambio del seed solo afecta a bases nuevas).
- Tests: pass — los tres contenedores `healthy`; notificador `@oficios_asJHKJnjhjk323_bot` + `Push FCM activo`. Por Cloudflare: `/api/config` demo=true, `/api/stats` igual que antes, `/`, `/buscar`, `/planes` 200 y `/nada.js` 404; `index.html` con `cache-control: no-cache` y el bundle nuevo (`Plans-CA7Hiwai.js`, destaque en `basic`). `/api/subscriptions/plans`: Gratis 1/0/0, Básico 5/10/30, Profesional 6/30/100 con las ventajas nuevas. Con sesión del salón: `/services/mine` devuelve los topes, PUT con 5 renglones → 200 y se ven como visitante, 31 renglones → 403; subida de foto de punta a punta 200 `image/png` (la de prueba se borró del disco; Cloudflare aún la sirve de su caché hasta que expire). Los 4 oficios de plan Gratis ya muestran portada. Base tras el deploy: `user_version` 10, integridad ok, conteos intactos.
- Security: sin cambios de red ni de auth. Aislamiento verificado: `oficio_api` sin salida (`EAI_AGAIN`), `oficio_notifier` con salida (Telegram 200).
- Next: `a72d449` y esta entrada siguen **sin pushear** a `github.com/doniet/oficio` (repo compartido con Doniet) — pendiente del OK de Dariel. Sin verificación en navegador en vps2 (a chromium le falta `libatk-1.0.so.0`; instalarlo pide sudo).
- Blockers: ninguno.

## 2026-09-28 15:10 UTC — claude-code (vps2) — Entrega 1 de Encuentrauno: marca y Explorar
- Changes: **rebranding de «Oficios Cuba» a «Encuentrauno» y la página Explorar con tres pestañas**. 14 commits, 54 archivos, +2 550/−182. *Marca*: escala `brand` naranja en `frontend/tailwind.config.js` y `mobile/src/lib/tema.ts`; la escala **salta a propósito en `brand-600` (`#B85400`)** porque el naranja vivo (`brand-500`, `#FF7A00`) da 2,6:1 con blanco y 2,43:1 como indicador sobre fondo claro — todo lo que lleva texto blanco encima o señala foco/estado usa `brand-600` (4,88:1 y 4,53:1), y el naranja vivo queda para relleno decorativo. Logo nuevo (lupa con el «1» dentro) en `components/ui.tsx`, `public/favicon.svg` y `mobile/src/componentes/Cabecera.tsx`; los 6 PNG de la app **y** el `app-icono.png` de la portada web se generan de un solo origen (`mobile/assets/marca/glifo.svg` → `mobile/scripts/generar-iconos.mjs`, `npm run iconos`), con pantalla de arranque y colores en `mobile/app.config.ts`. Barrido de textos en web, app **y backend** (bot de Telegram, avisos, aviso de prueba, emisor TOTP); también «directorio de oficios», que pasa a «Servicios, productos y negocios · Toda Cuba». *Explorar*: `GET /providers` gana el parámetro opcional `kind` validado contra `['oficio','negocio']` (400 si es otro valor) que **además exige el plan**, porque `segunPlan()` ya devuelve `kind: 'oficio'` cuando el plan no incluye negocio y un perfil que bajó de plan seguiría saliendo en la pestaña contradiciéndose. `/buscar` pasa a `/explorar` con redirección permanente que conserva query **y** hash; reapuntados los 14 enlaces internos para no rebotar en cada navegación; «Profesionales» sale del menú (la página sigue existiendo). Tercera pestaña **Negocios** en `pages/Search.tsx`, con filtros y órdenes aislados por pestaña: cada pestaña ofrece solo lo que su endpoint honra de verdad (en Negocios, ubicación es provincia y no hay orden por precio), y chip, contador de filtros activos, botón de limpiar y petición a la API derivan todos de la misma tabla, así que no puede haber un control que mienta. Sin cambios de esquema.
- Tests: pass — backend **122 pruebas en 17 archivos** (5 nuevas en `test/negocios.test.ts`: `kind=negocio` solo devuelve negocios, un perfil que bajó de plan no sale, `kind=oficio` los excluye, valor inventado → 400, sin `kind` el listado no cambia) + `typecheck`; frontend `tsc --noEmit` + `vite build`; mobile `tsc --noEmit` + `expo config` válida; grep de la marca vieja sobre `frontend/src`, `frontend/index.html`, `mobile/src`, `mobile/app` y `backend/src` **vacío**. Contra la API de desarrollo: `kind=negocio` → 2 (ambos pro), `kind=oficio` → 10, `kind=bogus` → 400. Revisión final de rama (Opus) → 0 Critical, 6 Important, 7 Minor; tanda única de arreglos y re-revisión acotada → los 10 hallazgos resueltos, sin rotura nueva. Verificado que el emisor TOTP solo entra en la URI de enrolamiento y no en `verificar()`, así que el 2FA de los admin ya enrolados no se rompe.
- Security: sin cambios de red ni de auth. El `kind` se valida contra una lista blanca antes de llegar al SQL. Dos decisiones de accesibilidad: la escala de marca se desplazó para no romper WCAG AA en los 11 sitios que ya llevaban texto blanco sobre naranja, y 11 indicadores de foco o de selección pasaron de `brand-500` a `brand-600` para cumplir el 3:1 de WCAG 1.4.11 — entre ellos **el anillo de foco de teclado global**.
- Next: (1) **comprobación visual** del logo, la paleta y las tres pestañas, que no se puede hacer desde aquí; (2) **republicar el APK** con `mobile/scripts/publicar-apk.sh` para que los iconos nuevos lleguen a los teléfonos; (3) **push a `github.com/doniet/oficio`**, repo compartido con Doniet: es un cambio de marca, conviene avisarle antes; (4) entrega 2 (cuenta, aprobación y baneo), que hereda dos cosas aparcadas: el filtro `category` de `/providers` se resuelve por los servicios activos del perfil, así que un negocio de catálogo puro se volvería invisible al elegir categoría, y `municipality_id` en `/providers` es un `AND` de una línea si se quiere que Negocios filtre por municipio. Diferido también: `pages/dashboard/Dashboard.tsx:149` usa `bg-brand-500` de relleno en una barra de progreso sobre fondo claro — discutiblemente un «objeto gráfico» de WCAG 1.4.11; no es regresión de esta entrega, que no toca ese archivo.
- Blockers: sin verificación visual en navegador — en vps2 chromium no arranca (falta `libatk-1.0.so.0`, instalarlo pide sudo). Todo lo demás está verificado por compilación, pruebas y lectura del HTML/CSS generado.

## 2026-09-28 15:30 UTC — claude-code (vps2) — Despliegue de la Entrega 1 de Encuentrauno
- Changes: desplegado `611f821` en `oficio.dardoit.com` (build de `oficio-web` y `oficio-api` + recreados los tres con `--profile telegram`, para que el notificador no se quedara con la imagen vieja). **Sin migración**: esta entrega no toca el esquema, así que `user_version` sigue en 10 y no hubo prueba previa sobre copia. Backup consistente antes de tocar nada con `.backup()` (respeta el WAL) en `data/oficios-2026-09-28-1522-pre-encuentrauno.db`, verificado aparte: integridad ok, `user_version` 10, 19 usuarios, 34 reseñas. El despliegue se hizo **desde vps2**, no desde j-u: el código venía de la rama fusionada en este mismo checkout, así que `master` local va **17 commits por delante de `origin/master`** y sigue sin pushear.
- Tests: pass — los tres contenedores `healthy`; `oficio_notifier` con `Notificador activo como @oficios_asJHKJnjhjk323_bot` y `Push FCM activo`. Base tras el deploy idéntica a antes: `user_version` 10, `integrity_check` ok, `foreign_key_check` vacío, 19/13/22/0/34. Por Cloudflare: `/api/config` demo=true intacto, `/api/stats` igual que antes, `/`, `/explorar`, `/buscar`, `/planes` y `/profesionales` 200 y `/nada.js` 404 (el fallback del SPA no se traga los assets). Filtro nuevo en producción: `kind=negocio` → 2, `kind=oficio` → 11 (= los 13 perfiles), `kind=bogus` → 400. Bundle nuevo (`index-C70sDE-D.js`) con «Encuentrauno» y **cero** ocurrencias de la marca vieja; `<title>` nuevo; CSS servido con `#b85400` y **sin** el `#c25a00` viejo. `favicon.svg` y `app-icono.png` con **md5 idéntico** entre lo servido, el disco y la imagen del contenedor, y `last-modified` del build — el edge no está sirviendo el icono viejo de su caché. Chunk de Explorar (`Search-Ccdh7IHn.js`, 200, 18 KB) con las tres pestañas, y `ProvinceMapSelector` con el texto de «provincia entera» que explica por qué Negocios no filtra por municipio. Subida de foto de punta a punta: `POST /api/uploads` 201 → `GET` 200 `image/png` con bytes idénticos al original (la de prueba se borró del disco; Cloudflare puede seguir sirviéndola de su caché hasta que expire).
- Security: sin cambios de red, de auth, del túnel ni del `.env`. Aislamiento verificado tras el deploy: `oficio_api` **sin** salida a internet (`EAI_AGAIN`) y `oficio_notifier` **con** salida (Telegram 200).
- Next: (1) **republicar el APK** — no se hizo aquí porque la llave de firma vive en j-u (`~/.claude/.oficio-firma/`), así que toca `cd oficios-cuba/mobile && ./scripts/apk-release.sh && ./scripts/publicar-apk.sh` desde allí; hasta entonces los teléfonos siguen con los iconos viejos. (2) **push a `github.com/doniet/oficio`**: 17 commits locales sin subir, pendiente de avisar a Doniet por ser cambio de marca. (3) Comprobación visual, ver Blockers.
- Blockers: **sigue sin haber verificación visual en navegador**. A los dos chromium de Playwright les faltan 9 y 12 bibliotecas del sistema (no solo `libatk-1.0.so.0`: también `libatk-bridge`, `libcups`, `libasound`, `libgbm`, `libcairo`, `libX*`…), y el MCP además busca el canal `chrome` en `/opt/google/chrome`, que no existe. Se arregla con un comando que pide sudo: `sudo npx --yes playwright@latest install-deps chromium`. Mientras, la comprobación se hizo por volcado del HTML, el CSS y los chunks JS que sirve Cloudflare, más md5 de los assets de marca.

## 2026-09-28 15:45 UTC — cc-jarvis-ubuntu — APK 0.1.1: fuera los permisos que disparaban el antivirus de Huawei
- Changes: el antivirus del Administrador del teléfono de Huawei (motor **Avast**, no Google Play Protect) marcó el APK 0.1.0 como «Virus detectado». Revisión del APK de producción (hash = `android.json`): firma nuestra, dex/`.so`/bundle solo con librerías estándar de Expo/RN, sin `eval` ni WebView, OTA apagado, un único servidor (`oficio.dardoit.com`). Causa probable = heurística por permisos: `app.config.ts` pedía 1 y el APK declaraba 31, entre ellos **`SYSTEM_ALERT_WINDOW`** y arrancar al encender (patrón de troyano bancario) que Expo y sus módulos añaden por defecto. `mobile/app.config.ts`: `android.blockedPermissions` (SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE, USE_BIOMETRIC, USE_FINGERPRINT, RECEIVE_BOOT_COMPLETED, install referrer), `version` 0.1.1 y **`versionCode: 2`** (sin subirlo Android no instala encima de la 0.1.0). Rama `fix/permisos-apk` sobre `master` de vps2 (Encuentrauno).
- Tests: `tsc` OK; jest 32/33 — falla `contacto.test.ts` por el rebrand de vps2 (el texto de WhatsApp dice «Encuentrauno», el test sigue con «Oficios Cuba»), ajeno a este cambio. APK release `dist/oficios-cuba-0.1.1.apk`: `aapt2` confirma los 7 permisos fuera, versionCode 2, firma `111a8cec…9257`. Push E2E en emulador (build debug con el mismo manifiesto, backend + notificador locales con la clave FCM): token 142, `push_outbox` → sent, notificación «Nueva solicitud de Cli», el toque abre el chat. Ojo: en debug `SYSTEM_ALERT_WINDOW` reaparece porque lo añade `src/debug/AndroidManifest.xml` de RN (menú de desarrollo); el release sale limpio.
- Security: N/A (se quitan permisos; sin cambios de red ni de backend).
- Next: publicar la 0.1.1 (`scripts/publicar-apk.sh`, OK de Dariel); reportar el falso positivo a Avast; averiguar si el Huawei tiene servicios de Google (sin GMS no hay FCM); arreglar el test de contacto del rebrand.
- Blockers: ninguno.
## 2026-09-28 18:52 UTC — claude-code (vps2) — Explorar en mapa
- Changes: **el mapa de Explorar**, con un perfil por celda priorizando el plan de pago.
  47 archivos, +6 673/−240, 23 nuevos. *Backend*: endpoint `GET /api/mapa` — deduce el
  tamaño de celda del rectángulo VISIBLE (`min(alto,ancho)/5`, sin parámetro `zoom`),
  infla un 50 % por su cuenta para que un arrastre corto no deje huecos, y devuelve el
  mejor perfil de cada celda por `PLAN_WEIGHT_SQL` con `detras` = cuántos más hay ahí.
  Migración **11**: `map_precision` (`exacta`|`zona`, con `CHECK`) e índice `idx_pp_geo`.
  `show_on_map` **sigue en `DEFAULT 0`**: nadie aparece sin activarlo. Cuatro constantes
  de SQL centralizadas en `db/index.ts` (`CON_NEGOCIO_SQL`, `CON_CATALOGO_SQL`,
  `CATEGORIAS_SQL`, `LAT_SERVIDA`/`LNG_SERVIDA`) para que ninguna ruta pueda contradecir
  a otra. *Web*: switch lista↔mapa en `/explorar?vista=mapa` (la lista sigue siendo la
  vista por defecto), Leaflet con teselas de OSM en chunk diferido, hoja inferior con dos
  anclajes, Esc y Atrás. *App*: MapLibre con las mismas teselas, pestaña `buscar` →
  `explorar`, hoja con `@gorhom/bottom-sheet` y botón físico Atrás. *Opt-in*: el panel
  avisa cuando no apareces y pregunta la precisión al activarlo, sin escribirla nunca en
  silencio. Sembrado de 300 perfiles sintéticos solo en desarrollo (`npm run seed:mapa`).
- Tests: pass — backend **155/155**; frontend **17/17** (la suite del frontend **no existía**: se montó
  vitest+jsdom en esta entrega); app **44/44** con `npx jest`; typechecks de los cuatro paquetes.
  Diez archivos de prueba nuevos, cinco de ellos pedidos en rondas de arreglo y no en el
  plan; dos de esos cinco encontraron bugs reales que ninguna revisión había visto.
- Security: **el fallo más grave de la entrega lo encontró una revisión, no una prueba.**
  El endpoint filtraba por la coordenada exacta, así que con rectángulos minúsculos se
  podía extraer por bisección la ubicación exacta de un perfil `zona` — anulando la única
  promesa de esa opción. Cerrado pasando la presencia a la coordenada servida, definida
  una sola vez en SQL. Verificado ejecutando el ataque: tres víctimas en la misma celda
  convergen al mismo intervalo de 4e-9 en torno al valor redondeado, o sea indistinguibles;
  resolución exactamente la celda de ~1 km. Y un segundo agujero: `GET /providers/:id`
  publicaba `lat`/`lng` en crudo — cerrado también, con un barrido de los 49 archivos del
  backend y 28 peticiones reales con control positivo. Las dos puertas redondean a la
  MISMA celda, así que no se pueden intersectar para bajar de 1 km. Sin cambios de red ni
  de auth.
- Next: (1) **desplegar con `oficio-deploy-vps2`: HAY MIGRACIÓN 11**, así que toca probarla
  antes sobre una copia del backup, como manda esa skill. (2) **Verificación visual**, que
  este servidor no puede hacer — ver Blockers. (3) **Republicar el APK** desde j-u; la app
  cambia y trae una dependencia nativa nueva. (4) Dos decisiones de producto pendientes de
  Dariel: si al elegir «solo mi zona» el campo de **dirección** debe avisar u ocultarse
  (hoy un profesional puede publicar su calle creyendo que eligió no hacerlo), y una frase
  ambigua en la pregunta del registro. (5) Diferido con motivo escrito en el ledger: hacer
  `TOPE` inyectable para poder probar el desborde, y la deriva ya existente entre el
  `ProviderPublic` de `frontend/src/types` y el de `shared/src/tipos`.
- Blockers: **sin verificación visual**. En vps2 no arranca ningún navegador: a los dos
  chromium de Playwright les faltan entre 9 y 12 bibliotecas del sistema y su instalación
  pide sudo (`sudo npx --yes playwright@latest install-deps chromium`), y no hay emulador
  Android. Lo que queda pendiendo de que alguien lo MIRE es estrecho y está enumerado por
  los revisores: la animación y el tacto del arrastre de la hoja, que el botón «Buscar en
  esta zona» no quede tapado durante un arrastre que expande, y si las teselas de OSM
  cargan desde Cuba. Todo lo demás se verificó leyendo el código o con pruebas — incluidos
  dos defectos (el mapa que no cargaba al montarse y el spinner pegado) que parecían
  necesitar pantalla y no la necesitaban. Para la app existe la skill
  `oficio-app-e2e-emulador`, que documenta cómo probarla de verdad en el emulador de j-u.

## 2026-09-28 19:58 UTC — claude-code (vps2) — Despliegue del mapa de Explorar (desde la RAMA, sin fusionar)
- Changes: desplegado `da53c75` de la rama **`encuentrauno-2-explorar-mapa`** en `oficio.dardoit.com` — **no `master`**, a propósito: Dariel pidió ver los cambios antes de decidir la integración, así que producción corre la rama y volver atrás es reconstruir desde `master`. Build de `oficio-api` y `oficio-web`, los tres contenedores recreados con `--profile telegram`. **Migración 11 aplicada** (`map_precision` con su `CHECK`, e índice `idx_pp_geo`).
- Tests: pass — **la migración se probó antes sobre una copia del backup real**, no solo en pruebas: `user_version` 10→11, `map_precision` con `default='exacta'`, `idx_pp_geo` creado, `integrity_check` ok, `foreign_key_check` vacío, conteos idénticos (19/13/22/0/34), las 13 filas en `'exacta'` y las 12 coordenadas intactas; la copia se borró al terminar (llevaba datos reales, permisos 600). Base real tras el deploy: exactamente lo mismo. Los tres contenedores `healthy`, notificador con `Push FCM activo` y bot conectado. Por Cloudflare: `/api/mapa` devuelve 8 puntos con celda de 1° para Cuba entera y 3 con celda de 0,03° para una ciudad (la densificación funciona), 2 en `tab=negocios`, 0 en `productos` (correcto: `catalog_items = 0` en producción); 400 para bbox fuera de Cuba, bbox invertido y `tab` inventada. **El defecto Critical está cerrado en producción: `resumen` llega como cadena en todos los puntos** («Rejas y portones a medida · a convenir»), con `tipo`, `plan` y `detras` correctos. La regresión que cerró la última ronda también: `q=Clima` da 1 punto en Servicios, donde antes daba 0. Rutas `/`, `/explorar`, `/explorar?vista=mapa`, `/buscar`, `/planes` en 200 y `/nada.js` en 404. La CSP permite `https://*.tile.openstreetmap.org`, así que las teselas cargarán. Chunks `MapaExplorar` y Leaflet servidos.
- Security: sin cambios de red, de auth, del túnel ni del `.env`. Aislamiento verificado tras el deploy: `oficio_api` **sin** salida a internet (`EAI_AGAIN`), `oficio_notifier` **con** salida. `show_on_map` sigue en `DEFAULT 0`: la migración no puso a nadie en el mapa que no estuviera ya (los 12 que tenían `show_on_map = 1` lo tenían de antes).
- Next: (1) **decidir la integración de la rama** — producción corre código sin fusionar, que es un estado que no conviene dejar mucho tiempo. (2) **Verificación visual**: es lo único que falta y ahora se puede hacer contra producción, abriendo `https://oficio.dardoit.com/explorar?vista=mapa` en un teléfono o un navegador. (3) **Republicar el APK** desde j-u. (4) Dos decisiones de producto pendientes: el aviso de `pp.address` para quien nunca toca el mapa, y el booleano `ubicacion_aproximada` que hoy hace que todos los pines ajenos se dibujen aproximados.
- Blockers: ninguno para el despliegue. La verificación visual sigue sin poder hacerse **desde vps2** (no hay navegador ni emulador), pero ya no bloquea: el mapa está en producción y se puede mirar desde cualquier dispositivo.

## 2026-09-28 20:20 UTC — claude-code (vps2) — Fusión del mapa a master y preparación de la APK 0.2.0
- Changes: `encuentrauno-2-explorar-mapa` (33 commits) fusionada a `master` y subida a `origin`
  (`2b04816`). La rama local se borró; nunca estuvo en `origin`. Único conflicto: `STATUS.md`,
  resuelto conservando las dos entradas en orden (la de j-u de las 15:45 y la del mapa de las 18:52);
  `mobile/app.config.ts` se auto-fusionó bien y conserva a la vez el `name: 'Encuentrauno'` del
  rebrand y el `versionCode`/`blockedPermissions` de la 0.1.1. Antes de fusionar: el icono de marca
  pasó a «Pin buscador» (`cb5a277`) — al cambiar el dibujo, el teñido de las capas monocromas
  buscaba un color que ya no existe y habría generado un icono de notificación a color sin fallar.
  `app.config.ts` queda en **0.2.0 / versionCode 3** (la 0.1.1 ya está publicada desde las 16:37).
- Tests: pass — backend 163/163, web 19/19, app 44/44, typecheck de los cuatro paquetes y build de
  la web, todo re-ejecutado **sobre el árbol ya fusionado**. Se arregló un test rojo **preexistente
  en `master`**, ajeno al mapa (`8f09793`): el de solape de agenda tomaba el hueco por índice sobre
  la lista plana, que empieza en «ahora», así que por la tarde caía a las 21:30 y el `+120 min`
  (23:30) ya no es hueco porque una cita ahí cruzaría la medianoche. El producto acertaba; fallaba
  la suposición del test. Ahora toma el hueco del día siguiente, que siempre está entero.
- Security: N/A. No se tocó red, auth ni exposición. **No se movió la llave de firma a ningún sitio.**
- Next: compilar la APK 0.2.0 **en j-u** (`git pull` → `npm install` → `scripts/apk-release.sh` →
  `scripts/publicar-apk.sh`). Desplegar la web para que el icono nuevo llegue a producción.
- Blockers: la APK no se pudo compilar desde vps2. Dos razones independientes: (1) el SSH a j-u lo
  deniega la **política del tailnet** (`tailnet policy does not permit you to SSH to this node`) —
  es un control de seguridad y no se rodea; (2) vps2 no tiene JDK, ni SDK de Android, ni
  `google-services.json`, y quedan **9,9 GB libres de 77 (88 % usado)** en el host de producción:
  el SDK + NDK + cachés de Gradle no caben. La llave de firma sí está aquí
  (`secrets/firma-android/`), así que ese no es el impedimento.

## 2026-09-28 20:48 UTC — claude-code (vps2) — El logotipo de la web pasa al pin, y despliegue
- Changes: `<Logo/>` deja la lupa de línea y usa el mismo pin que `mobile/assets/marca/glifo.svg`,
  con idénticas coordenadas y colores para que un desvío entre logotipo e icono de la app salte a la
  vista. El degradado lleva id por instancia (el logotipo sale dos veces: cabecera y pie) y se le
  quitan los dos puntos de `useId()`, que dentro de un `url(#…)` no todos los navegadores resuelven.
  Era el único sitio que quedaba con el glifo viejo. Además, `?v=2` en el favicon y en `app-icono.png`.
- Tests: pass — web 19/19, `tsc` y build limpios. El glifo se verificó **rasterizado** a 36 px reales
  y ampliado, sobre fondo claro y sobre el `ink-950` del pie; no hay navegador en vps2 y no se instaló
  uno en el host de producción.
- Security: N/A. Solo se reconstruyó `oficio_web`; `oficio_api` y `oficio_notifier` no se tocaron
  (el único cambio del backend fue un archivo de test, que no se despliega). Sin cambios de esquema.
- Next: verificado contra producción — el bundle sirve el pin y ya no contiene el glifo viejo, y
  `app-icono.png` coincide byte a byte con el local. **Hallazgo:** los archivos de `public/` van con
  nombre fijo, así que Cloudflare siguió sirviendo los anteriores tras el despliegue (`cf-cache-status:
  HIT`, `age 2775`, `max-age 14400`): el contenedor tenía el icono de 12 231 bytes y el borde devolvía
  el de 7 872. El bundle no sufre esto porque lleva hash en el nombre. De ahí el `?v=`, que hay que
  subir cada vez que cambie el dibujo.
- Blockers: la APK 0.2.0 sigue sin compilar (ver la entrada anterior): SSH a j-u denegado por la ACL
  del tailnet, y vps2 no tiene toolchain ni espacio.

## 2026-09-28 22:10 UTC — claude-code (vps2) — Municipios reales y base poblada para ver el mapa
- Changes: **las coordenadas de los 168 municipios eran inventadas.** `seed.ts` las repartía en
  espiral de ángulo áureo alrededor de la capital provincial (radio hasta 21 km); verificado
  recalculando la fórmula contra producción, **13 de 13** municipios de La Habana coinciden al
  noveno decimal. Por eso Habana Vieja, Playa, 10 de Octubre y Cotorro salían en el estrecho de
  Florida y Trinidad a 80 km de Trinidad. Un negocio en la capital de su provincia caía bien por
  casualidad: es el índice 0 de la espiral, el único punto real. Ahora salen de Wikidata (Q558330)
  y viven en `municipios-coords.ts`, porque `oficio_api` no tiene salida a internet. Nueve no
  casaron por nombre y se resolvieron uno a uno («Lajas» = Santa Isabel de las Lajas, «Mella» =
  Julio Antonio Mella, dos San Luis, la Isla de la Juventud que no es municipio en Wikidata).
  **Migración 12**; no toca `provider_profiles`. `seed-mapa` cuelga ahora cada perfil del centro de
  SU municipio con ±900 m en vez de ±33 km desde la capital, y pone `municipality_id`, dirección y
  nombres creíbles. Su guardia pasa de `NODE_ENV` a `DEMO_MODE`, que protege más. Los dos negocios
  que Dariel vio mar adentro (Clima Frío Express, Brillo Total) reciben punto propio geocodificado.
  Diseño completo en `docs/superpowers/specs/2026-09-28-ubicacion-aproximada-design.md`.
- Tests: pass — backend **165/165**, web 19/19, app 44/44, typechecks. Nuevos: que ningún municipio
  conserve el punto de la espiral, que todos caigan dentro de Cuba, y que ningún perfil sembrado se
  aleje más de 900 m del centro de su municipio — que es lo que impide volver al mar.
- Security: N/A. Sin cambios de red, auth ni exposición. `show_on_map` sigue en `DEFAULT 0`.
  Respaldo con `.backup()` antes de migrar (`data/respaldo-antes-migracion12-*.db`) y migración
  probada antes contra una copia de la base real, borrada tras usarla.
- Next: verificado contra producción — 312 perfiles visibles (252 exactos, 60 de zona), 16
  provincias, **cero** al norte de la costa habanera, y los seis puntos más expuestos
  reverse-geocodifican a direcciones reales (Alamar, Antonio Guiteras, Santa Cruz del Norte),
  incluido uno con la coordenada ya redondeada. `/api/mapa` sobre La Habana devuelve 29 puntos con
  126 perfiles detrás de los `+N`: por fin hay densidad para ver el agrupamiento.
- Blockers: los `+N` siguen siendo decorativos (esos 126 son inalcanzables) — lo arregla la entrega
  de ubicación aproximada, cuya spec está aprobada y pendiente de plan. APK 0.2.0 pendiente de que
  Dariel apruebe los pasos en la sesión de j-u.

## 2026-09-28 22:35 UTC — claude-code (vps2) — Cabecera del perfil legible y «Precio acordado»
- Changes: la cabecera del perfil subía ENTERA sobre la portada (`-mt-12`/`-mt-14`), así que en
  escritorio la miga de pan y el nombre del negocio caían sobre la foto, con el `h1` partido por el
  borde de la imagen. Eran dos decisiones peleadas: el degradado oscurecía el fondo para texto
  CLARO, pero el que aterrizaba ahí es oscuro (`ink-900`). Ahora solo el avatar pisa la portada y el
  texto empieza bajo ella; en móvil nunca hubo problema porque la cabecera es columna. Segundo
  hallazgo del mismo vistazo: `CoverImage` no era absoluta, ocupaba el alto completo en flujo y
  empujaba el botón «Profesionales» fuera de la caja, donde `overflow-hidden` lo recortaba —
  llevaba ahí invisible, y en móvil es la única forma de volver atrás. El degradado baja de 60 % a
  30 %: ya no protege texto. Y «A convenir» pasa a «Precio acordado» en los cuatro paquetes.
- Tests: pass — backend 165/165, web 19/19, app 44/44, typechecks y build. **Verificado mirando**:
  capturas a 1280 y 390 px antes/después contra la página real, y de nuevo contra producción.
- Security: N/A en el resultado, pero un apunte: al levantar la web local para las capturas usé
  `--host 0.0.0.0` por descuido y el servidor de desarrollo quedó escuchando en la interfaz pública
  menos de un minuto. Cerrado y rehecho atado a `127.0.0.1`, con el contenedor de Playwright en la
  red del host. Queda anotado porque exponer un puerto exige consultar antes, no después.
- Next: Playwright funciona en vps2 sin instalar nada ni pedir sudo — el chromium del `~/.cache` no
  tiene sus librerías de sistema, pero la imagen `mcr.microsoft.com/playwright:v1.63.0-noble` ya
  está en el host y con `--network host` alcanza un servidor local. Es la vía para verificar UI aquí.
- Blockers: ninguno nuevo. Sigue pendiente decidir el alcance del aviso de `pp.address`.

## 2026-09-28 22:55 UTC — claude-code (vps2) — El plan de pago deja de ser etiqueta pública
- Changes: el tag «Profesional» de la corona se pintaba en **diez** sitios públicos entre web y app
  —incluidos la hoja del mapa y las tarjetas de servicio en AMBAS plataformas—, cuando «Profesional»
  es solo uno de los tres planes de pago. Se leía como distintivo de calidad cuando únicamente
  significa que ese negocio paga más, y el plan de alguien no es asunto de quien lo busca. Fuera las
  diez, y fuera también los componentes (`PlanBadge` en la web; `InsigniaPlan` y la variante `plan`
  de `Insignia` en la app) para que nadie los reintroduzca sin pensarlo. Se conserva `PlanPill`,
  que solo sale en el panel del propio dueño. **No se toca el color del pin por plan en el mapa**:
  eso es el ranking de pago que el producto sí quiere, no una etiqueta. Además, la miga de pan y el
  botón de atrás del perfil decían «Profesionales», que no existe en el modelo —el sistema muestra
  Servicios, Productos y Negocios—: ahora dicen «Explorar», que es de donde llega la gente.
- Tests: pass — web 19/19, app 44/44, typechecks y build. Verificado mirando producción: el tag no
  está ni en la ficha ni en las tarjetas del listado, y la miga dice «Inicio / Explorar / …».
- Security: N/A.
- Next: queda `/profesionales` (`pages/Providers.tsx`) como página viva pero fuera del menú
  principal, alcanzable desde la portada y varios estados vacíos. Contradice el modelo de tres
  pestañas; **decisión de Dariel** si se retira o se renombra.
- Blockers: pendiente de decidir qué es una «dirección aproximada» (¿solo municipio? ¿calle sin
  número? ¿texto propio?), que es lo que define el modelo de datos de esa opción.

## 2026-09-29 01:35 UTC — claude-code (vps2) — Ubicación aproximada de 100-300 m, /mapa/celda y tema claro
- Changes: sesión sin interfaz en tmux, con Dariel desconectado. **Enmienda de la spec**
  (`2026-09-28-ubicacion-aproximada-design.md`, §3bis): el área aproximada baja de la celda de
  ~1 km a un **anillo de 100-300 m**, y el punto publicado se sortea **UNA vez al guardar** y se
  guarda en `map_lat_pub`/`map_lng_pub` (migración 13). Sortearlo al servir permitiría promediar
  peticiones hasta recuperar el real; se usa `node:crypto` y no `Math.random` porque el generador
  de V8 se reconstruye observando salidas y los puntos publicados SON salidas observables.
  `LAT_SERVIDA` deja de ser un `CASE` y pasa a ser la columna: desaparece el filtro de dos capas
  y con él una clase entera de error. **Sin respaldo a `pp.lat`**: un perfil sin publicada
  desaparece del mapa, que es el fallo seguro. Nuevo `GET /api/mapa/celda`: los N de un grupo
  dejan de ser inalcanzables. `PuntoMapa` gana `aproximado`, `cy` y `cx`. El aviso de `pp.address`
  pasa a mostrarse siempre que el campo tenga texto, detrás de `AVISAR_SIEMPRE_DIRECCION`.
  **Tema claro estilo Apple** en web y app: `paper` a blanco, `sand` a grises neutros, tarjetas de
  listado sin marco, portadas sin foto como panel liso (#F5F5F7) en vez de degradados de colores,
  chip activo en naranja de marca. Se quitó la página `/profesionales` (redirige a `/explorar`).
- Tests: pass — backend **178/178** (eran 165), web 19/19, app 44/44, typechecks y build.
  Los seis tests que afirmaban el redondeo viejo se reescribieron para lo que ahora importa: que
  el punto publicado NO cambie entre peticiones (si cambiara, se podría promediar), que guardar
  otros campos no lo mueva, que moverse sí lo re-sortee, y que un perfil sin publicada desaparezca
  en vez de caer en la exacta. Nuevo `mapa-celda.test.ts` (5) afirma que la lista trae exactamente
  `detras+1` y repite el ataque de bisección contra la puerta nueva.
- Security: **migración probada antes contra una copia de la base real** (312 perfiles con punto →
  312 con publicada, 0 huérfanos, los 60 «zona» desplazados 113-297 m, `foreign_key_check` vacío);
  copia borrada tras usarla y respaldo previo en `data/respaldo-antes-migracion13-*.db`. Verificado
  **contra producción por Cloudflare**: cerrando el rectángulo sobre el punto publicado hasta
  ±0,0002° el perfil sigue apareciendo (la presencia la decide lo publicado), y un rectángulo de
  55 m sobre su coordenada REAL no lo encuentra, estando el publicado a 270 m. Sin cambios de red,
  puertos, auth, túnel ni `.env`.
  **Apunte propio:** al levantar servidores locales para verificar, el backend quedó escuchando en
  `*:3010` unos minutos porque `src/index.ts` hace `app.listen(PORT)` sin dirección. Se cerró y se
  rehízo con un arranque atado a `127.0.0.1`. Conviene decidir si el arranque normal debería
  aceptar `HOST`; en producción no importa (el contenedor no publica el puerto), pero en este host
  sí, y es el de producción.
- Next: el APK 0.2.1 (ver entrada siguiente). La app quedó con una **divergencia deliberada**
  anotada en el código: su área aproximada es un disco de tamaño fijo en píxeles y no los 300 m
  reales que sí dibuja la web, porque hacerlo a escala en MapLibre pide `GeoJSONSource` + `Layer`
  con un polígono y este host no tiene emulador para comprobarlo antes de meterlo en un APK.
  Pendiente de igualar tras probarlo en emulador (`oficio-app-e2e-emulador`).
- Blockers: ninguno.

## 2026-09-29 01:40 UTC — claude-code (vps2) — APK 0.2.1 compilada en j-u y publicada
- Changes: `app.config.ts` a **0.2.1 / versionCode 4** (la 0.2.0 ya estaba publicada, y la app
  cambió: tema claro y el mapa dibujando áreas). Compilada en j-u desde un **clon propio**,
  `~/Documentos/dev/oficio-build-vps2`, clonado de GitHub al commit exacto `b11de1c` para no tocar
  `~/Documentos/dev/oficio` ni `oficio-apps`, que usan otras sesiones y tienen trabajo sin subir.
  `google-services.json` copiado desde el repo de trabajo; la llave de firma no salió de j-u.
- Tests: app 44/44 y `tsc` limpio en el propio clon antes de compilar.
- Security: firma **111a8cec…9257** verificada por `apk-release.sh`. Comprobado además con `aapt2`:
  `com.dardoit.oficios`, versionCode 4, versionName 0.2.1, etiqueta Encuentrauno, solo ARM, y los
  cuatro permisos que disparaban el antivirus de Huawei (SYSTEM_ALERT_WINDOW, RECEIVE_BOOT_COMPLETED,
  WRITE_EXTERNAL_STORAGE, USE_BIOMETRIC) **ausentes**.
- Next: verificado desde vps2 sin fiarme del informe del build — 84 494 945 bytes, sha256
  `5a339f36…b0b8` idéntico en el archivo y en `android.json`; Cloudflare lo sirve con HTTP 200,
  ese tamaño y el tipo correcto; y el botón (`/api/app/descargar`) devuelve 302 al archivo bueno,
  así que la cuenta de descargas sigue viva. `publicar-apk.sh` retiró la 0.2.0, como hace siempre.
- Blockers: ninguno. Pendiente de Dariel: la sesión de j-u tiene un merge local sin subir (su
  entrada de Camagüey en STATUS.md); `master` se ha movido mucho desde entonces, así que al
  resolverlo tocará conservar las dos entradas en orden cronológico, como siempre.

## 2026-09-29 03:55 UTC — cc-jarvis-ubuntu — Web: tarjetas, zoom, mapa; y APK 0.2.2
- Changes: web (`abd7e9d`, `14622ed`, `d7b555c`, `c20abb8`): las tarjetas de listado recuperan un filo gris y una sombra mínima (sin marco no se distinguían sobre el blanco); **sin zoom de página salvo en los mapas** (viewport `maximum-scale=1, user-scalable=no`, `touch-action: manipulation`, y un `gesturestart` que frena el pellizco de iOS fuera de `.leaflet-container`; campos a 16 px en móvil); el mapa **recorta a Cuba** el área pedida (`acotarBbox`: en móvil vertical el rectángulo pasaba de 19–24° y `/api/mapa` daba 400, el mapa abría vacío); **arrastrar recarga solo** (500 ms, fuera «Buscar en esta zona»; `cargarCelda` usa la zona PINTADA, `bboxPintadoRef`); mapas **estilo Positron** con un filtro sobre `.leaflet-tile-pane` (OSM no ofrece otro estilo). App 0.2.2 / versionCode 5 (`b262644`): lo mismo en la app (`raster-saturation/contrast/brightness`, recarga al arrastrar, `acotarBbox`).
- Tests: pass — web 23/23, app 47/47, typechecks. **APK probada en emulador contra producción** (variante x86_64 del mismo código): estilo aplicado, pines cargados, tras arrastrar al oriente aparecen solos Holguín y Santiago, sin botón ni error. Publicada: sha256 `f0c1d573…66527`, igual en origen y por Cloudflare.
- Security: N/A. El bloqueo de zoom quita el zoom a quien lo necesita para leer (WCAG 1.4.4): decisión de Dariel, reversible en tres líneas.
- Next: probar las URLs de teselas desde Cuba (si se quiere Positron real: CARTO exige clave y tope comercial desde 23-sep; OpenFreeMap sin clave pero ~4× más datos). En la app el área aproximada sigue siendo un disco de tamaño fijo.
- Blockers: ninguno.

## 2026-09-29 16:40 UTC — cc-jarvis-ubuntu — APK 0.2.3: pantalla negra sobre el mapa en Huawei P8 Lite
- Changes: `MapaExplorar.tsx`: `androidView="texture"` y `overflow: 'hidden'` en el contenedor. Foto de Dariel desde un P8 Lite en Cuba (Cubacel): el mapa se veía bien pero **todo lo que hay encima** (cabecera, buscador, filtros) salía negro, y los pines del borde asomaban sobre esa zona. Causa: el `GLSurfaceView` por defecto de MapLibre se compone en una capa aparte de la ventana y en esa GPU (Mali, EMUI) rompe el dibujado del resto; `TextureView` dibuja dentro de la jerarquía. Los pines se salían porque en React Native una vista no recorta a sus hijas por defecto. versionCode 6.
- Tests: pass — app 47/47, typecheck. En emulador (variante x86_64): Explorar → Mapa dibuja cabecera, filtros y mapa; un pin llevado al borde superior queda recortado. 🚨 **No reproducible en emulador** (dibuja por software; con `-gpu host` sin ventana se cae): el arreglo del negro está confirmado solo por la causa conocida, falta verlo en el P8 Lite. Buena noticia de paso: **las teselas de OSM cargan desde Cuba**.
- Security: N/A.
- Next: confirmar en el P8 Lite. Si siguiera negro, siguiente sospechoso: el filtro `raster-*` (único cambio de dibujado de la 0.2.2).
- Blockers: ninguno.

## 2026-09-29 16:45 UTC — cc-jarvis-ubuntu — APK 0.2.4: sin barra del logo ni títulos grandes en las pestañas
- Changes: pedido de Dariel: la barra de navegación inferior ya dice dónde estás. Fuera `Cabecera` (logo + «Entrar») de Inicio, Explorar, Mensajes y Cuenta, y el componente borrado; fuera los títulos grandes («Explorar servicios», «Mensajes», «Cuenta»). `Pantalla` sigue pintando `titulo` en las pantallas del Stack (entrar, registro) y ahora pinta `subtitulo` aunque no haya título (el de Mensajes explica que el chat es del plan Profesional). Entrar sigue a mano en Cuenta y en el vacío de Mensajes. **Se conserva el hero de Inicio** («El que te lo soluciona vive cerca»): es contenido, no el título de una sección. versionCode 7.
- Tests: pass — app 47/47, typecheck. En emulador: las cuatro pestañas y la vista de mapa, sin barra ni títulos y con margen correcto bajo la barra de estado.
- Security: N/A.
- Next: confirmar 0.2.3/0.2.4 (pantalla negra del mapa) en el P8 Lite.
- Blockers: ninguno.

## 2026-09-29 22:55 UTC — claude-code (vps2) — Tarea 15: cierre del porte SQLite → Postgres/PostGIS
- Changes: **última tarea del plan de porte a Postgres+PostGIS.** Portados los cinco últimos
  consumidores de `better-sqlite3`: `src/db/seed-demo.ts` (el más largo — dos bloques `tx()` para
  cuentas/perfiles/servicios y para agenda/citas/catálogo/favoritos, separados por un tercer tramo
  sin transacción para reseñas+`refreshProviderRating()`, que usa el pool y por eso no puede ir
  DENTRO de una `tx()` — ver el comentario en el archivo), `src/db/seed-mapa-cli.ts`,
  `src/scripts/admin.ts`, `src/scripts/pagos.ts` (los tres CLI ahora usan `migrar()` + `q`/`qOne`/
  `tx` y cierran el pool al salir) y `src/index.ts`, que pasa a un arranque asíncrono real:
  `await migrar()` → `await seedBase()` → `await seedDemo()` si `DEMO_MODE` → `app.listen`; si
  `migrar()` falla, `start().catch()` saca el proceso con código 1 en vez de servir con la base a
  medias. De paso, arreglados dos helpers `async` invocados sin `await` dentro de `setInterval` en
  el propio `index.ts` (`expireSubscriptions`/`programarAvisos`: el `try/catch` que ya tenían
  alrededor era síncrono y no atrapaba un rechazo de la promesa — la misma familia de bug que
  `trampas-porte.md` ya documentaba en otros archivos). Quitado `better-sqlite3`/
  `@types/better-sqlite3` de `package.json` y borrado `src/global.d.ts` (solo tipaba ese paquete
  como `any`; el resto de sus declaraciones —`__filename`/`__dirname`/`window`/`global`— resultó
  no hacer falta ninguna, `@types/node` ya las cubre). Tres tests nuevos, los tres del registro de
  pendientes: `coordenada-servida.test.ts` gana "dos perfiles en la misma coordenada publican
  puntos distintos" (cierra el hueco de que nada probaba que el desplazamiento no fuera
  predecible); `buscador.test.ts` gana la búsqueda por el nombre de la categoría PADRE (el código
  ya la hacía — `parent.busca` en `services.ts`/`mapa.ts` — pero ningún test la ejercitaba;
  confirmado quitando el `OR parent.busca` a mano: el test nuevo falla, así que no es un falso
  positivo); y `mapa.test.ts` baja `BBOX_ZONA_SIN_REDONDA` de ±0,0005° a ±0,0003° para cerrar un
  flake real de ~1 en 355 (medido por la Tarea 14: el margen del 50 % que aplica el servidor
  inflaba el rectángulo hasta 113 m de esquina, por encima del desplazamiento mínimo de 100 m; con
  ±0,0003° la esquina inflada queda en 68 m — geométricamente imposible que alcance el anillo, con
  margen de sobra). **No es un agujero de seguridad**: el test afirmaba algo determinista sobre un
  sistema probabilístico; la promesa de 100-300 m de incertidumbre se sigue cumpliendo siempre.
  Documentación: `CLAUDE.md` reescrito donde hacía falta (tabla del stack, estructura de
  `backend/src/db`, columna `punto_pub`/`provider_profile_id`, desarrollo local con
  `docker compose up -d oficio_db`, sección de esquema y migraciones para `migrar.ts`/
  `esquema.sql`, y los gotchas nuevos: `count(*)` como cadena, `jsonb` ya parseado al leer pero que
  sigue pidiendo `JSON.stringify()` al escribir un array, `timestamptz` como `Date`, el orden de
  coordenadas de `ST_MakeEnvelope` frente al `bbox` de la API, `unaccent()` no `IMMUTABLE` dentro
  de una columna generada, y el patrón de helper `async` sin `await` que el typecheck con
  `strict:false` no delata); y la advertencia de `COMPOSE_PROJECT_NAME` en el `.env` de un
  worktree de desarrollo (sin él, `docker compose` deriva el nombre de proyecto del directorio,
  que coincide con el de producción en vps2, y un `down` desde el worktree pararía los
  contenedores reales — ya estaba puesto en el `.env` de este worktree, pero no documentado en
  ningún sitio que sobreviva a un `git pull`).
- Tests: **257/257 en verde** (255 heredadas + 2 nuevas contables — la del bbox no suma test, solo
  cambia una constante), backend `npx tsc --noEmit` en **0 errores** (bajó de los 6 esperados:
  `initDatabase`/`export default` inexistentes en los cinco archivos del brief). Frontend:
  `npx tsc --noEmit` limpio y `npm run build` completo (hubo que `npm install` primero: el
  `node_modules` del frontend no existía en este worktree). `seed-demo.ts` no tiene test propio en
  la suite (nadie llama `seedDemo()` desde vitest), así que se verificó aparte contra una base
  Postgres temporal (creada y borrada con el mismo patrón que `test/plantilla.ts`, nunca tocando
  `oficio_db` de este worktree ni el de producción): siembra 17 usuarios/12 perfiles/22
  servicios/34 reseñas sin errores, es idempotente (segunda llamada devuelve `false` sin duplicar
  nada), las valoraciones (`rating`/`review_count`) quedan bien calculadas tras el recálculo fuera
  de la transacción, y `punto_pub` coincide con `lat`/`lng` en los perfiles `exacta` (sin
  intercambiar los ejes).
- Security: **grep de verificación limpio** —
  `grep -rn "better-sqlite3\|db.prepare\|PRAGMA" src/ test/` no devuelve código, solo un comentario
  histórico en `test/mapa-esquema.test.ts` que explica qué probaba el archivo en la época SQLite.
  Confirmado a mano que **todas** las llamadas a `seedBase`/`seedDemo`/`seedMapa` llevan `await`
  (la trampa ya detectada de `index.ts`/`seed-mapa.ts`: `seed-mapa.ts` ya la tenía bien desde la
  Tarea 10, solo faltaba `index.ts`). Ninguna consulta de `seed-demo.ts` usa el pool dentro de una
  `tx()` (regla dura del plan): el recálculo de valoración va después de que el bloque de
  cuentas/perfiles/servicios haya confirmado, igual que ya hacen `routes/reviews.ts` y
  `routes/services.ts`. No se tocó red, puertos, auth, CORS, Traefik, el túnel ni el `.env`
  (`docker-compose.yml` ya traía `oficio_db` bien configurado — sin puertos, solo en `oficio_net`,
  sin labels — de una tarea anterior; no hizo falta tocarlo). No se ejecutó `docker compose` ni se
  tocó ningún contenedor, solo se editó código y se corrió contra la base de desarrollo en
  `127.0.0.1:55432` y contra una base temporal propia para el smoke test de `seedDemo()`.
- Next: el Plan 2 (Meilisearch: los tres índices, `search_outbox`, `oficio_indexer`, el modo
  degradado, el mapa por facetas) y el Plan 3 (concurrencia: `cluster`, dimensionado del pool,
  `Cache-Control`) — ninguno de los dos entra en este plan, según el propio `task-15-brief.md`.
  Pendiente de Dariel: revisar el reporte completo en
  `.superpowers/sdd/2026-09-29-postgres/task-15-report.md` y decidir cuándo se prueba el arranque
  real con `docker compose up -d --build` (paso 6 del brief, explícitamente fuera de mi alcance en
  este worktree) y la verificación manual por Cloudflare antes de mezclar la rama.
- Blockers: ninguno.

## 2026-09-29 23:15 UTC — claude-code (vps2) — Tarea 15, fix round 1: seedDemo() a medio camino no se daba por sembrado
- Changes: la revisión de la entrada anterior encontró que partir `seedDemo()` en tres tramos (por
  `refreshProviderRating()`, que no puede ir dentro de una `tx()`) dejó la guarda de idempotencia
  (`email = 'cliente@demo.com'`) anclada al primer tramo: si el segundo o el tercero fallaban
  después de que el primero confirmara, la base quedaba con perfiles/servicios a medias y el
  siguiente intento se daba por "ya sembrado" sin reparar nada — con `DEMO_MODE=true` en
  producción, no es hipotético. Arreglo: los tres tramos van envueltos en un `try/catch` que, si
  cualquiera falla, borra TODO lo que ese intento llegó a crear (los `users` — clientes y
  proveedores —, que arrastran en cascada perfiles, servicios, reseñas, conversaciones, citas,
  catálogo y favoritos por los `ON DELETE CASCADE` del esquema) antes de relanzar el error. La
  guarda original no hizo falta moverla a un marcador aparte: como ya no queda nunca una fila a
  medias, vuelve a decir la verdad. También `src/index.ts`: el `await expireSubscriptions()` de
  arranque ahora usa el mismo wrapper protegido que ya tenía su `setInterval` gemelo (antes moría
  el proceso entero si fallaba una sola vez al arrancar; la caducidad de planes no es requisito
  para servir, a diferencia de `migrar()`).
- Tests: **258/258** (257 + 1 nuevo), `npx tsc --noEmit` en 0. `test/seed-demo.test.ts` (nuevo):
  fuerza un fallo real a mitad del segundo tramo con un trigger de Postgres sobre `reviews`
  (`RAISE EXCEPTION`, sin tocar código de producción ni usar mocks — esta suite es toda de
  integración), comprueba que la limpieza deja `users`/`provider_profiles`/`services` en 0 y sin
  `cliente@demo.com`, y que el reintento sin el trigger completa el sembrado entero (valoración
  recalculada) y se mantiene idempotente. Verificado que el test detecta la regresión: con la
  limpieza deshabilitada a propósito, el test falla (`expected 17 to be 0`); restaurado el fix,
  vuelve a pasar.
- Security: N/A — mismo alcance que la entrada anterior, sin tocar red/puertos/auth/contenedores.
- Next: sin cambios respecto a la entrada anterior.
- Blockers: ninguno.

## 2026-09-30 00:45 UTC — claude-code (vps2) — Despliegue del porte a Postgres 18 + PostGIS en producción
- Changes: desplegado a producción el porte completo de SQLite a Postgres 18.6 + PostGIS 3.6 (los 48
  commits ya mezclados en `master`, más `2ff9cdf` con el procedimiento). Dariel ejecutó el
  `docker compose --profile telegram up -d --build`; el resto de esta entrada es la verificación de
  los 7 pasos de `docs/despliegue-postgres.md`. Cuatro contenedores sanos (`oficio_api`, `oficio_web`,
  `oficio_notifier` en `oficio-api:latest`/`oficio-web:latest`; `oficio_db` en `postgis/postgis:18-3.6`),
  esquema en la versión 1, `postgis_version()` = `3.6 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`. Sembrado:
  16 provincias, 162 municipios, 99 categorías, 17 usuarios, 12 perfiles, 22 servicios.
  Añadido `*.dump`/`*.sql.gz` al `.gitignore` (commit `27fced4`): `DOCKER.md` manda crear el volcado
  en `oficios-cuba/`, ninguna regla lo cubría, y lleva `users.password_hash` y `users.totp_secret`
  de todos los usuarios — en un repo público no puede depender de que nadie escriba `git add .`.
  Los respaldos de la época SQLite estaban a salvo solo porque vivían en `data/`, que sí está ignorada.
- Tests: verificado en producción a través de Cloudflare, no desde el servidor.
  `/api/config` → `demo:true`; `/api/stats` → 12 proveedores, 22 servicios, 10 provincias, 34 reseñas,
  4.4 de media. Búsqueda `tsvector`: `q=plomeria` **sin acento** encuentra "Reparación de plomería y
  salideros", `q=electricidad` → 4, `q=plom` (prefijo) → 3. Mapa sobre PostGIS: `/api/mapa` → 9 puntos
  con `celda`, `detras`, `aproximado` y resumen precalculado; `/api/mapa/celda` con los `cy`/`cx` que
  devuelve el propio mapa → 3 negocios (1 mostrado + `detras=2`, cuadra), ordenados por plan.
  Validación viva: `bbox` fuera de Cuba, invertido e inventado → 400; `tab` inventada → 400.
  SPA: `/`, `/explorar`, `/explorar?vista=mapa`, `/planes`, `/login`, `/dashboard` → 200; `/nada.js` → 404;
  los tres recursos que el HTML referencia y una imagen `/demo/*.webp` → 200 con su tipo correcto
  (la clase de fallo del `location` sin `^~`). Las tres pestañas traen datos: 3 servicios, 11 artículos,
  3 perfiles. Las dos herramientas de administración salen con 0 y **sin** el
  `TypeError ... slice is not a function` que las reventaba antes del último arreglo del porte.
  Volcado nuevo verificado con el `pg_restore` del contenedor: 200 entradas, 33 tablas con datos,
  extensiones e índices dentro (`oficio-2026-09-30-0042-post-despliegue.dump`, en 600).
  La comprobación visual en navegador queda pendiente para Dariel: este host no tiene Chrome
  instalado y Playwright no puede arrancar.
- Security: aislamiento de red intacto tras el despliegue — `oficio_api` **sin** salida a internet
  (`EAI_AGAIN`), `oficio_notifier` **con** salida (HTTP 200). `oficio_db` sin puertos publicados,
  solo en `oficio_net`, sin labels de Traefik.
- Next: **dos cosas quedaron atrás con los datos viejos y hacen falta para operar.** (1) El SQLite
  tenía un admin — `awaydsystems@gmail.com`, con 2FA activo — y en la base nueva hay **0 admins**, y
  esa cuenta no existe (era un login real de Google, y el seed demo no la crea): sin admin no se
  entra a `/admin`. Cadena para recuperarlo: entrar con Google para que se cree la cuenta →
  `docker exec oficio_api node dist/scripts/admin.js dar awaydsystems@gmail.com` → montar el 2FA de nuevo.
  (2) El token del bot de Telegram vivía cifrado en `telegram_state` y tampoco se migró: el notificador
  dice `Sin token: esperando a que un admin lo pegue en el panel`, así que **los avisos por Telegram
  están caídos** (el push por FCM **no**: su clave es un archivo, `Push FCM activo`). La pareja de
  claves del notificador sobrevivió (la privada es `secrets/notifier/notifier.key`, un archivo) y la
  pública en la base nueva tiene el **mismo** md5 que la vieja, así que el `token_cipher` del respaldo
  de SQLite sigue siendo descifrable: se puede restaurar esa fila en vez de volver a pegar el token
  a mano. Sin decidir — mueve una credencial cifrada entre bases, así que lo decide Dariel.
  La coordinación con Doniet la lleva Dariel directamente (2026-09-30): no es un pendiente mío.
  Nada se ha subido todavía a GitHub. `seedMapa()` no se ejecutó, así que el
  mapa tiene 9 puntos en vez de los ~300 de `npm run seed:mapa` — es lo esperado, no un fallo.
- Blockers: ninguno.

## 2026-09-30 01:20 UTC — claude-code (vps2) — Admin inicial, Playwright a demanda y comprobación visual
- Changes: (1) **Admin del panel técnico creado**: `admin@dardoit.com`, cuenta `client` con
  contraseña de 24 caracteres, registrada por `POST /api/auth/register` desde **dentro** del
  contenedor (127.0.0.1:3000, la contraseña entró por STDIN: no pasó por argv, ni por el entorno de
  ningún proceso, ni por internet) y promovida con `dist/scripts/admin.js dar`. Las credenciales
  quedan en `oficios-cuba/.env` (600) como **bloque de comentario**, no como variable: `oficio_api`
  monta ese archivo con `env_file: .env`, así que cualquier variable de ahí sería legible con
  `docker exec oficio_api env`. Es una cuenta aparte de la de Google a propósito: con
  `GOOGLE_CLIENT_ID` vacío el Google de producción es el SIMULADO, y con `DEMO_MODE=true` cualquiera
  puede reclamar por ese selector un email **sin** contraseña (los que la tienen dan 409) — un admin
  sin contraseña sería reclamable desde fuera. (2) `.env.example` estaba obsoleto para el stack
  nuevo: le faltaban `POSTGRES_PASSWORD` y `MEILI_MASTER_KEY`, y `CLAUDE.md` manda copiarlo para
  montar un entorno local. Añadidas, más el aviso de `COMPOSE_PROJECT_NAME`. (3) **Playwright a
  demanda** en `~/docker/playwright/` (fuera de este repo): `Dockerfile` + `docker-compose.yml` con
  dos perfiles que **no arrancan solos**, `scripts/abrir.mjs` (genérico), `scripts/verificar-oficio.mjs`
  (el paso 4 del runbook, sale != 0 si hay errores de consola sin justificar) y `scripts/puente-cdp.mjs`.
- Tests: comprobación visual de producción a 390 px, que era lo único del runbook que faltaba:
  portada, las tres pestañas de `/explorar`, vista de mapa, ficha, planes y login. Los contadores de
  la propia página cuadran con la API: **22 servicios, 11 productos, 2 negocios**; el mapa pinta
  7 marcadores y responde al click. Sin desborde horizontal en ninguna. **0 errores de consola sin
  justificar** (los 6 que hay son el beacon de Cloudflare Web Analytics que la CSP bloquea a
  propósito). El login del admin verificado de punta a punta: `POST /api/auth/login` → 200 y
  `GET /api/admin/me` → 200 con `totp_enabled:false` (activa el 2FA al entrar). Modo CDP probado
  con `chromium.connectOverCDP()` desde la red del host: conecta y maneja el navegador. Nada quedó
  corriendo.
- Security: el puerto CDP (9222) se publica **solo en 127.0.0.1** y únicamente bajo `--profile cdp`;
  CDP es control total del navegador sin autenticación. Nada más se expuso: sin cambios en Traefik,
  el túnel, CORS, auth ni el aislamiento de red. Las copias en claro de la contraseña en el
  scratchpad se borraron con `shred`.
- Next: **el `git push origin master` lo bloqueó el harness** (`Out-of-Place Publication`), igual que
  el despliegue: `master` sigue 53 commits por delante de `origin/master` y hay que lanzarlo a mano.
  Revisado antes de intentarlo: ningún `.env`, clave ni volcado entre los archivos a subir, y los
  `DATABASE_URL` del diff usan `${POSTGRES_PASSWORD}`, no una contraseña literal. La coordinación con Doniet
  la lleva Dariel directamente (2026-09-30): no es un pendiente mío. El token de Telegram sigue sin restaurar (ver la entrada anterior y
  `docs/despliegue-postgres.md`).
- Blockers: el push, que necesita permiso o que lo lance Dariel.

## 2026-09-30 03:05 UTC — claude-code (vps2) — El mapa de /explorar pasa a ser la página
- Changes: rediseño de `?vista=mapa` según `docs/superpowers/specs/2026-09-30-mapa-pantalla-completa-design.md`
  y su plan. El mapa ocupa el viewport bajo la cabecera (sin scroll de página: el pie se oculta en
  esta vista, la barra inferior de móvil se queda), los controles flotan encima, y la información
  sale en **panel lateral desde `lg`** o en **hoja inferior colapsable** por debajo. Un punto
  agrupado lista los negocios de su celda en ese mismo panel, y desde uno se vuelve a la lista sin
  volver a pedirla. **Solo frontend: ni el backend ni `/api/mapa` se tocaron.** Nuevos:
  `usarPanel.ts` (historial, Esc, foco y scroll, compartidos por los dos envoltorios),
  `PanelLateral`, `FichaPunto`, `PanelMapa`, `ControlesMapa`, `ExplorarMapa`. `HojaPunto` pasa de
  385 a 150 líneas: conserva su arrastre y sus dos alturas, y recibe el contenido por `children`.
  `Search.tsx` baja de 644 a 623 y suelta el layout del mapa.
- Tests: **42 en verde** (23 antes), typecheck en 0, `npm run build` OK. Comprobado además en un
  navegador de verdad a 390 y 1280 px con `~/docker/playwright`: mapa a sangre, panel lateral en
  escritorio y hoja en móvil, Esc cierra, un grupo lista sus negocios y «Volver a la lista»
  devuelve la misma, **0 px de scroll de página** en ambos anchos y ningún error de página.
- Security: N/A. Sin cambios en red, puertos, auth ni datos.
- Next: **tres defectos preexistentes arreglados de paso**, todos con prueba: (1) `cargarCelda` no
  tenía `.catch` ni en el hook ni en quien lo llamaba, así que un fallo de `/api/mapa/celda` era un
  rechazo no capturado y tocar un grupo **no hacía nada**, sin mensaje; (2) el mapa pedía el área
  con un rectángulo **sin área** (`sur === norte`) cuando el contenedor aún no tenía altura —
  gastaba una petición imposible y dejaba `bboxPintadoRef` degenerado, del que `cargarCelda` habría
  deducido un tamaño de celda absurdo; (3) el botón «Cerca de mí» quedaba **debajo de la hoja**:
  `--hoja-punto-alto` la publicaba `HojaPunto` desde hacía entregas y no la leía nadie.
- Blockers: ninguno.

## 2026-09-30 03:35 UTC — claude-code (vps2) — Cierre del mapa a pantalla completa: los arreglos de la revisión
- Changes: commiteado lo que la revisión del rediseño dejó aplicado pero suelto en el working tree
  (13 archivos). Tres defectos reales: el **«Reintentar» de la lista de celda era un botón muerto**
  (copiaba el array y dejaba el error), **cambiar de punto pedía el perfil dos veces** y entre
  petición y respuesta pintaba el teléfono del negocio anterior bajo el nombre del nuevo, y el
  **historial y el foco vivían en los envoltorios**, que se desmontan al cruzar los 1024 px: cada
  giro de tableta dejaba una entrada de historial huérfana y un Atrás que no hacía nada. Ahora los
  posee `PanelMapa`, que sobrevive al cambio; la trampa de foco se queda solo en la hoja móvil
  (`usarTrampaFoco`), porque el panel lateral declara `aria-modal="false"` y atraparlo ahí sería
  desmentirlo. Además: el título de la lista ya no se recorta 6 px, un mapa que se monta sin altura
  se recupera con un `ResizeObserver` en vez de quedarse mudo para siempre, y el «Saltar al
  contenido» vuelve a quedar por encima del panel.
- Tests: **46 en verde** (42 antes), typecheck en 0, `npm run build` OK. `vitest run` salía con
  **código 1** aunque las 46 pasaran: la prueba del rectángulo sin área no le daba implementación al
  espía de `mapaApi.buscar`, así que el `.then` de `cargar()` reventaba dentro del temporizador del
  antirrebote como excepción no capturada. Arreglado y verificado con 15 corridas seguidas — en la
  primera de todas hubo **un fallo suelto que no volvió a aparecer y quedó sin explicar**; este
  fichero tiene historial de contagio entre pruebas, así que conviene no darlo por muerto.
- Security: N/A. Solo frontend; sin cambios en red, puertos, auth ni datos.
- Next: la rama `mapa-pantalla-completa` (12 commits, worktree `~/worktrees/oficio-mapa`) está lista
  y **sin fusionar**: fusionar a `master` y desplegar es decisión de Dariel. Sigue pendiente el
  `git push origin master` que bloqueó el harness (ver la entrada del 30-sep 00:26).
- Blockers: ninguno técnico.

## 2026-09-30 04:05 UTC — claude-code (vps2) — Desplegado el mapa a pantalla completa
- Changes: `mapa-pantalla-completa` fusionada a `master` en avance directo (13 commits) y empujada a
  `origin/master` — el push que el harness bloqueó el 30-sep a las 00:26 **ya pasó**. Desplegado con
  `docker compose --profile telegram up -d --build`: solo se recreó `oficio_web` (el backend no
  cambió; la rama es frontend puro, sin migraciones). Respaldo previo en
  `data/oficio-2026-09-30-0338-pre-deploy-mapa.dump` (103 KB, 190 entradas, `pg_restore -l` lo lee).
- Tests: 48 en verde, typecheck 0, build OK. Verificado desde fuera por Cloudflare: `/api/config`
  (`demo:true`), `/api/stats`, SPA 200 en `/`, `/buscar` y `/explorar?vista=mapa`, `/nada.js` 404.
  **Subida de foto de punta a punta**: login demo → `POST /api/uploads` 201 → `GET` 200 `image/png`
  con los bytes idénticos; la foto de prueba se borró después (queda cacheada en Cloudflare bajo su
  UUID, que no referencia nada). Conteos idénticos antes y después
  (users=18, perfiles=12, servicios=22, reseñas=34, migración=1), PostGIS 3.6 con sus 8 índices GiST.
  `verificar-oficio.mjs` a 390 px: exit 0, 0 errores de consola sin justificar.
- Security: **aislamiento de red intacto** — `oficio_api` sigue SIN salida a internet (`EAI_AGAIN`) y
  `oficio_notifier` CON salida. Sin cambios en Traefik, el túnel, CORS, auth ni puertos.
- Next: **un defecto encontrado en la verificación y arreglado en el acto** (`8a50bbe`): con el panel
  lateral abierto en escritorio **no se podía hacer zoom**. El control de Leaflet vive abajo a la
  izquierda, justo bajo el panel, y `elementFromPoint` confirmó en producción que el clic caía en el
  panel. Ahora se aparta a su derecha desde 1024 px (en móvil sigue a la izquierda y subiendo con la
  hoja: medido, 690 → 437 px). Redesplegado y vuelto a medir: el clic llega al botón.
  🚨 **La skill `oficio-deploy-vps2` sigue mandando respaldar con `better-sqlite3`**, que en esta
  base ya no existe; lo correcto es el `pg_dump -Fc` de `docs/despliegue-postgres.md`. Conviene
  corregir la skill antes del próximo despliegue.
  Sigue sin restaurar el token de Telegram (el notificador arranca diciendo «Sin token»).
- Blockers: ninguno.

## 2026-09-30 04:25 UTC — claude-code (vps2) — Seed del mapa en desarrollo
- Changes: `npm run seed:mapa` contra **`oficio_db_test`** (la base de desarrollo, loopback
  `127.0.0.1:55432`, volumen aparte), nunca contra producción. 300 perfiles sembrados, 301 en total.
- Tests: reparto de planes exacto al objetivo (40 % free / 35 % pro / 25 % basic), 133 perfiles en La
  Habana —consistente con el 40 % que el seed apila allí para que se vean los «+N»— y **0
  coordenadas fuera de Cuba**. Producción sin tocar: 18 usuarios, 12 perfiles, 22 servicios, iguales
  antes y después.
- Security: dos cosas que conviene saber. (1) El pestillo del seed **funciona**: se negó a correr sin
  `DEMO_MODE=true` («sembraría 300 negocios falsos en datos reales»). (2) La contraseña del volumen
  de `oficio_db_test` se había quedado atrás respecto al `.env` (verificado comparando huellas SHA,
  sin exponer ninguna). Dariel ejecutó el `ALTER USER` —el harness me lo bloqueó por ser escritura de
  credencial— y quedó alineado: comprobado conectando desde el host con la clave del `.env`, 301
  perfiles intactos.
- Next: faltaba `pg` en `backend/node_modules` (resto de antes del porte a Postgres); `npm install`
  lo resolvió sin tocar el `package-lock.json`. Quien monte desarrollo desde cero en este host lo
  necesitará.
- Blockers: ninguno.

## 2026-09-30 04:10 UTC — claude-code (vps2) — Los 300 puntos de prueba, ahora en oficio.dardoit.com
- Changes: `node dist/db/seed-mapa-cli.js` dentro de `oficio_api`, contra la base publicada. Decisión
  de Dariel: **el sitio sigue siendo un entorno de desarrollo** hasta que él avise del paso a
  producción real con negocios reales. Respaldo previo en
  `data/oficio-2026-09-30-0403-pre-seed-mapa.dump` (185 entradas). `DEMO_MODE` ya estaba en `true`,
  así que el pestillo del seed dejó pasar.
- Tests: 18 → 318 usuarios, 12 → 312 perfiles, 22 → 322 servicios; las 34 reseñas sin tocar. **Nada
  se sobrescribió**: la siembra solo añade, y los negocios originales siguen ahí (comprobados por
  nombre). Los dos conjuntos se distinguen por el dominio del email — 300 en `@oficios.test`, los
  18 originales en `@demo.com` y `@dardoit.com` —, así que la limpieza futura es separable.
  Verificado desde fuera: `/api/mapa` sobre Cuba entera representa los 312 (22 puntos + agrupados),
  158 en La Habana. En el navegador a 390 px el mapa sale con sus grupos «+12», «+13», «+10»…, que
  es justo lo que el seed apila para que el «+N» se vea. 0 errores de consola sin justificar.
- Security: N/A. Solo datos; sin cambios en red, puertos, auth ni configuración.
- Next: cuando Dariel avise del paso a producción real, toca borrar lo sembrado
  (`email like '%@oficios.test'`) y decidir qué pasa con `DEMO_MODE`.
- Blockers: ninguno.

## 2026-09-30 04:20 UTC — claude-code (vps2) — Cuenta demo de administrador con entrada directa al panel Técnico
- Changes (`9482e8c`): tercer botón "Administrador" en la sección "Prueba la demo" del login
  (`cliente@demo.com` / `proveedor@demo.com` / **`admin@demo.com`**, misma contraseña `Demo123!`).
  `seedDemo()` siembra esa cuenta con `is_admin=true` y 2FA ya activado (secreto que nadie ve).
  Nueva ruta `POST /admin/2fa/demo-enter` (`routes/admin.ts`) abre la sesión de administración
  sin pedir código, pero **solo** si `DEMO_MODE=true` y el email es exactamente `admin@demo.com`:
  cualquier otro admin —incluido uno real en producción con `DEMO_MODE=true`, como la cuenta de
  Dariel— sigue exigiendo su código TOTP real; la ruta no distingue por "es admin", distingue por
  ese email exacto. Sin cambios de esquema.
- Tests: pass — backend **267/267** (3 nuevos: el atajo entra sin código para `admin@demo.com`
  con 2FA activo, 404 para cualquier otro admin aunque tenga 2FA y esté en DEMO_MODE, 404 fuera de
  DEMO_MODE) corridos contra una base Postgres temporal y aislada (contenedor aparte, sin tocar
  `oficio_db`); `tsc` backend y frontend, `vite build`. Verificado además en producción tras el
  despliegue: registro de `admin@demo.com` vía `/api/auth/register`, rol de admin por el CLI
  (`scripts/admin.js dar`), activación del 2FA con el flujo real (`/2fa/setup` → código TOTP
  calculado con la misma función del proyecto → `/2fa/enable`), y `POST /2fa/demo-enter` → 200 con
  `admin_token` que abre `/admin/system` de verdad. El bundle público (`Login-CRceSNKx.js`) ya sirve
  el botón nuevo.
- Security: nueva ruta que toca el flujo de 2FA del panel técnico — gateada por `DEMO_MODE` Y el
  email exacto `admin@demo.com`, no por "cualquier admin", para no debilitar el 2FA de un admin
  real mientras el sitio siga en modo demo. Sin cambios de red, Traefik, túnel ni `.env`. Backup
  (`data/oficios-2026-09-30-0419-pre-admin-demo.dump`) antes del deploy, por costumbre — no hubo
  migración de esquema.
- Next: cuando se apague `DEMO_MODE`, la ruta y el botón dejan de tener efecto solos (no hace
  falta borrarlos a mano), pero sí conviene borrar entonces la cuenta `admin@demo.com` como
  cualquier otra cuenta demo.
- Blockers: ninguno. Cambios commiteados en `master` local; **sin pushear** a
  `github.com/doniet/oficio` todavía.

## 2026-09-30 23:47 UTC — claude-code (vps2) — Pin de selección en el mapa (misma gota del logo), coloreado por tipo
- Changes (`664a6f4`): al tocar un negocio u oficio en `/explorar?vista=mapa`, su marcador pasa de
  círculo a la silueta del glifo de marca (`favicon.svg`) — el ancla se mueve a la PUNTA de la
  gota, no al centro, para que la coordenada real no "salte" al seleccionarlo. Vuelve a círculo al
  cerrar la ficha o elegir otro punto; z-index por encima del resto para no quedar tapado. De paso
  (pedido de Dariel tras ver el primer diseño en un artifact de previsualización, sin navegador
  disponible en vps2 para verlo en vivo): el color del marcador —círculo y pin— deja de seguir el
  *plan* y pasa a seguir el **tipo de perfil**: `brand-600` (naranja) para un negocio, `ink-700`
  (oscuro) para un servicio suelto. Sin cambios de backend ni de esquema.
- Tests: pass — frontend 49/49 (2 nuevos: el círculo se convierte en pin solo para el punto con la
  ficha abierta y vuelve a círculo al soltarlo o cambiar de punto; el color sigue `tipo`, no `plan`,
  en ambos estados). `tsc` y `vite build` limpios. Verificado en producción tras el deploy: el
  chunk `MapaExplorar-D4xMLMAu.js` servido por Cloudflare contiene `map-pin--seleccionado`,
  `bg-brand-600` y `bg-ink-700`.
- Security: N/A — solo frontend, sin tocar `oficio_api` ni la base. Desplegado con
  `docker compose up -d --build oficio_web` (sin reconstruir `oficio_api`/`oficio_db`): menor radio
  de impacto para un cambio que no toca el backend.
- Next: ninguno.
- Blockers: ninguno. Sin verificación visual en navegador real (vps2 no tiene Chromium instalado);
  se verificó con una previsualización aislada que usa el mismo SVG y las mismas clases del código.

## 2026-10-01 00:16 UTC — claude-code (vps2) — Acordeón de servicios en el panel del mapa
- Changes (`5519a02`): la ficha de un punto en `/explorar?vista=mapa` (panel lateral y hoja móvil,
  `FichaPunto.tsx`) ganaba calificación, descripción, categorías y contacto, pero no mostraba los
  servicios publicados — a diferencia del perfil completo. Pedido de Dariel: enriquecer el panel sin
  gastar datos de más. Ahora, después de WhatsApp/Llamar, hay un acordeón **«Servicios (N)»**
  cerrado por defecto (`SeccionServicios` + `ServicioMiniCard`, con el patrón de acordeón ya usado
  en `DescargarApp.tsx`). Decisión técnica explicada a Dariel: `GET /providers/:id` YA incluye
  `services` en la misma respuesta que el resto de la ficha — separarlo en una segunda petición
  habría sido tráfico duplicado, lo contrario de "ayudar a la conexión". Lo que sí se difiere al
  clic es el **renderizado**: las tarjetas de servicio y sus fotos no existen en el DOM mientras el
  acordeón está cerrado (más estricto que el `loading="lazy"` que ya usa el resto del sitio, que
  igual pide la imagen si el panel es corto y entra en pantalla). Sin cambios de backend ni de
  esquema.
- Tests: pass — frontend **51/51** (2 nuevos en `PanelMapa.test.tsx`: el acordeón arranca cerrado
  sin ningún `<img>` en el DOM y sin el link al servicio; tras el clic aparecen ambos). `tsc` y
  `vite build` limpios. Verificado en producción tras el deploy: el chunk `Search-Cr3DpoDJ.js`
  servido por Cloudflare (mismo hash que el build local) contiene las dos ocurrencias esperadas de
  `aria-expanded` (ControlesMapa + la nueva) y la ruta `/servicio/` del `ServicioMiniCard`.
- Security: N/A — solo frontend, sin tocar `oficio_api` ni la base. Desplegado con
  `docker compose up -d --build oficio_web`, mismo criterio que el deploy anterior.
- Next: si en el futuro se agregan más secciones (fotos, reseñas), seguir el mismo patrón de
  acordeón cerrado antes de darlas por buenas sin preguntar el alcance.
- Blockers: ninguno. Sin verificación visual en navegador real (vps2 no tiene Chromium); se
  verificó con una previsualización aislada (artifact) con el mismo HTML/clases del componente.

## 2026-10-01 00:35 UTC — claude-code (vps2) — Marcadores del mapa: naranja claro/fuerte en vez de oscuro
- Changes (`851be6a`): Dariel, ya viéndolo en producción: "el color oscuro no ha quedado bien".
  `ink-700` fuera; los dos tipos pasan a naranja, diferenciados por intensidad —
  `brand-400` (claro) para un servicio suelto, `brand-600` (fuerte, sin cambio) para un negocio —
  en círculo, pin seleccionado y su insignia. Mismo archivo que las dos entradas anteriores
  (`MapaExplorar.tsx`); sin tocar backend ni esquema.
- Tests: pass — frontend 47/47 (el test de color actualizado a los tonos nuevos). `tsc` y
  `vite build` limpios. Verificado en producción: el chunk `MapaExplorar-CZocD7nj.js` servido por
  Cloudflare contiene `bg-brand-400`/`text-brand-400` y ningún rastro de `ink-700`.
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno. Mismo límite de siempre: sin navegador en vps2 para una verificación visual
  en vivo; este ajuste lo pidió Dariel tras verlo él mismo en producción.

## 2026-10-01 01:08 UTC — claude-code (vps2) — Ficha del mapa: portada, "Compartir" y acordeón de reseñas
- Changes (`cac6216`): Dariel pidió enriquecer la ficha del mapa con una captura de Google Maps de
  referencia; de ahí se tomó lo que aplica a Encuentrauno (no el resto: pedidos en línea y
  atributos de restaurante no existen en el modelo de datos, no se inventaron). Tres piezas sobre
  `FichaPunto.tsx`:
  1. **Portada arriba**: `CoverImage` con el mismo fallback al ícono de categoría que ya usa
     `ProviderProfile.tsx`. El botón de cerrar pasa a flotar en una posición absoluta fija (esquina
     superior derecha de toda la ficha) para no moverse según haya o no portada ni según el estado
     de carga; un esqueleto ocupa su lugar mientras llega la respuesta, para que el avatar/nombre
     de abajo no salten al aparecer la foto real.
  2. **"Compartir"** junto a «Ver perfil completo»: `navigator.share` si el dispositivo lo tiene
     (share nativo), o `navigator.clipboard.writeText` + aviso (`useToast`) si no.
  3. **Acordeón "Reseñas (N)"**: mismo patrón que el de Servicios de la entrada anterior — cerrado
     por defecto, sin petición aparte (`GET /providers/:id` ya trae `reviews` en la misma
     respuesta), muestra las 3 más recientes (`ReviewItem`, reusado de `ReviewList.tsx`) y enlaza
     a `/proveedor/:id#resenas` si hay más.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **53/53** (4 nuevos: reseñas en acordeón cerrado con enlace a verlas
  todas; compartir llama a `navigator.share` cuando existe y cae a `clipboard.writeText` cuando no;
  1 test de trampa de foco actualizado porque el último elemento tabulable de la hoja pasó a ser el
  botón «Compartir»). `tsc` y `vite build` limpios. Verificado en producción tras el deploy: el
  chunk `Search-CcEoSRa7.js` servido por Cloudflare contiene `navigator.share`, `Compartir` y
  `resenas`.
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno. Mismo límite de siempre (sin navegador en vps2); verificado antes con una
  previsualización aislada (artifact) con el mismo HTML/clases que el componente real.

## 2026-10-01 01:41 UTC — claude-code (vps2) — Hoja móvil del mapa: sube más, carga desde el toque, iconos de contacto e indicador de scroll
- Changes (`a07f57a`): Dariel reportó que en móvil la ficha "no se ve tan enriquecida" como en
  escritorio. Causa raíz: `HojaPunto.tsx` solo pedía el perfil (`expandida=true`) cuando el usuario
  desplegaba la hoja a pantalla casi completa ('abierta'); al tocar un punto, la hoja solo subía un
  30% de la pantalla ('asomada') sin pedir nada, mostrando apenas el nombre. Cuatro cambios:
  1. **`ALTO_ASOMADA_VH` 30→55**: cabe ya la portada y la cabecera sin arrastrar primero, dejando
     igual casi la mitad de la pantalla con el mapa visible.
  2. **`expandida` pasa a ser siempre `true`** mientras la hoja esté abierta (ya no depende de la
     posición 'asomada'/'abierta'): el perfil se pide desde que se toca el punto, como ya hacía el
     panel de escritorio — "asomada" es una vista real, no un simple avance.
  3. **Iconos de Llamar, WhatsApp y "Pedir cita"** (nuevo en el mapa, vía `BookingModal`,
     condicionado a `has_agenda`) junto a "Compartir", cada uno solo si el perfil lo ofrece de
     verdad; se quitan los botones grandes de WhatsApp/Llamar que quedaban más abajo (ahora
     duplicarían el acceso). `WhatsAppIcon` se exporta desde `ContactActions.tsx` para reusar el
     SVG sin copiarlo.
  4. **Indicador de "hay más abajo"**: degradado + flecha en el borde inferior de la hoja, que
     compara el alto REAL visible en pantalla (no el alto interno fijo del contenedor con
     scroll, que es siempre el de 'abierta' aunque esté 'asomada') contra el `scrollHeight` del
     contenido — aparece solo si de verdad hay algo oculto, y desaparece al llegar al final.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **56/56** (6 nuevos/actualizados: el perfil se pide sin desplegar del
  todo; los iconos de contacto aparecen condicionados a lo que ofrezca el perfil, o solo
  "Compartir" si no ofrece nada; el indicador de scroll aparece y desaparece simulando
  scrollHeight/scrollTop a mano — jsdom no hace layout real; los tests de la hoja ganaron
  `AuthProvider` porque `BookingModal` usa `useAuth`, con `configApi.get` mockeado igual que ya
  hace `Search.test.tsx` por la misma razón; guard de `ResizeObserver` añadido, mismo patrón que
  `MapaExplorar.tsx`, porque jsdom no lo implementa). `tsc` y `vite build` limpios. Verificado en
  producción: el chunk `Search-DPOW6nuv.js` contiene `hoja-contenido`, `hoja-indicador-mas` y
  "Pedir cita"; `ContactActions-ivvquobV.js` (nuevo chunk, code-splitting de Vite) sirve 200.
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno. Mismo límite de siempre (sin navegador en vps2); verificado antes con una
  previsualización aislada (artifact) comparando la vista "asomada" antes/después.

## 2026-10-01 01:57 UTC — claude-code (vps2) — Indicador de scroll desde el primer toque, y cerrar tocando el mapa vacío
- Changes (`e89d7c6`): dos ajustes pedidos por Dariel tras usar la entrega anterior.
  1. **Indicador de "hay más abajo" — bug de raíz corregido**: dependía de medir `scrollHeight`
     real (`ResizeObserver`); como el perfil carga asíncrono, en el PRIMER toque la medida llegaba
     tarde y el aviso no salía — recién aparecía al abrir un SEGUNDO punto, cuando el observer ya
     llevaba un rato activo. Reemplazado por una regla síncrona: `hayMasAbajo = posicion ===
     'asomada'` (`HojaPunto.tsx`). Se fue todo lo que dependía del DOM para esto —
     `ResizeObserver`, el listener de `scroll`, `contenidoRef`, `ALTO_ASA_PX`—: ya no hace falta
     medir nada, así que sale desde el instante en que se abre un punto, sin esperar al perfil.
  2. **Tocar el mapa donde no hay ningún punto cierra la ficha o lista abierta** (como en Google
     Maps), igual que el botón «Cerrar»: nuevo evento `click` en `useMapEvents` (`Eventos`,
     `MapaExplorar.tsx`) que llama a `onCerrarPanel` (la misma `cerrarPanel` de
     `ExplorarMapa.tsx` que ya usa el botón «Cerrar»). Leaflet no deja que este clic llegue si fue
     sobre un `Marker` o un `Circle` — esas capas detienen la propagación por su cuenta —, así que
     no hace falta ninguna comprobación extra para no cerrar la ficha que se acaba de abrir.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **57/57** (3 nuevos/actualizados: el indicador aparece ya "asomada" y
  desaparece al desplegar la hoja del todo —sin simular scrollHeight a mano, ya no hace falta—;
  tocar el `.leaflet-container` con una ficha abierta la cierra). `tsc` y `vite build` limpios.
  Verificado en producción: el chunk `MapaExplorar-Bc_5ioJr.js` servido por Cloudflare contiene
  `onClicVacio` (su definición y su uso).
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno. Mismo límite de siempre (sin navegador en vps2 para probarlo en vivo).

## 2026-10-01 02:18 UTC — claude-code (vps2) — Banner móvil que se recoge a un círculo con el logo al bajar
- Changes (`641f18c`): Dariel pidió el patrón clásico de app móvil — el header se recoge al bajar
  la página y vuelve a desplegarse al subir. Alcance acotado con él antes de implementar: todo el
  sitio en móvil (Home, Explorar en lista, perfiles, dashboard…), no la vista de mapa, que no tiene
  scroll de página propio (el body queda fijo a pantalla completa ahí).
  - Dos hooks nuevos en `hooks/`: `useDireccionScroll` (compara `window.scrollY` contra el último
    valor, con un umbral de 10px contra el jitter de scroll y sin activarse hasta los primeros
    48px — nadie espera que se recoja apenas se empieza a leer) y `useEsMovil` (breakpoint `md`,
    768px — el que ya separa el header móvil del de escritorio en este mismo archivo; distinto del
    `usarEsEscritorio` del mapa, que corta en 1024px por otra razón de layout).
  - `Layout.tsx`: con el banner recogido, el `<header>` pierde fondo y borde (se vuelve
    transparente), el nav y los botones de la derecha se desvanecen con `opacity-0` +
    `pointer-events-none` + `aria-hidden` + `inert` (para que no queden alcanzables por teclado
    mientras están invisibles — el anti-patrón que WCAG marca si solo se pone `aria-hidden`), y el
    logo pierde el texto "Encuentrauno" quedando solo el glifo dentro de un círculo con fondo,
    borde y sombra. `inert` todavía no está en los tipos de `@types/react` 18: va con un cast
    acotado, no con `any` suelto.
  - `ui.tsx`: `Logo` gana un prop `soloIcono` que omite el wordmark, para ese estado colapsado.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **61/61** (4 nuevos en `Layout.test.tsx`: se recoge al bajar y se
  despliega al subir —simulando `scrollY` y el evento `scroll` a mano, con un frame de
  `requestAnimationFrame` de margen porque el hook lo debounea—; no se recoge cerca del tope de la
  página aunque el delta diera "bajando"; no se recoge en escritorio; no se recoge en la vista de
  mapa). `tsc` y `vite build` limpios. Verificado en producción: el chunk `index-Dp-5xg0t.js`
  servido por Cloudflare contiene `soloIcono` y `banner-resto` (el `data-testid` del contenedor que
  se desvanece).
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno. Mismo límite de siempre (sin navegador en vps2); verificado antes con una
  previsualización interactiva (artifact) que reproduce el mismo trazado del logo y los mismos
  umbrales de scroll, scrolleable de verdad dentro de un teléfono simulado.

## 2026-10-01 02:22 UTC — claude-code (vps2) — La barra inferior también se oculta al recoger el banner
- Changes (`d74552b`): Dariel pidió que la barra inferior traslúcida (`MobileTabBar`,
  `bg-white/95 backdrop-blur`) se oculte junto con el banner superior, no solo este último.
  `MobileTabBar` gana una prop `oculta` (= `bannerRecogido`, el mismo booleano del header): se
  desliza fuera de la pantalla con `translate-y-full` y la misma transición de 300ms, con
  `inert` + `aria-hidden` igual que ya lleva el contenido que se desvanece en el header — mismo
  criterio en los dos sitios: oculto de verdad, no solo invisible y alcanzable con Tab.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **62/62** (1 nuevo: la barra inferior pasa a `aria-hidden="true"` al
  recoger el banner y vuelve a `"false"` al desplegarlo). `tsc` y `vite build` limpios. Verificado
  en producción: el chunk `index-NnaRdrzP.js` servido por Cloudflare contiene `translate-y-full`.
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno.

## 2026-10-01 02:28 UTC — claude-code (vps2) — Sin rastro de desenfoque en la barra superior recogida
- Changes (`e5d6f81`): Dariel pidió que la barra superior "igualmente desaparezca" tras ver el
  resultado — aclarado con él que el círculo del logo se queda (eso no cambia), pero no debía
  quedar ningún resto visual de la barra alrededor. Bug encontrado: `backdrop-blur-md` estaba fuera
  del condicional en `Layout.tsx`, aplicado siempre — con fondo transparente pero el desenfoque
  puesto, la franja de 64 px donde flota el círculo seguía difuminando el contenido que pasaba por
  debajo al hacer scroll, un rastro de "barra" tan visible como el color de fondo. Ahora pasa a
  `backdrop-blur-none` junto con `bg-transparent` cuando el banner está recogido.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **63/63** (1 nuevo: el header pierde `backdrop-blur-md` y gana
  `backdrop-blur-none` al recogerse). Al escribirlo salió un bug de aislamiento en
  `Layout.test.tsx` ya existente desde la entrega anterior: `window.scrollY` es una propiedad
  global que no se resetea sola entre pruebas, así que un test que dejaba la página en cierto
  scroll contaminaba el `ultimoY` inicial del siguiente cuando ambos usaban el mismo número —
  corregido con un reset a 0 en el `beforeEach`. `tsc` y `vite build` limpios. Verificado en
  producción: el chunk `index-CQu58XdW.js` servido por Cloudflare contiene `backdrop-blur-none`.
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno.

## 2026-10-01 02:44 UTC — claude-code (vps2) — En el mapa (móvil) el banner aparece siempre recogido
- Changes (`c9a078c`): Dariel pidió invertir la regla anterior — hasta ahora el banner NUNCA se
  recogía en la vista de mapa (se excluía a propósito, ver entradas previas); ahora, en móvil, se
  queda SIEMPRE como círculo ahí, sin depender de scroll (el mapa no tiene scroll de página: está
  fijo a pantalla completa). Le deja más alto útil al mapa, que ya trae sus propios controles
  flotantes (`ControlesMapa.tsx`).
  La barra inferior NO sigue esta regla nueva: se queda visible en el mapa — ahí ES la única
  navegación disponible, decisión ya documentada en el código desde antes de esta serie de
  cambios. Antes una sola variable (`bannerRecogido`) gobernaba el header y la barra inferior; se
  separó en dos (`bannerRecogido` / `tabBarOculta`) para que esta regla nueva del header no
  arrastrara a la barra inferior sin querer.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **64/64** (el test de mapa se invirtió para reflejar la regla nueva — el
  banner arranca recogido de entrada, la barra inferior se queda visible —, y se sumó uno para
  escritorio en el mapa, donde no aplica nada de esto). `tsc` y `vite build` limpios. Verificado en
  producción: el hash del chunk `index-CkvX69FZ.js` servido por Cloudflare coincide exactamente
  con el del build local que ya incluía el cambio (los nombres de variable no sobreviven la
  minificación, así que el hash de contenido es la prueba fiable aquí).
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno.

## 2026-10-01 02:54 UTC — claude-code (vps2) — En el mapa (móvil) el header desaparece del todo
- Changes (`aa8577d`): la entrega anterior dejó el círculo del logo visible en el mapa móvil,
  siguiendo al pie de la letra lo que Dariel había pedido — pero al verlo, seguía percibiendo "la
  barra detrás del círculo". La causa real: la tarjeta de búsqueda de `ControlesMapa.tsx` flota
  justo debajo del header, con su propio fondo blanco translúcido (`bg-white/95 backdrop-blur`,
  sin relación con el header de `Layout.tsx`) — el conjunto círculo + esa tarjeta se leía como "una
  barra con un logo encima", aunque el header en sí ya no tuviera ni fondo ni desenfoque.
  Nueva variable `bannerOculto` (`esMovil && enMapa`): el `<header>` entero deja de renderizarse
  ahí —no solo pierde apariencia, sale del documento—, así que el mapa (y la tarjeta de
  `ControlesMapa`) suben a ocupar también esos 64 px, sin nada arriba que se pueda confundir con
  una barra. `bannerRecogido` (el círculo, por scroll) vuelve a aplicar solo al resto del sitio. La
  barra inferior no sigue esta regla nueva — en el mapa sigue siendo la única navegación, así que
  su condición (`tabBarOculta`) vuelve a ser la misma que `bannerRecogido`, no `bannerOculto`.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **64/64** (el test de mapa se reescribió: ya no comprueba que el header
  esté "recogido" sino que `getByRole('banner')` no exista en absoluto; se agregó el caso de
  escritorio en el mapa, donde el header se queda igual que siempre). `tsc` y `vite build`
  limpios. Verificado en producción: el hash del chunk `index-CutFRM06.js` servido por Cloudflare
  coincide exactamente con el del build local.
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno.

## 2026-10-01 02:58 UTC — claude-code (vps2) — La calificación y las reseñas van al final de la ficha del mapa
- Changes (`0a1afb3`): Dariel pidió reordenar la ficha del mapa para que las reseñas queden al
  final, abajo del todo. El acordeón `SeccionResenas` ya estaba ahí, pero el resumen de estrellas
  (`RatingInline`, "★ 4.6 (12)") abría la ficha desde antes incluso de la descripción — la misma
  información ("lo que dicen los demás") estaba partida en dos lugares opuestos del orden. Se movió
  `RatingInline` de arriba del todo a justo antes de `SeccionResenas`, después de `SeccionServicios`
  — orden final: descripción → lugar → horario → categorías → Servicios → calificación + Reseñas.
  Sin cambios de backend ni de esquema.
- Tests: pass — frontend **65/65** (1 nuevo: compara posiciones en el HTML renderizado —
  descripción antes que "Servicios", "Servicios" antes que la calificación— para fijar el orden
  nuevo y que no se repita accidentalmente). `tsc` y `vite build` limpios. Verificado en
  producción: el chunk `Search-BQBFYCSN.js` servido por Cloudflare tiene el mismo hash que el
  build local.
- Security: N/A — solo frontend. Desplegado con `docker compose up -d --build oficio_web`.
- Next: ninguno.
- Blockers: ninguno.

## 2026-10-01 03:10 UTC — claude-code (vps2) — Catálogo demo para seis proveedores que se quedaron sin productos
- Changes (`0bcb91c`): Dariel pidió poblar más datos demo para poder buscar productos. Causa de
  que `catalog_items` estuviera en 0 en producción pese a que `seedDemo()` ya sembraba catálogo
  (ElectroHogar y Dulces La Abuela, entrega del 26-sep): ese código se agregó DESPUÉS de que la
  base de producción ya existiera, y el guardián de `seedDemo()` (mira solo si `cliente@demo.com`
  ya está) nunca lo deja correr de nuevo sobre una base ya sembrada.
  `seedCatalogoDemo()` (`backend/src/db/seed-catalogo-demo.ts`) complementa a `seedDemo()` para
  bases ya sembradas: busca cada proveedor demo por email, se salta el que ya tenga algún artículo
  (idempotente — no toca ElectroHogar ni Dulces), y le agrega catálogo a los otros seis que
  tenían plan con cupo (básico o pro) pero ningún producto: Carpintería Hermanos Díaz (6),
  Clima Frío Express (5), Estudio de Belleza Yami (5), Mecánica El Tinajón (6), Pinturas Colonial
  Trinidad (5), Mudanzas Vueltabajo (5) — 32 artículos nuevos, con fotos reusando las que ya
  existen en `frontend/public/demo/`. Mismo centinela que `seedMapa()`: exige `DEMO_MODE=true`.
  CLI nuevo `npm run seed:catalogo` (`seed-catalogo-demo-cli.ts`), mismo patrón que
  `seed-mapa-cli.ts`. Sin cambios de esquema.
- Tests: pass — backend **271/271** (4 nuevos para `seedCatalogoDemo`: se salta sin fallar si
  `seedDemo()` no corrió antes; se niega sin `DEMO_MODE`; crea los seis catálogos sin duplicar los
  dos ya existentes; idempotente en una segunda corrida), corridos contra una base Postgres
  temporal y aislada, no la de producción. Probado también contra una COPIA restaurada del backup
  de producción antes de tocar la real: 32 creados, conteos de usuarios/perfiles intactos
  (319/312), sin filas huérfanas, segunda corrida 0 creados.
- Security: sin cambios de red, auth ni esquema — solo datos, y con el mismo guardián de
  `DEMO_MODE=true` que ya protege `seedMapa()`. Backup (`data/oficios-2026-10-01-0309-pre-seed-
  catalogo.dump`) antes de tocar la base real.
- Completado en producción: `docker compose up -d --build oficio_api` (y recreado
  `oficio_notifier`, misma imagen, para que ambos corran el mismo código) →
  `docker exec oficio_api node dist/db/seed-catalogo-demo-cli.js` → 32 creados, mismo resultado que
  la copia de prueba, conteos de usuarios/perfiles intactos, sin filas huérfanas. Verificado de
  punta a punta: `GET /api/catalog/search?q=pintura` y `?q=batería` devuelven los artículos
  nuevos con su proveedor correcto; la foto `/demo/pintura-1.webp` sirve 200; `GET /api/mapa?
  tab=productos` pasó de 0 a 7 puntos.
- Next: ninguno.
- Blockers: ninguno. Commits sin pushear a `github.com/doniet/oficio` junto con el resto de la
  serie de esta sesión.

## 2026-10-01 03:30 — claude-code (vps2) — Mapa: si la búsqueda no tiene resultados en la zona, salta a donde sí los hay
- Changes: `usarMapa.ts` — cuando una búsqueda de texto vuelve con 0 puntos en la zona visible,
  pregunta UNA vez por el bbox de Cuba entera con el mismo término (`buscarEnTodaCuba`); si
  aparece algo, expone sus coordenadas como `sugerencia`. Un `intentadaRef` evita repetir esa
  pregunta en cada arrastre/zoom mientras el término no cambie, y se reinicia (junto con la
  sugerencia) al cambiar pestaña, texto o categoría. `MapaExplorar.tsx` reacciona a `sugerencia`
  con `flyTo` al mismo zoom/duración que usa «Cerca de mí» (13, 0.8 s). Silencioso si la petición a
  toda Cuba falla: se queda el "sin resultados" normal.
- Tests: pass — frontend **69/69** (4 nuevos en `usarMapa.test.ts`: pregunta por toda Cuba y guarda
  la sugerencia; no repite la pregunta en movimientos siguientes del mismo término; cambiar el
  término limpia la sugerencia y permite un nuevo intento; el `flyTo` del mapa real se llama con
  las coordenadas correctas). `tsc --noEmit` y `vite build` limpios.
- Security: sin cambios de superficie — mismo endpoint `/api/mapa`, ya público, con un bbox más
  grande en vez de uno nuevo.
- Completado en producción: `docker compose up -d --build oficio_web` → verificado por hash de
  contenido: el chunk `MapaExplorar-DqwdRRPB.js` del build local (con este cambio) responde 200 en
  `oficio.dardoit.com`.
- Next: ninguno.
- Blockers: ninguno. Commits sin pushear a `github.com/doniet/oficio` junto con el resto de la
  serie de esta sesión.

## 2026-10-01 03:37 — claude-code (vps2) — Mapa: botón «Yo» y atribución fundida con el mar
- Changes: el botón «Cerca de mí» de `MapaExplorar.tsx` pasa a decir «Yo» (mismo icono y
  comportamiento). La atribución de Leaflet (obligatoria por licencia) sigue en el DOM pero su
  fondo y su texto pasan al mismo tono — `#c6ced0`, resultado de pasar el azul real del mar de la
  tesela de OpenStreetMap (`#aad3df`, muestreado de una tesela real) por el MISMO filtro CSS que ya
  desatura el mapa (`saturate(0.22) brightness(1.1) contrast(0.8)`, aplicado con la fórmula de la
  spec de CSS Filter Effects) — así deja de desentonar como rectángulo blanco sobre el mar
  desaturado. Acotado a `.region-mapa` (el mapa grande de Explorar): los mapas pequeños (selector
  de provincia, recoger punto), que no llevan ese filtro, conservan la atribución blanca normal de
  Leaflet.
- Tests: pass — frontend **69/69** (los 2 que mencionaban el texto del botón, actualizados al nuevo
  nombre). `tsc --noEmit` y `vite build` limpios.
- Security: sin cambios de superficie. La atribución de OpenStreetMap/Leaflet sigue presente en el
  DOM (requisito de licencia), solo deja de llamar la atención visualmente.
- Completado en producción: `docker compose up -d --build oficio_web` → verificado por hash de
  contenido: `index-BifouhJS.js` (con este cambio) es el que sirve `oficio.dardoit.com`.
- Next: ninguno.
- Blockers: ninguno. Commits sin pushear a `github.com/doniet/oficio` junto con el resto de la
  serie de esta sesión.

## 2026-10-01 03:47 — claude-code (vps2) — En Productos, la ficha del mapa muestra el catálogo filtrado
- Changes: al tocar un punto con la pestaña Productos activa, debajo de «Ver perfil completo» se
  ve el catálogo de ESE proveedor filtrado por el mismo texto de búsqueda (`GET /catalog/provider/
  :id?q=`), en vez de la sección Servicios — el punto solo está en el mapa porque algún artículo
  suyo ya coincidió, filtrado por el servidor en `/api/mapa`. Sin acordeón: se enseña de una vez
  (es justo lo que se tocó el punto para ver), con las fotos en carga perezosa igual que el resto
  de la ficha. Tocar un artículo abre `CatalogItemModal`, el mismo detalle-con-contacto que ya usa
  la búsqueda general. Antirrebote propio de 300 ms en `FichaPunto.tsx`: si seguís escribiendo con
  la ficha abierta, no pide el catálogo en cada tecla. `tab`/`q` se enhebran `ExplorarMapa` →
  `PanelMapa` → `FichaPunto` (nuevos en los dos intermedios, opcionales con valor por defecto para
  no romper los montajes de prueba existentes).
- Tests: pass — frontend **76/76** (8 nuevos en `PanelMapa.test.tsx`: el catálogo filtrado
  reemplaza a Servicios; sin `q` pide el catálogo completo; mensaje si no hay coincidencias;
  «Reintentar» tras un fallo; enlace «Ver los N productos» cuando hay más de 6; tocar un artículo
  abre su detalle con el contacto correcto; escribir no dispara una petición por tecla. 2 archivos
  de test existentes (`ExplorarMapa.test.tsx`, el caso «lista de celda» de `PanelMapa.test.tsx`)
  necesitaron `AuthProvider` + mock de `configApi.get`, igual que ya hacía el resto del archivo:
  `CatalogItemModal` llama a `useAuth()` sin condición al montar, igual que `BookingModal`).
  `tsc --noEmit` y `vite build` limpios.
- Security: sin cambios de superficie — mismo endpoint `/catalog/provider/:id` ya público, pedido
  desde un sitio nuevo del frontend.
- Completado en producción: `docker compose up -d --build oficio_web` → verificado por hash de
  contenido: `index-DdnOj9_U.js` (con este cambio) es el que sirve `oficio.dardoit.com`.
- Next: ninguno.
- Blockers: ninguno. Commits sin pushear a `github.com/doniet/oficio` junto con el resto de la
  serie de esta sesión.

## 2026-10-01 22:26 — claude-code (vps2) — El mapa de la app alcanza a la web (sub-proyecto 1 de la 0.2.5)
- Changes (`f5f29fd..0c4b248`, 14 commits, 14 archivos, todos dentro de `oficios-cuba/mobile/`):
  el mapa de la app (Explorar) llega a la paridad de conducta que ya tenía el mapa web. `cargarCelda`
  pide los negocios de una celda «+N» y recuerda el bbox pintado para que la lista coincida con lo
  que se tocó. El Atrás de la hoja pasa a tener tres estados reales (cierra la hoja / vuelve a la
  lista / no hace nada) en vez de uno binario — `FichaPunto` se separó del envoltorio `HojaPunto`
  para que la hoja elija contenido (ficha sola, lista, o ficha-tras-lista) sin duplicar el cierre.
  Los pines dejan de colorearse por plan (pro/básico/gratis) y pasan a colorear por tipo (negocio u
  oficio), tabla única en `lib/pines.ts` con el par relleno+glifo ya validado por contraste. El punto
  con la ficha abierta se dibuja como gota con la punta en su coordenada (el cálculo de altura del
  envoltorio se corrigió de 52 a 46 a mitad de la tarea: la cola rotada 45° no llega más abajo que
  eso). Si una búsqueda de texto no tiene nada en la zona visible pero sí en otra provincia, el mapa
  pregunta una vez por toda Cuba y, si aparece algo, vuela hasta allí (`flyTo`, mismo zoom/duración
  que «Cerca de mí»); una guarda (`intentada`) evita repetir la pregunta en cada arrastre mientras el
  término no cambie. Divergencia deliberada frente a la web: en la app, tocar una celda que resuelve
  en un solo negocio abre su ficha directamente, donde la web muestra una lista de un elemento.
- Tests: pass — app **79/79** en 9 suites (línea base 47/7 + 32 nuevas de este plan); `tsc --noEmit`
  limpio.
- Security: sin cambios de superficie — ningún archivo fuera de `oficios-cuba/mobile/`, sin tocar
  backend ni esquema. La app llama a `/api/mapa`, `/api/mapa/celda` y `/api/providers/:id`. De esos,
  el único que no consumía antes es **`GET /api/mapa/celda`**, que ya existía, es público y usa el
  mismo filtro de visibles que `/api/mapa`: ningún endpoint nuevo.
- Pendiente de verificar en un teléfono real (y por qué no se hizo aquí): el recorrido completo de
  los 9 puntos del plan sigue SIN caminarse — no es un recorte, es que este host (vps2) no tiene con
  qué: falta `oficios-cuba/mobile/android/` (proyecto Expo gestionado, nunca prebuilt en vps2), falta
  el keystore de `~/.claude/.oficio-firma`, no hay SDK de Android instalado y no hay `adb`. No se vio
  nada en pantalla y no se afirma lo contrario. En particular queda sin la verificación empírica que
  el punto 9 del recorrido pedía a propósito: que un pinch-zoom cruce siempre `UMBRAL_ZOOM = 0.05`
  (recarga a 250 ms) y que la inercia de un arrastre nunca lo cruce sola (recarga a 500 ms) — ese
  valor sigue anotado en el código como «empírico sin verificar en hardware real». Pendientes también
  de una decisión visual de Dariel, ambas de accesibilidad: el icono de tipo en la fila de
  `ListaCelda` usa `brand[400]` como glifo suelto sobre fondo claro (≈2,2:1, por debajo del 3:1 que
  pide WCAG para un elemento gráfico — el único indicador de tipo en esa fila); y la lista de error
  de un solo negocio se anuncia «1 negocio aquí» mientras su cuerpo muestra un fallo. Checklist
  completo para quien lo camine con un dispositivo real en
  `docs/superpowers/2026-10-01-mapa-app-paridad-pendiente-dispositivo.md`.
- Next: sub-proyecto 2 (ficha, catálogo, reseñas, Compartir, portada, pantalla proveedor/[id]) sigue
  sin empezar. Después de eso, compilar y publicar la 0.2.5.
- Blockers: ninguno de código. La **0.2.5 no está compilada ni publicada** — esta tarea no generó
  ningún APK.

## 2026-10-01 — claude-code (vps2) — Ola de arreglos de la revisión final de `mapa-app-paridad`
- Changes: cuatro arreglos Important y tres menores, todos de la revisión de rama completa.
  (1) `mobile/src/lib/mapa.ts`: cambiar pestaña/texto/categoría ahora aborta la pregunta por toda
  Cuba — su respuesta tardía fijaba `sugerencia` del término abandonado y el mapa volaba lejos de los
  resultados que el usuario sí veía. (2) Mismo archivo: `pedirCelda` era la única petición de la app
  sin tiempo de espera; una conexión colgada dejaba la promesa sin asentarse y tocar un «+N» no hacía
  NADA — ahora rechaza a los 20 s (misma constante `TIEMPO_ESPERA_MS` y mismo patrón que `cargar()`)
  y cae en el camino de error que ya abre la lista con «Reintentar»; el abandono por segundo toque
  sigue resolviendo vacío y en silencio. (3) `MapaExplorar.tsx`: la selección se prueba DENTRO de la
  rama no-zona, así que un punto aproximado con la ficha abierta sigue siendo área y no pasa a gota
  anclada en coordenada exacta (el plan pedía lo contrario; manda el spec, que habla de sustituir el
  círculo, nunca el área). (4) `HojaPunto.tsx`: la lista de error ya no se anuncia «1 negocio en esta
  zona» sobre un fallo. Menores: `tab` en las deps del efecto del token de celda; la línea de Security
  de la entrada anterior corregida (la app llama a `/api/mapa`, `/api/mapa/celda` y `/api/providers/:id`
  — el estreno es `/api/mapa/celda`, no `/catalog/provider/:id`, que es de la web); y el checklist de
  dispositivo, cuyo comando de compilación entraba en `mobile/android/` sin crearla (ahora lleva el
  prebuild y apunta a la skill `oficio-apk-release-publicar`) y cuyo punto del control «volver a la
  lista» sube a la sección de decisiones con el dato que lo hace decidible (la web sí lo pinta,
  `frontend/src/components/mapa/FichaPunto.tsx:359`). Ese control NO se implementó: es decisión de Dariel.
- Tests: pass — **81/81** en 9 suites (79 antes; las 2 nuevas cubren los arreglos 1 y 2 y se
  comprobaron en rojo quitando cada arreglo). `tsc --noEmit` limpio. Los arreglos 3, 4 y 5 son de
  componentes, que este proyecto no renderiza en pruebas: verificados leyendo.
- Security: sin cambios de superficie. Ningún archivo de código fuera de `oficios-cuba/mobile/`,
  ninguna dependencia nueva, ningún endpoint nuevo.
- Next: el control visible «volver a la lista» y el contraste del icono de `ListaCelda` esperan
  decisión de Dariel (sección B del checklist de dispositivo); el recorrido de 9 puntos sigue sin
  caminarse en un Android real. Sub-proyecto 2 de la 0.2.5 sin empezar.
- Blockers: ninguno.

## 2026-10-02 02:55 — claude-code (vps2) — Sub-proyecto 2 verificado en emulador, 0.2.5 compilada (sin publicar)
- Changes: se retomó el sub-proyecto 2 (ficha del proveedor en la app), que anoche quedó con el
  código completo pero **sin la verificación visual**: la sesión se cortó seis minutos después de
  instalar el APK de prueba y no llegó a mirarse ni una pantalla. Se caminó el recorrido entero en
  el emulador `emulator-5556` de j-u contra producción (`oficio.dardoit.com`), con datos reales.
  Salió **un defecto**, arreglado en `66e4889`: la galería «Fotos de mis trabajos» del perfil se
  pintaba como un hueco en blanco. `galeriaFoto` era el único de los seis `aspectRatio` de la app
  montado sobre un ancho en porcentaje, y además en un hijo directo de `flexDirection:'row'`;
  juntos en el mismo nodo la caja se medía bien pero no pintaba nada — ni la foto, ni el 📷 de
  respaldo, ni su propio fondo. Medido sobre «Pinturas Colonial Trinidad» (dos fotos que responden
  200): los 996×314 px de la sección daban 100 % blanco puro y cero nodos de vista. El reparto pasa
  a dos nodos — el porcentaje en el hijo de la fila, la proporción en una caja interna al 100 % —
  que es lo que ya hacía la rejilla del catálogo de esa misma pantalla y lo que hacen los otros
  cinco `aspectRatio`. Tras el arreglo, en el build publicable: dos `ImageView` de 313×313 px en sus
  coordenadas exactas y la franja baja de 100 % a 37,5 % de blanco (el hueco del tercer sitio).
  Después, `0774ec5` sube a **0.2.5 / versionCode 8**.
- Tests: pass — app **133/133** en 13 suites, `shared` **24/24** en 3, `tsc --noEmit` limpio.
  Verificación en emulador (10 comprobaciones, todas con captura mirada): el arreglo crítico del
  Atrás de anoche (mapa → hoja → perfil → Atrás devuelve al mapa con la hoja viva) ✅; perfil con
  datos reales ✅; catálogo con filtros y precios CUP + USD ✅; modal de artículo ✅; reseñas del
  perfil con la distribución 5→1 ✅; acordeón «Reseñas (3)» en la hoja del mapa, que no se monta
  hasta abrirlo y no aparece con `review_count = 0` ✅; zonas de servicio agrupadas por provincia ✅;
  servicio → perfil → Atrás ✅; Compartir y su cancelación ✅; galería ✅ (tras el arreglo).
  Artefacto `dist/oficios-cuba-0.2.5.apk`: versionCode 8, `arm64-v8a`+`armeabi-v7a`, firma
  `111a8cec…` (la definitiva), 0 permisos `SYSTEM_ALERT`/`BOOT_COMPLETED`, 84 490 913 B,
  sha256 `c6867d1807c392cb9459f9cac17f38fc80a44f6703bb09534225d2fd071bfedf`.
- Security: sin cambios de superficie. Ningún archivo fuera de `oficios-cuba/mobile/`, ninguna
  dependencia nueva, ningún endpoint nuevo. El emulador dibuja por software y no reproduce fallos de
  GPU: el arreglo es de reparto de cajas, no de pintado por GPU, pero conviene una mirada en un
  teléfono real al publicar.
- Next: **la 0.2.5 está compilada y verificada pero NO publicada** — `scripts/publicar-apk.sh` lo
  bloqueó el clasificador de modo auto por ser un despliegue a producción, y queda pendiente del OK
  de Dariel. Con ese OK: publicar, fusionar `app-ficha-proveedor` en `master` (21+3 commits, avance
  limpio) y empujar. Siguen pendientes de decisión visual de Dariel, del sub-proyecto 1: el control
  visible «volver a la lista» y el contraste del icono de `ListaCelda`.
- Blockers: el permiso para publicar. Nada de código.

## 2026-10-02 03:00 — claude-code (vps2) — 0.2.5 publicada y rama fusionada
- Changes: con el OK de Dariel se cerró lo que la entrada anterior dejó pendiente. `publicar-apk.sh`
  subió `oficios-cuba-0.2.5.apk` a `~/docker/oficio/oficios-cuba/descargas` y escribió `android.json`;
  el script retiró la 0.2.4, como hace siempre. `app-ficha-proveedor` entró en `master` por avance
  limpio (`8be23c3..cdf3b62`, 24 commits, árbol idéntico al de la rama) y se empujó.
- Tests: pass — verificado desde Internet por Cloudflare: `android.json` anuncia 0.2.5,
  `HTTP/2 200` y `content-type: application/vnd.android.package-archive` en el APK,
  `oficios-cuba-0.2.4.apk` ya da 404, y `GET /api/app/descargar` redirige 302. El APK descargado
  desde la URL pública tiene sha256 `c6867d18…`, idéntico al del artefacto compilado: lo que sirve
  Cloudflare es byte a byte lo que se probó en el emulador.
- Security: sin cambios de superficie. No se tocó `.env`, ni el túnel, ni Traefik, ni `DEMO_MODE`.
- Next: el arreglo de la galería se verificó en un emulador, que dibuja por software — conviene una
  mirada en un teléfono real, aunque sea un cambio de reparto de cajas y no de pintado por GPU.
  Siguen pendientes de decisión visual de Dariel, del sub-proyecto 1: el control visible «volver a
  la lista» y el contraste del icono de `ListaCelda`.
- Blockers: ninguno.

## 2026-10-07 19:30 — claude-code (vps2) — Catálogo de DardoVentas, lado Encuentrauno
- Changes: rama `dardoventas-catalogo`, 9 tareas.
  1. Migraciones incrementales y la v2 (`db/migraciones.ts`, `db/migrar.ts`): columnas `dardoventas_*`, `origen`/`uid_externo` en `catalog_items`, tabla `dardoventas_canjes`.
  2. Límites de plan sin `JWT_SECRET`, plan Profesional regalado y desvincular (`db/dardoventas.ts`, `db/limite-plan.ts`, `planes.ts`).
  3. Lo importado no se edita (403) ni se convierte de moneda (`routes/catalog.ts`; `shared/src/formato.ts`, `frontend/src/lib/format.ts`).
  4. Sincronizador en el notificador con `If-None-Match` y a prueba de fallos y cuerpos hostiles (`notifier/dardoventas.ts`).
  5. Vincular: la API apunta el código y el notificador lo canjea (`routes/dardoventas.ts`, `notifier/index.ts`).
  6. Fotos por proxy con caché acotada, TLS verificado y cabeceras del otro lado contenidas (`frontend/nginx.conf`, `frontend/test-nginx/`).
  7. Web: `/vincular/dardoventas`, bloque «Conectado con DardoVentas» y catálogo importado de solo lectura; el registro conserva el destino (`frontend/src/pages/`, `components/catalog/admin/EstadoDardoVentas.tsx`).
  8. Revisiones y correcciones de las anteriores (`af62c75`, `c4f4ec0`, `57c04dd`, `31e6326`).
  9. Esta entrega: variables y montaje del notificador en `docker-compose.yml` y `.env.example`; doble ejecutable del contrato `backend/src/scripts/doble-dardoventas.ts` (`npm run doble:dardoventas`, puerto 4100; foto JPEG de 48×48 generada y comprobada con `file`); `CLAUDE.md`.
- Tests: pass. Backend 336/336 (37 archivos, con el envoltorio de base efímera), web 92/92, shared 26/26, `fotos.sh` «Todo bien» (32 comprobaciones), `tsc --noEmit` en backend, web, shared y mobile sin errores, `npm run build` de backend y web, `docker compose config -q` OK. Aviso: en 2 de 4 corridas del backend Vitest reportó 2–3 «Unhandled Errors» (`terminating connection due to administrator command`, `57P01`, atribuidos a `test/mapa.test.ts`) sin ningún test fallido: es el `DROP DATABASE … WITH (FORCE)` de `test/setup.ts` matando una conexión ociosa del pool; no es de esta rama y no se tocó.
  Recorrido local de punta a punta (doble en :4100, API :3011 con `DEMO_MODE`, notificador, vite :5177, Chromium en Docker, base `oficio_dv_dev` aparte; todo parado y la base borrada al final). VISTO en captura (salvo lo marcado «observado en la base / en el log»): abrir `/vincular/dardoventas?code=demo-recorrido-000000001` sin sesión lleva a `/registro?tipo=provider&next=…` (la URL se comprobó; la captura 01 pilló solo el cargador) · crear la cuenta de negocio con contraseña devuelve a la página de vínculo · «Conectar mi catálogo» termina en `/dashboard/perfil` con el aviso «¡Catálogo conectado!…» (visto en captura; observado en la base / en el log: el canje respondió 202 y el estado `ok`, el perfil quedó `pro` hasta 2027-03-31, y el log del notificador dijo `DardoVentas: canje activo, plan regalado hasta 2027-03-31`) · `/dashboard/catalogo`: «Conectado con DardoVentas · 3 artículos», los tres con «De DardoVentas», ni Editar ni Borrar (visto en captura; el conteo de 0 botones se obtuvo del DOM, no de la captura), «Malta» `365 CUP` sin «≈», «Pan con croqueta» «A consultar» · ficha pública `/proveedor/<id>`: «Catálogo (3)», Pan con «Agotado», la foto del café se pide a `/ext/dv/foto/dobleDardoVentas0001/cafe.jpg?v=1` y se ve rota, como se esperaba: Vite no tiene ese proxy (devuelve el HTML de la SPA) · baja: con `/tmp/doble-dv-baja` y `dardoventas_synced_at` 31 min atrás, observado en la base: en ~21 s el notificador desvinculó (`dardoventas_slug` NULL, `show_on_map` pasó de `true` a `false`, 0 artículos importados); visto en captura 08: `/dashboard/catalogo` vacío y sin el bloque. El doble también se comprobó con curl: 401 sin secreto, 404 con código corto, 200 con código válido, 409 al reusarlo, 304 con `If-None-Match`, foto JPEG 48×48, 301 a `?v=1` con una `v` vieja y 404 con un uid desconocido.
  NO VERIFICADO: la foto del café pintada de verdad (solo en nginx; la cubre `fotos.sh`, no el navegador) · el recorrido en la app móvil · el negocio en el mapa público (el perfil de prueba no tenía ubicación; `show_on_map` se puso a mano para ver el cambio al caer en baja) · el `Agotado` en el panel del proveedor: el panel no lo muestra para lo importado (el interruptor Disponible/Agotado se oculta con «Se cambia desde tu punto de venta»), solo la ficha pública · el endpoint real de DardoVentas, que no existe todavía.
- Security: puertos nuevos ninguno. Ruta pública nueva `/ext/dv/foto/` (regex del slug/uid + destino fijo `ventas.dardoit.com` + `proxy_ssl_verify on` + cabeceras del otro lado ocultas + `Content-Security-Policy: sandbox` + `nosniff` + caché con `max_size=64m`). El secreto del canje vive solo en `secrets/dardoventas/secreto`, montado de solo lectura en `oficio_notifier`; no está en el `.env`, ni en el compose ni en el repo. Egress nuevo del notificador: solo `ventas.dardoit.com`, con `redirect: 'error'`. Pendiente de decisión de Dariel, sin tocar: `/api/tasas` en `nginx.conf` tiene el mismo hueco que el proxy de fotos ya cerró (no verifica el TLS del upstream y no contiene sus cabeceras; solo oculta `Set-Cookie`, `Cache-Control` y `Access-Control-Allow-Origin`).
- Next: endpoint real en DardoVentas según «Precisiones del contrato» (el doble es la referencia ejecutable); crear `secrets/dardoventas` ANTES del primer `docker compose --profile telegram up` (si no existe, Docker la crea como root y `wajir0`, sin sudo, ya no puede escribir `secreto` dentro): `mkdir -p secrets/dardoventas && chmod 700 secrets/dardoventas`, y solo después crear `secrets/dardoventas/secreto` (chmod 600, ≥ 32 bytes aleatorios, el mismo que use el otro lado) y fijar `DARDOVENTAS_PRO_HASTA` en el `.env` (el notificador lee el secreto solo al arrancar: crearlo o rotarlo pide `--force-recreate oficio_notifier`); desplegar (con OK de Dariel; el notificador va en el perfil `telegram`); APK nueva para quitar el «≈» en la app; decidir sobre el endurecimiento de `/api/tasas`; decidir si el panel debe mostrar Disponible/Agotado en lo importado.
- Blockers: el endpoint real no existe todavía.
