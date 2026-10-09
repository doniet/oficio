# Productos en el mapa (entrega 2: app Android) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app Android (Expo, `oficios-cuba/mobile`) tenga en su mapa las pestañas Servicios / Negocios / Productos y, en Productos, la misma lista compacta que la web: productos de la zona visible con orden por precio, los de fuera aparte, y tocar uno abre la ficha de su negocio con ese producto marcado. Termina con una APK nueva publicada.

**Architecture:** El endpoint `GET /api/mapa/productos` ya está en producción (entrega 1). La app lo pide con `fetch` igual que ya pide `/mapa` (`src/lib/mapa.ts`). Toda decisión de estado vive en funciones puras de `src/lib/` con tests de jest (el proyecto NO renderiza componentes en sus pruebas); los componentes solo pintan. La hoja inferior (`HojaPunto`, `@gorhom/bottom-sheet`) gana un tercer contenido, `ListaProductos`, junto a `FichaPunto` y `ListaCelda`.

**Tech Stack:** Expo / React Native · `@maplibre/maplibre-react-native` 11 · `@gorhom/bottom-sheet` 5 · `@tanstack/react-query` · jest (`jest-expo`) · paquete `@oficio/shared` (tipos y formato, vitest).

**Spec:** `oficios-cuba/docs/superpowers/specs/2026-10-09-productos-en-mapa-design.md` («Entrega 2 — app Android») y, para la conducta, su parte web. Renders: https://claude.ai/artifact/VBEYXFb7WkX2aCSUe2HxFM

## Global Constraints

- **Sitio.** Rama `productos-en-mapa-app` desde `master` en un worktree propio: desde `/home/wajir0/docker/oficio`, `git worktree add /home/wajir0/worktrees/oficio-productos-app -b productos-en-mapa-app master`, y `npm ci` en `shared/` y `mobile/`. Nunca se edita en `/home/wajir0/docker/oficio`.
- **Verificación.** App: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`. Shared: `cd oficios-cuba/shared && npx tsc --noEmit && npx vitest run`. Base: mobile 133/133.
- **El endpoint** (ya en producción): `GET /api/mapa/productos?bbox=sur,oeste,norte,este&q=&category=&sort=relevance|price_asc|price_desc&page=` → `{ dentro: { items, total, page, pages }, fuera }`. Cada item: `CatalogItem` + `provider_id, provider_name, provider_avatar, subscription_plan, contact_mode, whatsapp, province_name, municipality_name, lat, lng, tipo ('oficio'|'negocio'), aproximado` y, solo en `fuera`, `distancia_km`. 20 por página; `fuera` solo en la página 1.
- **Textos** (español de Cuba, tuteo), iguales que la web: «N productos en esta zona» / «1 producto en esta zona», «Mueve el mapa para ver otros», «Relevancia», «Menor precio», «Mayor precio», «Fuera de esta zona · N», «Toca uno y el mapa se amplía para incluirlo», «Los precios en USD se comparan a la tasa de referencia. «A consultar» va al final.», «No hay productos en esta zona.», «Ver más productos», «Ver N productos» / «Ver 1 producto», «Ver productos cercanos», «Lo que tocaste», «Volver a la lista». Pestañas: «Servicios», «Negocios», «Productos».
- **Privacidad.** La app solo usa `lat/lng` que vienen del servidor (ya son el punto publicado).
- **Precio.** Con `precioCatalogo` de `@oficio/shared` y la tasa de `useTasa()`; sin fórmulas propias.
- **Lecciones de la web que valen aquí** (no repetir los fallos ya corregidos allí): una ficha cuenta como «abierta desde productos» SOLO si se abrió tocando un producto; si hay una lista de celda detrás, «Volver a la lista» tiene prioridad sobre volver a productos; el producto tocado va primero aunque el catálogo filtrado del negocio no lo traiga (la búsqueda pudo coincidir por el nombre del negocio).
- **Commits** en español, con el trailer `Co-Authored-By` del modelo que los escribe.
- **APK**: solo en la Tarea 5, en j-u, con la skill `oficio-apk-release-publicar`. `ESTADO.md` dice DESARROLLO: publicar no necesita OK aparte.

## Review Focus

1. **Atrás de Android con la ficha abierta desde un producto** → vuelve a la lista de productos, no cierra la hoja; con la lista de productos → la cierra (y queda «Ver N productos»). → Tarea 2.
2. **Con la lista de productos a media altura, el mapa tiene que seguir respondiendo** a arrastres y toques: hoy el fondo de la hoja (`BottomSheetBackdrop`, `pressBehavior="close"`) tapa el mapa desde el anclaje 0. → Tarea 4.
3. **Cambiar de pestaña con una ficha o lista abierta** → se cierra; en Productos la lista vuelve a abrirse con la zona actual. → Tareas 2 y 4.
4. **Búsqueda que coincide por el nombre del negocio** («Pinturas»): la ficha enseña el producto tocado aunque el catálogo filtrado venga vacío. → Tarea 3.
5. **Red lenta o caída en la lista** → mensaje y «Reintentar», nunca una lista vacía que parezca «no hay productos». → Tarea 4.

---

### Task 1: Tipos compartidos y funciones puras de productos del mapa

**Files:**
- Modify: `oficios-cuba/shared/src/tipos.ts` (tras `CatalogPage`)
- Create: `oficios-cuba/mobile/src/lib/productosMapa.ts`
- Create: `oficios-cuba/mobile/test/productosMapa.test.ts`
- Modify: `oficios-cuba/mobile/src/lib/mapa.ts` (`usarMapa` acepta `onZona`)

**Interfaces (Produces):**
```ts
// shared/src/tipos.ts — gemelo de frontend/src/types/index.ts (ProductoMapa y compañía)
export type OrdenProductos = 'relevance' | 'price_asc' | 'price_desc';
export type ProductoMapa = CatalogItem & {
  provider_id: string; provider_name: string; provider_avatar: string | null;
  subscription_plan: 'free' | 'basic' | 'pro'; contact_mode: ContactMode; whatsapp: string | null;
  province_name: string | null; municipality_name: string | null;
  lat: number; lng: number; tipo: 'oficio' | 'negocio'; aproximado: boolean;
  /** Solo en `fuera`: desde el centro de la zona visible, en km con un decimal. */
  distancia_km?: number;
};
export interface MapaProductosRespuesta {
  dentro: { items: ProductoMapa[]; total: number; page: number; pages: number };
  fuera: ProductoMapa[];
}

// mobile/src/lib/productosMapa.ts
export const ORDENES_PRODUCTOS: { valor: OrdenProductos; etiqueta: string }[];   // Relevancia, Menor precio, Mayor precio
export function tituloProductos(n: number): string;          // «1 producto en esta zona» / «N productos en esta zona»
export function textoVerProductos(total: number, fuera: number): string | null; // «Ver N productos» / «Ver 1 producto» / «Ver productos cercanos» / null si no hay nada
export function lugarYDistancia(p: ProductoMapa): string;    // «Cerro, 4,1 km» (sin lugar: «4,1 km»; siempre 1 decimal con coma)
export function puntoDesdeProducto(p: ProductoMapa): PuntoMapa; // id=provider_id, nombre=provider_name, plan=subscription_plan, detras 0, cy/cx 0, resumen ''
export function qsProductos(bbox: Bbox, p: { q?: string; category?: string; sort: OrdenProductos; page: number }): string;
export async function pedirProductos(bbox: Bbox, p: {...}, signal: AbortSignal): Promise<MapaProductosRespuesta>; // fetch a `${configApi.baseUrl}/mapa/productos?…`, !ok → throw
export function cajaQueIncluye(b: Bbox, punto: { lat: number; lng: number }): Bbox;  // el bbox ampliado lo justo para contener el punto
export function claveProductos(zona: Bbox | null, q: string, category: string, sort: OrdenProductos): string; // '' si no hay zona
```
`usarMapa({ tab, q, category }, onZona?)`: `onZona(bbox)` se llama en `cargar(bbox)` JUSTO ANTES de `pedirMapa` (mismo bbox, mismo antirrebote; así la lista no espera a `/mapa`). Guardarlo en un ref como hace la web (`onZonaRef`).

- [ ] **Step 1:** worktree, rama y `npm ci` (Global Constraints). Base verde.
- [ ] **Step 2: tests que fallan** en `mobile/test/productosMapa.test.ts` (estilo de `test/panelMapa.test.ts` y `test/mapa.test.ts`; mira cómo `test/mapa.test.ts` mockea `fetch` si lo hace, y si no usa `global.fetch = jest.fn()`):
  - `tituloProductos(1)` → «1 producto en esta zona»; `(0)` → «0 productos en esta zona»; `(7)` → «7 productos en esta zona».
  - `textoVerProductos(3, 0)` → «Ver 3 productos»; `(1, 0)` → «Ver 1 producto»; `(0, 4)` → «Ver productos cercanos»; `(0, 0)` → `null`.
  - `lugarYDistancia` con `municipality_name: 'Cerro', distancia_km: 4.1` → «Cerro, 4,1 km»; `distancia_km: 2` → «Cerro, 2,0 km»; sin municipio pero con `province_name: 'La Habana'` → «La Habana, 4,1 km»; sin lugar → «4,1 km».
  - `puntoDesdeProducto` copia `provider_id`→`id`, `provider_name`→`nombre`, `tipo`, `lat`, `lng`, `aproximado`, `subscription_plan`→`plan`, y deja `detras: 0, cy: 0, cx: 0, resumen: ''`.
  - `qsProductos({sur:22,oeste:-80,norte:22.1,este:-79.9}, { q: 'cake', sort: 'price_asc', page: 2 })` contiene `bbox=22%2C-80%2C22.1%2C-79.9` (o la forma que dé `URLSearchParams`, comprobar decodificando), `q=cake`, `sort=price_asc`, `page=2`, y NO contiene `category` si viene vacía.
  - `pedirProductos` con `fetch` simulado: llama a `…/mapa/productos?…` con la `signal`, devuelve el JSON; con `ok: false` rechaza.
  - `cajaQueIncluye(b, {lat: 22.5, lng: -79.95})` → `norte: 22.5`, el resto igual; un punto dentro devuelve `b` igual.
  - `claveProductos(null, …)` → `''`; dos zonas iguales con otro `sort` → claves distintas.
- [ ] **Step 3:** correrlos y ver que fallan (módulo inexistente).
- [ ] **Step 4:** implementar tipos y funciones. `lugarYDistancia` usa `distancia_km.toFixed(1).replace('.', ',')`.
- [ ] **Step 5:** `onZona` en `usarMapa` (+ un test en `test/mapa.test.ts` solo si ese archivo ya prueba el hook; si solo prueba funciones puras, no se añade test y se dice en el informe).
- [ ] **Step 6:** verificación completa (mobile + shared) y commit «App: tipos y funciones de la lista de productos del mapa».

---

### Task 2: Estado del panel y botón Atrás con la lista de productos

**Files:**
- Modify: `oficios-cuba/mobile/src/lib/panelMapa.ts`
- Modify: `oficios-cuba/mobile/src/lib/hojaPunto.ts` (`accionAtras`)
- Modify: `oficios-cuba/mobile/test/panelMapa.test.ts`, `oficios-cuba/mobile/test/hojaPunto.test.ts`

**Interfaces (Produces):**
```ts
export type EstadoPanel = {
  punto: PuntoMapa | null; lista: PuntoMapa[] | null; listaPrevia: PuntoMapa[] | null;
  errorLista: string; reintentarLista: (() => void) | null;
  /** La lista de productos está a la vista (o detrás de una ficha abierta desde ella). */
  productos: boolean;
  /** El producto tocado: va primero y marcado en la ficha de su negocio. */
  productoMarcado: ProductoMapa | null;
  /** La ficha actual se abrió tocando un producto (no un pin ni una celda). */
  fichaDeProductos: boolean;
};
export function reduceAbrirProductos(e: EstadoPanel): EstadoPanel;          // lista de productos a la vista, sin punto ni celda
export function reduceElegirProducto(e: EstadoPanel, p: ProductoMapa): EstadoPanel; // punto = puntoDesdeProducto(p), productoMarcado = p, fichaDeProductos = true, productos sigue true
export function reduceVolverAProductos(e: EstadoPanel): EstadoPanel;        // quita el punto; productos true; fichaDeProductos false
// Existentes: reduceAbrirPunto / reduceAbrirLista / reduceElegirDeLista ponen fichaDeProductos=false y productoMarcado=null, y conservan `productos` (para que «Ver N productos» sepa si reabrir);
// reduceCerrar → ESTADO_PANEL_VACIO (productos false).
export function desdeProductos(e: EstadoPanel): boolean; // e.fichaDeProductos && e.punto !== null && e.listaPrevia === null

// hojaPunto.ts
export type AccionAtras = 'nada' | 'cerrar' | 'volver-a-lista' | 'volver-a-productos';
// accionAtras recibe además `desdeProductos: boolean`: con lista previa → 'volver-a-lista' (prioridad); si no, desdeProductos → 'volver-a-productos'; lista de productos sola (sin punto ni celda) → 'cerrar'.
```
- [ ] **Step 1: tests que fallan** (en los dos archivos de test existentes, mismo estilo):
  - elegir un producto deja `punto` con `id = provider_id`, `productoMarcado`, `fichaDeProductos = true`, `productos = true`;
  - volver a productos quita el punto y deja `productos = true`, `fichaDeProductos = false`, conserva `productoMarcado`;
  - **el recorrido que falló en la web**: elegir producto → volver → abrir una celda → elegir de la celda el mismo negocio → `desdeProductos(e) === false` y `listaPrevia` presente;
  - abrir un pin con la lista de productos a la vista → `fichaDeProductos = false`, `productoMarcado = null`;
  - cerrar → todo vacío;
  - `accionAtras`: ficha desde productos → 'volver-a-productos'; ficha con lista previa aunque haya productos → 'volver-a-lista'; solo lista de productos → 'cerrar'; nada abierto → 'nada'.
- [ ] **Step 2:** verlos fallar. **Step 3:** implementar. **Step 4:** verificación completa. **Step 5:** commit «App: estado del panel del mapa con la lista de productos».

---

### Task 3: Pestañas en el mapa y productos en la ficha

**Files:**
- Modify: `oficios-cuba/mobile/app/(tabs)/explorar.tsx` (estado `tab` y selector de pestañas en la vista mapa)
- Modify: `oficios-cuba/mobile/src/componentes/FichaPunto.tsx` (sección de productos)
- Modify: `oficios-cuba/mobile/src/componentes/HojaPunto.tsx` (reenvía `tab`, `q`, `productoMarcado`, `etiquetaVolver`)
- Create (si hace falta lógica pura nueva): funciones en `src/lib/productosMapa.ts` con su test

**Qué hace:**
- En la vista **Mapa**, bajo el buscador, un selector de tres pestañas «Servicios», «Negocios», «Productos» con el mismo aspecto que el conmutador Lista/Mapa (`e.switch`). `MapaExplorar` recibe ese `tab` (hoy fijo a `'servicios'`). La vista Lista no cambia. El texto del buscador en mapa: Servicios «Electricista, clases de inglés…», Negocios «Panadería, cafetería, taller…», Productos «Cake, breaker, zapatos, pintura…». Cambiar de pestaña cierra lo abierto (`reduceCerrar`), igual que cambiar `q` o categoría.
- En `FichaPunto`, con `tab === 'productos'` y la ficha desplegada (`FichaCompleta`), en lugar del acordeón de Servicios va una sección «Productos (N)» con el catálogo del negocio filtrado por `q` (`api.catalogo.deProveedor(punto.id, { q })`), hasta 6 artículos como tarjeta pequeña (foto o inicial, nombre en 2 líneas, precio con `precioCatalogo`), y «Ver los N productos» que lleva a `/proveedor/<id>` si hay más. Tocar uno abre `ModalArticulo` (mira cómo lo monta `app/proveedor/[id].tsx` para construir `VendedorCatalogo`).
- Con `productoMarcado`, ese artículo va **primero** con borde/fondo de marca y la etiqueta «Lo que tocaste», sin duplicarse si el catálogo también lo trae, y **aunque el catálogo filtrado venga vacío** (Review Focus 4); el número de la sección es `max(total, mostrados)`. Con `productoMarcado`, la sección de productos va antes de la descripción, para que en la hoja a media altura se vea sin desplazarse (lección de la web).
- El botón de volver acepta `etiquetaVolver` (por defecto «Volver a la lista»).
- La lógica de «qué artículos y en qué orden» va en una función pura `articulosConMarcado(items, marcado)` en `src/lib/productosMapa.ts`, con tests (marcado primero, sin duplicar, presente aunque `items` esté vacío, `null` → igual).

- [ ] **Step 1:** test de `articulosConMarcado` que falla. **Step 2:** implementarla. **Step 3:** UI (pestañas, sección, reenvíos). **Step 4:** verificación completa. **Step 5:** commit «App: pestañas en el mapa y productos filtrados en la ficha».

---

### Task 4: Lista de productos en la hoja, orden, fuera de zona y «Ver N productos»

**Files:**
- Create: `oficios-cuba/mobile/src/componentes/ListaProductos.tsx`
- Create: `oficios-cuba/mobile/src/lib/usarProductosMapa.ts` (hook; su lógica de descarte usa `claveProductos`)
- Modify: `oficios-cuba/mobile/src/componentes/HojaPunto.tsx` (tercer contenido; fondo)
- Modify: `oficios-cuba/mobile/src/componentes/MapaExplorar.tsx` (`onZona`, ampliar hasta un punto, pin suelto)
- Modify: `oficios-cuba/mobile/app/(tabs)/explorar.tsx` (coordinación)

**Qué hace:**
- **Hook** `usarProductosMapa({ zona, q, category, sort, activo })` → `{ dentro, total, fuera, hayMas, cargando, cargandoMas, error, verMas, reintentar }`, gemelo de `frontend/src/components/mapa/usarProductosMapa.ts` (léelo): página 1 al cambiar la clave, con `AbortController`; «Ver más» pega la página siguiente solo si `claveProductos(...)` no cambió mientras llegaba. Tiempo de espera de 20 s como `pedirMapa`.
- **Orden** en estado de la pantalla (la app no tiene URL): por defecto `relevance`; cambiarlo vuelve a pedir la página 1.
- **`ListaProductos`** (patrón visual de `ListaCelda`): cabecera con `tituloProductos(total)`, «Mueve el mapa para ver otros», X para cerrar; fila de tres botones de orden; filas compactas: miniatura 48 px (foto o inicial, como las tarjetas del catálogo de la app), nombre en 2 líneas, debajo logo 16 px (`Avatar`/inicial) + nombre del negocio pequeño, precio a la derecha con `precioCatalogo` + `useTasa()`. Estados: cargando (esqueleto o «Cargando…»), error con «Reintentar», vacío «No hay productos en esta zona.» (y aun así la sección de fuera). «Ver más productos» al final si `hayMas`. Sección «Fuera de esta zona · N» con «Toca uno y el mapa se amplía para incluirlo» y `lugarYDistancia(p)` en cada fila. Con orden de precio, la nota de la tasa al pie.
- **Hoja**: tercer contenido (`productos` visible y sin punto ni celda). El fondo oscuro (`BottomSheetBackdrop`) NO aparece en el anclaje asomado cuando el contenido es la lista de productos (`appearsOnIndex={1}` en ese caso): el mapa sigue usable (Review Focus 2). Para ficha y celda no cambia. Al cambiar de contenido vuelve al anclaje asomado, como hoy. Atrás usa `accionAtras` con `desdeProductos` (Tarea 2).
- **Pantalla**: con `tab === 'productos'` y la vista mapa, la lista se abre sola al cambiar pestaña/q/categoría (`reduceAbrirProductos`), nunca al mover el mapa. Tocar un producto → `reduceElegirProducto`; uno de fuera además amplía el mapa con `cajaQueIncluye(zonaActual, punto)` (MapLibre: mira la API de `CameraRef` instalada — `fitBounds` con `padding` inferior = alto de la hoja asomada — y úsala; si no existe, `flyTo` al punto con un zoom que lo incluya). «‹ N productos» = `etiquetaVolver` cuando `desdeProductos(e)`; con lista de celda previa sigue «Volver a la lista». Cerrada la lista (X o arrastrar abajo), un botón flotante con `textoVerProductos(total, fuera.length)` la reabre; oculto mientras haya hoja abierta.
- **Mapa**: `MapaExplorar` recibe `onZona` (lo pasa a `usarMapa`) y `seleccionado?: { id, lat, lng, tipo }`: si su pin no está entre los pintados (agrupado), pinta `PinSeleccionado` suelto en ese punto.
- Lo que se pueda probar sin renderizar (p. ej. una función `contenidoHoja(e)` que devuelve 'productos' | 'ficha' | 'celda' | null, o `mostrarBotonProductos(...)`) va a `src/lib/` con test.

- [ ] **Step 1:** tests de las funciones puras nuevas que falla. **Step 2:** implementar. **Step 3:** UI y coordinación. **Step 4:** verificación completa. **Step 5:** commit «App: lista de productos del mapa con orden, fuera de zona y botón para reabrirla».

---

### Task 5: APK nueva, prueba en emulador y publicación

**Files:**
- Modify: `oficios-cuba/mobile/app.config.ts` (`version: '0.2.6'`, `versionCode: 9`)
- Modify: `oficios-cuba/STATUS.md`

Sigue la skill `oficio-apk-release-publicar` (está en `~/.claude/skills/oficio-apk-release-publicar/SKILL.md` de vps2; léela entera), ejecutándola **en j-u por SSH** (`ssh j-u '…'`): vps2 no tiene Java ni SDK de Android y la llave de firma vive en j-u.

- [ ] **Step 1:** subir versión en la rama, verificación completa, fusionar la rama en `master` por avance directo, `git push origin master` (desde `/home/wajir0/docker/oficio`).
- [ ] **Step 2:** en j-u, clon `~/Documentos/dev/oficio-build-vps2`: `git fetch origin && git checkout master && git pull --ff-only` (hoy está en `app-ficha-proveedor` sin cambios locales; comprobar `git status --porcelain` vacío antes). Dependencias y `google-services.json` según la skill. SDK en `~/Android/Sdk` (añadir `emulator/`, `platform-tools/` y `build-tools/36.1.0` al `PATH` en cada comando SSH).
- [ ] **Step 3:** compilar release + variante x86_64 (en segundo plano, ~5 min) según la skill.
- [ ] **Step 4:** emulador propio `jarvis_api34` en `-port 5556` (si hay otro emulador en marcha, es de otra sesión: no tocarlo). Instalar la variante x86_64 contra PRODUCCIÓN y recorrer, mirando cada captura: Explorar → Mapa → pestaña Productos → buscar «pintura» → la lista se abre a media altura con el mapa usable → «Menor precio» reordena → tocar un producto → ficha con «Lo que tocaste» visible → Atrás de Android vuelve a la lista → Atrás otra vez la cierra y aparece «Ver N productos» → buscar algo con productos fuera de la zona (p. ej. «cake» en La Habana) → tocar uno de fuera amplía el mapa. Lo que no se vea, «no verificado».
- [ ] **Step 5:** comprobar el artefacto (`versionCode='9' versionName='0.2.6'`, permisos), publicar con `publicar-apk.sh`, comprobar `android.json` por Cloudflare (sha256 igual).
- [ ] **Step 6:** STATUS.md (formato de las existentes, al final), commit, push, y `git pull --ff-only` en `/home/wajir0/docker/oficio` si hiciera falta. Apagar el emulador propio y borrar capturas. Decir que la app se instala encima de la anterior sin desinstalar.
