import type { PuntoMapa } from '@oficio/shared';
import { atrasCierraHoja } from '../src/lib/hojaPunto';

const puntoFalso: PuntoMapa = { id: 'p1', tipo: 'oficio', nombre: 'Ana', lat: 20, lng: -79, plan: 'free', detras: 0, resumen: 'x' };

describe('atrasCierraHoja', () => {
  it('sin punto abierto, deja pasar el Atrás — sale de la pantalla', () => {
    expect(atrasCierraHoja(null)).toBe(false);
  });

  it('con un punto abierto, el Atrás cierra la hoja y no saca al usuario de Explorar', () => {
    expect(atrasCierraHoja(puntoFalso)).toBe(true);
  });
});
