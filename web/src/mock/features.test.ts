import { beforeEach, describe, expect, it } from 'vitest';
import { Kart, seed } from './db';

let k: Kart;
const U = (id: string) => k.user(id)!;
const hours = (h: number) => Date.now() + h * 3_600_000;

beforeEach(() => { k = new Kart(seed()); });

const draft = (over = {}) => ({
  kind: 'normal' as const, title: 'Proofread report', description: 'Please proofread', category: 'Academic help',
  budget: 200, deadline: hours(24), anonymous: false, milestones: [{ title: 'Proofread', share: 100 }], ...over,
});

/** Post, bid (as Riya), accept, work and approve a task through to completion. */
function finish(taskId: string, bidder = 'u-riya') {
  const t = k.task(taskId)!;
  k.placeBid(U(bidder), t.id, { amount: t.budget, etaHours: 2, note: 'ok' });
  k.acceptBid(U(t.posterId), t.id, t.bids[0].id);
  k.startWork(U(bidder), t.id);
  k.submitWork(U(bidder), t.id);
  return k.approveMilestone(U(t.posterId), t.id);
}
const post = (over = {}) => {
  const r = k.postTask(U('u-alex'), draft(over));
  if (!r.ok) throw new Error(r.error);
  return k.task(r.taskId)!;
};

describe('attachments', () => {
  it('stores validated metadata on tasks and print jobs', () => {
    const t = post({ files: [{ name: '../notes.pdf', size: 1200 }] });
    expect(t.attachments).toMatchObject([{ name: 'notes.pdf', type: 'pdf', size: 1200 }]);
    expect(k.postTask(U('u-alex'), draft({ files: [{ name: 'virus.exe', size: 5 }] })).ok).toBe(false);

    const base = { doc: 'a', pages: 2, copies: 1, color: false, duplex: false, spiral: false };
    expect(k.printRequest(U('u-alex'), 'st-xerox', { ...base, file: { name: 'a.pdf', size: 100 } }).ok).toBe(true);
    expect(k.db.orders[0].files?.[0].name).toBe('a.pdf');
    expect(k.printRequest(U('u-alex'), 'st-xerox', { ...base, file: { name: 'a.zip', size: 100 } }).ok).toBe(false);
  });
  it('allows a file-only chat message but rejects an empty one', () => {
    const key = 'T-209:u-nikhil';
    expect(k.sendMessage(U('u-meera'), key, '  ').ok).toBe(false);
    expect(k.sendMessage(U('u-meera'), key, '', [{ name: 'brief.docx', size: 900 }]).ok).toBe(true);
    expect(k.db.messages.at(-1)!.attachments?.[0].name).toBe('brief.docx');
    expect(k.sendMessage(U('u-meera'), key, 'x', [{ name: 'brief.sh', size: 9 }]).ok).toBe(false);
  });
  it('records delivery notes and files with a submitted milestone', () => {
    const t = post();
    k.placeBid(U('u-riya'), t.id, { amount: 200, etaHours: 2, note: 'ok' });
    k.acceptBid(U('u-alex'), t.id, t.bids[0].id);
    k.startWork(U('u-riya'), t.id);
    expect(k.submitWork(U('u-riya'), t.id, { note: 'x'.repeat(301) }).ok).toBe(false);
    expect(k.submitWork(U('u-riya'), t.id, { note: 'Done', files: [{ name: 'final.pdf', size: 5000 }] }).ok).toBe(true);
    expect(t.milestones[0]).toMatchObject({ note: 'Done', status: 'submitted' });
    expect(t.milestones[0].deliverables?.[0].name).toBe('final.pdf');
  });
});

describe('counter-offers', () => {
  const setup = () => {
    const t = k.task('T-209')!;
    return { t, key: `${t.id}:u-nikhil`, bid: t.bids[0] };
  };
  it('poster proposes, provider accepts, and the bid terms change', () => {
    const { key, bid } = setup();
    expect(k.sendQuote(U('u-meera'), key, { amount: 300, etaHours: 8 }).ok).toBe(true);
    const m = k.db.messages.at(-1)!;
    expect(m.quote).toMatchObject({ amount: 300, status: 'pending', by: 'u-meera' });
    expect(k.respondQuote(U('u-meera'), m.id, true).ok).toBe(false); // cannot accept own offer
    expect(k.respondQuote(U('u-riya'), m.id, true).ok).toBe(false); // outsider
    expect(k.respondQuote(U('u-nikhil'), m.id, true).ok).toBe(true);
    expect(bid).toMatchObject({ amount: 300, etaHours: 8 });
    expect(m.quote!.status).toBe('accepted');
    expect(k.respondQuote(U('u-nikhil'), m.id, true).ok).toBe(false); // already settled
  });
  it('provider can counter and the poster can decline', () => {
    const { key, bid } = setup();
    k.sendQuote(U('u-nikhil'), key, { amount: 340, etaHours: 6 });
    const m = k.db.messages.at(-1)!;
    expect(k.respondQuote(U('u-meera'), m.id, false).ok).toBe(true);
    expect(m.quote!.status).toBe('declined');
    expect(bid.amount).toBe(320);
  });
  it('a newer offer supersedes the older one; identical terms and bad numbers are refused', () => {
    const { key } = setup();
    expect(k.sendQuote(U('u-meera'), key, { amount: 320, etaHours: 10 }).ok).toBe(false);
    expect(k.sendQuote(U('u-meera'), key, { amount: 0, etaHours: 10 }).ok).toBe(false);
    k.sendQuote(U('u-meera'), key, { amount: 300, etaHours: 8 });
    const first = k.db.messages.at(-1)!;
    k.sendQuote(U('u-meera'), key, { amount: 280, etaHours: 8 });
    expect(first.quote!.status).toBe('superseded');
    expect(k.respondQuote(U('u-nikhil'), first.id, true).ok).toBe(false);
  });
  it('the agreed amount is what goes into escrow, and offers stop once the bid is accepted', () => {
    const { t, key, bid } = setup();
    k.sendQuote(U('u-nikhil'), key, { amount: 250, etaHours: 5 });
    k.respondQuote(U('u-meera'), k.db.messages.at(-1)!.id, true);
    k.acceptBid(U('u-meera'), t.id, bid.id);
    expect(k.ledger.balance('TASK_ESCROW:' + t.id)).toBe(250);
    expect(k.sendQuote(U('u-nikhil'), key, { amount: 100, etaHours: 1 }).ok).toBe(false);
  });
  it('a pending offer expires when the bid is accepted at the old terms', () => {
    const { t, key, bid } = setup();
    k.sendQuote(U('u-nikhil'), key, { amount: 200, etaHours: 5 });
    const m = k.db.messages.at(-1)!;
    k.acceptBid(U('u-meera'), t.id, bid.id);
    expect(m.quote!.status).toBe('expired');
    expect(k.ledger.balance('TASK_ESCROW:' + t.id)).toBe(320);
  });
  it('admins cannot make offers', () => {
    expect(k.sendQuote(U('p-ops'), 'T-209:u-nikhil', { amount: 10, etaHours: 1 }).ok).toBe(false);
  });
});

describe('scheduled tasks', () => {
  it('blocks starting work before the scheduled time and validates the start', () => {
    expect(k.postTask(U('u-alex'), draft({ startAt: Date.now() - 1000 })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ startAt: hours(30) })).ok).toBe(false); // after the deadline
    const t = post({ startAt: hours(6) });
    k.placeBid(U('u-riya'), t.id, { amount: 200, etaHours: 2, note: 'ok' });
    k.acceptBid(U('u-alex'), t.id, t.bids[0].id);
    const early = k.startWork(U('u-riya'), t.id);
    expect(!early.ok && early.error).toMatch(/scheduled/);
    t.startAt = Date.now() - 1000;
    expect(k.startWork(U('u-riya'), t.id).ok).toBe(true);
  });
});

describe('recurring tasks', () => {
  it('posts the next occurrence when one completes, and stops after the last', () => {
    const first = post({ recurrence: { every: 'weekly', total: 3 }, deadline: hours(60) });
    expect(first.recurrence).toMatchObject({ index: 1, total: 3 });
    const before = k.db.tasks.length;
    finish(first.id);
    expect(k.db.tasks.length).toBe(before + 1);
    const second = k.db.tasks[0];
    expect(second).toMatchObject({ status: 'open', recurrence: { index: 2, total: 3, seriesId: first.id } });
    expect(second.bids).toHaveLength(0);
    expect(second.deadline).toBeGreaterThan(first.deadline);
    expect(second.milestones.every(m => m.status === 'pending' && m.amount === 0)).toBe(true);
    finish(second.id);
    const third = k.db.tasks[0];
    expect(third.recurrence!.index).toBe(3);
    finish(third.id);
    expect(k.db.tasks[0].id).toBe(third.id); // series ended: no fourth
  });
  it('a cancelled occurrence does not spawn another', () => {
    const t = post({ recurrence: { every: 'daily', total: 2 } });
    const n = k.db.tasks.length;
    k.cancelTask(U('u-alex'), t.id);
    expect(k.db.tasks.length).toBe(n);
  });
  it('rejects urgent or out-of-range repeats', () => {
    expect(k.postTask(U('u-alex'), draft({ kind: 'urgent', deadline: hours(3), recurrence: { every: 'daily', total: 2 } })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ recurrence: { every: 'daily', total: 1 } })).ok).toBe(false);
    expect(k.postTask(U('u-alex'), draft({ recurrence: { every: 'daily', total: 13 } })).ok).toBe(false);
  });
});

describe('linked workflows', () => {
  const steps = [
    { title: 'Buy A4 pads', description: 'From Scholars Store', category: 'Pickup', budget: 80, hours: 2 },
    { title: 'Deliver to Hostel C', description: 'Bring them over', category: 'Delivery', budget: 60, hours: 3 },
  ];
  it('creates ordered tasks; a later step cannot take bids until the earlier one completes', () => {
    expect(k.createWorkflow(U('u-alex'), { title: 'Stationery run', steps }).ok).toBe(true);
    const [s1, s2] = k.db.workflows[0].taskIds.map(id => k.task(id)!);
    expect([s1.step, s2.step]).toEqual([1, 2]);
    expect(k.isLocked(s1)).toBe(false);
    expect(k.isLocked(s2)).toBe(true);
    expect(k.placeBid(U('u-riya'), s2.id, { amount: 60, etaHours: 1, note: 'x' }).ok).toBe(false);

    finish(s1.id);
    expect(k.isLocked(s2)).toBe(false);
    expect(k.placeBid(U('u-riya'), s2.id, { amount: 60, etaHours: 1, note: 'x' }).ok).toBe(true);
    expect(k.db.notifications.some(n => n.text.includes('Step 2'))).toBe(true);
  });
  it('cancelling a step cancels the steps that were waiting on it', () => {
    k.createWorkflow(U('u-alex'), { title: 'Run', steps });
    const [s1, s2] = k.db.workflows[0].taskIds.map(id => k.task(id)!);
    k.cancelTask(U('u-alex'), s1.id);
    expect(s2.status).toBe('cancelled');
  });
  it('validates step count, total time, total budget and linked order ownership', () => {
    expect(k.createWorkflow(U('u-alex'), { title: 'x', steps: [steps[0]] }).ok).toBe(false);
    expect(k.createWorkflow(U('u-alex'), { title: 'x', steps: [{ ...steps[0], hours: 50 }, { ...steps[1], hours: 30 }] }).ok).toBe(false);
    expect(k.createWorkflow(U('u-alex'), { title: 'x', steps: [{ ...steps[0], budget: 2000 }, { ...steps[1], budget: 1000 }] }).ok).toBe(false);
    expect(k.createWorkflow(U('u-alex'), { title: 'x', steps, orderRef: 'KRT-nope' }).ok).toBe(false);
    k.checkout(U('u-alex'), [{ productId: 's2', qty: 1 }], '');
    const own = k.db.orders[0].id;
    expect(k.createWorkflow(U('u-alex'), { title: 'Collect and deliver', steps, orderRef: own }).ok).toBe(true);
    expect(k.createWorkflow(U('u-meera'), { title: 'x', steps, orderRef: own }).ok).toBe(false);
    expect(k.createWorkflow(U('v-bites'), { title: 'x', steps }).ok).toBe(false);
  });
});

describe('reviews and reputation', () => {
  it('both sides review once, and ratings update the weighted average', () => {
    const t = post();
    finish(t.id);
    const p = k.profile('u-riya')!;
    const before = { rating: p.rating, count: p.ratingCount };
    expect(k.reviewableTasks('u-alex').map(x => x.task.id)).toContain(t.id);
    expect(k.reviewTask(U('u-alex'), t.id, 0, '').ok).toBe(false);
    expect(k.reviewTask(U('u-alex'), t.id, 3, 'x'.repeat(301)).ok).toBe(false);
    expect(k.reviewTask(U('u-alex'), t.id, 3, 'Fine').ok).toBe(true);
    expect(p.ratingCount).toBe(before.count + 1);
    expect(p.rating).toBeCloseTo((before.rating * before.count + 3) / (before.count + 1), 1);
    expect(k.reviewTask(U('u-alex'), t.id, 5, '').ok).toBe(false); // once only
    expect(k.reviewTask(U('u-riya'), t.id, 5, 'Great poster').ok).toBe(true);
    expect(k.reviewableTasks('u-alex')).toHaveLength(0);
    expect(k.reviewsFor('u-riya', 'provider')).toHaveLength(1);
  });
  it('outsiders and unfinished tasks cannot be reviewed', () => {
    const t = post();
    finish(t.id);
    expect(k.reviewTask(U('u-meera'), t.id, 5, '').ok).toBe(false);
    expect(k.reviewTask(U('u-alex'), 'T-209', 5, '').ok).toBe(false);
  });
  it('creates a profile on first review', () => {
    const t = post();
    finish(t.id);
    k.db.profiles = k.db.profiles.filter(p => p.userId !== 'u-alex');
    k.reviewTask(U('u-riya'), t.id, 5, '');
    expect(k.profile('u-alex')).toMatchObject({ rating: 5, ratingCount: 1 });
  });
  it('store reviews need a collected order, one per order, and average per store', () => {
    k.checkout(U('u-alex'), [{ productId: 'f1', qty: 1 }], '');
    const id = k.db.orders[0].id;
    expect(k.reviewOrder(U('u-alex'), id, 5, '').ok).toBe(false); // not collected yet
    for (let i = 0; i < 3; i++) k.advanceOrder(U('v-bites'), id);
    expect(k.reviewOrder(U('u-meera'), id, 5, '').ok).toBe(false);
    expect(k.reviewOrder(U('u-alex'), id, 4, 'Quick').ok).toBe(true);
    expect(k.reviewOrder(U('u-alex'), id, 5, '').ok).toBe(false);
    expect(k.storeRating('st-bites')).toEqual({ count: 1, average: 4 });
    expect(k.storeRating('st-green')).toEqual({ count: 0, average: 0 });
  });
});

describe('notifications', () => {
  it('are per user, carry links, and can be marked read by their owner only', () => {
    k.checkout(U('u-alex'), [{ productId: 'f1', qty: 1 }], '');
    const n = k.notificationsFor('v-bites')[0];
    expect(n).toMatchObject({ read: false, href: '/vendor/queue' });
    expect(k.unreadCount('v-bites')).toBe(1);
    expect(k.markNotificationRead(U('u-alex'), n.id).ok).toBe(false);
    expect(k.markNotificationRead(U('v-bites'), n.id).ok).toBe(true);
    expect(k.unreadCount('v-bites')).toBe(0);
    k.advanceOrder(U('v-bites'), k.db.orders[0].id);
    expect(k.unreadCount('u-alex')).toBe(1);
    k.markAllRead(U('u-alex'));
    expect(k.unreadCount('u-alex')).toBe(0);
    expect(k.unreadCount('v-bites')).toBe(0);
  });
});
