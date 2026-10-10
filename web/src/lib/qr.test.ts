import { describe, expect, it } from 'vitest';
import { handoverPayload, parseHandover, qrMatrix } from './qr';

describe('handover QR passes', () => {
  const url = handoverPayload('http://localhost:3000', 'KRT-1042', 'AB12CD34');

  it('builds a link the shop can open', () => expect(url).toBe('http://localhost:3000/scan?o=KRT-1042&c=AB12CD34'));

  it('encodes the pass as a real QR matrix with finder patterns', () => {
    const m = qrMatrix(url);
    expect(m.size).toBeGreaterThanOrEqual(21);
    // Finder pattern: the 7x7 eye in each corner is dark around a light ring and a dark core.
    const eye = (row: number, col: number) => {
      expect(m.dark(row, col)).toBe(true);
      expect(m.dark(row + 1, col + 1)).toBe(false);
      expect(m.dark(row + 3, col + 3)).toBe(true);
    };
    eye(0, 0);
    eye(0, m.size - 7);
    eye(m.size - 7, 0);
  });

  it('reads a pass URL back into order and code', () => {
    expect(parseHandover(url)).toEqual({ orderId: 'KRT-1042', code: 'AB12CD34' });
  });

  it('reads a bare order id and code typed by hand', () => {
    expect(parseHandover('PRT-1043 AB12CD34')).toEqual({ orderId: 'PRT-1043', code: 'AB12CD34' });
    expect(parseHandover('   ')).toEqual({ orderId: undefined, code: undefined });
  });
});
