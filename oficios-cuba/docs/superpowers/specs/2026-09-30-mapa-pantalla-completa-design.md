# Mapa a pantalla completa en /explorar — diseño

**Fecha:** 2026-09-30
**Estado:** aprobado en conversación, pendiente de plan de implementación.

## Qué se quiere y para quién

Hoy `?vista=mapa` pinta el mapa en una caja de `70vh` dentro de la columna de resultados, con el
buscador, las pestañas y los filtros por encima **en el flujo de la página**. El mapa es un widget
dentro de una página de listado.

Se quiere lo contrario: **el mapa es la página**, al estilo de Google Maps. Los controles flotan
encima, y la información de un punto aparece en un panel — lateral en escritorio, saliendo desde
abajo y colapsable en móvil. Si el punto que se toca representa a varios negocios, el panel lista
esos negocios.

**Éxito:** en `?vista=mapa`, el usuario ve mapa de borde a borde bajo la cabecera, puede buscar y
cambiar de pestaña sin salir del mapa, y al tocar cualquier marcador obtiene su información sin que
el mapa deje de ser el protagonista. En un móvil de 390 px el mapa no pierde altura por culpa de
los controles.

**Para quién:** el usuario que busca «qué hay cerca de mí» en vez de «qué servicio es más barato».
Esa es la pregunta que la vista de lista no responde bien y por la que existe el mapa.

## Lo que ya existe y no se rehace

El mapa no se construye de cero. Estas piezas ya funcionan y tienen pruebas:

| Pieza | Qué hace | Estado |
|---|---|---|
| `usarMapa.ts` | Carga del área con antirrebote, cancelación, `cargarCelda` con el bbox **pintado** | Intacta |
| `MapaExplorar.tsx` | Leaflet, pines por plan, insignia `+N`, modo zona con círculos, «Cerca de mí» | Ajustes menores |
| `HojaPunto.tsx` | Hoja inferior arrastrable (dos alturas), entrada de historial, foco atrapado y devuelto | Se parte, sin tocar su conducta |
| `ListaCelda.tsx` | Lista de los negocios de una celda | Pierde su envoltorio |
| API | `/api/mapa` y `/api/mapa/celda` | **Sin cambios de ningún tipo** |

Este rediseño es **solo de frontend**. El backend ya devuelve todo lo necesario, incluidos `detras`,
`aproximado`, `resumen` y los índices `cy`/`cx` de celda.

## Decisiones tomadas

Las tres se decidieron en la conversación de diseño, con sus alternativas descartadas:

1. **La cabecera del sitio se queda.** El mapa ocupa el viewport menos la cabecera (`4rem`) y, en
   móvil, menos la barra inferior de navegación. Se descartó el mapa a sangre total sin marco:
   obliga a reponer a mano cada vía de navegación que se quita (logo, cuenta, volver a la lista),
   y el coste no se paga con el alto que gana.

2. **Flotan el buscador y las tres pestañas; lo demás va detrás de un botón.** En el mapa solo son
   efectivos el buscador, la pestaña y la categoría — provincia, municipio, precio y orden no los
   honra `/api/mapa`, y hoy ya se ocultan en esta vista. Categoría y el cambio a Lista viven tras un
   botón ⚙. Se descartó enseñarlo todo: en 390 px obliga a tres filas de controles sobre el mapa,
   que es justo el alto que este rediseño pretende recuperar.

3. **El panel flota sobre el mapa; el mapa no se encoge.** Al abrirlo, si el punto elegido queda
   bajo el panel, el mapa hace `panBy` para sacarlo. Se descartó que el panel empuje al mapa por una
   razón técnica concreta: cambiar el ancho del mapa cambia el rectángulo visible, y eso dispara una
   consulta nueva a `/api/mapa` — con la que **el punto recién tocado puede dejar de estar entre los
   resultados**, o reagruparse en otra celda. Abrir un panel no debe poder borrar aquello que se
   acaba de abrir.

## Restricciones globales

Valores exactos, verificados contra el código el 2026-09-30. Todo requisito de cada tarea los
incluye implícitamente.

- **Punto de corte:** `lg` (1024 px), el mismo que ya separa la barra de filtros de escritorio del
  cajón móvil en `Search.tsx`. No se introduce un punto de corte nuevo.
- **Alto de la región del mapa:** `calc(100dvh - 4rem)` en escritorio (`4rem` = el `h-16` de la
  cabecera). En móvil, `calc(100dvh - 4rem - 5rem)`: los `5rem` son el `pb-20` que `Layout.tsx` ya
  reserva en `<main>` para la barra inferior de navegación — no se inventa una medida nueva, se usa
  la que el propio layout declara. El área segura de abajo (`env(safe-area-inset-bottom)`) la
  gestiona la hoja por su cuenta, como ya hace. **`dvh`, nunca `vh`:** con `vh` la barra del
  navegador móvil tapa la franja inferior del mapa, que es exactamente donde va la hoja.
- **Escala de capas ya en uso** (no inventar valores nuevos): cabecera del sitio y barra inferior
  `z-40`; controles flotantes del mapa `z-[400]`; hoja y panel `z-[500]`; enlace de salto `z-[100]`.
- **Sin dependencias nuevas.** Leaflet, react-leaflet, lucide-react y Tailwind ya están; nada más.
- **Texto de la UI en español de Cuba, con tuteo.**
- **Conexión lenta como caso normal, no como caso raro.** Todo lo que se pueda no pedir, no se pide.
- El backend compila con `strict:false` y el frontend comparte esa laxitud: **un helper `async`
  llamado sin `await` no lo delata el typecheck.** Antes de dar por buena una llamada a algo que
  devuelve promesa, comprobar el `await` o el `.catch` a mano.

## Arquitectura

### Por qué se extrae en vez de bifurcar

`Search.tsx` tiene 644 líneas y ya gestiona tres pestañas × dos vistas, el formulario de búsqueda,
la barra de filtros de escritorio, el cajón de filtros móvil, los chips de filtros activos y tres
listados distintos. Añadirle un segundo layout completo a pantalla completa lo llevaría por encima
de 800 líneas con un `enMapa ?` en cada rama.

En su lugar, la vista de mapa se convierte en un componente dueño de su propio layout, y
`Search.tsx` se queda con el estado de la URL y la vista de lista. **La URL no cambia**: sigue
siendo `?vista=mapa`, así que los enlaces compartidos siguen valiendo y los tests de conmutación
lista/mapa siguen describiendo la conducta real.

### Ficheros

**Nuevos**

| Fichero | Responsabilidad |
|---|---|
| `components/mapa/ExplorarMapa.tsx` | El layout a sangre. Dueño del estado `puntoAbierto` / `listaCelda` / `listaPrevia`. Monta controles, mapa y panel. |
| `components/mapa/ControlesMapa.tsx` | La barra flotante: buscador, tres pestañas, botón ⚙ (categoría + volver a Lista). |
| `components/mapa/FichaPunto.tsx` | **Contenido** de la ficha de un punto, extraído de `HojaPunto`. No sabe nada del envoltorio que lo contiene. |
| `components/mapa/PanelLateral.tsx` | Envoltorio de escritorio: panel a la izquierda, sin arrastre, con Esc y foco. |
| `components/mapa/PanelMapa.tsx` | Elige envoltorio según el ancho y mete dentro `FichaPunto` **o** `ListaCelda`. |

**Modificados**

| Fichero | Cambio |
|---|---|
| `pages/Search.tsx` | Pierde la rama de mapa; con `vista=mapa` monta `<ExplorarMapa>` pasándole `get`/`update`. La vista de lista no se toca. |
| `components/mapa/HojaPunto.tsx` | Deja de renderizar la ficha; recibe `children`. Su arrastre, su entrada de historial y su gestión de foco **no cambian de conducta**. |
| `components/mapa/ListaCelda.tsx` | Pierde su `fixed inset-x-0 bottom-0`: se queda solo con la lista. El envoltorio lo pone `PanelMapa`. |
| `components/mapa/MapaExplorar.tsx` | Sin borde redondeado; los avisos bajan por debajo de la barra flotante; «Cerca de mí» lee `--hoja-punto-alto`; `cargarCelda` deja de perder sus errores. |

### Separar contenido de envoltorio

Es la decisión estructural que hace posible todo lo demás. Hoy `HojaPunto.tsx` son 385 líneas que
hacen dos trabajos a la vez: **la ficha** (pedir el perfil y pintarlo) y **la hoja** (arrastre,
historial, foco, la variable CSS de altura). Un panel lateral necesita el primero sin el segundo.

Tras la separación, la misma ficha sirve en los dos envoltorios, y el mismo envoltorio sirve para
la ficha y para la lista de celda. Eso último arregla de paso una incoherencia: hoy la ficha crea
entrada de historial y la lista no, así que el botón Atrás cierra una y la otra no.

## Interacción y estado

**Al tocar en el mapa** — lógica existente, sin cambios: un punto suelto abre su ficha; un punto con
`+N`, o un área en modo zona, pide `/api/mapa/celda` y abre la lista. Es deliberadamente la misma
interacción para los dos: enseñarle al usuario dos formas de decir «aquí hay varios» sería pedirle
que aprenda dos cosas para el mismo hecho.

**De la lista a la ficha.** Al elegir uno de la lista, el panel pasa a la ficha y **recuerda la
lista de la que vino** (`listaPrevia`), con un «← Volver a la lista» en la cabecera del panel. Al
volver, la lista se muestra desde memoria: **no se vuelve a pedir**. Hoy elegir de la lista la
descarta y la única vuelta es tocar otra vez el grupo en el mapa.

**Paneo automático (solo escritorio).** Al abrir el panel, si el punto elegido cae dentro del
rectángulo que ocupa el panel, el mapa hace `panBy` a la derecha lo justo para sacarlo, más un
margen. **`panBy`, no `flyTo` ni `setZoom`:** cambiar el zoom cambia el tamaño de celda que calcula
el servidor, y el punto recién tocado podría reagruparse bajo los pies del usuario. Un paneo sí
cambia el rectángulo y dispara una recarga; eso es lo normal y el antirrebote de `usarMapa` ya lo
cubre.

**Qué NO va a la URL.** El punto abierto vive en estado, no en la query string. Compartir un enlace
a una ficha abierta suena bien, pero la hoja ya gestiona su propia entrada de historial: meter el
punto en la URL sería una segunda fuente de verdad para lo mismo, y dos mecanismos peleándose por
el botón Atrás es el tipo de fallo que luego no se reproduce. Para compartir ya existe
`/proveedor/:id`, que es una página de verdad.

**Cambios de filtro con el panel abierto:** cambiar de pestaña o de categoría **cierra el panel**.
El punto abierto puede no pertenecer a la pestaña nueva, y dejarlo ahí mostraría algo que ya no está
en el mapa.

**Teclado y foco.** El panel lateral se comporta como la hoja: Esc cierra, el foco entra al abrir y
vuelve al elemento que lo abrió al cerrar. Es la conducta que más fácilmente se rompe sin que nada
se entere, así que va con prueba propia.

## Errores

**Fallo al cargar una celda — defecto actual que este trabajo corrige.** `usarMapa.cargarCelda` no
tiene `.catch`, y quien lo llama en `MapaExplorar.tsx` hace `.then(...)` a secas. Si
`/api/mapa/celda` falla —probable en la conexión que esta app apunta a servir— el resultado es un
rechazo no capturado y **el panel no se abre nunca**: el usuario toca un grupo y no pasa nada, sin
un solo mensaje. Pasa a capturarse: el panel se abre igual, con el error y un «Reintentar». Si la
lista llega vacía se sigue cayendo al punto representante, como ya hace hoy.

**El panel se abre antes de tener el perfil,** con lo que ya trae el punto (nombre, resumen, si es
aproximado). En una conexión lenta se ve algo de inmediato en vez de un panel en blanco.

**Carga del perfil: diferida en móvil, inmediata en escritorio.** Hoy la ficha solo pide el perfil
completo cuando la hoja llega a «abierta». Esa tacañería es acertada en móvil y se conserva. En el
panel lateral no hay dos alturas y sobra sitio, así que ahí se pide al abrir.

**Lo que ya se maneja bien no se toca:** carga del área con reintento, geolocalización denegada, y
el fallo al pedir el perfil dentro de la ficha, que ya tiene «Reintentar» y su prueba.

**Choque que introduce este rediseño:** los avisos de «Cargando…», el error con «Reintentar» y «Hay
más negocios aquí» viven hoy arriba y centrados sobre el mapa — justo donde va la barra flotante. Se
bajan para quedar por debajo de ella.

## Pruebas

Los tests de Leaflet en jsdom ya funcionan: `Search.test.tsx` monta el mapa de verdad y comprueba
las llamadas a la API. No hace falta un arnés nuevo.

**Base:** 23 pruebas en verde en 3 ficheros (`HojaPunto.test.tsx`, `Search.test.tsx`,
`usarMapa.test.ts`), medidas el 2026-09-30. Todas siguen pasando al terminar.

Las de `HojaPunto` hay que adaptarlas a que ahora recibe `children`, **sin perder lo que aseguran**:
historial, foco atrapado y devuelto, la variable CSS, el registro del contacto por WhatsApp/llamada
(del que depende el derecho a reseñar) y el reintento del perfil.

**Nuevas, una por cada cosa que este rediseño puede romper en silencio:**

1. A partir de `lg` se monta el panel lateral; por debajo, la hoja inferior.
2. De la lista a la ficha, y «← Volver a la lista» devuelve la misma lista **sin volver a pedirla**
   (se comprueba que `mapaApi.celda` no se llama una segunda vez).
3. Cambiar de pestaña con el panel abierto lo cierra.
4. Un punto que cae bajo el panel provoca un `panBy` con el desplazamiento esperado; uno ya visible
   no provoca ninguno.
5. El botón «Cerca de mí» se coloca leyendo `--hoja-punto-alto` (la regresión de la tarea pendiente
   que nunca se hizo).
6. Tocar un grupo cuando `/api/mapa/celda` falla enseña el error, no silencio.
7. La región del mapa no genera scroll de página.

Verificación de salida: `npx vitest run`, `npx tsc --noEmit` y `npm run build` en el frontend, más
una comprobación visual a 390 px y a 1280 px con
`~/docker/playwright` (`docker compose run --rm pw node scripts/verificar-oficio.mjs`).

## Fuera de alcance

- La vista de Lista no cambia en nada.
- No se añaden al mapa los filtros que `/api/mapa` no honra (provincia, municipio, precio, orden).
- El punto abierto no va a la URL.
- No se toca el backend ni el esquema.
- No se toca la agrupación por celdas ni el modo zona: son decisiones de un trabajo anterior que ya
  tienen su razón escrita y sus pruebas.
