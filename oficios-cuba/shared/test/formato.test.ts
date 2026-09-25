import { describe, expect, it } from 'vitest';
import { formatPrice, initials, nombreVisible, parseDate, priceFrom, relativeTime, whatsappLink } from '../src/formato';

describe('formato', () => {
  it('parseDate acepta el formato de SQLite (UTC sin zona) y el ISO', () => {
    expect(parseDate('2026-09-25 10:00:00').toISOString()).toBe('2026-09-25T10:00:00.000Z');
    expect(parseDate('2026-09-25T10:00:00.000Z').toISOString()).toBe('2026-09-25T10:00:00.000Z');
    expect(Number.isNaN(parseDate(null).getTime())).toBe(true);
  });

  it('formatPrice', () => {
    expect(formatPrice({ price_type: 'negotiable', price_min: 10 })).toBe('A convenir');
    expect(formatPrice({ price_type: 'fixed', price_min: null, price_max: null })).toBe('A convenir');
    expect(formatPrice({ price_type: 'hourly', price_min: 5 })).toBe('$5 / hora');
    expect(formatPrice({ price_type: 'fixed', price_min: 10, price_max: 25 })).toBe('$10 – $25');
  });

  it('priceFrom da "desde" solo con rango', () => {
    expect(priceFrom({ price_type: 'fixed', price_min: 10, price_max: 25 })).toEqual({ prefix: 'desde', amount: '$10', suffix: '' });
    expect(priceFrom({ price_type: 'daily', price_min: 60 })).toEqual({ prefix: '', amount: '$60', suffix: '/ día' });
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
