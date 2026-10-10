import { describe, expect, it } from 'vitest';
import { seed, type Db } from '@/mock/db';
import { ACTIONS, runAction, viewFor, type StateStore } from './service';

/** In-memory StateStore that serialises transactions and rolls back by discarding unsaved changes. */
function memoryStore(initial: Db) {
  let data = JSON.stringify(initial);
  let saves = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const store: StateStore = {
    transaction: (_c, fn) => {
      const run = tail.then(() => fn({ load: async () => JSON.parse(data) as Db, save: async db => { data = JSON.stringify(db); saves++; } }));
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return { store, db: () => JSON.parse(data) as Db, saves: () => saves };
}

describe('server actions', () => {
  it('rejects methods outside the allow-list', async () => {
    const m = memoryStore(seed());
    for (const name of ['constructor', 'tamperDemo', 'readThread', 'balance', '__proto__', 'post']) {
      const r = await runAction(m.store, 'main', 'u-alex', name, []);
      expect(r.ok).toBe(false);
    }
    expect(m.saves()).toBe(0);
  });

  it('every allow-listed action exists on Kart', async () => {
    const { Kart } = await import('@/mock/db');
    for (const a of ACTIONS) expect(typeof (Kart.prototype as unknown as Record<string, unknown>)[a], a).toBe('function');
  });

  it('uses the session user as actor and persists successful changes', async () => {
    const m = memoryStore(seed());
    const before = m.db().notifications.length;
    const r = await runAction(m.store, 'main', 'u-alex', 'topUp', [500]);
    expect(r.ok).toBe(true);
    expect(m.saves()).toBe(1);
    expect(m.db().entries.length).toBeGreaterThan(0);
    expect(m.db().notifications.length).toBeGreaterThanOrEqual(before);
  });

  it('enforces RBAC on the server: a student cannot change fees', async () => {
    const m = memoryStore(seed());
    const r = await runAction(m.store, 'main', 'u-alex', 'setFees', [{}, {}, {}]);
    expect(r.ok).toBe(false);
    expect(m.saves()).toBe(0);
  });

  it('does not save failed actions and rejects unknown accounts and bad args', async () => {
    const m = memoryStore(seed());
    expect((await runAction(m.store, 'main', 'u-alex', 'cancelTask', ['nope'])).ok).toBe(false);
    expect((await runAction(m.store, 'main', 'ghost', 'topUp', [10])).ok).toBe(false);
    expect((await runAction(m.store, 'main', 'u-alex', 'topUp', 'x')).ok).toBe(false);
    expect((await runAction(m.store, 'main', 'u-alex', 'topUp', new Array(20).fill(1))).ok).toBe(false);
    expect(m.saves()).toBe(0);
  });

  it('serialises concurrent top-ups without losing updates', async () => {
    const m = memoryStore(seed());
    await Promise.all(Array.from({ length: 5 }, () => runAction(m.store, 'main', 'u-alex', 'topUp', [100])));
    const { Kart } = await import('@/mock/db');
    expect(new Kart(m.db()).balance('u-alex')).toBe(2500 + 500);
  });
});

describe('viewFor', () => {
  const db = seed();
  const alex = db.users.find(u => u.id === 'u-alex')!;
  const admin = db.users.find(u => u.id === 'p-ops')!;

  it('hides audit data and other people’s ledger entries from a student', () => {
    const v = viewFor(db, alex);
    expect(v.audit).toEqual([]);
    expect(v.chain).toEqual([]);
    for (const e of v.entries) expect(e.postings.some(p => p.account.endsWith(':u-alex'))).toBe(true);
  });

  it('keeps other people’s notifications, wishlist and orders out of the snapshot', () => {
    const d = structuredClone(db);
    d.notifications.push({ id: 'N-x', userId: 'u-riya', text: 'secret', ts: 1, read: false });
    d.wishlist.push({ userId: 'u-riya', productId: 'f1', ts: 1 });
    d.orders.push({ id: 'O-x', buyerId: 'u-riya', storeId: 'v-green', kind: 'food', title: 't', amount: 1, status: 'placed', ts: 1 } as never);
    const v = viewFor(d, alex);
    expect(v.notifications.every(n => n.userId === 'u-alex')).toBe(true);
    expect(v.wishlist.every(w => w.userId === 'u-alex')).toBe(true);
    expect(v.orders.some(o => o.id === 'O-x')).toBe(false);
  });

  it('gives platform admins the full picture', () => {
    const v = viewFor(db, admin);
    expect(v.entries.length).toBe(db.entries.length);
  });
});
