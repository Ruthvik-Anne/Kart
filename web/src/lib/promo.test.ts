import { describe, expect, it } from 'vitest';
import { promoDiscount, splitDiscount, validatePromoDef, normalizeCode, type Promo } from './promo';

const pct: Promo = { code: 'KART10', kind: 'percent', value: 10, cap: 200, min: 150, label: '10% off', active: true };
const flat: Promo = { code: 'NEW50', kind: 'flat', value: 50, min: 300, label: '50 off', active: true };

describe('promoDiscount', () => {
  it('applies percent with a cap and a minimum', () => {
    expect(promoDiscount(pct, 149)).toBe(0);
    expect(promoDiscount(pct, 150)).toBe(15);
    expect(promoDiscount(pct, 5000)).toBe(200);
  });
  it('applies flat discounts but never exceeds the subtotal', () => {
    expect(promoDiscount(flat, 299)).toBe(0);
    expect(promoDiscount(flat, 300)).toBe(50);
    expect(promoDiscount({ ...flat, value: 500, min: 0 }, 120)).toBe(120);
  });
  it('is zero for inactive codes, empty carts and bad numbers', () => {
    expect(promoDiscount({ ...pct, active: false }, 1000)).toBe(0);
    expect(promoDiscount(pct, 0)).toBe(0);
    expect(promoDiscount(pct, NaN)).toBe(0);
  });
});

describe('splitDiscount', () => {
  it('sums exactly to the discount and follows the shares', () => {
    for (const [d, shares] of [[50, [100, 100, 100]], [7, [1, 1, 1]], [15, [85, 120]], [1, [5, 5]]] as [number, number[]][]) {
      const parts = splitDiscount(d, shares);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(d);
      expect(parts.every(p => p >= 0)).toBe(true);
    }
    expect(splitDiscount(0, [10, 20])).toEqual([0, 0]);
  });
  it('never gives a store more than its own subtotal', () => {
    const parts = splitDiscount(100, [30, 70]);
    expect(parts[0]).toBeLessThanOrEqual(30);
    expect(parts[1]).toBeLessThanOrEqual(70);
  });
});

describe('validatePromoDef', () => {
  it('accepts good definitions and rejects bad ones', () => {
    expect(validatePromoDef(pct)).toBeNull();
    expect(validatePromoDef({ ...pct, code: 'x' })).not.toBeNull();
    expect(validatePromoDef({ ...pct, value: 101 })).not.toBeNull();
    expect(validatePromoDef({ ...flat, value: 9000 })).not.toBeNull();
    expect(validatePromoDef({ ...pct, min: -1 })).not.toBeNull();
    expect(validatePromoDef({ ...pct, label: ' ' })).not.toBeNull();
    expect(validatePromoDef({ ...pct, maxUses: 0 })).not.toBeNull();
  });
  it('normalises codes', () => expect(normalizeCode(' kart10 ')).toBe('KART10'));
});
