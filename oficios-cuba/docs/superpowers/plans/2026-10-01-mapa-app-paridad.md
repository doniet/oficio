# El mapa de la app alcanza a la web — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el mapa de la app Expo deje de esconder negocios: tocar un grupo lista los N de su celda, buscar algo que no está en la zona lleva el mapa a donde sí está, el punto abierto se distingue, y el color del pin dice el tipo igual que en la web.

**Architecture:** Todo ocurre en `mobile/`. El hook `lib/mapa.ts` gana `cargarCelda` (que pide con el bbox **pintado**, no el visible) y `sugerencia`. `HojaPunto.tsx` se parte en envoltorio + contenido (`FichaPunto.tsx` nuevo) para poder mostrar también `ListaCelda.tsx` (nuevo). La decisión del botón Atrás, que ahora tiene tres estados, vive en `lib/hojaPunto.ts` como función pura porque es la única capa que las pruebas de este proyecto pueden tocar. `MapaExplorar.tsx` colorea por tipo, dibuja la gota del seleccionado y conecta celda y salto.

**Tech Stack:** React Native 0.8x sobre Expo (expo-router), `@maplibre/maplibre-react-native`, `@gorhom/bottom-sheet`, `@expo/vector-icons`, tipos de `@oficio/shared`. Pruebas: jest con preset `jest-expo` + `react-test-renderer`.

**Spec:** `oficios-cuba/docs/superpowers/specs/2026-10-01-mapa-app-paridad-design.md`

## Global Constraints

- **Solo `mobile/`.** No se toca `shared/`, ni `backend/`, ni `frontend/`. `PuntoMapa` ya trae `cy`/`cx` y `GET /api/mapa/celda` ya existe.
- **Ninguna dependencia nueva**, nativa o no. En particular **no** se instala `react-native-svg`: la gota se dibuja con `View`s.
- **Colores exactos.** Negocio: relleno `brand[600]` (`#B85400`) con glifo `#ffffff` (4,9:1). Oficio: relleno `brand[400]` (`#FF922E`) con glifo `ink[900]` (`#16213E`) (7,0:1). Nunca glifo blanco sobre `brand[400]` (2,3:1) ni sobre `brand[500]` (2,43:1, ya rechazado en `explorar.tsx`).
- **`anchor="bottom"`** en el `Marker` del punto seleccionado, para que la punta de la gota caiga en la coordenada real.
- **Antirrebotes intactos:** `ANTIRREBOTE_ZOOM_MS = 250`, `ANTIRREBOTE_PANEO_MS = 500`, `ANTIRREBOTE_TEXTO_MS = 300`, `TIEMPO_ESPERA_MS = 20000`.
- **No tocar:** `androidView="texture"` del mapa, `enableDynamicSizing={false}` de la hoja, ni los anclajes `ANCLA_ASOMADA = 0.3` / `ANCLA_ABIERTA = 0.85`. Cada uno arregló un fallo concreto y tiene su comentario.
- **Pruebas:** `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`. `jest.config.js` solo mira `test/**/*.test.ts` (extensión `.ts`, **sin JSX**): los hooks se montan con `createElement`, como ya hace `test/mapa.test.ts`.
- **Commits** en español, imperativo, y terminados en `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Nada se publica.** Este plan no compila ni sube la APK: eso es el cierre de la 0.2.5, después del sub-proyecto 2.
- 🚨 **Dónde se puede ejecutar cada tarea.** Las Tareas 1, 2, 3, 5, 6, 7 y 9 solo necesitan Node y `mobile/node_modules`: corren en **vps2**. Las Tareas 4 (humo), 8 (mirar la gota) y 10 (recorrido + build x86_64) necesitan **emulador y SDK de Android, que vps2 no tiene** (ni keystore, ni sudo para instalar nada): esas van en **j-u**, alcanzable por el tailnet con `ssh j-u`. Si se ejecuta desde vps2, los pasos de emulador se marcan como pendientes en vez de darse por hechos — **nunca** afirmar que algo se vio en pantalla sin haberlo visto.

## Review Focus

Cinco cosas que el spec implica, que un usuario real va a encontrar, y que ninguna prueba tendría si no se añade a propósito. Cada línea lleva su prueba en la tarea dueña del código:

1. **Doble toque rápido en un «+N»** → dos peticiones de celda en vuelo; la que vuelva segunda pinta encima, y puede ser la vieja. → prueba en la Tarea 1.
2. **Desmontar la pantalla con una petición de celda o de Cuba entera en vuelo** → `setState` después de desmontar, fuga y aviso de React. → pruebas en las Tareas 1 y 2.
3. **Cambiar de categoría con una lista abierta** → la lista pertenece a una búsqueda que ya no existe y se queda en pantalla. El spec solo nombra el punto abierto. → prueba en la Tarea 6.
4. **Elegir de la lista un punto que ya no está en `puntos`** (la zona se recargó entre el toque y la elección) → `seleccionadoId` apunta a un id que ningún marcador tiene. No debe romper ni dejar la gota huérfana. → prueba en la Tarea 6.
5. **La celda responde con un solo punto** → una lista de uno es peor que la ficha directa; el spec dice qué hacer con la celda *vacía*, no con la de uno. → `contenidoDeCelda`, prueba en la Tarea 6.

---

### Task 1: `cargarCelda` con el bbox pintado

**Files:**
- Modify: `oficios-cuba/mobile/src/lib/mapa.ts`
- Test: `oficios-cuba/mobile/test/mapa.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `usarMapa(...)` devuelve además `cargarCelda(cy: number, cx: number): Promise<PuntoMapa[]>`. Resuelve `[]` si todavía no hay nada pintado. Nunca rechaza por abortos internos; sí propaga el fallo de red para que quien llame pueda mostrar su error.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir al final de `test/mapa.test.ts`, dentro del `describe('usarMapa', ...)` que ya existe (reutiliza `fetchControlable`, `respuestaFalsa`, `puntoFalso`, `BBOX_A`, `BBOX_B`, `avanzarYVaciar` y `montarHook` del archivo):

```ts
  it('la celda se pide con el bbox PINTADO, no con el que el mapa tiene ahora', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    // Se pinta con BBOX_A...
    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([puntoFalso('p1')])); });
    await avanzarYVaciar(0);

    // ...y el usuario sigue arrastrando a BBOX_B, que AÚN no ha pintado nada.
    act(() => { h.estado.alMoverMapa(BBOX_B, false); });

    let devuelto: PuntoMapa[] | undefined;
    act(() => { void h.estado.cargarCelda(3, 7).then((r) => { devuelto = r; }); });

    const celda = llamadas.find((l) => l.url.includes('/mapa/celda'));
    expect(celda).toBeDefined();
    const sp = new URL(celda!.url).searchParams;
    // El servidor deduce el tamaño de celda del bbox: con BBOX_B los índices 3/7 significarían
    // otra zona y la lista no coincidiría con el «+N» que la anunció.
    expect(sp.get('bbox')).toBe('20,-80,21,-79');
    expect(sp.get('cy')).toBe('3');
    expect(sp.get('cx')).toBe('7');

    act(() => { celda!.resolver(respuestaFalsa([puntoFalso('p1'), puntoFalso('p2')])); });
    await avanzarYVaciar(0);
    expect(devuelto?.map((p) => p.id)).toEqual(['p1', 'p2']);

    h.desmontar();
  });

  it('sin nada pintado todavía, la celda resuelve vacía y no pide nada', async () => {
    const { fetchMock } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    let devuelto: PuntoMapa[] | undefined;
    await act(async () => { devuelto = await h.estado.cargarCelda(0, 0); });
    expect(devuelto).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    h.desmontar();
  });

  it('la celda reenvía pestaña, texto y categoría de la búsqueda actual', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'negocios', q: 'pintura', category: 'hogar' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([puntoFalso('p1')])); });
    await avanzarYVaciar(0);

    act(() => { void h.estado.cargarCelda(1, 2); });
    const sp = new URL(llamadas.find((l) => l.url.includes('/mapa/celda'))!.url).searchParams;
    expect(sp.get('tab')).toBe('negocios');
    expect(sp.get('q')).toBe('pintura');
    expect(sp.get('category')).toBe('hogar');

    h.desmontar();
  });

  it('recargar el área NO aborta una celda en vuelo', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([puntoFalso('p1')])); });
    await avanzarYVaciar(0);

    act(() => { void h.estado.cargarCelda(0, 0); });
    const celda = llamadas.find((l) => l.url.includes('/mapa/celda'))!;

    // El usuario arrastra: el área se recarga y aborta SU petición, no la de la celda — si la
    // abortara, la hoja se quedaría abierta y sin contenido.
    act(() => { h.estado.alMoverMapa(BBOX_B, false); });
    await avanzarYVaciar(500);
    expect(celda.signal.aborted).toBe(false);

    h.desmontar();
  });

  it('dos toques rápidos en el mismo grupo: la primera celda se abandona y gana la última', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([puntoFalso('p1')])); });
    await avanzarYVaciar(0);

    const vistos: string[][] = [];
    act(() => { void h.estado.cargarCelda(0, 0).then((r) => vistos.push(r.map((p) => p.id))); });
    act(() => { void h.estado.cargarCelda(0, 0).then((r) => vistos.push(r.map((p) => p.id))); });
    const celdas = llamadas.filter((l) => l.url.includes('/mapa/celda'));
    expect(celdas).toHaveLength(2);
    expect(celdas[0].signal.aborted).toBe(true);

    act(() => { celdas[1].resolver(respuestaFalsa([puntoFalso('nuevo')])); });
    await avanzarYVaciar(0);
    // La primera resuelve vacía (abandonada), la segunda con su contenido: la vieja no puede
    // pintarse encima de la nueva.
    expect(vistos).toEqual([[], ['nuevo']]);

    h.desmontar();
  });

  it('desmontar con una celda en vuelo la aborta', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([puntoFalso('p1')])); });
    await avanzarYVaciar(0);

    act(() => { void h.estado.cargarCelda(0, 0); });
    const celda = llamadas.find((l) => l.url.includes('/mapa/celda'))!;
    h.desmontar();
    expect(celda.signal.aborted).toBe(true);
  });

  it('un rectángulo sin área no gasta petición ni se queda como bbox pintado', async () => {
    const { fetchMock } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    // MapLibre entrega bounds colapsados antes de que el contenedor tenga altura.
    act(() => { h.estado.alMoverMapa({ sur: 21, oeste: -79, norte: 21, este: -79 }, true); });
    await avanzarYVaciar(500);
    expect(fetchMock).not.toHaveBeenCalled();

    let devuelto: PuntoMapa[] | undefined;
    await act(async () => { devuelto = await h.estado.cargarCelda(0, 0); });
    expect(devuelto).toEqual([]);

    h.desmontar();
  });
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `cd oficios-cuba/mobile && npx jest test/mapa.test.ts -t 'celda'`
Expected: FAIL — `h.estado.cargarCelda is not a function`.

- [ ] **Step 3: Implementar**

En `src/lib/mapa.ts`, junto a `pedirMapa`:

```ts
async function pedirCelda(
  bbox: Bbox,
  cy: number,
  cx: number,
  params: { tab: string; q?: string; category?: string },
  signal: AbortSignal,
): Promise<MapaRespuesta> {
  const qs = new URLSearchParams({
    bbox: `${bbox.sur},${bbox.oeste},${bbox.norte},${bbox.este}`,
    cy: String(cy),
    cx: String(cx),
    tab: params.tab,
  });
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  const res = await fetch(`${configApi.baseUrl}/mapa/celda?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error('No se pudo cargar la celda');
  return (await res.json()) as MapaRespuesta;
}
```

Dentro de `usarMapa`, junto a las refs que ya hay:

```ts
  // La zona con la que se pidió lo que está pintado AHORA. Distinta de `bboxVisible` durante el
  // antirrebote y mientras una petición vuela: el servidor deduce el tamaño de celda del bbox, así
  // que los cy/cx de los puntos en pantalla solo significan algo respecto a ESTE rectángulo.
  const bboxPintado = useRef<Bbox | null>(null);
  // Controlador propio de la celda: NO es el del área. Abortar la celda porque el mapa se movió
  // dejaría la hoja abierta y sin contenido.
  const controladorCelda = useRef<AbortController | null>(null);
```

En `cargar`, dentro del `.then`, justo después del `if (propio.signal.aborted) return;`:

```ts
        bboxPintado.current = bbox;
```

En `alMoverMapa`, como primera línea, el guardia:

```ts
    // MapLibre devuelve bounds colapsados a un punto si el contenedor todavía no tiene altura.
    // Pedirlos gasta una petición que no puede devolver nada y, peor, dejaría `bboxPintado`
    // apuntando a un rectángulo degenerado del que luego se deduciría una celda absurda.
    if (bbox.norte <= bbox.sur || bbox.este <= bbox.oeste) return;
```

Y el método nuevo, antes del `return`:

```ts
  const cargarCelda = useCallback((cy: number, cx: number): Promise<PuntoMapa[]> => {
    const bbox = bboxPintado.current;
    if (!bbox) return Promise.resolve([]);
    // Un segundo toque abandona el primero: la respuesta vieja no puede pintarse encima.
    controladorCelda.current?.abort();
    const propio = new AbortController();
    controladorCelda.current = propio;
    return pedirCelda(bbox, cy, cx, { tab, q: q || undefined, category: category || undefined }, propio.signal)
      .then((r) => (propio.signal.aborted ? [] : r.puntos))
      // Abandonada (otro toque o desmontaje): no es un error que mostrar, resuelve vacía y quien
      // llama lo trata como «la celda no trajo nada». Cualquier otro fallo sí se propaga.
      .catch((e: unknown) => {
        if (propio.signal.aborted) return [];
        throw e;
      });
  }, [tab, q, category]);
```

En el efecto de limpieza al desmontar, añadir el abort de la celda:

```ts
  useEffect(() => () => {
    controlador.current?.abort();
    controladorCelda.current?.abort();
    limpiarTemporizador();
    limpiarTiempoEspera();
  }, []);
```

Y en el `return`, añadir `cargarCelda`.

- [ ] **Step 4: Correr las pruebas para verificar que pasan**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest test/mapa.test.ts`
Expected: PASS, todas, incluidas las que ya había.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/mobile/src/lib/mapa.ts oficios-cuba/mobile/test/mapa.test.ts
git commit -m "$(cat <<'MSG'
La app puede pedir los negocios de una celda del mapa

cargarCelda(cy, cx) pide GET /api/mapa/celda con el bbox PINTADO, no con el
visible: el servidor deduce el tamaño de celda del bbox, así que con el
rectángulo que el mapa tiene tras un arrastre los índices significarían otra
zona y la lista no coincidiría con el «+N» que la anunció.

Lleva controlador propio, no el del área: abortar la celda porque el mapa se
movió dejaría la hoja abierta y sin contenido. Un segundo toque abandona el
primero. Y un rectángulo sin área (MapLibre los entrega antes de que el
contenedor tenga altura) ya no gasta petición ni queda como bbox pintado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: El auto-centrado (`sugerencia`)

**Files:**
- Modify: `oficios-cuba/mobile/src/lib/mapa.ts`
- Test: `oficios-cuba/mobile/test/mapa.test.ts`

**Interfaces:**
- Consumes: de la Tarea 1, nada directamente (ambas tocan el mismo archivo pero no se cruzan).
- Produces: `usarMapa(...)` devuelve además `sugerencia: { lat: number; lng: number } | null`. `null` = no hay salto pendiente. Quien monta el mapa reacciona a su cambio con un `flyTo` (Tarea 9).

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir dentro del `describe('usarMapa', ...)`:

```ts
  it('sin resultados en la zona pero con texto, pregunta por Cuba entera y guarda el salto', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: 'soldador', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);

    expect(h.estado.sugerencia).toBeNull();
    const cuba = llamadas[1];
    expect(cuba).toBeDefined();
    expect(new URL(cuba.url).searchParams.get('bbox')).toBe('19,-85.5,24,-73.5');
    expect(new URL(cuba.url).searchParams.get('q')).toBe('soldador');

    act(() => { cuba.resolver(respuestaFalsa([{ ...puntoFalso('lejano'), lat: 22.4, lng: -79.9 }])); });
    await avanzarYVaciar(0);
    expect(h.estado.sugerencia).toEqual({ lat: 22.4, lng: -79.9 });

    h.desmontar();
  });

  it('sin resultados y SIN texto no pregunta nada: no hay término que buscar en otra parte', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: '', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.estado.sugerencia).toBeNull();

    h.desmontar();
  });

  it('no repite la pregunta en los movimientos siguientes de la misma búsqueda', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: 'soldador', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);
    const trasElPrimero = fetchMock.mock.calls.length;

    act(() => { h.estado.alMoverMapa(BBOX_B, false); });
    await avanzarYVaciar(500);
    act(() => { llamadas[llamadas.length - 1].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);

    // Una del área nueva, y ninguna de Cuba entera.
    expect(fetchMock.mock.calls.length).toBe(trasElPrimero + 1);

    h.desmontar();
  });

  it('cambiar el texto borra el salto pendiente y permite preguntar de nuevo', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: 'soldador', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);
    act(() => { llamadas[1].resolver(respuestaFalsa([{ ...puntoFalso('lejano'), lat: 22.4, lng: -79.9 }])); });
    await avanzarYVaciar(0);
    expect(h.estado.sugerencia).not.toBeNull();

    h.actualizar({ tab: 'servicios', q: 'plomero', category: '' });
    expect(h.estado.sugerencia).toBeNull();

    await avanzarYVaciar(300);
    act(() => { llamadas[llamadas.length - 1].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);
    // La búsqueda nueva es un caso distinto del ya investigado: vuelve a preguntar.
    expect(new URL(llamadas[llamadas.length - 1].url).searchParams.get('bbox')).toBe('19,-85.5,24,-73.5');

    h.desmontar();
  });

  it('si la pregunta por Cuba entera falla, se queda el «sin resultados» normal', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: 'soldador', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);
    act(() => { llamadas[1].rechazar(new Error('red')); });
    await avanzarYVaciar(0);

    expect(h.estado.sugerencia).toBeNull();
    expect(h.estado.error).toBe(false);

    h.desmontar();
  });

  it('desmontar con la pregunta de Cuba entera en vuelo la aborta', async () => {
    const { fetchMock, llamadas } = fetchControlable();
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = montarHook({ tab: 'servicios', q: 'soldador', category: '' });

    act(() => { h.estado.alMoverMapa(BBOX_A, true); });
    await avanzarYVaciar(250);
    act(() => { llamadas[0].resolver(respuestaFalsa([])); });
    await avanzarYVaciar(0);

    const cuba = llamadas[1];
    h.desmontar();
    expect(cuba.signal.aborted).toBe(true);
  });
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `cd oficios-cuba/mobile && npx jest test/mapa.test.ts -t 'Cuba entera'`
Expected: FAIL — `h.estado.sugerencia` es `undefined`, y solo hay una llamada a `fetch`.

- [ ] **Step 3: Implementar**

Arriba del archivo, junto a `CUBA`:

```ts
// El rectángulo con el que se pregunta «¿existe esta búsqueda en ALGÚN lado de Cuba?» cuando la
// zona visible no tiene nada. Mismos límites que CUBA: el servidor lo trata como cualquier otro
// bbox — agrupa en celdas grandes y devuelve un representante por zona con datos.
const CUBA_ENTERA: Bbox = { sur: CUBA.sur, oeste: CUBA.oeste, norte: CUBA.norte, este: CUBA.este };
```

En `EstadoMapa` y `ESTADO_INICIAL`, añadir el campo:

```ts
  /** Adónde saltar cuando la búsqueda no tiene NADA en la zona visible pero sí en otra parte de
   *  Cuba. null = no hay salto pendiente. Quien monta el mapa reacciona con un flyTo. */
  sugerencia: { lat: number; lng: number } | null;
```

```ts
const ESTADO_INICIAL: EstadoMapa = { puntos: [], cargando: true, error: false, hayMas: false, celda: 0, sugerencia: null };
```

Dentro de `usarMapa`, dos refs más:

```ts
  // Una vez sabida la respuesta para ESTA búsqueda (haya salto o no), repetir la pregunta en cada
  // arrastre sería gastar peticiones de sobra.
  const intentada = useRef(false);
  const controladorCuba = useRef<AbortController | null>(null);
```

Y la función, antes de `cargar`:

```ts
  const buscarEnTodaCuba = useCallback(() => {
    controladorCuba.current?.abort();
    const propio = new AbortController();
    controladorCuba.current = propio;
    pedirMapa(CUBA_ENTERA, { tab, q: q || undefined, category: category || undefined }, propio.signal)
      .then((r) => {
        if (propio.signal.aborted || r.puntos.length === 0) return;
        setEstado((e) => ({ ...e, sugerencia: { lat: r.puntos[0].lat, lng: r.puntos[0].lng } }));
      })
      // Silencioso a propósito: si falla, se queda el «sin resultados» normal. No es crítico.
      .catch(() => {});
  }, [tab, q, category]);
```

En `cargar`, dentro del `.then`, después de `setEstado({...})`:

```ts
        // Solo con texto: sin término, «¿existe en algún lado?» no significa nada, y abrir el mapa
        // sobre el mar dispararía una petición de Cuba entera y un salto que nadie pidió.
        if (r.puntos.length === 0 && q && !intentada.current) {
          intentada.current = true;
          buscarEnTodaCuba();
        }
```

El `setEstado` de éxito debe conservar la sugerencia, así que pasa a forma de función:

```ts
        setEstado((e) => ({ ...e, puntos: r.puntos, cargando: false, error: false, hayMas: r.hay_mas, celda: r.celda }));
```

En el efecto que ya reacciona a `[tab, q, category]`, como primeras líneas:

```ts
    intentada.current = false;
    setEstado((e) => (e.sugerencia === null ? e : { ...e, sugerencia: null }));
```

🚨 Ese efecto hoy empieza con `if (!bboxVisible.current) return;`. Las dos líneas de arriba van **antes** de ese `return`: cambiar de búsqueda invalida el salto pendiente aunque el mapa todavía no haya reportado zona.

Y en la limpieza al desmontar, añadir `controladorCuba.current?.abort();`.

Añadir `cargar` a las deps correctas: `cargar` pasa a depender de `buscarEnTodaCuba`, y `buscarEnTodaCuba` de `[tab, q, category]`. Dejar el `// eslint-disable-next-line react-hooks/exhaustive-deps` que ya tiene el efecto del texto.

- [ ] **Step 4: Correr las pruebas para verificar que pasan**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest test/mapa.test.ts`
Expected: PASS, todas.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/mobile/src/lib/mapa.ts oficios-cuba/mobile/test/mapa.test.ts
git commit -m "$(cat <<'MSG'
Si la búsqueda no tiene nada en la zona, la app sabe adónde saltar

Cuando una carga vuelve con 0 puntos y HAY texto de búsqueda, se pregunta una
vez por el bbox de Cuba entera con el mismo término y se expone la coordenada
del primer resultado como `sugerencia`. Gemelo de lo que la web hace desde
4c69b64.

La condición de «hay texto» no es decoración: sin ella, abrir el mapa sobre el
mar dispararía una petición de Cuba entera y un salto que nadie pidió. Y
`intentada` evita repetir la pregunta en cada arrastre mientras el término no
cambie; cambiarlo la reinicia y borra el salto pendiente.

Silenciosa si falla: se queda el «sin resultados» normal.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: El Atrás con tres estados

**Files:**
- Modify: `oficios-cuba/mobile/src/lib/hojaPunto.ts`
- Test: `oficios-cuba/mobile/test/hojaPunto.test.ts` (se reescribe)

**Interfaces:**
- Consumes: nada.
- Produces: `accionAtras(e: EstadoHoja): AccionAtras`, con `EstadoHoja = { punto: PuntoMapa | null; lista: PuntoMapa[] | null; hayListaPrevia: boolean }` y `AccionAtras = 'nada' | 'cerrar' | 'volver-a-lista'`. `atrasCierraHoja` **desaparece**: la Tarea 6 es la única que la usaba.

- [ ] **Step 1: Escribir las pruebas que fallan**

Reemplazar el contenido de `test/hojaPunto.test.ts` por:

```ts
import type { PuntoMapa } from '@oficio/shared';
import { accionAtras } from '../src/lib/hojaPunto';

const punto = (id: string): PuntoMapa => ({ id, tipo: 'oficio', nombre: 'Ana', lat: 20, lng: -79, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: 'x' });

describe('accionAtras', () => {
  it('con la hoja cerrada, deja pasar el Atrás — sale de la pantalla', () => {
    expect(accionAtras({ punto: null, lista: null, hayListaPrevia: false })).toBe('nada');
  });

  it('con una ficha abierta que no vino de una lista, cierra la hoja', () => {
    expect(accionAtras({ punto: punto('p1'), lista: null, hayListaPrevia: false })).toBe('cerrar');
  });

  it('con la lista abierta, cierra la hoja y no saca al usuario de Explorar', () => {
    expect(accionAtras({ punto: null, lista: [punto('p1'), punto('p2')], hayListaPrevia: false })).toBe('cerrar');
  });

  // El caso que motiva el cambio: quien entra en una celda de cinco y se equivoca de negocio no
  // puede perder la celda y tener que volver a acertarle al pin.
  it('con una ficha que vino de una lista, VUELVE a la lista en vez de cerrar', () => {
    expect(accionAtras({ punto: punto('p1'), lista: null, hayListaPrevia: true })).toBe('volver-a-lista');
  });

  it('volver a la lista gana a cerrar: el orden de las ramas importa', () => {
    // Si la rama de «cerrar» se evaluara primero, este caso cerraría la hoja y el usuario perdería
    // la celda. Se fija aquí para que un reordenado futuro rompa una prueba y no la experiencia.
    expect(accionAtras({ punto: punto('p1'), lista: [punto('p2')], hayListaPrevia: true })).toBe('volver-a-lista');
  });

  it('sin ficha y sin lista, una lista previa colgada no inventa un Atrás', () => {
    expect(accionAtras({ punto: null, lista: null, hayListaPrevia: true })).toBe('nada');
  });
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `cd oficios-cuba/mobile && npx jest test/hojaPunto.test.ts`
Expected: FAIL — `accionAtras` no se exporta de `../src/lib/hojaPunto`.

- [ ] **Step 3: Implementar**

Reemplazar el contenido de `src/lib/hojaPunto.ts` por:

```ts
import type { PuntoMapa } from '@oficio/shared';

export type EstadoHoja = {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  /** Hay una lista a la que volver: esta ficha se abrió eligiendo de ella. */
  hayListaPrevia: boolean;
};

export type AccionAtras = 'nada' | 'cerrar' | 'volver-a-lista';

/**
 * Qué debe hacer el botón físico Atrás con la hoja del mapa. Vive aparte de HojaPunto.tsx (que solo
 * hace `BackHandler.addEventListener` y llama a esto) para poder probar la decisión sin la
 * maquinaria nativa de gestos ni @gorhom/bottom-sheet.
 *
 * Es el defecto más común de este patrón (brief de la Tarea 10): si se rompe, quien toca un punto y
 * pulsa Atrás sale de Explorar y pierde su búsqueda.
 *
 * 🚨 El ORDEN de las ramas es la decisión, no un detalle: con una ficha que vino de una lista, Atrás
 * tiene que devolver a la lista. Si se cerrara, quien entró en una celda de cinco y se equivocó de
 * negocio pierde la celda y tiene que volver a acertarle al pin.
 */
export function accionAtras({ punto, lista, hayListaPrevia }: EstadoHoja): AccionAtras {
  if (punto && hayListaPrevia) return 'volver-a-lista';
  if (punto || lista) return 'cerrar';
  return 'nada';
}
```

- [ ] **Step 4: Correr las pruebas para verificar que pasan**

Run: `cd oficios-cuba/mobile && npx jest test/hojaPunto.test.ts`
Expected: PASS, 6 pruebas.

`npx tsc --noEmit` va a **fallar** aquí, porque `HojaPunto.tsx` todavía importa `atrasCierraHoja`. Es lo esperado: lo arregla la Tarea 4. No tocar `HojaPunto.tsx` en esta tarea.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/mobile/src/lib/hojaPunto.ts oficios-cuba/mobile/test/hojaPunto.test.ts
git commit -m "$(cat <<'MSG'
El Atrás de la hoja del mapa pasa a tener tres estados

Con la lista de una celda, «cierra o no cierra» ya no alcanza: con una ficha que
se abrió ELIGIENDO de una lista, Atrás tiene que volver a la lista. Si cierra,
quien entró en una celda de cinco y se equivocó de negocio pierde la celda y
tiene que volver a acertarle al pin.

accionAtras() sustituye a atrasCierraHoja() en vez de convivir con ella: dos
funciones que deciden lo mismo con distinto alcance es cómo vuelven los bugs.
Una prueba fija el ORDEN de las ramas, para que un reordenado futuro rompa el
test y no la experiencia.

tsc queda en rojo a propósito hasta el commit siguiente: HojaPunto.tsx todavía
importa la función vieja.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Partir `HojaPunto` en envoltorio y contenido

**Files:**
- Create: `oficios-cuba/mobile/src/componentes/FichaPunto.tsx`
- Modify: `oficios-cuba/mobile/src/componentes/HojaPunto.tsx`

**Interfaces:**
- Consumes: `accionAtras`, `EstadoHoja`, `AccionAtras` de la Tarea 3.
- Produces: `FichaPunto` con props `{ punto: PuntoMapa; desplegada: boolean }` — `desplegada` es `indiceActual === 1`, y es lo que decide si se pide la ficha completa. `HojaPunto` mantiene exactamente las props que ya tenía (`punto`, `onCerrar`, `onCambiaIndice`); la Tarea 5 le añade las de la lista.

**Refactor sin cambio de conducta.** No hay pruebas de componentes en este proyecto, así que la red es `tsc` + el humo en emulador. No se aprovecha para mejorar nada más.

- [ ] **Step 1: Crear `FichaPunto.tsx` con el contenido de hoy**

Mover **tal cual**, sin reescribir nada: el `const origenWeb`, el `TIEMPO_ESPERA_MS`, `pedirProveedor`, el componente interno `FichaCompleta`, y el bloque JSX que hoy vive dentro de `BottomSheetScrollView` (cabecera con `Avatar`/nombre/`Insignia`/resumen/botón cerrar, el enlace «Ver perfil completo», el separador y `FichaCompleta`). Los estilos que usa ese bloque (`cabecera`, `nombre`, `resumen`, `separador`) se mueven con él.

El botón de cerrar pasa a llamar a una prop, porque el `sheetRef` se queda en el envoltorio:

```tsx
export default function FichaPunto({ punto, desplegada, onCerrar }: {
  punto: PuntoMapa;
  /** La hoja está en el anclaje «abierta» (índice 1): solo entonces se pide la ficha completa, igual
   *  que en la web — a «asomada» alcanza con el resumen y el enlace. */
  desplegada: boolean;
  onCerrar(): void;
}) {
```

- [ ] **Step 2: Dejar `HojaPunto.tsx` como envoltorio**

Quita de `HojaPunto.tsx` todo lo movido y sus imports huérfanos (`Avatar`, `Insignia`, `Valoracion`, `EstadoError`, `Boton`, `useSesion`, `configApi`, `telLink`, `whatsappLink`, `ProviderPublic`). Conserva `BottomSheet`, los anclajes, `enableDynamicSizing={false}`, el backdrop, `onClose`, `onChange` y el `BackHandler`.

El `BackHandler` pasa a usar `accionAtras`. En esta tarea todavía no hay lista, así que las dos entradas nuevas van fijas y la Tarea 6 las conecta:

```tsx
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const accion = accionAtras({ punto: puntoRef.current, lista: null, hayListaPrevia: false });
      if (accion === 'nada') return false;
      // No se llama a onCerrar directo: se le pide a la hoja que se cierre con su propia
      // animación, y es su `onClose` quien avisa al padre cuando ya terminó.
      sheetRef.current?.close();
      return true;
    });
    return () => sub.remove();
  }, []);
```

Y el contenido:

```tsx
      <BottomSheetScrollView contentContainerStyle={e.contenido}>
        {punto ? (
          <FichaPunto punto={punto} desplegada={indiceActual === 1} onCerrar={() => sheetRef.current?.close()} />
        ) : null}
      </BottomSheetScrollView>
```

- [ ] **Step 3: Verificar que el tipado vuelve a verde**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`
Expected: PASS todo (`tsc` limpio — el rojo que dejó la Tarea 3 queda cerrado aquí).

- [ ] **Step 4: Humo en emulador: la ficha se ve igual que antes**

Levantar el emulador propio y comprobar que tocar un punto abre la hoja idéntica: asomada con nombre y resumen, desplegada con calificación, descripción, lugar, categorías y los botones de contacto; Atrás cierra la hoja sin salir de Explorar.

```bash
adb devices   # si ya hay uno en 5554, es de otra sesión: NO tocarlo
emulator -avd jarvis_api34 -port 5556 -no-window -no-snapshot-save -no-audio -gpu swiftshader_indirect &
A="adb -s emulator-5556"; until [ "$($A shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 3; done
```

Expected: ninguna diferencia visible respecto a la 0.2.4. **Mirar la captura**, no suponerlo.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/mobile/src/componentes/FichaPunto.tsx oficios-cuba/mobile/src/componentes/HojaPunto.tsx
git commit -m "$(cat <<'MSG'
Separa FichaPunto del envoltorio: la hoja pasa a elegir contenido

Mismo movimiento que la web hizo en b624484, y por la misma razón: la hoja va a
tener que mostrar también la lista de una celda, y eso no cabe en un componente
que tiene el contenido escrito dentro.

HojaPunto se queda con el BottomSheet y lo que ya funciona (los dos anclajes,
enableDynamicSizing={false}, el backdrop, el BackHandler). FichaPunto recibe el
contenido tal cual, sin reescribir nada.

Sin cambio de conducta: no hay pruebas de componentes en este proyecto, así que
se verifica con tsc y mirando la hoja en el emulador.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: `ListaCelda` y la hoja eligiendo contenido

**Files:**
- Create: `oficios-cuba/mobile/src/componentes/ListaCelda.tsx`
- Modify: `oficios-cuba/mobile/src/componentes/HojaPunto.tsx`
- Create: `oficios-cuba/mobile/src/lib/listaCelda.ts`
- Create: `oficios-cuba/mobile/src/lib/pines.ts`
- Test: `oficios-cuba/mobile/test/listaCelda.test.ts`

**Interfaces:**
- Consumes: `FichaPunto` de la Tarea 4.
- Produces: `ListaCelda` con props `{ puntos: PuntoMapa[]; onElegir(p: PuntoMapa): void; onCerrar(): void; error?: string; onReintentar?(): void }`. `HojaPunto` gana `lista?: PuntoMapa[] | null`, `errorLista?: string`, `onReintentarLista?()`, `onElegirDeLista?(p)`. `tituloCelda(n: number): string` en `lib/listaCelda.ts`. Y **`PIN_POR_TIPO` en `lib/pines.ts`**, que consumen las Tareas 7 y 8.

🚨 `PIN_POR_TIPO` nace aquí, en `lib/`, y **no** en `MapaExplorar.tsx`: lo usan dos componentes y un componente no debe importar tokens visuales de otro componente. Hasta que la Tarea 7 lo adopte, el mapa sigue coloreando por plan y la lista ya colorea por tipo — inconsistencia transitoria y deliberada, de un commit de duración.

El conteo del título y el caso de «la celda trajo uno solo» son decisiones, no pintura: van a `lib/` para poder probarlas.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `test/listaCelda.test.ts`:

```ts
import { tituloCelda } from '../src/lib/listaCelda';

describe('tituloCelda', () => {
  it('singular con uno', () => {
    expect(tituloCelda(1)).toBe('1 negocio en esta zona');
  });

  it('plural con varios', () => {
    expect(tituloCelda(4)).toBe('4 negocios en esta zona');
  });

  // Una celda que vuelve vacía se abre con el propio punto tocado, así que 0 no debería llegar —
  // pero si llega, el título no puede decir «0 negocios» en una lista que muestra uno.
  it('con cero cae en el título neutro, sin contar', () => {
    expect(tituloCelda(0)).toBe('Negocios de esta zona');
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `cd oficios-cuba/mobile && npx jest test/listaCelda.test.ts`
Expected: FAIL — no existe `../src/lib/listaCelda`.

- [ ] **Step 3: Implementar la decisión y la lista**

Crear `src/lib/listaCelda.ts`:

```ts
/**
 * El título de la lista de una celda. El neutro (sin número) es el del caso de error: cuando la
 * celda no se pudo cargar no se puede afirmar cuántos hay, y «0 negocios» sobre una lista que
 * muestra uno sería mentira.
 */
export function tituloCelda(n: number): string {
  if (n <= 0) return 'Negocios de esta zona';
  return n === 1 ? '1 negocio en esta zona' : `${n} negocios en esta zona`;
}
```

Crear `src/lib/pines.ts`:

```ts
import type { PuntoMapa } from '@oficio/shared';
import { brand, ink } from './tema';

/**
 * El color del pin dice el TIPO de perfil, no el plan. Igual que la web desde siempre; la app
 * coloreaba por plan y Dariel lo cambió el 2026-10-01, revocando a propósito la frase del commit
 * a9d648f («NO se toca el color del pin por plan en el mapa»). El ranking de pago deja de verse.
 *
 * 🚨 Relleno y glifo viajan JUNTOS porque es contraste, no gusto: blanco sobre brand[400] da 2,3:1 y
 * WCAG pide 3:1 para un elemento gráfico (brand[500] ya se rechazó por lo mismo, ver explorar.tsx).
 * Negocio: 4,9:1. Oficio: 7,0:1. No separar estas dos columnas.
 *
 * Vive en lib/ y no en MapaExplorar.tsx porque lo usan el mapa y la lista de celda, y un componente
 * no debe importar tokens visuales de otro componente.
 */
export const PIN_POR_TIPO: Record<PuntoMapa['tipo'], { fondo: string; glifo: string }> = {
  negocio: { fondo: brand[600], glifo: '#ffffff' },
  oficio: { fondo: brand[400], glifo: ink[900] },
};
```

Crear `src/componentes/ListaCelda.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PuntoMapa } from '@oficio/shared';
import { tituloCelda } from '../lib/listaCelda';
import { PIN_POR_TIPO } from '../lib/pines';
import { fuentes, ink, radios, sand } from '../lib/tema';
import { u } from './ui';

/**
 * Los negocios de UNA celda del mapa, como CONTENIDO de la hoja: el envoltorio lo pone HojaPunto,
 * igual que con la ficha.
 *
 * Existe porque `detras` era solo una insignia: si una celda tenía cinco, se veía uno y los otros
 * cuatro eran inalcanzables. Es la misma interacción para el «+N» de un pin y para un área en modo
 * zona.
 */
export default function ListaCelda({ puntos, onElegir, onCerrar, error, onReintentar }: {
  puntos: PuntoMapa[];
  onElegir(p: PuntoMapa): void;
  onCerrar(): void;
  /** Mensaje si la celda no se pudo cargar. Con él se pinta «Reintentar». */
  error?: string;
  onReintentar?(): void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={e.cabecera}>
        <Text style={e.titulo}>{error ? tituloCelda(0) : tituloCelda(puntos.length)}</Text>
        <Pressable onPress={onCerrar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar la lista">
          <Ionicons name="close" size={22} color={ink[400]} />
        </Pressable>
      </View>

      {/* Sin esto, un fallo de red deja al usuario mirando una lista corta sin saber si la zona
          tiene eso o si algo se rompió. No es lo mismo y no puede parecerlo. */}
      {error ? (
        <View style={e.error} accessibilityRole="alert">
          <Text style={e.errorTexto}>{error}</Text>
          {onReintentar ? (
            <Pressable onPress={onReintentar} hitSlop={8} accessibilityRole="button">
              <Text style={e.errorEnlace}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {puntos.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onElegir(p)}
          accessibilityRole="button"
          accessibilityLabel={p.nombre}
          style={({ pressed }) => [e.fila, pressed && { backgroundColor: sand[100] }]}
        >
          <Ionicons name="location" size={18} color={PIN_POR_TIPO[p.tipo].fondo} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={e.nombre} numberOfLines={1}>{p.nombre}</Text>
            {p.resumen ? <Text style={[u.suave, { fontSize: 13 }]} numberOfLines={1}>{p.resumen}</Text> : null}
          </View>
          {/* Que se sepa cuál es aproximado ANTES de entrar: si no, se leen todos como direcciones
              exactas y solo se descubre al abrir uno. */}
          {p.aproximado ? (
            <View style={e.zona}><Text style={e.zonaTexto}>Zona</Text></View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const e = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: sand[200],
  },
  titulo: { fontFamily: fuentes.textoNegrita, fontSize: 16, color: ink[900], flexShrink: 1 },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: sand[200] },
  nombre: { fontFamily: fuentes.textoFuerte, fontSize: 15, color: ink[900] },
  zona: {
    alignSelf: 'center', borderRadius: radios.chip, borderWidth: 1, borderStyle: 'dashed',
    borderColor: ink[300], paddingHorizontal: 8, paddingVertical: 2,
  },
  zonaTexto: { fontFamily: fuentes.textoFuerte, fontSize: 11, color: ink[700] },
  error: { paddingVertical: 8, gap: 4 },
  errorTexto: { fontFamily: fuentes.texto, fontSize: 13, color: '#991b1b' },
  errorEnlace: { fontFamily: fuentes.textoFuerte, fontSize: 13, color: '#991b1b', textDecorationLine: 'underline' },
});
```

- [ ] **Step 4: Que `HojaPunto` elija contenido**

Props nuevas y elección. La lista gana a la ficha porque cuando hay lista no hay punto (quien las gobierna, en la Tarea 6, nunca pone las dos):

```tsx
export default function HojaPunto({ punto, lista, errorLista, onCerrar, onCambiaIndice, onElegirDeLista, onReintentarLista }: {
  punto: PuntoMapa | null;
  lista?: PuntoMapa[] | null;
  errorLista?: string;
  onCerrar(): void;
  onCambiaIndice?(indice: number): void;
  onElegirDeLista?(p: PuntoMapa): void;
  onReintentarLista?(): void;
}) {
```

El efecto que abre y cierra pasa a mirar las dos cosas:

```tsx
  useEffect(() => {
    if (punto || lista) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [punto?.id, lista]);
```

Y el contenido:

```tsx
      <BottomSheetScrollView contentContainerStyle={e.contenido}>
        {lista ? (
          <ListaCelda
            puntos={lista}
            error={errorLista}
            onReintentar={onReintentarLista}
            onElegir={(p) => onElegirDeLista?.(p)}
            onCerrar={() => sheetRef.current?.close()}
          />
        ) : punto ? (
          <FichaPunto punto={punto} desplegada={indiceActual === 1} onCerrar={() => sheetRef.current?.close()} />
        ) : null}
      </BottomSheetScrollView>
```

El `accessibilityLabel` del `BottomSheet` tiene que decir qué hay dentro:

```tsx
      accessibilityLabel={lista ? tituloCelda(lista.length) : punto ? `Ficha de ${punto.nombre}` : 'Ficha del punto seleccionado'}
```

- [ ] **Step 5: Verificar**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`
Expected: PASS, todo limpio. Esta tarea no deja `tsc` en rojo.

- [ ] **Step 6: Commit**

```bash
git add oficios-cuba/mobile/src/componentes/ListaCelda.tsx oficios-cuba/mobile/src/lib/listaCelda.ts oficios-cuba/mobile/src/lib/pines.ts oficios-cuba/mobile/src/componentes/HojaPunto.tsx oficios-cuba/mobile/test/listaCelda.test.ts
git commit -m "$(cat <<'MSG'
La hoja del mapa puede mostrar los negocios de una celda

ListaCelda como contenido alternativo de la hoja, con el mismo envoltorio que la
ficha. El título y su conteo viven en lib/listaCelda.ts para poder probarlos: el
caso de error usa el título neutro, porque cuando la celda no se pudo cargar no
se puede afirmar cuántos hay y «0 negocios» sobre una lista que muestra uno
sería mentira.

Cada fila dice si su punto es aproximado ANTES de entrar: si no, se leen todos
como direcciones exactas y solo se descubre al abrir uno.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: La celda, de punta a punta

**Files:**
- Modify: `oficios-cuba/mobile/app/(tabs)/explorar.tsx`
- Modify: `oficios-cuba/mobile/src/componentes/MapaExplorar.tsx`
- Modify: `oficios-cuba/mobile/src/componentes/HojaPunto.tsx`
- Create: `oficios-cuba/mobile/src/lib/panelMapa.ts`
- Test: `oficios-cuba/mobile/test/panelMapa.test.ts`

**Interfaces:**
- Consumes: `cargarCelda` (Tarea 1), `accionAtras` (Tarea 3), `ListaCelda` y las props de `HojaPunto` (Tarea 5).
- Produces: `MapaExplorar` gana `onAbrirLista(puntos: PuntoMapa[], error?: string, reintentar?: () => void): void` y `seleccionadoId?: string | null` (lo consume la Tarea 8). `reduceAbrirPunto` / `reduceAbrirLista` / `reduceElegirDeLista` / `reduceVolverALista` / `reduceCerrar` y `contenidoDeCelda` en `lib/panelMapa.ts`.

**Refinamiento del spec, a propósito.** La tabla de casos límite del spec dice que una celda vacía se abre «con el propio punto (`[p]`)», es decir una lista de uno. Eso deja sin resolver el caso real de que la celda **traiga uno solo** (el `+N` prometía varios, pero los datos cambiaron o el filtro los excluyó). Una lista de un elemento es un paso extra por nada: `contenidoDeCelda` decide ficha en vez de lista cuando hay uno o ninguno. Es una divergencia con la web, que sí muestra la lista de uno, y hay que decírselo a Dariel al entregar.

El estado del panel tiene cinco transiciones y una de ellas (elegir de la lista) debe recordar la lista para volver sin volver a pedirla. Eso es lógica, y la lógica de esta app se prueba en `lib/`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `test/panelMapa.test.ts`:

```ts
import type { PuntoMapa } from '@oficio/shared';
import {
  contenidoDeCelda,
  ESTADO_PANEL_VACIO,
  reduceAbrirLista,
  reduceAbrirPunto,
  reduceCerrar,
  reduceElegirDeLista,
  reduceVolverALista,
} from '../src/lib/panelMapa';

const punto = (id: string): PuntoMapa => ({ id, tipo: 'oficio', nombre: id, lat: 20, lng: -79, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0, resumen: 'x' });

describe('estado del panel del mapa', () => {
  it('abrir un punto deja la ficha y ninguna lista', () => {
    const s = reduceAbrirPunto(ESTADO_PANEL_VACIO, punto('p1'));
    expect(s.punto?.id).toBe('p1');
    expect(s.lista).toBeNull();
    expect(s.listaPrevia).toBeNull();
    expect(s.errorLista).toBe('');
  });

  it('abrir la lista cierra la ficha que hubiera', () => {
    const conFicha = reduceAbrirPunto(ESTADO_PANEL_VACIO, punto('p1'));
    const s = reduceAbrirLista(conFicha, [punto('a'), punto('b')]);
    expect(s.punto).toBeNull();
    expect(s.lista?.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('la lista puede abrirse con un error y su reintento', () => {
    const reintento = () => {};
    const s = reduceAbrirLista(ESTADO_PANEL_VACIO, [], 'No pudimos cargar los negocios de esta zona.', reintento);
    expect(s.lista).toEqual([]);
    expect(s.errorLista).toBe('No pudimos cargar los negocios de esta zona.');
    expect(s.reintentarLista).toBe(reintento);
  });

  // La razón de ser de listaPrevia: volver a la celda sin pedirla otra vez.
  it('elegir de la lista recuerda la lista para poder volver', () => {
    const conLista = reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('a'), punto('b')]);
    const s = reduceElegirDeLista(conLista, punto('b'));
    expect(s.punto?.id).toBe('b');
    expect(s.lista).toBeNull();
    expect(s.listaPrevia?.map((p) => p.id)).toEqual(['a', 'b']);

    const vuelta = reduceVolverALista(s);
    expect(vuelta.punto).toBeNull();
    expect(vuelta.lista?.map((p) => p.id)).toEqual(['a', 'b']);
    expect(vuelta.listaPrevia).toBeNull();
  });

  // Review Focus 4: la zona se recargó entre el toque y la elección, y el punto elegido ya no está
  // en `puntos`. El panel no puede romperse por eso: solo guarda lo que le dan.
  it('elegir un punto que el mapa ya no tiene sigue abriendo su ficha', () => {
    const conLista = reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('fantasma')]);
    const s = reduceElegirDeLista(conLista, punto('fantasma'));
    expect(s.punto?.id).toBe('fantasma');
  });

  it('volver a la lista sin lista previa no inventa una', () => {
    const conFicha = reduceAbrirPunto(ESTADO_PANEL_VACIO, punto('p1'));
    const s = reduceVolverALista(conFicha);
    expect(s.lista).toBeNull();
    expect(s.punto?.id).toBe('p1');
  });

  // Review Focus 3: el spec solo nombra el punto abierto, pero una lista pertenece igual de fuerte
  // a la búsqueda que la produjo.
  it('cerrar limpia TODO, incluida la lista previa y el error', () => {
    const s = reduceCerrar(reduceElegirDeLista(
      reduceAbrirLista(ESTADO_PANEL_VACIO, [punto('a')], 'fallo', () => {}),
      punto('a'),
    ));
    expect(s).toEqual(ESTADO_PANEL_VACIO);
  });
});

describe('contenidoDeCelda', () => {
  it('con varios, lista', () => {
    expect(contenidoDeCelda(punto('tocado'), [punto('a'), punto('b')]))
      .toEqual({ clase: 'lista', puntos: [punto('a'), punto('b')] });
  });

  // Review Focus 5: el «+N» prometía varios pero el servidor solo nombra uno (datos cambiados, o el
  // filtro excluyó al resto). Una lista de un elemento es un paso extra por nada.
  it('con uno solo, su ficha directa en vez de una lista de uno', () => {
    expect(contenidoDeCelda(punto('tocado'), [punto('solo')]))
      .toEqual({ clase: 'ficha', punto: punto('solo') });
  });

  it('con la celda vacía, la ficha del punto que se tocó: el «+N» prometía algo', () => {
    expect(contenidoDeCelda(punto('tocado'), []))
      .toEqual({ clase: 'ficha', punto: punto('tocado') });
  });
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `cd oficios-cuba/mobile && npx jest test/panelMapa.test.ts`
Expected: FAIL — no existe `../src/lib/panelMapa`.

- [ ] **Step 3: Implementar el estado**

Crear `src/lib/panelMapa.ts`:

```ts
import type { PuntoMapa } from '@oficio/shared';

/**
 * Qué muestra la hoja del mapa. Gemelo del estado que ExplorarMapa.tsx gobierna en la web, aquí
 * aparte de la pantalla para poder probar las transiciones: el proyecto no renderiza componentes en
 * las pruebas, así que una decisión que vive dentro de un `useState` no se puede verificar.
 *
 * Invariante: `punto` y `lista` nunca son ambos no nulos. HojaPunto da prioridad a la lista, pero
 * no debería tener que ejercerla.
 */
export type EstadoPanel = {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  /** La lista a la que volver cuando se eligió uno de sus negocios. Evita volver a pedir la celda. */
  listaPrevia: PuntoMapa[] | null;
  errorLista: string;
  reintentarLista: (() => void) | null;
};

export const ESTADO_PANEL_VACIO: EstadoPanel = {
  punto: null, lista: null, listaPrevia: null, errorLista: '', reintentarLista: null,
};

export function reduceAbrirPunto(_e: EstadoPanel, punto: PuntoMapa): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, punto };
}

export function reduceAbrirLista(
  _e: EstadoPanel, lista: PuntoMapa[], errorLista = '', reintentarLista: (() => void) | null = null,
): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, lista, errorLista, reintentarLista };
}

export function reduceElegirDeLista(e: EstadoPanel, punto: PuntoMapa): EstadoPanel {
  return { ...ESTADO_PANEL_VACIO, punto, listaPrevia: e.lista };
}

export function reduceVolverALista(e: EstadoPanel): EstadoPanel {
  if (!e.listaPrevia) return e;
  return { ...ESTADO_PANEL_VACIO, lista: e.listaPrevia };
}

export function reduceCerrar(_e: EstadoPanel): EstadoPanel {
  return ESTADO_PANEL_VACIO;
}

export type ContenidoCelda =
  | { clase: 'ficha'; punto: PuntoMapa }
  | { clase: 'lista'; puntos: PuntoMapa[] };

/**
 * Qué enseñar tras pedir la celda de un grupo.
 *
 * Con uno o ninguno se enseña una ficha, no una lista: el «+N» prometía varios, pero si el servidor
 * solo puede nombrar uno (datos cambiados entre la carga del área y el toque, o el filtro excluyó al
 * resto), una lista de un elemento es un paso extra por nada. Vacía → la ficha del punto que se
 * tocó, para no dejar la hoja en blanco tras una promesa.
 *
 * 🚨 Divergencia deliberada con la web, que en estos casos abre una lista de uno.
 */
export function contenidoDeCelda(tocado: PuntoMapa, devueltos: PuntoMapa[]): ContenidoCelda {
  if (devueltos.length <= 1) return { clase: 'ficha', punto: devueltos[0] ?? tocado };
  return { clase: 'lista', puntos: devueltos };
}
```

- [ ] **Step 4: Correr las pruebas para verificar que pasan**

Run: `cd oficios-cuba/mobile && npx jest test/panelMapa.test.ts`
Expected: PASS, 11 pruebas (8 del estado del panel + 3 de `contenidoDeCelda`).

- [ ] **Step 5: Conectar el mapa**

En `MapaExplorar.tsx`, props nuevas y el reparto del toque:

```tsx
export default function MapaExplorar({ tab, q, category, seleccionadoId, onAbrir, onAbrirLista }: {
  tab: string; q: string; category: string;
  /** El `id` del punto con su ficha abierta: su marcador pasa de círculo a gota. */
  seleccionadoId?: string | null;
  onAbrir(p: PuntoMapa): void;
  /** Los negocios de una celda al tocar un grupo. Si la celda falla, llega vacía con el mensaje:
   *  la hoja se abre igual. */
  onAbrirLista(puntos: PuntoMapa[], error?: string, reintentar?: () => void): void;
}) {
  const { puntos, cargando, error, celda, sugerencia, alMoverMapa, buscarZonaVisible, cargarCelda } = usarMapa({ tab, q, category });
```

```tsx
  // Un punto suelto abre su ficha; un grupo abre la lista de su celda. Es la misma interacción para
  // el «+N» y para un área: enseñar dos gestos para el mismo hecho sería pedirle al usuario que
  // aprenda dos cosas.
  const abrir = useCallback((p: PuntoMapa) => {
    if (p.detras === 0) { onAbrir(p); return; }
    cargarCelda(p.cy, p.cx)
      .then((devueltos) => {
        const c = contenidoDeCelda(p, devueltos);
        if (c.clase === 'ficha') onAbrir(c.punto);
        else onAbrirLista(c.puntos);
      })
      // Sin este catch, un fallo de red es un rechazo sin capturar: se toca un grupo y no pasa
      // NADA, ni hoja ni mensaje. Se abre igual, con el punto que sí se conoce, el mensaje y CÓMO
      // reintentar — quien abre la hoja no sabe pedir celdas, así que sin la clausura el botón
      // «Reintentar» existiría y no haría nada, que es peor que no tenerlo.
      .catch(() => onAbrirLista([p], 'No pudimos cargar los negocios de esta zona.', () => abrir(p)));
  }, [cargarCelda, onAbrir, onAbrirLista]);
```

Pasar `abrir` (no `onAbrir`) a `Pin` y a `AreaZona`, e importar `contenidoDeCelda` de `../lib/panelMapa`.

- [ ] **Step 6: Conectar la pantalla**

En `app/(tabs)/explorar.tsx`, sustituir `const [puntoAbierto, setPuntoAbierto] = useState<PuntoMapa | null>(null);` por el estado del panel:

```tsx
  const [panel, setPanel] = useState<EstadoPanel>(ESTADO_PANEL_VACIO);
```

```tsx
  const alAbrirPunto = useCallback((p: PuntoMapa) => {
    setPanel((e) => reduceAbrirPunto(e, p));
    setIndiceHoja(0); // coincide con el snapToIndex(0) que hace HojaPunto al recibir contenido nuevo.
  }, []);

  const alAbrirLista = useCallback((puntos: PuntoMapa[], error?: string, reintentar?: () => void) => {
    setPanel((e) => reduceAbrirLista(e, puntos, error ?? '', reintentar ?? null));
    setIndiceHoja(0);
  }, []);

  const alElegirDeLista = useCallback((p: PuntoMapa) => { setPanel((e) => reduceElegirDeLista(e, p)); }, []);
  const alVolverALista = useCallback(() => { setPanel((e) => reduceVolverALista(e)); }, []);
  const alCerrarHoja = useCallback(() => { setPanel(reduceCerrar); setIndiceHoja(-1); }, []);
```

Cambiar de categoría o de texto cierra la hoja: lo abierto puede no pertenecer ya a lo que el mapa muestra — y eso vale igual para una lista que para una ficha (Review Focus 3):

```tsx
  useEffect(() => {
    setPanel(reduceCerrar);
    setIndiceHoja(-1);
  }, [q, categoria?.slug]);
```

Y el montaje:

```tsx
              <MapaExplorar
                tab="servicios"
                q={q}
                category={categoria?.slug ?? ''}
                seleccionadoId={panel.punto?.id ?? null}
                onAbrir={alAbrirPunto}
                onAbrirLista={alAbrirLista}
              />
```

```tsx
          <HojaPunto
            punto={panel.punto}
            lista={panel.lista}
            errorLista={panel.errorLista || undefined}
            onReintentarLista={panel.reintentarLista ?? undefined}
            onElegirDeLista={alElegirDeLista}
            onVolverALista={panel.listaPrevia ? alVolverALista : undefined}
            onCerrar={alCerrarHoja}
            onCambiaIndice={setIndiceHoja}
          />
```

- [ ] **Step 7: Conectar el Atrás de verdad**

En `HojaPunto.tsx`, añadir la prop `onVolverALista?(): void` y darle al `BackHandler` el estado real. Las tres cosas van por ref, como ya hace `punto`, para no re-suscribir el listener:

```tsx
  const listaRef = useRef(lista);
  const hayPreviaRef = useRef(Boolean(onVolverALista));
  listaRef.current = lista;
  hayPreviaRef.current = Boolean(onVolverALista);
  const onVolverRef = useRef(onVolverALista);
  onVolverRef.current = onVolverALista;
```

```tsx
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const accion = accionAtras({ punto: puntoRef.current, lista: listaRef.current ?? null, hayListaPrevia: hayPreviaRef.current });
      if (accion === 'nada') return false;
      // Volver a la lista NO cierra la hoja: cambia su contenido. Cerrarla y reabrirla haría
      // desaparecer y reaparecer la hoja entera por un paso atrás.
      if (accion === 'volver-a-lista') { onVolverRef.current?.(); return true; }
      sheetRef.current?.close();
      return true;
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 8: Verificar**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`
Expected: PASS todo.

- [ ] **Step 9: Commit**

```bash
git add oficios-cuba/mobile/app/\(tabs\)/explorar.tsx oficios-cuba/mobile/src/componentes/MapaExplorar.tsx oficios-cuba/mobile/src/componentes/HojaPunto.tsx oficios-cuba/mobile/src/lib/panelMapa.ts oficios-cuba/mobile/test/panelMapa.test.ts
git commit -m "$(cat <<'MSG'
Los «+N» del mapa de la app dejan de ser inalcanzables

Tocar un grupo pide su celda y abre la lista; elegir uno abre su ficha y Atrás
vuelve a la lista sin volver a pedirla. Es el agujero que la web cerró en
7ebae51: hasta ahora un pin que anunciaba «+4» mostraba uno y escondía cuatro.

Las transiciones viven en lib/panelMapa.ts, no dentro de un useState de la
pantalla: este proyecto no renderiza componentes en las pruebas, así que una
decisión escrita dentro del componente no se puede verificar.

Cambiar texto o categoría cierra la hoja también cuando lo abierto es una lista,
no solo una ficha: una lista pertenece a la búsqueda que la produjo igual de
fuerte que un punto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: El color del pin dice el tipo

**Files:**
- Modify: `oficios-cuba/mobile/src/componentes/MapaExplorar.tsx:58-88`

**Interfaces:**
- Consumes: `PIN_POR_TIPO` de `lib/pines.ts` (Tarea 5).
- Produces: nada nuevo; cierra la inconsistencia transitoria que dejó la Tarea 5.

Sin prueba automática: es color, y este proyecto no renderiza componentes. Se verifica mirándolo (paso 3) y los números de contraste están calculados en el spec, decisión 6.

- [ ] **Step 1: Quitar `COLOR_PIN` y adoptar el token**

Borrar el `const COLOR_PIN` indexado por `plan` (líneas 58-64) con todo su comentario, y añadir el import:

```tsx
import { PIN_POR_TIPO } from '../lib/pines';
```

Si tras borrarlo `brand` o `ink` quedan sin usar en el archivo, dejarlos solo si los usa algún estilo (los usa: `aroAprox`, `zonaDisco`, `insignia`). No tocar esos estilos.

- [ ] **Step 2: Usarlo en `Pin`**

```tsx
const Pin = memo(function Pin({ punto, onAbrir }: { punto: PuntoMapa; onAbrir(p: PuntoMapa): void }) {
  const { fondo, glifo } = PIN_POR_TIPO[punto.tipo];
  return (
    <Marker id={punto.id} lngLat={[punto.lng, punto.lat]} onPress={() => onAbrir(punto)}>
      <View style={e.pinEnvoltorio}>
        {punto.aproximado ? <View style={e.aroAprox} /> : null}
        <View style={[e.pin, { backgroundColor: fondo }]}>
          <Ionicons name={punto.tipo === 'negocio' ? 'storefront-outline' : 'construct-outline'} size={16} color={glifo} />
        </View>
        {punto.detras > 0 ? (
          <View style={e.insignia}>
            <Text style={e.insigniaTexto}>+{punto.detras}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});
```

- [ ] **Step 3: Verificar, y MIRARLO**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

En el emulador, con el mapa abierto: los pines de negocio son naranja fuerte con icono blanco y los de oficio naranja claro con icono oscuro. **Mirar la captura y comprobar que el icono oscuro se lee**; si no se lee, es un hallazgo que va a Dariel, no un ajuste a ojo.

- [ ] **Step 4: Commit**

```bash
git add oficios-cuba/mobile/src/componentes/MapaExplorar.tsx
git commit -m "$(cat <<'MSG'
El pin del mapa de la app deja de colorear por plan

Adopta PIN_POR_TIPO y borra COLOR_PIN, con lo que el mapa y la lista de celda
vuelven a decir lo mismo. Esto REVOCA a propósito la frase del commit a9d648f
(«NO se toca el color del pin por plan en el mapa: eso es el ranking de pago que
el producto sí quiere»): Dariel lo decidió el 2026-10-01 con la consecuencia
sobre la mesa. El ranking de pago deja de verse en el mapa de los dos clientes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: La gota del punto seleccionado

**Files:**
- Modify: `oficios-cuba/mobile/src/componentes/MapaExplorar.tsx`

**Interfaces:**
- Consumes: `PIN_POR_TIPO` de `lib/pines.ts` (Tarea 5), `seleccionadoId` (Tarea 6).
- Produces: nada que otra tarea use.

- [ ] **Step 1: Añadir el componente de la gota**

Junto a `Pin`:

```tsx
/**
 * El punto con su ficha abierta: deja de ser un círculo y pasa a gota, para decir «este soy yo» con
 * la misma forma que la marca usa para señalar un lugar.
 *
 * `anchor="bottom"` es lo que hace que la PUNTA caiga sobre la coordenada real; con el «center» por
 * defecto el punto parecería moverse al seleccionarlo. Verificado en los tipos de MapLibre RN.
 *
 * Dentro va el MISMO relleno y el mismo glifo de PIN_POR_TIPO, no una combinación nueva: así es el
 * pin normal con cola, el contraste ya está validado y no hay un segundo juego de colores que
 * mantener. (La gota de la web lleva un círculo blanco liso porque sus pines nunca llevaron icono.)
 */
const PinSeleccionado = memo(function PinSeleccionado({ punto, onAbrir }: { punto: PuntoMapa; onAbrir(p: PuntoMapa): void }) {
  const { fondo, glifo } = PIN_POR_TIPO[punto.tipo];
  return (
    <Marker id={punto.id} lngLat={[punto.lng, punto.lat]} anchor="bottom" onPress={() => onAbrir(punto)}>
      <View style={e.gotaEnvoltorio}>
        {/* La cola: un cuadrado rotado 45° con tres esquinas redondeadas, debajo del círculo y
            tapado a medias por él. Sin react-native-svg a propósito (ver el spec, decisión 4). */}
        <View style={[e.gotaCola, { backgroundColor: fondo }]} />
        <View style={[e.gotaCirculo, { backgroundColor: fondo }]}>
          <Ionicons name={punto.tipo === 'negocio' ? 'storefront-outline' : 'construct-outline'} size={18} color={glifo} />
        </View>
        {punto.detras > 0 ? (
          <View style={e.insigniaGota}>
            <Text style={e.insigniaTexto}>+{punto.detras}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});
```

- [ ] **Step 2: Añadir los estilos**

En el `StyleSheet.create` del final:

```tsx
  // 40 de círculo + 12 de cola visible. El envoltorio mide lo mismo que el dibujo para que
  // `anchor="bottom"` ponga la punta exactamente en la coordenada.
  gotaEnvoltorio: { width: 44, height: 52, alignItems: 'center' },
  gotaCirculo: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#ffffff', ...sombra.lift,
  },
  gotaCola: {
    position: 'absolute', top: 22, width: 20, height: 20,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderTopRightRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  insigniaGota: {
    position: 'absolute', top: -4, right: 0, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: ink[900], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: '#ffffff',
  },
```

- [ ] **Step 3: Elegir qué marcador se pinta**

En el `puntos.map`, la rama de selección va **antes** que la de modo zona: un punto con su ficha abierta se señala como seleccionado aunque sea aproximado, o al tocar un área no se vería qué se abrió.

```tsx
        {puntos.map((p) => {
          if (p.id === seleccionadoId) return <PinSeleccionado key={p.id} punto={p} onAbrir={abrir} />;
          // Los exactos siguen siendo pin: su punto sí es cierto y mezclarlos mentiría sobre los dos.
          return modoZona && p.aproximado
            ? <AreaZona key={p.id} punto={p} onAbrir={abrir} />
            : <Pin key={p.id} punto={p} onAbrir={abrir} />;
        })}
```

- [ ] **Step 4: Verificar, y MIRARLO**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

En el emulador: tocar un punto y comprobar que **ese** cambia a gota y los demás siguen círculos, que la punta queda donde estaba el centro del círculo (el punto no «salta» al seleccionarlo), y que la silueta se reconoce como la gota de la marca. Si la forma no se reconoce, anotarlo como el riesgo que el spec ya previó y llevarlo a Dariel — no instalar `react-native-svg` por iniciativa propia.

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/mobile/src/componentes/MapaExplorar.tsx
git commit -m "$(cat <<'MSG'
El punto con la ficha abierta se ve: pasa de círculo a gota

anchor="bottom" pone la PUNTA sobre la coordenada real; con el center por
defecto el punto parecería moverse al seleccionarlo.

Dibujada con Views (círculo + cuadrado rotado 45°), sin instalar
react-native-svg: meter un módulo nativo nuevo justo antes de un release es
riesgo que una silueta no justifica. Dentro va el mismo relleno y el mismo glifo
que el pin normal, así que el contraste ya está validado y no hay un segundo
juego de colores que mantener.

La rama del seleccionado va antes que la del modo zona: si no, al tocar un área
no se vería qué se abrió.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: El salto a donde sí hay resultados

**Files:**
- Modify: `oficios-cuba/mobile/src/componentes/MapaExplorar.tsx`

**Interfaces:**
- Consumes: `sugerencia` (Tarea 2).
- Produces: nada.

- [ ] **Step 1: Añadir el efecto del vuelo**

Junto a `alPresionarCercaDeMi`:

```tsx
  // La búsqueda no tiene nada en la zona visible pero sí en otra parte de Cuba (usarMapa ya lo
  // averiguó): el mapa va allá solo. Mismo zoom y duración que «Cerca de mí», por la misma razón:
  // ambos son «llévame a donde hay algo», uno por geolocalización y el otro por búsqueda.
  useEffect(() => {
    if (!sugerencia) return;
    // Igual que en «Cerca de mí»: el próximo cambio de región cuenta como zoom (recarga a los
    // 250 ms, no a los 500 del arrastre), porque este salto es tan deliberado como escribir.
    zoomAnterior.current = null;
    camaraRef.current?.flyTo({ center: [sugerencia.lng, sugerencia.lat], zoom: ZOOM_CERCA_DE_MI, duration: 600 });
  }, [sugerencia]);
```

`useEffect` ya está importado en la línea 1 junto a `useCallback`, `useRef` y `useState`. Si no, añadirlo.

- [ ] **Step 2: Verificar**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 3: Comprobarlo en el emulador**

Con el mapa en una zona sin resultados (por ejemplo acercado al mar al norte de La Habana), escribir en el buscador un término que exista en otra provincia. El mapa debe volar solo a donde hay algo y recargar al llegar.

Expected: el vuelo ocurre una sola vez por búsqueda. Si se repite en cada arrastre, es que `intentada` no está funcionando (Tarea 2).

- [ ] **Step 4: Commit**

```bash
git add oficios-cuba/mobile/src/componentes/MapaExplorar.tsx
git commit -m "$(cat <<'MSG'
Si la zona visible no tiene resultados, el mapa de la app salta a donde sí

Reacciona a la `sugerencia` de usarMapa con un flyTo del mismo zoom y la misma
duración que «Cerca de mí»: ambos son «llévame a donde hay algo», uno por
geolocalización y el otro por búsqueda.

Pone zoomAnterior en null antes de volar, igual que «Cerca de mí», para que el
cambio de región que viene cuente como zoom y recargue a los 250 ms en vez de
esperar los 500 del arrastre.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: Verificación del recorrido completo y cierre

**Files:**
- Modify: `oficios-cuba/STATUS.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada de código.

- [ ] **Step 1: Suite completa en verde**

Run: `cd oficios-cuba/mobile && npx tsc --noEmit && npx jest`
Expected: PASS, con el conteo de pruebas apuntado para el STATUS.

- [ ] **Step 2: Compilar la variante del emulador y recorrerla**

```bash
cd oficios-cuba/mobile/android && F=~/.claude/.oficio-firma && OFICIO_FIRMA_ALMACEN=$F/oficios-cuba.p12 \
  OFICIO_FIRMA_CLAVE="$(cat $F/clave.txt)" OFICIO_FIRMA_ALIAS=oficios \
  ./gradlew assembleRelease -q -PreactNativeArchitectures=x86_64
```

🚨 La release de verdad es **solo ARM** y el emulador x86_64 no la arranca (SoLoader). Esta variante es el MISMO código, solo para probar. No se publica nada en esta tarea.

Instalar y recorrer, **mirando las capturas** de cada paso:

1. Abrir Explorar → Mapa. Los pines de negocio son naranja fuerte con icono blanco; los de oficio naranja claro con icono oscuro.
2. Tocar un pin sin «+N» → su ficha. Atrás → cierra la hoja, sin salir de Explorar.
3. Tocar un pin con «+N» → la lista, con el título contado y las filas de «Zona» donde toque.
4. Elegir uno de la lista → su ficha, y **ese** pin pasa a gota con la punta donde estaba.
5. Atrás → **vuelve a la lista**, sin parpadeo de la hoja y sin volver a pedir la celda.
6. Atrás otra vez → cierra la hoja.
7. Escribir un término que no exista en la zona visible pero sí en otra provincia → el mapa vuela y recarga.
8. Cambiar de categoría con la lista abierta → la hoja se cierra.
9. **El umbral que distingue zoom de paneo.** `UMBRAL_ZOOM = 0.05` está anotado en el código como «valor empírico sin verificar en hardware real» porque se escribió sin emulador. Ahora hay: comprobar que un pinch-zoom cruza el umbral **siempre** (recarga a los 250 ms) y que la inercia de un arrastre **nunca** lo cruza sola (recarga a los 500 ms). Si falla en cualquiera de los dos sentidos, ajustar el valor ahí y decirlo en el STATUS; no dejarlo pasar porque «parece ir bien».

- [ ] **Step 3: Apagar el emulador y limpiar**

```bash
adb -s emulator-5556 emu kill
```
Borrar las capturas del scratchpad.

- [ ] **Step 4: Escribir la entrada de STATUS.md**

Al final de `oficios-cuba/STATUS.md`, con el formato de las existentes. Tiene que decir **explícitamente** que la 0.2.5 no está compilada ni publicada, qué queda pendiente de confirmar en un teléfono real, y que el sub-proyecto 2 sigue sin empezar.

```
## 2026-10-01 HH:MM — claude-code (vps2) — El mapa de la app alcanza a la web (sub-proyecto 1)
- Changes: <resumen + archivos>
- Tests: pass — app N/N (<los nuevos>); tsc limpio
- Security: sin cambios de superficie — mismos endpoints públicos, ninguno nuevo
- Pendiente de teléfono real: la gota del punto seleccionado y el contraste del glifo oscuro
  sobre brand[400]. El emulador dibuja por software y no reproduce fallos de GPU (precedente:
  Huawei P8 Lite, 29-sep).
- Next: sub-proyecto 2 (ficha, catálogo, reseñas, Compartir, portada, pantalla proveedor/[id]),
  y después compilar y publicar la 0.2.5.
- Blockers: ninguno. NO se ha compilado ni publicado ninguna APK.
```

- [ ] **Step 5: Commit**

```bash
git add oficios-cuba/STATUS.md
git commit -m "$(cat <<'MSG'
STATUS: el mapa de la app alcanza a la web (sub-proyecto 1 de la 0.2.5)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 6: Entregar a Dariel lo que necesita confirmar**

Decirle, sin adornos: qué se ve distinto en el mapa, que la gota y el glifo oscuro están pendientes de un teléfono real, y que **no hay APK nueva** — la 0.2.5 sale cuando esté el sub-proyecto 2.
