# Ubicación aproximada · Diseño

Estado: aprobado el 2026-09-28. **Enmendado el 2026-09-29** por decisión de Dariel:
el área aproximada pasa de la celda de ~1 km a un radio de 100-300 m, y el punto
publicado se calcula una sola vez al establecerlo. Ver §3bis. Sucede a la Entrega 2
(`2026-09-28-explorar-mapa-design.md`), cuyo modelo de privacidad no cambia:
lo que cambia es de dónde sale la coordenada y cómo se dibuja.

## 1. Objetivo

Que un negocio con ubicación aproximada se vea **donde está**, y que el mapa no
finja una precisión que no tiene.

### Qué cuenta como éxito

- Ningún municipio de Cuba tiene una coordenada inventada.
- Un negocio aproximado no se dibuja como un punto exacto cuando el zoom ya
  distingue menos que su propia incertidumbre.
- Con varios aproximados juntos, nada se solapa: ni pines ni círculos.
- Los N de un grupo son **alcanzables**. Hoy no lo son.
- Lo que muestra la zona coincide con los filtros activos y con la navegación
  que ya existe (Atrás / Esc / URL).

### Qué NO entra

- Mover la coordenada de ningún proveedor. Un punto que puso una persona no se
  reubica en silencio, ni aunque esté mal.
- Cambiar el modelo de opt-in: `show_on_map` sigue en `DEFAULT 0`.
- Bajar el radio de 1 km ni cambiar `CELDA_ZONA`.

## 2. El hallazgo que lo origina

Dariel reportó negocios de La Habana dibujados mar adentro. La causa **no es** el
redondeo de privacidad. Comprobado contra la base de producción:

- Hay **cero** perfiles con `map_precision = 'zona'`. Los 12 visibles en el mapa
  son `exacta`, así que el endpoint sirve la coordenada guardada tal cual.
- Las coordenadas de los municipios son sintéticas. `seed.ts` las reparte en
  espiral de ángulo áureo alrededor de la capital provincial:
  `radio = 0.06 + 0.035·√i`, hasta ~21 km. El propio comentario lo dice: «Los
  municipios no traen coordenadas reales».
- Recalculada la fórmula contra la base, **13 de 13** municipios de La Habana
  coinciden al noveno decimal. No es una sospecha: es la fórmula.

Consecuencia: un negocio en la **capital provincial** cae bien (es el índice 0 de
la espiral, la única coordenada real). Cualquiera **fuera** de la capital hereda
un punto inventado; en provincias costeras, el mar.

| Municipio | Guardado | Real (Wikidata) | Error |
|---|---|---|---|
| Habana Vieja | 23,2093 / −82,2785 | 23,1359 / −82,3583 | 12 km NE → mar |
| Playa | 23,1778 / −82,4507 | 23,0942 / −82,4489 | 9 km N → mar |
| 10 de Octubre | 23,2543 / −82,4120 | 23,0881 / −82,3597 | 19 km N → mar |
| Cotorro | 23,2816 / −82,3034 | 23,0261 / −82,2475 | 29 km N → mar |

Esto también envenena el selector de provincia/municipio y cualquier cálculo de
cercanía. El error real es ~30 veces mayor que los 755 m del redondeo.

## 3. Decisiones y su porqué

**D1 — Los municipios se arreglan primero.** Enmascarar bien un punto que ya está
mal no sirve de nada.
*Si me equivoco:* gastamos una migración en datos que habría que volver a tocar.

**D2 — No se mueve la coordenada de ningún proveedor.** Solo se arregla la fuente
(los municipios) y se resiembran los demo.
*Si me equivoco:* un negocio real queda mal ubicado hasta que su dueño lo corrija
a mano. Es peor reubicarlo nosotros: perdería su punto bueno sin enterarse.

**D3 — El umbral sale de la geometría, no del gusto.** Se pasa a modo zona cuando
el círculo del área ya no cabe en su celda. *(Recalculado en la enmienda de §3bis:
con radio 300 m el diámetro es 600 m, no 2 km. Tabla nueva abajo; la de 1 km se
conserva porque documenta de dónde salió el método.)* La celda es `min(alto,ancho)/5` del
rectángulo visible, o sea **1/5 del lado corto de la pantalla** a cualquier zoom.
Diámetro del círculo de 1 km, a latitud 23°:

| Zoom | Diámetro | ¿Cabe en una celda de 80 px (móvil)? |
|---|---|---|
| 11 | 28 px | sí |
| 12 | 57 px | sí, justo |
| **13** | **114 px** | **no — solape garantizado** |
| 15 | 455 px | no |
| 16 | 910 px | mayor que la pantalla |

Umbral **vigente** (radio 300 m → diámetro 600 m): `celda < 0.0054°`, es decir lo
visible abarca menos de **~3 km**. En un móvil de 390 px la celda mide 78 px:

| Zoom | Diámetro de 600 m | ¿Cabe en la celda? |
|---|---|---|
| 13 | 34 px | sí |
| 14 | 68 px | sí, justo |
| **15** | **136 px** | **no — modo zona** |
| 16 | 273 px | no |

Se autoajusta igual que antes: en pantalla ancha la celda mide más y el salto
ocurre un zoom después. Sin constante mágica por dispositivo.
*Si me equivoco:* el modo zona entra antes o después de lo cómodo. Es **una
constante** (`ZONA_DESDE_GRADOS`), afinarla es cambiar un número y redesplegar.
Dariel pidió empezar en 10 km y bajar después si conviene.

**D4 — Como mucho un círculo dibujado a la vez: el del grupo abierto.** Es lo que
hace Airbnb y es la única forma de que no se solapen nunca. Dibujar N círculos de
1 km a zoom de barrio da una mancha naranja, no información.
*Si me equivoco:* el usuario no percibe la incertidumbre hasta que toca. Lo
compensa el aro punteado del pin, que sí está siempre.

**D5 — El aro del pin aproximado es de tamaño fijo en píxeles.** No crece con el
zoom, así que no puede solaparse. Comunica «esto es aproximado» sin afirmar
cuánto; el cuánto lo dice el círculo al abrir.

**D6 — El `+N` y la zona son la misma interacción.** Hoy `detras` es solo una
insignia: si una celda tiene 5 negocios, ves 1 y los otros 4 son inalcanzables
desde el mapa. Un único mecanismo tapa ese agujero y evita enseñarle al usuario
dos formas distintas de decir «aquí hay varios».
*Si me equivoco:* construimos más superficie de la mínima. Menos que construir
dos mecanismos parecidos.

**D7 — Street masking descartado.** Pegar el punto al cruce de calles más cercano
nunca cae al agua (las calles no van por el mar) y es lo más bonito, pero exige
datos de calles de Cuba dentro de un backend sin salida a internet, y baja la
privacidad de 1 000 m a ~250 m. Rompería la promesa que ya se le hace al usuario.

**D8 — El mapa de tierra queda para el final, y condicionado.** Con círculo de
zona, un centro 700 m mar adentro ya no es absurdo: el círculo toca la costa y se
lee «por aquí». Antes de gastar una migración miramos un caso costero real.
*Si me equivoco:* queda un centro en el agua. Visible, no grave.

## 3bis. Enmienda del 2026-09-29: el área pasa a 100-300 m

Dariel decidió que la ubicación aproximada sea **un área de 100 a 300 m** alrededor
del punto exacto, en vez de la celda de ~1 km. Lo que sigue reemplaza el redondeo a
rejilla (`CELDA_ZONA`) para los perfiles `zona`.

**D9 — Desplazamiento en anillo, calculado UNA vez y guardado.** Al establecer la
ubicación se sortea una distancia `d` uniforme en [100, 300] m y un ángulo uniforme,
y se guarda el punto resultante en columnas propias. No se re-sortea en cada
petición: si se sorteara al servir, un atacante podría pedir el mismo perfil muchas
veces y **promediar** los puntos hasta recuperar el verdadero, que es exactamente el
ataque que esta entrega existe para impedir. Se recalcula solo si el dueño cambia su
ubicación o su precisión.
El mínimo de 100 m importa tanto como el máximo: sin él, el sorteo puede devolver un
punto pegado al real y la protección desaparece justo en los casos desafortunados.
Es *donut masking*, el método que la literatura de geoprivacidad recomienda.

**D10 — El sorteo usa `node:crypto`, no `Math.random`.** El generador de V8 es
xorshift128+: no es criptográfico y su estado se puede reconstruir observando
suficientes salidas. Como los puntos publicados son, en la práctica, salidas
observables del generador, alguien con bastantes perfiles podría reconstruir el
estado e **invertir el desplazamiento de todos**, recuperando las ubicaciones
exactas. Con `randomInt`/`randomBytes` eso no es posible.
*Si me equivoco:* nada; el coste de usar el generador seguro aquí es cero.

**D11 — La coordenada publicada se guarda para TODOS, exacta o aproximada.** Para un
perfil `exacta` es igual a la suya. Así `LAT_SERVIDA` deja de ser un `CASE` y pasa a
ser una columna, lo que elimina de raíz la clase de error que esta entrega ya
persiguió tres veces: dos definiciones del mismo valor que se separan. El filtrado
del `bbox` usa esa columna, que es lo que cierra el oráculo de bisección.
*Si me equivoco:* un camino de escritura que toque `lat/lng` sin recalcular la
pública dejaría el punto publicado obsoleto. Se evita con un único punto de
escritura y una prueba que lo afirme.

**El coste, dicho sin adornos.** La privacidad baja: el área donde puede estar el
negocio pasa de **124 ha** (celda de ~1 km) a **28,3 ha** (círculo de 300 m), y la
distancia mínima garantizada al punto real baja de ~500 m a 100 m. Es decisión
explícita de Dariel, tomada sabiendo que el mapa gana utilidad y la protección
afloja. Queda escrito aquí para que nadie lo reabra creyendo que fue un descuido.

## 3ter. El aviso de la dirección (decisión del 2026-09-29)

El aviso de `pp.address` se muestra **siempre que el campo tenga texto**, no solo
cuando el mapa está encendido en modo zona. El motivo es el hecho que se verificó:
`address` sale en `GET /providers/:id` **sin condición alguna**, mientras `lat`/`lng`
van redondeadas y condicionadas a `show_on_map`. El aviso estaba colgado de una
opción del mapa cuando el riesgo lo causa haber escrito algo.
Dariel pidió ponerlo en todos los casos y retirarlo después si estorba, así que vive
en una sola constante (`AVISAR_SIEMPRE_DIRECCION`) y apagarlo es cambiar un booleano.

## 4. Los datos: municipios reales

Fuente: Wikidata, clase `Q558330` («municipio de Cuba»), vía SPARQL. Se descarga
**una vez desde fuera** y se commitea como fichero de datos en el repo: la API
corre en `oficio_net`, sin salida a internet, y no puede consultarla en vivo.

No es importación ciega. Tres trampas comprobadas:

1. **Los nombres difieren.** «10 de Octubre» es «Diez de Octubre»; «Cerro» es «El
   Cerro»; «Habana Vieja» es «La Habana Vieja». El casado es por nombre
   normalizado dentro de la provincia.
2. **Wikidata arrastra la provincia histórica.** Devuelve Mariel, Artemisa,
   Guanajay, Bauta, Alquízar, Batabanó, San José de las Lajas y Santa Cruz del
   Norte bajo «La Habana», cuando desde 2011 son de Artemisa y Mayabeque.
3. **La consulta devuelve duplicados** (197 filas para 168 municipios) porque
   `P131` puede tener varios valores. Hay que deduplicar por entidad.

Lo que no case **se reporta y se resuelve a mano**. Ningún municipio se queda con
la coordenada de la espiral en silencio: eso es exactamente el fallo que estamos
arreglando.

La función `municipalityCoords` de `seed.ts` desaparece. Una migración actualiza
las filas existentes; las bases nuevas nacen bien desde `schema` + seed.

## 5. El contrato

### `PuntoMapa` gana `aproximado: boolean`

Sin él el cliente no puede dibujar distinto. Resuelve además la duda escalada en
la entrega anterior sobre exponer `ubicacion_aproximada`: revela una
**preferencia**, no una ubicación, y hace legible la vaguedad en vez de fingir
precisión. Hoy todo pin ajeno se dibuja igual, así que un negocio con local real
se ve tan difuso como quien se esconde; con esta bandera deja de ser así.

### `GET /api/mapa/celda`

`?bbox=sur,oeste,norte,este&tab=&q=&category=&cy=&cx=`

Devuelve los negocios de **una** celda, con los mismos filtros que `/mapa`, tope
50 y `hay_mas`. El tamaño de celda lo recalcula el servidor del `bbox` con la
misma función `tamanoCelda`, así `/mapa` y `/mapa/celda` no pueden discrepar: si
el cliente mandara el tamaño, dos definiciones del mismo número volverían a
divergir, que es el error que esta entrega ya corrigió tres veces.

`/mapa` **devuelve** `cy` y `cx` en cada punto y el cliente los reenvía tal cual.
No los recalcula: `CAST(x/celda AS INT)` en SQLite y `Math.trunc` en JS coinciden
hoy, pero sería otra vez el mismo número definido en dos sitios, que es el error
que esta entrega ya corrigió tres veces. No añaden información: salen de la
`lat`/`lng` servidas y de `celda`, que ya viajan.

La lista se ordena como `/mapa` elige su representante (`PLAN_WEIGHT_SQL`), para
que el primero de la lista sea el que estaba en el mapa.

Mismas validaciones que `/mapa`: `bbox` inválido, invertido o fuera de Cuba →
400; `tab` inventada → 400.

### `ZONA_DESDE_GRADOS = 0.018` en `@oficio/shared`

Una constante, dos clientes. Web y app tienen que cambiar de modo a la vez o el
mismo negocio se vería distinto en cada una.

## 6. La interacción

**Vista amplia** (`celda >= ZONA_DESDE_GRADOS`): un pin por celda, como hoy. El
aproximado lleva aro punteado de tamaño fijo.

**Vista cercana** (`celda < ZONA_DESDE_GRADOS`): los aproximados dejan de fingir
un punto. Su celda se dibuja como círculo translúcido con «N negocios en esta
zona». Los exactos siguen siendo pin: su punto sí es cierto, y mezclarlos sería
mentir sobre los dos.

**Celda mixta.** Una celda puede tener exactos y aproximados a la vez, y `/mapa`
devuelve **un solo punto por celda**. La representación sigue a ese
representante: si el mejor por plan es aproximado, la celda es círculo; si es
exacto, es pin con `+N`. No se parte la celda en dos marcadores — eso rompería la
invariante de «uno por celda» de la que depende que nada se solape. La lista al
abrir muestra los dos tipos, cada uno marcado.

**Al tocar** un círculo de zona o un pin con `+N`, la hoja abre **la lista** de esa
celda. De ahí se entra a cada negocio; Atrás vuelve a la lista y un segundo Atrás
cierra la hoja — la misma escalera que ya existe, un peldaño más alta.

Un pin sin `+N` abre la ficha directamente, como ahora.

## 7. Privacidad

El modelo de la entrega anterior **no se toca**: `show_on_map` sigue en
`DEFAULT 0`, el filtrado sigue usando la coordenada servida (no la exacta), y las
dos puertas que publican ubicación redondean a la misma celda, así que no se
pueden intersectar para bajar de 1 km.

Lo único que se añade al mundo es `aproximado`, que es una preferencia.

`/mapa/celda` hereda el mismo cuidado: sirve las **coordenadas servidas** y filtra
por ellas. Si filtrara por la exacta reabriría el oráculo de bisección que se
cerró en la entrega anterior, esta vez con celdas de tamaño elegido por el
atacante. Es el punto más fácil de romper de toda esta entrega.

## 8. Verificación

- Recalcular la espiral contra la base **después** de migrar: cero coincidencias.
- Cada municipio, dentro de su provincia y sobre tierra.
- Los cuatro casos de la tabla de §2, mirados en el mapa desplegado.
- Un test que afirme que `/mapa` y `/mapa/celda` coinciden: lo que `/mapa` cuenta
  como `detras + 1` es lo que `/mapa/celda` devuelve para esa celda, con los
  mismos filtros.
- El ataque de bisección contra `/mapa/celda`, como se hizo contra `/mapa`.
- Mirar el mapa con varios aproximados juntos a z12, z13 y z16. No se juzga
  compilando.

## 9. Documentación al cerrar

`CLAUDE.md`: la fila de Mapa de la tabla de API gana `/mapa/celda`; la sección de
reglas de negocio, que las coordenadas de municipio son reales y de dónde salen.
`STATUS.md`: entrada con el hallazgo de la espiral, que es lo que otro
desarrollador necesitará saber antes de volver a confiar en esos datos.
