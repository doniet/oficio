/**
 * jsdom no implementa `matchMedia`: sin esto, cualquier componente que la llame revienta en las
 * pruebas. Es el mismo tipo de hueco que `offsetParent` (ver el parche de `PanelMapa.test.tsx`),
 * no algo que dependa del navegador real.
 *
 * Los oyentes son de verdad, no vacíos: volver a llamar a `fijarAncho` con otro ancho avisa a
 * quien esté escuchando, igual que haría el navegador al rotar el dispositivo. Con oyentes vacíos,
 * una prueba de «cruzar el punto de corte» no cruzaría nada y pasaría sin probar nada.
 */
type Oyente = () => void;
const oyentes = new Map<string, Set<Oyente>>();
let anchoActual = 1024;

function coincide(consulta: string) {
  const minimo = Number(consulta.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
  return anchoActual >= minimo;
}

export function fijarAncho(px: number) {
  anchoActual = px;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (consulta: string) => ({
      get matches() { return coincide(consulta); },
      media: consulta,
      addEventListener: (_: string, fn: Oyente) => {
        if (!oyentes.has(consulta)) oyentes.set(consulta, new Set());
        oyentes.get(consulta)!.add(fn);
      },
      removeEventListener: (_: string, fn: Oyente) => { oyentes.get(consulta)?.delete(fn); },
      addListener: () => {}, removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
  for (const fns of oyentes.values()) for (const fn of fns) fn();
}
