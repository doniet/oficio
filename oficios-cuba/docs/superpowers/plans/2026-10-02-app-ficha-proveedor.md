# La ficha del proveedor llega a la app — plan de implementación

**Diseño:** `docs/superpowers/specs/2026-10-02-app-ficha-proveedor-design.md` — **de lectura
obligatoria antes de tocar nada.** Este plan dice QUÉ archivo y CÓMO verificar; el porqué de cada
decisión está allá y no se repite aquí.

**Rama:** `app-ficha-proveedor`, partiendo de `master` (`8be23c3`).

## Reglas para todos

1. **Cada tarea es dueña de una lista cerrada de archivos.** No se toca ningún archivo fuera de ella,
   ni «de paso», ni para arreglar algo obvio. Si hace falta tocar otro, se anota y se escala — varias
   tareas corren a la vez sobre el mismo árbol y la propiedad disjunta es lo único que lo hace seguro.
2. **El backend no se toca.** Ni `backend/`, ni `frontend/`, ni `docker-compose.yml`.
3. **Texto de UI en español de Cuba, tuteo.** Nombres de variables y funciones en español, como el
   resto de `mobile/src/` (`cargarCelda`, `pedirCelda`, `tituloCelda`).
4. **La lógica probable vive en `src/lib/`, no dentro del componente.** Es la convención del repo.
5. Comentarios solo para el PORQUÉ no obvio. Nada que explique qué hace la línea de al lado.
6. Un commit por tarea, mensaje en español, descriptivo, sin `--no-verify`.
7. **Verificar de verdad antes de decir que está hecho:** `npx tsc --noEmit` y `npx vitest run` en el
   paquete que se tocó. Pegar la salida real. Si falla, decirlo.

---

# Ola A — cimientos (sin dependencias, van a la vez)

## T1 — `shared/`: tipos y métodos de catálogo, reseñas y detalle

**Archivos (dueña):** `shared/src/tipos.ts`, `shared/src/api.ts`, `shared/test/api.test.ts`

### Tipos

Copiar de `frontend/src/types/index.ts:403-435` **letra por letra**: `CatalogPriceType`,
`CatalogItem`, `CatalogPage`. NO copiar `CatalogInput`, `CatalogSearchItem` ni `CatalogSearchPage`
(son de escritura y de la búsqueda general; la app no hace ninguna).

🚨 `CatalogItem.price_type` es `'fixed' | 'from' | 'ask'`. **No es** el `PriceType` de servicios
(`'fixed' | 'hourly' | 'daily' | 'negotiable'`), que ya existe en el archivo. Son dos uniones
distintas que comparten el miembro `'fixed'`. Declarar `CatalogPriceType` aparte; reusar `PriceType`
compila y está mal.

Corregir `ProviderPublic` (hoy en `shared/src/tipos.ts:145`), que miente por omisión — la respuesta
de `GET /providers/:id` trae dos campos que el tipo no declara (`routes/providers.ts:311`):

- `gallery: string[]`
- `lat?: number` y `lng?: number`, con un comentario diciendo que solo vienen si el perfil marcó
  `show_on_map`, y que son el punto **publicado** (desplazado 100-300 m cuando la precisión es
  `zona`), nunca la coordenada real — la regla vive en `backend/src/lib/ubicacion.ts`.

### Métodos (`shared/src/api.ts`)

Dentro del objeto que devuelve `crearCliente`, con el mismo estilo que los existentes:

- En `proveedores` (que ya tiene `destacados` y `contacto`), añadir:
  `detalle(id)` → `GET /providers/:id` → `{ provider: ProviderPublic; services: ProviderServiceItem[];
  serviceAreas: …; reviews: Review[]; distribution: { rating: number; count: number }[] }`.
  Para `serviceAreas`, mirar qué devuelve `serviceAreasOf` en `backend/src/routes/providers.ts` y
  declarar la forma real; si ya hay un tipo en `tipos.ts` que calce, usarlo.
- Clave nueva `catalogo`: `deProveedor(id, opciones?)` → `GET /catalog/provider/:id` con query
  `q`, `section`, `page` → `CatalogPage`.
- Clave nueva `resenas`: `deProveedor(id, opciones?)` → `GET /reviews/provider/:id` con query
  `page`, `limit` → `{ reviews: Review[]; pagination: Pagination }`.

Usar `encodeURIComponent` en el id, como hacen todos los métodos existentes. El `pedir` ya filtra las
claves de query `undefined` o `''`: no hace falta limpiarlas a mano.

### Pruebas (`shared/test/api.test.ts`)

Añadir al archivo existente, siguiendo su estilo (no inventar uno nuevo):

- Cada método pega en la ruta correcta con el id escapado.
- La query se arma bien y **los parámetros vacíos o `undefined` no se mandan**.
- Un 404 lanza `ErrorApi` con `status: 404`.

**Hecho cuando:** `cd shared && npx tsc --noEmit && npx vitest run` pasa, con las pruebas nuevas
contadas en la salida.

---

## T2 — `ui.tsx`: acordeón, compartir y el paracaídas de la portada

**Archivos (dueña):** `mobile/src/componentes/ui.tsx`, `mobile/src/lib/api.ts`

### `Acordeon`

Cabecera pulsable con título y un chevron que rota al abrir. Estado interno, con `defaultAbierto`
por prop (la hoja del mapa lo quiere cerrado; otros sitios podrían quererlo abierto).

🚨 **Plegado, los hijos NO se montan**: `{abierto && children}`. Nada de `display: none`, nada de
`opacity: 0`, nada de altura 0. Es la razón de existir del componente — la web no mete las fotos en
el DOM mientras está cerrado y la app tiene que hacer lo mismo o se bajan igual. Ponerlo en un
comentario para que nadie lo «optimice» después con una animación de altura.

Accesibilidad: `accessibilityRole="button"` y `accessibilityState={{ expanded }}` en la cabecera.

### `BotonCompartir`

Envuelve `Share.share({ title, url })` con `Share` importado de `react-native` — **no se añade
ninguna dependencia**; `expo-sharing` no hace falta para compartir una URL.

🚨 **Cancelar no es un error.** `Share.share` resuelve con `action: 'dismissedAction'` cuando el
usuario cierra la hoja del sistema, y en Android puede rechazar. Los dos casos se tragan en silencio:
nada de `Aviso`, nada de log de error. Solo un fallo real merece aviso, y aun así discreto.

### `Portada`

Añadirle `onError` que conmute al emoji de categoría, el mismo paracaídas que `Avatar` ya tiene
(`ui.tsx:91`). Hoy no lo tiene y la pantalla nueva lo destapa en la foto más grande de la app.

### `origenWeb()` a `lib/api.ts`

Hoy vive dentro de `FichaPunto.tsx` (líneas 13-15). Moverla a `mobile/src/lib/api.ts`, junto a
`urlImagen`, y exportarla. **Esta tarea solo la crea en su destino**; quitarla de `FichaPunto.tsx` es
de T7, que es la dueña de ese archivo. Durante un rato habrá dos: es correcto y se resuelve en la
ola C.

**Hecho cuando:** `cd mobile && npx tsc --noEmit` pasa.

---

## T8 — `ListaCelda`: mini-pin en vez de icono suelto

**Archivos (dueña):** `mobile/src/componentes/ListaCelda.tsx`, `mobile/src/lib/pines.ts`

Decisión 5 del diseño. Hoy cada fila pinta un icono `location` suelto coloreado con
`PIN_POR_TIPO[tipo].fondo`: `brand[400]` sobre fondo claro da ≈2,2:1, por debajo del 3:1 que WCAG
pide para un elemento gráfico, y es el **único** indicador de tipo en la fila.

Sustituirlo por el mismo par relleno+glifo que usa el mapa: un círculo pequeño del color de fondo del
tipo con el icono encima en el color de glifo que `pines.ts` ya define para ese tipo. El contraste
pasa a ser glifo-contra-relleno, que es el par que esa tabla sí tiene validado.

Si `pines.ts` necesita exponer el tamaño o una variante «mini», se le añade ahí (es archivo de esta
tarea). No cambiar los colores de la tabla: se reusa lo que hay.

Comprobar que la etiqueta de accesibilidad de la fila sigue diciendo el tipo en texto — el color
nunca puede ser el único canal.

**Hecho cuando:** `cd mobile && npx tsc --noEmit && npx vitest run` pasa (las suites existentes de
`listaCelda` siguen verdes).

---

# Ola B — lógica pura (necesita A)

Las tres tareas crean archivos nuevos y no tocan ninguno existente: no pueden chocar entre sí.

## T3 — `lib/catalogo.ts` + pruebas

**Archivos (dueña):** `mobile/src/lib/catalogo.ts`, `mobile/test/catalogo.test.ts`

Lógica pura, sin React, exportada para que la pantalla la consuma:

- `montarCatalogo(pagina)` — si `total_all === 0`, la sección no se monta. La web hace eso en
  `frontend/src/components/catalog/ProviderCatalog.tsx:69-72`: un perfil sin catálogo no reserva un
  hueco vacío.
- `siguientePagina(ultima)` — para `getNextPageParam`: devuelve `page + 1` mientras `page < pages`,
  si no `undefined`.
- `ANTIRREBOTE_BUSQUEDA_MS = 400` — el mismo valor que la web, con el comentario de dónde sale.
- Lo que haga falta para aplanar las páginas de `useInfiniteQuery` en una lista de artículos.

🚨 `available === false` **no se filtra**: el artículo se pinta atenuado con la insignia «Agotado»,
como la web (`CatalogCard.tsx:47,51`). Si alguna función de esta tarea filtra por `available`, está
mal.

Las secciones de los chips salen de `pagina.sections`, que son las del catálogo **entero**, no las
del filtro aplicado — el backend las calcula aparte a propósito (`routes/catalog.ts:65-68`).

**Pruebas:** estilo de `mobile/test/listaCelda.test.ts`. Cubrir: `total_all === 0` no monta;
`total_all > 0` con `total === 0` (filtro sin resultados) **sí** monta y enseña vacío; el encadenado
de páginas corta en la última; agotados presentes en la lista.

**Hecho cuando:** `cd mobile && npx tsc --noEmit && npx vitest run` pasa con las pruebas nuevas.

## T4 — `lib/resenas.ts` + pruebas

**Archivos (dueña):** `mobile/src/lib/resenas.ts`, `mobile/test/resenas.test.ts`

- `siguientePaginaResenas(paginacion)` — `page + 1` mientras `page < totalPages`, si no `undefined`.
- `RESENAS_POR_PAGINA = 10` — el tope por defecto del endpoint.
- Resumen de estrellas a partir de `distribution` (que `GET /providers/:id` ya devuelve): porcentaje
  por cada valor 5→1, tolerando que falten valores sin reseñas.

🚨 **Las 20 reseñas que trae `GET /providers/:id` NO se usan.** No paginan, y mezclarlas con la lista
paginada duplica filas en la primera página. Se ignoran, con un comentario que diga por qué, para que
nadie las «aproveche» después creyendo que ahorra una petición.

`service_title` puede ser `null` (borrar un servicio conserva sus reseñas): cualquier función que lo
toque lo contempla.

**Pruebas:** el corte de la paginación; el resumen con valores faltantes; `service_title` nulo.

**Hecho cuando:** igual que T3.

## T5 — `lib/compartir.ts` + pruebas

**Archivos (dueña):** `mobile/src/lib/compartir.ts`, `mobile/test/compartir.test.ts`

- `urlPerfil(id)` — arma `https://…/proveedor/<id>` sobre `origenWeb()` de `lib/api.ts` (la puso T2).
  **URL web, no deep link de la app**: a quien lo reciba sin la app instalada le tiene que abrir algo.
- `compartirPerfil(id, nombre)` — llama a `Share.share({ title: nombre, url })`, mismo contrato que
  la web (`frontend/src/components/mapa/FichaPunto.tsx:329-341`).
- `esCancelacion(resultadoOError)` — distingue cancelar de fallar. Cancelar devuelve falso en el
  camino de error.

**Pruebas:** la URL se arma contra `origenWeb()` (mockeando `lib/api.ts`); el id se escapa;
`dismissedAction` cuenta como cancelación y no como error; un rechazo de Android también.

**Hecho cuando:** igual que T3.

---

# Ola C — pantallas (necesita A y B)

## T6 — la pantalla `proveedor/[id]`

**Archivos (dueña):** `mobile/app/proveedor/[id].tsx` (nuevo), `mobile/app/_layout.tsx`

🚨 **Crear el archivo no basta.** `app/_layout.tsx:95-109` declara explícitamente cada pantalla con
parámetro dinámico (`<Stack.Screen name="servicio/[id]" options={{ title: '' }} />`, línea 107). Hay
que añadir la suya o se monta sin sus `options`.

Estructura y manejo de estados calcados de `mobile/app/servicio/[id].tsx`: `SafeAreaView` +
`ScrollView`, React Query, **404 distinguido** de error de red (`servicio/[id].tsx:90-102`),
`EstadoError` con reintentar.

Secciones, en orden (sección «Diseño — la pantalla» del spec): portada, identidad, sobre mí, galería,
dónde (dirección, **sin mapa**), servicios en lista plana, catálogo, reseñas, contacto, compartir.

- **Tres consultas independientes**: perfil, catálogo y reseñas. Si el catálogo falla con el perfil ya
  cargado, la pantalla **no se cae entera** — esa sección muestra su propio error y reintenta sola.
- **Ni catálogo ni reseñas pueden ser `FlatList`** anidadas en el `ScrollView` (lista virtualizada
  dentro del mismo eje: avisa y se comporta mal). Van con `.map()` y un botón «Ver más», que es
  además lo que hace la web.
- Reservar altura con `Esqueleto` en catálogo y reseñas: los datos llegan de tres consultas y sin eso
  el orden salta al cargar.
- Contacto: reusar `mobile/src/lib/contacto.ts`, que ya apunta el contacto en
  `POST /providers/:id/contact`. «Enviar mensaje» solo si `provider.has_chat`.
- **Ninguna regla de plan en el cliente.** Gratis llega sin portada, sin catálogo (`total_all === 0`)
  y con `has_chat` falso porque el backend ya lo resolvió. La app reacciona a lo que viene; no
  replica la tabla de planes.

**Hecho cuando:** `cd mobile && npx tsc --noEmit && npx vitest run` pasa.

## T7 — la ficha del mapa: cliente compartido, acordeón, compartir y volver

**Archivos (dueña):** `mobile/src/componentes/FichaPunto.tsx`

Cuatro cambios en un solo archivo:

1. **Dejar el `fetch` crudo.** Hoy `pedirProveedor` (líneas 21-28) pega a mano con su propio
   `TIEMPO_ESPERA_MS`. Pasa a usar `proveedores.detalle` del cliente compartido (T1), que ya trae su
   timeout. La constante local y el `fetch` desaparecen. **Quitar también `origenWeb()`** (líneas
   13-15) e importarla de `lib/api.ts`, donde T2 la dejó.
2. **Acordeón de servicios, plegado por defecto** (`Acordeon` de T2, `defaultAbierto={false}`), con
   el adelanto del catálogo debajo si el perfil tiene. Paridad con
   `frontend/src/components/mapa/FichaPunto.tsx:51-71`. Plegado no se montan las `<Image>`.
3. **Botón Compartir** (`BotonCompartir` de T2 + `compartirPerfil` de T5).
4. **«← Volver a la lista» visible**, decisión 4 del diseño. El manejador ya existe
   (`onVolverALista`); es pintar el control y cablearlo. Se ve **solo** cuando se llegó desde la
   lista de una celda — si no, no se pinta. La X sigue donde está y sigue cerrando la hoja entera.

Además, «Ver perfil completo» deja de abrir el navegador: `router.push('/proveedor/' + id)`.

🚨 Esta ficha vive dentro de una hoja con anclajes y carga diferida al desplegar. No cambiar esa
conducta: está probada en `mobile/test/hojaPunto.test.ts` y es de lo que el sub-proyecto 1 estabilizó.

**Hecho cuando:** `cd mobile && npx tsc --noEmit && npx vitest run` pasa — las 81 pruebas que ya
había siguen verdes.

## T9 — enlazar las tarjetas al perfil

**Archivos (dueña):** `mobile/src/componentes/TarjetaProfesional.tsx`

Hoy el componente no enlaza a ningún sitio y su comentario (líneas 7-9) explica que es porque el
perfil «todavía no existe en la app (sigue en la web)». Ya existe: envolverla en `Pressable` con
`router.push('/proveedor/' + id)`, como `TarjetaServicio.tsx:15` hace con el servicio.

**Borrar ese comentario**, que deja de ser cierto. Dejar la tarjeta accesible: rol de botón y
etiqueta con el nombre del negocio.

**Hecho cuando:** `cd mobile && npx tsc --noEmit && npx vitest run` pasa.

---

# Ola D — verificación y cierre

## T10 — verificación integral

1. `cd shared && npx tsc --noEmit && npx vitest run`
2. `cd mobile && npx tsc --noEmit && npx vitest run` — **las 81 anteriores siguen verdes** más las
   nuevas; decir el número exacto.
3. `grep` de que nadie tocó `backend/`, `frontend/` ni `docker-compose.yml`: `git diff --stat master`.
4. Compilar la variante x86_64 y caminarla en el emulador (ver el apartado «Cómo compilar» de
   `docs/superpowers/2026-10-01-mapa-app-paridad-pendiente-dispositivo.md`), contra producción:
   - Entrar al perfil **desde el mapa** y **desde una tarjeta**.
   - Un perfil **con** catálogo y otro **sin** — el segundo no debe reservar hueco.
   - Buscar dentro del catálogo (antirrebote) y filtrar por sección.
   - Paginar reseñas con «Ver más».
   - Compartir desde la hoja y desde la pantalla; **cancelar** y comprobar que no sale ningún aviso.
   - Volver atrás desde cada sitio sin perder la celda abierta.
   - Un perfil **Gratis**: sin portada, sin catálogo, sin «Enviar mensaje».
5. Entrada en `STATUS.md` con el formato de las existentes. Tiene que decir explícitamente qué quedó
   sin verificar en hardware real, y si la 0.2.5 se compiló y publicó o no.

## T11 — cierre de la 0.2.5

Solo cuando T10 esté limpio: publicar la APK con la skill **`oficio-apk-release-publicar`**, donde el
orden importa (primero `./scripts/apk-release.sh`, cuyo prebuild fija la versión; la variante x86_64
después). No improvisar el flujo aquí.
