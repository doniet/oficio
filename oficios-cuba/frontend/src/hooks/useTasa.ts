import { useEffect, useState } from 'react';
import { tasaApi } from '../services/api';
import { TASA_RESPALDO } from '../lib/format';

// Una sola petición por carga de página; todos los componentes comparten la respuesta.
let pendiente: Promise<number> | null = null;
let valor: number | null = null;

function cargar() {
  pendiente ??= tasaApi.get()
    .then((r) => (typeof r.data?.usd === 'number' && r.data.usd > 0 ? r.data.usd : TASA_RESPALDO))
    .catch(() => TASA_RESPALDO)
    .then((v) => (valor = v));
  return pendiente;
}

/** CUP por 1 USD (mercado informal, elTOQUE vía dardoventas.com). Mientras carga, la de respaldo. */
export function useTasa(): number {
  const [tasa, setTasa] = useState(valor ?? TASA_RESPALDO);
  useEffect(() => {
    let vivo = true;
    cargar().then((v) => vivo && setTasa(v));
    return () => { vivo = false; };
  }, []);
  return tasa;
}
