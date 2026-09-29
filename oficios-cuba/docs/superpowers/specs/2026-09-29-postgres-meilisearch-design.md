# Diseño: Postgres + PostGIS + Meilisearch

**Fecha:** 2026-09-29
**Estado:** aprobado en conversación, pendiente de plan de implementación
**Alcance:** sustituir SQLite por Postgres como fuente de verdad y añadir Meilisearch como índice de búsqueda, en `oficios-cuba` (Encuentrauno / Oficios Cuba).

## 1. Por qué

El objetivo del producto es un buscador con **2 millones de productos** de todos los negocios y servicios registrados, y **miles de usuarios concurrentes**. La arquitectura actual no llega, y no por poco.

Mediciones hechas el 2026-09-29 en vps2 (4 vCPU), generando 2 M de filas con la forma real de `catalog_items` y ejecutando la consulta de `routes/catalog.ts` (`GET /catalog/search`) tal como está escrita:

| Motor | 1 usuario | 200 concurrentes | término inexistente | erratas |
|---|---|---|---|---|
| SQLite + `LIKE '%x%'` (actual) | 2.700–3.400 ms | **0,3 req/s** | 2.686 ms | no |
| SQLite + FTS5 | 250 ms | 3,8 req/s | 0,9 ms | no |
| Postgres GIN, orden por relevancia | 307–1.350 ms | — | — | no |
| Postgres GIN, orden por columna indexada | 1–8 ms | 3.900 req/s | 1.744 ms (plan malo) | no |
| Meilisearch (plan + relevancia) | 5–8 ms | 557 req/s | 4 ms | sí |

Miles de usuarios navegando equivalen a unas 150–300 búsquedas/s. El techo actual es 0,3 req/s y no sube añadiendo hardware.

Cuatro causas, no una:

1. **`LIKE '%término%'` no puede usar índice.** El plan de la consulta confirma `SCAN pp`. Un término inexistente cuesta lo mismo que uno popular.
2. **`better-sqlite3` es síncrono y hay un solo proceso.** Cada búsqueda congela la API entera: event loop bloqueado hasta 3.273 ms medidos. El throughput fue idéntico con 1, 10 y 50 usuarios — la concurrencia no existe. Tres de los cuatro vCPU quedan parados.
3. **`COUNT(*)` exacto en cada página** (`catalog.ts:94`, y equivalentes en `providers.ts` y `services.ts`): duplica el coste para mostrar una cifra que nadie necesita exacta.
4. **El mapa hace hasta 201 consultas por petición.** `resumenDe()` (`routes/mapa.ts:83`) se ejecuta una vez por punto, hasta 200 puntos.

El techo duro que decide la arquitectura: **ordenar por plan antes que por relevancia** obliga a materializar todas las coincidencias (~29.000 para un término popular). Eso mantuvo SQLite+FTS5 en 250 ms y Postgres+GIN entre 307 y 1.350 ms. No es un defecto del motor; es que el ranking compuesto tiene que vivir *dentro* del índice.

## 2. Decisiones

### 2.1 Postgres, no una base documental

Evaluado y descartado. El esquema actual tiene **28 tablas, 47 claves ajenas, 35 `ON DELETE CASCADE`, 12 restricciones de unicidad, 33 `CHECK`, 99 JOINs y 21 transacciones**. Una documental obligaría a reimplementar toda esa integridad en TypeScript.

El caso que lo decide es la agenda: `routes/appointments.ts:234` revalida el solape de horarios dentro de la transacción del insert. Sin garantías de aislamiento, dos clientes que piden la misma hora reservan los dos. Lo mismo aplica a los pagos y a `enforcePlanLimit()`, que cuenta artículos para decidir qué se oculta.

### 2.2 Meilisearch CE, no ParadeDB ni Typesense

- **ParadeDB `pg_search`** (BM25 dentro de Postgres, sobre Tantivy) sería más elegante: un solo sistema, índice transaccional, sin sincronización posible de romper. Se descarta por la licencia **AGPL-3.0** sobre un producto comercial con planes de pago, y porque ata el proyecto a su distribución de Postgres en vez de la imagen oficial.
- **Typesense** es GPL-3.0 y necesita el índice en RAM.
- **Meilisearch Community Edition es MIT.** Limitación conocida y aceptada: la replicación es de la edición Enterprise, y su líder de escritura no tiene failover automático. Irrelevante mientras haya un solo nodo; se revisa cuando exista host dedicado con réplicas.

### 2.3 PostGIS

Hoy el mapa filtra con `BETWEEN` sobre `(map_lat_pub, map_lng_pub)`; un índice B-tree compuesto solo sirve para la primera columna, así que la longitud se filtra fila por fila. PostGIS con índice GiST resuelve el bbox de verdad, y es además la fuente de verdad geográfica para cualquier consulta transaccional (distancias, validaciones).

### 2.4 Versiones

- `postgis/postgis:18-3.6` — **Debian, no alpine**: hace falta ICU completo para colación y acentos en español.
- `getmeili/meilisearch:v1.54`.
- Driver Node: **`pg` con Pool**, no `postgres.js`. `postgres.js` es algo más rápido, pero obliga a reescribir las 293 consultas a tagged templates; con `pg` el porte es mecánico (`?` → `$1`) sobre los mismos strings SQL. El cuello estará en Meilisearch y en la red, no en el driver.

> Aviso sobre los números: el benchmark se corrió con Meilisearch **v1.13** (la imagen disponible en el momento). La versión elegida es la v1.54. Debería rendir igual o mejor, pero no se ha medido.

## 3. Topología de servicios

Cuatro contenedores donde hoy hay tres. **Todos en `oficio_net`** (red interna sin salida a internet). Ninguno publica puertos, ninguno entra en `net_dmz`, ninguno gana ruta en Traefik: la superficie de ataque externa no cambia.

| Servicio | Imagen | Redes | Función |
|---|---|---|---|
| `oficio_db` | `postgis/postgis:18-3.6` | `oficio_net` | Fuente de verdad |
| `oficio_search` | `getmeili/meilisearch:v1.54` | `oficio_net` | Índice de búsqueda |
| `oficio_api` | la actual | `oficio_net` | Sin cambios de red |
| `oficio_indexer` | la misma imagen, otro comando | `oficio_net` | Consume `search_outbox` → Meilisearch |
| `oficio_web` | la actual | `net_dmz`, `oficio_net` | Sin cambios |
| `oficio_notifier` | la actual | `net_dmz` | Sin cambios |

**El indexador va separado del notifier a propósito.** `oficio_notifier` es el único contenedor con salida a internet y el único que puede descifrar el token del bot de Telegram. Darle el indexado le daría acceso a Postgres a un proceso que habla con el exterior y rompería el aislamiento existente. El indexador no necesita internet.

**Secretos.** `POSTGRES_PASSWORD` y `MEILI_MASTER_KEY` van en el `.env` de vps2 con `chmod 600`, **nunca en el `docker-compose.yml`** (`dardoland-db` las tiene en claro en su compose; no se replica ese patrón). Los archivos se crean vacíos para que Dariel pegue los valores; no pasan por el chat.

Healthchecks: `pg_isready` para Postgres (patrón de `~/docker/dardoland`), `GET /health` para Meilisearch. `oficio_api` depende de ambos con `condition: service_healthy`.

Volúmenes nombrados para los datos de Postgres y de Meilisearch.

## 4. Esquema

**No hay migración de datos.** La base de producción actual tiene `DEMO_MODE=true`, 319 usuarios de los cuales 1 tiene login real de Google, 0 artículos de catálogo, 5 fotos subidas y 1 dispositivo push. Dariel confirmó que no necesita compatibilidad con los datos existentes. Por tanto:

- El esquema **nace limpio en la v1 de Postgres**. No se portan las 13 migraciones históricas de SQLite.
- `PRAGMA user_version` + el array `MIGRACIONES` se reemplazan por una tabla `schema_migrations`.
- El estado inicial se obtiene del seed (`db/seed.ts` + `db/seed-demo.ts`).

### 4.1 Cambios de tipo, y qué rompe cada uno

| De (SQLite) | A (Postgres) | Consecuencia |
|---|---|---|
| `INTEGER` 0/1 | `boolean` | Rompe los **19 `Boolean(...)`** del código |
| `TEXT` con JSON | `jsonb` | Toca los **19 `JSON.parse`/`JSON.stringify`**; permite indexar dentro del JSON |
| `DATETIME` texto ISO | `timestamptz` | Las comparaciones lexicográficas (`created_at > ?`) pasan a ser reales. **La agenda necesita repaso cuidadoso**: mezcla horas de pared de Cuba (tzdata) con UTC |
| `TEXT` con UUID | `uuid` | Más compacto e indexable |
| `COLLATE NOCASE` | `citext` o índice sobre `lower()` | Afecta a los `ORDER BY ... COLLATE NOCASE` |
| `LIKE '%x%'` | desaparece | Lo sustituye Meilisearch, con `tsvector` + GIN como respaldo (§8) |

### 4.2 Deuda que se elimina

Aprovechando que no hay compatibilidad que mantener:

- **`'premium'` fuera.** 16 apariciones en código, **0 filas** en datos (la migración 3 ya lo pasaba a `'pro'`). Simplifica `PLAN_WEIGHT_SQL`, `CON_NEGOCIO_SQL`, `CON_CATALOGO_SQL` y el `CHECK` de `subscription_plan`, que hoy los cuatro lo arrastran.
- **`stripe_customer_id` fuera.** 1 aparición (solo la definición), 0 filas. Stripe ya no se usa.
- **`conversations.provider_id` y `reviews.provider_id` pasan a llamarse `provider_profile_id`.** Hoy contienen el id del *perfil*, no del usuario — una trampa marcada con 🚨 en el `CLAUDE.md`. Con el esquema limpio, el nombre deja de engañar.
- `map_lat_pub` / `map_lng_pub` (dos `REAL`) → una columna `geography(Point,4326)` con índice **GiST**.

`is_verified` **se mantiene**: se usa de verdad (`routes/auth.ts` lo lee y lo escribe en el flujo de Google).

### 4.3 Restricción de exclusión para la agenda

Mejora que Postgres permite y SQLite no:

```sql
EXCLUDE USING gist (provider_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
```

Con el aislamiento por defecto de Postgres (`READ COMMITTED`), revalidar el solape dentro de la transacción **no basta**: dos clientes concurrentes pueden leer los dos "libre" e insertar los dos. En vez de subir a `SERIALIZABLE`, la base deja de admitir estructuralmente dos citas solapadas del mismo profesional. La condición de carrera desaparece de raíz, en lugar de depender de que la revalidación esté bien escrita.

La restricción lleva `WHERE (status <> 'cancelled')`, porque cancelar y volver a reservar la misma hora es legítimo.

## 5. Búsqueda

### 5.1 Tres índices, uno por pestaña

`servicios`, `productos`, `negocios`. Cada pestaña busca en campos distintos y merece su propio ranking; reindexar uno no afecta a los demás.

**La lista y el mapa consultan el mismo índice**; el mapa solo añade el filtro `_geoBoundingBox`. Esto corrige un defecto documentado en el código actual: `filtroDeVisibles()` (`routes/mapa.ts:118-130`) repite a mano el filtro de texto de `services.ts` y `catalog.ts`, con un comentario que explica que si se desvían, escribir un término y cambiar de lista a mapa vacía el mapa. Con un índice por pestaña esa duplicación deja de existir.

### 5.2 Reglas de ranking

```
["words", "typo", "peso:desc", "attribute", "proximity", "exactness", "creado:desc"]
```

El plan pesa justo después de las palabras y las erratas. La regla de negocio queda expresada en el índice: eso es lo que evita los 250 ms de SQLite+FTS5 y los 307–1.350 ms de Postgres+GIN.

`peso` es el plan materializado en el documento (`pro` → 2, `basic` → 1, `free` → 0), no un `CASE` calculado en cada consulta.

### 5.3 Contenido del documento

Cada documento lleva **lo que se muestra en la tarjeta**, para no volver a Postgres al pintar resultados, e incluye el **resumen precalculado**. Con eso muere el N+1 del mapa: de hasta 201 consultas por petición a **una**.

La lista de campos indexados va explícita, en vez de volcar la fila entera. Campos que **no** entran: `email_contact` y cualquier dato que hoy solo se sirva con sesión. Un índice que responde búsquedas públicas no es sitio para ellos.

### 5.4 Dos invariantes de privacidad

Un índice de búsqueda es un lugar nuevo donde puede filtrarse la ubicación real de las personas. Ambos invariantes llevan test propio:

1. **El `_geo` del documento es el punto público** (la columna `geography` derivada de `map_lat_pub/map_lng_pub`), **nunca** `pp.lat/pp.lng`. Si entrara el real, el filtro geográfico reabriría el oráculo de bisección que la migración 13 cerró.
2. **Un perfil con `show_on_map = false` no lleva `_geo`** en absoluto — no lleva uno nulo.

`lib/ubicacion.ts` **no cambia**. El desplazamiento de 100–300 m lo sigue calculando `desplazar()` en JS con `node:crypto`, sorteado una sola vez y guardado. PostGIS indexa ese valor; no lo genera ni lo recalcula. Si lo generara al servir, volvería el ataque por promediado que ese archivo documenta.

### 5.5 Paginación: se va el `COUNT(*)` exacto

Meilisearch devuelve `estimatedTotalHits`, con tope `maxTotalHits` (1.000 por defecto, configurable). Los campos `total` y `pages` de `GET /catalog/search`, `GET /services` y `GET /providers` pasan a ser estimaciones con tope.

**Esto cambia el contrato de la API y toca el frontend y las dos apps móviles**, no solo el backend. Es el cambio de contrato más ancho del trabajo.

`maxTotalHits` limita los resultados paginables. El conteo por celda del mapa (§6) no puede depender de él; ver el supuesto marcado en esa sección.

## 6. El mapa

Hoy el tamaño de celda es continuo: `min(alto,ancho)/5` del rectángulo visible (`lib/mapa.ts:tamanoCelda`). Funciona en SQL porque `ROW_NUMBER() OVER (PARTITION BY cy,cx)` ve **todas** las filas del bbox y el `+N` (`detras`) es exacto.

Agrupar en JS sobre los candidatos que devuelva Meilisearch haría que `detras` fuera un conteo sobre una muestra: diría "5 más" y aparecerían tres. Es exactamente el defecto que la entrega del 2026-09-29 corrigió con `GET /mapa/celda`.

**Solución: discretizar el zoom a niveles fijos** y guardar la celda de cada nivel en el documento como campo filtrable y facetable. Entonces `facetDistribution` da el conteo por celda sobre el conjunto filtrado, en la misma consulta.

El rango de niveles se fija en la implementación a partir de `CELDA_MIN`/`CELDA_MAX` de `lib/mapa.ts` (hoy 0,0005° a 4°) y de los límites de Cuba: debe cubrir desde "todo el país en pantalla" hasta "una manzana", y ningún nivel puede producir celdas menores que el desplazamiento de privacidad de 300 m — si la celda fuera más pequeña que el error introducido a propósito, agrupar dejaría de tener sentido.

> **Supuesto a validar antes de construir sobre él.** Este diseño del mapa depende de que `facetDistribution` dé conteos **exactos** sobre todo el conjunto filtrado y no una estimación limitada por `maxTotalHits`. No lo medí: el benchmark del 2026-09-29 probó latencia de búsqueda, no facetas. Además `faceting.maxValuesPerFacet` vale 100 por defecto, y con el margen del 50 % que aplica `conMargen()` el número de celdas visibles puede pasar de 100; hay que subirlo.
>
> **Primer paso del plan de implementación: verificar esto contra Meilisearch v1.54 con un volumen realista.** Si los conteos resultaran estimados o topados, el §6 se rediseña — la alternativa es que el conteo por celda salga de Postgres+PostGIS (que sí ve todo) y el contenido de la celda de Meilisearch, aceptando dos sistemas por petición. No se escribe código del mapa hasta que esto esté resuelto.

Consecuencia visible aceptada por Dariel: el agrupamiento salta por niveles en vez de adaptarse al píxel. A cambio, los grupos dejan de reorganizarse al mover un poco el mapa, lo que es más estable para quien lo usa.

`GET /mapa` y `GET /mapa/celda` conservan su contrato externo (`puntos`, `celda`, `hay_mas`, `cy`, `cx`, `detras`); cambia cómo se calculan. El cliente sigue reenviando `cy`/`cx` tal cual, y el servidor sigue siendo el único que decide el nivel de celda.

## 7. Sincronización

Tabla **`search_outbox`**, calcada de `push_outbox`: `(id, indice, doc_id, accion 'upsert'|'delete', status, intentos, send_after, created_at)`.

- Las escrituras apuntan en la cola **dentro de la misma transacción** que el cambio en Postgres. Si el indexador está caído, no se pierde nada.
- `oficio_indexer` la consume por lotes, agrupa por índice y hace un `POST /documents` por lote. Meilisearch responde con `taskUid` asíncrono: el indexador registra la tarea y confirma su resultado antes de marcar las filas como hechas.
- Reintentos con backoff, con el mismo tope que `push_outbox` (5 intentos). Agotados, la fila queda en `status='failed'` y el contador aparece en `GET /admin/system`, junto a las métricas que ya se muestran allí. No se avisa por Telegram: un fallo de indexado no es un aviso para el usuario.
- **Ingesta por lotes** (importación de catálogos completos): `COPY` a Postgres y **un apunte de outbox por lote**, no por fila. Sin eso, importar 50.000 artículos genera 50.000 filas de cola.

**Reindexado completo:** comando CLI que reconstruye cada índice desde Postgres. No es un extra. Hace falta para recuperarse de un desastre, para cambiar los `settings` de un índice (las reglas de ranking no se pueden cambiar en caliente sin reindexar) y para el arranque en frío. Medido: 2 M de documentos en ~2 minutos.

**Salvas: solo Postgres** (`pg_dump`). Meilisearch **no se respalda, se reconstruye**. Esto reduce a la mitad el coste de operar dos sistemas.

## 8. Modo degradado

Toda búsqueda pasa por un módulo único `lib/buscador.ts` con dos adaptadores detrás:

- **`meili`** — el normal.
- **`postgres`** — `tsvector` + GIN. Peor relevancia, sin tolerancia a erratas, pero vivo.

Si Meilisearch no responde, la búsqueda cae al adaptador de Postgres y el sitio sigue funcionando. Esta es la contrapartida de operar dos sistemas: el segundo puede morirse sin tumbar el sitio. Y el `tsvector` no es trabajo desechable — es el respaldo, y es lo que garantiza que `LIKE '%x%'` no vuelva nunca.

El cambio de adaptador se registra, para que una caída silenciosa de Meilisearch no pase por "la búsqueda va rara".

## 9. Capa de datos y porte

293 `db.prepare()` en 32 archivos, todas síncronas, pasan a asíncronas. El porte propaga `async` a las funciones auxiliares: `planDelPerfil()`, `providerProfileIdFor()`, `enforcePlanLimit()`, `segunPlan()`, los helpers de agenda, `borrarSiHuerfana()`.

**El riesgo real no es la sintaxis, son las 21 transacciones.** Con `better-sqlite3`, `db.transaction(() => {...})()` es síncrono y atómico sin esfuerzo. Con `pg`, todas las consultas de dentro deben ir por el **mismo cliente** del pool; una llamada que use el pool en vez del cliente de la transacción se ejecuta **fuera** de ella y no produce ningún error. Es un bug silencioso que corrompe datos.

Por eso la capa de datos se diseña para que ese error sea imposible, no para detectarlo: `tx()` recibe el cliente, y dentro de una transacción la única forma de consultar es ese cliente. Los tipos deben impedir lo contrario.

API de la capa de datos: `q()` (varias filas), `qOne()` (una fila o `undefined`), `tx()` (transacción con cliente dedicado).

## 10. Tests

Hoy cada archivo de test crea su SQLite temporal: rápido y aislado. Hay que reponer esa propiedad.

- **Postgres:** un contenedor de test, una base plantilla creada una vez, y `CREATE DATABASE ... TEMPLATE` por archivo de test. Mismo aislamiento sin pagar la creación del esquema en cada archivo.
- **Meilisearch:** un doble en memoria para la mayoría de los tests de rutas, y contenedor real solo para los tests del adaptador y de la sincronización. Si no, cada test arrastra dos servicios y la suite se vuelve inusable.

Tests nuevos que el diseño obliga a escribir:

- Los dos invariantes de privacidad del índice (§5.4).
- La cola de sincronización: que un cambio en Postgres acabe en el índice, y que nada se pierda si el indexador estaba caído.
- El modo degradado: con Meilisearch caído, la búsqueda responde por Postgres.
- El reindexado completo: reconstruir desde cero reproduce el mismo contenido.
- La restricción de exclusión de la agenda: dos reservas concurrentes de la misma hora, una falla.

Los tests existentes de `coordenada-servida`, `mapa` y `mapa-esquema` deben seguir pasando en su intención: la propiedad anti-bisección no puede romperse en el porte.

## 11. Concurrencia y despliegue

- **Varios procesos de API** vía `cluster` de Node con `WEB_CONCURRENCY`. Con `pg` async ya no se congela el event loop, pero un proceso sigue usando un solo core.
- **Pool dimensionado** para que `procesos × max` quepa en el `max_connections` de Postgres con margen. Sin PgBouncer por ahora.
- **`Cache-Control` en las búsquedas públicas**, para que Cloudflare absorba lo repetido. Hoy no existe en ninguna ruta de búsqueda; es la palanca más barata disponible.
- **Redimensionar los `mem_limit`.** Los 384 MB actuales de la API no sirven, y Postgres necesita su propio límite y `shared_buffers` ajustado. Los cuatro contenedores deben caber en lo que queda de vps2 durante el desarrollo.

**Destino:** Dariel confirmó host dedicado cuando toque. vps2 (4 vCPU, 9,7 GB, 33 contenedores) es el entorno de desarrollo, entendido como provisional. El diseño no se recorta para caber ahí a largo plazo.

## 12. Fuera de alcance

Decisiones para cuando exista host dedicado y datos reales que medir:

- PgBouncer.
- Réplicas de lectura de Postgres, replicación de Meilisearch.
- Particionado de tablas, sharding.
- `pgvector` / búsqueda semántica.
- **Que el frontend busque directo contra Meilisearch.** Sería mucho más rápido (elimina el salto por la API), pero es superficie de ataque nueva: exigiría exponer Meilisearch por Traefik y mover las reglas de visibilidad por plan a *tenant tokens*. Requiere OK explícito de Dariel según las reglas duras del `CLAUDE.md` global.

## 13. Criterios de aceptación

1. `npm test` y `npm run typecheck` pasan enteros en el backend; `npx tsc --noEmit && npm run build` en el frontend.
2. `LIKE '%` no aparece en `backend/src/routes/`.
3. Los dos invariantes de privacidad del índice tienen test y pasan.
4. Con `oficio_search` detenido, las tres pestañas de búsqueda siguen respondiendo (modo degradado).
5. El reindexado completo desde cero produce índices equivalentes a los que dejó la cola.
6. Dos reservas concurrentes de la misma hora: una falla.
7. El `detras` del mapa coincide con la cantidad de negocios que devuelve `GET /mapa/celda` para esa celda.
8. Ningún contenedor nuevo publica puertos ni tiene ruta en Traefik.
9. `docker compose config` no muestra ningún secreto en claro.

## 14. Riesgo de coordinación

El repo `github.com/doniet/oficio` es **compartido con Doniet**, y su `CLAUDE.md` pide coordinar antes de reescrituras grandes en `master`. Este trabajo toca 293 consultas en 32 archivos, el sistema de migraciones y toda la suite de tests: es la reescritura grande del proyecto. **El porte es de golpe, no incremental** — no se puede tener media aplicación en SQLite y media en Postgres. Va en una rama, y el criterio de "listo" es que la suite pase entera.

Dariel coordina con Doniet antes de que empiece la implementación.
