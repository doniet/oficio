import { useEffect, useState } from 'react';

const CONSULTA = '(min-width: 768px)'; // el `md` de Tailwind — mismo corte que ya usa Layout.tsx (hidden md:flex...)

/** true por debajo del punto de corte `md` (768px). Mismo patrón que `usarEsEscritorio` del mapa
 *  (components/mapa/usarPanel.ts), con el breakpoint que de verdad separa el header móvil del de
 *  escritorio — el del mapa (1024px) es otra decisión de layout, no sirve aquí. */
export function useEsMovil() {
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(CONSULTA).matches === false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(CONSULTA);
    const alCambiar = () => setEsMovil(!mq.matches);
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return esMovil;
}
