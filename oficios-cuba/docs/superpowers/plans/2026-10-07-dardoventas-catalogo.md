# Catálogo de DardoVentas en Encuentrauno — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un comerciante de DardoVentas pueda vincular su negocio con su cuenta de Encuentrauno y que, desde ese momento, su catálogo se importe y se mantenga al día solo, con los precios idénticos a los de su caja y las fotos servidas a demanda.

**Architecture:** Los negocios vinculados son `provider_profiles` normales y sus productos `catalog_items` normales con `origen='dardoventas'`. La API sólo **apunta** el canje del código en una tabla, igual que hace con Telegram y el push; `oficio_notifier`, que es el único proceso con salida a internet, hace el canje, regala el plan y sondea cada catálogo con `If-None-Match`. Las fotos las sirve `oficio_web` con un `proxy_cache` acotado, sin copiarlas a disco.

**Tech Stack:** Node 22 · Express 4 · TypeScript (`strict:false`) · Postgres 18 + PostGIS vía `pg` · zod · vitest + supertest (backend) · React 18 + Vite + vitest + Testing Library (web) · nginx 1.27 · Docker Compose.

**Spec:** `oficios-cuba/docs/superpowers/specs/2026-10-06-dardoventas-catalogo-design.md` (revisado el 2026-10-07: el canje va por el notificador, no por un puerto 8081, y hay una sección «Precisiones del contrato» que este plan sigue al pie de la letra).

## Global Constraints

- **Rama y sitio.** Rama `dardoventas-catalogo` desde `master`, en un worktree propio: `git worktree add /home/wajir0/worktrees/oficio-dardoventas -b dardoventas-catalogo master` (desde `/home/wajir0/docker/oficio`). **Nunca** se edita en `/home/wajir0/docker/oficio`: es el checkout de producción.
- **Base de pruebas.** Los tests del backend usan el contenedor `oficio_db_test` (`127.0.0.1:55432`). Copiar el `.env` del worktree `oficio-postgres`, que ya apunta ahí y fija `COMPOSE_PROJECT_NAME`: `cp /home/wajir0/worktrees/oficio-postgres/oficios-cuba/.env /home/wajir0/worktrees/oficio-dardoventas/oficios-cuba/.env && chmod 600 …/.env`. **No imprimir** su contenido. Después `npm ci` en `backend/`, `frontend/`, `shared/` y `mobile/` (este último solo para el `tsc` de las Tareas 4 y 9).
- **Comandos de verificación.** Backend: `cd oficios-cuba/backend && npx vitest run <archivo>` y, al cerrar cada tarea, `npm test && npm run typecheck`. Web: `cd oficios-cuba/frontend && npx vitest run <archivo>`, y al cerrar `npx tsc --noEmit && npm run build`. Shared: `cd oficios-cuba/shared && npx vitest run && npx tsc --noEmit`.
- **El notificador no puede importar `config.ts` ni `db/index.ts`** (exigen `JWT_SECRET`, que él no tiene). Todo lo que use `notifier/` importa sólo de `db/acceso.ts`, `db/conexion.ts`, `planes.ts`, `db/limite-plan.ts` y `db/dardoventas.ts`. La Tarea 5 lleva una prueba que lo hace cumplir.
- **Valores fijos del contrato** (spec, «Precisiones del contrato»): slug `^[A-Za-z0-9_-]{16,64}$`; uid `^[A-Za-z0-9_-]{1,64}$`; versión de foto `^[A-Za-z0-9_-]{1,32}$`; raíz `{"schema_version": 1, "items": […]}`; tope 5 MB descomprimidos y 5000 artículos; canje con `Authorization: Bearer <secreto>`; código del canje con TTL de 15 min.
- **Cadencia.** Una pasada cada 30 min por negocio (`PERIODO_MIN = 30`). Reintento tras fallo: `5 · 2^fallos` minutos, tope 360.
- **Precios.** Se guarda `priceCup` tal cual en `price` con `price_currency='CUP'`; `priceCup = null` → `price_type='ask'`. **Nunca** se convierte. `priceUsd` y `priceSource` no se guardan (el spec dice «se puede»; queda fuera para no inventar un campo que nadie pide aún).
- **Fotos.** `catalog_items.image` = `/ext/dv/foto/<slug>/<uid>.jpg?v=<versión>`. La caché de nginx lleva `max_size=64m`.
- **Plan regalado.** `DARDOVENTAS_PRO_HASTA` (fecha ISO). Regalar nunca acorta lo que el comerciante ya tiene.
- **Textos de la UI** en español de Cuba, con tuteo. No se escribe «profesionales» ni se muestra el plan de nadie como etiqueta pública.
- **Commits** en español, imperativo, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Nada se despliega.** Este plan no toca `~/docker/oficio`, ni el `.env` de producción, ni el túnel, ni Traefik, y no crea el archivo del secreto. Desplegar exige el OK de Dariel (skill `oficio-deploy-vps2`) y que exista el endpoint real.
- **La app móvil** sólo hereda el cambio de `shared/` (Tarea 4). Compilar y publicar una APK nueva es otro encargo (skill `oficio-apk-release-publicar`).

## Review Focus

Cinco entradas que un comerciante real va a provocar y que ninguna prueba cubriría si no se añade a propósito. Cada línea lleva su prueba en la tarea dueña del código:

1. **DardoVentas responde 200 con un artículo mal formado** (sin `name`, precio en texto) → ese artículo se ignora, pero **su fila anterior no se borra**: que un artículo venga roto no significa que el comerciante lo haya quitado. → Tarea 5.
2. **Un catálogo descomunal o una respuesta sin `Content-Length`** → el notificador tiene 128 MB: se corta al pasar de 5 MB leyendo por trozos, sin tocar la base. → Tarea 5.
3. **El comerciante ya paga un plan** (Profesional sin caducidad, o un Básico que vence después de `DARDOVENTAS_PRO_HASTA`) → el regalo no le acorta nada. → Tarea 2.
4. **Desvincular mientras la sincronización está descargando** → la pasada no puede reimportar en un perfil que ya no está vinculado. → Tarea 5.
5. **La foto del otro lado llega como `text/html`** (fallo o compromiso de DardoVentas) → se sirve desde nuestro origen, así que no puede ejecutar nada: va con `Content-Security-Policy: sandbox`. → Tarea 7.

Además, dos que el spec no nombra y se cubren igual: el comerciante nuevo que se registra **con Google** perdía el `code` (Tarea 8), y un código usado dos veces o caducado (Tarea 6).

---

### Task 1: Migración incremental v2

El esquema nació en la v1 sin migraciones incrementales. Producción ya tiene datos, así que esta tarea crea el mecanismo y la primera migración.

**Files:**
- Create: `oficios-cuba/backend/src/db/migraciones.ts`
- Modify: `oficios-cuba/backend/src/db/migrar.ts`
- Modify: `oficios-cuba/backend/test/esquema.test.ts:15-31`
- Create: `oficios-cuba/backend/test/migracion-v2.test.ts`

**Interfaces:**
- Produces: columnas `provider_profiles.dardoventas_slug` (text UNIQUE), `dardoventas_linked_at`, `dardoventas_etag`, `dardoventas_synced_at`, `dardoventas_fallos` (int NOT NULL DEFAULT 0), `dardoventas_reintento_en`; `catalog_items.origen` (`'propio'|'dardoventas'`, DEFAULT `'propio'`), `catalog_items.uid_externo`; índice único parcial `idx_catalog_externo (provider_id, uid_externo) WHERE uid_externo IS NOT NULL`; tabla `dardoventas_canjes(id uuid, provider_id uuid, code text NULL, status 'pendiente'|'ok'|'error', error text, created_at, done_at)`. `migrar()` conserva su firma.

- [ ] **Step 1: Escribir la prueba que falla**

`oficios-cuba/backend/test/migracion-v2.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { q, qOne } from '../src/db/acceso.js';
import { cerrarPool } from '../src/db/conexion.js';
import { migrar } from '../src/db/migrar.js';
import { registrar } from './helpers.js';

beforeAll(async () => { await migrar(); });
afterAll(async () => { await cerrarPool(); });

const existe = async (tabla: string, col: string) => Boolean(await qOne(
  'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [tabla, col],
));

describe('migración 2: DardoVentas', () => {
  it('una base que se quedó en la v1 recibe solo la 2, y sus datos siguen ahí', async () => {
    // Así está producción: esquema.sql aplicado y nada más.
    const p = await registrar('provider');
    await q(`ALTER TABLE catalog_items DROP COLUMN origen, DROP COLUMN uid_externo`);
    await q(`ALTER TABLE provider_profiles DROP COLUMN dardoventas_slug, DROP COLUMN dardoventas_linked_at,
      DROP COLUMN dardoventas_etag, DROP COLUMN dardoventas_synced_at, DROP COLUMN dardoventas_fallos,
      DROP COLUMN dardoventas_reintento_en`);
    await q('DROP TABLE dardoventas_canjes');
    await q('DELETE FROM schema_migrations WHERE version = 2');
    await q("INSERT INTO catalog_items (id, provider_id, name, created_at) VALUES ($1, $2, 'Pan', now())", [uuidv4(), p.providerId]);

    await migrar();

    expect(await existe('catalog_items', 'origen')).toBe(true);
    expect(await existe('provider_profiles', 'dardoventas_slug')).toBe(true);
    expect(await existe('dardoventas_canjes', 'code')).toBe(true);
    const fila = await qOne<{ origen: string }>('SELECT origen FROM catalog_items WHERE provider_id = $1', [p.providerId]);
    expect(fila?.origen).toBe('propio');
    expect((await q('SELECT version FROM schema_migrations ORDER BY version')).length).toBe(2);
  });

  it('el mismo uid externo no puede entrar dos veces en un perfil, y los propios (uid NULL) no chocan', async () => {
    const p = await registrar('provider');
    const meter = (uid: string | null) => q(
      "INSERT INTO catalog_items (id, provider_id, name, origen, uid_externo, created_at) VALUES ($1, $2, 'x', $3, $4, now())",
      [uuidv4(), p.providerId, uid ? 'dardoventas' : 'propio', uid],
    );
    await meter(null);
    await meter(null);
    await meter('u1');
    await expect(meter('u1')).rejects.toThrow();
  });

  it('origen solo admite propio o dardoventas', async () => {
    const p = await registrar('provider');
    await expect(q(
      "INSERT INTO catalog_items (id, provider_id, name, origen, created_at) VALUES ($1, $2, 'x', 'otro', now())",
      [uuidv4(), p.providerId],
    )).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd oficios-cuba/backend && npx vitest run test/migracion-v2.test.ts`
Expected: FAIL — `column "origen" of relation "catalog_items" does not exist`.

- [ ] **Step 3: Escribir la migración y el mecanismo**

`oficios-cuba/backend/src/db/migraciones.ts`:

```ts
// Cambios de esquema posteriores a la v1 (esquema.sql). Una por versión, cada una en su propia
// transacción. Una base nueva recibe esquema.sql y luego todas; producción, solo las que le falten.
// El SQL va en el .ts y no en un .sql aparte para que `npm run build` no tenga que copiar nada más.
export const MIGRACIONES: { version: number; sql: string }[] = [
  {
    // Catálogo importado de DardoVentas (docs/superpowers/specs/2026-10-06-dardoventas-catalogo-design.md).
    version: 2,
    sql: `
      ALTER TABLE provider_profiles
        ADD COLUMN dardoventas_slug text UNIQUE,
        ADD COLUMN dardoventas_linked_at timestamptz,
        ADD COLUMN dardoventas_etag text,
        ADD COLUMN dardoventas_synced_at timestamptz,
        ADD COLUMN dardoventas_fallos integer NOT NULL DEFAULT 0,
        ADD COLUMN dardoventas_reintento_en timestamptz;

      ALTER TABLE catalog_items
        ADD COLUMN origen text NOT NULL DEFAULT 'propio' CHECK (origen IN ('propio', 'dardoventas')),
        ADD COLUMN uid_externo text;

      -- Lo que hace idempotente la sincronización: el upsert choca contra este índice.
      CREATE UNIQUE INDEX idx_catalog_externo ON catalog_items (provider_id, uid_externo)
        WHERE uid_externo IS NOT NULL;

      -- La API apunta aquí el código; oficio_notifier (el único con salida) lo canjea y lo borra.
      CREATE TABLE dardoventas_canjes (
        id uuid PRIMARY KEY,
        provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
        code text,
        status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'ok', 'error')),
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        done_at timestamptz
      );
      CREATE INDEX idx_dv_canjes ON dardoventas_canjes (status, created_at);
      CREATE INDEX idx_dv_canjes_perfil ON dardoventas_canjes (provider_id, created_at);
    `,
  },
];
```

`oficios-cuba/backend/src/db/migrar.ts` entero:

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { q, tx } from './acceso.js';
import { MIGRACIONES } from './migraciones.js';

export const ESQUEMA_VERSION = 1;

/**
 * Aplica esquema.sql (v1) si la base está vacía y después cada migración de MIGRACIONES que falte,
 * en orden y cada una en su propia transacción: si una falla, las anteriores quedan aplicadas y el
 * proceso muere (ver el .catch de start() en index.ts).
 */
export async function migrar() {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const ya = new Set((await q<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));

  if (!ya.has(ESQUEMA_VERSION)) {
    const sql = readFileSync(resolve(__dirname, 'esquema.sql'), 'utf8');
    await tx(async (c) => {
      await c.q(sql);
      await c.q('INSERT INTO schema_migrations (version) VALUES ($1)', [ESQUEMA_VERSION]);
    });
  }

  for (const m of MIGRACIONES) {
    if (ya.has(m.version)) continue;
    await tx(async (c) => {
      await c.q(m.sql);
      await c.q('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
    });
  }
}
```

En `oficios-cuba/backend/test/esquema.test.ts`, las tres pruebas de `describe('migrar')` pasan a:

```ts
  it('deja registradas la v1 y todas las migraciones', async () => {
    expect((await qOne<{ v: number }>('SELECT max(version) AS v FROM schema_migrations'))?.v).toBe(2);
  });

  it('es idempotente: aplicarla dos veces no falla', async () => {
    await migrar();
    expect((await qOne<{ n: string }>('SELECT count(*) AS n FROM schema_migrations'))?.n).toBe('2');
  });

  it('crea las 26 tablas del modelo', async () => {
    const { length } = await q(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
          AND table_name <> 'schema_migrations' AND table_name NOT LIKE 'spatial_%'`,
    );
    expect(length).toBe(26);
  });
```

- [ ] **Step 4: Correr las pruebas**

Run: `cd oficios-cuba/backend && npx vitest run test/migracion-v2.test.ts test/esquema.test.ts && npm test && npm run typecheck`
Expected: PASS, la suite entera incluida (la plantilla de tests corre `migrar()`, así que todas las bases de prueba ya llevan la v2).

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/backend/src/db/migraciones.ts oficios-cuba/backend/src/db/migrar.ts oficios-cuba/backend/test/esquema.test.ts oficios-cuba/backend/test/migracion-v2.test.ts
git commit -m "Migraciones incrementales y la v2: columnas y tabla de canjes de DardoVentas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reglas de plan que el notificador puede usar, y el plan regalado

`aplicarLimiteDePlan` vive en `db/index.ts`, que importa `config.ts`, que exige `JWT_SECRET`. El notificador no puede importarla. Esta tarea la saca a un módulo sin esa dependencia y añade las dos operaciones que comparten la API y el notificador: desvincular y regalar el plan.

**Files:**
- Create: `oficios-cuba/backend/src/planes.ts`
- Modify: `oficios-cuba/backend/src/config.ts:16-40`
- Create: `oficios-cuba/backend/src/db/limite-plan.ts`
- Modify: `oficios-cuba/backend/src/db/index.ts:101-133`
- Create: `oficios-cuba/backend/src/db/dardoventas.ts`
- Create: `oficios-cuba/backend/test/dardoventas-plan.test.ts`

**Interfaces:**
- Produces: `planes.ts` → `PLANS`, `PlanId`, `planDe(plan)` (idénticos a los de hoy; `config.ts` los reexporta, así que ningún import existente cambia).
- Produces: `db/limite-plan.ts` → `aplicarLimiteDePlan(c: Tx, providerId: string): Promise<void>`.
- Produces: `db/dardoventas.ts` → `regalarPro(c: Tx, providerId: string, hasta: Date): Promise<void>` y `desvincular(c: Tx, providerId: string, ocultarDelMapa: boolean): Promise<void>`.

- [ ] **Step 1: Escribir la prueba que falla**

`oficios-cuba/backend/test/dardoventas-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { q, qOne, tx } from '../src/db/acceso.js';
import { desvincular, regalarPro } from '../src/db/dardoventas.js';
import { expireSubscriptions } from '../src/db/index.js';
import { ponerPlan, registrar } from './helpers.js';

const plan = (id: string) => qOne<{ subscription_plan: string; subscription_expires_at: string | null }>(
  'SELECT subscription_plan, subscription_expires_at FROM provider_profiles WHERE id = $1', [id],
);
const dentroDe = (dias: number) => new Date(Date.now() + dias * 86_400_000);

async function meterImportados(providerId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await q(`INSERT INTO catalog_items (id, provider_id, name, origen, uid_externo, created_at)
      VALUES ($1, $2, $3, 'dardoventas', $4, now())`, [uuidv4(), providerId, `Importado ${i}`, `u${i}`]);
  }
}

describe('regalarPro', () => {
  it('un perfil Gratis pasa a Profesional hasta la fecha del regalo', async () => {
    const p = await registrar('provider');
    const hasta = dentroDe(90);
    await tx((c) => regalarPro(c, p.providerId!, hasta));
    const r = await plan(p.providerId!);
    expect(r?.subscription_plan).toBe('pro');
    expect(new Date(r!.subscription_expires_at!).getTime()).toBe(hasta.getTime());
  });

  it('un Profesional sin caducidad se queda sin caducidad', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro', null);
    await tx((c) => regalarPro(c, p.providerId!, dentroDe(90)));
    expect((await plan(p.providerId!))?.subscription_expires_at).toBeNull();
  });

  it('un plan pagado que vence DESPUÉS del regalo conserva su fecha', async () => {
    const p = await registrar('provider');
    const suya = dentroDe(200);
    await ponerPlan(p.providerId!, 'basic', suya.toISOString());
    await tx((c) => regalarPro(c, p.providerId!, dentroDe(90)));
    const r = await plan(p.providerId!);
    expect(r?.subscription_plan).toBe('pro');
    expect(new Date(r!.subscription_expires_at!).getTime()).toBe(suya.getTime());
  });

  it('un plan pagado que vence ANTES del regalo se alarga hasta el regalo', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro', dentroDe(10).toISOString());
    const hasta = dentroDe(90);
    await tx((c) => regalarPro(c, p.providerId!, hasta));
    expect(new Date((await plan(p.providerId!))!.subscription_expires_at!).getTime()).toBe(hasta.getTime());
  });

  it('al vencer el regalo, el job de siempre lo baja a Gratis y oculta el catálogo importado', async () => {
    const p = await registrar('provider');
    await tx((c) => regalarPro(c, p.providerId!, dentroDe(90)));
    await meterImportados(p.providerId!, 3);
    await q("UPDATE provider_profiles SET subscription_expires_at = now() - interval '1 minute' WHERE id = $1", [p.providerId]);
    await expireSubscriptions();
    expect((await plan(p.providerId!))?.subscription_plan).toBe('free');
    const visibles = await qOne<{ n: string }>(
      'SELECT count(*) AS n FROM catalog_items WHERE provider_id = $1 AND hidden_by_plan = false', [p.providerId],
    );
    expect(Number(visibles!.n)).toBe(0);
  });
});

describe('desvincular', () => {
  async function vinculado() {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro');
    await q(`UPDATE provider_profiles SET dardoventas_slug = $1, dardoventas_etag = '"e"', show_on_map = true WHERE id = $2`,
      [`slug-${uuidv4().replace(/-/g, '')}`, p.providerId]);
    await meterImportados(p.providerId!, 2);
    await q("INSERT INTO catalog_items (id, provider_id, name, created_at) VALUES ($1, $2, 'Propio', now())", [uuidv4(), p.providerId]);
    return p;
  }
  const estado = (id: string) => qOne<{ dardoventas_slug: string | null; dardoventas_etag: string | null; show_on_map: boolean }>(
    'SELECT dardoventas_slug, dardoventas_etag, show_on_map FROM provider_profiles WHERE id = $1', [id],
  );

  it('borra solo los importados, limpia el vínculo y respeta show_on_map si lo pide el comerciante', async () => {
    const p = await vinculado();
    await tx((c) => desvincular(c, p.providerId!, false));
    const nombres = (await q<{ name: string }>('SELECT name FROM catalog_items WHERE provider_id = $1', [p.providerId])).map((r) => r.name);
    expect(nombres).toEqual(['Propio']);
    expect(await estado(p.providerId!)).toEqual({ dardoventas_slug: null, dardoventas_etag: null, show_on_map: true });
  });

  it('con ocultarDelMapa (410 desde DardoVentas) el negocio sale del mapa', async () => {
    const p = await vinculado();
    await tx((c) => desvincular(c, p.providerId!, true));
    expect((await estado(p.providerId!))?.show_on_map).toBe(false);
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd oficios-cuba/backend && npx vitest run test/dardoventas-plan.test.ts`
Expected: FAIL — `Cannot find module '../src/db/dardoventas.js'`.

- [ ] **Step 3: Implementar**

`oficios-cuba/backend/src/planes.ts` — mover aquí, **sin cambiar ni un carácter**, el bloque de `config.ts` que va del comentario `// maxServices = oficios publicados; …` hasta el final de `planDe()` (líneas 16-40 de hoy: `PLANS`, `PlanId`, `planDe`), precedido de:

```ts
// Planes y sus límites. Separados de config.ts porque ese módulo exige JWT_SECRET al cargarse y
// oficio_notifier (que no lo tiene) necesita aplicar los límites al importar un catálogo.
```

En `oficios-cuba/backend/src/config.ts`, ese bloque se sustituye por:

```ts
export { PLANS, planDe, type PlanId } from './planes.js';
```

`oficios-cuba/backend/src/db/limite-plan.ts` — mover aquí `aplicarLimiteDePlan` desde `db/index.ts` (con su comentario de encima, el que explica por qué recibe `c`), exportada, con estos imports:

```ts
import { planDe } from '../planes.js';
import type { Tx } from './acceso.js';
```

En `oficios-cuba/backend/src/db/index.ts`, borrar la función movida y añadir arriba:

```ts
import { aplicarLimiteDePlan } from './limite-plan.js';
```

(`enforcePlanLimit` y `expireSubscriptions` siguen llamándola igual.)

`oficios-cuba/backend/src/db/dardoventas.ts`:

```ts
import type { Tx } from './acceso.js';
import { aplicarLimiteDePlan } from './limite-plan.js';

// Lo comparten la API (desvincular desde el panel) y oficio_notifier (canje y 410). Por eso no
// importa db/index.ts: ver notifier/db.ts.

/**
 * Profesional regalado mientras dure la integración. Nunca acorta: un plan de pago sin
 * caducidad se queda sin caducidad, y uno que vence después de `hasta` conserva su fecha.
 * En el SET, `subscription_plan` y `subscription_expires_at` son aún los valores viejos.
 */
export async function regalarPro(c: Tx, providerId: string, hasta: Date) {
  await c.q(
    `UPDATE provider_profiles SET
       subscription_expires_at = CASE
         WHEN subscription_plan <> 'free' AND subscription_expires_at IS NULL THEN NULL
         WHEN subscription_plan <> 'free' THEN GREATEST(subscription_expires_at, $2::timestamptz)
         ELSE $2::timestamptz END,
       subscription_plan = 'pro',
       updated_at = now()
     WHERE id = $1`,
    [providerId, hasta.toISOString()],
  );
  await aplicarLimiteDePlan(c, providerId);
}

/**
 * Retira el catálogo importado y el vínculo. `ocultarDelMapa` es para el 410: el comerciante
 * retiró el consentimiento en mi.dardoventas.com y el negocio sale del mapa hasta que él lo
 * vuelva a marcar. Desde el panel de Encuentrauno no se toca: ahí decide él.
 */
export async function desvincular(c: Tx, providerId: string, ocultarDelMapa: boolean) {
  await c.q("DELETE FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas'", [providerId]);
  await c.q(
    `UPDATE provider_profiles SET dardoventas_slug = NULL, dardoventas_linked_at = NULL, dardoventas_etag = NULL,
       dardoventas_synced_at = NULL, dardoventas_fallos = 0, dardoventas_reintento_en = NULL,
       show_on_map = CASE WHEN $2 THEN false ELSE show_on_map END, updated_at = now()
     WHERE id = $1`,
    [providerId, ocultarDelMapa],
  );
  // Borrar deja hueco en el tope del plan: un artículo propio oculto puede volver a verse.
  await aplicarLimiteDePlan(c, providerId);
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `cd oficios-cuba/backend && npx vitest run test/dardoventas-plan.test.ts && npm test && npm run typecheck`
Expected: PASS. La suite entera también: `planes.test.ts` y `catalogo.test.ts` siguen pasando sin tocarlos porque `config.ts` reexporta.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/backend/src/planes.ts oficios-cuba/backend/src/config.ts oficios-cuba/backend/src/db/limite-plan.ts oficios-cuba/backend/src/db/index.ts oficios-cuba/backend/src/db/dardoventas.ts oficios-cuba/backend/test/dardoventas-plan.test.ts
git commit -m "Límites de plan sin JWT_SECRET, plan regalado y desvincular DardoVentas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Candados del catálogo

**Files:**
- Modify: `oficios-cuba/backend/src/routes/catalog.ts:30, 161-195`
- Create: `oficios-cuba/backend/test/catalogo-importado.test.ts`

**Interfaces:**
- Consumes: columnas `catalog_items.origen` y `uid_externo` (Tarea 1).
- Produces: todo artículo de `/api/catalog/*` lleva además `origen: 'propio' | 'dardoventas'` y `convertible: boolean` (`false` si es importado). `PUT /:id`, `DELETE /:id` y `PATCH /:id/available` responden **403** sobre un importado con `{ error: 'Este artículo viene de DardoVentas: cámbialo en tu punto de venta.' }`.

- [ ] **Step 1: Escribir la prueba que falla**

`oficios-cuba/backend/test/catalogo-importado.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { q, qOne } from '../src/db/acceso.js';
import { borrarSiHuerfana } from '../src/routes/uploads.js';
import { api, ponerPlan, registrar } from './helpers.js';

const MENSAJE = 'Este artículo viene de DardoVentas: cámbialo en tu punto de venta.';

async function conImportado() {
  const p = await registrar('provider');
  await ponerPlan(p.providerId!, 'pro');
  const id = uuidv4();
  await q(`INSERT INTO catalog_items (id, provider_id, name, price, price_currency, origen, uid_externo, image, created_at)
    VALUES ($1, $2, 'Refresco', 250, 'CUP', 'dardoventas', 'u1', '/ext/dv/foto/abcdefghijklmnop/u1.jpg?v=1', now())`, [id, p.providerId]);
  return { ...p, id };
}

describe('artículos importados de DardoVentas', () => {
  it('no se editan, ni se borran, ni se marcan agotados a mano', async () => {
    const { auth, id } = await conImportado();
    const put = await api.put(`/api/catalog/${id}`).set(auth).send({ name: 'Otro', price: 1 });
    expect(put.status).toBe(403);
    expect(put.body.error).toBe(MENSAJE);
    expect((await api.delete(`/api/catalog/${id}`).set(auth)).status).toBe(403);
    expect((await api.patch(`/api/catalog/${id}/available`).set(auth).send({ available: false })).status).toBe(403);
    const fila = await qOne<{ name: string; available: boolean }>('SELECT name, available FROM catalog_items WHERE id = $1', [id]);
    expect(fila).toEqual({ name: 'Refresco', available: true });
  });

  it('salen con origen y convertible=false; los propios con convertible=true', async () => {
    const { auth, providerId } = await conImportado();
    await api.post('/api/catalog').set(auth).send({ name: 'Hecho en casa', price: 100 });
    const mios = (await api.get('/api/catalog/mine').set(auth)).body.items as { name: string; origen: string; convertible: boolean }[];
    expect(mios.find((i) => i.name === 'Refresco')).toMatchObject({ origen: 'dardoventas', convertible: false });
    expect(mios.find((i) => i.name === 'Hecho en casa')).toMatchObject({ origen: 'propio', convertible: true });
    const pub = (await api.get(`/api/catalog/provider/${providerId}`)).body.items as { name: string; convertible: boolean }[];
    expect(pub.find((i) => i.name === 'Refresco')?.convertible).toBe(false);
    const busca = (await api.get('/api/catalog/search').query({ q: 'Refresco' })).body.items as { name: string; convertible: boolean }[];
    expect(busca.find((i) => i.name === 'Refresco')?.convertible).toBe(false);
  });

  it('el proveedor no puede colar un artículo como importado por el POST', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro');
    const r = await api.post('/api/catalog').set(p.auth).send({ name: 'Trampa', price: 1, origen: 'dardoventas', uid_externo: 'u9' });
    expect(r.status).toBe(201);
    const fila = await qOne<{ origen: string; uid_externo: string | null }>('SELECT origen, uid_externo FROM catalog_items WHERE id = $1', [r.body.item.id]);
    expect(fila).toEqual({ origen: 'propio', uid_externo: null });
  });

  it('borrarSiHuerfana no toca nada con una ruta de foto externa', async () => {
    await expect(borrarSiHuerfana('/ext/dv/foto/abcdefghijklmnop/u1.jpg?v=1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd oficios-cuba/backend && npx vitest run test/catalogo-importado.test.ts`
Expected: FAIL — el `PUT` responde 200 en vez de 403.

- [ ] **Step 3: Implementar**

En `oficios-cuba/backend/src/routes/catalog.ts`:

`COLUMNAS` (línea 30) pasa a:

```ts
// convertible = false en lo importado: su CUP sale de la tasa propia del negocio y convertirlo con
// la de elTOQUE daría una cifra distinta de la que se cobra en caja (spec, «Los precios no se convierten»).
const COLUMNAS = "ci.id, ci.name, ci.description, ci.price, ci.price_type, ci.price_currency, ci.image, ci.section, ci.available, ci.created_at, ci.origen, ci.origen <> 'dardoventas' AS convertible";
```

`itemPropio` pasa a:

```ts
const NO_SE_EDITA = 'Este artículo viene de DardoVentas: cámbialo en tu punto de venta.';

// Lo importado se reescribe en cada sincronización: una edición a mano se perdería sola, que es
// peor que no dejar editar.
async function itemPropio(req: AuthRequest) {
  const { id: providerId, plan } = await miPerfil(req);
  const item = await qOne<{ id: string; image: string | null; origen: string }>(
    'SELECT id, image, origen FROM catalog_items WHERE id = $1 AND provider_id = $2', [req.params.id, providerId],
  );
  if (!item) throw new AppError('Artículo no encontrado', 404);
  if (item.origen === 'dardoventas') throw new AppError(NO_SE_EDITA, 403);
  return { item, plan, providerId };
}
```

(`PUT`, `PATCH /:id/available` y `DELETE` ya pasan por `itemPropio`: no hace falta tocarlos. El `POST` no cambia: `itemSchema` de zod descarta las claves que no declara, y el `INSERT` no nombra `origen` ni `uid_externo`, así que caen en sus valores por defecto.)

- [ ] **Step 4: Correr las pruebas**

Run: `cd oficios-cuba/backend && npx vitest run test/catalogo-importado.test.ts test/catalogo.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/backend/src/routes/catalog.ts oficios-cuba/backend/test/catalogo-importado.test.ts
git commit -m "Catálogo: lo importado de DardoVentas no se edita a mano y no se convierte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Precio sin conversión en `shared/` y en la web

**Files:**
- Modify: `oficios-cuba/shared/src/tipos.ts:297-309`
- Modify: `oficios-cuba/shared/src/formato.ts:75-82`
- Modify: `oficios-cuba/shared/test/formato.test.ts`
- Modify: `oficios-cuba/frontend/src/types/index.ts:403-415`
- Modify: `oficios-cuba/frontend/src/lib/format.ts:145-150`
- Create: `oficios-cuba/frontend/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `convertible` y `origen` del JSON de la Tarea 3.
- Produces: `CatalogItem` (en `shared` y en `frontend/src/types`) gana `origen?: 'propio' | 'dardoventas'` y `convertible?: boolean` — opcionales, porque `undefined` (servidor viejo, datos de prueba) significa «convertible», como hasta ahora. `precioCatalogo()` y `catalogPrice()` devuelven `alt: null` cuando `convertible === false`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir a `oficios-cuba/shared/test/formato.test.ts` (dentro del archivo, con el `import` de `precioCatalogo` si no lo tiene ya):

```ts
describe('precioCatalogo: artículos importados', () => {
  const base = { price: 250, price_type: 'fixed' as const, price_currency: 'CUP' as const };
  it('sin convertible (o true) da el equivalente, como siempre', () => {
    expect(precioCatalogo(base, 500).alt).not.toBeNull();
    expect(precioCatalogo({ ...base, convertible: true }, 500).alt).not.toBeNull();
  });
  it('con convertible=false no inventa un equivalente', () => {
    expect(precioCatalogo({ ...base, convertible: false }, 500)).toEqual({ prefijo: '', cifra: '250 CUP', alt: null });
  });
});
```

`oficios-cuba/frontend/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogPrice } from './format';

describe('catalogPrice: artículos importados', () => {
  const base = { price: 250, price_type: 'fixed' as const, price_currency: 'CUP' as const };
  it('sin convertible da el equivalente, como siempre', () => {
    expect(catalogPrice(base, 500).alt).not.toBeNull();
  });
  it('con convertible=false no da equivalente', () => {
    const p = catalogPrice({ ...base, convertible: false }, 500);
    expect(p.alt).toBeNull();
    expect(p.amount).toContain('250');
  });
});
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `cd oficios-cuba/shared && npx vitest run test/formato.test.ts; cd ../frontend && npx vitest run src/lib/format.test.ts`
Expected: FAIL en los dos — `alt` no es `null`.

- [ ] **Step 3: Implementar**

`oficios-cuba/shared/src/tipos.ts`, en `CatalogItem`, después de `created_at: string;`:

```ts
  /** 'dardoventas' = importado del punto de venta: no se edita a mano. Ausente en servidores viejos. */
  origen?: 'propio' | 'dardoventas';
  /** false = su precio no se convierte a la otra moneda (el CUP del POS sale de la tasa del negocio). */
  convertible?: boolean;
```

`oficios-cuba/shared/src/formato.ts`, `precioCatalogo` pasa a:

```ts
export function precioCatalogo(
  item: { price: number | null; price_type: CatalogPriceType; price_currency: Currency; convertible?: boolean },
  tasa: number = TASA_RESPALDO,
) {
  if (item.price_type === 'ask' || item.price == null) return { prefijo: '', cifra: 'A consultar', alt: null as string | null };
  const p = precioRenglon(item.price, item.price_currency, tasa);
  // Importado de DardoVentas: la cifra es la que se cobra en caja y un «≈» con otra tasa la contradiría.
  return { prefijo: item.price_type === 'from' ? 'desde' : '', cifra: p.principal, alt: item.convertible === false ? null : p.alt };
}
```

`oficios-cuba/frontend/src/types/index.ts`, en `CatalogItem`, los mismos dos campos que en `shared` (mismo texto de comentario).

`oficios-cuba/frontend/src/lib/format.ts`, `catalogPrice` pasa a:

```ts
export function catalogPrice(item: { price: number | null; price_type: 'fixed' | 'from' | 'ask'; price_currency: Currency; convertible?: boolean }, tasa?: number) {
  if (item.price_type === 'ask' || item.price == null) return { prefix: '', amount: 'A consultar', alt: null as string | null };
  const p = priceParts({ price_min: item.price, price_type: 'fixed', price_currency: item.price_currency }, tasa);
  // Importado de DardoVentas: la cifra es la que se cobra en caja y un «≈» con otra tasa la contradiría.
  return { prefix: item.price_type === 'from' ? 'desde' : '', amount: p.main, alt: item.convertible === false ? null : p.alt };
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `cd oficios-cuba/shared && npx vitest run && npx tsc --noEmit && cd ../frontend && npx vitest run && npx tsc --noEmit && cd ../mobile && npx tsc --noEmit`
Expected: PASS. El `tsc` de `mobile/` confirma que `ModalArticulo.tsx` y `app/proveedor/[id].tsx` siguen compilando (pasan un `CatalogItem`, que ahora puede llevar `convertible`).

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/shared/src/tipos.ts oficios-cuba/shared/src/formato.ts oficios-cuba/shared/test/formato.test.ts oficios-cuba/frontend/src/types/index.ts oficios-cuba/frontend/src/lib/format.ts oficios-cuba/frontend/src/lib/format.test.ts
git commit -m "Precio de catálogo: sin equivalente convertido en lo importado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sincronizador de catálogos en `oficio_notifier`

**Files:**
- Create: `oficios-cuba/backend/src/notifier/dardoventas.ts`
- Create: `oficios-cuba/backend/test/dardoventas-sync.test.ts`
- Create: `oficios-cuba/backend/test/dardoventas-doble.ts`

**Interfaces:**
- Consumes: `aplicarLimiteDePlan` (`db/limite-plan.ts`), `desvincular` (`db/dardoventas.ts`), `q`/`tx` de `notifier/db.ts` (dentro de una transacción se usa `c.qOne`).
- Produces (todo exportado de `notifier/dardoventas.ts`):
  - `interface ConfigDv { base: string; secreto: string | null; proHasta: Date | null }`
  - `type Pedir = typeof fetch`
  - `rutaFoto(url: unknown, base: string, slug: string, uid: string): string | null`
  - `leerCatalogo(texto: string, base: string, slug: string): { presentes: string[]; articulos: ArticuloImportado[] }` — lanza si la raíz no vale.
  - `sincronizarNegocio(p: { id: string; dardoventas_slug: string; dardoventas_etag: string | null }, cfg: ConfigDv, pedir?: Pedir): Promise<'sin_cambios' | 'actualizado' | 'baja' | 'error' | 'desvinculado'>`
  - `sincronizarPendientes(cfg: ConfigDv, pedir?: Pedir): Promise<number>` (cuántos negocios pidió)
  - Constantes `PERIODO_MIN = 30`, `MAX_BYTES = 5 * 1024 * 1024`, `MAX_ARTICULOS = 5000`.
- Produces (prueba): `test/dardoventas-doble.ts` → `BASE`, `art(uid, extra?)`, `respuestaCatalogo(items, etag?)`, `pedirFalso(responder)` (devuelve `{ pedir, llamadas }`), `negocioVinculado(plan?)`. La Tarea 6 los reutiliza.

- [ ] **Step 1: Escribir el doble del contrato para las pruebas**

`oficios-cuba/backend/test/dardoventas-doble.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { q } from '../src/db/acceso.js';
import { ponerPlan, registrar } from './helpers.js';

// Doble del contrato de DardoVentas (spec, «Contrato» y «Precisiones del contrato»). Las pruebas
// le pasan `pedir` al sincronizador en vez de `fetch`: ninguna sale a la red.
export const BASE = 'https://doble.dardoventas.test';

export const art = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, name: `Artículo ${uid}`, description: null, category: 'Bebidas', priceSource: 'cup',
  priceCup: 250, priceUsd: null, disponible: true, updatedAt: '2026-10-07T00:00:00Z', photoUrl: null, ...extra,
});

export const respuestaCatalogo = (items: unknown[], etag = '"e1"') => new Response(
  JSON.stringify({ schema_version: 1, items }),
  { status: 200, headers: { ETag: etag, 'Content-Type': 'application/json' } },
);

export interface Llamada { url: string; init: RequestInit }

export function pedirFalso(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const pedir = (async (url: string | URL | Request, init: RequestInit = {}) => {
    llamadas.push({ url: String(url), init });
    return responder(String(url), init);
  }) as typeof fetch;
  return { pedir, llamadas };
}

export async function negocioVinculado(plan: 'free' | 'basic' | 'pro' = 'pro') {
  const p = await registrar('provider');
  await ponerPlan(p.providerId!, plan);
  const slug = `slug${uuidv4().replace(/-/g, '')}`;
  await q('UPDATE provider_profiles SET dardoventas_slug = $1 WHERE id = $2', [slug, p.providerId]);
  return { ...p, slug, perfil: { id: p.providerId!, dardoventas_slug: slug, dardoventas_etag: null as string | null } };
}
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`oficios-cuba/backend/test/dardoventas-sync.test.ts`:

```ts
import { execFileSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { leerCatalogo, rutaFoto, sincronizarNegocio, sincronizarPendientes, type ConfigDv } from '../src/notifier/dardoventas.js';
import { api } from './helpers.js';
import { art, BASE, negocioVinculado, pedirFalso, respuestaCatalogo } from './dardoventas-doble.js';

const cfg: ConfigDv = { base: BASE, secreto: 'secreto-de-prueba', proHasta: null };

interface Fila { uid_externo: string; name: string; price: number | null; price_type: string; price_currency: string; section: string | null; available: boolean; image: string | null; origen: string }
const importados = (providerId: string) => q<Fila>(
  `SELECT uid_externo, name, price, price_type, price_currency, section, available, image, origen
     FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas' ORDER BY uid_externo`, [providerId],
);
const perfil = (id: string) => qOne<{ dardoventas_slug: string | null; dardoventas_etag: string | null; dardoventas_fallos: number; dardoventas_reintento_en: string | null; dardoventas_synced_at: string | null; show_on_map: boolean }>(
  'SELECT dardoventas_slug, dardoventas_etag, dardoventas_fallos, dardoventas_reintento_en, dardoventas_synced_at, show_on_map FROM provider_profiles WHERE id = $1', [id],
);

describe('rutaFoto', () => {
  const slug = 'abcdefghijklmnop';
  it('traduce la URL del contrato a la ruta local del proxy', () => {
    expect(rutaFoto(`${BASE}/api/pub/foto/${slug}/u1.jpg?v=17`, BASE, slug, 'u1')).toBe(`/ext/dv/foto/${slug}/u1.jpg?v=17`);
  });
  it.each([
    ['otro origen', `https://malo.test/api/pub/foto/${slug}/u1.jpg?v=1`],
    ['otro slug', `${BASE}/api/pub/foto/otroslug12345678/u1.jpg?v=1`],
    ['otro uid', `${BASE}/api/pub/foto/${slug}/u2.jpg?v=1`],
    ['sin versión', `${BASE}/api/pub/foto/${slug}/u1.jpg`],
    ['versión con barra', `${BASE}/api/pub/foto/${slug}/u1.jpg?v=a%2Fb`],
    ['no es URL', 'foto.jpg'],
    ['no es cadena', 42],
  ])('%s → sin foto', (_n, url) => {
    expect(rutaFoto(url, BASE, slug, 'u1')).toBeNull();
  });
});

describe('leerCatalogo', () => {
  it('rechaza otra versión del esquema y JSON roto', () => {
    expect(() => leerCatalogo(JSON.stringify({ schema_version: 2, items: [] }), BASE, 'abcdefghijklmnop')).toThrow();
    expect(() => leerCatalogo('{"schema_version": 1, "items": [', BASE, 'abcdefghijklmnop')).toThrow();
  });
  it('recorta a los topes de la base y cuenta como presente un uid válido aunque el artículo venga roto', () => {
    const r = leerCatalogo(JSON.stringify({ schema_version: 1, items: [
      art('u1', { name: 'x'.repeat(300), category: 'c'.repeat(80), description: 'd'.repeat(2000) }),
      art('u2', { name: '' }),
      art('u3', { priceCup: 'caro' }),
      { uid: 'con espacio', name: 'Malo', disponible: true },
    ] }), BASE, 'abcdefghijklmnop');
    expect(r.presentes.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(r.articulos).toHaveLength(1);
    expect(r.articulos[0].name).toHaveLength(120);
    expect(r.articulos[0].section).toHaveLength(40);
    expect(r.articulos[0].description).toHaveLength(1000);
  });
});

describe('sincronizarNegocio', () => {
  it('200: importa con el precio tal cual, «A consultar» sin precio y la foto por el proxy', async () => {
    const n = await negocioVinculado();
    const { pedir, llamadas } = pedirFalso(() => respuestaCatalogo([
      art('a', { priceCup: 1250.5, photoUrl: `${BASE}/api/pub/foto/${n.slug}/a.jpg?v=9` }),
      art('b', { priceCup: null, disponible: false, category: '  ' }),
    ]));
    expect(await sincronizarNegocio(n.perfil, cfg, pedir)).toBe('actualizado');
    expect(llamadas[0].url).toBe(`${BASE}/api/pub/catalog/${n.slug}`);
    expect(await importados(n.providerId!)).toEqual([
      { uid_externo: 'a', name: 'Artículo a', price: 1250.5, price_type: 'fixed', price_currency: 'CUP', section: 'Bebidas', available: true, image: `/ext/dv/foto/${n.slug}/a.jpg?v=9`, origen: 'dardoventas' },
      { uid_externo: 'b', name: 'Artículo b', price: null, price_type: 'ask', price_currency: 'CUP', section: null, available: false, image: null, origen: 'dardoventas' },
    ]);
    expect((await perfil(n.providerId!))?.dardoventas_etag).toBe('"e1"');
  });

  it('el JSON público conserva la forma que espera la APK 0.2.5', async () => {
    const n = await negocioVinculado();
    const { pedir } = pedirFalso(() => respuestaCatalogo([art('a', { photoUrl: `${BASE}/api/pub/foto/${n.slug}/a.jpg?v=1` })]));
    await sincronizarNegocio(n.perfil, cfg, pedir);
    const [item] = (await api.get(`/api/catalog/provider/${n.providerId}`)).body.items;
    expect(typeof item.id).toBe('string');
    expect(typeof item.name).toBe('string');
    expect(typeof item.price).toBe('number');
    expect(['fixed', 'from', 'ask']).toContain(item.price_type);
    expect(item.price_currency).toBe('CUP');
    expect(item.image.startsWith('/')).toBe(true);
    expect(typeof item.available).toBe('boolean');
  });

  it('una segunda pasada manda If-None-Match y con 304 no toca nada', async () => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    const antes = await importados(n.providerId!);
    const { pedir, llamadas } = pedirFalso(() => new Response(null, { status: 304 }));
    expect(await sincronizarNegocio({ ...n.perfil, dardoventas_etag: '"e1"' }, cfg, pedir)).toBe('sin_cambios');
    expect(new Headers(llamadas[0].init.headers).get('If-None-Match')).toBe('"e1"');
    expect(await importados(n.providerId!)).toEqual(antes);
  });

  it('lo que ya no viene se borra; lo propio no se toca', async () => {
    const n = await negocioVinculado();
    await q("INSERT INTO catalog_items (id, provider_id, name, created_at) VALUES (gen_random_uuid(), $1, 'Propio', now())", [n.providerId]);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a'), art('b')])).pedir);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a', { name: 'Renombrado' })], '"e2"')).pedir);
    expect((await importados(n.providerId!)).map((f) => [f.uid_externo, f.name])).toEqual([['a', 'Renombrado']]);
    expect((await qOne("SELECT 1 FROM catalog_items WHERE provider_id = $1 AND name = 'Propio'", [n.providerId]))).toBeTruthy();
  });

  it('un artículo que llega roto no se borra ni se pisa', async () => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a'), art('b')])).pedir);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a'), art('b', { name: '', priceCup: 'x' })], '"e2"')).pedir);
    expect((await importados(n.providerId!)).map((f) => [f.uid_externo, f.name])).toEqual([['a', 'Artículo a'], ['b', 'Artículo b']]);
  });

  it.each([
    ['500', () => new Response('fallo', { status: 500 })],
    ['red caída', () => { throw new TypeError('fetch failed'); }],
    ['esquema desconocido', () => new Response(JSON.stringify({ schema_version: 2, items: [] }), { status: 200 })],
    ['JSON cortado', () => new Response('{"schema_version":1,"items":[', { status: 200 })],
  ])('%s: no vacía el catálogo y programa un reintento', async (_n, responder) => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    expect(await sincronizarNegocio(n.perfil, cfg, pedirFalso(responder as () => Response).pedir)).toBe('error');
    expect(await importados(n.providerId!)).toHaveLength(1);
    const p = await perfil(n.providerId!);
    expect(p?.dardoventas_fallos).toBe(1);
    expect(p?.dardoventas_reintento_en).not.toBeNull();
  });

  it('una respuesta de más de 5 MB sin Content-Length se corta sin tocar la base', async () => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    const trozo = new TextEncoder().encode('x'.repeat(1024 * 1024));
    let enviados = 0;
    const enorme = new ReadableStream<Uint8Array>({
      pull(ctrl) { if (enviados++ < 7) ctrl.enqueue(trozo); else ctrl.close(); },
    });
    expect(await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => new Response(enorme, { status: 200 })).pedir)).toBe('error');
    expect(enviados).toBeLessThanOrEqual(7);
    expect(await importados(n.providerId!)).toHaveLength(1);
  });

  it('410: retira los artículos, el vínculo y saca el negocio del mapa', async () => {
    const n = await negocioVinculado();
    await q('UPDATE provider_profiles SET show_on_map = true WHERE id = $1', [n.providerId]);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    expect(await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => new Response(null, { status: 410 })).pedir)).toBe('baja');
    expect(await importados(n.providerId!)).toHaveLength(0);
    expect(await perfil(n.providerId!)).toMatchObject({ dardoventas_slug: null, show_on_map: false });
  });

  it('si lo desvinculan mientras se descarga, no reimporta nada', async () => {
    const n = await negocioVinculado();
    const { pedir } = pedirFalso(async () => {
      await q('UPDATE provider_profiles SET dardoventas_slug = NULL WHERE id = $1', [n.providerId]);
      return respuestaCatalogo([art('a')]);
    });
    expect(await sincronizarNegocio(n.perfil, cfg, pedir)).toBe('desvinculado');
    expect(await importados(n.providerId!)).toHaveLength(0);
  });

  it('respeta el tope del plan: con Básico se ven 50 y el resto queda oculto', async () => {
    const n = await negocioVinculado('basic');
    const items = Array.from({ length: 60 }, (_, i) => art(`u${String(i).padStart(2, '0')}`));
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo(items)).pedir);
    const ocultos = await qOne<{ n: string }>('SELECT count(*) AS n FROM catalog_items WHERE provider_id = $1 AND hidden_by_plan', [n.providerId]);
    expect(Number(ocultos!.n)).toBe(10);
  });
});

describe('sincronizarPendientes', () => {
  it('con el catálogo sin cambios hace UNA petición cada 30 min, no una por vuelta', async () => {
    await q('UPDATE provider_profiles SET dardoventas_slug = NULL');
    const n = await negocioVinculado();
    const { pedir, llamadas } = pedirFalso((_url, init) => (new Headers(init.headers).get('If-None-Match')
      ? new Response(null, { status: 304 }) : respuestaCatalogo([art('a')])));
    expect(await sincronizarPendientes(cfg, pedir)).toBe(1);
    expect(await sincronizarPendientes(cfg, pedir)).toBe(0);
    await q("UPDATE provider_profiles SET dardoventas_synced_at = now() - interval '31 minutes' WHERE id = $1", [n.providerId]);
    expect(await sincronizarPendientes(cfg, pedir)).toBe(1);
    expect(llamadas).toHaveLength(2);
    expect(new Headers(llamadas[1].init.headers).get('If-None-Match')).toBe('"e1"');
  });

  it('no insiste con un negocio que está en reintento', async () => {
    await q('UPDATE provider_profiles SET dardoventas_slug = NULL');
    const n = await negocioVinculado();
    await q("UPDATE provider_profiles SET dardoventas_reintento_en = now() + interval '5 minutes' WHERE id = $1", [n.providerId]);
    const { pedir, llamadas } = pedirFalso(() => respuestaCatalogo([]));
    await sincronizarPendientes(cfg, pedir);
    expect(llamadas).toHaveLength(0);
  });
});

describe('aislamiento del notificador', () => {
  it('notifier/dardoventas.ts se carga sin JWT_SECRET (no arrastra config.ts)', () => {
    const backend = join(__dirname, '..');
    expect(() => execFileSync('npx', ['tsx', '-e', "require('./src/notifier/dardoventas.ts')"], {
      cwd: backend,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', DATABASE_URL: 'postgresql://x:x@127.0.0.1:1/x' },
      stdio: 'pipe',
    })).not.toThrow();
  });
});
```

- [ ] **Step 3: Correrlas y ver que fallan**

Run: `cd oficios-cuba/backend && npx vitest run test/dardoventas-sync.test.ts`
Expected: FAIL — `Cannot find module '../src/notifier/dardoventas.js'`.

- [ ] **Step 4: Implementar**

`oficios-cuba/backend/src/notifier/dardoventas.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { desvincular } from '../db/dardoventas.js';
import { aplicarLimiteDePlan } from '../db/limite-plan.js';
import { q, tx } from './db.js';

// Catálogo de DardoVentas (docs/superpowers/specs/2026-10-06-dardoventas-catalogo-design.md). Vive en
// el notificador porque es el único proceso con salida a internet. Un fallo del otro lado nunca
// vacía un catálogo: lo único que borra artículos es un 200 válido que ya no los trae, o un 410.

export interface ConfigDv {
  /** Origen de DardoVentas, sin barra final. */
  base: string;
  /** Secreto compartido del canje. null = canje apagado. */
  secreto: string | null;
  /** Fin del Profesional regalado. null = no se regala. */
  proHasta: Date | null;
}

export type Pedir = typeof fetch;

export const PERIODO_MIN = 30;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ARTICULOS = 5000;
export const SLUG = /^[A-Za-z0-9_-]{16,64}$/;
const UID = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION_FOTO = /^[A-Za-z0-9_-]{1,32}$/;

export interface ArticuloImportado {
  uid: string;
  name: string;
  description: string | null;
  section: string | null;
  price: number | null;
  available: boolean;
  image: string | null;
}

const raizDv = z.object({
  schema_version: z.literal(1),
  items: z.array(z.unknown()).max(MAX_ARTICULOS),
});

// Lista blanca: lo que no se nombra aquí no entra, aunque DardoVentas lo mande.
const articuloDv = z.object({
  uid: z.string().regex(UID),
  name: z.string().trim().min(1),
  description: z.string().nullish(),
  category: z.string().nullish(),
  priceCup: z.number().finite().min(0).max(100_000_000).nullish(),
  disponible: z.boolean(),
  photoUrl: z.unknown(),
});

const corta = (s: string | null | undefined, max: number) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : null;
};

/** La URL de la foto del contrato → la ruta local que sirve el proxy de oficio_web. Otra forma = sin foto. */
export function rutaFoto(url: unknown, base: string, slug: string, uid: string): string | null {
  if (typeof url !== 'string') return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.origin !== new URL(base).origin || u.pathname !== `/api/pub/foto/${slug}/${uid}.jpg`) return null;
  const v = u.searchParams.get('v');
  return v && VERSION_FOTO.test(v) ? `/ext/dv/foto/${slug}/${uid}.jpg?v=${v}` : null;
}

/**
 * Lanza si la raíz no vale (y entonces la pasada no toca nada). Un artículo roto se ignora, pero si
 * su uid es válido cuenta como presente: que venga mal no significa que lo hayan quitado.
 */
export function leerCatalogo(texto: string, base: string, slug: string) {
  const raiz = raizDv.parse(JSON.parse(texto));
  const presentes = new Set<string>();
  const articulos: ArticuloImportado[] = [];
  for (const crudo of raiz.items) {
    const uid = (crudo as { uid?: unknown } | null)?.uid;
    if (typeof uid === 'string' && UID.test(uid)) presentes.add(uid);
    const r = articuloDv.safeParse(crudo);
    if (!r.success) continue;
    const a = r.data;
    articulos.push({
      uid: a.uid,
      name: a.name.slice(0, 120),
      description: corta(a.description, 1000),
      section: corta(a.category, 40),
      price: a.priceCup ?? null,
      available: a.disponible,
      image: rutaFoto(a.photoUrl, base, slug, a.uid),
    });
  }
  return { presentes: [...presentes], articulos };
}

// El notificador tiene 128 MB: se lee por trozos y se corta en cuanto pasa del tope, venga o no
// Content-Length (que con gzip es el tamaño comprimido, así que solo sirve para cortar antes).
async function leerConTope(res: Response, max: number) {
  if (Number(res.headers.get('content-length')) > max) throw new Error('catálogo demasiado grande');
  if (!res.body) return '';
  const lector = res.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      throw new Error('catálogo demasiado grande');
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos).toString('utf8');
}

async function anotarFallo(id: string, motivo: string) {
  console.error(`dardoventas ${id}: ${motivo}`);
  // En el SET, dardoventas_fallos es todavía el valor viejo: 5, 10, 20… minutos, tope 6 h.
  await q(
    `UPDATE provider_profiles SET dardoventas_fallos = dardoventas_fallos + 1,
       dardoventas_reintento_en = now() + make_interval(mins => LEAST(360, 5 * power(2, LEAST(dardoventas_fallos, 7))::int))
     WHERE id = $1`,
    [id],
  );
}

type PerfilDv = { id: string; dardoventas_slug: string; dardoventas_etag: string | null };

export async function sincronizarNegocio(p: PerfilDv, cfg: ConfigDv, pedir: Pedir = fetch) {
  let res: Response;
  try {
    res = await pedir(`${cfg.base}/api/pub/catalog/${encodeURIComponent(p.dardoventas_slug)}`, {
      headers: { Accept: 'application/json', ...(p.dardoventas_etag ? { 'If-None-Match': p.dardoventas_etag } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    await anotarFallo(p.id, `red: ${(err as Error).message}`);
    return 'error' as const;
  }

  if (res.status === 304) {
    await q(
      `UPDATE provider_profiles SET dardoventas_synced_at = now(), dardoventas_fallos = 0, dardoventas_reintento_en = NULL
       WHERE id = $1 AND dardoventas_slug = $2`,
      [p.id, p.dardoventas_slug],
    );
    return 'sin_cambios' as const;
  }

  if (res.status === 410) {
    await tx(async (c) => {
      const vigente = await c.qOne('SELECT 1 FROM provider_profiles WHERE id = $1 AND dardoventas_slug = $2 FOR UPDATE', [p.id, p.dardoventas_slug]);
      if (vigente) await desvincular(c, p.id, true);
    });
    return 'baja' as const;
  }

  if (res.status !== 200) {
    await anotarFallo(p.id, `HTTP ${res.status}`);
    return 'error' as const;
  }

  let leido: ReturnType<typeof leerCatalogo>;
  try {
    leido = leerCatalogo(await leerConTope(res, MAX_BYTES), cfg.base, p.dardoventas_slug);
  } catch (err) {
    await anotarFallo(p.id, `catálogo ilegible: ${(err as Error).message}`);
    return 'error' as const;
  }

  const etag = res.headers.get('etag');
  // Una transacción por negocio, no una global: no bloquea la tabla durante toda la pasada.
  const hecho = await tx(async (c) => {
    // Pudieron desvincularlo mientras se descargaba: entonces no se reimporta nada.
    const vigente = await c.qOne('SELECT 1 FROM provider_profiles WHERE id = $1 AND dardoventas_slug = $2 FOR UPDATE', [p.id, p.dardoventas_slug]);
    if (!vigente) return false;
    const ahora = new Date().toISOString();
    for (const a of leido.articulos) {
      await c.q(
        `INSERT INTO catalog_items (id, provider_id, origen, uid_externo, name, description, price, price_type, price_currency, image, section, available, created_at)
         VALUES ($1, $2, 'dardoventas', $3, $4, $5, $6, $7, 'CUP', $8, $9, $10, $11)
         ON CONFLICT (provider_id, uid_externo) WHERE uid_externo IS NOT NULL DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price,
           price_type = EXCLUDED.price_type, price_currency = 'CUP', image = EXCLUDED.image,
           section = EXCLUDED.section, available = EXCLUDED.available, updated_at = EXCLUDED.created_at`,
        [uuidv4(), p.id, a.uid, a.name, a.description, a.price, a.price == null ? 'ask' : 'fixed', a.image, a.section, a.available, ahora],
      );
    }
    await c.q(
      `DELETE FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas' AND NOT (uid_externo = ANY($2::text[]))`,
      [p.id, leido.presentes],
    );
    await c.q(
      `UPDATE provider_profiles SET dardoventas_etag = $2, dardoventas_synced_at = now(), dardoventas_fallos = 0,
         dardoventas_reintento_en = NULL WHERE id = $1`,
      [p.id, etag],
    );
    await aplicarLimiteDePlan(c, p.id);
    return true;
  });
  return hecho ? 'actualizado' as const : 'desvinculado' as const;
}

/** Una vuelta: los negocios vinculados que llevan más de PERIODO_MIN sin sondear y no están en reintento. */
export async function sincronizarPendientes(cfg: ConfigDv, pedir: Pedir = fetch) {
  const perfiles = await q<PerfilDv>(
    `SELECT id, dardoventas_slug, dardoventas_etag FROM provider_profiles
      WHERE dardoventas_slug IS NOT NULL
        AND (dardoventas_reintento_en IS NULL OR dardoventas_reintento_en <= now())
        AND (dardoventas_synced_at IS NULL OR dardoventas_synced_at < now() - make_interval(mins => $1))
      ORDER BY dardoventas_synced_at NULLS FIRST
      LIMIT 20`,
    [PERIODO_MIN],
  );
  for (const p of perfiles) await sincronizarNegocio(p, cfg, pedir);
  return perfiles.length;
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `cd oficios-cuba/backend && npx vitest run test/dardoventas-sync.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/backend/src/notifier/dardoventas.ts oficios-cuba/backend/test/dardoventas-sync.test.ts oficios-cuba/backend/test/dardoventas-doble.ts
git commit -m "Notificador: sincroniza los catálogos de DardoVentas con If-None-Match

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Canje del código — API que apunta, notificador que canjea

**Files:**
- Create: `oficios-cuba/backend/src/routes/dardoventas.ts`
- Modify: `oficios-cuba/backend/src/app.ts:113` (registrar la ruta)
- Modify: `oficios-cuba/backend/src/notifier/dardoventas.ts` (añadir canje y `configDv`)
- Modify: `oficios-cuba/backend/src/notifier/index.ts` (esperar la v2 y arrancar los dos bucles)
- Create: `oficios-cuba/backend/test/dardoventas-vinculo.test.ts`

**Interfaces:**
- Consumes: tabla `dardoventas_canjes` (Tarea 1); `regalarPro`, `desvincular` (Tarea 2); `sincronizarNegocio`, `SLUG`, `ConfigDv`, `Pedir` (Tarea 5); `BASE`, `art`, `respuestaCatalogo`, `pedirFalso` (doble, Tarea 5).
- Produces (HTTP, solo proveedor):
  - `POST /api/dardoventas/vincular {code}` → `202 {id}`; `400` código mal formado; `409` ya vinculado; `429` más de 10 intentos en una hora.
  - `GET /api/dardoventas/estado` → `200 { vinculado: boolean, linked_at: string|null, synced_at: string|null, articulos: number, canje: { id: string, status: 'pendiente'|'ok'|'error', error: string|null } | null }`.
  - `DELETE /api/dardoventas/vincular` → `200 {ok: true}`.
- Produces (notificador): `canjearPendientes(cfg: ConfigDv, pedir?: Pedir): Promise<void>`, `configDv(env?: NodeJS.ProcessEnv): ConfigDv`, y los mensajes `MSG` (objeto con `caducado`, `apagado`, `codigo`, `red`, `otraCuenta`).

- [ ] **Step 1: Escribir las pruebas que fallan**

`oficios-cuba/backend/test/dardoventas-vinculo.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { canjearPendientes, configDv, MSG, type ConfigDv } from '../src/notifier/dardoventas.js';
import { api, ponerPlan, registrar } from './helpers.js';
import { art, BASE, pedirFalso, respuestaCatalogo } from './dardoventas-doble.js';

const CODIGO = 'codigo-de-prueba-123';
const hasta = new Date(Date.now() + 90 * 86_400_000);
const cfg: ConfigDv = { base: BASE, secreto: 'secreto-de-prueba', proHasta: hasta };
const slugNuevo = () => `slug${Math.random().toString(36).slice(2).padEnd(14, '0')}`;

// Cada prueba empieza sin canjes pendientes de las anteriores: canjearPendientes los procesa todos.
beforeEach(async () => { await q("UPDATE dardoventas_canjes SET status = 'error', code = NULL WHERE status = 'pendiente'"); });

const canje = (id: string) => qOne<{ status: string; error: string | null; code: string | null }>(
  'SELECT status, error, code FROM dardoventas_canjes WHERE id = $1', [id],
);
const perfil = (id: string) => qOne<{ dardoventas_slug: string | null; kind: string; business_name: string | null; subscription_plan: string; subscription_expires_at: string | null }>(
  'SELECT dardoventas_slug, kind, business_name, subscription_plan, subscription_expires_at FROM provider_profiles WHERE id = $1', [id],
);

/** Doble de DardoVentas: el canje devuelve `slug`; el catálogo, un artículo. */
function dobleCanje(slug: string, estado = 200) {
  return pedirFalso((url) => {
    if (url.endsWith('/api/pub/link')) {
      return estado === 200
        ? Response.json({ ok: true, slug, businessName: 'Cafetería La Esquina' })
        : new Response('{}', { status: estado });
    }
    return respuestaCatalogo([art('a')]);
  });
}

async function pedirVinculo() {
  const p = await registrar('provider');
  const r = await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: CODIGO });
  expect(r.status).toBe(202);
  return { ...p, canjeId: r.body.id as string };
}

describe('API: apuntar el canje', () => {
  it('solo un proveedor con sesión, y con un código bien formado', async () => {
    const cli = await registrar('client');
    expect((await api.post('/api/dardoventas/vincular').send({ code: CODIGO })).status).toBe(401);
    expect((await api.post('/api/dardoventas/vincular').set(cli.auth).send({ code: CODIGO })).status).toBe(403);
    const p = await registrar('provider');
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: 'a b' })).status).toBe(400);
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: 'x'.repeat(200) })).status).toBe(400);
  });

  it('un código nuevo sustituye al pendiente anterior', async () => {
    const { auth, canjeId } = await pedirVinculo();
    const otro = await api.post('/api/dardoventas/vincular').set(auth).send({ code: `${CODIGO}-2` });
    expect((await canje(canjeId))?.status).toBe('error');
    expect((await canje(canjeId))?.code).toBeNull();
    expect((await canje(otro.body.id))?.status).toBe('pendiente');
  });

  it('409 si ya está vinculado; 429 al undécimo intento en una hora', async () => {
    const p = await registrar('provider');
    for (let i = 0; i < 10; i++) {
      expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: `${CODIGO}-${i}` })).status).toBe(202);
    }
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: CODIGO })).status).toBe(429);
    await q('UPDATE provider_profiles SET dardoventas_slug = $1 WHERE id = $2', [slugNuevo(), p.providerId]);
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: CODIGO })).status).toBe(409);
  });

  it('estado: refleja el canje y el vínculo', async () => {
    const { auth, canjeId } = await pedirVinculo();
    const r = await api.get('/api/dardoventas/estado').set(auth);
    expect(r.body).toEqual({ vinculado: false, linked_at: null, synced_at: null, articulos: 0, canje: { id: canjeId, status: 'pendiente', error: null } });
  });

  it('desvincular desde el panel quita lo importado y deja lo propio', async () => {
    const { auth, providerId } = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slugNuevo()).pedir);
    await api.post('/api/catalog').set(auth).send({ name: 'Propio', price: 1 });
    expect((await api.delete('/api/dardoventas/vincular').set(auth)).status).toBe(200);
    const nombres = (await q<{ name: string }>('SELECT name FROM catalog_items WHERE provider_id = $1', [providerId])).map((r) => r.name);
    expect(nombres).toEqual(['Propio']);
    expect((await api.get('/api/dardoventas/estado').set(auth)).body.vinculado).toBe(false);
  });
});

describe('notificador: canjear', () => {
  it('canje bueno: guarda el slug, lo marca negocio, regala el plan e importa el catálogo', async () => {
    const { providerId, canjeId } = await pedirVinculo();
    const slug = slugNuevo();
    const { pedir, llamadas } = dobleCanje(slug);
    await canjearPendientes(cfg, pedir);

    const link = llamadas.find((l) => l.url === `${BASE}/api/pub/link`)!;
    expect(new Headers(link.init.headers).get('Authorization')).toBe('Bearer secreto-de-prueba');
    expect(JSON.parse(String(link.init.body))).toEqual({ code: CODIGO });

    expect(await canje(canjeId)).toEqual({ status: 'ok', error: null, code: null });
    const p = await perfil(providerId!);
    expect(p).toMatchObject({ dardoventas_slug: slug, kind: 'negocio', subscription_plan: 'pro' });
    expect(new Date(p!.subscription_expires_at!).getTime()).toBe(hasta.getTime());
    expect(llamadas.some((l) => l.url === `${BASE}/api/pub/catalog/${slug}`)).toBe(true);
    expect(await qOne("SELECT 1 FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas'", [providerId])).toBeTruthy();
  });

  it('el nombre del negocio solo se rellena si el perfil no tenía', async () => {
    const { providerId } = await pedirVinculo();
    await q("UPDATE provider_profiles SET business_name = 'Mi nombre' WHERE id = $1", [providerId]);
    await canjearPendientes(cfg, dobleCanje(slugNuevo()).pedir);
    expect((await perfil(providerId!))?.business_name).toBe('Mi nombre');
  });

  it('código rechazado por DardoVentas: error claro y el código se borra', async () => {
    const { providerId, canjeId } = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slugNuevo(), 404).pedir);
    expect(await canje(canjeId)).toEqual({ status: 'error', error: MSG.codigo, code: null });
    expect((await perfil(providerId!))?.dardoventas_slug).toBeNull();
  });

  it('código caducado (más de 15 min): error sin llamar a DardoVentas', async () => {
    const { canjeId } = await pedirVinculo();
    await q("UPDATE dardoventas_canjes SET created_at = now() - interval '16 minutes' WHERE id = $1", [canjeId]);
    const { pedir, llamadas } = dobleCanje(slugNuevo());
    await canjearPendientes(cfg, pedir);
    expect((await canje(canjeId))?.error).toBe(MSG.caducado);
    expect(llamadas).toHaveLength(0);
  });

  it('sin secreto configurado: error sin llamar', async () => {
    const { canjeId } = await pedirVinculo();
    const { pedir, llamadas } = dobleCanje(slugNuevo());
    await canjearPendientes({ ...cfg, secreto: null }, pedir);
    expect((await canje(canjeId))?.error).toBe(MSG.apagado);
    expect(llamadas).toHaveLength(0);
  });

  it('un negocio de DardoVentas no se vincula a dos cuentas', async () => {
    const slug = slugNuevo();
    const primero = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slug).pedir);
    const segundo = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slug).pedir);
    expect((await canje(segundo.canjeId))?.error).toBe(MSG.otraCuenta);
    expect((await perfil(segundo.providerId!))?.dardoventas_slug).toBeNull();
    expect((await perfil(primero.providerId!))?.dardoventas_slug).toBe(slug);
  });

  it('con el regalo ya vencido se vincula pero no se toca el plan', async () => {
    const { providerId } = await pedirVinculo();
    await ponerPlan(providerId!, 'basic', null);
    await canjearPendientes({ ...cfg, proHasta: new Date(Date.now() - 1000) }, dobleCanje(slugNuevo()).pedir);
    expect(await perfil(providerId!)).toMatchObject({ subscription_plan: 'basic', subscription_expires_at: null });
  });
});

describe('configDv', () => {
  it('lee el secreto de un archivo y nunca del entorno', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dv-'));
    writeFileSync(join(dir, 'secreto'), '  s3creto\n');
    const c = configDv({ DARDOVENTAS_SECRETO_FILE: join(dir, 'secreto'), DARDOVENTAS_PRO_HASTA: '2027-03-31', DARDOVENTAS_URL: 'https://x.test/' });
    expect(c).toEqual({ base: 'https://x.test', secreto: 's3creto', proHasta: new Date('2027-03-31') });
    expect(configDv({ DARDOVENTAS_SECRETO: 'no-se-lee' }).secreto).toBeNull();
    expect(configDv({ DARDOVENTAS_PRO_HASTA: 'mañana' }).proHasta).toBeNull();
    expect(configDv({}).base).toBe('https://ventas.dardoit.com');
  });
});
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `cd oficios-cuba/backend && npx vitest run test/dardoventas-vinculo.test.ts`
Expected: FAIL — `canjearPendientes` no está exportado.

- [ ] **Step 3: Implementar la ruta de la API**

`oficios-cuba/backend/src/routes/dardoventas.ts`:

```ts
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { tx, q, qOne } from '../db/acceso.js';
import { desvincular } from '../db/dardoventas.js';
import { providerProfileIdFor } from '../db/index.js';
import { authMiddleware, AuthRequest, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

// La API no tiene salida a internet: solo apunta el código. Lo canjea oficio_notifier
// (notifier/dardoventas.ts), y la página de vínculo consulta /estado hasta ver el resultado.
const router = Router();

const MAX_INTENTOS_HORA = 10;
const entrada = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'El código no es válido') });

async function miPerfil(req: AuthRequest) {
  const id = await providerProfileIdFor(req.user!.id);
  if (!id) throw new AppError('Perfil de proveedor no encontrado', 404);
  return id;
}

router.post('/vincular', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = await miPerfil(req);
  const { code } = entrada.parse(req.body);
  const id = uuidv4();
  await tx(async (c) => {
    const perfil = await c.qOne<{ dardoventas_slug: string | null }>(
      'SELECT dardoventas_slug FROM provider_profiles WHERE id = $1 FOR UPDATE', [providerId],
    );
    if (perfil?.dardoventas_slug) throw new AppError('Tu negocio ya está conectado con DardoVentas.', 409);
    const { n } = (await c.qOne<{ n: string }>(
      "SELECT count(*) AS n FROM dardoventas_canjes WHERE provider_id = $1 AND created_at > now() - interval '1 hour'", [providerId],
    ))!;
    if (Number(n) >= MAX_INTENTOS_HORA) throw new AppError('Demasiados intentos. Prueba otra vez dentro de una hora.', 429);
    await c.q(
      `UPDATE dardoventas_canjes SET status = 'error', error = 'Sustituido por un código más nuevo.', code = NULL, done_at = now()
       WHERE provider_id = $1 AND status = 'pendiente'`,
      [providerId],
    );
    await c.q('INSERT INTO dardoventas_canjes (id, provider_id, code) VALUES ($1, $2, $3)', [id, providerId, code]);
  });
  res.status(202).json({ id });
}));

router.get('/estado', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = await miPerfil(req);
  const p = (await qOne<{ vinculado: boolean; linked_at: string | null; synced_at: string | null; articulos: string }>(
    `SELECT pp.dardoventas_slug IS NOT NULL AS vinculado, pp.dardoventas_linked_at AS linked_at,
            pp.dardoventas_synced_at AS synced_at,
            (SELECT count(*) FROM catalog_items ci WHERE ci.provider_id = pp.id AND ci.origen = 'dardoventas') AS articulos
       FROM provider_profiles pp WHERE pp.id = $1`,
    [providerId],
  ))!;
  const canje = await qOne<{ id: string; status: string; error: string | null }>(
    'SELECT id, status, error FROM dardoventas_canjes WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 1', [providerId],
  );
  res.json({ ...p, articulos: Number(p.articulos), canje: canje ?? null });
}));

router.delete('/vincular', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = await miPerfil(req);
  await tx((c) => desvincular(c, providerId, false));
  res.json({ ok: true });
}));

export default router;
```

(Si `q` queda sin usar, quitarlo del import.)

En `oficios-cuba/backend/src/app.ts`, junto a los demás imports de rutas, `import dardoventasRoutes from './routes/dardoventas.js';`, y después de `app.use('/api/app', appMovilRoutes);`:

```ts
app.use('/api/dardoventas', dardoventasRoutes);
```

- [ ] **Step 4: Implementar el canje en el notificador**

Añadir a `oficios-cuba/backend/src/notifier/dardoventas.ts` (y a sus imports: `existsSync`, `readFileSync` de `fs`; `regalarPro` de `../db/dardoventas.js`):

```ts
export const TTL_CODIGO_MIN = 15;

export const MSG = {
  caducado: 'El código caducó. Vuelve a mi.dardoventas.com y pide uno nuevo.',
  apagado: 'La conexión con DardoVentas todavía no está activa. Prueba más tarde.',
  codigo: 'DardoVentas no reconoce ese código o ya se usó. Pide uno nuevo en mi.dardoventas.com.',
  red: 'No pudimos hablar con DardoVentas. Prueba otra vez dentro de unos minutos.',
  otraCuenta: 'Ese negocio de DardoVentas ya está conectado con otra cuenta de Encuentrauno.',
} as const;

/** El secreto se lee de un archivo (montado solo en este contenedor), nunca de una variable. */
export function configDv(env: NodeJS.ProcessEnv = process.env): ConfigDv {
  const archivo = env.DARDOVENTAS_SECRETO_FILE;
  const secreto = archivo && existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() || null : null;
  const hasta = env.DARDOVENTAS_PRO_HASTA ? new Date(env.DARDOVENTAS_PRO_HASTA) : null;
  return {
    base: (env.DARDOVENTAS_URL || 'https://ventas.dardoit.com').replace(/\/+$/, ''),
    secreto,
    proHasta: hasta && !Number.isNaN(hasta.getTime()) ? hasta : null,
  };
}

const respuestaCanje = z.object({
  ok: z.literal(true),
  slug: z.string().regex(SLUG),
  businessName: z.string().trim().max(120).nullish(),
});

// El código no se guarda más de lo necesario: se borra al terminar, salga bien o mal.
async function terminar(id: string, error: string | null) {
  await q(
    'UPDATE dardoventas_canjes SET status = $2, error = $3, code = NULL, done_at = now() WHERE id = $1',
    [id, error ? 'error' : 'ok', error],
  );
}

async function canjear(k: { id: string; provider_id: string; code: string }, cfg: ConfigDv, pedir: Pedir) {
  if (!cfg.secreto) return terminar(k.id, MSG.apagado);
  let res: Response;
  try {
    res = await pedir(`${cfg.base}/api/pub/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secreto}` },
      body: JSON.stringify({ code: k.code }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return terminar(k.id, MSG.red);
  }
  if ([400, 404, 409, 410].includes(res.status)) return terminar(k.id, MSG.codigo);
  if (res.status === 401) console.error('dardoventas: el secreto del canje no vale (401)');
  if (res.status !== 200) return terminar(k.id, MSG.red);
  const r = respuestaCanje.safeParse(await res.json().catch(() => null));
  if (!r.success) return terminar(k.id, MSG.red);

  const { slug, businessName } = r.data;
  const error = await tx(async (c) => {
    if (await c.qOne('SELECT 1 FROM provider_profiles WHERE dardoventas_slug = $1 AND id <> $2', [slug, k.provider_id])) {
      return MSG.otraCuenta;
    }
    await c.q(
      `UPDATE provider_profiles SET dardoventas_slug = $2, dardoventas_linked_at = now(), dardoventas_etag = NULL,
         dardoventas_synced_at = NULL, dardoventas_fallos = 0, dardoventas_reintento_en = NULL,
         kind = 'negocio', business_name = COALESCE(NULLIF(business_name, ''), $3), updated_at = now()
       WHERE id = $1`,
      [k.provider_id, slug, businessName ?? null],
    );
    if (cfg.proHasta && cfg.proHasta > new Date()) await regalarPro(c, k.provider_id, cfg.proHasta);
    return null;
  });
  await terminar(k.id, error);
  if (!error) await sincronizarNegocio({ id: k.provider_id, dardoventas_slug: slug, dardoventas_etag: null }, cfg, pedir);
}

export async function canjearPendientes(cfg: ConfigDv, pedir: Pedir = fetch) {
  await q(
    `UPDATE dardoventas_canjes SET status = 'error', error = $1, code = NULL, done_at = now()
     WHERE status = 'pendiente' AND created_at < now() - make_interval(mins => $2)`,
    [MSG.caducado, TTL_CODIGO_MIN],
  );
  const pendientes = await q<{ id: string; provider_id: string; code: string }>(
    "SELECT id, provider_id, code FROM dardoventas_canjes WHERE status = 'pendiente' ORDER BY created_at LIMIT 10",
  );
  for (const k of pendientes) await canjear(k, cfg, pedir);
}
```

En `oficios-cuba/backend/src/notifier/index.ts`:

1. Import: `import { canjearPendientes, configDv, sincronizarPendientes } from './dardoventas.js';`
2. `esperarEsquema()` tiene que esperar también la v2, que trae las columnas que usan los bucles nuevos. Su consulta pasa a:

```ts
    const listo = await q<{ n: string }>(
      `SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'
                 AND table_name IN ('notifications', 'push_outbox', 'dardoventas_canjes')) AS n`,
    );
    if (Number(listo[0].n) === 3) return;
```

3. En `main()`, antes del `await Promise.all([`:

```ts
  const dv = configDv();
  console.log(`DardoVentas: canje ${dv.secreto ? 'activo' : 'apagado (falta DARDOVENTAS_SECRETO_FILE)'}, ` +
    `plan regalado ${dv.proHasta ? `hasta ${dv.proHasta.toISOString().slice(0, 10)}` : 'no'}`);
```

y dentro del `Promise.all`, después del bucle `'enviar'`:

```ts
    bucle('dardoventas-canje', () => canjearPendientes(dv), 3000),
    bucle('dardoventas-catalogo', () => sincronizarPendientes(dv), 60_000),
```

- [ ] **Step 5: Correr las pruebas**

Run: `cd oficios-cuba/backend && npx vitest run test/dardoventas-vinculo.test.ts test/dardoventas-sync.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/backend/src/routes/dardoventas.ts oficios-cuba/backend/src/app.ts oficios-cuba/backend/src/notifier/dardoventas.ts oficios-cuba/backend/src/notifier/index.ts oficios-cuba/backend/test/dardoventas-vinculo.test.ts
git commit -m "Vincular con DardoVentas: la API apunta el código y el notificador lo canjea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Proxy de fotos en `oficio_web`

**Files:**
- Modify: `oficios-cuba/frontend/nginx.conf` (cabecera del archivo y un `location` nuevo antes de `location = /api/tasas`)
- Create: `oficios-cuba/frontend/test-nginx/fotos.sh`
- Create: `oficios-cuba/frontend/test-nginx/doble.conf`

**Interfaces:**
- Consumes: la ruta `/ext/dv/foto/<slug>/<uid>.jpg?v=<versión>` que guarda la Tarea 5.
- Produces: `GET /ext/dv/foto/…` en `oficio_web` → proxy a `https://ventas.dardoit.com/api/pub/foto/…`, con caché `dvfotos` (`max_size=64m`).

- [ ] **Step 1: Escribir la prueba (un script contra dos nginx en una red Docker de usar y tirar)**

`oficios-cuba/frontend/test-nginx/doble.conf` (hace de `ventas.dardoit.com` y de `oficio_api`, que nginx necesita resolver al arrancar):

```nginx
server {
    listen 443 ssl;
    ssl_certificate /certs/cert.pem;
    ssl_certificate_key /certs/key.pem;

    location = /api/pub/foto/AAAAAAAAAAAAAAAAAAAAAA/u1.jpg {
        if ($arg_v != "7") { return 301 https://ventas.dardoit.com/api/pub/foto/AAAAAAAAAAAAAAAAAAAAAA/u1.jpg?v=7; }
        default_type image/jpeg;
        return 200 "JPEG-DE-PRUEBA";
    }
    location = /api/pub/foto/AAAAAAAAAAAAAAAAAAAAAA/html.jpg {
        default_type text/html;
        return 200 "<script>alert(1)</script>";
    }
    location / { return 404; }
}
server { listen 3000; return 200 "api"; }
```

`oficios-cuba/frontend/test-nginx/fotos.sh`:

```bash
#!/usr/bin/env bash
# Prueba del proxy de fotos de DardoVentas (nginx.conf, location ^~ /ext/dv/foto/) sin salir a internet:
# un nginx "doble" hace de ventas.dardoit.com con un certificado autofirmado (el proxy no verifica,
# igual que /api/tasas) y el nginx.conf real se monta en un nginx limpio. No construye la SPA.
set -euo pipefail
cd "$(dirname "$0")"
RED=oficio-dv-prueba-$$
TMP=$(mktemp -d)
PUERTO=18089
limpiar() { docker rm -f "$RED-doble" "$RED-web" >/dev/null 2>&1 || true; docker network rm "$RED" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpiar EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=ventas.dardoit.com" \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null
chmod 644 "$TMP"/*.pem
docker network create "$RED" >/dev/null
docker run -d --name "$RED-doble" --network "$RED" --network-alias ventas.dardoit.com --network-alias oficio_api \
  -v "$PWD/doble.conf:/etc/nginx/conf.d/default.conf:ro" -v "$TMP:/certs:ro" nginx:1.27-alpine >/dev/null
docker run -d --name "$RED-web" --network "$RED" -p 127.0.0.1:$PUERTO:80 \
  -v "$PWD/../nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine >/dev/null
sleep 2

URL=http://127.0.0.1:$PUERTO/ext/dv/foto
S=AAAAAAAAAAAAAAAAAAAAAA
fallos=0
espera() { # descripción, valor obtenido, valor esperado
  if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FALLO $1: obtuve «$2», esperaba «$3»"; fallos=$((fallos + 1)); fi
}
estado() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
cabecera() { curl -s -D - -o /dev/null "$1" | tr -d '\r' | awk -v h="$2" 'tolower($0) ~ "^"tolower(h)":" { sub(/^[^:]*: /, ""); print; exit }'; }

espera "foto vigente: 200"                 "$(estado "$URL/$S/u1.jpg?v=7")" 200
espera "foto vigente: cuerpo"               "$(curl -s "$URL/$S/u1.jpg?v=7")" "JPEG-DE-PRUEBA"
espera "foto vigente: caché un año"         "$(cabecera "$URL/$S/u1.jpg?v=7" Cache-Control)" "public, max-age=31536000, immutable"
espera "versión vieja: 301"                 "$(estado "$URL/$S/u1.jpg?v=6")" 301
espera "versión vieja: Location local"      "$(cabecera "$URL/$S/u1.jpg?v=6" Location)" "/ext/dv/foto/$S/u1.jpg?v=7"
espera "versión vieja: caché corta"         "$(cabecera "$URL/$S/u1.jpg?v=6" Cache-Control)" "public, max-age=300"
espera "sin versión: 404"                   "$(estado "$URL/$S/u1.jpg")" 404
espera "versión con barra: 404"             "$(estado "$URL/$S/u1.jpg?v=a%2Fb")" 404
espera "slug corto: 404"                    "$(estado "$URL/corto/u1.jpg?v=7")" 404
espera "otra extensión: 404"                "$(estado "$URL/$S/u1.png?v=7")" 404
espera "subir de carpeta: 404"              "$(estado "$URL/$S/..%2F..%2Fapi/u1.jpg?v=7")" 404
espera "HTML del otro lado: sandbox"        "$(cabecera "$URL/$S/html.jpg?v=1" Content-Security-Policy)" "default-src 'none'; sandbox"
espera "HTML del otro lado: nosniff"        "$(cabecera "$URL/$S/html.jpg?v=1" X-Content-Type-Options)" "nosniff"
grep -q 'keys_zone=dvfotos:[0-9]*m max_size=64m' ../nginx.conf && espera "caché acotada" ok ok || espera "caché acotada" "sin max_size" ok

docker stop "$RED-doble" >/dev/null
espera "DardoVentas caído: sigue sirviendo la caché" "$(curl -s "$URL/$S/u1.jpg?v=7")" "JPEG-DE-PRUEBA"

[[ $fallos -eq 0 ]] && echo "Todo bien." || { echo "$fallos fallos."; exit 1; }
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `chmod +x oficios-cuba/frontend/test-nginx/fotos.sh && oficios-cuba/frontend/test-nginx/fotos.sh`
Expected: FAIL — `foto vigente: 200` obtiene 404 (la ruta no existe todavía; cae en la regex de extensiones).

- [ ] **Step 3: Implementar**

En `oficios-cuba/frontend/nginx.conf`, después de la línea `proxy_cache_path /var/cache/nginx/tasas …`:

```nginx
# Fotos del catálogo importado de DardoVentas (miniaturas de 256 px, ~12 MB todas hoy). max_size es
# obligatorio: el disco de vps2 va al 79 % y sin tope la caché crece hasta llenarlo.
proxy_cache_path /var/cache/nginx/dvfotos levels=1:2 keys_zone=dvfotos:2m max_size=64m inactive=30d use_temp_path=off;

# Un año solo para la foto buena: la URL lleva su versión. Un 301 (versión vieja) o un 404 cambian.
map $status $dv_foto_cache {
    200     "public, max-age=31536000, immutable";
    default "public, max-age=300";
}
```

Y dentro del `server`, justo antes del comentario `# Coincidencia exacta: gana a ^~ /api/.`:

```nginx
    # Fotos del catálogo de DardoVentas. `^~` porque si no la regex de extensiones de abajo se queda
    # con el .jpg. Lo que manda el visitante solo pasa si encaja en la regex (capturas con nombre:
    # el `if` de la versión borraría $1/$2), y el destino es fijo.
    location ^~ /ext/dv/foto/ {
        location ~ "^/ext/dv/foto/(?<dv_slug>[A-Za-z0-9_-]{16,64})/(?<dv_uid>[A-Za-z0-9_-]{1,64})\.jpg$" {
            if ($arg_v !~ "^[A-Za-z0-9_-]{1,32}$") { return 404; }
            resolver 127.0.0.11 valid=300s ipv6=off;
            resolver_timeout 5s;
            set $dv_foto_upstream https://ventas.dardoit.com/api/pub/foto/$dv_slug/$dv_uid.jpg?v=$arg_v;
            proxy_pass $dv_foto_upstream;
            proxy_ssl_server_name on;
            proxy_set_header Host ventas.dardoit.com;
            proxy_set_header Cookie "";
            proxy_set_header Authorization "";
            proxy_set_header CF-Connecting-IP "";
            proxy_set_header X-Forwarded-For "";
            proxy_hide_header Set-Cookie;
            proxy_hide_header Cache-Control;
            proxy_hide_header Content-Security-Policy;
            proxy_ignore_headers Set-Cookie Cache-Control Expires;
            # La versión vieja redirige a la buena: que el navegador vuelva aquí, no a DardoVentas
            # (la CSP de la web no le deja cargar imágenes de otro origen).
            proxy_redirect https://ventas.dardoit.com/api/pub/foto/ /ext/dv/foto/;
            proxy_connect_timeout 5s;
            proxy_read_timeout 10s;
            proxy_cache dvfotos;
            proxy_cache_key "$dv_slug/$dv_uid/$arg_v";
            proxy_cache_valid 200 30d;
            proxy_cache_valid 301 404 5m;
            proxy_cache_use_stale error timeout invalid_header updating http_500 http_502 http_503 http_504;
            proxy_cache_background_update on;
            proxy_cache_lock on;
            add_header Cache-Control $dv_foto_cache always;
            add_header X-Content-Type-Options "nosniff" always;
            # Se sirve desde nuestro origen: si del otro lado llega HTML en vez de una foto, no puede
            # ejecutar nada. En un <img> la CSP no afecta.
            add_header Content-Security-Policy "default-src 'none'; sandbox" always;
        }
        return 404;
    }
```

- [ ] **Step 4: Correr la prueba**

Run: `oficios-cuba/frontend/test-nginx/fotos.sh`
Expected: todas las líneas `ok` y `Todo bien.`; código de salida 0.

Si `subir de carpeta` diera otra cosa que 404, **no** relajar la prueba: nginx normaliza `%2F` en `$uri` pero la regex se aplica sobre la URI ya decodificada, y lo que importa es que nunca llegue al proxy algo fuera del patrón.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/frontend/nginx.conf oficios-cuba/frontend/test-nginx/
git commit -m "nginx: fotos de DardoVentas por proxy con caché acotada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web — página de vínculo y catálogo de solo lectura

**Files:**
- Modify: `oficios-cuba/frontend/src/types/index.ts` (tipo `EstadoDardoVentas`)
- Modify: `oficios-cuba/frontend/src/services/api.ts` (cliente `dardoventasApi`)
- Create: `oficios-cuba/frontend/src/pages/VincularDardoVentas.tsx`
- Create: `oficios-cuba/frontend/src/pages/VincularDardoVentas.test.tsx`
- Modify: `oficios-cuba/frontend/src/App.tsx:71` (ruta pública)
- Modify: `oficios-cuba/frontend/src/components/GoogleButton.tsx:64-72`
- Create: `oficios-cuba/frontend/src/components/catalog/admin/EstadoDardoVentas.tsx`
- Modify: `oficios-cuba/frontend/src/pages/dashboard/Catalogo.tsx`
- Create: `oficios-cuba/frontend/src/pages/dashboard/Catalogo.test.tsx`

**Interfaces:**
- Consumes: `POST|DELETE /api/dardoventas/vincular`, `GET /api/dardoventas/estado` (Tarea 6); `origen` en los artículos (Tarea 3).
- Produces: `dardoventasApi.vincular(code: string)`, `dardoventasApi.estado()`, `dardoventasApi.desvincular()`; ruta `/vincular/dardoventas`; objeto exportado `ESPERA = { intervaloMs: 2000, maxMs: 45000 }` en `VincularDardoVentas.tsx` (las pruebas lo acortan).

- [ ] **Step 1: Tipos y cliente**

`oficios-cuba/frontend/src/types/index.ts`, al final:

```ts
export interface EstadoDardoVentas {
  vinculado: boolean;
  linked_at: string | null;
  synced_at: string | null;
  articulos: number;
  canje: { id: string; status: 'pendiente' | 'ok' | 'error'; error: string | null } | null;
}
```

`oficios-cuba/frontend/src/services/api.ts`, después de `catalogApi` (y `EstadoDardoVentas` en el import de tipos):

```ts
export const dardoventasApi = {
  vincular: (code: string) => api.post<{ id: string }>('/dardoventas/vincular', { code }),
  estado: () => api.get<EstadoDardoVentas>('/dardoventas/estado'),
  desvincular: () => api.delete('/dardoventas/vincular'),
};
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`oficios-cuba/frontend/src/pages/VincularDardoVentas.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VincularDardoVentas, { ESPERA } from './VincularDardoVentas';
import { dardoventasApi } from '../services/api';

const auth = { user: null as null | { user_type: 'client' | 'provider' }, isLoading: false };
vi.mock('../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../hooks/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../services/api', async () => {
  const real = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...real, dardoventasApi: { vincular: vi.fn(), estado: vi.fn(), desvincular: vi.fn() } };
});

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{l.pathname + l.search}</p>;
}

function montar(url = '/vincular/dardoventas?code=abcdefgh123') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/vincular/dardoventas" element={<VincularDardoVentas />} />
        <Route path="*" element={<Donde />} />
      </Routes>
    </MemoryRouter>,
  );
}

const estado = (canje: { status: 'pendiente' | 'ok' | 'error'; error?: string | null }) => ({
  data: { vinculado: canje.status === 'ok', linked_at: null, synced_at: null, articulos: 0, canje: { id: 'k1', error: null, ...canje } },
});

beforeEach(() => {
  ESPERA.intervaloMs = 5;
  ESPERA.maxMs = 200;
  vi.mocked(dardoventasApi.vincular).mockResolvedValue({ data: { id: 'k1' } } as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.user = null; });

describe('VincularDardoVentas', () => {
  it('sin sesión manda a crear una cuenta de negocio y conserva el código', () => {
    montar();
    const next = encodeURIComponent('/vincular/dardoventas?code=abcdefgh123');
    expect(screen.getByTestId('donde').textContent).toBe(`/registro?tipo=provider&next=${next}`);
  });

  it('sin código explica de dónde se saca', () => {
    auth.user = { user_type: 'provider' };
    montar('/vincular/dardoventas');
    expect(screen.getByText(/mi\.dardoventas\.com/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /conectar/i })).toBeNull();
  });

  it('con una cuenta de cliente no deja conectar', () => {
    auth.user = { user_type: 'client' };
    montar();
    expect(screen.getByText(/cuenta de cliente/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /conectar/i })).toBeNull();
  });

  it('conecta, espera al canje y lleva a completar la ficha', async () => {
    auth.user = { user_type: 'provider' };
    vi.mocked(dardoventasApi.estado)
      .mockResolvedValueOnce(estado({ status: 'pendiente' }) as never)
      .mockResolvedValue(estado({ status: 'ok' }) as never);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /conectar mi catálogo/i }));
    await waitFor(() => expect(screen.getByTestId('donde').textContent).toBe('/dashboard/perfil'));
    expect(dardoventasApi.vincular).toHaveBeenCalledWith('abcdefgh123');
  });

  it('enseña el error que dio el canje', async () => {
    auth.user = { user_type: 'provider' };
    vi.mocked(dardoventasApi.estado).mockResolvedValue(estado({ status: 'error', error: 'El código caducó.' }) as never);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /conectar mi catálogo/i }));
    expect(await screen.findByText('El código caducó.')).toBeTruthy();
  });

  it('si tarda demasiado, lo dice en vez de quedarse girando', async () => {
    auth.user = { user_type: 'provider' };
    vi.mocked(dardoventasApi.estado).mockResolvedValue(estado({ status: 'pendiente' }) as never);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /conectar mi catálogo/i }));
    expect(await screen.findByText(/está tardando/i)).toBeTruthy();
  });
});
```

`oficios-cuba/frontend/src/pages/dashboard/Catalogo.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Catalogo from './Catalogo';
import { catalogApi, dardoventasApi, providerApi } from '../../services/api';

vi.mock('../../hooks/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../hooks/useTasa', () => ({ useTasa: () => 500 }));
vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...real,
    catalogApi: { ...real.catalogApi, mine: vi.fn() },
    providerApi: { ...real.providerApi, getMyProfile: vi.fn() },
    dardoventasApi: { vincular: vi.fn(), estado: vi.fn(), desvincular: vi.fn() },
  };
});

const item = (name: string, origen: 'propio' | 'dardoventas') => ({
  id: name, name, description: null, price: 250, price_type: 'fixed', price_currency: 'CUP', image: null, section: null,
  available: true, created_at: '2026-10-07T00:00:00Z', origen, convertible: origen === 'propio', hidden_by_plan: false,
});

beforeEach(() => {
  vi.mocked(catalogApi.mine).mockResolvedValue({ data: { items: [item('Importado', 'dardoventas'), item('Propio', 'propio')], max: 1000, plan: 'Profesional' } } as never);
  vi.mocked(providerApi.getMyProfile).mockResolvedValue({ data: { provider: { id: 'p1' } } } as never);
  vi.mocked(dardoventasApi.estado).mockResolvedValue({ data: { vinculado: true, linked_at: '2026-10-07T00:00:00Z', synced_at: new Date().toISOString(), articulos: 1, canje: null } } as never);
  vi.mocked(dardoventasApi.desvincular).mockResolvedValue({ data: { ok: true } } as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const fila = (nombre: string) => screen.getByText(nombre).closest('li')!;

describe('Catálogo del panel con artículos importados', () => {
  it('lo importado no tiene editar, borrar ni interruptor, y no enseña equivalente en USD', async () => {
    render(<MemoryRouter><Catalogo /></MemoryRouter>);
    await screen.findByText('Importado');
    const imp = within(fila('Importado'));
    expect(imp.queryByRole('button', { name: /editar/i })).toBeNull();
    expect(imp.queryByRole('button', { name: /borrar/i })).toBeNull();
    expect(imp.queryByRole('checkbox')).toBeNull();
    expect(imp.getByText(/DardoVentas/)).toBeTruthy();
    expect(imp.queryByText(/≈/)).toBeNull();
    const prop = within(fila('Propio'));
    expect(prop.getByRole('button', { name: /editar/i })).toBeTruthy();
  });

  it('desconectar pide confirmación y recarga', async () => {
    render(<MemoryRouter><Catalogo /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /desconectar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /sí, desconectar/i }));
    await waitFor(() => expect(dardoventasApi.desvincular).toHaveBeenCalled());
    await waitFor(() => expect(catalogApi.mine).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 3: Correrlas y ver que fallan**

Run: `cd oficios-cuba/frontend && npx vitest run src/pages/VincularDardoVentas.test.tsx src/pages/dashboard/Catalogo.test.tsx`
Expected: FAIL — no existe `./VincularDardoVentas`; en `Catalogo`, el importado tiene botón «Editar».

- [ ] **Step 4: Implementar la página de vínculo**

`oficios-cuba/frontend/src/pages/VincularDardoVentas.tsx`:

```tsx
import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiError, dardoventasApi } from '../services/api';
import { Alert, PageLoader, Spinner } from '../components/ui';

/** Cada cuánto se pregunta por el canje y cuánto se espera. Exportado para que las pruebas lo acorten. */
export const ESPERA = { intervaloMs: 2000, maxMs: 45_000 };

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Aquí llega el comerciante desde mi.dardoventas.com con un código de un solo uso. Es pública: sin
// sesión se le manda a crear su cuenta de negocio y vuelve aquí con el mismo código.
export default function VincularDardoVentas() {
  const { user, isLoading } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState('');
  const code = params.get('code') ?? '';

  if (isLoading) return <PageLoader />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/registro?tipo=provider&next=${next}`} replace />;
  }

  const conectar = async () => {
    setEnCurso(true);
    setError('');
    try {
      const { data } = await dardoventasApi.vincular(code);
      for (let esperado = 0; esperado < ESPERA.maxMs; esperado += ESPERA.intervaloMs) {
        await pausa(ESPERA.intervaloMs);
        const canje = (await dardoventasApi.estado()).data.canje;
        if (canje?.id !== data.id || canje.status === 'pendiente') continue;
        if (canje.status === 'ok') {
          toast('¡Catálogo conectado! Ahora completa tu ficha y marca tu ubicación para salir en el mapa.');
          navigate('/dashboard/perfil', { replace: true });
          return;
        }
        setError(canje.error ?? 'No se pudo conectar el catálogo.');
        setEnCurso(false);
        return;
      }
      setError('DardoVentas está tardando en responder. Mira en «Catálogo» dentro de un rato si ya quedó conectado.');
    } catch (err) {
      setError(apiError(err, 'No se pudo conectar el catálogo.'));
    }
    setEnCurso(false);
  };

  return (
    <div className="container-app max-w-xl py-10">
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sea-50 text-sea-700"><Store className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="font-display text-xl font-bold text-ink-900">Conecta tu catálogo de DardoVentas</h1>
        </div>
        {!code ? (
          <Alert tone="info">Falta el código. Entra en mi.dardoventas.com y pulsa «Publicar mi catálogo en Encuentrauno» otra vez.</Alert>
        ) : user.user_type !== 'provider' ? (
          <Alert tone="info">Entraste con una cuenta de cliente. Para publicar tu catálogo, cierra sesión y entra con la cuenta de tu negocio (o crea una).</Alert>
        ) : (
          <>
            <p className="text-ink-600">
              Tus productos saldrán en tu ficha de Encuentrauno con los mismos precios que cobras en caja, y se
              actualizarán solos. Tu ubicación, tu dirección y tu horario los decides tú en tu perfil.
            </p>
            {error && <Alert>{error}</Alert>}
            <button type="button" onClick={conectar} disabled={enCurso} className="btn-primary w-full">
              {enCurso ? <><Spinner className="h-4 w-4" /> Conectando…</> : 'Conectar mi catálogo'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

> Si `container-app` no es la clase de contenedor que usan las demás páginas públicas, usar la de `pages/Plans.tsx`. No inventar clases nuevas.

`oficios-cuba/frontend/src/App.tsx`: importar la página igual que las demás públicas (si `App.tsx` las carga con `lazy`, usar `lazy` también) y, después de `<Route path="proveedor/:id" … />`:

```tsx
          <Route path="vincular/dardoventas" element={<VincularDardoVentas />} />
```

`oficios-cuba/frontend/src/components/GoogleButton.tsx`, en `useDestinoGoogle` — un proveedor nuevo que viene de un enlace con destino (el de vincular, por ejemplo) tiene que volver a él, no a completar el perfil:

```tsx
    if (isNew && user.user_type === 'provider' && !next) {
```

- [ ] **Step 5: Implementar el catálogo de solo lectura**

`oficios-cuba/frontend/src/components/catalog/admin/EstadoDardoVentas.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';
import { apiError, dardoventasApi } from '../../../services/api';
import { relativeTime } from '../../../lib/format';
import type { EstadoDardoVentas as Estado } from '../../../types';
import { ConfirmDialog } from '../../../pages/dashboard/parts';

/** Solo se pinta si el catálogo está conectado: conectar se empieza desde mi.dardoventas.com. */
export default function EstadoDardoVentas({ onCambio }: { onCambio: () => void }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { dardoventasApi.estado().then((r) => setEstado(r.data)).catch(() => {}); }, []);
  if (!estado?.vinculado) return null;

  const desconectar = async () => {
    setBusy(true);
    try {
      await dardoventasApi.desvincular();
      setEstado({ ...estado, vinculado: false });
      toast('Catálogo de DardoVentas desconectado');
      onCambio();
    } catch (err) {
      toast(apiError(err, 'No se pudo desconectar.'), 'error');
    } finally {
      setBusy(false);
      setConfirmar(false);
    }
  };

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <Store className="h-5 w-5 shrink-0 text-sea-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-ink-900">Conectado con DardoVentas</span>
        <span className="text-ink-500">
          {' · '}{estado.articulos} {estado.articulos === 1 ? 'artículo' : 'artículos'}
          {estado.synced_at ? ` · actualizado ${relativeTime(estado.synced_at)}` : ' · importando…'}
        </span>
      </p>
      <button type="button" onClick={() => setConfirmar(true)} className="btn-ghost btn-sm text-red-600 hover:bg-red-50">Desconectar</button>
      <ConfirmDialog
        open={confirmar}
        title="¿Desconectar DardoVentas?"
        confirmLabel="Sí, desconectar"
        busy={busy}
        onConfirm={desconectar}
        onClose={() => setConfirmar(false)}
      >
        Se quitarán de tu catálogo los artículos que vienen de tu punto de venta. Los que añadiste tú se quedan.
      </ConfirmDialog>
    </div>
  );
}
```

> Si `relativeTime` no está en `frontend/src/lib/format.ts`, importarlo de donde lo tome `pages/dashboard/Messages.tsx`; no duplicarlo.

`oficios-cuba/frontend/src/pages/dashboard/Catalogo.tsx`:

1. Import: `import EstadoDardoVentas from '../../components/catalog/admin/EstadoDardoVentas';`
2. En `Fila`, después de `const precio = catalogPrice(item, tasa);`:

```tsx
  // Lo importado se cambia en el punto de venta: aquí se reescribiría en la próxima sincronización.
  const importado = item.origen === 'dardoventas';
```

junto al nombre, al lado del distintivo «Oculto por tu plan»:

```tsx
          {importado && <span className="badge bg-sea-50 text-sea-700">De DardoVentas</span>}
```

y el bloque `<div className="mt-2 flex flex-wrap items-center gap-2">…</div>` (interruptor + Editar + Borrar) se envuelve así:

```tsx
        {importado ? (
          <p className="mt-2 text-xs text-ink-400">Se cambia desde tu punto de venta.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* …el bloque de hoy, sin cambios… */}
          </div>
        )}
```

3. En el JSX de la página, justo después de `</PageTitle>`… es decir, después del elemento `<PageTitle … />`:

```tsx
      <EstadoDardoVentas onCambio={load} />
```

- [ ] **Step 6: Correr las pruebas**

Run: `cd oficios-cuba/frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS y build limpio.

- [ ] **Step 7: Commit**

```bash
git add oficios-cuba/frontend/src/types/index.ts oficios-cuba/frontend/src/services/api.ts oficios-cuba/frontend/src/pages/VincularDardoVentas.tsx oficios-cuba/frontend/src/pages/VincularDardoVentas.test.tsx oficios-cuba/frontend/src/App.tsx oficios-cuba/frontend/src/components/GoogleButton.tsx oficios-cuba/frontend/src/components/catalog/admin/EstadoDardoVentas.tsx oficios-cuba/frontend/src/pages/dashboard/Catalogo.tsx oficios-cuba/frontend/src/pages/dashboard/Catalogo.test.tsx
git commit -m "Web: página para conectar DardoVentas y catálogo importado de solo lectura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Configuración, doble ejecutable del contrato, recorrido de punta a punta y documentación

**Files:**
- Modify: `oficios-cuba/docker-compose.yml` (servicio `oficio_notifier`)
- Modify: `oficios-cuba/.env.example`
- Create: `oficios-cuba/backend/src/scripts/doble-dardoventas.ts`
- Modify: `oficios-cuba/backend/package.json` (script `doble:dardoventas`)
- Modify: `oficios-cuba/CLAUDE.md`
- Modify: `oficios-cuba/STATUS.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: variables `DARDOVENTAS_URL`, `DARDOVENTAS_SECRETO_FILE`, `DARDOVENTAS_PRO_HASTA` en el notificador; montaje `./secrets/dardoventas:/app/dardoventas:ro`; `npm run doble:dardoventas` (puerto 4100) para probar a mano y como referencia para el lado de DardoVentas.

- [ ] **Step 1: Compose y `.env.example`**

En `oficios-cuba/docker-compose.yml`, servicio `oficio_notifier`, añadir al final de `environment`:

```yaml
      # Catálogo de DardoVentas (docs/superpowers/specs/2026-10-06-dardoventas-catalogo-design.md).
      # Sin el archivo del secreto, el canje queda apagado y los catálogos ya vinculados se siguen sondeando.
      - DARDOVENTAS_URL=https://ventas.dardoit.com
      - DARDOVENTAS_SECRETO_FILE=/app/dardoventas/secreto
      - DARDOVENTAS_PRO_HASTA=${DARDOVENTAS_PRO_HASTA:-}
```

y a `volumes`:

```yaml
      - ./secrets/dardoventas:/app/dardoventas:ro
```

Actualizar también el comentario de cabecera del servicio («el único con salida a internet… solo hacia api.telegram.org y…») para que nombre `ventas.dardoit.com`.

En `oficios-cuba/.env.example`, al final:

```bash
# Catálogo de DardoVentas: fin del plan Profesional regalado a los negocios vinculados (fecha ISO,
# p. ej. 2027-03-31). Vacío = no se regala. El secreto del canje NO va aquí: es el archivo
# secrets/dardoventas/secreto (chmod 600), que solo monta oficio_notifier.
DARDOVENTAS_PRO_HASTA=
```

- [ ] **Step 2: Doble ejecutable del contrato**

`oficios-cuba/backend/src/scripts/doble-dardoventas.ts`:

```ts
// Doble del lado de DardoVentas para probar Encuentrauno a mano sin el servidor real
// (spec 2026-10-06-dardoventas-catalogo-design.md, «Contrato» y «Precisiones del contrato»).
// También sirve de referencia para quien construya el endpoint de verdad.
//   npm run doble:dardoventas        → http://127.0.0.1:4100
// El notificador local apunta aquí con DARDOVENTAS_URL=http://127.0.0.1:4100 y un archivo de
// secreto que contenga "secreto-local". Códigos válidos: cualquiera que empiece por "demo".
// Para simular la baja: crear el archivo /tmp/doble-dv-baja (410 en el catálogo).
import { createServer } from 'http';
import { existsSync } from 'fs';
import { createHash } from 'crypto';

const PUERTO = Number(process.env.PUERTO) || 4100;
const SECRETO = process.env.DOBLE_SECRETO || 'secreto-local';
const SLUG = 'dobleDardoVentas0001';
const BASE = `http://127.0.0.1:${PUERTO}`;
// JPEG de 1×1 px: basta para ver que el proxy y la caché funcionan.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

const catalogo = () => ({
  schema_version: 1,
  items: [
    { uid: 'cafe', name: 'Café cubano', description: 'Taza', category: 'Bebidas', priceSource: 'cup', priceCup: 120, priceUsd: null, disponible: true, updatedAt: '2026-10-07T00:00:00Z', photoUrl: `${BASE}/api/pub/foto/${SLUG}/cafe.jpg?v=1` },
    { uid: 'malta', name: 'Malta', description: null, category: 'Bebidas', priceSource: 'usd', priceCup: 365, priceUsd: 1, disponible: true, updatedAt: '2026-10-07T00:00:00Z', photoUrl: null },
    { uid: 'pan', name: 'Pan con croqueta', description: null, category: null, priceSource: 'cup', priceCup: null, priceUsd: null, disponible: false, updatedAt: '2026-10-07T00:00:00Z', photoUrl: null },
  ],
});

createServer((req, res) => {
  const url = new URL(req.url ?? '/', BASE);
  if (req.method === 'POST' && url.pathname === '/api/pub/link') {
    if (req.headers.authorization !== `Bearer ${SECRETO}`) { res.writeHead(401).end(); return; }
    let cuerpo = '';
    req.on('data', (t) => { cuerpo += t; });
    req.on('end', () => {
      const code = (() => { try { return JSON.parse(cuerpo).code as string; } catch { return ''; } })();
      if (!code?.startsWith('demo')) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ok: true, slug: SLUG, businessName: 'Cafetería del doble' }));
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === `/api/pub/catalog/${SLUG}`) {
    if (existsSync('/tmp/doble-dv-baja')) { res.writeHead(410).end(); return; }
    const cuerpo = JSON.stringify(catalogo());
    const etag = `"${createHash('sha1').update(cuerpo).digest('hex').slice(0, 16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', ETag: etag }).end(cuerpo);
    return;
  }
  if (req.method === 'GET' && url.pathname === `/api/pub/foto/${SLUG}/cafe.jpg`) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(JPEG);
    return;
  }
  res.writeHead(404).end();
}).listen(PUERTO, '127.0.0.1', () => console.log(`Doble de DardoVentas en ${BASE}`));
```

En `oficios-cuba/backend/package.json`, en `scripts`: `"doble:dardoventas": "tsx src/scripts/doble-dardoventas.ts"`.

- [ ] **Step 3: Recorrido local de punta a punta**

En el worktree, con el `.env` de pruebas (no el de producción). Cada proceso en su terminal o en segundo plano; anotar los PID para pararlos al final.

1. `cd oficios-cuba/backend && npm run doble:dardoventas`
2. Secreto local, en el scratchpad: `mkdir -p "$SCRATCH/dv" && printf 'secreto-local' > "$SCRATCH/dv/secreto" && chmod 600 "$SCRATCH/dv/secreto"` (`$SCRATCH` = el directorio de scratchpad de la sesión).
3. Base de desarrollo propia (no la de los tests): crear `oficio_dv_dev` en `oficio_db_test` y arrancar la API con `DATABASE_URL` apuntando a ella, `DEMO_MODE=true` y `PORT=3011`: `npm run dev`. Se migra sola (v1 + v2).
4. Notificador: `DATABASE_URL=<la misma> DARDOVENTAS_URL=http://127.0.0.1:4100 DARDOVENTAS_SECRETO_FILE=$SCRATCH/dv/secreto DARDOVENTAS_PRO_HASTA=2027-03-31 npx tsx src/notifier/index.ts`. Comprobar en su salida: `DardoVentas: canje activo, plan regalado hasta 2027-03-31`.
5. Web: `cd ../frontend && BACKEND_URL=http://127.0.0.1:3011 npx vite --port 5177 --strictPort`.
6. Con el navegador de vps2 (imagen `dh-playwright:1.63.0`, ver la memoria «Navegador en vps2 via Docker»), abrir `http://<host>:5177/vincular/dardoventas?code=demo-recorrido-1` **sin sesión** y comprobar, mirando cada captura:
   - lleva a `/registro?tipo=provider&next=…`; crear cuenta de negocio con contraseña → vuelve a la página de vínculo;
   - «Conectar mi catálogo» → en unos segundos, `/dashboard/perfil` con el aviso;
   - `/dashboard/catalogo`: el bloque «Conectado con DardoVentas · 3 artículos», los tres con «De DardoVentas» y sin Editar/Borrar; «Malta» dice `365 CUP` **sin** «≈»; «Pan con croqueta» dice «A consultar» y sale agotado;
   - en la ficha pública del negocio, la foto del café se pide a `/ext/dv/foto/dobleDardoVentas0001/cafe.jpg?v=1` (en dev, Vite no tiene ese proxy: se ve rota, y es lo esperado — el proxy se probó en la Tarea 7. Anotarlo, no arreglarlo en Vite).
7. Baja: `touch /tmp/doble-dv-baja`, poner `dardoventas_synced_at` 31 minutos atrás en la base `oficio_dv_dev` y esperar a la siguiente vuelta del notificador (≤ 60 s) → `/dashboard/catalogo` ya no tiene artículos importados ni el bloque; el perfil tiene `show_on_map = false`. `rm /tmp/doble-dv-baja`.
8. Parar todos los procesos y borrar la base `oficio_dv_dev`.

Cualquier paso que no se pueda ver en pantalla se anota como **no verificado** en `STATUS.md`; nunca se da por visto.

- [ ] **Step 4: Documentación**

`oficios-cuba/CLAUDE.md`:
- En la tabla de la API, una fila nueva: `| DardoVentas | `POST\|DELETE /dardoventas/vincular`, `GET /dardoventas/estado` (Pr; la API solo apunta el código en `dardoventas_canjes`, lo canjea `oficio_notifier`) |`
- En «Modelo de datos»: `catalog_items` lleva `origen` (`propio`\|`dardoventas`) y `uid_externo`; `provider_profiles` lleva las columnas `dardoventas_*`; tabla `dardoventas_canjes`.
- En «Reglas de negocio», un punto **Catálogo de DardoVentas** de cuatro líneas: lo importa `oficio_notifier` cada 30 min con `If-None-Match`; lo importado no se edita (403) ni se convierte de moneda (`convertible=false`); un fallo del otro lado nunca vacía un catálogo; 410 lo retira y saca el negocio del mapa; plan Profesional regalado hasta `DARDOVENTAS_PRO_HASTA`, sin acortar nunca lo que ya se tenía.
- En «Esquema y migraciones», sustituir «No hay migraciones incrementales todavía» por: «Las migraciones posteriores a la v1 están en `db/migraciones.ts`, una por versión y cada una en su transacción.»
- En «Gotchas»: «**Fotos de DardoVentas:** `location ^~ /ext/dv/foto/` en `nginx.conf`, caché `dvfotos` con `max_size=64m`. Se prueba con `frontend/test-nginx/fotos.sh` (Docker, sin internet). En `vite` de desarrollo esas fotos se ven rotas: no hay proxy.»

`oficios-cuba/STATUS.md`, entrada al final con el formato de las existentes:

```markdown
## 2026-10-0X HH:MM — claude-code (vps2) — Catálogo de DardoVentas, lado Encuentrauno
- Changes: <resumen por tarea, con los archivos>
- Tests: <backend N/N, web N/N, shared N/N, fotos.sh, recorrido: lo visto y lo no verificado>
- Security: <puertos nuevos: ninguno; ruta pública nueva /ext/dv/foto (regex + destino fijo + sandbox); secreto solo en archivo montado en el notificador>
- Next: endpoint real en DardoVentas según «Precisiones del contrato»; crear secrets/dardoventas/secreto en vps2 y fijar DARDOVENTAS_PRO_HASTA; desplegar (con OK de Dariel); APK nueva para quitar el «≈» en la app.
- Blockers: el endpoint real no existe todavía.
```

- [ ] **Step 5: Verificación final**

Run:
```bash
cd oficios-cuba/backend && npm test && npm run typecheck && npm run build
cd ../frontend && npx vitest run && npx tsc --noEmit && npm run build && ./test-nginx/fotos.sh
cd ../shared && npx vitest run && npx tsc --noEmit
cd ../mobile && npx tsc --noEmit
docker compose -f ../docker-compose.yml config -q
```
Expected: todo en verde. `docker compose config -q` solo valida la sintaxis del compose; **no** levantar nada con él desde el worktree.

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/docker-compose.yml oficios-cuba/.env.example oficios-cuba/backend/src/scripts/doble-dardoventas.ts oficios-cuba/backend/package.json oficios-cuba/CLAUDE.md oficios-cuba/STATUS.md
git commit -m "DardoVentas: configuración del notificador, doble del contrato y documentación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
