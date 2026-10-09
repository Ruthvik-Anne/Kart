import { beforeEach, describe, expect, it } from 'vitest';
import { Kart, seed } from './db';
import { ACCOUNTS as A } from '@/ledger/ledger';
import { verifyChain } from '@/chain/chain';

let k: Kart;
const U = (id: string) => k.user(id)!;
const hours = (h: number) => Date.now() + h * 3_600_000;

beforeEach(() => { k = new Kart(seed()); });

const draft = (over = {}) => ({
  kind: 'normal' as const, title: 'Proofread report', description: 'Please proofread', category: 'Academic help',
  budget: 200, deadline: hours(24), anonymous: false, milestones: [{ title: 'Proofread', share: 100 }], ...over,
});

describe('seed', () => {
  it('funds students through the ledger, balanced', () => {
    expect(k.balance('u-alex')).toBe(2500);
    expect(k.ledger.trialBalance().balanced).toBe(true);
  });
});

describe('commerce', () => {
  it('checkout charges the wallet, splits commission, and cuts stock', () => {
    const r = k.checkout(U('u-alex'), [{ productId: 'f1', qty: 2 }, { productId: 'f2', qty: 1 }], 'As soon as ready');
    expect(r.ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500 - 290);
    expect(k.db.orders).toHaveLength(2); // one order per store
    expect(k.db.products.find(p => p.id === 'f1')!.stock).toBe(38);
    expect(k.ledger.balance(A.vendorCommission)).toBeGreaterThan(0);
  });
  it('rejects overspend, bad quantity and out-of-stock', () => {
    expect(k.checkout(U('u-alex'), [{ productId: 's3', qty: 9 }], '').ok).toBe(false);
    expect(k.checkout(U('u-alex'), [{ productId: 'f1', qty: 0 }], '').ok).toBe(false);
    expect(k.checkout(U('u-alex'), [{ productId: 's1', qty: 12 }], '').ok).toBe(false); // 4080 KC > balance
  });
  it('blocks a vendor from placing orders', () => {
    expect(k.checkout(U('v-bites'), [{ productId: 'f1', qty: 1 }], '').ok).toBe(false);
  });
  it('only the owning store can advance an order', () => {
    k.checkout(U('u-alex'), [{ productId: 'f1', qty: 1 }], '');
    const id = k.db.orders[0].id;
    expect(k.advanceOrder(U('v-green'), id).ok).toBe(false);
    expect(k.advanceOrder(U('u-alex'), id).ok).toBe(false);
    expect(k.advanceOrder(U('v-bites'), id).ok).toBe(true);
    expect(k.db.orders[0].status).toBe('Preparing');
  });
  it('cancelling a placed order refunds exactly; a started order cannot be cancelled', () => {
    k.checkout(U('u-alex'), [{ productId: 'f1', qty: 1 }], '');
    const id = k.db.orders[0].id;
    expect(k.cancelOrder(U('u-alex'), id).ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500);
    k.checkout(U('u-alex'), [{ productId: 'f3', qty: 1 }], '');
    const id2 = k.db.orders[0].id;
    k.advanceOrder(U('v-bites'), id2);
    expect(k.cancelOrder(U('u-alex'), id2).ok).toBe(false);
    expect(k.cancelOrder(U('u-meera'), id2).ok).toBe(false);
  });
  it('prices a print job and routes it to the xerox shop', () => {
    const r = k.printRequest(U('u-alex'), 'st-xerox', { doc: 'lab.pdf', pages: 10, copies: 2, color: false, duplex: true, spiral: true });
    expect(r.ok).toBe(true);
    expect(k.db.orders[0].amount).toBe(5 * 2 * 2 + 30);
    expect(k.printRequest(U('u-alex'), 'st-bites', { doc: 'x', pages: 1, copies: 1, color: false, duplex: false, spiral: false }).ok).toBe(false);
  });
});

describe('task lifecycle with escrow', () => {
  function assigned(over = {}) {
    const r = k.postTask(U('u-alex'), draft(over));
    if (!r.ok) throw new Error(r.error);
    const t = k.task(r.taskId)!;
    k.placeBid(U('u-riya'), t.id, { amount: t.budget, etaHours: 4, note: 'On it' });
    k.acceptBid(U('u-alex'), t.id, t.bids[0].id);
    return t;
  }

  it('validates kind against the deadline window and milestones', () => {
    expect(k.postTask(U('u-alex'), draft({ kind: 'urgent', deadline: hours(20) })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ kind: 'normal', deadline: hours(100) })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ kind: 'long_term', deadline: hours(24) })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ kind: 'long_term', deadline: hours(200), milestones: [{ title: 'a', share: 100 }] })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ milestones: [{ title: 'a', share: 60 }] })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ kind: 'long_term', deadline: hours(200), milestones: [{ title: 'a', share: 40 }, { title: 'b', share: 60 }] })).ok).toBe(true);
  });
  it('cannot post a task the poster cannot afford, nor bid on your own', () => {
    expect(k.postTask(U('u-alex'), draft({ budget: 99_999 })).ok).toBe(false);
    const r = k.postTask(U('u-alex'), draft());
    expect(r.ok && k.placeBid(U('u-alex'), r.taskId, { amount: 10, etaHours: 1, note: 'me' }).ok).toBe(false);
  });
  it('accepting a bid reserves escrow; approval pays the provider net of fee', () => {
    const t = assigned();
    expect(k.balance('u-alex')).toBe(2300);
    expect(k.ledger.balance(A.escrow(t.id))).toBe(200);
    expect(k.startWork(U('u-riya'), t.id).ok).toBe(true);
    expect(k.submitWork(U('u-riya'), t.id).ok).toBe(true);
    expect(k.approveMilestone(U('u-riya'), t.id).ok).toBe(false); // provider cannot approve own work
    expect(k.approveMilestone(U('u-alex'), t.id).ok).toBe(true);
    expect(t.status).toBe('completed');
    expect(k.balance('u-riya')).toBe(2500 + 190);
    expect(k.ledger.balance(A.platformFees)).toBe(10);
    expect(k.ledger.balance(A.escrow(t.id))).toBe(0);
    expect(k.ledger.trialBalance().balanced).toBe(true);
  });
  it('long-term tasks release one milestone at a time and sum to the bid', () => {
    const t = assigned({ kind: 'long_term', deadline: hours(300), budget: 1001, milestones: [{ title: 'a', share: 50 }, { title: 'b', share: 50 }] });
    k.startWork(U('u-riya'), t.id);
    k.submitWork(U('u-riya'), t.id);
    k.approveMilestone(U('u-alex'), t.id);
    expect(t.status).toBe('in_progress');
    expect(k.ledger.balance(A.escrow(t.id))).toBe(t.milestones[1].amount);
    k.submitWork(U('u-riya'), t.id);
    k.approveMilestone(U('u-alex'), t.id);
    expect(t.status).toBe('completed');
    expect(t.milestones.reduce((a, m) => a + m.amount, 0)).toBe(1001);
    expect(k.ledger.balance(A.escrow(t.id))).toBe(0);
  });
  it('cancelling after assignment refunds the poster; before assignment costs nothing', () => {
    const t = assigned();
    expect(k.cancelTask(U('u-riya'), t.id).ok).toBe(false);
    expect(k.cancelTask(U('u-alex'), t.id).ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500);
    expect(t.status).toBe('cancelled');
  });
  it('request-changes sends work back without moving money', () => {
    const t = assigned();
    k.startWork(U('u-riya'), t.id);
    k.submitWork(U('u-riya'), t.id);
    expect(k.requestChanges(U('u-alex'), t.id, 'Fix typos').ok).toBe(true);
    expect(t.status).toBe('in_progress');
    expect(k.ledger.balance(A.escrow(t.id))).toBe(200);
  });
  it('disputes freeze the task until a platform admin decides', () => {
    const t = assigned();
    k.startWork(U('u-riya'), t.id);
    expect(k.openDispute(U('u-meera'), t.id, 'not mine').ok).toBe(false);
    expect(k.openDispute(U('u-riya'), t.id, 'Poster unresponsive').ok).toBe(true);
    expect(k.cancelTask(U('u-alex'), t.id).ok).toBe(false);
    expect(k.resolveDispute(U('a-dean'), t.id, 'refund_poster').ok).toBe(false);
    expect(k.resolveDispute(U('p-ops'), t.id, 'refund_poster').ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500);
    expect(t.status).toBe('resolved');
  });
  it('accepting needs funds at that moment, and only the poster can accept', () => {
    const r = k.postTask(U('u-alex'), draft());
    if (!r.ok) throw new Error();
    const t = k.task(r.taskId)!;
    k.placeBid(U('u-riya'), t.id, { amount: 200, etaHours: 2, note: 'hi' });
    expect(k.acceptBid(U('u-riya'), t.id, t.bids[0].id).ok).toBe(false);
    k.checkout(U('u-alex'), [{ productId: 's3', qty: 3 }], ''); // spend down to 130
    expect(k.acceptBid(U('u-alex'), t.id, t.bids[0].id).ok).toBe(false);
    expect(t.status).toBe('bidding');
  });
});

describe('scoring integration', () => {
  it('ranks an imminent urgent task above a relaxed long-term one', () => {
    const urgent = k.priority(k.task('T-208')!).score;
    const long = k.priority(k.task('T-212')!).score;
    expect(urgent).toBeGreaterThan(long);
  });
  it('scores a seeded bid', () => {
    const t = k.task('T-209')!;
    const m = k.match(t, t.bids[0]);
    expect(m.score).toBeGreaterThan(50);
    expect(m.score).toBeLessThanOrEqual(100);
  });
});

describe('private task communication', () => {
  function setup() {
    const t = k.task('T-209')!;
    k.placeBid(U('u-riya'), t.id, { amount: 340, etaHours: 6, note: 'I can do it' });
    return t;
  }
  it('only the poster and that bidder can read or write a bid thread', () => {
    const t = setup();
    const key = `${t.id}:u-nikhil`;
    expect(k.sendMessage(U('u-meera'), key, 'Hello Nikhil').ok).toBe(true);
    expect(k.sendMessage(U('u-nikhil'), key, 'Hi!').ok).toBe(true);
    expect(k.readThread(U('u-riya'), key)).toEqual([]);
    expect(k.sendMessage(U('u-riya'), key, 'sneaky').ok).toBe(false);
    expect(k.readThread(U('u-meera'), key)).toHaveLength(2);
  });
  it('admins can read only during a dispute, and the access is audited', () => {
    const t = k.task('T-209')!;
    const key = `${t.id}:u-nikhil`;
    k.sendMessage(U('u-meera'), key, 'status?');
    expect(k.readThread(U('p-ops'), key)).toEqual([]);
    k.acceptBid(U('u-meera'), t.id, t.bids[0].id);
    k.openDispute(U('u-meera'), t.id, 'No delivery');
    expect(k.readThread(U('p-ops'), key).length).toBeGreaterThan(0);
    expect(k.db.audit[0].text).toMatch(/Read dispute thread/);
    expect(k.sendMessage(U('p-ops'), key, 'admin chatter').ok).toBe(false);
  });
  it('closes other bid threads when a bid is accepted and blocks writes in them', () => {
    const t = setup();
    k.acceptBid(U('u-meera'), t.id, t.bids[0].id);
    expect(k.sendMessage(U('u-meera'), `${t.id}:u-riya`, 'late').ok).toBe(false);
    expect(k.db.messages.some(m => m.threadKey === `${t.id}:u-riya` && m.kind === 'system')).toBe(true);
  });
  it('rejects empty or oversized messages and flags contact details', () => {
    const t = setup();
    const key = `${t.id}:u-nikhil`;
    expect(k.sendMessage(U('u-meera'), key, '   ').ok).toBe(false);
    expect(k.sendMessage(U('u-meera'), key, 'x'.repeat(2001)).ok).toBe(false);
    expect(Kart.looksLikeContactInfo('call me on 98765 43210')).toBe(true);
    expect(Kart.looksLikeContactInfo('add me on WhatsApp')).toBe(true);
    expect(Kart.looksLikeContactInfo('see you at 5 pm')).toBe(false);
  });
  it('hides an anonymous poster from other students', () => {
    const t = k.task('T-208')!;
    expect(k.posterLabel(t, U('u-riya'))).toBe('Anonymous student');
    expect(k.posterLabel(t, U('u-meera'))).toContain('Meera P.');
  });
});

describe('admin and chain', () => {
  it('provider verification enables the capability', () => {
    expect(k.reviewVerification(U('u-alex'), 'VR-1', true).ok).toBe(false);
    expect(k.reviewVerification(U('a-dean'), 'VR-1', true).ok).toBe(true);
    expect(U('u-meera').providerEnabled).toBe(true);
  });
  it('settlement clears vendor payable', () => {
    k.checkout(U('u-alex'), [{ productId: 'f1', qty: 2 }], '');
    expect(k.settle(U('v-green'), 'st-bites').ok).toBe(false);
    const r = k.settle(U('v-bites'), 'st-bites');
    expect(r.ok && r.amount).toBeGreaterThan(0);
    expect(k.ledger.balance(A.vendorPayable('v-bites'))).toBe(0);
    expect(k.ledger.trialBalance().balanced).toBe(true);
  });
  it('anchors, verifies, then detects tampering', async () => {
    k.checkout(U('u-alex'), [{ productId: 'f1', qty: 1 }], '');
    expect((await k.anchor(U('u-alex'))).ok).toBe(false);
    expect((await k.anchor(U('p-ops'))).ok).toBe(true);
    expect((await verifyChain(k.db.chain, k.ledger.entries)).ok).toBe(true);
    expect(k.tamperDemo(U('p-ops')).ok).toBe(true);
    expect((await verifyChain(k.db.chain, k.ledger.entries)).ok).toBe(false);
  });
  it('validates fee and weight updates', () => {
    const f = { taskFeeRate: 0.08, vendorCommissionRate: 0.04 };
    expect(k.setFees(U('a-dean'), f, k.db.priorityWeights, k.db.matchWeights).ok).toBe(false);
    expect(k.setFees(U('p-ops'), { ...f, taskFeeRate: 0.9 }, k.db.priorityWeights, k.db.matchWeights).ok).toBe(false);
    expect(k.setFees(U('p-ops'), f, { urgency: 0.5, budget: 0.5, trust: 0.5, age: 0.5 }, k.db.matchWeights).ok).toBe(false);
    expect(k.setFees(U('p-ops'), f, k.db.priorityWeights, k.db.matchWeights).ok).toBe(true);
  });
  it('keeps vendors to their own stock', () => {
    expect(k.setStock(U('v-green'), 'f1', 5).ok).toBe(false);
    expect(k.setStock(U('v-bites'), 'f1', 5).ok).toBe(true);
  });
});

describe('marketplace escrow', () => {
  it('holds a purchase in escrow, pays the seller net of fee on handover, and marks it sold', () => {
    expect(k.reserveListing(U('u-alex'), 'L-1').ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500 - 420);
    expect(k.listing('L-1')!.status).toBe('reserved');
    expect(k.reserveListing(U('u-meera'), 'L-1').ok).toBe(false); // already reserved
    expect(k.confirmHandover(U('u-riya'), 'L-1').ok).toBe(false); // seller cannot release their own payment
    expect(k.confirmHandover(U('u-alex'), 'L-1').ok).toBe(true);
    expect(k.listing('L-1')!.status).toBe('sold');
    expect(k.balance('u-riya')).toBe(2500 + 420 - Math.ceil(420 * 0.05));
    expect(k.ledger.trialBalance().balanced).toBe(true);
  });
  it('refunds in full when either side cancels, and stranger cannot', () => {
    k.reserveListing(U('u-alex'), 'L-3');
    expect(k.cancelReservation(U('u-nikhil'), 'L-3').ok).toBe(false);
    expect(k.cancelReservation(U('u-meera'), 'L-3').ok).toBe(true); // seller
    expect(k.balance('u-alex')).toBe(2500);
    expect(k.listing('L-3')!.status).toBe('active');
  });
  it('prices rentals per day, validates days, and lets the same item be rented twice', () => {
    expect(k.reserveListing(U('u-alex'), 'L-2', 0).ok).toBe(false);
    expect(k.reserveListing(U('u-alex'), 'L-2', 31).ok).toBe(false);
    expect(k.reserveListing(U('u-alex'), 'L-2', 3).ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2200);
    k.confirmHandover(U('u-alex'), 'L-2');
    expect(k.listing('L-2')!.status).toBe('active');
    expect(k.reserveListing(U('u-meera'), 'L-2', 2).ok).toBe(true); // fresh escrow account per cycle
    expect(k.ledger.trialBalance().balanced).toBe(true);
  });
  it('blocks self-purchase, vendors and underfunded buyers', () => {
    expect(k.reserveListing(U('u-riya'), 'L-1').ok).toBe(false);
    expect(k.reserveListing(U('v-bites'), 'L-1').ok).toBe(false);
    k.checkout(U('u-alex'), [{ productId: 's3', qty: 3 }], '');
    expect(k.balance('u-alex')).toBe(130);
    expect(k.reserveListing(U('u-alex'), 'L-1').ok).toBe(false); // 420 KC > 130 KC
  });
  it('only the seller can withdraw, and only when not reserved', () => {
    expect(k.withdrawListing(U('u-alex'), 'L-1').ok).toBe(false);
    expect(k.withdrawListing(U('u-riya'), 'L-1').ok).toBe(true);
    expect(k.reserveListing(U('u-alex'), 'L-1').ok).toBe(false);
  });
});

describe('events', () => {
  it('only approved events can be joined; paid tickets credit the host net of commission', () => {
    expect(k.registerEvent(U('u-alex'), 'E-4').ok).toBe(false); // pending
    expect(k.registerEvent(U('u-alex'), 'E-1').ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2380);
    expect(k.balance('u-nikhil')).toBe(2500 + 120 - Math.ceil(120 * 0.03));
    expect(k.registerEvent(U('u-alex'), 'E-1').ok).toBe(false); // duplicate
    expect(k.registerEvent(U('u-nikhil'), 'E-1').ok).toBe(false); // host
    expect(k.db.tickets[0].code).toMatch(/^KRT-/);
  });
  it('free events cost nothing; seat limits are enforced', () => {
    expect(k.registerEvent(U('u-alex'), 'E-2').ok).toBe(true);
    expect(k.balance('u-alex')).toBe(2500);
    k.db.events.find(e => e.id === 'E-3')!.seats = 1;
    expect(k.registerEvent(U('u-alex'), 'E-3').ok).toBe(true);
    expect(k.registerEvent(U('u-meera'), 'E-3').ok).toBe(false);
  });
  it('submission goes through campus admin approval', () => {
    const d = { name: 'Quiz', desc: 'Fun', place: 'Hall', date: Date.now() + 86_400_000, price: 0, seats: 10 };
    expect(k.submitEvent(U('v-bites'), d).ok).toBe(false);
    expect(k.submitEvent(U('u-alex'), { ...d, date: Date.now() - 1000 }).ok).toBe(false);
    expect(k.submitEvent(U('u-alex'), d).ok).toBe(true);
    const id = k.db.events[0].id;
    expect(k.reviewEvent(U('u-alex'), id, true).ok).toBe(false);
    expect(k.reviewEvent(U('a-dean'), id, true).ok).toBe(true);
    expect(k.registerEvent(U('u-meera'), id).ok).toBe(true);
  });
});

describe('vendor onboarding and catalog', () => {
  it('approving an application creates a working store and login', () => {
    expect(k.registerVendor(U('u-alex'), { name: 'X', ownerName: 'Y', type: 'canteen' }).ok).toBe(false);
    expect(k.registerVendor(U('a-dean'), { name: 'Campus Bites', ownerName: 'Dup', type: 'canteen' }).ok).toBe(false);
    expect(k.reviewVendor(U('a-dean'), 'VA-1', true).ok).toBe(true);
    const store = k.db.stores.find(s => s.name === 'Night Owl Café')!;
    const owner = k.user(store.vendorId)!;
    expect(owner.storeType).toBe('canteen');
    expect(k.addProduct(owner, { name: 'Chai', price: 20, stock: 50, desc: 'Hot' }).ok).toBe(true);
    expect(k.db.products.at(-1)).toMatchObject({ storeId: store.id, category: 'food' });
    expect(k.addProduct(U('v-xerox'), { name: 'x', price: 1, stock: 1, desc: 'x' }).ok).toBe(false);
    expect(k.addProduct(U('u-alex'), { name: 'x', price: 1, stock: 1, desc: 'x' }).ok).toBe(false);
  });
});
