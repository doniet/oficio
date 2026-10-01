# El mapa de la app alcanza a la web — diseño

**Fecha:** 2026-10-01
**Estado:** aprobado en conversación, pendiente de plan de implementación.
**Alcance:** sub-proyecto 1 de 2 camino a la APK 0.2.5. El 2 (la ficha enriquecida y la pantalla
`proveedor/[id]`) tendrá su propio diseño y su propio plan.

## Qué se quiere y para quién

Desde que se publicó la APK 0.2.4 (29-sep) hay **107 commits** en el repo y **ninguno toca
`mobile/`**: todo el trabajo del mapa se hizo en la web. El resultado es que la app se quedó atrás
en cosas que no son cosméticas.

La peor: **la app no consume `GET /api/mapa/celda`**. Un pin que anuncia «+4» abre la ficha del
proveedor de mejor plan y los otros cuatro son **inalcanzables** — no hay gesto en la app que los
muestre. Es exactamente el agujero que la web cerró con `7ebae51`, y en la app sigue abierto.

**Éxito:** en el mapa de la app, tocar un grupo lista sus negocios y se puede entrar en cualquiera y
volver; buscar algo que no está en la zona visible lleva el mapa a donde sí está; el punto abierto se
distingue de los demás de un vistazo; y un negocio se ve del mismo color en la app que en la web.

**Para quién:** quien usa la app en Cuba para ver qué hay cerca. Hoy, si lo que busca cae en una
celda con varios, la app le enseña uno y le esconde el resto sin decírselo.

## Lo que ya existe y no se rehace

La app no empieza de cero: su mapa es gemelo del de la web y ya tiene lo difícil.

| Pieza | Qué ya hace | Estado |
|---|---|---|
| `lib/mapa.ts` | Antirrebote 250/500/300 ms, cancelación de la petición en vuelo, tiempo de espera de 20 s, acotado a Cuba | Se le añade, no se reescribe |
| `componentes/MapaExplorar.tsx` | MapLibre con teselas OSM, `androidView="texture"`, insignia `+N`, modo zona, «Cerca de mí» con `expo-location`, Reintentar | Ajustes |
| `componentes/HojaPunto.tsx` | Hoja de dos anclajes, backdrop que cierra al tocar fuera, botón Atrás, carga diferida al desplegar | Se parte, sin tocar su conducta |
| `lib/hojaPunto.ts` | La decisión del Atrás, aislada para poder probarla | Crece a tres estados |
| API y `shared/` | `/api/mapa`, `/api/mapa/celda`, y `PuntoMapa` con `cy`/`cx` | **Sin cambios de ningún tipo** |

Verificado: `PuntoMapa` en `shared/src/tipos.ts` ya trae `cy` y `cx`, y `/api/mapa/celda` ya existe
y está probado en el backend. **Este sub-proyecto es solo `mobile/`.** Por eso va primero: no
depende de nada que haya que negociar con la web.

## Lo que falta (verificado leyendo los archivos, no grepeando)

| Función | Estado en la app |
|---|---|
| Lista de los negocios de una celda | **falta** — el agujero funcional |
| Auto-centrado cuando la zona visible no tiene resultados | falta |
| Pin distinto para el punto seleccionado | falta |
| Color del marcador por tipo | diverge: hoy es por plan |

Cuatro cosas que creí que faltaban y **ya están**: la insignia `+N`
(`MapaExplorar.tsx:80-84`), el botón de ubicación (`expo-location` configurado, con su texto de
permiso), la calificación en la ficha (`Valoracion`, `HojaPunto.tsx:97`) y el área aproximada.

## Decisiones tomadas

1. **El color del pin pasa a decir el TIPO, no el plan.** Dariel lo decidió el 2026-10-01 con la
   consecuencia explícita sobre la mesa. 🚨 **Esto revoca deliberadamente la frase del commit
   `a9d648f`** («NO se toca el color del pin por plan en el mapa: eso es el ranking de pago que el
   producto sí quiere, no una etiqueta»). Queda escrito aquí porque esa frase sigue en el historial
   y quien la lea sin este documento la «restauraría» creyendo que corrige una regresión. El
   ranking de pago deja de verse en el mapa de la app, igual que ya no se ve en el de la web.
   Tonos: `brand[600]` (`#B85400`, fuerte) para negocio, `brand[400]` (`#FF922E`, claro) para
   oficio — los mismos papeles que en la web tras `851be6a`.
6. **El icono del pin de oficio pasa a ser oscuro.** No es gusto: es contraste. El pin de la app
   lleva un icono dentro (el de la web es un punto liso, sin icono), y **blanco sobre `brand[400]`
   da 2,3:1**, por debajo del 3:1 que WCAG pide para un elemento gráfico. El propio
   `MapaExplorar.tsx` ya rechazó `brand[500]` por esta misma razón. Así que: negocio =
   `brand[600]` con icono blanco (4,9:1); oficio = `brand[400]` con icono `ink[900]` (7,0:1). Un
   glifo oscuro sobre relleno claro y uno claro sobre relleno oscuro es además el patrón legible
   de siempre; lo que no se puede es forzar el blanco en los dos.
2. **La celda se pide con el bbox PINTADO, no con el visible.** Ver abajo; es la trampa central.
3. **Nada de `shared/` ni del backend.** `pedirCelda` se escribe como hermano de `pedirMapa` dentro
   de `lib/mapa.ts`, con el mismo `fetch` crudo y `AbortSignal` que ya usa el archivo. Seguir el
   patrón existente en vez de abrir superficie nueva entre paquetes para una sola llamada.
4. **La gota del pin seleccionado se dibuja con Views, no con SVG.** `react-native-svg` no está
   instalado y añadir un módulo nativo justo antes de un release es riesgo que esta función no
   justifica. Misma silueta, otro medio: círculo + cuadrado rotado 45° por debajo.
5. **`anchor="bottom"`.** Verificado en los tipos de `@maplibre/maplibre-react-native`: `Marker`
   acepta `anchor` (`"center" | "top" | "bottom" | …`) y `offset`. La punta de la gota cae sobre la
   coordenada real sin trucos, así que **no hay divergencia** con la web en esto.

## Diseño — el hook (`lib/mapa.ts`)

### La trampa: dos bbox que no son el mismo

El servidor **deduce el tamaño de celda del bbox** que recibe. Los índices `cy`/`cx` de un punto
solo significan algo respecto al bbox que los produjo. Y el bbox visible **no** es ese: durante el
antirrebote (250–500 ms) y mientras una petición vuela, el mapa ya se movió.

Si la celda se pide con el bbox visible, el servidor calcula otro tamaño de celda, los índices
apuntan a otra zona y **la lista no coincide con el «+N» que la anunció**: ves «+4» y te salen dos.
Hoy `lib/mapa.ts` solo tiene `bboxVisible`, que es justo el equivocado.

Se añade `bboxPintado`, que se fija **únicamente** cuando una respuesta se acepta (después del
`if (propio.signal.aborted) return`), nunca al moverse el mapa.

Con él viene su guardia: en `alMoverMapa`, un rectángulo sin área (`norte <= sur || este <= oeste`)
se ignora. MapLibre puede entregar bounds colapsados antes de que el contenedor tenga altura;
pedirlos gasta una petición que no puede devolver nada y, peor, dejaría `bboxPintado` apuntando a un
rectángulo degenerado del que después se deduciría un tamaño de celda absurdo.

### Estado y refs nuevos

```ts
// estado
sugerencia: { lat: number; lng: number } | null   // adónde saltar; null = no hay salto pendiente

// refs
bboxPintado: Bbox | null    // la zona con la que se pidió lo que está pintado AHORA
intentada: boolean          // ya se preguntó «¿existe en algún lado?» para ESTA búsqueda
```

### `cargarCelda(cy, cx): Promise<PuntoMapa[]>`

Lee `bboxPintado`; si es `null` devuelve `[]` resuelto (no hay nada pintado que preguntar). Pide
`GET /mapa/celda?bbox=…&cy=&cx=&tab=&q=&category=` con los mismos `tab`/`q`/`category` de la carga
y devuelve `r.puntos`. La respuesta es un `MapaRespuesta`, igual que `/mapa`.

No se cancela con el controlador de la carga del área: son peticiones independientes y abortar la
celda porque el mapa se movió dejaría al usuario con la hoja abierta y sin contenido. Lleva su
propio `AbortController`, abortado solo al desmontar.

### La sugerencia

Cuando una carga aceptada vuelve con **0 puntos** y hay **texto de búsqueda** y **no se ha
intentado** para esta búsqueda: se marca `intentada` y se pregunta una vez por el bbox de Cuba
entera con el mismo término. Si vuelve con algo, se expone la coordenada del primer punto como
`sugerencia`. Silenciosa a propósito: si falla, se queda el «sin resultados» normal.

La condición de «hay texto» no es un detalle. Sin ella, abrir el mapa en una zona de mar dispararía
una petición de Cuba entera y un salto que el usuario no pidió.

Cambiar pestaña, texto o categoría reinicia `intentada` y borra `sugerencia`: la búsqueda nueva es
un caso distinto del ya investigado, y un salto pendiente de la anterior ya no significa nada.

También lleva su propio `AbortController`, por la misma razón que la celda.

## Diseño — la hoja

`HojaPunto.tsx` se parte en envoltorio + contenido, igual que la web hizo en `b624484`:

- **`HojaPunto.tsx`** se queda con el `BottomSheet` y lo que ya funciona: los dos anclajes,
  `enableDynamicSizing={false}` (con `snapPoints` explícitos, el dimensionado dinámico puede
  insertar un tercer anclaje y romper el supuesto de que 0 es «asomada» y 1 «abierta»), el backdrop
  que cierra al tocar fuera, y la carga diferida del contenido al desplegar. Elige contenido.
- **`FichaPunto.tsx`** (nuevo): el contenido de hoy, extraído tal cual. Sin cambios de conducta.
- **`ListaCelda.tsx`** (nuevo): los N negocios de la celda, con su título contado
  («3 negocios en esta zona»), su estado de error con Reintentar, y `onElegir`.

### El Atrás, que ahora tiene tres estados

Hoy `atrasCierraHoja(punto)` decide con dos. Con la lista hay tres, y **el orden importa**: con una
ficha abierta **que vino de una lista**, Atrás debe volver a la lista, no cerrar la hoja. Si cierra,
quien entró en una celda de cinco y se equivocó de negocio pierde la celda y tiene que volver a
acertarle al pin.

La decisión va en `lib/hojaPunto.ts` como función pura, que es para lo que ese archivo existe —
`HojaPunto.tsx` solo hace `BackHandler.addEventListener` y la consulta:

```ts
export type EstadoHoja = { punto: PuntoMapa | null; lista: PuntoMapa[] | null; hayListaPrevia: boolean };
export type AccionAtras = 'nada' | 'cerrar' | 'volver-a-lista';

export function accionAtras(e: EstadoHoja): AccionAtras;
//   punto && hayListaPrevia  → 'volver-a-lista'
//   punto || lista           → 'cerrar'
//   si no                    → 'nada'   (Atrás sigue su curso: sale de Explorar)
```

`atrasCierraHoja` se sustituye, no se deja al lado: dos funciones que deciden lo mismo con distinto
alcance es cómo vuelven los bugs. Su test se reescribe sobre `accionAtras`.

### El estado vive en la pantalla

`app/(tabs)/explorar.tsx` gana `lista`, `listaPrevia`, `errorLista` y `reintentarLista`, igual que
`ExplorarMapa.tsx` en la web. El mapa solo avisa; quién está abierto lo sabe la pantalla. Cambiar
pestaña o categoría cierra todo: el punto abierto puede no pertenecer ya a lo que el mapa muestra.

Ojo al acoplamiento que ya existe y hay que respetar: `altoReservado` se calcula con
`indiceHoja` y `altoContenedor` para que la hoja no tape el mapa. La lista usa los mismos anclajes
que la ficha, así que ese cálculo no cambia.

## Diseño — los marcadores

**Color por tipo.** `COLOR_PIN` deja de indexarse por `plan` y pasa a `tipo`. Y como el relleno
claro no aguanta un icono blanco (decisión 6), la tabla pasa a llevar las dos cosas juntas, relleno
y glifo, para que nadie pueda cambiar una sin ver la otra:

```ts
const PIN_POR_TIPO: Record<PuntoMapa['tipo'], { fondo: string; glifo: string }> = {
  negocio: { fondo: brand[600], glifo: '#ffffff' },  // 4,9:1
  oficio:  { fondo: brand[400], glifo: ink[900]  },  // 7,0:1
};
```

El icono en sí no cambia (`storefront-outline` / `construct-outline`): el tipo queda dicho dos
veces, por forma y por color, que es lo que hace que se lea sin leyenda.

**Pin seleccionado.** `MapaExplorar` recibe `seleccionadoId?: string | null`. El punto que coincide
se dibuja como gota con `anchor="bottom"` en vez de círculo centrado, y conserva su insignia `+N` si
el grupo la lleva. La gota se compone con Views: el círculo que ya existe y, por debajo, un cuadrado
rotado 45° con tres esquinas redondeadas que hace la punta.

Dentro de la gota van **el mismo relleno y el mismo glifo** de `PIN_POR_TIPO`, no una combinación
nueva. Así el pin seleccionado es el pin normal con cola, el contraste ya está validado por la
decisión 6, y no hay un segundo juego de colores que mantener. (Aquí la app se separa de la web a
propósito: la gota de la web lleva un círculo blanco liso porque sus pines nunca llevaron icono.)

**`onAbrirLista`.** Un punto con `detras === 0` abre su ficha (como hoy). Con `detras > 0` pide la
celda y abre la lista. Es la misma interacción para el «+N» de un pin y para un área en modo zona:
enseñar dos gestos para el mismo hecho sería pedirle al usuario que aprenda dos cosas.

**El salto.** Un efecto sobre `sugerencia` llama a `camaraRef.current.flyTo({ zoom: 13, duration: 600 })`,
los mismos números que ya usa «Cerca de mí» — ambos son «llévame a donde hay algo», uno por
geolocalización y el otro por búsqueda. Y como ahí ya se hace, `zoomAnterior.current = null` antes
del vuelo, para que el cambio de región siguiente cuente como zoom y recargue sin esperar los 500 ms
del arrastre.

## Errores y casos límite

| Caso | Qué pasa |
|---|---|
| La celda vuelve vacía | Se abre la lista con el propio punto (`[p]`): el «+N» prometía algo, no se deja la hoja en blanco |
| La celda falla (red, 500) | La hoja se abre igual, con el mensaje y «Reintentar». El reintento se entrega como clausura desde el mapa: la pantalla no sabe pedir celdas |
| Sin `bboxPintado` todavía | `cargarCelda` devuelve `[]`; cae en el caso de arriba |
| La petición de Cuba entera falla | Silencio. Se queda el «sin resultados» normal |
| Búsqueda sin texto y 0 puntos | No se pregunta nada: sin término, «¿existe en algún lado?» no tiene sentido |
| Rectángulo sin área | Se ignora y se espera el movimiento siguiente |
| Atrás con la lista abierta | Cierra la hoja; no sale de Explorar |
| Atrás en una ficha que vino de la lista | Vuelve a la lista, sin volver a pedirla |

## Pruebas y verificación

Tres niveles, porque cada uno caza lo que los otros no pueden.

**1 — Automático** (`npx tsc --noEmit && npx jest` en `mobile/`). La app monta hooks con
`react-test-renderer` y un `fetch` controlable a mano; no renderiza componentes (no hay
`@testing-library/react-native`). Lo que se prueba ahí:

- `test/mapa.test.ts`: la celda se pide con el bbox **pintado** y no con el visible (se mueve el
  mapa entre la respuesta y la llamada, y se comprueba la URL); `cargarCelda` sin nada pintado
  devuelve `[]`; la sugerencia se pregunta una sola vez por búsqueda; cambiar pestaña/texto/categoría
  la reinicia y la borra; 0 puntos **sin** texto no dispara nada; un rectángulo sin área se ignora.
- `test/hojaPunto.test.ts`: los tres estados de `accionAtras`, incluido el orden
  (ficha con lista previa → `'volver-a-lista'`, no `'cerrar'`).

**2 — Emulador** (variante x86_64; la release es solo ARM y el emulador no la arranca). El recorrido
completo, mirando las capturas: tocar un «+N» → sale la lista con su cuenta; elegir uno → su ficha;
Atrás → vuelve a la lista; Atrás → cierra; el pin del punto abierto es gota y los demás círculos;
los dos colores se distinguen; buscar algo que no está en la zona → el mapa salta.

**3 — Teléfono real, de Dariel.** El emulador dibuja por software y **no reproduce fallos de GPU**:
ya pasó con un Huawei P8 Lite donde todo lo que había encima del mapa salía negro y aquí se veía
bien. La gota nueva y el cambio de colores se entregan marcados como **pendientes de confirmar en un
teléfono real** antes de publicar la APK.

Nota: la app apunta a la API de producción, así que se verifica contra los 300 puntos de prueba de
`oficio.dardoit.com`. Eso es deliberado.

## Fuera de alcance

Del sub-proyecto 2, con su propio diseño: el catálogo filtrado en la ficha, la lista de reseñas, el
botón Compartir, la portada, el acordeón de servicios, la pantalla `proveedor/[id]`, y subir
`CatalogItem` y los métodos de catálogo/reseñas a `shared/` con la web reexportando.

Tampoco entra aquí: igualar el área aproximada a los 300 m reales de la web (hoy es un disco de
tamaño fijo en píxeles, divergencia ya documentada en `MapaExplorar.tsx`), ni renombrar «Cerca de mí»
a «Yo» (en la app es un botón de icono, sin texto visible).

## Riesgos

- **El umbral `UMBRAL_ZOOM = 0.05`** que distingue zoom de paneo está anotado en el código como
  «valor empírico sin verificar en hardware real». Ahora habrá emulador: conviene comprobar de paso
  que un pinch real lo cruza siempre y que la inercia de un arrastre no lo cruza sola. Si no, se
  ajusta ahí.
- **La gota con Views** no va a ser idéntica a la de la web, y en parte eso ya es deliberado (lleva
  el icono dentro). Lo que hay que vigilar es la silueta: un cuadrado rotado no da exactamente la
  curva del trazado SVG de la marca. Se mira en el emulador y, si la forma no se reconoce como la
  gota de la marca, se reconsidera `react-native-svg` **como decisión aparte** — no colada dentro de
  esta.
