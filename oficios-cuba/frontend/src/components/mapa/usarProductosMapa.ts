import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError, mapaApi } from '../../services/api';
import type { Bbox, OrdenProductos, ProductoMapa } from '../../types';

/**
 * La lista de productos de la pestaña Productos del mapa. La zona NO la decide este hook: llega de
 * `usarMapa` (vía `onZona`) cuando se pintan los pines, así lista y pines cuentan siempre la misma
 * zona y comparten su antirrebote en vez de llevar uno cada uno.
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

  const clave = zona ? `${zona.sur},${zona.oeste},${zona.norte},${zona.este}|${q}|${category}|${sort}` : '';
  // Lo que se está mirando AHORA. «Ver más» lo compara al llegar: si cambió, su página es de otra
  // búsqueda o de otra zona y pegarla mezclaría dos listas.
  const claveRef = useRef(clave);
  claveRef.current = clave;
  const zonaRef = useRef(zona);
  zonaRef.current = zona;

  useEffect(() => {
    if (!activo || !zona) return;
    const controlador = new AbortController();
    setCargando(true);
    setError('');
    mapaApi.productos(zona, { q: q || undefined, category: category || undefined, sort, page: 1 }, controlador.signal)
      .then((r) => {
        if (controlador.signal.aborted) return;
        setDentro(r.dentro.items);
        setTotal(r.dentro.total);
        setPagina(1);
        setPaginas(r.dentro.pages);
        setFuera(r.fuera);
        setCargando(false);
      })
      .catch((err) => {
        if (controlador.signal.aborted) return;
        setError(apiError(err, 'No pudimos cargar los productos de esta zona.'));
        setCargando(false);
      });
    return () => controlador.abort();
    // `zona` va por `clave`: llega como objeto nuevo en cada pintado aunque sea el mismo rectángulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, clave, intento]);

  const verMas = useCallback(() => {
    const z = zonaRef.current;
    if (!z || cargandoMas) return;
    const claveAlPedir = claveRef.current;
    setCargandoMas(true);
    mapaApi.productos(z, { q: q || undefined, category: category || undefined, sort, page: pagina + 1 })
      .then((r) => {
        if (claveRef.current !== claveAlPedir) return;
        setDentro((d) => [...d, ...r.dentro.items]);
        setPagina(r.dentro.page);
        setPaginas(r.dentro.pages);
        setCargandoMas(false);
      })
      .catch((err) => {
        if (claveRef.current !== claveAlPedir) return;
        setError(apiError(err, 'No pudimos cargar más productos.'));
        setCargandoMas(false);
      });
  }, [cargandoMas, q, category, sort, pagina]);

  // Una zona nueva cancela un «Ver más» a medias: su respuesta se descartará arriba, pero el
  // indicador tiene que apagarse ya.
  useEffect(() => { setCargandoMas(false); }, [clave]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { dentro, total, fuera, hayMas: pagina < paginas, cargando, cargandoMas, error, verMas, reintentar };
}
