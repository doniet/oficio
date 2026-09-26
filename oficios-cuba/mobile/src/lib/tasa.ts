import { useQuery } from '@tanstack/react-query';
import { TASA_RESPALDO } from '@oficio/shared';
import { useSesion } from './contexto';

/** CUP por 1 USD. Sin red o mientras carga, la de respaldo: el precio nunca espera a la tasa. */
export function useTasa(): number {
  const { api } = useSesion();
  const q = useQuery({ queryKey: ['tasa'], queryFn: () => api.tasa(), staleTime: 3_600_000 });
  return q.data?.usd ?? TASA_RESPALDO;
}
