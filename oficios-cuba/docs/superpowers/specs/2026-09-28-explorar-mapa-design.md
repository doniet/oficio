# Explorar en mapa · Diseño

Adelanta y sustituye la **Entrega 3 · Mapa** de
`2026-09-28-encuentrauno-design.md`. Esa sección queda marcada como superada: lo
que vale es este documento. Se adelanta antes de la Entrega 2 porque dejó de
depender de ella — ver «Por qué se puede adelantar».

## 1. Objetivo

Que en Explorar se pueda cambiar a un mapa, ver en él unos pocos negocios y
servicios elegidos por plan de pago, que aparezcan más al acercar el zoom, que
los puntos se filtren al escribir en el buscador, y que al tocar un punto suba
una hoja inferior con la información de ese negocio o servicio.

### Qué cuenta como éxito

1. Desde Explorar, un toque lleva al mapa y otro devuelve a la lista, sin perder
   la pestaña ni los filtros.
2. Con el buscador vacío el mapa **no** muestra todos los perfiles: muestra uno
   por celda, y gana el de mejor plan.
3. Al acercar el zoom aparecen más, sin pulsar nada.
4. Al escribir, los puntos se reducen a lo que casa.
5. Al tocar un punto sube la hoja con su ficha y un enlace a su página.
6. Nadie aparece en el mapa sin haberlo activado.

### Qué NO entra

- iOS. La app solo se compila para Android hoy.
- Teselas sin conexión.
- Rutas, indicaciones ni cálculo de distancia a pie o en coche.
- Cambiar `slug`, `scheme`, `package` ni `bundleIdentifier` de Expo.
- Cambiar el esquema más allá de lo que dice la sección 3.

## 2. Decisiones y su porqué

Seis decisiones se tomaron con Dariel el 2026-09-28. Se escriben con lo que
cuestan si resultan equivocadas, para poder revisarlas más adelante sin
reconstruir el razonamiento.

| Decisión | Por qué | Qué cuesta si nos equivocamos |
|---|---|---|
| La **lista sigue siendo la vista por defecto**; el mapa es un switch en las tres pestañas | Un servicio se elige por precio y foto, y eso no se ve en un mapa; además el mapa es la vista más cara de cargar y no debe ser lo primero que recibe un visitante con mala conexión | El mapa se descubre menos. Se arregla haciéndolo por defecto solo en Negocios, que fue la opción intermedia que se descartó |
| **Zoom recarga solo; el paneo saca un botón** «Buscar en esta zona» | Acercarse ya es pedir más detalle, así que exigir un botón ahí se siente roto. Panear es vagar: recargar en cada arrastre desorienta y quema datos, que es el hallazgo del patrón documentado para apps móviles con conexión poco fiable | Si la conexión resulta mejor de lo previsto, el botón sobra y molesta. Se añade entonces la casilla «buscar mientras muevo» del mismo patrón |
| **Opt-in**: `show_on_map` se queda en `DEFAULT 0` | Publicar la ubicación exacta de alguien por defecto, cuando muchos oficios trabajan desde su casa, convierte un descuido en una exposición que ya no se puede deshacer | El mapa crece despacio y puede parecer vacío. Se mitiga con el aviso del panel y la opción «solo mi zona» de la sección 7 |
| **Un punto real por celda con insignia «+N»**, no burbujas de grupo | El usuario sabe que hay más sin perder de vista quién es quién, y el plan de pago sigue comprando visibilidad real, que es la palanca que Dariel quiere | A zoom bajo, un negocio de plan Gratis rodeado de Profesional no se ve nunca. Es deliberado |
| **Web y app a la vez**, con el APK saliendo de j-u | La experiencia queda igual en los dos sitios desde el primer día | Cada corrección de diseño se paga dos veces y obliga a republicar el APK |
| La app usa **MapLibre con teselas de OpenStreetMap** | Sin clave de API, sin cuenta de facturación, sin depender de Google Play Services, y con las mismas teselas que ya usa la web, así que web y app se ven igual | Librería nativa más pesada que `react-native-maps` y un plugin de config más en Expo |

### Por qué se puede adelantar antes de la Entrega 2

La Entrega 3 original dependía de la 2 porque la ubicación obligatoria en el
registro es la que garantiza coordenadas. Dos hechos la desatan:

- **12 de los 13 perfiles de producción ya tienen `lat`/`lng`**, y esos 12 ya
  tienen `show_on_map = 1`. El mapa nace con contenido.
- Al elegir opt-in, ya no hace falta que el registro fuerce nada: quien no tenga
  punto, no sale, y eso es correcto en vez de ser un fallo.

## 3. Cómo cambia el esquema

Estamos en desarrollo y el esquema se edita directo, pero esta entrega **casi no
lo toca**:

- `show_on_map` **no cambia**: se queda en `DEFAULT 0`. La Entrega 3 original
  quería `DEFAULT 1`; esa línea queda anulada.
- Columna nueva `provider_profiles.map_precision` — `TEXT DEFAULT 'exacta'`, con
  valores `exacta` | `zona`. Sección 7.
- Índice nuevo `idx_pp_geo ON provider_profiles(lat, lng)`.

No hay migración de datos: ninguna fila existente cambia de valor.

### El índice y cuándo cambiarlo

Un índice B-tree sobre `(lat, lng)` no es el índice ideal para un rectángulo: el
correcto es el módulo **R\*Tree** de SQLite, que resuelve consultas por caja
envolvente en `O(log n)`. No se usa ahora porque exige una tabla virtual y
disparadores que la mantengan en sincronía, y con 13 perfiles eso es
complejidad sin beneficio medible.

**Umbral escrito para que la decisión no dependa de la intuición:** cuando los
perfiles con `show_on_map = 1` y coordenadas pasen de **5 000**, o cuando
`GET /api/mapa` pase de **150 ms** en el percentil 95 en producción, se migra a
R\*Tree. Lo que llegue primero.

## 4. El endpoint

```
GET /api/mapa?bbox=<sur,oeste,norte,este>&tab=servicios|productos|negocios
             &q=<texto>&category=<slug>
```

- `bbox` obligatorio, cuatro números separados por comas: el **rectángulo
  visible**, no el que se quiere consultar. Validado contra los mismos límites
  de Cuba que ya usa `providers.ts`: `lat` 19–24, `lng` −85,5–−73,5. Fuera de
  rango o mal formado → **400**.
- `tab` opcional, por defecto `servicios`. Un valor que no esté en la lista →
  **400**, igual que hace `kind` hoy. Un valor inventado nunca cae en un
  comportamiento por defecto silencioso.
- `q` y `category` opcionales, con la misma semántica que en la lista.

### Desviación deliberada: no hay parámetro `zoom`

La Entrega 3 original pedía `&zoom=`. Se quita, y el servidor deduce de la caja
todo lo que necesita:

- **Tamaño de celda** = `min(alto, ancho) / 5`, acotado entre 0,0005° y 4°. Así
  caben unas cinco celdas en el lado corto de la pantalla, y la densidad se
  adapta sola a un teléfono estrecho o a un monitor ancho sin tabla de
  equivalencias que mantener.
- **Margen de prefetch** = la caja se infla un **50 % por lado** antes de
  consultar, para que un arrastre corto no deje huecos.

Consecuencias que el cliente debe saber: la respuesta **puede traer puntos fuera
del rectángulo visible** — eso es el margen, no un error — y el tamaño de celda
se calcula sobre el rectángulo **visible**, nunca sobre el inflado.

El porqué de quitarlo: un parámetro menos que validar, la política del margen
vive en un solo sitio, y el cliente no puede desincronizar el zoom que declara
del rectángulo que manda.

### Respuesta

```json
{
  "puntos": [
    { "id": "<profileId>", "tipo": "oficio|negocio", "nombre": "…",
      "lat": 23.1, "lng": -82.4, "plan": "pro|basic|free",
      "detras": 2, "resumen": "…" }
  ],
  "celda": 0.44,
  "hay_mas": false
}
```

- `detras`: cuántos perfiles más hay en esa misma celda. `0` cuando está solo.
- `resumen`: una línea para el marcador y la vista asomada de la hoja, distinta
  según la pestaña — en `servicios`, el nombre y el precio del servicio que casa;
  en `productos`, cuántos artículos casan; en `negocios`, la categoría. **No** va
  la ficha completa: eso se pide al tocar, para no bajar 200 fichas que nadie va
  a abrir.
- `hay_mas`: `true` cuando se alcanzó el tope de puntos. Tope duro: **200**
  puntos por respuesta. Al recortar se conservan los mejor clasificados del
  conjunto entero (mismo orden: plan, valoración, reseñas, `id`), nunca los
  primeros que devuelva el motor: dos peticiones idénticas tienen que dar el
  mismo resultado.

### Qué perfiles entran

Los tres filtros son acumulativos y ninguno es opcional:

1. `PERFIL_VISIBLE` — el mismo predicado que ya usa el resto del sitio.
2. `show_on_map = 1`.
3. `lat` y `lng` no nulos.

Y además, según la pestaña:

| `tab` | Casa si el perfil… |
|---|---|
| `servicios` | tiene al menos un servicio activo que casa con `q` y `category` |
| `productos` | tiene al menos un artículo de catálogo visible que casa |
| `negocios` | es negocio por el mismo criterio que `?kind=negocio` de `/providers`, **incluido el requisito de plan** |

El mapa **siempre dibuja perfiles**, nunca servicios ni artículos sueltos. La
pestaña decide qué tiene que casar y qué muestra la ficha. Es un solo camino de
código en vez de tres, y coincide con lo que la Entrega 3 original ya decía para
productos: «un punto por perfil, con los artículos que casan dentro».

⚠️ El criterio de `negocios` debe exigir el plan. `segunPlan()` devuelve
`kind: 'oficio'` cuando el plan no incluye negocio, así que un perfil que bajó
de plan saldría en la pestaña mostrándose como oficio. Es la misma trampa que ya
documentó la Entrega 1 y tiene prueba propia.

## 5. El algoritmo

Una sola consulta. Verificado el 2026-09-28 contra los 12 perfiles visibles de
producción, forzando tres tamaños de celda a mano para ver la progresión:

```
celda 2°     →  5 puntos de 12   pro, pro, pro, pro, basic
celda 0,5°   → 10 puntos de 12   los 5 pro, los 3 basic, 2 free
celda 0,05°  → 12 puntos de 12   todos
```

Esos tres tamaños son de la prueba, **no** lo que la fórmula de la sección 4
produce para esas vistas: con el rectángulo de Cuba entera (5° de alto por 12° de
ancho) la fórmula da **1°**, no 2°. Lo que la prueba demuestra es el mecanismo —
celda grande, pocos puntos y ganan los de mejor plan; celda pequeña, todos— no la
equivalencia entre vista y tamaño de celda.

Forma de la consulta:

1. Los perfiles que pasan los filtros de la sección 4, con su celda:
   `CAST(lat/:celda AS INT)` y `CAST(lng/:celda AS INT)`.
2. `ROW_NUMBER() OVER (PARTITION BY cy, cx ORDER BY <orden>)` y
   `COUNT(*) OVER (PARTITION BY cy, cx)`.
3. Se devuelve la fila con `pos = 1` de cada celda; `detras` = la cuenta menos uno.

El `<orden>` **no se escribe de nuevo**: es
`${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`, donde
`PLAN_WEIGHT_SQL` es la constante que ya exporta `backend/src/db/index.ts` y que
usan hoy `providers.ts` y `services.ts` como orden de «relevancia». El `pp.id`
final solo desempata para que el resultado sea reproducible.

Reusarla no es aseo, es corrección. `PLAN_WEIGHT_SQL` da
`premium` → 2, `pro` → 2, `basic` → 1, resto → 0, así que **`premium` y `pro`
pesan lo mismo**. Un `CASE` escrito a mano para el mapa que solo contemplara
`pro`, `basic` y `free` mandaría a un perfil `premium` al último lugar en el mapa
mientras en la lista sale primero — dos definiciones de «quién vale más» que se
contradicen. Hoy no hay ningún perfil `premium` en producción (5 `pro`, 3
`basic`, 5 `free`), lo que hace el fallo más peligroso, no menos: no se vería
hasta que existiera el primero.

Requiere funciones de ventana, que piden SQLite 3.25+. **Verificado: producción
corre 3.53.2.**

Los dos requisitos de Dariel —priorizar a quien paga y densificar al acercar—
salen del mismo mecanismo: al bajar el zoom la celda crece, cabe uno por celda y
ganan los Profesional; al subirlo la celda se encoge, hay más celdas y entran
los Básico y luego los Gratis. No hay un tope arbitrario de «muestra 20».

## 6. La interacción

### El switch

En la cabecera de Explorar, junto al buscador: dos estados, lista y mapa. El
estado va en la URL (`&vista=mapa`) para que un enlace compartido abra donde
estaba. Cambiar de vista **no** pierde la pestaña, ni `q`, ni los filtros.

Los filtros que el mapa no honra se ocultan en la vista de mapa, con la misma
regla que ya se aplicó a la pestaña Negocios en la Entrega 1: un control que no
hace nada es peor que un control ausente. Concretamente, en vista de mapa se
ocultan **provincia y municipio** (el rectángulo visible ya ES la ubicación, y
dejar los dos mandando a la vez se contradice), **precio y tipo de precio**, y
**el orden** (un mapa no tiene primero ni último). El buscador de texto, la
pestaña y la categoría sí se honran, y son los tres que viajan al endpoint.

Que el precio no filtre en el mapa es una limitación consciente de esta entrega,
no un olvido: añadirlo obliga a meter `price_max` y `price_type` en el endpoint y
en el algoritmo de celdas. Queda como candidato para después.

### Cuándo se pide al servidor

| Gesto | Qué pasa |
|---|---|
| Acercar o alejar el zoom | Recarga sola, con antirrebote de 250 ms |
| Escribir en el buscador | Recarga sola, con antirrebote de 300 ms |
| Arrastrar el mapa | **No** recarga. Aparece «Buscar en esta zona» en el borde inferior |
| Pulsar ese botón | Recarga y el botón desaparece |
| Cambiar de pestaña o de categoría | Recarga sola |

Una petición en vuelo se cancela si llega otra: el usuario ve siempre el
resultado del último gesto, no el del penúltimo que tardó más.

### La hoja inferior

Sube al tocar un punto. Dos posiciones de anclaje: **asomada** (~30 %, con el
nombre, el resumen y el enlace) y **abierta** (~85 %, con la ficha completa).
Asa visible para arrastrar.

Reglas que no son opcionales, porque son los fallos habituales de este patrón:

- **Atrás cierra la hoja** antes de salir de la pantalla: el botón físico en la
  app, el del navegador en la web.
- `Esc` cierra en la web.
- Con la hoja abierta, el foco de teclado queda dentro; al cerrarse vuelve al
  marcador que la abrió.
- La hoja nunca tapa el botón «Buscar en esta zona»: si está visible, el botón
  se recoloca encima.

### «Cerca de mí»

Botón que pide geolocalización al navegador o al dispositivo y centra el mapa.
Si se deniega el permiso, no hay señal, o expira, **el mapa se queda donde
estaba y se dice por qué en una línea**. Nunca es un callejón sin salida, y la
posición del visitante no se guarda en ninguna parte.

## 7. Privacidad y opt-in

`show_on_map` se queda en `DEFAULT 0`: nadie aparece sin activarlo.

- **En el registro de profesional**, la pregunta va con la explicación en claro
  de qué se hace público. No se da por hecho que quien pulsa entiende lo que
  publica.
- **Al activarlo se elige la precisión**, con la columna nueva
  `map_precision`:
  - `exacta` — el punto tal cual. Lo natural para un negocio con local.
  - `zona` — la coordenada redondeada a una celda de ~1 km, sin guardar nunca
    la exacta redondeada aparte. Para quien trabaja desde su casa.
  El redondeo se aplica **al servir**, no al guardar, para que cambiar de
  opinión no exija volver a marcar el punto.

  El `DEFAULT 'exacta'` de la columna existe para que los 12 perfiles que ya
  tienen `show_on_map = 1` conserven el comportamiento que Dariel eligió, no para
  ahorrarse la pregunta: la interfaz **tiene que preguntar** al activar, y no
  puede escribir el valor en silencio.
- **En el panel del profesional**, cuando está oculto, un aviso claro de que no
  aparece en el mapa y qué gana si aparece. Es lo que mueve la aguja en un
  opt-in, más que la pregunta del registro.

Riesgo asumido y escrito: con opt-in el mapa crece despacio. Los 12 perfiles que
hoy ya tienen `show_on_map = 1` **no se apagan**, así que el mapa no nace vacío.

## 8. La app

La app no tiene hoy ninguna dependencia de mapa: esto introduce cartografía
desde cero, y es la mitad más cara del trabajo.

- `@maplibre/maplibre-react-native` con teselas de OpenStreetMap, las mismas que
  la web, y su plugin de config en Expo (`prebuild` ya forma parte del flujo).
- `@gorhom/bottom-sheet` para la hoja.
- La pestaña `mobile/app/(tabs)/buscar.tsx` pasa a `explorar.tsx`, que la web ya
  hizo en la Entrega 1 y en la app quedó sin alinear.
- El endpoint es el mismo, así que no hay lógica de servidor duplicada.
- El APK se compila **en j-u**, donde están la llave de firma
  (`~/.claude/.oficio-firma/`), `google-services.json` y el SDK de Android.
  **No** en el VPS de Doniet: ahí se compila sobre producción con RAM justa y
  exigiría poner allí la llave de firma de Encuentrauno.

## 9. Datos de prueba

Con 12 perfiles el algoritmo **no se puede ver funcionar**: a casi cualquier
zoom salen todos. Antes de programar la interfaz hace falta un sembrado de
perfiles sintéticos **solo en desarrollo**, con coordenadas repartidas por Cuba y
los tres planes representados, suficientes para que a zoom de provincia haya
celdas con varios dentro.

Cantidad concreta: **300 perfiles** repartidos por las 15 provincias, con la
misma proporción de planes que hoy (unos 40 % Gratis, 25 % Básico, 35 %
Profesional) y concentración deliberada en La Habana, para que a zoom de
provincia haya celdas con cinco o seis dentro y la insignia «+N» se vea de
verdad.

Requisitos: script aparte del `seed-demo` de siempre, que no se ejecute nunca con
`NODE_ENV=production`, y que sea idempotente.

## 10. Verificación

**Backend**

- `bbox` mal formado, incompleto o fuera de Cuba → 400.
- `tab` con un valor inventado → 400. No cae en `servicios` en silencio.
- Una sola fila por celda, y es la de mejor plan.
- `detras` coincide con los que quedaron en la celda.
- Al encoger la celda aparecen más puntos: la progresión 5 → 10 → 12 de la
  sección 5, como prueba con datos fijos.
- Un perfil con `show_on_map = 0` no sale **nunca**, ni con `q` que lo nombre.
- Un perfil con `map_precision = 'zona'` sale redondeado, y la coordenada exacta
  no aparece en la respuesta.
- Un perfil que bajó de plan no sale en `tab=negocios`.
- El tope de 200 y su `hay_mas`.
- La celda se deriva del rectángulo visible, no del inflado.

**Web y app**

- El switch conserva pestaña, `q` y filtros, en los dos sentidos.
- El botón «Buscar en esta zona» aparece al panear y **no** al hacer zoom.
- Atrás cierra la hoja antes de salir de la pantalla.
- Denegar la geolocalización deja el mapa usable y explica por qué.

**Limitación del entorno**

En vps2 no hay navegador: a los dos chromium de Playwright les faltan entre 9 y
12 bibliotecas del sistema, y su instalación pide sudo
(`sudo npx --yes playwright@latest install-deps chromium`). Mientras no se
instalen, **un mapa no se puede verificar de verdad desde aquí**: es la primera
función del proyecto en la que mirar no es opcional. Hay que instalarlas, o la
comprobación visual la hace Dariel.

## 11. Documentación al cerrar

- Entrada en `oficios-cuba/STATUS.md` con el formato de las demás.
- `CLAUDE.md` del proyecto: el endpoint nuevo y el switch de vista.
- En `2026-09-28-encuentrauno-design.md`, la Entrega 3 queda marcada como
  superada por este documento.
