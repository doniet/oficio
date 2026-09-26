import { describe, expect, it } from 'vitest';
import { formatPrice, initials, nombreVisible, parseDate, priceFrom, relativeTime, TASA_RESPALDO, telLink, whatsappLink } from '../src/formato';

describe('formato', () => {
  it('parseDate acepta el formato de SQLite (UTC sin zona) y el ISO', () => {
    expect(parseDate('2026-09-25 10:00:00').toISOString()).toBe('2026-09-25T10:00:00.000Z');
    expect(parseDate('2026-09-25T10:00:00.000Z').toISOString()).toBe('2026-09-25T10:00:00.000Z');
    expect(Number.isNaN(parseDate(null).getTime())).toBe(true);
  });

  it('formatPrice: moneda del profesional + conversión aproximada (CUP por defecto)', () => {
    expect(formatPrice({ price_type: 'negotiable', price_min: 10 })).toBe('A convenir');
    expect(formatPrice({ price_type: 'fixed', price_min: null, price_max: null })).toBe('A convenir');
    // Sin moneda = CUP (así nacen los servicios nuevos). 730 CUP/USD por defecto.
    expect(formatPrice({ price_type: 'fixed', price_min: 5000 })).toBe('5\u00a0000 CUP (≈ $7 USD)');
    expect(formatPrice({ price_type: 'hourly', price_min: 15000, price_max: 60000, price_currency: 'CUP' }))
      .toBe('15\u00a0000 – 60\u00a0000 CUP (≈ $21 – $82 USD) / hora');
    expect(formatPrice({ price_type: 'daily', price_min: 20, price_currency: 'USD' }, 500)).toBe('$20 USD (≈ 10\u00a0000 CUP) / día');
    // USD pequeño: medio dólar; CUP < 1000: a la decena.
    expect(formatPrice({ price_type: 'fixed', price_min: 900 }, 730)).toBe('900 CUP (≈ $1 USD)');
    expect(formatPrice({ price_type: 'fixed', price_min: 1.5, price_currency: 'USD' }, 730)).toBe('$1,50 USD (≈ 1\u00a0100 CUP)');
    expect(formatPrice({ price_type: 'fixed', price_min: 300 }, 730)).toBe('300 CUP (≈ $0,50 USD)');
  });

  it('priceFrom da "desde" solo con rango, en la moneda del profesional, y la conversión aparte', () => {
    expect(priceFrom({ price_type: 'fixed', price_min: 10, price_max: 25, price_currency: 'USD' }, 730))
      .toEqual({ prefix: 'desde', amount: '$10 USD', suffix: '', alt: '≈ 7\u00a0300 CUP' });
    expect(priceFrom({ price_type: 'daily', price_min: 3000 }, 730)).toEqual({ prefix: '', amount: '3\u00a0000 CUP', suffix: '/ día', alt: '≈ $4 USD' });
    expect(priceFrom({ price_type: 'negotiable' })).toEqual({ prefix: '', amount: 'A convenir', suffix: '', alt: null });
  });

  it('una tasa inválida (0, negativa, NaN) cae a la de respaldo', () => {
    for (const t of [0, -5, NaN]) expect(formatPrice({ price_type: 'fixed', price_min: 7300 }, t)).toBe(formatPrice({ price_type: 'fixed', price_min: 7300 }, TASA_RESPALDO));
  });

  it('telLink deja solo dígitos y +', () => {
    expect(telLink('+53 5 123-4567')).toBe('tel:+5351234567');
  });

  it('relativeTime', () => {
    const ahora = new Date('2026-09-25T12:00:00Z');
    expect(relativeTime('2026-09-25T11:59:30Z', ahora)).toBe('ahora');
    expect(relativeTime('2026-09-25T11:15:00Z', ahora)).toBe('hace 45 min');
    expect(relativeTime('2026-09-24T12:00:00Z', ahora)).toBe('ayer');
  });

  it('nombreVisible e initials', () => {
    expect(nombreVisible({ business_name: null, owner_name: 'Laura Méndez' })).toBe('Laura Méndez');
    expect(nombreVisible({ business_name: 'ElectroHogar', owner_name: 'X' })).toBe('ElectroHogar');
    expect(initials('Laura Méndez')).toBe('LM');
    expect(initials('')).toBe('?');
  });

  it('whatsappLink limpia el número', () => {
    expect(whatsappLink('+53 5 123-4567', 'hola')).toBe('https://wa.me/5351234567?text=hola');
  });
});
