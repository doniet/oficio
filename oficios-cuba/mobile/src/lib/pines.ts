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
