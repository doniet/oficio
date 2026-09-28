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
