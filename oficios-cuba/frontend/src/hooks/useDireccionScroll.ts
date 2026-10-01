import { useEffect, useRef, useState } from 'react';

// Umbral de cambio: un par de px de jitter (algunos navegadores móviles generan scroll de ±1px
// solos, por el "bounce" del borde) no deben cambiar la dirección a cada rato. Umbral de inicio:
// cerca del tope de la página el banner se queda SIEMPRE desplegado — ni el usuario espera que se
// recoja a los primeros píxeles, ni hace falta ganar espacio ahí todavía.
const UMBRAL_CAMBIO_PX = 10;
const UMBRAL_INICIO_PX = 48;

/** true mientras el usuario viene bajando la página; false subiendo o cerca del tope.
 *  Para el banner colapsable de Layout.tsx — no para la vista de mapa, que no tiene scroll de
 *  página (el body queda fijo a pantalla completa, ver `enMapa` en Layout.tsx). */
export function useDireccionScroll() {
  const [abajo, setAbajo] = useState(false);
  const ultimoY = useRef(0);

  useEffect(() => {
    ultimoY.current = window.scrollY;
    let frame = 0;
    const alHacerScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - ultimoY.current;
        if (y < UMBRAL_INICIO_PX) setAbajo(false);
        else if (delta > UMBRAL_CAMBIO_PX) setAbajo(true);
        else if (delta < -UMBRAL_CAMBIO_PX) setAbajo(false);
        ultimoY.current = y;
      });
    };
    window.addEventListener('scroll', alHacerScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', alHacerScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return abajo;
}
