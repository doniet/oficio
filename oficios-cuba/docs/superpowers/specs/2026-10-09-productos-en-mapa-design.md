# Productos en el mapa — diseño

Fecha: 2026-10-09 · Estado: aprobado en conversación por Dariel, pendiente de revisión del texto.
Renders y prototipo: https://claude.ai/artifact/VBEYXFb7WkX2aCSUe2HxFM (versión 2).

## Para qué

Quien busca un producto en el mapa (pestaña Productos de `/explorar?vista=mapa`) hoy solo ve pines de
negocios: para saber qué venden y a cuánto tiene que tocarlos uno a uno. Este cambio pone primero lo
que la persona busca —el producto y su precio— y después dónde está.

Se considera logrado cuando, al buscar «cake» en el mapa:

1. Aparece sola una lista compacta de los productos de la zona visible, con su precio y, en pequeño,
   el logo y el nombre del negocio.
2. Se puede ordenar por Relevancia, Menor precio y Mayor precio, y el orden tiene sentido aunque haya
   precios en CUP y en USD.
3. Al final, aparte, salen los productos más cercanos que quedan fuera de la zona; tocar uno amplía
   el mapa para incluirlo.
4. Tocar un producto abre encima la ficha del negocio (la que ya existe, con sus productos filtrados)
   con ese producto primero y marcado, y «‹ N productos» devuelve a la lista igual que estaba.

## Decisiones tomadas (Dariel, 2026-10-09)

- La lista muestra la **zona visible** y, separados debajo, los productos de **fuera de la zona**.
  Tocar uno de fuera amplía el mapa para incluirlo.
- Órdenes: **Relevancia, Menor precio, Mayor precio**. Sin «Más cerca».
- **Fila compacta** como en los renders (no cuadrícula).
- **Un spec, dos entregas**: (1) servidor + web, a producción; (2) app Android + APK nueva. La app hoy
  no tiene pestaña Productos en su mapa (`mobile/app/(tabs)/explorar.tsx` fija `tab="servicios"`) ni
  productos en su ficha: la entrega 2 se los construye.

## Entrega 1 — servidor

### `GET /api/mapa/productos`

Pública, como `/api/mapa`. Parámetros:

| Parámetro | Valores | Nota |
|---|---|---|
| `bbox` | `sur,oeste,norte,este` | Mismo formato y misma validación que `/mapa` (`leerBbox`): inválido, invertido o fuera de Cuba → 400. |
| `q` | texto | Opcional. Misma búsqueda que `/catalog/search`: `ci.busca` o el nombre del negocio (`pp.busca`). |
| `category` | uuid o slug | Opcional. Mismo filtro que `/mapa` (`categoriaColumna`). |
| `sort` | `relevance` · `price_asc` · `price_desc` | Por defecto `relevance`. Cualquier otro valor → 400 (misma severidad que `tab` en `/mapa`). |
| `page` | entero ≥ 1 | Solo pagina `dentro`. |

Respuesta:

```ts
{
  dentro: { items: ProductoMapa[]; total: number; page: number; pages: number };
  fuera: ProductoMapa[];          // solo en page = 1; [] en las demás
}

// CatalogSearchItem (lo que ya devuelve /catalog/search) más:
type ProductoMapa = CatalogSearchItem & {
  lat: number; lng: number;        // el punto PUBLICADO del negocio (LAT_SERVIDA/LNG_SERVIDA)
  distancia_km?: number;           // solo en `fuera`: desde el centro del bbox, 1 decimal
};
```

**`dentro`**

- Artículos `available = true` y visibles por plan (`CON_CATALOGO_SQL`), de perfiles activos con
  `show_on_map = true` y `punto_pub` dentro del bbox **visible exacto**. A diferencia de `/mapa`, no se
  infla un 50 %: la lista dice «N productos en esta zona» y tiene que ser verdad.
- 20 por página (la misma `POR_PAGINA` de `catalog.ts`).
- `relevance`: mismo intercalado por negocio que `/catalog/search` (`ROW_NUMBER` por perfil, luego
  peso del plan y `ts_rank`), para que un negocio con muchas coincidencias no llene la lista.
- `price_asc` / `price_desc`: por precio en CUP, convirtiendo el USD con `TASA_CUP_USD` (la tasa de
  respaldo del servidor, la misma que usa el filtro de precio de `/services`). `price_type = 'ask'` o
  precio nulo van siempre al final, en los dos sentidos. Desempate: `ci.id`, para que la paginación
  sea estable.

**`fuera`**

- Hasta 10 artículos con el mismo filtro de texto/categoría/visibilidad, de perfiles con `punto_pub`
  **fuera** del bbox visible. Nunca repite nada de `dentro` (lo garantiza el filtro: un perfil está
  dentro o fuera del rectángulo, no en los dos).
- Se eligen los 10 más cercanos al centro del bbox (operador KNN `<->` sobre `punto_pub`, que usa el
  índice GiST `idx_pp_punto_pub`). Después se ordenan: por distancia en `relevance`; por precio en
  `price_asc`/`price_desc`, con las mismas reglas que `dentro`.
- `distancia_km` se calcula sobre `punto_pub` y se redondea a 1 decimal.

**Privacidad.** Todo —el filtro por zona, la cercanía y la distancia— usa solo `punto_pub`, nunca
`pp.lat`/`pp.lng`. Es la misma regla que protege a los perfiles «zona» en `/mapa` (ver el comentario
de `filtroDeVisibles`): filtrar o medir sobre la coordenada guardada abriría un oráculo para
acorralarla. La distancia a un punto público no revela nada que `/mapa` no revele ya.

**Limitación conocida.** El orden por precio usa la tasa de respaldo y la web muestra el «≈» con la
tasa del día (`/api/tasas`). Si las dos se separan mucho, el orden puede no coincidir exactamente con
lo que se lee en el «≈». Es la misma aproximación que ya hace el filtro de precio de servicios. Lo
importado de DardoVentas (`convertible = false`) viene en CUP, así que no se ve afectado.

### Dónde vive

En `routes/mapa.ts`, junto a `/` y `/celda`, para compartir la validación del bbox y el filtro por
`punto_pub`. La parte de artículos (columnas, `aItem`, condición de visibilidad, búsqueda) se reutiliza
de `catalog.ts` exportando lo necesario, sin copiarla.

## Entrega 1 — web

### Estado y URL

- El orden va en la URL: `&orden=price_asc` (`relevance` no se escribe, igual que `servicios` en
  `tab`). Así Atrás y un enlace compartido lo conservan.
- Un hook nuevo, `usarProductosMapa`, pide `/mapa/productos` con el mismo bbox y el mismo antirrebote
  con que `usarMapa` pide los pines (para que lista y pines siempre cuenten la misma zona), y con
  `AbortController` para descartar respuestas viejas. Gestiona «Ver más» (página siguiente de
  `dentro`).

### Panel

- Con `tab === 'productos'`, al cargar resultados `ExplorarMapa` abre el panel con un contenido nuevo,
  `ListaProductos` (hermano de `ListaCelda` y `FichaPunto`; `PanelMapa` elige cuál pintar).
  Escritorio: panel lateral. Móvil: hoja inferior a media altura (`asomada`).
- Cabecera: «N productos en esta zona», «Mueve el mapa para ver otros» y los tres botones de orden.
  Con orden de precio, al pie: «Los precios en USD se comparan a la tasa de referencia. "A consultar"
  va al final.»
- Fila: foto 48 px (`CatalogImage`), nombre a 2 líneas como máximo, debajo logo 16 px (`Avatar`) y
  nombre del negocio en pequeño; a la derecha el precio con `PrecioArticulo` (incluye «desde» y «≈»).
- «Fuera de esta zona · N», con separador gris y «Toca uno y el mapa se amplía para incluirlo». Sus
  filas añaden «· municipio, X km».
- Si se cierra el panel (X, Esc o arrastrar la hoja abajo), queda un botón flotante «Ver N productos»
  que lo reabre. Cambiar de pestaña o de categoría lo cierra como hoy.
- Estados: cargando (esqueleto de filas), error (`ErrorState` con reintentar), vacío en la zona
  («No hay productos en esta zona», y debajo la sección de fuera si trae algo).

### Navegación

- Tocar una fila → `FichaPunto` del negocio con un prop nuevo `productoMarcado`: ese artículo va
  primero en `SeccionProductos`, con fondo `brand-50`, borde y la etiqueta «Lo que tocaste».
- «‹ N productos» (el `onVolverALista` que ya existe, generalizado) vuelve a la lista con el mismo
  orden, los mismos datos (sin volver a pedirlos) y la misma posición de scroll.
- Tocar una fila de fuera → `fitBounds` del bbox actual ampliado con el punto del negocio (con el
  margen del panel en escritorio), luego abre su ficha. La lista se recarga sola con la zona nueva;
  al volver, ese producto ya está en `dentro`.
- Tocar un pin del mapa sigue abriendo la ficha del negocio como hoy.

### Resaltar en el mapa

Al tocar una fila (móvil) o pasar el ratón (escritorio) se marca el negocio. Si su pin está pintado
(es el representante de su celda), crece como el `seleccionadoId` actual; si está agrupado detrás de
otro, se pinta un marcador temporal en su `lat/lng` publicado, que se quita al soltar.

### Lo que no cambia

Las pestañas Servicios y Negocios, el salto automático de pestaña sin resultados (commit `3b38524`)
y la búsqueda en toda Cuba cuando la zona está vacía siguen igual.

## Entrega 2 — app Android

- `ControlesMapa`/explorar de la app: pestañas Servicios, Negocios, Productos en el mapa.
- `FichaPunto` de la app: sección de productos filtrados por la búsqueda, con `productoMarcado`.
- Lista de productos en la hoja (`@gorhom/bottom-sheet`) con el mismo endpoint y el mismo
  comportamiento (orden, fuera de zona, volver, resaltar).
- `mobile/src/lib/mapa.ts` es gemelo de `usarMapa.ts`: la regla de antirrebote compartida se mantiene
  igual en los dos.
- Publicación con la skill `oficio-apk-release-publicar`.

Esta entrega tendrá su propio plan cuando la 1 esté en producción.

## Pruebas

**Servidor** (`backend/test/mapa-productos.test.ts`):

- Solo entra lo que está dentro del bbox visible exacto (no del inflado).
- `fuera` no repite nada de `dentro`, trae como máximo 10 y en orden de cercanía con `relevance`.
- `price_asc` con CUP y USD mezclados ordena por equivalente en CUP; «A consultar» al final en
  `price_asc` y en `price_desc`.
- Un perfil «zona» se filtra y mide por `punto_pub`: un bbox que contiene su coordenada guardada pero
  no la publicada no lo devuelve.
- Agotados, ocultos por plan, perfiles inactivos y `show_on_map = false` no salen.
- `sort` inventado y `bbox` inválido → 400.

**Web** (vitest + Testing Library):

- `ListaProductos`: pinta filas, botones de orden, sección de fuera y estados.
- Flujo en `ExplorarMapa`: lista → tocar → ficha con el producto marcado → volver conserva el orden.
- El orden se lee y escribe en la URL.

**En navegador**: capturas con `dh-playwright` contra un backend local con datos de demo, a 390 px y
a 1280 px.

**Despliegue**: con la skill `oficio-deploy-vps2` y solo con el OK de Dariel.
