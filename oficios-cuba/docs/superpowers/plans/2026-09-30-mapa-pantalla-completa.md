# Mapa a pantalla completa — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: `superpowers:executing-plans` (ejecución nativa,
> ya decidida) o `superpowers:subagent-driven-development`. Los pasos usan casillas (`- [ ]`).

**Goal:** que `?vista=mapa` de `/explorar` sea una página de mapa a sangre bajo la cabecera, con los
controles flotando encima y la información de cada punto en un panel — lateral en escritorio, hoja
inferior colapsable en móvil — que también lista los negocios de un punto agrupado.

**Architecture:** la vista de mapa se extrae de `Search.tsx` a `ExplorarMapa.tsx`, dueño de su
layout y del estado del panel. El envoltorio del panel y su contenido se separan: `usarPanel.ts`
concentra la conducta compartida (historial, Esc, foco, scroll), `HojaPunto`/`PanelLateral` son los
dos envoltorios, y `FichaPunto`/`ListaCelda` los dos contenidos. La URL y la API no cambian.

**Tech Stack:** React 18, React Router 6, Leaflet + react-leaflet, Tailwind 3, lucide-react,
vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-30-mapa-pantalla-completa-design.md`

## Global Constraints

- **Solo frontend.** No se toca `backend/`, ni el esquema, ni `/api/mapa`, ni `/api/mapa/celda`.
- **Punto de corte del panel:** `lg` = **1024 px**. El mismo que ya usa la barra de filtros.
- **Punto de corte de la barra inferior:** `md` = **768 px** (`Layout.tsx` la declara `md:hidden` y
  reserva su hueco con `pb-20 md:pb-0`). **Son dos cortes distintos y no se pueden confundir:** entre
  768 y 1024 px no hay barra inferior pero tampoco hay panel lateral.
- **Alto de la región del mapa:** `calc(100dvh - 4rem)` (`4rem` = `h-16` de la cabecera); por debajo
  de `md`, además `- 5rem` por la barra inferior. `dvh` con respaldo a `vh` vía `@supports`.
- **Capas ya en uso, no inventar:** cabecera y barra inferior `z-40`; controles del mapa `z-[400]`;
  hoja y panel `z-[500]`.
- **Sin dependencias nuevas.**
- **Texto de la UI en español de Cuba, con tuteo.**
- **Conexión lenta como caso normal.** Lo que se pueda no pedir, no se pide.
- **`strict:false`:** el typecheck no delata una `async` llamada sin `await` ni una promesa sin
  `.catch`. Comprobarlo a mano en cada llamada que devuelva promesa.
- Comandos, siempre desde `oficios-cuba/frontend`: `npx vitest run`, `npx tsc --noEmit`,
  `npm run build`.

## Review Focus

Cinco modos de fallo que la spec implica y que ninguna tarea probaría por su cuenta. Cada uno lleva
su prueba a la tarea que posee el código.

1. **Cruzar 1024 px con el panel abierto** (rotar la tableta, redimensionar): el envoltorio cambia y
   el contenido no debe perderse ni quedarse el foco huérfano. → Tarea 3.
2. **Tocar otro marcador sin cerrar el panel:** no debe acumular una entrada de historial por cada
   punto; un solo Atrás tiene que salir del mapa. → Tarea 2.
3. **`100dvh` no soportado** (WebView de Android viejo, que es público real de esta app): sin
   respaldo, el alto se queda en `auto` y el mapa colapsa a 0 px. → Tarea 7.
4. **El bloqueo de scroll del cuerpo** que pone el panel: al cerrarse debe devolver el valor previo,
   no dejar `overflow: hidden` pegado a la página. → Tarea 1.
5. **Atrás con la lista de celda abierta:** ahora que la lista también empuja historial, Atrás debe
   cerrarla, no sacar al usuario de `/explorar`. → Tarea 4.

---

## Estructura de ficheros

Todo bajo `frontend/src/`.

| Fichero | Responsabilidad | Estado |
|---|---|---|
| `components/mapa/usarPanel.ts` | Conducta compartida de los dos envoltorios: entrada de historial, `popstate`, Esc, trampa de foco y devolución, bloqueo de scroll | **Nuevo** |
| `components/mapa/HojaPunto.tsx` | Envoltorio móvil: arrastre, dos alturas, `--hoja-punto-alto` | Modificado (pierde el contenido) |
| `components/mapa/PanelLateral.tsx` | Envoltorio de escritorio: panel izquierdo fijo, sin arrastre | **Nuevo** |
| `components/mapa/FichaPunto.tsx` | Contenido de la ficha: cabecera del punto, enlace al perfil, y el perfil completo con contacto | **Nuevo** (extraído) |
| `components/mapa/ListaCelda.tsx` | Contenido: lista de los negocios de una celda | Modificado (pierde envoltorio) |
| `components/mapa/PanelMapa.tsx` | Elige envoltorio por ancho y contenido por estado; genera el `tituloId`; gestiona «volver a la lista» | **Nuevo** |
| `components/mapa/ControlesMapa.tsx` | Barra flotante: buscador, pestañas, botón ⚙ | **Nuevo** |
| `components/mapa/ExplorarMapa.tsx` | Layout a sangre y estado del panel | **Nuevo** |
| `components/mapa/MapaExplorar.tsx` | Leaflet y marcadores | Modificado |
| `pages/Search.tsx` | Estado de URL + vista de lista | Modificado |
| `index.css` | Clase `.region-mapa` con el alto y su respaldo | Modificado |

### Interfaces (las firmas exactas que las tareas se pasan entre sí)

```ts
// usarPanel.ts
export function usarPanel(opciones: {
  /** Clave de apertura: null = cerrado. Cambiarla de valor (no de/a null) NO empuja historial. */
  abierta: string | null;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
  /** El nodo del panel, para la trampa de foco. */
  contenedorRef: React.RefObject<HTMLElement>;
}): {
  /** Cierra pasando por el historial si hay entrada propia. Es lo que llaman la X y Esc. */
  cerrar(): void;
  /** Quita la entrada propia sin navegar. Se llama antes de navegar a otra ruta. */
  limpiarEntradaPropia(): void;
};

// Firma COMÚN de los dos envoltorios. PanelMapa elige uno u otro sin cambiar nada más.
export type PropsEnvoltorio = {
  abierta: string | null;
  tituloId: string;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
  children: (estado: {
    /** true = hay sitio y toca pedir/mostrar los datos caros. */
    expandida: boolean;
    onAntesDeNavegar(): void;
  }) => React.ReactNode;
};

// FichaPunto.tsx
export default function FichaPunto(props: {
  punto: PuntoMapa;
  tituloId: string;
  expandida: boolean;
  onCerrar(): void;
  onAntesDeNavegar(): void;
  /** Ausente = no se llegó desde una lista. Presente = pinta «← Volver a la lista». */
  onVolverALista?: () => void;
}): JSX.Element;

// ListaCelda.tsx
export default function ListaCelda(props: {
  puntos: PuntoMapa[];
  tituloId: string;
  onElegir(p: PuntoMapa): void;
  onCerrar(): void;
  /** Mensaje de error si la celda no se pudo cargar; con él se pinta «Reintentar». */
  error?: string;
  onReintentar?: () => void;
}): JSX.Element;

// PanelMapa.tsx
export default function PanelMapa(props: {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  errorLista?: string;
  onReintentarLista?: () => void;
  onElegirDeLista(p: PuntoMapa): void;
  onVolverALista?: () => void;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
}): JSX.Element | null;

// ControlesMapa.tsx
export default function ControlesMapa(props: {
  q: string;
  tab: string;
  category: string;
  categorias: Category[];
  onBuscar(q: string): void;
  onCambiar(patch: Record<string, string | null>): void;
}): JSX.Element;

// ExplorarMapa.tsx
export default function ExplorarMapa(props: {
  get(k: string): string;
  update(patch: Record<string, string | null>): void;
  categorias: Category[];
}): JSX.Element;

// MapaExplorar.tsx — prop NUEVA, el resto igual
//   alMapa?: (m: import('leaflet').Map) => void   // se llama una vez, al montar
```

---

### Task 1: `usarPanel.ts` — extraer la conducta compartida del panel

Sacar de `HojaPunto.tsx` lo que los dos envoltorios necesitan igual, **sin cambiar ninguna
conducta**: las 9 pruebas actuales de `HojaPunto.test.tsx` siguen pasando sin tocarlas.

**Files:**
- Create: `frontend/src/components/mapa/usarPanel.ts`
- Modify: `frontend/src/components/mapa/HojaPunto.tsx` (quita los efectos de historial, popstate,
  Esc, foco y scroll; llama a `usarPanel`)
- Test: `frontend/src/components/mapa/HojaPunto.test.tsx` (sin cambios; es la red)

**Interfaces:**
- Consumes: nada.
- Produces: `usarPanel(...)` con la firma de arriba.

- [ ] **Paso 1: prueba del punto 4 del Review Focus (el scroll del cuerpo)**

Añadir a `HojaPunto.test.tsx`, dentro del `describe('HojaPunto')`:

```tsx
it('bloquea el scroll del cuerpo mientras está abierta y devuelve el valor previo al cerrar', () => {
  document.body.style.overflow = 'scroll';
  const { rerender } = montar();
  expect(document.body.style.overflow).toBe('hidden');
  rerender(createElement(MemoryRouter, null, createElement(HojaPunto, { punto: null, onCerrar: vi.fn() })));
  expect(document.body.style.overflow).toBe('scroll');
});
```

- [ ] **Paso 2: correr y ver que pasa ya**

`cd frontend && npx vitest run src/components/mapa/HojaPunto.test.tsx`
Esperado: PASA (la conducta ya existe; la prueba la fija antes de moverla).

- [ ] **Paso 3: crear `usarPanel.ts`**

Mover **literalmente** desde `HojaPunto.tsx` estos bloques, sin reescribirlos: `cerrar`
(líneas ~72-79), `limpiarEntradaPropia` (~84-90), el efecto de la entrada de historial (~95-105),
el efecto de limpieza al desmontar (~109), el de `popstate` (~120-127), el de devolución del foco
(~132-138), el de Esc (~141-148), el de bloqueo de scroll (~151-157) y la trampa de foco
(~160-181). Las refs que usan (`onCerrarRef`, `elementoAlAbrirRef`, `historiaEmpujadaRef`,
`habiaPuntoRef`, `teniaPuntoParaFocoRef`) se van con ellos.

Cambio de nombres, y solo eso: donde decía `punto` (el objeto) ahora se lee `abierta` (la clave
`string | null`), y `punto?.id` pasa a ser `abierta`. El efecto de la trampa de foco depende de
`[abierta]`, igual que antes dependía de `[punto?.id]`.

```ts
import { useCallback, useEffect, useRef } from 'react';

export function usarPanel({ abierta, onCerrar, focoOrigen, contenedorRef }: {
  abierta: string | null;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
  contenedorRef: React.RefObject<HTMLElement>;
}) {
  // …los bloques movidos, con `abierta` donde había `punto`…
  return { cerrar, limpiarEntradaPropia };
}
```

- [ ] **Paso 4: `HojaPunto.tsx` pasa a usarlo**

Borrar de `HojaPunto.tsx` los bloques movidos y poner, tras los `useState`:

```tsx
const { cerrar, limpiarEntradaPropia } = usarPanel({
  abierta: punto?.id ?? null,
  onCerrar,
  focoOrigen,
  contenedorRef: sheetRef,
});
```

Se quedan en `HojaPunto`: el arrastre, `posicion`, los cálculos de altura, la variable
`--hoja-punto-alto`, y la carga del perfil (esa se va en la Tarea 2).

- [ ] **Paso 5: las 10 pruebas siguen en verde**

`npx vitest run src/components/mapa/HojaPunto.test.tsx` → 10 pasando (9 + la nueva).
`npx tsc --noEmit` → 0 errores.

- [ ] **Paso 6: commit**

```bash
git add frontend/src/components/mapa/usarPanel.ts frontend/src/components/mapa/HojaPunto.tsx frontend/src/components/mapa/HojaPunto.test.tsx
git commit -m "Extrae usarPanel: historial, Esc, foco y scroll del panel, sin cambiar conducta"
```

---

### Task 2: `FichaPunto.tsx` — separar el contenido del envoltorio

**Files:**
- Create: `frontend/src/components/mapa/FichaPunto.tsx`
- Create: `frontend/src/components/mapa/PanelMapa.tsx` (versión mínima: solo hoja + ficha)
- Modify: `frontend/src/components/mapa/HojaPunto.tsx` (pasa a `children` como render-prop)
- Rename: `HojaPunto.test.tsx` → `PanelMapa.test.tsx` (con `git mv`, para conservar la historia)

**Interfaces:**
- Consumes: `usarPanel` (Tarea 1).
- Produces: `FichaPunto`, `PanelMapa` y la firma `PropsEnvoltorio` que la Tarea 3 replica.

- [ ] **Paso 1: prueba del punto 2 del Review Focus (historial que se acumula)**

```tsx
it('abrir otro punto sin cerrar no añade una segunda entrada de historial', () => {
  const onCerrar = vi.fn();
  const largoInicial = window.history.length;
  const { rerender } = render(
    createElement(MemoryRouter, null, createElement(PanelMapa, { punto, lista: null, onElegirDeLista: vi.fn(), onCerrar })),
  );
  const otro = { ...punto, id: 'p2', nombre: 'Otro' };
  rerender(
    createElement(MemoryRouter, null, createElement(PanelMapa, { punto: otro, lista: null, onElegirDeLista: vi.fn(), onCerrar })),
  );
  expect(window.history.length - largoInicial).toBe(1);
  window.history.back();
  await waitFor(() => expect(onCerrar).toHaveBeenCalled());
});
```

(El `it` es `async` por el `await waitFor`.)

- [ ] **Paso 2: correr y ver que falla**

`npx vitest run src/components/mapa/PanelMapa.test.tsx`
Esperado: FALLA con «Cannot find module './PanelMapa'».

- [ ] **Paso 3: crear `FichaPunto.tsx`**

Mover a este fichero, **verbatim**, el JSX de `HojaPunto.tsx:305-370` (desde `<div className="flex
items-start gap-3">` hasta el cierre del bloque de `posicion === 'abierta'`) y, con él, el efecto de
carga del perfil (`HojaPunto.tsx:184-208`) con sus estados `perfil`, `cargandoPerfil`, `errorPerfil`
y `reintentos`, y las tres constantes derivadas `telefonoContacto`, `mostrarWhatsapp`,
`mostrarLlamar` y `lugar` (`HojaPunto.tsx:~265-268`).

Tres sustituciones, y solo tres:
- `posicion === 'abierta'` → `expandida`
- `cerrar` (el botón X) → `onCerrar`
- `limpiarEntradaPropia` (el enlace «Ver perfil completo») → `onAntesDeNavegar`

Y una añadidura, arriba del todo del contenido:

```tsx
{onVolverALista && (
  <button type="button" onClick={onVolverALista} className="btn-ghost btn-sm -ml-2 mb-2 text-sm">
    ← Volver a la lista
  </button>
)}
```

El `<h2>` conserva `id={tituloId}`, que ahora llega por props en vez de por `useId()` local.

- [ ] **Paso 4: `HojaPunto.tsx` pasa a render-prop**

Su firma queda como `PropsEnvoltorio`. Donde estaba el contenido, ahora:

```tsx
<div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
  {children({ expandida: posicion === 'abierta', onAntesDeNavegar: limpiarEntradaPropia })}
</div>
```

`punto` desaparece de sus props (llega `abierta: string | null`), y con él el `if (!punto) return
null` pasa a `if (!abierta) return null`.

- [ ] **Paso 5: crear `PanelMapa.tsx` (mínimo, solo móvil por ahora)**

```tsx
import { useId } from 'react';
import HojaPunto from './HojaPunto';
import FichaPunto from './FichaPunto';
import type { PuntoMapa } from '../../types';

export default function PanelMapa({ punto, onCerrar, focoOrigen }: {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  onElegirDeLista(p: PuntoMapa): void;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
}) {
  const tituloId = useId();
  if (!punto) return null;
  return (
    <HojaPunto abierta={punto.id} tituloId={tituloId} onCerrar={onCerrar} focoOrigen={focoOrigen}>
      {({ expandida, onAntesDeNavegar }) => (
        <FichaPunto punto={punto} tituloId={tituloId} expandida={expandida}
          onCerrar={onCerrar} onAntesDeNavegar={onAntesDeNavegar} />
      )}
    </HojaPunto>
  );
}
```

- [ ] **Paso 6: adaptar el fichero de pruebas**

`git mv frontend/src/components/mapa/HojaPunto.test.tsx frontend/src/components/mapa/PanelMapa.test.tsx`.
Cambiar el `import HojaPunto from './HojaPunto'` por `import PanelMapa from './PanelMapa'`, el
`describe('HojaPunto')` por `describe('PanelMapa — hoja móvil')`, y `montar()` para que renderice
`PanelMapa` con `punto`. **Las aserciones de las 10 pruebas no se tocan:** siguen comprobando Esc,
historial, Atrás, el enlace que limpia la entrada, la trampa de foco, `--hoja-punto-alto`, el
registro del contacto y el reintento del perfil. Si alguna deja de pasar, es que la extracción
cambió conducta.

- [ ] **Paso 7: verde**

`npx vitest run` → 24 pruebas (23 + la nueva de historial). `npx tsc --noEmit` → 0.

- [ ] **Paso 8: commit**

```bash
git add -A frontend/src/components/mapa
git commit -m "Separa FichaPunto del envoltorio: la hoja pasa a recibir children"
```

---

### Task 3: `PanelLateral.tsx` y la elección por ancho

**Files:**
- Create: `frontend/src/components/mapa/PanelLateral.tsx`
- Modify: `frontend/src/components/mapa/PanelMapa.tsx`
- Test: `frontend/src/components/mapa/PanelMapa.test.tsx`

**Interfaces:**
- Consumes: `usarPanel`, `PropsEnvoltorio`, `FichaPunto`.
- Produces: `PanelLateral`; `PanelMapa` ya decide envoltorio.

- [ ] **Paso 1: helper de `matchMedia` para jsdom, al principio del fichero de pruebas**

jsdom no implementa `matchMedia`: sin esto, `PanelMapa` reventaría en cuanto lo llame. Es el mismo
tipo de hueco que el fichero ya documenta para `offsetParent`.

```tsx
function fijarAncho(px: number) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (consulta: string) => ({
      matches: px >= 1024 && consulta.includes('1024'),
      media: consulta,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }),
  });
}
```

Llamar `fijarAncho(390)` en el `beforeEach` existente, para que las pruebas de la hoja sigan
describiendo móvil.

- [ ] **Paso 2: las dos pruebas nuevas**

```tsx
describe('PanelMapa — elección de envoltorio', () => {
  it('a partir de 1024 px monta el panel lateral, no la hoja', () => {
    fijarAncho(1280);
    montar();
    expect(screen.getByTestId('panel-lateral')).toBeTruthy();
    expect(screen.queryByLabelText(/Ver la ficha completa|Recoger la ficha/)).toBeNull();
  });

  it('por debajo de 1024 px monta la hoja, con su asa', () => {
    fijarAncho(390);
    montar();
    expect(screen.queryByTestId('panel-lateral')).toBeNull();
    expect(screen.getByLabelText(/Ver la ficha completa|Recoger la ficha/)).toBeTruthy();
  });

  // Review Focus #1
  it('cruzar el corte con el panel abierto conserva el contenido', () => {
    fijarAncho(390);
    const { rerender } = montar();
    expect(screen.getByText('Juan Plomero')).toBeTruthy();
    fijarAncho(1280);
    window.dispatchEvent(new Event('resize'));
    rerender(createElement(MemoryRouter, null, createElement(PanelMapa, { punto, lista: null, onElegirDeLista: vi.fn(), onCerrar: vi.fn() })));
    expect(screen.getByText('Juan Plomero')).toBeTruthy();
  });
});
```

- [ ] **Paso 3: correr y ver que fallan**

Esperado: FALLA — no existe `panel-lateral`.

- [ ] **Paso 4: `PanelLateral.tsx`**

```tsx
import { useRef } from 'react';
import { usarPanel } from './usarPanel';
import type { PropsEnvoltorio } from './usarPanel';

export default function PanelLateral({ abierta, tituloId, onCerrar, focoOrigen, children }: PropsEnvoltorio) {
  const ref = useRef<HTMLDivElement>(null);
  const { cerrar, limpiarEntradaPropia } = usarPanel({ abierta, onCerrar, focoOrigen, contenedorRef: ref });
  if (!abierta) return null;
  return (
    // Izquierda y con tope de alto: el mapa sigue recibiendo toques a su derecha. La anchura
    // (ANCHO_PANEL_PX de la Tarea 7) es la misma que usa el paneo para saber qué tapa.
    <div
      ref={ref}
      data-testid="panel-lateral"
      role="dialog"
      aria-modal="false"
      aria-labelledby={tituloId}
      tabIndex={-1}
      className="absolute bottom-4 left-4 top-4 z-[500] flex w-[22rem] flex-col overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-lift outline-none"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {children({ expandida: true, onAntesDeNavegar: limpiarEntradaPropia })}
      </div>
    </div>
  );
}
```

`aria-modal="false"`: el mapa a su lado sigue siendo usable, a diferencia de la hoja móvil, que sí
lo tapa. Decirlo `true` mentiría a un lector de pantalla.

- [ ] **Paso 5: `PanelMapa` elige**

```tsx
const esEscritorio = usarEsEscritorio();
const Envoltorio = esEscritorio ? PanelLateral : HojaPunto;
```

con el hook al final de `usarPanel.ts`:

```ts
export function usarEsEscritorio() {
  const [esc, setEsc] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches === true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const alCambiar = () => setEsc(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return esc;
}
```

- [ ] **Paso 6: verde** — `npx vitest run` → 27. `npx tsc --noEmit` → 0.

- [ ] **Paso 7: commit**

```bash
git add -A frontend/src/components/mapa
git commit -m "Panel lateral en escritorio; la hoja se queda para movil"
```

---

### Task 4: la lista de celda dentro del panel, con vuelta atrás

**Files:**
- Modify: `frontend/src/components/mapa/ListaCelda.tsx` (pierde su envoltorio fijo)
- Modify: `frontend/src/components/mapa/PanelMapa.tsx`
- Test: `frontend/src/components/mapa/PanelMapa.test.tsx`

**Interfaces:**
- Consumes: `PropsEnvoltorio`, `FichaPunto`, `ListaCelda`.
- Produces: `PanelMapa` con `lista`, `onElegirDeLista`, `onVolverALista`, `errorLista`.

- [ ] **Paso 1: pruebas**

```tsx
describe('PanelMapa — lista de celda', () => {
  const dos: PuntoMapa[] = [punto, { ...punto, id: 'p2', nombre: 'Otro Negocio' }];

  it('elegir uno de la lista muestra su ficha, y «Volver a la lista» la devuelve sin pedirla otra vez', async () => {
    fijarAncho(1280);
    function Anfitrion() {
      const [lista, setLista] = useState<PuntoMapa[] | null>(dos);
      const [p, setP] = useState<PuntoMapa | null>(null);
      return createElement(PanelMapa, {
        punto: p, lista,
        onElegirDeLista: (x: PuntoMapa) => { setP(x); setLista(null); },
        onVolverALista: () => { setP(null); setLista(dos); },
        onCerrar: vi.fn(),
      });
    }
    render(createElement(MemoryRouter, null, createElement(Anfitrion)));
    fireEvent.click(screen.getByText('Otro Negocio'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Otro Negocio' })).toBeTruthy());
    fireEvent.click(screen.getByText(/Volver a la lista/));
    await waitFor(() => expect(screen.getByText('Juan Plomero')).toBeTruthy());
  });

  // Review Focus #5
  it('Atrás con la lista abierta la cierra en vez de salir de Explorar', async () => {
    fijarAncho(390);
    const onCerrar = vi.fn();
    render(createElement(MemoryRouter, null,
      createElement(PanelMapa, { punto: null, lista: dos, onElegirDeLista: vi.fn(), onCerrar })));
    window.history.back();
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });

  it('si la celda falló, la lista enseña el error y «Reintentar»', () => {
    fijarAncho(390);
    const onReintentar = vi.fn();
    render(createElement(MemoryRouter, null, createElement(PanelMapa, {
      punto: null, lista: [], errorLista: 'No pudimos cargar esta zona.',
      onReintentarLista: onReintentar, onElegirDeLista: vi.fn(), onCerrar: vi.fn(),
    })));
    expect(screen.getByText('No pudimos cargar esta zona.')).toBeTruthy();
    fireEvent.click(screen.getByText('Reintentar'));
    expect(onReintentar).toHaveBeenCalled();
  });
});
```

- [ ] **Paso 2: correr y ver que fallan.**

- [ ] **Paso 3: `ListaCelda` pierde el envoltorio**

Quitar el `<div className="fixed inset-x-0 bottom-0 z-[500] …">` exterior y el `useEffect` de Esc
y foco (ahora los pone `usarPanel`). Queda la cabecera con el título —que pasa a llevar
`id={tituloId}`— y el `<ul>`. `puntos` deja de aceptar `null` (el envoltorio ya decide si se pinta).
Añadir, antes del `<ul>`, el bloque de error:

```tsx
{error && (
  <div className="px-4 py-3 text-sm text-red-700" role="alert">
    {error}{' '}
    <button type="button" onClick={onReintentar} className="underline decoration-2 underline-offset-2">Reintentar</button>
  </div>
)}
```

Y quitar los `max-h-[70vh]`: el alto lo manda ahora el envoltorio.

- [ ] **Paso 4: `PanelMapa` decide contenido**

```tsx
const abierta = punto ? `punto:${punto.id}` : lista ? 'lista' : null;
// …
<Envoltorio abierta={abierta} tituloId={tituloId} onCerrar={onCerrar} focoOrigen={focoOrigen}>
  {({ expandida, onAntesDeNavegar }) => (punto ? (
    <FichaPunto punto={punto} tituloId={tituloId} expandida={expandida}
      onCerrar={onCerrar} onAntesDeNavegar={onAntesDeNavegar} onVolverALista={onVolverALista} />
  ) : (
    <ListaCelda puntos={lista ?? []} tituloId={tituloId} onElegir={onElegirDeLista}
      onCerrar={onCerrar} error={errorLista} onReintentar={onReintentarLista} />
  ))}
</Envoltorio>
```

La clave `abierta` distingue `punto:` de `lista`, así que pasar de lista a ficha **no** empuja una
entrada nueva: es el mismo panel cambiando de contenido.

- [ ] **Paso 5: verde** — `npx vitest run` → 30. `npx tsc --noEmit` → 0.

- [ ] **Paso 6: commit**

```bash
git add -A frontend/src/components/mapa
git commit -m "La lista de celda vive en el panel, con vuelta atras y su error"
```

---

### Task 5: `ControlesMapa.tsx` — la barra flotante

**Files:**
- Create: `frontend/src/components/mapa/ControlesMapa.tsx`
- Test: `frontend/src/components/mapa/ControlesMapa.test.tsx`

**Interfaces:**
- Consumes: el tipo `Category` de `../../types`.
- Produces: `ControlesMapa` con la firma de arriba.

- [ ] **Paso 1: prueba**

```tsx
it('buscar envía el texto solo al enviar el formulario, no en cada tecla', () => {
  const onBuscar = vi.fn();
  render(createElement(ControlesMapa, {
    q: '', tab: 'servicios', category: '', categorias: [],
    onBuscar, onCambiar: vi.fn(),
  }));
  const campo = screen.getByRole('searchbox');
  fireEvent.change(campo, { target: { value: 'plomero' } });
  expect(onBuscar).not.toHaveBeenCalled();
  fireEvent.submit(campo.closest('form')!);
  expect(onBuscar).toHaveBeenCalledWith('plomero');
});

it('cambiar de pestaña avisa con el valor nuevo', () => {
  const onCambiar = vi.fn();
  render(createElement(ControlesMapa, {
    q: '', tab: 'servicios', category: '', categorias: [], onBuscar: vi.fn(), onCambiar,
  }));
  fireEvent.click(screen.getByRole('tab', { name: /Negocios/ }));
  expect(onCambiar).toHaveBeenCalledWith({ tab: 'negocios' });
});
```

- [ ] **Paso 2: correr y ver que falla.**

- [ ] **Paso 3: implementar**

Una barra `absolute inset-x-0 top-0 z-[400] p-3` con `pointer-events-none` en el contenedor y
`pointer-events-auto` en la tarjeta, para que el mapa siga recibiendo arrastres a los lados. Dentro,
una tarjeta blanca `rounded-2xl shadow-card` con:

1. `<form>` con `<input type="search">` (el mismo `placeholder` por pestaña que usa `Search.tsx`) y
   botón «Buscar». Estado local `texto`, que se envía en `onSubmit`. **No buscar al teclear:** en
   una conexión lenta cada tecla sería una consulta al mapa.
2. Las tres pestañas, con `role="tablist"` y `aria-selected`, copiando el patrón exacto de
   `Search.tsx:436-447` (`inline-grid grid-cols-3 gap-1 rounded-2xl bg-sand-100 p-1`).
3. Un `<details>` con resumen ⚙ «Filtros» que contiene el `<select>` de categoría y un enlace
   «Ver en lista» que llama `onCambiar({ vista: null })`.

**El `tab` se envía sin el caso especial de `Search.tsx`** (allí `servicios` se manda como `null`
para no ensuciar la URL): aquí `onCambiar` recibe el valor literal y quien lo consume (Tarea 7)
decide. La prueba de arriba lo fija.

- [ ] **Paso 4: verde.** — [ ] **Paso 5: commit**

```bash
git add -A frontend/src/components/mapa
git commit -m "Controles flotantes del mapa: buscador, pestanas y filtros"
```

---

### Task 6: ajustes en `MapaExplorar.tsx`

**Files:**
- Modify: `frontend/src/components/mapa/MapaExplorar.tsx`
- Modify: `frontend/src/components/mapa/usarMapa.ts` (`cargarCelda` deja de tragarse los errores)
- Test: `frontend/src/components/mapa/usarMapa.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `MapaExplorar` con la prop nueva `alMapa?: (m: LeafletMap) => void`; `onAbrirLista`
  pasa a recibir `(puntos: PuntoMapa[], error?: string)`.

- [ ] **Paso 1: prueba del error de celda (Review Focus del spec)**

En `usarMapa.test.ts`:

```ts
it('si /mapa/celda falla, cargarCelda rechaza y MapaExplorar abre la lista con el error', async () => {
  vi.mocked(mapaApi.celda).mockRejectedValue(new Error('red caída'));
  const onAbrirLista = vi.fn();
  // …montar MapaExplorar con un punto de detras>0 y pulsar su marcador…
  await waitFor(() => expect(onAbrirLista).toHaveBeenCalledWith([], expect.stringContaining('No pudimos')));
});
```

- [ ] **Paso 2: correr y ver que falla** (hoy es un rechazo no capturado: `onAbrirLista` no se llama).

- [ ] **Paso 3: capturar el error donde se usa**

En `MapaExplorar.tsx`, el `abrir`:

```tsx
const abrir = useCallback((p: PuntoMapa) => {
  if (p.detras > 0) {
    mapa.cargarCelda(p.cy, p.cx)
      .then((lista) => onAbrirLista(lista.length ? lista : [p]))
      // Sin esto, un fallo de red deja al usuario tocando un grupo sin que pase NADA:
      // ni panel, ni mensaje. En la conexión que esta app apunta a servir, eso no es raro.
      .catch(() => onAbrirLista([], 'No pudimos cargar los negocios de esta zona.'));
  } else onAbrir(p);
}, [mapa, onAbrir, onAbrirLista]);
```

- [ ] **Paso 4: los otros tres ajustes**

1. Quitar `rounded-2xl border border-sand-200` del contenedor: ya no es una caja.
2. Los avisos (`Cargando…`, error, `Hay más negocios aquí`) pasan de `top-3` a `top-28`, por debajo
   de la barra flotante.
3. «Cerca de mí» deja de quedar tapado por la hoja — el contrato que `HojaPunto.tsx` dejó escrito y
   que nunca se cumplió:

```tsx
className="btn-secondary btn-sm absolute right-3 z-[400] shadow-card"
style={{ bottom: 'calc(var(--hoja-punto-alto, 0px) + 12px)' }}
```

4. Prop nueva, para que la Tarea 7 pueda panear:

```tsx
<MapContainer ref={(m) => { mapRef.current = m; if (m) alMapa?.(m); }} …>
```

- [ ] **Paso 5: prueba del botón recolocado**

```tsx
it('«Cerca de mí» se coloca por encima de la hoja leyendo --hoja-punto-alto', () => {
  // …montar MapaExplorar…
  const boton = screen.getByRole('button', { name: /Cerca de mí/ });
  expect(boton.style.bottom).toContain('--hoja-punto-alto');
});
```

- [ ] **Paso 6: verde.** — [ ] **Paso 7: commit**

```bash
git add -A frontend/src/components/mapa
git commit -m "El mapa deja de ser una caja; el fallo de celda deja de ser silencio"
```

---

### Task 7: `ExplorarMapa.tsx` — el layout a sangre y el estado

**Files:**
- Create: `frontend/src/components/mapa/ExplorarMapa.tsx`
- Modify: `frontend/src/index.css` (clase `.region-mapa`)
- Test: `frontend/src/components/mapa/ExplorarMapa.test.tsx`

**Interfaces:**
- Consumes: `ControlesMapa`, `MapaExplorar` (con `alMapa`), `PanelMapa`.
- Produces: `ExplorarMapa({ get, update, categorias })`, y la constante
  `export const ANCHO_PANEL_PX = 352;` (22 rem, el `w-[22rem]` de `PanelLateral`).

- [ ] **Paso 1: la clase del alto, con su respaldo (Review Focus #3)**

En `index.css`:

```css
/* El alto del mapa a sangre. `dvh` es lo correcto —con `vh` la barra del navegador móvil tapa
   la franja de abajo, justo donde vive la hoja—, pero no está en los WebView de Android viejos,
   que sí son público de esta app: sin el respaldo en `vh` el alto se queda en `auto` y el mapa
   colapsa a 0 px. El 4rem es la cabecera (h-16); el 5rem, el pb-20 que Layout reserva para la
   barra inferior, que solo existe por debajo de `md` (768px). */
.region-mapa { height: calc(100vh - 4rem - 5rem); }
@supports (height: 100dvh) { .region-mapa { height: calc(100dvh - 4rem - 5rem); } }
@media (min-width: 768px) {
  .region-mapa { height: calc(100vh - 4rem); }
  @supports (height: 100dvh) { .region-mapa { height: calc(100dvh - 4rem); } }
}
```

- [ ] **Paso 2: pruebas**

```tsx
it('cambiar de pestaña con el panel abierto lo cierra', async () => {
  fijarAncho(1280);
  // …montar ExplorarMapa, abrir un punto (click en su marcador)…
  expect(screen.getByTestId('panel-lateral')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: /Negocios/ }));
  await waitFor(() => expect(screen.queryByTestId('panel-lateral')).toBeNull());
});

it('un punto bajo el panel provoca un panBy; uno ya visible, ninguno', async () => {
  fijarAncho(1280);
  const panBy = vi.fn();
  // …montar con un mapa falso cuyo latLngToContainerPoint devuelva x=100 (bajo el panel)…
  await waitFor(() => expect(panBy).toHaveBeenCalledWith([expect.any(Number), 0], { animate: true }));
  expect(panBy.mock.calls[0][0][0]).toBeLessThan(0); // desplaza el mapa a la izquierda para
                                                     // que el punto se mueva a la derecha
});

it('la región del mapa no hace scroll de página', () => {
  const { container } = render(/* … */);
  expect(container.querySelector('.region-mapa')).toBeTruthy();
  expect(container.querySelector('.region-mapa')!.className).toContain('overflow-hidden');
});
```

- [ ] **Paso 3: correr y ver que fallan.**

- [ ] **Paso 4: implementar**

```tsx
export const ANCHO_PANEL_PX = 352; // w-[22rem] de PanelLateral

export default function ExplorarMapa({ get, update, categorias }: { /* … */ }) {
  const [punto, setPunto] = useState<PuntoMapa | null>(null);
  const [lista, setLista] = useState<PuntoMapa[] | null>(null);
  const [listaPrevia, setListaPrevia] = useState<PuntoMapa[] | null>(null);
  const [errorLista, setErrorLista] = useState('');
  const mapRef = useRef<LeafletMap | null>(null);
  const esEscritorio = usarEsEscritorio();

  const tab = get('tab') || 'servicios';

  // Cambiar de pestaña o de categoría cierra el panel: el punto abierto puede no pertenecer
  // a la pestaña nueva, y dejarlo ahí mostraría algo que ya no está en el mapa.
  useEffect(() => { setPunto(null); setLista(null); setListaPrevia(null); }, [tab, get('category')]);

  // Saca el punto de debajo del panel. panBy y NO flyTo/setZoom: cambiar el zoom cambia el
  // tamaño de celda que calcula el servidor, y el punto recién tocado podría reagruparse.
  const apartarDelPanel = useCallback((p: PuntoMapa) => {
    const m = mapRef.current;
    if (!m || !esEscritorio) return;
    const pt = m.latLngToContainerPoint([p.lat, p.lng]);
    const margen = ANCHO_PANEL_PX + 32;
    if (pt.x < margen) m.panBy([pt.x - margen, 0], { animate: true });
  }, [esEscritorio]);

  const abrirPunto = useCallback((p: PuntoMapa) => {
    setLista(null); setErrorLista(''); setPunto(p); apartarDelPanel(p);
  }, [apartarDelPanel]);

  const abrirLista = useCallback((ps: PuntoMapa[], error?: string) => {
    setPunto(null); setListaPrevia(null); setErrorLista(error ?? ''); setLista(ps);
  }, []);

  const elegirDeLista = useCallback((p: PuntoMapa) => {
    setListaPrevia(lista); setLista(null); setPunto(p); apartarDelPanel(p);
  }, [lista, apartarDelPanel]);

  const volverALista = useCallback(() => {
    setPunto(null); setLista(listaPrevia); setListaPrevia(null);
  }, [listaPrevia]);

  return (
    <div className="region-mapa relative w-full overflow-hidden">
      <Suspense fallback={<PageLoader />}>
        <MapaExplorar tab={tab} q={get('q')} category={get('category')}
          alMapa={(m) => { mapRef.current = m; }}
          onAbrir={abrirPunto} onAbrirLista={abrirLista} />
      </Suspense>
      <ControlesMapa q={get('q')} tab={tab} category={get('category')} categorias={categorias}
        onBuscar={(q) => update({ q: q || null })}
        onCambiar={(patch) => update(patch.tab === 'servicios' ? { ...patch, tab: null } : patch)} />
      <PanelMapa punto={punto} lista={lista} errorLista={errorLista || undefined}
        onReintentarLista={() => lista && setLista([...lista])}
        onElegirDeLista={elegirDeLista}
        onVolverALista={listaPrevia ? volverALista : undefined}
        onCerrar={() => { setPunto(null); setLista(null); setListaPrevia(null); }} />
    </div>
  );
}
```

El `onCambiar` traduce aquí `tab: 'servicios'` a `null` — la convención de URL que `Search.tsx` ya
usa y que `ControlesMapa` no tiene por qué conocer.

- [ ] **Paso 5: verde.** — [ ] **Paso 6: commit**

```bash
git add -A frontend/src/components/mapa frontend/src/index.css
git commit -m "ExplorarMapa: el mapa es la pagina, con su panel y su paneo"
```

---

### Task 8: enganchar en `Search.tsx`

**Files:**
- Modify: `frontend/src/pages/Search.tsx`
- Test: `frontend/src/pages/Search.test.tsx` (las 4 existentes siguen valiendo)

**Interfaces:**
- Consumes: `ExplorarMapa`.
- Produces: nada nuevo.

- [ ] **Paso 1: correr las 4 pruebas de conmutación** — verdes antes de tocar nada.

- [ ] **Paso 2: sustituir la rama del mapa**

El bloque actual (`Search.tsx:~510-516`) pasa a un retorno temprano, **antes** del marco de página
con su `container-page`, para que el mapa pueda ocupar el ancho completo:

```tsx
if (enMapa) {
  return <ExplorarMapa get={get} update={update} categorias={categories} />;
}
```

Eliminar de `Search.tsx` lo que solo servía al mapa: los estados `puntoAbierto` y `listaCelda`, los
callbacks `abrirPunto`/`abrirLista`, y los `import` de `HojaPunto`, `ListaCelda` y `MapaExplorar`
(el `lazy` de Leaflet se muda a `ExplorarMapa`). **Dejar** los `enMapa` de los `useEffect` de carga
(`if (… || enMapa) return`): siguen evitando pedir listados que no se pintan.

- [ ] **Paso 3: las 4 pruebas siguen pasando.** Si la 4 («montar con `?vista=mapa` pasa tab/q en el
primer render, sin destello de lista») falla, el retorno temprano quedó por debajo de algún
`useEffect` con condición: los hooks van todos antes del `if`.

- [ ] **Paso 4: verde total** — `npx vitest run`, `npx tsc --noEmit`, `npm run build`.

- [ ] **Paso 5: commit**

```bash
git add -A frontend/src/pages
git commit -m "Search monta ExplorarMapa y suelta el layout del mapa"
```

---

### Task 9: verificación visual y cierre

**Files:**
- Modify: `oficios-cuba/STATUS.md`
- Modify: `oficios-cuba/CLAUDE.md` (la descripción de `/explorar` en «Páginas»)

- [ ] **Paso 1: suite completa** — `npx vitest run`, `npx tsc --noEmit`, `npm run build`: todo verde.

- [ ] **Paso 2: comprobación visual a dos anchos**

```bash
cd ~/docker/playwright
docker compose run --rm pw node scripts/abrir.mjs "http://HOST:PUERTO/explorar?vista=mapa" 390
docker compose run --rm pw node scripts/abrir.mjs "http://HOST:PUERTO/explorar?vista=mapa" 1280 800
```

Comprobar en las capturas: mapa de borde a borde bajo la cabecera, barra flotante sin tapar los
avisos, y **«sin desborde horizontal»** en la salida del script a 390 px.

- [ ] **Paso 3: actualizar `CLAUDE.md`**

En la línea de `/explorar`, donde dice «`&vista=mapa` cambia de la lista al mapa», añadir que el
mapa ocupa la página, que la información sale en panel lateral desde `lg` y en hoja inferior por
debajo, y que un punto agrupado lista su celda en ese mismo panel.

- [ ] **Paso 4: entrada en `STATUS.md`** con el formato de las existentes (horas en UTC).

- [ ] **Paso 5: commit**

```bash
git add -A
git commit -m "Documenta el mapa a pantalla completa"
```

---

## Auto-revisión

**Cobertura de la spec.** Cada sección tiene tarea: decisión 1 (marco) → T7; decisión 2 (flotantes)
→ T5; decisión 3 (panel flotante + paneo) → T3 y T7; separar contenido de envoltorio → T1, T2;
lista en el panel con vuelta → T4; errores de celda → T6; carga diferida en móvil e inmediata en
escritorio → T2 (`expandida`) y T3; avisos que chocan con la barra → T6; «Cerca de mí» tapado → T6;
pruebas → repartidas; fuera de alcance → respetado (no se toca backend, ni la lista, ni la URL).

**Consistencia de tipos.** `PropsEnvoltorio` la definen T1/T2 y la replica T3 sin cambios.
`onAbrirLista` cambia de firma en T6 (`(puntos, error?)`) y su único consumidor, T7, la usa así.
`ANCHO_PANEL_PX = 352` y el `w-[22rem]` de `PanelLateral` son el mismo número en dos sitios —lo
dice el comentario de T3—; si uno cambia, el paneo se descoloca.

**Sin rellenos.** Ningún «TBD», ningún «manejar errores apropiadamente»: los tres errores tienen su
mensaje y su camino escritos.
