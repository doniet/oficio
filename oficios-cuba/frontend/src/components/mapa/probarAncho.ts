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

/**
 * jsdom no hace layout: todo elemento mide 0×0. Leaflet calcula sus bounds a partir de
 * `clientWidth`/`clientHeight` del contenedor, así que sin esto el mapa devuelve un rectángulo
 * colapsado a un punto — y `usarMapa` lo ignora a propósito (no se gasta una petición que no
 * puede devolver nada), con lo que en pruebas no se pediría NUNCA el área.
 *
 * Es el mismo tipo de parche que el de `offsetParent` para la trampa de foco: un hueco del
 * entorno de pruebas, no algo que dependa del navegador real.
 */
export function darTamanoAlMapa(ancho = 800, alto = 600) {
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return ancho; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return alto; } });
}
