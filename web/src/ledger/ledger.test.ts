import { describe, expect, it } from 'vitest';
import { ACCOUNTS as A, Ledger, LedgerError } from './ledger';
import * as rules from './rules';
import { DEFAULT_FEES as F } from './rules';

function funded(amount = 1000, user = 'u1') {
  const l = new Ledger();
  l.post(rules.topUp(user, amount, `t-${user}`));
  return l;
}

describe('Ledger.post', () => {
  it('rejects unbalanced entries and bad amounts', () => {
    const l = new Ledger();
    expect(() => l.post({ key: 'a', type: 't', memo: '', postings: [
      { account: A.ppiFloat, side: 'debit', amount: 10 }, { account: A.wallet('u'), side: 'credit', amount: 9 }] })).toThrow(LedgerError);
    expect(() => l.post({ key: 'b', type: 't', memo: '', postings: [
      { account: A.ppiFloat, side: 'debit', amount: 1.5 }, { account: A.wallet('u'), side: 'credit', amount: 1.5 }] })).toThrow(LedgerError);
    expect(l.entries).toHaveLength(0);
  });
  it('is idempotent on the key', () => {
    const l = funded(500);
    l.post(rules.topUp('u1', 500, 't-u1'));
    expect(l.entries).toHaveLength(1);
    expect(l.balance(A.wallet('u1'))).toBe(500);
  });
  it('refuses to overdraw a wallet and leaves no partial entry', () => {
    const l = funded(100);
    expect(() => l.post(rules.escrowReserve('T1', 'u1', 150))).toThrow(/Insufficient/);
    expect(l.entries).toHaveLength(1);
    expect(l.balance(A.wallet('u1'))).toBe(100);
  });
  it('can retry a failed key after funding the wallet', () => {
    const l = funded(100);
    expect(() => l.post(rules.escrowReserve('T1', 'u1', 150))).toThrow();
    l.post(rules.topUp('u1', 100, 'more'));
    expect(() => l.post(rules.escrowReserve('T1', 'u1', 150))).not.toThrow();
  });
});

describe('business flows', () => {
  it('checkout splits vendor payable and commission', () => {
    const l = funded(1000);
    l.post(rules.checkout('O1', 'u1', 'v1', 200, F));
    expect(l.balance(A.wallet('u1'))).toBe(800);
    expect(l.balance(A.vendorPayable('v1'))).toBe(194);
    expect(l.balance(A.vendorCommission)).toBe(6);
  });
  it('a refund restores the buyer exactly', () => {
    const l = funded(1000);
    l.post(rules.checkout('O1', 'u1', 'v1', 85, F));
    l.post(rules.orderRefund('O1', 'u1', 'v1', 85, F));
    expect(l.balance(A.wallet('u1'))).toBe(1000);
    expect(l.balance(A.vendorPayable('v1'))).toBe(0);
    expect(l.balance(A.vendorCommission)).toBe(0);
  });
  it('task escrow pays the provider net of fee on release (fixes the prototype 0 KC release)', () => {
    const l = funded(1000);
    l.post(rules.escrowReserve('T1', 'u1', 300));
    expect(l.balance(A.escrow('T1'))).toBe(300);
    l.post(rules.escrowRelease('T1', 1, 'u2', 300, F));
    expect(l.balance(A.escrow('T1'))).toBe(0);
    expect(l.balance(A.wallet('u2'))).toBe(285);
    expect(l.balance(A.platformFees)).toBe(15);
  });
  it('long-term tasks release per milestone', () => {
    const l = funded(1000);
    l.post(rules.escrowReserve('T2', 'u1', 600));
    l.post(rules.escrowRelease('T2', 1, 'u2', 200, F));
    l.post(rules.escrowRelease('T2', 2, 'u2', 400, F));
    expect(l.balance(A.escrow('T2'))).toBe(0);
    expect(l.balance(A.wallet('u2')) + l.balance(A.platformFees)).toBe(600);
  });
  it('cannot release more than is held in escrow', () => {
    const l = funded(1000);
    l.post(rules.escrowReserve('T3', 'u1', 100));
    expect(() => l.post(rules.escrowRelease('T3', 1, 'u2', 150, F))).toThrow(/Insufficient/);
  });
  it('settlement moves vendor payable to the partner float', () => {
    const l = funded(1000);
    l.post(rules.checkout('O1', 'u1', 'v1', 400, F));
    const owed = l.balance(A.vendorPayable('v1'));
    l.post(rules.vendorSettlement('v1', owed, 'B1'));
    expect(l.balance(A.pendingSettlement)).toBe(owed);
    l.post(rules.settlementConfirmed(owed, 'B1'));
    expect(l.balance(A.pendingSettlement)).toBe(0);
  });
  it('reverse() posts the opposite entry once', () => {
    const l = funded(500);
    l.reverse('JE-00001', 'test');
    l.reverse('JE-00001', 'test');
    expect(l.entries).toHaveLength(2);
    expect(l.balance(A.wallet('u1'))).toBe(0);
  });
});

describe('invariants', () => {
  it('trial balance stays balanced and no wallet goes negative over a random event sequence', () => {
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
    const l = new Ledger();
    const users = ['a', 'b', 'c', 'd'];
    users.forEach(u => l.post(rules.topUp(u, 2000, `seed-${u}`)));
    for (let i = 0; i < 300; i++) {
      const buyer = users[rnd(4)], other = users[rnd(4)], amount = 1 + rnd(400), id = `X${i}`;
      try {
        switch (rnd(4)) {
          case 0: l.post(rules.checkout(id, buyer, `v${rnd(3)}`, amount, F)); break;
          case 1: l.post(rules.escrowReserve(id, buyer, amount)); l.post(rules.escrowRelease(id, 1, other, amount, F)); break;
          case 2: l.post(rules.escrowReserve(id, buyer, amount)); l.post(rules.escrowRefund(id, buyer, amount)); break;
          default: l.post(rules.cashOut(buyer, amount, id));
        }
      } catch (e) {
        expect(e).toBeInstanceOf(LedgerError);
      }
      expect(l.trialBalance().balanced).toBe(true);
    }
    for (const u of users) expect(l.balance(A.wallet(u))).toBeGreaterThanOrEqual(0);
    expect(l.entries.length).toBeGreaterThan(100);
  });
});
