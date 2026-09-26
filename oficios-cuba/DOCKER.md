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

## Avisos por Telegram (oficio_notifier)

Contenedor aparte, en el perfil `telegram` de compose: `docker compose up -d` **no** lo arranca. Es el único con el token del bot y con salida a internet (net_dmz, solo hacia api.telegram.org); recibe por long polling, sin puertos ni rutas en Traefik. La API sigue sin salida.

Activarlo (requiere OK de Dariel: da salida a internet a un contenedor nuevo):
1. Crear el bot con @BotFather (nombre y usuario, p. ej. `OficiosCubaBot`).
2. Pegar el token en `secrets/telegram_bot_token` con un editor (el archivo ya existe, `chmod 600`, fuera de git). Nunca en el chat ni en `.env`.
3. `docker compose --profile telegram up -d` (usa la imagen `oficio-api:latest` ya construida).
4. `docker logs oficio_notifier` → `Notificador activo como @<bot>`; en la web, Cuenta → "Conectar Telegram" deja de decir "Muy pronto" (tarda hasta 1 min).

Pararlo: `docker compose --profile telegram stop oficio_notifier`. Los avisos se siguen apuntando y caducan a las 24 h. Rotar el token: /revoke en @BotFather, pegar el nuevo y `docker compose --profile telegram up -d --force-recreate oficio_notifier`.
