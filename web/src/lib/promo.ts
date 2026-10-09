// Promo code rules. Pure so the server and the cart preview compute the same discount.

export interface Promo {
  code: string;
  kind: 'percent' | 'flat';
  value: number;      // percent (1-100) or KC off
  cap?: number;       // percent codes only: maximum KC off
  min: number;        // minimum cart subtotal in KC
  label: string;
  active: boolean;
  maxUses?: number;   // total redemptions across all users
}

export const CODE_PATTERN = /^[A-Z0-9]{3,16}$/;

export const normalizeCode = (code: string) => code.trim().toUpperCase();

/** Discount in whole KC; never more than the subtotal, never negative. */
export function promoDiscount(promo: Promo, subtotal: number): number {
  if (!promo.active || !Number.isFinite(subtotal) || subtotal < promo.min || subtotal <= 0) return 0;
  const raw = promo.kind === 'percent' ? Math.round(subtotal * promo.value / 100) : promo.value;
  const capped = promo.kind === 'percent' && promo.cap !== undefined ? Math.min(promo.cap, raw) : raw;
  return Math.max(0, Math.min(subtotal, Math.floor(capped)));
}

/** Split a discount across stores in proportion to their share of the subtotal, exactly summing to the total. */
export function splitDiscount(discount: number, shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0);
  if (discount <= 0 || total <= 0) return shares.map(() => 0);
  let left = discount;
  return shares.map((s, i) => {
    const part = i === shares.length - 1 ? left : Math.min(left, Math.floor(discount * s / total));
    left -= part;
    return part;
  });
}

export function validatePromoDef(p: Promo): string | null {
  if (!CODE_PATTERN.test(p.code)) return 'Codes are 3 to 16 letters or digits.';
  if (p.kind !== 'percent' && p.kind !== 'flat') return 'Choose percent or flat.';
  if (!Number.isInteger(p.value) || p.value < 1) return 'The value must be a whole number of at least 1.';
  if (p.kind === 'percent' && p.value > 100) return 'A percentage cannot exceed 100.';
  if (p.kind === 'flat' && p.value > 5000) return 'A flat discount cannot exceed 5,000 KC.';
  if (p.cap !== undefined && (!Number.isInteger(p.cap) || p.cap < 1 || p.cap > 5000)) return 'The cap must be 1 to 5,000 KC.';
  if (!Number.isInteger(p.min) || p.min < 0 || p.min > 100_000) return 'The minimum must be 0 to 100,000 KC.';
  if (p.maxUses !== undefined && (!Number.isInteger(p.maxUses) || p.maxUses < 1)) return 'Total uses must be at least 1.';
  if (!p.label.trim() || p.label.length > 80) return 'Add a short description (80 characters max).';
  return null;
}
