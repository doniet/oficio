# La ficha del proveedor llega a la app — diseño

**Fecha:** 2026-10-02
**Estado:** decisiones tomadas con Dariel el 2026-10-02, pendiente de plan de implementación.
**Alcance:** sub-proyecto 2 de 2 camino a la APK 0.2.5. El 1 (el mapa) está fusionado en `master`
(`8be23c3`). Cuando esto cierre, se compila y se publica la 0.2.5.

## Qué se quiere y para quién

Hoy la app enseña un negocio por encima y, para ver el resto, **echa al usuario fuera de la app**:
`FichaPunto.tsx:119-121` abre el navegador con `Linking.openURL(origenWeb() + '/proveedor/' + id)`.
`TarjetaProfesional.tsx:7-9` ni siquiera lo intenta — su comentario lo dice con todas las letras:
«Sin enlace: el perfil del profesional todavía no existe en la app (sigue en la web)».

Quien instala una app para buscar un plomero en Cuba y acaba en Chrome con una conexión lenta, se
cae del embudo justo en el paso que importa: el de decidir a quién escribir. Y el catálogo —lo único
que distingue a un negocio con 50 productos de uno con ninguno— **no se ve en la app en absoluto**.

**Éxito:** desde el mapa o desde una tarjeta se entra al perfil completo SIN salir de la app; ahí se
ven sus servicios, su catálogo buscable, sus reseñas y su portada; y el perfil se puede compartir
con alguien por WhatsApp sin copiar una URL a mano.

**Para quién:** el cliente que ya encontró a alguien y quiere decidir si le escribe. Es la pantalla
donde el producto cobra o no cobra.

## Lo que ya existe y no se rehace

| Pieza | Qué ya hace | Estado |
|---|---|---|
| `GET /providers/:id` | Devuelve en UNA llamada `provider`, `services`, `serviceAreas`, `reviews` (20) y `distribution` | **Sin cambios** |
| `GET /catalog/provider/:id?q&section&page` | Pagina de 24, secciones del catálogo entero, filtra `hidden_by_plan` en SQL | **Sin cambios** |
| `GET /reviews/provider/:id?page&limit` | Pagina de 10, orden `created_at DESC` | **Sin cambios** |
| `shared/src/tipos.ts` | `ProviderPublic`, `ProviderServiceItem`, `Review`, `Pagination` ya existen y calzan con el backend | Se le añade, no se reescribe |
| `mobile/app/servicio/[id].tsx` | Pantalla de detalle con React Query, 404 distinguido, `EstadoError`/`EstadoVacio` | Es el patrón a imitar |
| `ui.tsx` | `Tarjeta`, `Avatar`, `Portada`, `Chip`, `Insignia`, `Valoracion`, `Estrellas`, `Esqueleto`, `EstadoVacio`, `EstadoError` | Se le añaden dos piezas |
| `explorar.tsx` | `useInfiniteQuery` — el patrón de paginación de la casa | Se copia para catálogo y reseñas |

**El backend no se toca en todo este sub-proyecto.** Ni una ruta, ni una columna, ni un test de
backend. Si durante la implementación aparece la tentación de tocarlo, es señal de que algo se
entendió mal: parar y preguntar.

## Lo que falta (verificado leyendo los archivos)

| Función | Estado en la app |
|---|---|
| Pantalla `app/proveedor/[id].tsx` | **no existe** — es el agujero principal |
| Catálogo (tipo, métodos, UI) | **no existe en `mobile/` ni en `shared/`**, en ningún sitio |
| Lista de reseñas del proveedor | falta (hay reseñas del *servicio* en `servicio/[id].tsx`, que es otra cosa) |
| Botón Compartir | no existe en ninguna pantalla de la app |
| Portada del perfil | falta (solo hay `Avatar`) |
| Acordeón plegable | no existe ninguna primitiva colapsable |
| `proveedores.detalle` en el cliente compartido | falta — por eso `FichaPunto.tsx:23-28` hace `fetch` crudo |

Tres huecos de tipos que se arreglan de paso, porque la pantalla nueva los destapa:

1. **`ProviderPublic` no declara `gallery`** y `GET /providers/:id` sí la devuelve
   (`routes/providers.ts:311`, `gallery: visible.gallery`).
2. **`ProviderPublic` no declara `lat`/`lng`**, que la respuesta incluye condicionalmente cuando
   `show_on_map` es cierto (misma línea).
3. **El timeout de 20 s está escrito cuatro veces** a mano (`shared/src/api.ts`,
   `frontend/src/services/api.ts`, `mobile/src/lib/mapa.ts`, `FichaPunto.tsx:21`). La ficha deja de
   tener el suyo al pasar por el cliente compartido; los otros no son de este alcance.

## Decisiones tomadas

Las cinco las decidió Dariel el 2026-10-02 con la consecuencia explícita sobre la mesa.

### 1. `shared/` crece; la web NO se toca

El spec del sub-proyecto 1 pedía «subir `CatalogItem` y los métodos de catálogo/reseñas a `shared/`
**con la web reexportando**». Esa última parte **no se hace**, y conviene que quede escrito por qué,
porque quien lea solo aquel spec creerá que esto quedó a medias.

La web no importa `@oficio/shared` en ningún archivo. Lo que hay son *tipos gemelos* copiados a mano,
con el aviso en `frontend/src/types/index.ts:494-496`. Y `oficio_web` se compila con
`build: ./frontend` (`docker-compose.yml:38`): el contexto de Docker es **solo esa carpeta**, así que
una dependencia `file:../shared` cae fuera del contexto y `npm ci` falla dentro de la imagen. Hacer
que la web reexporte exige cambiar el contexto de build del compose de **producción**, escribir un
`.dockerignore` (hoy vacío) y redesplegar la web — en un repo compartido con Doniet, por una mejora
que no le da nada al usuario de la app.

**Decisión:** `CatalogItem`, `CatalogPage` y los métodos nuevos viven en `shared/`, los consume la
app, y `frontend/src/types/index.ts` se queda **exactamente como está**, con su copia y su comentario.
La deuda de duplicación sigue viva y anotada; cerrarla es su propia tarea, coordinada con Doniet.

🚨 Al copiar `CatalogItem` a `shared/`, se copia **la forma de la web letra por letra**
(`frontend/src/types/index.ts:403-414`), incluido `price_type: 'fixed' | 'from' | 'ask'` — que NO es
el `PriceType` de servicios (`'fixed' | 'hourly' | 'daily' | 'negotiable'`). Son dos uniones
distintas con un miembro de nombre común. Reusar `PriceType` aquí compila y está mal.

### 2. El acordeón, cada contexto como la web

El alcance decía «el acordeón de servicios» como si hubiera uno. Hay dos conductas distintas en la
web y el alcance no decía cuál:

- `/proveedor/:id` (`ProviderProfile.tsx:299-312`): rejilla **siempre abierta**, sin acordeón.
- La ficha del mapa (`frontend/src/components/mapa/FichaPunto.tsx:51-71`): acordeón **cerrado por
  defecto**, y cerrado las tarjetas **no están en el DOM** — el comentario de la línea 46 explica que
  ni `loading="lazy"` bastaba para no bajar las fotos.

**Decisión:** la app replica cada contexto como la web lo hace. En la hoja del mapa, acordeón
plegado; en `proveedor/[id]`, lista plana. Además de ser paridad, tiene su lógica: en la hoja el
espacio es escaso y el usuario no pidió ver servicios; en la pantalla ya decidió entrar.

La consecuencia de red importa y se mantiene: **plegado no se montan las `<Image>`**. En React Native
no basta con no pintarlas en pantalla — hay que no renderizar el componente, igual que la web no las
mete en el DOM. Esto es una regla de implementación, no un detalle de estilo.

### 3. Compartir, en los dos sitios

La web **no tiene** Compartir en `/proveedor/:id`; solo en la ficha del mapa
(`FichaPunto.tsx:329-341`), donde manda `{ title: nombre, url: origin + '/proveedor/' + id }`.

**Decisión:** la app lo pone en la hoja del mapa (eso es paridad) **y** en la pantalla nueva (eso lo
estrena). Usa `Share` del núcleo de React Native — ya está disponible, **no se añade ninguna
dependencia**; `expo-sharing` no hace falta porque se comparte una URL, no un archivo.

Comparte la **URL web** (`https://oficio.dardoit.com/proveedor/<id>`), no un deep link de la app: a
quien lo reciba sin la app instalada le tiene que abrir algo. El título es el nombre del negocio,
igual que la web.

### 4. «← Volver a la lista» visible

Pendiente heredado del sub-proyecto 1 (punto 15 del checklist de dispositivo). Cuando la ficha se
abrió desde la lista de una celda, hoy el único control visible es la X, que cierra la hoja entera y
pierde la celda; volver existe pero solo por el Atrás de Android. La web sí lo pinta
(`frontend/src/components/mapa/FichaPunto.tsx:359`), así que no era divergencia pensada: faltaba.

**Decisión:** se añade la flecha. El manejador ya está puesto (`onVolverALista` en `HojaPunto.tsx`);
es pintar el control y cablearlo. Se ve **solo** cuando se llegó desde una celda.

### 5. Mini-pin en `ListaCelda`, no icono suelto

Pendiente heredado (punto 10). Cada fila usa `PIN_POR_TIPO[tipo].fondo` como color de un icono
`location` suelto sobre fondo claro: `brand[400]` da ≈2,2:1, bajo el 3:1 que WCAG pide para un
elemento gráfico, y es el **único** indicador de tipo en la fila.

**Decisión:** la fila repite el mismo par relleno+glifo del mapa — un círculo del color del tipo con
el icono encima. El contraste pasa a ser glifo-contra-relleno, que es el par ya validado, y de paso
la fila y el pin se leen como la misma cosa.

## Diseño — `shared/`

### Tipos nuevos (`shared/src/tipos.ts`)

`CatalogPriceType`, `CatalogItem` y `CatalogPage`, copiados de `frontend/src/types/index.ts:403-435`
sin alterar un campo. `CatalogInput`, `CatalogSearchItem` y `CatalogSearchPage` **no** se copian: son
de escritura y de la búsqueda general, y la app no hace ninguna de las dos.

Y las dos correcciones de `ProviderPublic`: `gallery: string[]` y `lat`/`lng` opcionales, con un
comentario diciendo que `lat`/`lng` solo vienen con `show_on_map` y que son el punto **publicado**
(desplazado 100-300 m si la precisión es `zona`), nunca el real — la regla de `lib/ubicacion.ts`.

### Métodos nuevos (`shared/src/api.ts`)

```
proveedores.detalle(id)            → { provider, services, serviceAreas, reviews, distribution }
catalogo.deProveedor(id, {q, section, page})  → CatalogPage
resenas.deProveedor(id, {page, limit})        → { reviews, pagination }
```

`proveedores.detalle` entra en el objeto `proveedores` que ya existe, junto a `destacados` y
`contacto`. `catalogo` y `resenas` son dos claves nuevas del cliente.

Al existir `proveedores.detalle`, **`FichaPunto.tsx` deja de hacer su `fetch` crudo** y su constante
`TIEMPO_ESPERA_MS` local desaparece: el cliente compartido ya trae el suyo. Es el único sitio donde
este sub-proyecto borra código.

## Diseño — la pantalla `app/proveedor/[id].tsx`

Estructura de `servicio/[id].tsx`: `SafeAreaView` + `ScrollView`, React Query, 404 distinguido de
error de red, `EstadoError` con reintentar.

🚨 **Crear el archivo no basta.** `app/_layout.tsx:95-109` declara explícitamente cada pantalla con
parámetro dinámico (`<Stack.Screen name="servicio/[id]" …/>`, línea 107). Hay que añadir la suya o
la pantalla se monta sin sus `options`.

De arriba a abajo, siguiendo `ProviderProfile.tsx`:

1. **Portada** — `provider.cover`. Sin portada, el `Portada` de `ui.tsx` ya cae al emoji de
   categoría. El avatar monta encima, invadiéndola, como en la web.
2. **Identidad** — nombre, insignia «Negocio» si `kind === 'negocio'`, `Valoracion`, lugar, años de
   oficio, horario (solo negocio).
3. **Sobre mí** — `description` o el placeholder de la web; chips de `categories`.
4. **Galería** — solo si `gallery.length > 0`.
5. **Dónde** — `address` siempre que venga. **Sin mapa**: meter un segundo MapLibre dentro de un
   `ScrollView` es un conflicto de gestos conocido y la pantalla no lo necesita.
6. **Servicios** — lista plana (decisión 2), `ProviderServiceItem[]`, cada uno navega a
   `servicio/[id]`. Vacío → `EstadoVacio`.
7. **Catálogo** — ver abajo.
8. **Reseñas** — ver abajo.
9. **Contacto** — WhatsApp/Llamar según `contact_mode`, y «Enviar mensaje» solo si `has_chat`. Reusa
   `lib/contacto.ts`, que ya apunta el contacto en `POST /providers/:id/contact`.
10. **Compartir** — en la cabecera.

### El catálogo

`useInfiniteQuery` sobre `catalogo.deProveedor`, páginas de 24, `getNextPageParam` por `page < pages`.

- Si `total_all === 0`, **la sección entera no se monta** (la web hace eso en
  `ProviderCatalog.tsx:69-72`): un perfil sin catálogo no reserva un hueco vacío.
- Buscador con antirrebote de **400 ms**, el mismo valor que la web.
- Chips de sección desde `data.sections` — que son las del catálogo **entero**, no las del filtro.
- `available === false` **no se filtra**: se pinta atenuado con la insignia «Agotado», como la web.
- Sin foto, cae a la inicial del nombre sobre fondo de categoría.

### Las reseñas

`useInfiniteQuery` sobre `resenas.deProveedor`, páginas de 10. **No** se usan las 20 que ya trae
`GET /providers/:id`: esas no paginan y mezclarlas con la lista paginada duplica filas en la primera
página. Se ignoran, y se dice en un comentario para que nadie las «aproveche» después.

Cada fila: avatar del cliente, nombre, tiempo relativo, estrellas, «Servicio: X» si `service_title`
(puede ser `null` — borrar un servicio conserva sus reseñas), comentario si lo hay. Resumen con la
`distribution` que la respuesta del proveedor ya trae. Vacío → el texto de la web.

Ninguna regla de plan ni de elegibilidad filtra lo que se VE: la elegibilidad solo decide quién puede
escribir. La app lista todo lo que el endpoint devuelve.

## Diseño — las dos piezas nuevas de `ui.tsx`

- **`Acordeon`** — cabecera pulsable con chevron que rota, `accessibilityState={{ expanded }}`, y
  `{abierto && children}`: plegado, los hijos **no se montan**. Esa es su razón de ser (decisión 2),
  no un detalle.
- **`BotonCompartir`** — envuelve `Share.share({ title, url })`. La cancelación del usuario **no es
  un error**: `Share.share` resuelve con `action: 'dismissedAction'` en iOS y puede rechazar en
  Android si se cierra; ambos casos se tragan en silencio. Nada de `Aviso` de error por cancelar.

## Errores y casos límite

- **404** del proveedor → `EstadoVacio` con botón a Explorar, igual que `servicio/[id].tsx:90-102`.
- **Sin conexión** → `ErrorApi` con `status: 0` desde el cliente compartido → `EstadoError` con
  reintentar.
- **Catálogo o reseñas fallan con el perfil cargado** → la pantalla NO se cae entera: cada sección
  muestra su propio error reintentando sola. Son `useQuery` independientes a propósito.
- **Perfil Gratis** → sin portada ni fotos de servicio (`photos_allowed` es falso en el backend),
  sin catálogo (`total_all` será 0), sin chat. Todo eso ya lo resuelve el backend: la app no replica
  la tabla de planes, solo reacciona a lo que viene. **No se escribe ninguna regla de plan en el
  cliente.**
- **`service_title` nulo** en una reseña → no se pinta esa línea.
- **Portada que falla al cargar** → `Portada` de `ui.tsx` **no tiene `onError`** (a diferencia de
  `Avatar`). Se le añade el mismo paracaídas al emoji de categoría; es de este alcance porque la
  pantalla nueva lo destapa en la foto más grande de la app.

## Pruebas y verificación

El proyecto prueba **lógica pura, nunca render** (`mobile/test/`, 9 suites). Se mantiene esa línea:

- `shared/test/api.test.ts` — los tres métodos nuevos: ruta, query, y que los parámetros vacíos no
  se manden (el cliente ya los filtra; la prueba fija la conducta).
- `mobile/test/catalogo.test.ts` — la decisión de montar o no la sección (`total_all === 0`), el
  antirrebote de 400 ms y el encadenado de páginas.
- `mobile/test/resenas.test.ts` — `getNextPageParam` y que no se mezclen las 20 del proveedor.
- `mobile/test/compartir.test.ts` — que la URL se arma contra `origenWeb()` y que la cancelación no
  se trata como error.

La lógica que se quiera probar **vive en `src/lib/`**, no dentro del componente. Es la convención del
repo (`lib/hojaPunto.ts`, `lib/listaCelda.ts`, `lib/panelMapa.ts` existen por esto).

Verificación en emulador x86_64 contra producción (los ~300 puntos de prueba de `oficio.dardoit.com`
son deliberados): entrar al perfil desde el mapa y desde una tarjeta, un perfil con catálogo y otro
sin, buscar dentro del catálogo, paginar reseñas, compartir, y volver atrás desde cada sitio.

## Fuera de alcance

- **El reexport de la web** y el cambio de contexto de build (decisión 1). Su propia tarea.
- **Tocar el backend.** Nada.
- **Agenda/«Pedir cita»** desde el perfil: la app no tiene flujo de citas y abrirlo aquí es otro
  sub-proyecto.
- **Favoritos** en el perfil: la app no los tiene en ninguna pantalla.
- **Mapa dentro del perfil** (decisión de la sección «Dónde»).
- **Carrusel de fotos** en `servicio/[id].tsx`, que hoy enseña solo `images[0]`. Preexistente.
- **Lista de precios (`price_list`)** en el perfil: la web tampoco la pinta ahí, solo en
  `/servicio/:id`. Meterla sería producto nuevo, no paridad.
- Igualar el área aproximada a 300 m reales y renombrar «Cerca de mí» — siguen fuera, como en el 1.

## Riesgos

- **`CatalogItem` tiene su propio `price_type`.** Reusar el `PriceType` de servicios compila y está
  mal (decisión 1). Es el error más probable de todo el sub-proyecto.
- **Montar el acordeón mal.** Si se pinta con `display: none` o `opacity: 0` en vez de no
  renderizar, las fotos se bajan igual y se pierde justo lo que la web protege. Se verifica mirando
  peticiones de red, no mirando la pantalla.
- **Dos `useInfiniteQuery` en un `ScrollView`.** Ni el catálogo ni las reseñas pueden ser `FlatList`
  anidadas en un `ScrollView` (la lista virtualizada anidada en el mismo eje avisa y se comporta
  mal). Van como listas pintadas con `.map()` y un botón «Ver más», que es además lo que hace la web.
- **La pantalla es larga y los datos vienen de tres consultas.** El orden de aparición puede saltar
  al cargar. Reservar altura con `Esqueleto` en catálogo y reseñas.
- **`origenWeb()` se queda sin su único uso** al dejar de abrir el navegador en `FichaPunto.tsx`,
  pero Compartir lo necesita. Se mueve a `lib/api.ts` junto a `urlImagen`, no se borra.
