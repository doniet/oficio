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
