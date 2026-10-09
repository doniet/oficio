import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bbox, MapaProductosRespuesta, OrdenProductos, ProductoMapa } from '@oficio/shared';
import { claveProductos, pedirProductos, pegarPagina } from './productosMapa';

// Mismo valor que `TIEMPO_ESPERA_MS` de lib/mapa.ts, por la misma razón: `fetch` no tiene tiempo de
// espera propio y una conexión cubana que se cuelga dejaría «Cargando…» para siempre.
const TIEMPO_ESPERA_MS = 20000;

/** `pedirProductos` con tiempo de espera. Rechaza por tiempo; si aborta `externa`, rechaza también,
 *  y quien llama distingue mirando `externa.aborted`. */
function pedirConEspera(
  zona: Bbox, p: { q?: string; category?: string; sort: OrdenProductos; page: number }, externa: AbortSignal,
): Promise<MapaProductosRespuesta> {
  const propio = new AbortController();
  const alAbortar = () => propio.abort();
  externa.addEventListener('abort', alAbortar);
  const t = setTimeout(() => propio.abort(), TIEMPO_ESPERA_MS);
  return pedirProductos(zona, p, propio.signal).finally(() => {
    clearTimeout(t);
    externa.removeEventListener('abort', alAbortar);
  });
}

/**
 * La lista de productos de la pestaña Productos del mapa. Gemelo de
 * frontend/src/components/mapa/usarProductosMapa.ts. La zona NO la decide este hook: llega de
 * `usarMapa` (vía `onZona`) justo antes de pedir los pines, así lista y pines cuentan siempre la
 * misma zona y comparten su antirrebote.
 *
 * Con `activo` en falso no se pide nada: fuera de la pestaña Productos la lista no existe.
 */
export function usarProductosMapa({ zona, q, category, sort, activo }: {
  zona: Bbox | null; q: string; category: string; sort: OrdenProductos; activo: boolean;
}) {
  const [dentro, setDentro] = useState<ProductoMapa[]>([]);
  const [total, setTotal] = useState(0);
  const [fuera, setFuera] = useState<ProductoMapa[]>([]);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  const clave = claveProductos(zona, q, category, sort);
  // Lo que se está mirando AHORA. «Ver más» lo compara al llegar: si cambió, su página es de otra
  // búsqueda o de otra zona y pegarla mezclaría dos listas.
  const claveRef = useRef(clave);
  claveRef.current = clave;
  const zonaRef = useRef(zona);
  zonaRef.current = zona;
  const controladorMas = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activo || !zona) return;
    const controlador = new AbortController();
    setCargando(true);
    setError('');
    pedirConEspera(zona, { q: q || undefined, category: category || undefined, sort, page: 1 }, controlador.signal)
      .then((r) => {
        if (controlador.signal.aborted) return;
        setDentro(r.dentro.items);
        setTotal(r.dentro.total);
        setPagina(1);
        setPaginas(r.dentro.pages);
        setFuera(r.fuera);
        setCargando(false);
      })
      .catch(() => {
        if (controlador.signal.aborted) return;
        // Sin los datos viejos: serían de otra zona o búsqueda, y su «Ver más» pediría la página 2
        // de la NUEVA para pegarla a la vieja.
        setDentro([]);
        setTotal(0);
        setFuera([]);
        setPagina(1);
        setPaginas(1);
        setError('No pudimos cargar los productos de esta zona.');
        setCargando(false);
      });
    return () => controlador.abort();
    // `zona` va por `clave`: llega como objeto nuevo en cada carga del mapa aunque sea el mismo rectángulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, clave, intento]);

  // Una zona o búsqueda nueva (o «Reintentar», que vuelve a la página 1) cancela un «Ver más» a
  // medias: su respuesta ya no se pegaría, y el indicador tiene que apagarse ya.
  useEffect(() => {
    controladorMas.current?.abort();
    setCargandoMas(false);
  }, [clave, intento]);

  useEffect(() => () => controladorMas.current?.abort(), []);

  const verMas = useCallback(() => {
    const z = zonaRef.current;
    if (!z || cargandoMas) return;
    const claveAlPedir = claveRef.current;
    const controlador = new AbortController();
    controladorMas.current = controlador;
    setCargandoMas(true);
    pedirConEspera(z, { q: q || undefined, category: category || undefined, sort, page: pagina + 1 }, controlador.signal)
      .then((r) => {
        if (controlador.signal.aborted || claveRef.current !== claveAlPedir) return;
        setDentro((d) => pegarPagina(d, r.dentro.items, claveAlPedir, claveRef.current) ?? d);
        setPagina(r.dentro.page);
        setPaginas(r.dentro.pages);
        setCargandoMas(false);
      })
      .catch(() => {
        if (controlador.signal.aborted || claveRef.current !== claveAlPedir) return;
        setError('No pudimos cargar más productos.');
        setCargandoMas(false);
      });
  }, [cargandoMas, q, category, sort, pagina]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return {
    dentro, total, fuera, hayMas: pagina < paginas, cargandoMas, error, verMas, reintentar,
    // Sin zona todavía (el mapa aún no terminó de cargar) la lista está esperando, no vacía: sin
    // esto se leería «No hay productos en esta zona.» durante la carga inicial.
    cargando: cargando || (activo && !zona),
  };
}
