# Despliegue con Docker — Oficios Cuba

Producción vive en **vps2** (`~/docker/oficio/oficios-cuba`) y se sirve en `https://oficio.dardoit.com`:

```
Cloudflare (túnel) → Traefik (net_dmz) → oficio_web (nginx: SPA + proxy /api) → oficio_api:3000 (red interna oficio_net, sin salida)
```

## Primera vez

```bash
cp .env.example .env && chmod 600 .env        # JWT_SECRET: openssl rand -base64 48
mkdir -p data && sudo chown 1000:1000 data    # la API corre como el usuario `node` (uid 1000)
docker compose up -d --build
```

Si `data/` no existe, Docker lo crea como root y la API no puede escribir la base ni las fotos.

## Actualizar

```bash
# 1. Copia de la base ANTES (la API la migra sola al arrancar si el esquema cambió)
docker exec oficio_api node -e "require('better-sqlite3')('/app/data/oficios.db').backup('/app/data/oficios-$(date +%F-%H%M).db').then(()=>console.log('ok'))"
# 2. Código nuevo y reconstrucción
git pull
docker compose up -d --build
# 3. Comprobar
docker compose ps                     # ambos healthy
docker logs oficio_api --tail 20      # "Base de datos migrada a la versión N" si hubo migración
```

## Pagos manuales (sin pasarela)

Con `DEMO_MODE=false`, contratar un plan deja la suscripción **pendiente** hasta que alguien confirma el pago:

```bash
docker exec oficio_api node dist/scripts/pagos.js listar
docker exec oficio_api node dist/scripts/pagos.js confirmar <subscription_id>   # activa el plan un mes desde hoy
docker exec oficio_api node dist/scripts/pagos.js rechazar <subscription_id>
```

## Datos

- `data/oficios.db` (+ `-wal`, `-shm`): la base SQLite. Copiar los tres juntos o usar `.backup()` como arriba.
- `data/uploads/`: fotos subidas por los proveedores.
- Todavía no hay copia de seguridad automática de ninguno de los dos.

## Panel técnico (/admin)

- Dar el rol (solo desde el servidor; la web no puede): `docker exec oficio_api node dist/scripts/admin.js dar <email>` (también `listar`, `quitar <email>`, `reset-2fa <email>`).
- Al entrar en `/admin` el admin activa el 2FA (app de autenticación) y cada entrada abre una sesión de 30 min. Las acciones sensibles piden un código nuevo. Todo queda en el registro (`admin_audit`).
- Perdió el móvil del 2FA: `reset-2fa <email>` y lo vuelve a activar.

## Avisos por Telegram (oficio_notifier)

Contenedor aparte, en el perfil `telegram` de compose: `docker compose up -d` **no** lo arranca (usar `docker compose --profile telegram up -d`). Es el único con salida a internet (net_dmz, solo hacia api.telegram.org) y el único que puede leer el token: al arrancar crea su par de claves en `secrets/notifier/` (solo lo monta él) y publica la pública; la API guarda el token cifrado con ella. Recibe por long polling, sin puertos ni rutas en Traefik. La API sigue sin salida.

- Token: lo pega un admin en `/admin` → Telegram (con código 2FA). El panel solo enseña los 4 últimos caracteres; nadie puede volver a leerlo. El notificador lo detecta en ≤10 s y se reconecta.
- Rotar: /revoke en @BotFather y pegar el nuevo en el panel. Quitarlo: botón "Quitar token".
- Si se borra `secrets/notifier/`, el notificador crea claves nuevas y hay que volver a pegar el token.
- Pararlo: `docker compose --profile telegram stop oficio_notifier`. Los avisos se siguen apuntando y caducan a las 24 h.

### Push de las apps (FCM), también en oficio_notifier

La API apunta los avisos push en `push_outbox` (una fila por teléfono) y el notificador los envía por FCM HTTP v1. Así la API sigue sin salida a internet.

- Activarlo: `mkdir -p secrets/fcm && chmod 700 secrets/fcm`, dejar ahí la cuenta de servicio de Firebase como `cuenta.json` (`chmod 600`; nunca al repo) y `docker compose --profile telegram up -d oficio_notifier`. El log dice `Push FCM activo (proyecto …)`; sin el archivo, `Push FCM desactivado` y Telegram sigue igual.
- Reintentos: 5, con espera exponencial; un aviso caduca a las 24 h; un token que FCM da por muerto (`UNREGISTERED`/404) borra el dispositivo. Si el teléfono pasó a otra cuenta antes del envío, el aviso de la anterior se descarta.
- Prueba de campo (latencia real en un teléfono): `docker exec oficio_notifier node dist/scripts/push-prueba.js <email> [n] [segundos]`.
