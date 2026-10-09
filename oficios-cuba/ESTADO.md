# Estado del proyecto

**Estado actual: DESARROLLO**

Desde: 2026-10-09 (oficio.dardoit.com publicado, con `DEMO_MODE=true` y datos de prueba).
Lo decide Dariel. Solo él cambia esta línea.

## Qué significa «DESARROLLO»

Mientras este archivo diga DESARROLLO, Claude puede, sin pedir permiso cada vez:

- **Desplegar a vps2** (`docker compose --profile telegram up -d --build` en `~/docker/oficio/oficios-cuba`), con `pg_dump -Fc` en `data/backups/` antes, y comprobar desde fuera después.
- **Cambiar la base de datos** (esquema y datos) sin conservar compatibilidad con versiones anteriores: se puede reescribir una migración, cambiar columnas o resembrar.
- **Cambiar la API y la web** sin conservar compatibilidad con clientes anteriores.

Sigue haciendo falta el OK de Dariel para lo que toca la seguridad o la red, en cualquier estado:
túnel de Cloudflare, Traefik, puertos, CORS, autenticación, reglas de subida, `DEMO_MODE`, secretos y `.env`.

## Qué cambia en «PRODUCCIÓN»

Cuando Dariel lo cambie a PRODUCCIÓN, ya no vale nada de lo anterior:

- Cada despliegue lleva el OK de Dariel.
- Las migraciones son incrementales, se prueban sobre una copia de producción y conservan los datos.
- La API mantiene la compatibilidad con la app Android publicada.
