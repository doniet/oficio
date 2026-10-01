# El mapa de la app alcanza a la web — pendiente de un dispositivo real

**Fecha:** 2026-10-01
**Estado:** el sub-proyecto 1 (este plan) está implementado, revisado y commiteado — `tsc --noEmit`
limpio y 79/79 pruebas en 9 suites. Lo que falta aquí es solo lo que ningún test automático puede
cubrir: verlo moverse en un Android real.
**Por qué existe este documento:** el plan se ejecutó en vps2, que no tiene con qué compilar ni
correr la variante de prueba del emulador — falta `oficios-cuba/mobile/android/` (proyecto Expo
gestionado, nunca prebuilt en este host), falta el keystore de `~/.claude/.oficio-firma`, no hay SDK
de Android instalado y no hay `adb`. El recorrido de verificación visual que el plan pedía no se
caminó en ningún dispositivo — no se afirma en ningún sitio que se haya visto algo en pantalla que
no se vio. Esta lista es para quien sí tenga un emulador o un teléfono a mano.

## Cómo compilar la variante de prueba

Es el MISMO código de la release, compilado solo para x86_64 porque el emulador no arranca la
release real (que es solo ARM). No se publica nada desde aquí.

`oficios-cuba/mobile/android/` **no existe en el repo**: es un proyecto Expo gestionado y la carpeta
está en `.gitignore`, así que hay que generarla con un prebuild antes de poder llamar a `gradlew`.

```bash
cd oficios-cuba/mobile
npx expo prebuild --platform android --no-install   # crea android/, que no viene en el repo
cd android && F=~/.claude/.oficio-firma && OFICIO_FIRMA_ALMACEN=$F/oficios-cuba.p12 \
  OFICIO_FIRMA_CLAVE="$(cat $F/clave.txt)" OFICIO_FIRMA_ALIAS=oficios \
  ./gradlew assembleRelease -q -PreactNativeArchitectures=x86_64
```

La llave de firma (`~/.claude/.oficio-firma`) tampoco está en el repo. Y si de paso se va a PUBLICAR
una versión, no se usa este atajo: el flujo entero —subir `versionCode`, release ARM firmada,
verificación de la huella, variante x86_64 y emulador— lo tiene la skill
**`oficio-apk-release-publicar`**, y allí el orden importa (primero `./scripts/apk-release.sh`, cuyo
prebuild es el que fija la versión; la variante x86_64 después).

## A. El recorrido de 9 puntos (Explorar → Mapa)

Es la columna vertebral de esta lista: ejercita todo el código nuevo de punta a punta. Caminarlo en
orden, mirando la pantalla en cada paso — no basta con que la app no truene.

1. Abrir Explorar → Mapa. **Criterio:** los pines de negocio son naranja fuerte (`brand[600]`) con
   icono blanco; los de oficio naranja claro (`brand[400]`) con icono oscuro.
2. Tocar un pin SIN «+N». **Criterio:** abre su ficha. Atrás cierra la hoja sin salir de Explorar.
3. Tocar un pin CON «+N». **Criterio:** abre la lista, con el título contado y las filas de «Zona»
   donde toque.
4. Elegir uno de la lista. **Criterio:** abre su ficha, y ESE pin (y solo ese) pasa de círculo a
   gota, con la punta exactamente sobre su coordenada — ni flotando por encima ni hundida.
5. Atrás desde esa ficha. **Criterio:** vuelve a la lista, sin parpadeo de la hoja y sin que la app
   vuelva a pedirle la celda al servidor (se puede confirmar con las herramientas de red del
   dispositivo, o simplemente notando que no hay demora nueva).
6. Atrás otra vez. **Criterio:** cierra la hoja.
7. Escribir un término que no exista en la zona visible del mapa pero sí en otra provincia.
   **Criterio:** el mapa vuela a la zona donde sí hay resultados y recarga ahí.
8. Con la lista de una celda abierta, cambiar de categoría. **Criterio:** la hoja se cierra.
9. El umbral que distingue zoom de paneo (`UMBRAL_ZOOM = 0.05`, anotado en el código como «valor
   empírico sin verificar en hardware real»). **Criterio doble:** un pinch-zoom cruza el umbral
   SIEMPRE (la celda recarga a los 250 ms); la inercia de soltar un arrastre NUNCA lo cruza por sí
   sola (la celda recarga a los 500 ms, el tiempo de paneo, no el de zoom). Si falla en cualquiera
   de los dos sentidos, hay que ajustar `UMBRAL_ZOOM` en el código — y decirlo en el STATUS.md de
   cuando se corrija. No vale dejarlo pasar porque «parece ir bien»: es precisamente el valor que
   este plan quería comprobar y no pudo.

## B. Decisiones que necesitan a Dariel

Todas surgieron en revisión, todas son reales, y ninguna tiene una respuesta de código correcta sin
que alguien mire la pantalla y decida.

10. **Icono de tipo en la lista de una celda, bajo contraste.** En `ListaCelda.tsx`, cada fila usa
    `PIN_POR_TIPO[tipo].fondo` como color de un icono `location` suelto sobre fondo claro. Esa tabla
    de colores (`lib/pines.ts`) solo está validada como RELLENO detrás de un glifo, no como color de
    icono aislado: `brand[400]` (el tono de oficio) como icono sobre blanco da ≈2,2:1, por debajo
    del 3:1 que WCAG pide para un elemento gráfico — y es el ÚNICO indicador de tipo en la fila (lo
    demás es nombre, resumen, y el badge «Zona», que es de distancia, no de tipo). A 2,2:1 el dato
    de tipo se pierde para baja visión. **Decidir uno:** un mini-pin con el mismo par relleno+glifo
    que ya se usa en el mapa; un tono más oscuro del mismo color solo para este icono; o quitar el
    color de tipo de la lista y dejar que lo diga el texto.
11. ~~**La lista de error de un solo negocio se anuncia mal.**~~ **RESUELTO** (ola de arreglos del
    2026-10-01, no necesitó decisión): la etiqueta de accesibilidad de `HojaPunto` anunciaba
    «1 negocio en esta zona» mientras el cuerpo mostraba el fallo. Ahora usa la misma regla que ya
    aplicaba `ListaCelda` a su título visible — en caso de error, el neutro `tituloCelda(0)`.
15. **No hay control visible para «volver a la lista».** Cuando la ficha se abrió desde la lista de
    una celda, el único control visible es la X («Cerrar la ficha»), que cierra la hoja entera y
    pierde la celda. Volver a la lista existe —el estado y el manejador están puestos
    (`onVolverALista` en `HojaPunto.tsx`)— pero solo se alcanza con el gesto/botón Atrás de Android:
    quien no lo pruebe no sabe que está. **El dato que lo hace decidible:** la web SÍ pinta ese
    control, un «← Volver a la lista» en `frontend/src/components/mapa/FichaPunto.tsx:359`. O sea
    que no es una divergencia pensada, es que en la app falta. **Decidir:** se añade la flecha (y la
    app iguala a la web), o se deja el comportamiento solo en Atrás y se anota como divergencia
    deliberada. Deliberadamente NO se implementó en la ola de arreglos: es decisión de producto.

## C. Dos detalles cosméticos de la gota (menores, preexistentes al dibujo)

No bloquean nada y son del orden de unos pocos píxeles — pero solo se ven mirando la pantalla.

12. **La punta de la gota sale roma, no afilada.** La cola (un cuadrado rotado 45°) tiene
    redondeadas tres esquinas (`borderBottomLeftRadius`, `borderBottomRightRadius`,
    `borderTopRightRadius`) y deja afilada la cuarta — pero con la rotación de 45° en sentido
    horario, la esquina que queda abajo (la punta visible) es una de las redondeadas; la afilada
    queda arriba, tapada por el círculo. Si la intención es una punta en punta, hay que invertir qué
    esquina se deja sin redondear.
13. **Una banda de ~1,5 dp donde el hombro de la cola asoma antes de tiempo.** Entre y≈38,5 y y≈40,
    el hombro del rombo asoma un poco antes de la punta, porque lo que lo tapa es un círculo y la
    cola es un cuadrado — no coinciden exactamente en el borde. Es inherente a dibujar una gota con
    `Views` en vez de un path SVG. Ver si se nota a simple vista a densidades 2x/3x; si no se nota,
    no amerita tocarlo.

## D. Un hallazgo menor que no es de este checklist pero vale saber si se vuelve a este código

14. **Comentario roto y preexistente en `HojaPunto.tsx:9-12`** (de antes de este plan): le falta la
    línea de apertura, sus dos primeras líneas se contradicen entre sí, y nombra una variable
    (`altoReservadoMapa`) que ya no existe (hoy es `altoReservado`). Arreglo de una línea si alguien
    pasa por ahí; fuera de alcance de este plan.
