import { beforeEach, describe, expect, it } from 'vitest';
import { Kart, seed } from './db';
import { ACCOUNTS as A } from '@/ledger/ledger';

let k: Kart;
const U = (id: string) => k.user(id)!;
beforeEach(() => { k = new Kart(seed()); });

describe('promo codes', () => {
  it('discount is platform-funded: buyer pays less, vendor is paid on the full amount, books balance', () => {
    const r = k.checkout(U('u-alex'), [{ productId: 'f2', qty: 2 }], '', 'kart10'); // 240 KC, 10% = 24
    expect(r.ok && r.discount).toBe(24);
    expect(k.balance('u-alex')).toBe(2500 - 216);
    const commission = Math.ceil(240 * 0.03);
    expect(k.ledger.balance(A.vendorPayable('v-green'))).toBe(240 - commission);
    expect(k.ledger.balance(A.promo)).toBe(24); // platform expense
    expect(k.ledger.trialBalance().balanced).toBe(true);
    expect(k.db.orders[0]).toMatchObject({ discount: 24, promoCode: 'KART10', amount: 240 });
  });
  it('one use per person, and the minimum is enforced', () => {
    expect(k.checkout(U('u-alex'), [{ productId: 'f4', qty: 1 }], '', 'KART10').ok).toBe(false); // 60 < 150
    expect(k.checkout(U('u-alex'), [{ productId: 'f2', qty: 2 }], '', 'KART10').ok).toBe(true);
    const again = k.checkout(U('u-alex'), [{ productId: 'f2', qty: 2 }], '', 'KART10');
    expect(!again.ok && again.error).toMatch(/already used/);
    expect(k.checkout(U('u-meera'), [{ productId: 'f2', qty: 2 }], '', 'KART10').ok).toBe(true);
  });
  it('rejects unknown, disabled and fully redeemed codes without charging', () => {
    expect(k.checkout(U('u-alex'), [{ productId: 'f2', qty: 2 }], '', 'NOPE').ok).toBe(false);
    expect(k.checkout(U('u-alex'), [{ productId: 'f2', qty: 2 }], '', 'LATE').ok).toBe(false); // inactive
    expect(k.balance('u-alex')).toBe(2500);
    k.db.promos.find(p => p.code === 'NEW50')!.maxUses = 1;
    k.db.promoUses.push({ code: 'NEW50', userId: 'u-meera', orderId: 'x' });
    const r = k.checkout(U('u-alex'), [{ productId: 's1', qty: 1 }], '', 'NEW50');
    expect(!r.ok && r.error).toMatch(/fully redeemed/);
  });
  it('splits the discount across stores so each order is balanced', () => {
    const r = k.checkout(U('u-alex'), [{ productId: 'f2', qty: 1 }, { productId: 'f1', qty: 1 }, { productId: 's1', qty: 1 }], '', 'NEW50'); // 120+85+340 = 545
    expect(r.ok && r.discount).toBe(50);
    expect(k.db.orders.reduce((a, o) => a + (o.discount ?? 0), 0)).toBe(50);
    expect(k.balance('u-alex')).toBe(2500 - 495);
    expect(k.ledger.trialBalance().balanced).toBe(true);
  });
  it('cancelling refunds only what was paid and frees the code', () => {
    k.checkout(U('u-alex'), [{ productId: 'f2', qty: 2 }], '', 'KART10');
    const id = k.db.orders[0].id;
    expect(k.cancelOrder(U('u-alex'), id).ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500);
    expect(k.ledger.balance(A.promo)).toBe(0);
    expect(k.ledger.balance(A.vendorPayable('v-green'))).toBe(0);
    expect(k.ledger.trialBalance().balanced).toBe(true);
    expect(k.checkout(U('u-alex'), [{ productId: 'f2', qty: 2 }], '', 'KART10').ok).toBe(true); // usable again
  });
  it('previews without charging or recording a use', () => {
    const lines = [{ productId: 'f2', qty: 2 }];
    const p = k.previewPromo(U('u-alex'), lines, ' kart10 ');
    expect(p).toMatchObject({ ok: true, discount: 24, code: 'KART10' });
    expect(k.balance('u-alex')).toBe(2500);
    expect(k.db.promoUses).toHaveLength(0);
    expect(k.previewPromo(U('u-alex'), lines, '').ok).toBe(false);
  });
  it('only platform admins manage codes, with validation and an audit trail', () => {
    const def = { code: 'fresh20', kind: 'percent' as const, value: 20, cap: 100, min: 100, label: '20% off', active: true };
    expect(k.savePromo(U('u-alex'), def).ok).toBe(false);
    expect(k.savePromo(U('p-ops'), { ...def, value: 120 }).ok).toBe(false);
    expect(k.savePromo(U('p-ops'), def).ok).toBe(true);
    expect(k.db.promos.some(p => p.code === 'FRESH20')).toBe(true);
    expect(k.togglePromo(U('a-dean'), 'FRESH20').ok).toBe(false);
    expect(k.togglePromo(U('p-ops'), 'FRESH20').ok).toBe(true);
    expect(k.db.promos.find(p => p.code === 'FRESH20')!.active).toBe(false);
    expect(k.db.audit[0].text).toMatch(/Disabled promo code FRESH20/);
  });
  it('a free-after-discount order is allowed and posts a balanced entry', () => {
    k.savePromo(U('p-ops'), { code: 'FREE', kind: 'flat', value: 60, min: 0, label: 'free sandwich', active: true });
    expect(k.checkout(U('u-alex'), [{ productId: 'f4', qty: 1 }], '', 'FREE').ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500);
    expect(k.ledger.trialBalance().balanced).toBe(true);
  });
});

describe('wishlist', () => {
  it('toggles per user, and survives other users', () => {
    expect(k.toggleWishlist(U('u-alex'), 'f1')).toMatchObject({ ok: true, saved: true });
    expect(k.isWished('u-alex', 'f1')).toBe(true);
    expect(k.isWished('u-meera', 'f1')).toBe(false);
    expect(k.toggleWishlist(U('u-alex'), 'f1')).toMatchObject({ ok: true, saved: false });
    expect(k.wishlistFor('u-alex')).toHaveLength(0);
  });
  it('rejects unknown products and non-shoppers', () => {
    expect(k.toggleWishlist(U('u-alex'), 'nope').ok).toBe(false);
    expect(k.toggleWishlist(U('v-bites'), 'f1').ok).toBe(false);
  });
  it('caps the list at 50 items', () => {
    for (let i = 0; i < 50; i++) k.db.wishlist.push({ userId: 'u-alex', productId: 'f1', ts: i });
    expect(k.toggleWishlist(U('u-alex'), 'f2').ok).toBe(false);
  });
});

describe('product reviews', () => {
  const collect = (productId: string, storeVendor: string) => {
    k.checkout(U('u-alex'), [{ productId, qty: 1 }], '');
    const id = k.db.orders[0].id;
    for (let i = 0; i < 3; i++) k.advanceOrder(U(storeVendor), id);
  };
  it('only verified buyers who collected the item can review, and re-reviewing edits', () => {
    expect(k.reviewProduct(U('u-alex'), 'f1', 5, '').ok).toBe(false); // never bought
    k.checkout(U('u-alex'), [{ productId: 'f1', qty: 1 }], '');
    expect(k.reviewProduct(U('u-alex'), 'f1', 5, '').ok).toBe(false); // not collected yet
    const id = k.db.orders[0].id;
    for (let i = 0; i < 3; i++) k.advanceOrder(U('v-bites'), id);
    expect(k.reviewProduct(U('u-meera'), 'f1', 5, '').ok).toBe(false);
    expect(k.reviewProduct(U('u-alex'), 'f1', 0, '').ok).toBe(false);
    expect(k.reviewProduct(U('u-alex'), 'f1', 4, 'Crisp').ok).toBe(true);
    expect(k.reviewProduct(U('u-alex'), 'f1', 5, 'Even better').ok).toBe(true);
    expect(k.productReviews('f1')).toHaveLength(1);
    expect(k.productRating('f1')).toEqual({ count: 1, average: 5 });
  });
  it('averages across buyers', () => {
    collect('f1', 'v-bites');
    k.reviewProduct(U('u-alex'), 'f1', 5, '');
    k.checkout(U('u-meera'), [{ productId: 'f1', qty: 1 }], '');
    for (let i = 0; i < 3; i++) k.advanceOrder(U('v-bites'), k.db.orders[0].id);
    k.reviewProduct(U('u-meera'), 'f1', 2, '');
    expect(k.productRating('f1')).toEqual({ count: 2, average: 3.5 });
    expect(k.productRating('f2')).toEqual({ count: 0, average: 0 });
  });
  it('does not leak into task or store ratings', () => {
    collect('f1', 'v-bites');
    k.reviewProduct(U('u-alex'), 'f1', 1, '');
    expect(k.storeRating('st-bites').count).toBe(0);
    expect(k.reviewsFor('v-bites').length).toBe(0);
  });
});
