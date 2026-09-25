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
