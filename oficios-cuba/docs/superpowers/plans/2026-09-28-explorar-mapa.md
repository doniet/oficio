# Explorar en mapa — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que en Explorar se pueda cambiar a un mapa que muestra un perfil por celda priorizando a quien paga, densifica al acercar el zoom, filtra al escribir, y abre una hoja inferior al tocar un punto.

**Architecture:** un endpoint nuevo `GET /api/mapa` deduce el tamaño de celda del rectángulo visible, agrupa con `ROW_NUMBER() OVER (PARTITION BY celda)` y devuelve el mejor perfil de cada celda con la cuenta de los que quedan detrás. La web lo consume desde un componente de mapa nuevo (Leaflet, ya presente) que vive aparte de `Search.tsx` porque ese archivo ya son 578 líneas; la app lo consume con MapLibre, que es una dependencia nativa nueva.

**Tech Stack:** Express + better-sqlite3 + zod + vitest · React + Vite + Tailwind + react-leaflet · Expo + `@maplibre/maplibre-react-native` + `@gorhom/bottom-sheet`

**Spec:** `oficios-cuba/docs/superpowers/specs/2026-09-28-explorar-mapa-design.md`

## Global Constraints

- Todo el texto de la UI en **español de Cuba**, con tuteo. Nunca voseo.
- **Sin CDNs ni Google Fonts.** Teselas solo de `https://*.tile.openstreetmap.org`, que ya está en la CSP.
- Comentarios solo para el **porqué** no obvio, nunca para el qué.
- Commits en español, descriptivos. Terminan con:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **`brand-500` (`#FF7A00`) nunca lleva texto blanco encima ni hace de indicador sobre fondo claro.** Lo que lleva algo encima o señala estado usa **`brand-600` (`#B85400`)**. Sobre naranja vivo, el texto va en `ink-950`.
- **No se toca** `slug`, `scheme`, `package` (`com.dardoit.oficios`) ni `bundleIdentifier` de Expo.
- **No se renombra** la carpeta `oficios-cuba/`, el paquete `@oficio/shared` ni los contenedores.
- **`show_on_map` se queda en `DEFAULT 0`.** Nadie aparece en el mapa sin activarlo.
- Límites de Cuba, los mismos que ya valida `providers.ts`: `lat` 19–24, `lng` −85,5–−73,5.
- Verificación backend: `npm test` y `npm run typecheck` en `backend/`.
  Verificación frontend: `npx tsc --noEmit && npm run build` en `frontend/`.
  Verificación app: `npx tsc --noEmit` en `mobile/`.

### Limitación conocida del entorno

En vps2 **no hay navegador**: a los dos chromium de Playwright les faltan entre 9 y 12 bibliotecas del sistema y su instalación pide sudo (`sudo npx --yes playwright@latest install-deps chromium`). **Esta es la primera entrega del proyecto en la que mirar no es opcional**: un mapa con marcadores, una hoja que sube y un botón que aparece al panear no se verifican leyendo el HTML servido. Si las bibliotecas no están instaladas cuando se llegue a la Tarea 6, hay que pararse y decírselo a Dariel, no dar por bueno lo que no se ha visto.

## Review Focus

Cinco cosas que la spec da por supuestas y que ninguna tarea probaría por sí sola. Cada una tiene su prueba añadida a la tarea que posee el código.

1. **Un `bbox` invertido o de área cero** (`sur > norte`, o los cuatro números iguales) debe dar 400. Si pasa, el tamaño de celda sale 0 o negativo y `CAST(lat/0)` revienta o devuelve basura. → Tarea 2.
2. **Un perfil con `map_precision = 'zona'` en el borde del rectángulo.** Se filtra por la coordenada exacta pero se sirve la redondeada, así que un punto puede salir fuera del rectángulo pedido y otro desaparecer del borde. Hay que fijar el orden —filtrar por exacta, redondear al servir— y probarlo, o el mapa parpadeará en los bordes. → Tarea 2.
3. **Escribir en el buscador mientras una petición de zona está en vuelo.** Si la vieja llega después, pinta un resultado que ya no corresponde a lo que dice la caja de texto. → Tarea 5.
4. **Geolocalización que devuelve una posición fuera de Cuba** (un cubano en Miami, o una VPN). Centrar ahí genera un `bbox` fuera de rango que el endpoint rechaza con 400, y el usuario ve un error en vez de un mapa. Hay que acotar el centro a Cuba. → Tarea 5.
5. **El tope de 200 puntos con los 300 perfiles sembrados.** Es el único escenario donde `hay_mas` se activa de verdad, y donde un recorte no determinista se notaría: dos peticiones idénticas devolverían puntos distintos. → Tarea 3, que es donde existen esos datos.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `backend/src/db/index.ts` | Migración 11, `schema`, y `CON_NEGOCIO_SQL` exportado | 1, 2 |
| `backend/src/lib/mapa.ts` | **Nuevo.** Parseo y validación del bbox, tamaño de celda, margen | 2 |
| `backend/src/routes/mapa.ts` | **Nuevo.** `GET /api/mapa` | 2 |
| `backend/src/routes/providers.ts` | Usa `CON_NEGOCIO_SQL` importado en vez de su constante local | 2 |
| `backend/src/app.ts` | Registra `/api/mapa` | 2 |
| `backend/test/mapa.test.ts` | **Nuevo.** Pruebas del endpoint | 2 |
| `backend/src/db/seed-mapa.ts` | **Nuevo.** 300 perfiles sintéticos, solo desarrollo | 3 |
| `frontend/src/types.ts` | Tipos `PuntoMapa` y `MapaRespuesta` | 4 |
| `shared/src/tipos.ts` | Los mismos tipos para la app | 4 |
| `frontend/src/services/api.ts` | `mapaApi.buscar()` | 4 |
| `frontend/src/components/mapa/MapaExplorar.tsx` | **Nuevo.** El mapa, los marcadores y el botón de zona | 5 |
| `frontend/src/components/mapa/usarMapa.ts` | **Nuevo.** El hook de carga: antirrebote, cancelación, acotado a Cuba | 5 |
| `frontend/src/components/mapa/HojaPunto.tsx` | **Nuevo.** La hoja inferior | 6 |
| `frontend/src/pages/Search.tsx` | El switch lista/mapa y ocultar filtros no honrados | 7 |
| `frontend/src/pages/dashboard/ProviderProfileEdit.tsx` | Precisión del punto y aviso de oculto | 8 |
| `frontend/src/pages/auth/Register.tsx` | La pregunta del mapa con su explicación | 8 |
| `mobile/package.json`, `mobile/app.config.ts` | MapLibre y su plugin | 9 |
| `mobile/src/componentes/MapaExplorar.tsx` | **Nuevo.** El mapa de la app | 9 |
| `mobile/app/(tabs)/explorar.tsx` | Renombrado de `buscar.tsx`, con el switch | 10 |
| `mobile/src/componentes/HojaPunto.tsx` | **Nuevo.** La hoja de la app | 10 |

---

### Task 1: Esquema — precisión del punto e índice geográfico

**Files:**
- Modify: `backend/src/db/index.ts` (array `MIGRACIONES`, y el `schema` base)
- Test: `backend/test/mapa-esquema.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: columna `provider_profiles.map_precision` (`TEXT DEFAULT 'exacta'`, valores `exacta` | `zona`) e índice `idx_pp_geo`. `ESQUEMA_VERSION` pasa de 10 a 11.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `backend/test/mapa-esquema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

describe('migración 11 — mapa', () => {
  it('añade map_precision con DEFAULT exacta y el índice geo, desde una base vacía', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase, ESQUEMA_VERSION } = await import('../src/db/index.js');
    initDatabase();
    expect(ESQUEMA_VERSION).toBe(11);
    const cols = (db.pragma('table_info(provider_profiles)') as { name: string; dflt_value: string | null }[]);
    const col = cols.find((c) => c.name === 'map_precision');
    expect(col).toBeDefined();
    expect(col!.dflt_value).toBe("'exacta'");
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pp_geo'").get();
    expect(idx).toBeDefined();
  });

  it('show_on_map sigue en DEFAULT 0: la entrega no cambia la visibilidad de nadie', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const cols = (db.pragma('table_info(provider_profiles)') as { name: string; dflt_value: string | null }[]);
    expect(cols.find((c) => c.name === 'show_on_map')!.dflt_value).toBe('0');
  });
});
```

- [ ] **Step 2: Córrela y comprueba que falla**

Run: `cd oficios-cuba/backend && npx vitest run test/mapa-esquema.test.ts`
Expected: FAIL — `ESQUEMA_VERSION` es 10 y `map_precision` no existe.

- [ ] **Step 3: Añade la migración 11**

En `backend/src/db/index.ts`, al final del array `MIGRACIONES`, justo después de la 10:

```ts
  // 11 — precisión del punto en el mapa y su índice. `zona` redondea al servir, nunca al guardar,
  // para que cambiar de opinión no exija volver a marcar el punto.
  (d) => {
    d.exec(`
      ALTER TABLE provider_profiles ADD COLUMN map_precision TEXT DEFAULT 'exacta';
      CREATE INDEX IF NOT EXISTS idx_pp_geo ON provider_profiles(lat, lng);
    `);
  },
```

- [ ] **Step 4: Añade lo mismo al `schema` base**

Una base nueva no corre las migraciones: se crea del `schema` y se le pone `user_version` al día. En la definición de `provider_profiles` dentro de `schema`, junto a `show_on_map`, añade:

```sql
        map_precision TEXT DEFAULT 'exacta',
```

Y junto a los demás `CREATE INDEX` de esa tabla:

```sql
      CREATE INDEX IF NOT EXISTS idx_pp_geo ON provider_profiles(lat, lng);
```

- [ ] **Step 5: Córrela y comprueba que pasa**

Run: `cd oficios-cuba/backend && npx vitest run test/mapa-esquema.test.ts`
Expected: PASS, los dos casos.

- [ ] **Step 6: La base existente migra sin perder nada**

Run: `cd oficios-cuba/backend && npm test && npm run typecheck`
Expected: las 122 pruebas de antes siguen pasando más las 2 nuevas. Si alguna prueba afirmaba `ESQUEMA_VERSION === 10`, actualízala: es la afirmación la que está vieja, no el código.

- [ ] **Step 7: Commit**

```bash
git add oficios-cuba/backend/src/db/index.ts oficios-cuba/backend/test/mapa-esquema.test.ts
git commit -m "Mapa: columna de precisión del punto e índice geográfico

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: El endpoint `GET /api/mapa`

**Files:**
- Create: `backend/src/lib/mapa.ts`, `backend/src/routes/mapa.ts`, `backend/test/mapa.test.ts`
- Modify: `backend/src/db/index.ts` (exportar `CON_NEGOCIO_SQL`), `backend/src/routes/providers.ts` (importarlo), `backend/src/app.ts` (registrar la ruta)

**Interfaces:**
- Consumes: de la Tarea 1, `provider_profiles.map_precision`. De `db/index.ts`, `PLAN_WEIGHT_SQL`.
- Produces:
  - `export const CON_NEGOCIO_SQL = "pp.subscription_plan IN ('pro', 'premium')"` en `db/index.ts`.
  - `export function leerBbox(crudo: string | undefined): { sur: number; oeste: number; norte: number; este: number }` en `lib/mapa.ts` — lanza `AppError(…, 400)`.
  - `export function tamanoCelda(b: Bbox): number` y `export function conMargen(b: Bbox): Bbox` en `lib/mapa.ts`.
  - `GET /api/mapa` con la respuesta `{ puntos: PuntoMapa[], celda: number, hay_mas: boolean }`.

- [ ] **Step 1: Escribe las pruebas de `lib/mapa.ts` (fallan)**

Crea `backend/test/mapa.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { conMargen, leerBbox, tamanoCelda } from '../src/lib/mapa.js';

describe('leerBbox', () => {
  it('lee cuatro números en orden sur,oeste,norte,este', () => {
    expect(leerBbox('23,-82.5,23.2,-82.3')).toEqual({ sur: 23, oeste: -82.5, norte: 23.2, este: -82.3 });
  });
  it('rechaza un bbox invertido: sur por encima de norte', () => {
    expect(() => leerBbox('23.2,-82.5,23,-82.3')).toThrow(/no válido/i);
  });
  it('rechaza un bbox de área cero', () => {
    expect(() => leerBbox('23,-82.5,23,-82.5')).toThrow(/no válido/i);
  });
  it('rechaza coordenadas fuera de Cuba', () => {
    expect(() => leerBbox('25,-82.5,26,-82.3')).toThrow(/no válido/i);
    expect(() => leerBbox('23,-90,23.2,-89')).toThrow(/no válido/i);
  });
  it('rechaza lo que no son cuatro números', () => {
    expect(() => leerBbox('23,-82.5,23.2')).toThrow(/no válido/i);
    expect(() => leerBbox('a,b,c,d')).toThrow(/no válido/i);
    expect(() => leerBbox(undefined)).toThrow(/no válido/i);
  });
});

describe('tamanoCelda', () => {
  it('es el lado corto partido por cinco', () => {
    expect(tamanoCelda({ sur: 23, oeste: -83, norte: 24, este: -82 })).toBeCloseTo(0.2);
  });
  it('usa el lado corto cuando la ventana es más ancha que alta', () => {
    expect(tamanoCelda({ sur: 23, oeste: -85, norte: 23.5, este: -80 })).toBeCloseTo(0.1);
  });
  it('acota entre 0,0005 y 4 grados', () => {
    expect(tamanoCelda({ sur: 23, oeste: -82.5, norte: 23.0001, este: -82.4999 })).toBe(0.0005);
    expect(tamanoCelda({ sur: 19, oeste: -85.5, norte: 24, este: -73.5 })).toBeLessThanOrEqual(4);
  });
});

describe('conMargen', () => {
  it('infla el rectángulo un 50 % por lado', () => {
    expect(conMargen({ sur: 23, oeste: -83, norte: 24, este: -82 }))
      .toEqual({ sur: 22.5, oeste: -83.5, norte: 24.5, este: -81.5 });
  });
  it('no se sale de Cuba al inflar', () => {
    const b = conMargen({ sur: 19.1, oeste: -85.4, norte: 19.3, este: -85.2 });
    expect(b.sur).toBeGreaterThanOrEqual(19);
    expect(b.oeste).toBeGreaterThanOrEqual(-85.5);
  });
});
```

- [ ] **Step 2: Córrelas y comprueba que fallan**

Run: `cd oficios-cuba/backend && npx vitest run test/mapa.test.ts`
Expected: FAIL — no existe `src/lib/mapa.ts`.

- [ ] **Step 3: Escribe `lib/mapa.ts`**

```ts
import { AppError } from '../middleware/errorHandler.js';

export type Bbox = { sur: number; oeste: number; norte: number; este: number };

// Los mismos límites que valida el perfil en providers.ts.
const CUBA = { sur: 19, oeste: -85.5, norte: 24, este: -73.5 };
const CELDA_MIN = 0.0005;
const CELDA_MAX = 4;
const CELDAS_POR_PANTALLA = 5;
const MARGEN = 0.5;

export function leerBbox(crudo: string | undefined): Bbox {
  const partes = (crudo ?? '').split(',').map((n) => Number(n));
  if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) {
    throw new AppError('Área del mapa no válida', 400);
  }
  const [sur, oeste, norte, este] = partes;
  // Un rectángulo invertido o de área cero daría un tamaño de celda 0 o negativo, y el
  // CAST(lat/celda) devolvería basura en vez de fallar.
  if (!(norte > sur) || !(este > oeste)) throw new AppError('Área del mapa no válida', 400);
  if (sur < CUBA.sur || norte > CUBA.norte || oeste < CUBA.oeste || este > CUBA.este) {
    throw new AppError('Área del mapa no válida', 400);
  }
  return { sur, oeste, norte, este };
}

export function tamanoCelda(b: Bbox): number {
  const lado = Math.min(b.norte - b.sur, b.este - b.oeste);
  return Math.min(CELDA_MAX, Math.max(CELDA_MIN, lado / CELDAS_POR_PANTALLA));
}

export function conMargen(b: Bbox): Bbox {
  const alto = (b.norte - b.sur) * MARGEN;
  const ancho = (b.este - b.oeste) * MARGEN;
  return {
    sur: Math.max(CUBA.sur, b.sur - alto),
    norte: Math.min(CUBA.norte, b.norte + alto),
    oeste: Math.max(CUBA.oeste, b.oeste - ancho),
    este: Math.min(CUBA.este, b.este + ancho),
  };
}
```

- [ ] **Step 4: Córrelas y comprueba que pasan**

Run: `cd oficios-cuba/backend && npx vitest run test/mapa.test.ts`
Expected: PASS, los 11 casos.

- [ ] **Step 5: Saca `CON_NEGOCIO` a `db/index.ts`**

Son **dos** constantes en línea, no una, y el mapa necesita las dos. En
`backend/src/db/index.ts`, junto a `PLAN_WEIGHT_SQL`:

```ts
// El plan manda: segunPlan() muestra como oficio a quien no lo tenga incluido, así que todo SQL
// que separe negocios de oficios tiene que decir lo mismo. Una sola definición, importada, para
// que la lista y el mapa no puedan contradecirse.
export const CON_NEGOCIO_SQL = "pp.subscription_plan IN ('pro', 'premium')";

// Lo mismo para el catálogo: qué artículo se ve depende del plan del perfil y del tope que ese
// plan permite (`hidden_by_plan`). `catalog_items` no tiene `is_active`.
export const CON_CATALOGO_SQL = "pp.subscription_plan IN ('basic', 'pro', 'premium') AND ci.hidden_by_plan = 0";
```

Luego:

- En `backend/src/routes/providers.ts`, borra la constante local `CON_NEGOCIO` del handler, añade `CON_NEGOCIO_SQL` al import de `../db/index.js`, y sustituye los dos usos de `${CON_NEGOCIO}` por `${CON_NEGOCIO_SQL}`.
- En `backend/src/routes/catalog.ts:15`, la constante local `CON_CATALOGO` incluye además `pp.is_active = 1`. Deja ese `pp.is_active = 1` donde está y haz que la constante se componga de la nueva:
  `const CON_CATALOGO = \`pp.is_active = 1 AND ${CON_CATALOGO_SQL}\`;`
  Así el catálogo sigue diciendo exactamente lo mismo que decía y el mapa comparte la parte que importa.

- [ ] **Step 6: Comprueba que el listado no cambió**

Run: `cd oficios-cuba/backend && npx vitest run test/negocios.test.ts && npm test`
Expected: PASS las 5 pruebas de la Entrega 1 y toda la suite. Las dos extracciones no deben cambiar ni un carácter del SQL resultante: si algo falla, compara la cadena compuesta con la original antes de tocar nada más. Presta atención a las pruebas del catálogo, que es la otra constante que acabas de mover.

- [ ] **Step 7: Escribe las pruebas del endpoint (fallan)**

Añade a `backend/test/mapa.test.ts`. Sigue el patrón de arranque de app y de sembrado que ya usa `test/negocios.test.ts` — léelo antes y cópialo, no inventes uno nuevo.

```ts
import request from 'supertest';

describe('GET /api/mapa', () => {
  it('rechaza un bbox inválido con 400', async () => {
    const r = await request(app).get('/api/mapa?bbox=25,-82,26,-81');
    expect(r.status).toBe(400);
  });

  it('rechaza una pestaña inventada con 400, no cae en servicios en silencio', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=inventada`);
    expect(r.status).toBe(400);
  });

  it('devuelve un solo punto por celda y es el de mejor plan', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=negocios`);
    expect(r.status).toBe(200);
    const celdas = r.body.puntos.map((p: any) => `${Math.trunc(p.lat / r.body.celda)}:${Math.trunc(p.lng / r.body.celda)}`);
    expect(new Set(celdas).size).toBe(celdas.length);
    expect(r.body.puntos[0].plan).toBe('pro');
  });

  it('detras cuenta los que quedaron en la celda', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    const suma = r.body.puntos.reduce((n: number, p: any) => n + 1 + p.detras, 0);
    expect(suma).toBe(TOTAL_VISIBLES);
  });

  it('al encoger la celda aparecen más puntos', async () => {
    const lejos = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    const cerca = await request(app).get(`/api/mapa?bbox=${UNA_CIUDAD}`);
    expect(cerca.body.celda).toBeLessThan(lejos.body.celda);
  });

  it('un perfil con show_on_map = 0 no sale nunca, ni buscándolo por nombre', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&q=${NOMBRE_DEL_OCULTO}`);
    expect(r.body.puntos).toHaveLength(0);
  });

  it('map_precision = zona redondea al servir y no filtra por la redondeada', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${BBOX_DEL_PERFIL_ZONA}`);
    const p = r.body.puntos.find((x: any) => x.id === ID_PERFIL_ZONA);
    expect(p).toBeDefined();
    // Redondeado a celda de ~1 km (0,01°): los decimales finos desaparecen.
    expect(p.lat).toBeCloseTo(Math.round(LAT_EXACTA / 0.01) * 0.01, 6);
    expect(p.lat).not.toBe(LAT_EXACTA);
  });

  it('un perfil que bajó de plan no sale en tab=negocios', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=negocios`);
    expect(r.body.puntos.map((p: any) => p.id)).not.toContain(ID_NEGOCIO_SIN_PLAN);
  });

  it('el recorte es determinista: dos peticiones iguales dan los mismos puntos', async () => {
    const a = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    const b = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    expect(a.body.puntos.map((p: any) => p.id)).toEqual(b.body.puntos.map((p: any) => p.id));
  });

  it('la celda se deriva del rectángulo visible, no del inflado', async () => {
    const r = await request(app).get(`/api/mapa?bbox=23,-83,24,-82`);
    expect(r.body.celda).toBeCloseTo(0.2); // 1° / 5, no 2° / 5
  });
});
```

Define `CUBA_ENTERA`, `UNA_CIUDAD`, `TOTAL_VISIBLES`, `NOMBRE_DEL_OCULTO`, `ID_PERFIL_ZONA`, `LAT_EXACTA`, `BBOX_DEL_PERFIL_ZONA` e `ID_NEGOCIO_SIN_PLAN` en el sembrado de la prueba, con valores fijos. El sembrado debe incluir: dos perfiles en la misma celda con planes distintos, un perfil con `show_on_map = 0`, un perfil con `map_precision = 'zona'`, y un perfil `kind = 'negocio'` con plan `free`.

- [ ] **Step 8: Córrelas y comprueba que fallan**

Run: `cd oficios-cuba/backend && npx vitest run test/mapa.test.ts`
Expected: FAIL con 404 en todas las del endpoint — la ruta no existe.

- [ ] **Step 9: Escribe `routes/mapa.ts`**

```ts
import { Router } from 'express';
import db, { CON_CATALOGO_SQL, CON_NEGOCIO_SQL, PLAN_WEIGHT_SQL } from '../db/index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { queryTextos } from '../lib/entrada.js';
import { conMargen, leerBbox, tamanoCelda } from '../lib/mapa.js';

const router = Router();

const TOPE = 200;
// Celda de ~1 km: es la precisión que acepta quien no quiere publicar su casa exacta.
const CELDA_ZONA = 0.01;
const PESTANAS = ['servicios', 'productos', 'negocios'] as const;

router.get('/', asyncHandler(async (req, res) => {
  const { tab = 'servicios', q, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
  if (!PESTANAS.includes(tab as (typeof PESTANAS)[number])) {
    throw new AppError('Pestaña no válida', 400);
  }
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const celda = tamanoCelda(visible);
  const pedido = conMargen(visible);

  // Se filtra por la coordenada EXACTA y se redondea al servir. Al contrario, un perfil con
  // precisión de zona desaparecería del borde del rectángulo según el redondeo.
  let where = `WHERE pp.is_active = 1 AND pp.show_on_map = 1
    AND pp.lat IS NOT NULL AND pp.lng IS NOT NULL
    AND pp.lat BETWEEN ? AND ? AND pp.lng BETWEEN ? AND ?`;
  const params: unknown[] = [pedido.sur, pedido.norte, pedido.oeste, pedido.este];

  if (tab === 'negocios') where += ` AND pp.kind = 'negocio' AND ${CON_NEGOCIO_SQL}`;
  if (tab === 'servicios') {
    where += ` AND EXISTS (SELECT 1 FROM services s WHERE s.provider_id = pp.id AND s.is_active = 1)`;
  }
  if (tab === 'productos') {
    // `catalog_items` NO tiene `is_active`: la visibilidad es `available` más el tope del plan.
    where += ` AND EXISTS (SELECT 1 FROM catalog_items ci
      WHERE ci.provider_id = pp.id AND ci.available = 1 AND ${CON_CATALOGO_SQL})`;
  }
  if (category) {
    where += ` AND pp.id IN (SELECT s.provider_id FROM services s JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = 1 AND (c.id = ? OR c.slug = ? OR c.parent_id IN (SELECT id FROM categories WHERE id = ? OR slug = ?)))`;
    params.push(category, category, category, category);
  }
  if (q && q.trim()) {
    where += ' AND (pp.business_name LIKE ? OR pp.description LIKE ? OR u.full_name LIKE ?)';
    const term = `%${q.trim()}%`;
    params.push(term, term, term);
  }

  // Las dos CTE se aliasan `pp` a propósito: PLAN_WEIGHT_SQL lleva el prefijo `pp.` escrito
  // dentro, así que sin el alias el ORDER BY de fuera fallaría con «no such column».
  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = db.prepare(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.lat, pp.lng, pp.map_precision,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             CAST(pp.lat / ? AS INT) AS cy, CAST(pp.lng / ? AS INT) AS cx
        FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      ${where}
    ), rankeadas AS (
      SELECT pp.*, ROW_NUMBER() OVER (PARTITION BY pp.cy, pp.cx ORDER BY ${orden}) AS pos,
                   COUNT(*)     OVER (PARTITION BY pp.cy, pp.cx) AS en_celda
        FROM visibles pp
    )
    SELECT * FROM rankeadas pp WHERE pp.pos = 1 ORDER BY ${orden} LIMIT ?
  `).all(celda, celda, ...params, TOPE + 1) as any[];

  const hay_mas = filas.length > TOPE;
  const puntos = filas.slice(0, TOPE).map((f) => ({
    id: f.id,
    tipo: f.kind as 'oficio' | 'negocio',
    nombre: f.business_name || f.owner_name,
    lat: f.map_precision === 'zona' ? Math.round(f.lat / CELDA_ZONA) * CELDA_ZONA : f.lat,
    lng: f.map_precision === 'zona' ? Math.round(f.lng / CELDA_ZONA) * CELDA_ZONA : f.lng,
    plan: f.subscription_plan === 'premium' ? 'pro' : f.subscription_plan,
    detras: f.en_celda - 1,
    resumen: resumenDe(f.id, tab),
  }));

  res.json({ puntos, celda, hay_mas });
}));

export default router;
```

Escribe `resumenDe(providerId, tab)` en el mismo archivo: en `servicios`, el título y el precio del servicio activo mejor clasificado; en `productos`, cuántos artículos activos casan; en `negocios`, la categoría principal. Reusa el SQL de categorías de `PUBLIC_COLUMNS` de `providers.ts`; no escribas otra forma de sacar la categoría.

- [ ] **Step 10: Registra la ruta**

En `backend/src/app.ts`, junto a los demás `app.use('/api/…')`:

```ts
app.use('/api/mapa', mapaRoutes);
```

con su import arriba, en el mismo orden alfabético que los vecinos.

- [ ] **Step 11: Córrelas y comprueba que pasan**

Run: `cd oficios-cuba/backend && npx vitest run test/mapa.test.ts && npm test && npm run typecheck`
Expected: las del mapa en verde y las 124 anteriores intactas.

- [ ] **Step 12: Commit**

```bash
git add oficios-cuba/backend/src/lib/mapa.ts oficios-cuba/backend/src/routes/mapa.ts oficios-cuba/backend/src/routes/providers.ts oficios-cuba/backend/src/db/index.ts oficios-cuba/backend/src/app.ts oficios-cuba/backend/test/mapa.test.ts
git commit -m "Mapa: endpoint /api/mapa con un perfil por celda priorizando el plan

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sembrado de 300 perfiles, solo en desarrollo

**Files:**
- Create: `backend/src/db/seed-mapa.ts`
- Modify: `backend/package.json` (script `seed:mapa`)
- Test: `backend/test/seed-mapa.test.ts`

**Interfaces:**
- Consumes: el esquema de la Tarea 1.
- Produces: `export async function seedMapa(): Promise<number>` — devuelve cuántos perfiles creó, 0 si ya estaban.

- [ ] **Step 1: Escribe la prueba que falla**

```ts
import { describe, expect, it, beforeEach } from 'vitest';

describe('seedMapa', () => {
  it('crea 300 perfiles visibles en el mapa, repartidos y con los tres planes', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: db, initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    expect(await seedMapa()).toBe(300);
    const n = db.prepare('SELECT COUNT(*) c FROM provider_profiles WHERE show_on_map = 1').get() as { c: number };
    expect(n.c).toBeGreaterThanOrEqual(300);
    const planes = db.prepare("SELECT subscription_plan p, COUNT(*) c FROM provider_profiles WHERE business_name LIKE 'Prueba %' GROUP BY p").all() as any[];
    expect(planes.map((x) => x.p).sort()).toEqual(['basic', 'free', 'pro']);
    const provincias = db.prepare("SELECT COUNT(DISTINCT province_id) c FROM provider_profiles WHERE business_name LIKE 'Prueba %'").get() as { c: number };
    expect(provincias.c).toBeGreaterThanOrEqual(10);
  });

  it('es idempotente: correrlo dos veces no duplica', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    await seedMapa();
    expect(await seedMapa()).toBe(0);
  });

  it('se niega a correr en producción', async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'production';
    const { initDatabase } = await import('../src/db/index.js');
    initDatabase();
    const { seedMapa } = await import('../src/db/seed-mapa.js');
    await expect(seedMapa()).rejects.toThrow(/producción/i);
    delete process.env.NODE_ENV;
  });
});
```

- [ ] **Step 2: Córrela y comprueba que falla**

Run: `cd oficios-cuba/backend && npx vitest run test/seed-mapa.test.ts`
Expected: FAIL — no existe `src/db/seed-mapa.js`.

- [ ] **Step 3: Escribe `seed-mapa.ts`**

Copia la forma de `seed-demo.ts` (transacción, `uuidv4`, `bcrypt` para la contraseña) y cambia solo lo necesario:

- Primera línea del cuerpo: `if (process.env.NODE_ENV === 'production') throw new Error('seedMapa no se ejecuta en producción');`
- Idempotencia por el mismo centinela que usa `seed-demo`: si ya existe un perfil con `business_name = 'Prueba 1'`, devuelve 0.
- 300 perfiles con `business_name` `Prueba 1` … `Prueba 300`, `show_on_map = 1`, `is_active = 1`.
- Reparto de planes: los índices divisibles por 3 → `pro`, los divisibles por 4 → `basic`, el resto → `free`. Sale ~35 % pro, ~25 % basic, ~40 % free.
- Coordenadas: el 40 % concentrado en un cuadrado de 0,3° alrededor de La Habana (23,10 / −82,38) para que haya celdas con cinco o seis dentro; el resto repartido por las provincias, tomando `lat`/`lng` de la tabla `provinces` más un desvío pseudoaleatorio **determinista** derivado del índice, nunca `Math.random()`: la prueba tiene que poder afirmar cosas concretas.
- Cada perfil con un servicio activo, para que salga también en `tab=servicios`.

- [ ] **Step 4: Añade el script**

En `backend/package.json`, junto a los demás:

```json
    "seed:mapa": "tsx src/db/seed-mapa-cli.ts",
```

y crea ese `seed-mapa-cli.ts` de dos líneas que llama a `initDatabase()` y luego a `seedMapa()` e imprime el número.

- [ ] **Step 5: Córrela y comprueba que pasa**

Run: `cd oficios-cuba/backend && npx vitest run test/seed-mapa.test.ts && npm test`
Expected: PASS las 3, y las anteriores intactas.

- [ ] **Step 6: Añade la prueba del tope, que solo es posible con estos datos**

En `test/mapa.test.ts`, con el sembrado de 300:

```ts
it('con 300 perfiles, el tope de 200 se activa y lo dice', async () => {
  await seedMapa();
  const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
  expect(r.body.puntos.length).toBeLessThanOrEqual(200);
  if (r.body.puntos.length === 200) expect(r.body.hay_mas).toBe(true);
});
```

- [ ] **Step 7: Commit**

```bash
git add oficios-cuba/backend/src/db/seed-mapa.ts oficios-cuba/backend/src/db/seed-mapa-cli.ts oficios-cuba/backend/package.json oficios-cuba/backend/test/seed-mapa.test.ts oficios-cuba/backend/test/mapa.test.ts
git commit -m "Mapa: sembrado de 300 perfiles sintéticos para ver la densidad en desarrollo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tipos y cliente de API

**Files:**
- Modify: `frontend/src/types.ts`, `shared/src/tipos.ts`, `frontend/src/services/api.ts`
- Test: el typecheck de los tres paquetes es la prueba.

**Interfaces:**
- Consumes: la respuesta del endpoint de la Tarea 2.
- Produces, idénticos en los dos archivos de tipos:

```ts
export type PuntoMapa = {
  id: string;
  tipo: 'oficio' | 'negocio';
  nombre: string;
  lat: number;
  lng: number;
  plan: 'pro' | 'basic' | 'free';
  detras: number;
  resumen: string;
};

export type MapaRespuesta = { puntos: PuntoMapa[]; celda: number; hay_mas: boolean };
export type Bbox = { sur: number; oeste: number; norte: number; este: number };
```

Y en `frontend/src/services/api.ts`:

```ts
export const mapaApi = {
  buscar: (bbox: Bbox, params: { tab?: string; q?: string; category?: string }, signal?: AbortSignal) =>
    api.get<MapaRespuesta>('/mapa', {
      params: { bbox: `${bbox.sur},${bbox.oeste},${bbox.norte},${bbox.este}`, ...params },
      signal,
    }).then((r) => r.data),
};
```

El `signal` no es decorativo: la Tarea 5 lo necesita para cancelar la petición en vuelo.

- [ ] **Step 1: Añade los tipos a `frontend/src/types.ts`**

Pega el bloque de tipos de arriba al final del archivo.

- [ ] **Step 2: Añade los mismos tipos a `shared/src/tipos.ts`**

El mismo bloque. Los dos archivos están duplicados a propósito en este proyecto: el frontend no consume `@oficio/shared`, solo la app. No unifiques eso aquí — sería reestructurar algo que esta entrega no pidió.

- [ ] **Step 3: Añade `mapaApi` a `frontend/src/services/api.ts`**

Pega el bloque de arriba junto a los demás `…Api`, e importa `Bbox` y `MapaRespuesta` en el import de tipos de la cabecera.

- [ ] **Step 4: Comprueba que compila**

Run: `cd oficios-cuba/frontend && npx tsc --noEmit && cd ../shared && npx tsc --noEmit && cd ../mobile && npx tsc --noEmit`
Expected: los tres sin salida.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/frontend/src/types.ts oficios-cuba/shared/src/tipos.ts oficios-cuba/frontend/src/services/api.ts
git commit -m "Mapa: tipos de los puntos y cliente de /api/mapa

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: El mapa de la web, con su hook de carga

**Files:**
- Create: `frontend/src/components/mapa/usarMapa.ts`, `frontend/src/components/mapa/MapaExplorar.tsx`
- Test: `frontend/src/components/mapa/usarMapa.test.ts`

**Interfaces:**
- Consumes: `mapaApi.buscar`, `PuntoMapa`, `Bbox` de la Tarea 4.
- Produces:
  - `export function usarMapa(params: { tab: string; q: string; category: string }): { puntos: PuntoMapa[]; celda: number; hayMas: boolean; cargando: boolean; error: string; zonaSucia: boolean; alMover(b: Bbox, porZoom: boolean): void; buscarZona(): void }`
  - `export default function MapaExplorar({ tab, q, category, onAbrir }: { tab: string; q: string; category: string; onAbrir(p: PuntoMapa): void })`
  - `export function acotarACuba(lat: number, lng: number): { lat: number; lng: number }` en `usarMapa.ts`.

- [ ] **Step 1: Escribe las pruebas del hook (fallan)**

`frontend/src/components/mapa/usarMapa.test.ts`. El frontend no tiene hoy suite de pruebas: si `npx vitest` no está configurado en `frontend/`, añádelo con la misma versión de vitest que usa `backend/` y un `environment: 'jsdom'`, y deja el script `test` en su `package.json`. Ese montaje es parte de esta tarea.

```ts
import { describe, expect, it } from 'vitest';
import { acotarACuba } from './usarMapa';

describe('acotarACuba', () => {
  it('deja una posición cubana como está', () => {
    expect(acotarACuba(23.1, -82.38)).toEqual({ lat: 23.1, lng: -82.38 });
  });
  it('acota una posición de Miami al borde de Cuba', () => {
    // Un cubano en Miami, o detrás de una VPN: centrar ahí daría un bbox que el
    // endpoint rechaza con 400, y el usuario vería un error en vez de un mapa.
    const p = acotarACuba(25.77, -80.19);
    expect(p.lat).toBeLessThanOrEqual(24);
    expect(p.lat).toBeGreaterThanOrEqual(19);
  });
  it('acota una posición al oeste de Cuba', () => {
    expect(acotarACuba(23, -90).lng).toBeGreaterThanOrEqual(-85.5);
  });
});
```

- [ ] **Step 2: Córrelas y comprueba que fallan**

Run: `cd oficios-cuba/frontend && npx vitest run src/components/mapa/usarMapa.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribe `usarMapa.ts`**

Reglas que el hook tiene que cumplir, todas de la spec:

- Al **hacer zoom** (`porZoom = true`) recarga sola, con antirrebote de **250 ms**.
- Al **panear** (`porZoom = false`) **no** recarga: pone `zonaSucia = true`. `buscarZona()` la limpia y carga.
- Cambiar `tab`, `q` o `category` recarga sola, con antirrebote de **300 ms**.
- **Cancela la petición en vuelo** con `AbortController` antes de lanzar otra, y descarta la respuesta de una petición abortada. Sin esto, teclear mientras una carga de zona está en vuelo pinta el resultado viejo sobre el nuevo.
- `acotarACuba` recorta lat a [19, 24] y lng a [−85,5, −73,5].

- [ ] **Step 4: Córrelas y comprueba que pasan**

Run: `cd oficios-cuba/frontend && npx vitest run src/components/mapa/usarMapa.test.ts`
Expected: PASS las 3.

- [ ] **Step 5: Escribe la prueba de la carrera**

```ts
it('descarta la respuesta de una petición cancelada', async () => {
  // Lanza una carga de zona lenta, luego una de texto rápida, y comprueba que
  // los puntos que quedan son los del texto, no los de la zona.
});
```

Impleméntala con un doble de `mapaApi.buscar` que resuelva en orden invertido, y afirma sobre el estado final del hook. Es el Review Focus 3.

- [ ] **Step 6: Escribe `MapaExplorar.tsx`**

**Cómo se conecta al hook** — es lo que hace que todo lo anterior funcione, así que va primero:

```tsx
const mapa = usarMapa({ tab, q, category });

// Leaflet dispara `zoomend` y `moveend`; `moveend` también salta tras un zoom, así que hay que
// distinguirlos o cada zoom ensuciaría la zona y sacaría el botón sin motivo.
useMapEvents({
  zoomend: (e) => mapa.alMover(aBbox(e.target.getBounds()), true),
  moveend: (e) => { if (!zoomRecien.current) mapa.alMover(aBbox(e.target.getBounds()), false); },
});
```

`aBbox` convierte un `LatLngBounds` de Leaflet en `{ sur, oeste, norte, este }`. `zoomRecien` es un
`useRef` que `zoomend` pone a `true` y un `setTimeout(0)` devuelve a `false`: sin él, un zoom
dispararía además el `moveend` y aparecería el botón de zona después de cada acercamiento, que es
exactamente lo que la spec dice que no debe pasar.

El botón «Buscar en esta zona» llama `mapa.buscarZona()`. Los marcadores se pintan de
`mapa.puntos`, y `mapa.cargando` y `mapa.error` se muestran sin tapar el mapa.

- `react-leaflet`, cargado de forma diferida como ya hace `PlaceMap.tsx`: léelo y copia el patrón, incluido el arreglo de los iconos por defecto de Leaflet si lo tiene.
- Teselas de `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` con su atribución. Ningún otro proveedor: la CSP solo permite ese.
- Un marcador por punto. El del plan `pro` en `brand-600`; los demás en `ink-700`. **Nunca texto blanco sobre `brand-500`.**
- Si `detras > 0`, una insignia con `+{detras}` pegada al marcador.
- Botón **«Buscar en esta zona»** centrado abajo, visible solo con `zonaSucia`.
- Botón **«Cerca de mí»**: pide `navigator.geolocation`, pasa el resultado por `acotarACuba`, y si se deniega o falla deja el mapa donde está y muestra una línea explicando por qué. Nunca un callejón sin salida.
- Con `hayMas`, una línea discreta: «Hay más negocios aquí. Acerca el mapa.»
- Al pulsar un marcador, llama `onAbrir(punto)`.

- [ ] **Step 7: Comprueba que compila y construye**

Run: `cd oficios-cuba/frontend && npx tsc --noEmit && npm run build`
Expected: sin errores y build en verde.

- [ ] **Step 8: Commit**

```bash
git add oficios-cuba/frontend/src/components/mapa/ oficios-cuba/frontend/package.json
git commit -m "Mapa web: componente, carga con antirrebote y cancelación, y acotado a Cuba

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: La hoja inferior de la web

**Files:**
- Create: `frontend/src/components/mapa/HojaPunto.tsx`
- Modify: `frontend/src/components/mapa/MapaExplorar.tsx` (la monta)

**Interfaces:**
- Consumes: `PuntoMapa` de la Tarea 4; `onAbrir` de la Tarea 5.
- Produces: `export default function HojaPunto({ punto, onCerrar }: { punto: PuntoMapa | null; onCerrar(): void })`

- [ ] **Step 1: Escríbela**

Dos posiciones de anclaje: **asomada** (30 % de la altura: nombre, resumen y enlace) y **abierta** (85 %: la ficha completa, que se pide al abrir). Asa visible para arrastrar. Transición con `transform`, no con `height`.

Reglas que no son opcionales, porque son los fallos habituales de este patrón:

- **`Esc` cierra.**
- **El botón Atrás del navegador cierra la hoja** antes de salir de la página: al abrirla, `history.pushState`; al cerrarla, `history.back()` si el estado es el de la hoja. Escucha `popstate`.
- Con la hoja abierta, el foco de teclado queda dentro; al cerrarse vuelve al marcador que la abrió.
- La hoja **no tapa** el botón «Buscar en esta zona»: cuando está visible, el botón se recoloca encima.
- El anillo de foco de todo lo enfocable dentro usa `brand-600`, nunca `brand-500`.

- [ ] **Step 2: Compila y construye**

Run: `cd oficios-cuba/frontend && npx tsc --noEmit && npm run build`
Expected: en verde.

- [ ] **Step 3: 🚨 Míralo en un navegador**

Aquí es donde la limitación del entorno muerde. Necesitas:

Run: `cd oficios-cuba/frontend && npm run dev` y un navegador contra `/explorar?vista=mapa`.

Comprueba **mirando**, a 390 px de ancho y en escritorio: los marcadores salen donde deben, la insignia `+N` se lee, la hoja sube y se queda en las dos posiciones, `Esc` la cierra, Atrás la cierra sin salir de la página, y el botón de zona aparece al arrastrar y **no** al hacer zoom.

Si los chromium de Playwright siguen sin sus bibliotecas, **para aquí y dile a Dariel** que hace falta `sudo npx --yes playwright@latest install-deps chromium`, o que mire él. No marques esta tarea como hecha sin haber visto la hoja moverse.

- [ ] **Step 4: Commit**

```bash
git add oficios-cuba/frontend/src/components/mapa/
git commit -m "Mapa web: hoja inferior con dos anclajes, Esc y Atrás

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: El switch lista/mapa en Explorar

**Files:**
- Modify: `frontend/src/pages/Search.tsx`

**Interfaces:**
- Consumes: `MapaExplorar` de la Tarea 5, `HojaPunto` de la Tarea 6.
- Produces: el parámetro de URL `vista=mapa`.

- [ ] **Step 1: Añade el switch**

Junto al buscador, dos botones (lista / mapa) que escriben `vista` en la URL con el `update()` que ya existe en ese archivo (línea 48). La lista sigue siendo el valor por defecto: sin `vista` en la URL, se ve la lista. Cambiar de vista **no** toca `tab`, `q` ni los filtros.

- [ ] **Step 2: Oculta en vista de mapa los filtros que el mapa no honra**

Concretamente: **provincia y municipio** (el rectángulo visible ya es la ubicación, y dejar los dos mandando a la vez se contradice), **precio y tipo de precio**, y **el orden**. Se quedan visibles el buscador de texto, la pestaña y la categoría, que son los tres que viajan al endpoint.

Usa la misma mecánica que ya introdujo la Entrega 1 para la pestaña Negocios: un control que no hace nada es peor que un control ausente.

- [ ] **Step 3: Monta el mapa**

Con `vista=mapa`, en lugar de la lista, renderiza `MapaExplorar` pasándole `tab`, `q` y `category`, y `HojaPunto` con el punto abierto. Carga `MapaExplorar` con `lazy()`, como ya se hace con los demás chunks pesados de este proyecto.

- [ ] **Step 4: Comprueba que compila, construye y no perdiste nada**

Run: `cd oficios-cuba/frontend && npx tsc --noEmit && npm run build`
Expected: en verde, y `Search.tsx` **no** debe haber crecido más de ~60 líneas: si creció mucho más, la lógica del mapa se está colando en el archivo equivocado.

- [ ] **Step 5: Míralo**

Con el dev server: el switch conserva pestaña y filtros en los dos sentidos, y un enlace con `?vista=mapa&tab=negocios&q=pan` abre donde debe. Misma regla que la Tarea 6: si no hay navegador, para y dilo.

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/frontend/src/pages/Search.tsx
git commit -m "Explorar: switch entre lista y mapa, con los filtros del mapa acotados

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Opt-in — la pregunta, la precisión y el aviso

**Files:**
- Modify: `frontend/src/pages/dashboard/ProviderProfileEdit.tsx`, `frontend/src/pages/auth/Register.tsx`, `backend/src/routes/providers.ts` (el esquema zod del perfil)
- Test: `backend/test/mapa.test.ts` (dos casos más)

**Interfaces:**
- Consumes: `map_precision` de la Tarea 1.
- Produces: `map_precision` en el esquema zod del perfil: `z.enum(['exacta', 'zona']).default('exacta')`, y en el `PUT` del perfil.

- [ ] **Step 1: Escribe las pruebas que faltan**

```ts
it('el PUT del perfil acepta map_precision y rechaza un valor inventado', async () => {
  const ok = await request(app).put(`/api/providers/${ID}`).set(auth).send({ ...perfil, map_precision: 'zona' });
  expect(ok.status).toBe(200);
  const mal = await request(app).put(`/api/providers/${ID}`).set(auth).send({ ...perfil, map_precision: 'aproximada' });
  expect(mal.status).toBe(400);
});
```

- [ ] **Step 2: Añádelo al esquema zod y al `PUT`**

En `providerProfileSchema` de `providers.ts`, junto a `show_on_map`:

```ts
  map_precision: z.enum(['exacta', 'zona']).default('exacta'),
```

y persístelo en el `UPDATE` del perfil, donde ya se guarda `show_on_map`.

- [ ] **Step 3: La interfaz del panel**

En `ProviderProfileEdit.tsx`, junto al control de `show_on_map` que ya existe:

- Cuando `show_on_map` está **apagado**, un aviso claro: que no apareces en el mapa, y qué ganas si apareces. Es lo que de verdad mueve la aguja en un opt-in, más que la pregunta del registro.
- Cuando está **encendido**, dos opciones de precisión: «Mi punto exacto» (para un negocio con local) y «Solo mi zona, unos 1 000 metros» (para quien trabaja desde su casa), con una línea que explique qué se publica en cada caso.
- La interfaz **tiene que preguntar**: nunca escribas `map_precision` en silencio aprovechando el valor por defecto de la columna.

- [ ] **Step 4: La pregunta del registro**

En `Register.tsx`, en el paso de profesional, la pregunta de aparecer en el mapa **con la explicación en claro de qué se hace público**. No des por hecho que quien pulsa entiende lo que publica. Sigue apagada por defecto.

- [ ] **Step 5: Verifica**

Run: `cd oficios-cuba/backend && npm test && npm run typecheck && cd ../frontend && npx tsc --noEmit && npm run build`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/backend/src/routes/providers.ts oficios-cuba/frontend/src/pages/dashboard/ProviderProfileEdit.tsx oficios-cuba/frontend/src/pages/auth/Register.tsx oficios-cuba/backend/test/mapa.test.ts
git commit -m "Mapa: opt-in explícito con elección de precisión del punto

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: La app — MapLibre y el mapa que pinta puntos

**Files:**
- Modify: `mobile/package.json`, `mobile/app.config.ts`
- Create: `mobile/src/componentes/MapaExplorar.tsx`, `mobile/src/lib/mapa.ts`

**Interfaces:**
- Consumes: `PuntoMapa`, `MapaRespuesta`, `Bbox` de `@oficio/shared` (Tarea 4).
- Produces: `export default function MapaExplorar({ tab, q, category, onAbrir }: { tab: string; q: string; category: string; onAbrir(p: PuntoMapa): void })`, y en `lib/mapa.ts` el mismo hook de carga que la web, con las mismas reglas de antirrebote, cancelación y acotado a Cuba.

- [ ] **Step 1: Instala MapLibre y su plugin**

```bash
cd oficios-cuba/mobile && npx expo install @maplibre/maplibre-react-native
```

Añade su plugin al array `plugins` de `mobile/app.config.ts`. **No toques** `slug`, `scheme`, `package` ni `bundleIdentifier`: cambiarlos rompería la actualización del APK ya instalado.

- [ ] **Step 2: Comprueba que la configuración sigue siendo válida**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx expo config --type public > /dev/null && echo ok`
Expected: `ok`. Si `expo config` falla, el plugin está mal declarado: arréglalo antes de seguir.

- [ ] **Step 3: Escribe `lib/mapa.ts`**

El mismo hook que `usarMapa.ts` de la web, con las mismas cinco reglas (zoom recarga con 250 ms, paneo ensucia, texto recarga con 300 ms, cancela la anterior, acota a Cuba). Es duplicación consciente entre web y app: el proyecto ya duplica los tipos por la misma razón, y unificar el hook exigiría meter React en `@oficio/shared`, que hoy no lo tiene.

- [ ] **Step 4: Escribe `MapaExplorar.tsx`**

Teselas de OpenStreetMap, las mismas que la web. Un marcador por punto, el de plan `pro` en `brand-600`. Insignia `+N` si `detras > 0`. Botón «Buscar en esta zona» abajo cuando la zona está sucia, y «Cerca de mí» con `expo-location`, pasando el resultado por el acotado a Cuba y sin callejón sin salida si se deniega el permiso.

- [ ] **Step 5: Verifica**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/mobile/package.json oficios-cuba/mobile/package-lock.json oficios-cuba/mobile/app.config.ts oficios-cuba/mobile/src/
git commit -m "App: MapLibre y mapa de Explorar con teselas de OpenStreetMap

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: La app — pestaña Explorar, switch y hoja inferior

**Files:**
- Rename: `mobile/app/(tabs)/buscar.tsx` → `mobile/app/(tabs)/explorar.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx:23`
- Create: `mobile/src/componentes/HojaPunto.tsx`

**Interfaces:**
- Consumes: `MapaExplorar` de la Tarea 9.
- Produces: `export default function HojaPunto({ punto, onCerrar }: { punto: PuntoMapa | null; onCerrar(): void })`

- [ ] **Step 1: Renombra la pestaña**

`git mv mobile/app/\(tabs\)/buscar.tsx mobile/app/\(tabs\)/explorar.tsx`, y en `_layout.tsx:23` cambia `name="buscar"` por `name="explorar"` y `title: 'Buscar'` por `title: 'Explorar'`. La web ya hizo este cambio en la Entrega 1 y la app se quedó sin alinear.

Busca y reapunta cualquier navegación a `/buscar` que quede en la app: `grep -rn '"/buscar"\|\x27/buscar\x27' mobile/`.

- [ ] **Step 2: Instala la hoja**

```bash
cd oficios-cuba/mobile && npx expo install @gorhom/bottom-sheet react-native-gesture-handler react-native-reanimated
```

Si `react-native-gesture-handler` o `react-native-reanimated` ya están, `expo install` no los duplica.

- [ ] **Step 3: Escribe `HojaPunto.tsx`**

Dos posiciones de anclaje, 30 % y 85 %. **El botón físico Atrás cierra la hoja** antes de salir de la pantalla: `BackHandler` de React Native. La hoja no tapa el botón «Buscar en esta zona».

- [ ] **Step 4: Añade el switch a la pestaña**

Dos botones lista / mapa en la cabecera de `explorar.tsx`. La lista sigue siendo la vista inicial, igual que en la web.

- [ ] **Step 5: Verifica**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx expo config --type public > /dev/null && echo ok`
Expected: `ok`.

- [ ] **Step 6: 🚨 Míralo en el emulador o en un teléfono**

La app no se verifica compilando. Usa la skill `oficio-app-e2e-emulador` si está disponible. Comprueba que los marcadores salen, la hoja sube, Atrás la cierra sin salir de la pantalla, y el botón de zona aparece al arrastrar y no al hacer zoom.

Si no hay emulador disponible en este host, **para y dilo**: esta tarea no se cierra a ciegas.

- [ ] **Step 7: Commit**

```bash
git add oficios-cuba/mobile/
git commit -m "App: la pestaña Buscar pasa a Explorar, con switch de mapa y hoja inferior

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Cierre de la entrega

- [ ] **Verificación completa**

```bash
cd oficios-cuba/backend && npm test && npm run typecheck
cd ../frontend && npx tsc --noEmit && npm run build
cd ../shared && npx tsc --noEmit
cd ../mobile && npx tsc --noEmit && npx expo config --type public > /dev/null
```

Esperado: todo en verde.

- [ ] **Entrada en `STATUS.md`**

Al final de `oficios-cuba/STATUS.md`, con el formato de las entradas existentes: `## <fecha> UTC — claude-code (vps2) — Explorar en mapa`, con `Changes`, `Tests`, `Security` (la migración 11 y que `show_on_map` sigue en `DEFAULT 0`), `Next` (desplegar con la skill `oficio-deploy-vps2`, que hay migración; republicar el APK desde j-u) y `Blockers`.

- [ ] **`CLAUDE.md` del proyecto**

Añade `GET /api/mapa` a la lista de endpoints y el switch de vista a la descripción de `/explorar`.

- [ ] **Pendiente de Dariel, no de esta entrega**

1. **Desplegar** con la skill `oficio-deploy-vps2`: **hay migración 11**, así que toca probarla antes sobre una copia del backup, como manda esa skill.
2. **Republicar el APK** desde j-u: la app cambia y el mapa es nuevo.
3. **Instalar las bibliotecas de chromium** si quiere que la verificación visual la haga yo: `sudo npx --yes playwright@latest install-deps chromium`.
