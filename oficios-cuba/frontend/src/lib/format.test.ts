import { describe, expect, it } from 'vitest';
import { catalogPrice } from './format';

describe('catalogPrice: artículos importados', () => {
  const base = { price: 250, price_type: 'fixed' as const, price_currency: 'CUP' as const };
  it('sin convertible da el equivalente, como siempre', () => {
    expect(catalogPrice(base, 500).alt).not.toBeNull();
  });
  it('con convertible=false no da equivalente', () => {
    const p = catalogPrice({ ...base, convertible: false }, 500);
    expect(p.alt).toBeNull();
    expect(p.amount).toContain('250');
  });
});
