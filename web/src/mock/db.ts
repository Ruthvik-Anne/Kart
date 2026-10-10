// In-memory mock backend. Every action re-checks permissions the way the FastAPI service must,
// moves money only through the ledger, and returns { ok } instead of throwing.
import { can, type StoreType, type User } from '@/rbac/policy';
import { Ledger, ACCOUNTS as A, LedgerError, type JournalEntry } from '@/ledger/ledger';
import * as rules from '@/ledger/rules';
import { DEFAULT_FEES, type Fees } from '@/ledger/rules';
import { appendBlock, type Block } from '@/chain/chain';
import { promoDiscount, splitDiscount, normalizeCode, validatePromoDef, type Promo } from '@/lib/promo';
import { cleanAttachments, MAX_FILES, type Attachment, type FileLike } from '@/lib/attachments';
import { next, milestoneRule, type TaskEvent, type TaskStatus } from '@/domain/taskMachine';
import {
  DEFAULT_MATCH_WEIGHTS, DEFAULT_PRIORITY_WEIGHTS, matchScore, priorityScore,
  type MatchWeights, type PriorityWeights, type TaskKind,
} from '@/lib/scoring';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const HOUR = 3_600_000;
const newCode = () => crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();

export interface Store { id: string; name: string; type: StoreType; vendorId: string; open: boolean }
export interface Product { id: string; storeId: string; name: string; price: number; icon: string; desc: string; stock: number; category: 'food' | 'shop'; mrp?: number }
export interface CartLine { productId: string; qty: number }
export type OrderStatus = 'Placed' | 'Preparing' | 'Ready' | 'Out for delivery' | 'Collected' | 'Cancelled';
export interface Order {
  id: string; buyerId: string; storeId: string; kind: 'food' | 'shop' | 'print'; title: string;
  amount: number; status: OrderStatus; ts: number; window?: string; files?: Attachment[];
  productIds?: string[]; discount?: number; promoCode?: string;
  fulfillment?: 'pickup' | 'delivery'; deliveryDetails?: string; handoverCode?: string;
  paymentMethod?: 'wallet' | 'pay_on_handover'; items?: CartLine[]; runnerId?: string;
}
export type PaperSize = 'A4' | 'A3' | 'Legal' | 'Letter';
export type Binding = 'none' | 'spiral' | 'staple' | 'comb';
export type Lamination = 'none' | 'normal' | 'id';
export const PAPER_RATES: Record<PaperSize, number> = { A4: 1, Letter: 1.25, Legal: 1.25, A3: 1.75 };
export const BINDING_COST: Record<Binding, number> = { none: 0, staple: 5, comb: 25, spiral: 30 };
export const LAMINATION_COST: Record<Lamination, number> = { none: 0, normal: 15, id: 25 };
export interface PrintSpec {
  doc: string; pages: number; copies: number; color: boolean; duplex: boolean; spiral: boolean;
  file?: FileLike; files?: FileLike[]; paper?: PaperSize; binding?: Binding; lamination?: Lamination;
  notes?: string; window?: string; fulfillment?: 'pickup' | 'delivery'; deliveryDetails?: string;
}
export interface Milestone {
  id: string; title: string; share: number; amount: number; status: 'pending' | 'submitted' | 'released';
  deliverables?: Attachment[]; note?: string;
}
export interface Bid { id: string; providerId: string; amount: number; etaHours: number; note: string; ts: number }
export interface Task {
  id: string; kind: TaskKind; title: string; description: string; category: string; budget: number;
  deadline: number; createdAt: number; posterId: string; anonymous: boolean; status: TaskStatus;
  assigneeId?: string; acceptedAmount?: number; milestones: Milestone[]; bids: Bid[]; disputeReason?: string;
  disputedBy?: string;
  completedAt?: number; orderRef?: string;
  attachments: Attachment[];
  startAt?: number;                       // scheduled tasks: work cannot start before this
  recurrence?: Recurrence;                // repeating series; the next occurrence is posted when one completes
  workflowId?: string; step?: number;     // linked workflow: step n waits for step n-1
}
export interface Recurrence { every: 'daily' | 'weekly'; total: number; index: number; seriesId: string }
export interface Quote { bidId: string; amount: number; etaHours: number; by: string; status: 'pending' | 'accepted' | 'declined' | 'superseded' | 'expired' }
export interface Message {
  id: string; threadKey: string; senderId: string; body: string; kind: 'text' | 'system' | 'quote'; ts: number;
  attachments?: Attachment[]; quote?: Quote;
}
export interface Review {
  id: string; kind: 'task' | 'order' | 'product'; refId: string; fromId: string; toId: string; as: 'provider' | 'poster' | 'store';
  storeId?: string; rating: number; comment: string; ts: number;
}
export interface TaskDraft {
  kind: TaskKind; title: string; description: string; category: string; budget: number; deadline: number; anonymous: boolean;
  milestones: { title: string; share: number }[]; files?: FileLike[]; startAt?: number;
  recurrence?: { every: 'daily' | 'weekly'; total: number }; orderRef?: string;
}
export interface WorkflowStepDraft { title: string; description: string; category: string; budget: number; hours: number }
export interface Workflow { id: string; ownerId: string; title: string; taskIds: string[]; orderRef?: string; createdAt: number }
export interface ProviderProfile { userId: string; rating: number; ratingCount: number; availability: number; completed: Record<string, number> }
export interface ServiceListing { id: string; providerId: string; name: string; price: number; unit: string; desc: string; icon: string }
export interface Notification { id: string; userId: string; text: string; ts: number; read: boolean; href?: string }
export interface AuditNote { id: string; ts: number; actorId: string; text: string }
export interface VerificationRequest { id: string; userId: string; kind: 'student' | 'provider'; status: 'pending' | 'approved' | 'rejected' }

export interface Listing {
  id: string; sellerId: string; kind: 'sale' | 'rent'; name: string; price: number; condition: string; desc: string; icon: string;
  status: 'active' | 'reserved' | 'sold' | 'withdrawn'; buyerId?: string; days?: number; amount?: number;
  cycle: number; // bumps on every reservation so each escrow account is unique, even when a rental is re-booked
}
export interface CampusEvent {
  id: string; hostId: string; name: string; desc: string; icon: string; place: string; date: number;
  price: number; seats: number; status: 'pending' | 'approved' | 'rejected';
}
export interface Ticket { id: string; eventId: string; userId: string; ts: number; code: string }
export interface VendorApp { id: string; name: string; type: StoreType; ownerName: string; status: 'pending' | 'approved' | 'rejected' }

export interface PromoUse { code: string; userId: string; orderId: string }
export interface WishItem { userId: string; productId: string; ts: number }

export interface Db {
  promos: Promo[];
  promoUses: PromoUse[];
  wishlist: WishItem[];
  reviews: Review[];
  workflows: Workflow[];
  listings: Listing[];
  events: CampusEvent[];
  tickets: Ticket[];
  vendorApps: VendorApp[];
  users: User[];
  stores: Store[];
  products: Product[];
  orders: Order[];
  tasks: Task[];
  messages: Message[];
  profiles: ProviderProfile[];
  services: ServiceListing[];
  notifications: Notification[];
  audit: AuditNote[];
  verifications: VerificationRequest[];
  entries: JournalEntry[];
  chain: Block[];
  fees: Fees;
  priorityWeights: PriorityWeights;
  matchWeights: MatchWeights;
  seq: number;
}

/** Runtime handle: db data plus the Ledger rebuilt from entries (not serialised). */
export class Kart {
  ledger = new Ledger();
  constructor(public db: Db) {
    this.ledger.entries.push(...db.entries);
  }

  // ---------- helpers ----------
  private id(prefix: string) { return `${prefix}-${++this.db.seq}`; }
  user(id: string) { return this.db.users.find(u => u.id === id); }
  task(id: string) { return this.db.tasks.find(t => t.id === id); }
  store(id: string) { return this.db.stores.find(s => s.id === id); }
  profile(userId: string) { return this.db.profiles.find(p => p.userId === userId); }
  balance(userId: string) { return this.ledger.balance(A.wallet(userId)); }
  private sync() { this.db.entries = this.ledger.entries; }
  private notify(userId: string, text: string, href?: string) {
    this.db.notifications.unshift({ id: this.id('N'), userId, text, ts: Date.now(), read: false, href });
    if (this.db.notifications.length > 400) this.db.notifications.length = 400;
  }
  private post(input: Parameters<Ledger['post']>[0]): string | null {
    try { this.ledger.post(input); this.sync(); return null; }
    catch (e) { return e instanceof LedgerError ? e.message : 'Ledger error.'; }
  }
  private system(threadKey: string, body: string) {
    this.db.messages.push({ id: this.id('M'), threadKey, senderId: 'system', body, kind: 'system', ts: Date.now() });
  }

  // ---------- wallet ----------
  topUp(actor: User, amount: number): Result {
    if (!can(actor, 'wallet:view:own')) return fail('Not allowed.');
    if (!Number.isInteger(amount) || amount <= 0 || amount > 50_000) return fail('Enter an amount from 1 to 50,000 KC.');
    const err = this.post(rules.topUp(actor.id, amount, this.id('TU')));
    return err ? fail(err) : { ok: true };
  }

  // ---------- commerce ----------
  /** Which promo (if any) applies to these lines for this user, and what it takes off. */
  private resolvePromo(actor: User, code: string | undefined, subtotal: number): { error: string } | { promo?: Promo; discount: number } {
    if (!code || !code.trim()) return { discount: 0 };
    const promo = this.db.promos.find(x => x.code === normalizeCode(code));
    if (!promo || !promo.active) return { error: 'That code is not valid.' };
    if (this.db.promoUses.some(u => u.code === promo.code && u.userId === actor.id)) return { error: 'You have already used that code.' };
    if (promo.maxUses !== undefined && this.db.promoUses.filter(u => u.code === promo.code).length >= promo.maxUses) return { error: 'That code has been fully redeemed.' };
    if (subtotal < promo.min) return { error: 'Add ' + (promo.min - subtotal) + ' KC more to use ' + promo.code + '.' };
    return { promo, discount: promoDiscount(promo, subtotal) };
  }

  private cartSubtotal(lines: CartLine[]): number {
    return lines.reduce((a, l) => a + (this.db.products.find(p => p.id === l.productId)?.price ?? 0) * (Number.isInteger(l.qty) ? l.qty : 0), 0);
  }

  previewPromo(actor: User, lines: CartLine[], code: string): Result<{ discount: number; label: string; code: string }> {
    const subtotal = this.cartSubtotal(lines);
    const r = this.resolvePromo(actor, code, subtotal);
    if ('error' in r) return fail(r.error);
    if (!r.promo) return fail('Enter a code.');
    return { ok: true, discount: r.discount, label: r.promo.label, code: r.promo.code };
  }

  checkout(actor: User, lines: CartLine[], window: string, promoCode?: string,
    fulfillment: 'pickup' | 'delivery' = 'pickup', deliveryDetails = ''): Result<{ orderIds: string[]; discount: number }> {
    if (!can(actor, 'order:create')) return fail('Not allowed.');
    if (!lines.length) return fail('Your cart is empty.');
    if (fulfillment !== 'pickup' && fulfillment !== 'delivery') return fail('Choose pickup or delivery.');
    if (fulfillment === 'delivery' && (!deliveryDetails.trim() || deliveryDetails.length > 200)) return fail('Enter delivery instructions (up to 200 characters).');
    const byStore = new Map<string, { product: Product; qty: number }[]>();
    for (const l of lines) {
      const product = this.db.products.find(p => p.id === l.productId);
      if (!product || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 50) return fail('Invalid cart line.');
      if (product.stock < l.qty) return fail(`${product.name} only has ${product.stock} left.`);
      if (!this.store(product.storeId)?.open) return fail(`${this.store(product.storeId)?.name ?? 'Store'} is closed.`);
      byStore.set(product.storeId, [...(byStore.get(product.storeId) ?? []), { product, qty: l.qty }]);
    }
    const total = [...byStore.values()].flat().reduce((a, l) => a + l.product.price * l.qty, 0);
    const pr = this.resolvePromo(actor, promoCode, total);
    if ('error' in pr) return fail(pr.error);
    if (this.balance(actor.id) < total - pr.discount) return fail('Not enough KC. Top up your wallet first.');
    const stores = [...byStore.entries()];
    const shares = splitDiscount(pr.discount, stores.map(([, items]) => items.reduce((a, l) => a + l.product.price * l.qty, 0)));
    const orderIds: string[] = [];
    for (const [n, [storeId, items]] of stores.entries()) {
      const store = this.store(storeId)!;
      const amount = items.reduce((a, l) => a + l.product.price * l.qty, 0);
      const discount = shares[n];
      const id = this.id('KRT');
      const err = this.post(rules.checkout(id, actor.id, store.vendorId, amount, this.db.fees, discount));
      if (err) return fail(err);
      items.forEach(l => { l.product.stock -= l.qty; });
      if (pr.promo && discount > 0) this.db.promoUses.push({ code: pr.promo.code, userId: actor.id, orderId: id });
      this.db.orders.unshift({
        id, buyerId: actor.id, storeId, kind: items[0].product.category, amount, status: 'Placed', ts: Date.now(), window,
        productIds: items.map(l => l.product.id), discount: discount || undefined, promoCode: discount && pr.promo ? pr.promo.code : undefined,
        fulfillment, deliveryDetails: fulfillment === 'delivery' ? deliveryDetails.trim() : undefined,
        paymentMethod: 'wallet', handoverCode: newCode(),
        items: items.map(l => ({ productId: l.product.id, qty: l.qty })),
        title: items.map(l => `${l.product.name}${l.qty > 1 ? ` × ${l.qty}` : ''}`).join(', '),
      });
      this.notify(store.vendorId, `New order ${id} · ${amount} KC`, '/vendor/queue');
      orderIds.push(id);
    }
    return { ok: true, orderIds, discount: pr.discount };
  }

  printRequest(actor: User, storeId: string, p: PrintSpec): Result<{ orderId: string; code: string }> {
    if (!can(actor, 'print:create')) return fail('Not allowed.');
    const store = this.store(storeId);
    if (!store || store.type !== 'xerox' || !store.open) return fail('Choose an open print shop.');
    const att = cleanAttachments([...(p.files ?? []), ...(p.file ? [p.file] : [])]);
    if (!att.ok) return fail(att.error);
    const doc = p.doc.trim();
    if (!doc || doc.length > 80) return fail('Enter a document name (up to 80 characters).');
    if (![p.pages, p.copies].every(Number.isInteger) || p.pages < 1 || p.pages > 500 || p.copies < 1 || p.copies > 20) return fail('Pages 1-500, copies 1-20.');
    const sheets = p.duplex ? Math.ceil(p.pages / 2) : p.pages;
    const paper = p.paper ?? 'A4';
    const binding = p.binding ?? (p.spiral ? 'spiral' : 'none');
    const lamination = p.lamination ?? 'none';
    if (!(paper in PAPER_RATES) || !(binding in BINDING_COST) || !(lamination in LAMINATION_COST)) return fail('Choose valid print options.');
    const fulfillment = p.fulfillment ?? 'pickup';
    if (fulfillment === 'delivery' && (!p.deliveryDetails?.trim() || p.deliveryDetails.length > 200)) return fail('Enter delivery instructions.');
    if (p.window && p.window.length > 80) return fail('Choose a pickup or delivery time.');
    if ((p.notes ?? '').length > 300) return fail('Keep print instructions under 300 characters.');
    const amount = Math.round(sheets * p.copies * (p.color ? 8 : 2) * PAPER_RATES[paper]) + BINDING_COST[binding] + LAMINATION_COST[lamination];
    const id = this.id('PRT');
    const handoverCode = newCode();
    const err = this.post(rules.checkout(id, actor.id, store.vendorId, amount, this.db.fees));
    if (err) return fail(err);
    this.db.orders.unshift({ id, buyerId: actor.id, storeId, kind: 'print', amount, status: 'Placed', ts: Date.now(),
      files: att.files.map(f => ({ ...f, id: this.id('F') })),
      window: p.window, fulfillment, deliveryDetails: fulfillment === 'delivery' ? p.deliveryDetails?.trim() : undefined,
      paymentMethod: 'wallet', handoverCode,
      title: `Print: ${doc} (${p.pages}p × ${p.copies}${p.color ? ', colour' : ''}${p.duplex ? ', duplex' : ''}${p.spiral ? ', spiral' : ''})` });
    this.notify(store.vendorId, `New print job ${id}`, '/vendor/print-queue');
    return { ok: true, orderId: id, code: handoverCode };
  }

  placePrintOrder(actor: User, storeId: string, p: PrintSpec, files: Attachment[]): Result<{ orderId: string; code: string }> {
    if (!files.length || files.length > MAX_FILES) return fail('Attach at least one document.');
    const result = this.printRequest(actor, storeId, { ...p, files: [] });
    if (!result.ok) return result;
    const order = this.db.orders.find(o => o.id === result.orderId)!;
    order.files = files;
    return result;
  }

  advanceOrder(actor: User, orderId: string): Result {
    const o = this.db.orders.find(x => x.id === orderId);
    if (!o) return fail('Order not found.');
    if (!can(actor, 'store:orders:update', { storeId: o.storeId })) return fail('This order belongs to another store.');
    if (o.status === 'Out for delivery') return fail('The delivery runner completes this order with the customer code.');
    const flow: OrderStatus[] = ['Placed', 'Preparing', 'Ready', 'Collected'];
    const i = flow.indexOf(o.status);
    if (i < 0 || i === flow.length - 1) return fail('Order cannot advance.');
    if (o.status === 'Ready' && o.handoverCode) return fail('Verify the handover code to complete this order.');
    o.status = flow[i + 1];
    this.notify(o.buyerId, `Order ${o.id} is now ${o.status.toLowerCase()}`, '/orders');
    return { ok: true };
  }

  verifyHandover(actor: User, orderId: string, code: string): Result {
    const o = this.db.orders.find(x => x.id === orderId);
    if (!o || !can(actor, 'store:orders:update', { storeId: o.storeId })) return fail('Order not found.');
    if (o.status !== 'Ready' || o.fulfillment === 'delivery') return fail('This order is not ready for pickup.');
    if (!o.handoverCode || code.trim().toUpperCase() !== o.handoverCode) return fail('The handover code does not match.');
    o.status = 'Collected';
    this.notify(o.buyerId, `Order ${o.id} was handed over`, '/orders');
    return { ok: true };
  }

  acceptDelivery(actor: User, orderId: string): Result {
    if (!can(actor, 'order:deliver')) return fail('Not allowed.');
    const o = this.db.orders.find(x => x.id === orderId);
    if (!o || o.fulfillment !== 'delivery' || o.status !== 'Ready') return fail('Delivery is not ready.');
    if (o.runnerId || o.buyerId === actor.id) return fail('This delivery is unavailable.');
    o.runnerId = actor.id;
    this.notify(o.buyerId, `${actor.name} is collecting order ${o.id}`, '/orders');
    this.notify(this.store(o.storeId)!.vendorId, `${actor.name} will collect order ${o.id}`, '/vendor/queue');
    return { ok: true };
  }

  handoverToRunner(actor: User, orderId: string): Result {
    const o = this.db.orders.find(x => x.id === orderId);
    if (!o || !can(actor, 'store:orders:update', { storeId: o.storeId })) return fail('Order not found.');
    if (o.status !== 'Ready' || o.fulfillment !== 'delivery' || !o.runnerId) return fail('Waiting for a runner to accept this order.');
    o.status = 'Out for delivery';
    this.notify(o.runnerId, `Collect order ${o.id} from ${this.store(o.storeId)!.name}`, '/delivery');
    this.notify(o.buyerId, `Order ${o.id} is on its way`, '/orders');
    return { ok: true };
  }

  deliverOrder(actor: User, orderId: string, code: string): Result {
    if (!can(actor, 'order:deliver')) return fail('Not allowed.');
    const o = this.db.orders.find(x => x.id === orderId);
    if (!o || o.runnerId !== actor.id || o.status !== 'Out for delivery') return fail('Collect this order from the shop first.');
    if (!o.handoverCode || code.trim().toUpperCase() !== o.handoverCode) return fail('The handover code does not match.');
    o.status = 'Collected';
    this.notify(o.buyerId, `Order ${o.id} was delivered`, '/orders');
    return { ok: true };
  }

  cancelOrder(actor: User, orderId: string): Result {
    const o = this.db.orders.find(x => x.id === orderId);
    if (!o || !can(actor, 'order:view:own', { ownerId: o.buyerId })) return fail('Order not found.');
    if (o.status !== 'Placed') return fail('Only orders that have not started can be cancelled.');
    for (const item of o.items ?? []) {
      const product = this.db.products.find(p => p.id === item.productId);
      if (product) product.stock += item.qty;
    }
    const store = this.store(o.storeId)!;
    const err = this.post(rules.orderRefund(o.id, o.buyerId, store.vendorId, o.amount, this.db.fees, o.discount ?? 0));
    if (err) return fail(err);
    o.status = 'Cancelled';
    this.db.promoUses = this.db.promoUses.filter(u => u.orderId !== o.id);
    return { ok: true };
  }

  // ---------- tasks ----------
  medianBudget(category: string) {
    const b = this.db.tasks.filter(t => t.category === category).map(t => t.budget).sort((a, c) => a - c);
    return b.length ? b[Math.floor(b.length / 2)] : 0;
  }

  priority(t: Task, now = Date.now()) {
    const completed = this.db.tasks.filter(x => x.posterId === t.posterId && x.status === 'completed').length;
    const profile = this.profile(t.posterId);
    return priorityScore({
      kind: t.kind, budget: t.budget, hoursToDeadline: Math.max(0, (t.deadline - now) / HOUR),
      hoursSincePosted: (now - t.createdAt) / HOUR, medianBudget: this.medianBudget(t.category),
      posterRating: profile && profile.ratingCount > 0 ? profile.rating : undefined, posterCompleted: completed,
    }, this.db.priorityWeights);
  }

  match(t: Task, b: Bid, now = Date.now()) {
    const p = this.profile(b.providerId);
    return matchScore({
      bid: b.amount, budget: t.budget, etaHours: b.etaHours, hoursToDeadline: Math.max(0, (t.deadline - now) / HOUR),
      rating: p?.rating ?? 0, ratingCount: p?.ratingCount ?? 0, availability: p?.availability ?? 0.5,
      completedInCategory: p?.completed[t.category] ?? 0,
    }, this.db.matchWeights);
  }

  private validateDraft(actor: User, d: TaskDraft): { error: string } | { files: Omit<Attachment, 'id'>[] } {
    if (!can(actor, 'task:post')) return { error: 'Not allowed.' };
    const title = d.title.trim(), description = d.description.trim();
    if (!title || title.length > 80 || !description || description.length > 500) return { error: 'Add a title (80 chars max) and details (500 chars max).' };
    if (!Number.isInteger(d.budget) || d.budget < 1 || d.budget > 100_000) return { error: 'Enter a budget from 1 to 100,000 KC.' };
    const hours = (d.deadline - Date.now()) / HOUR;
    if (!Number.isFinite(hours) || hours <= 0) return { error: 'Choose a future deadline.' };
    if (d.kind === 'urgent' && hours > 6) return { error: 'Urgent tasks are due within 6 hours.' };
    if (d.kind === 'normal' && hours > 72) return { error: 'Normal short-term tasks are due within 72 hours. Choose Long-term for longer work.' };
    if (d.kind === 'long_term' && hours <= 72) return { error: 'Long-term tasks run longer than 72 hours.' };
    const ms = d.kind === 'urgent' && d.milestones.length === 0 ? [{ title: 'Delivery', share: 100 }] : d.milestones;
    const rule = milestoneRule(d.kind, ms.length);
    if (rule) return { error: rule };
    if (ms.some(m => !m.title.trim() || !Number.isInteger(m.share) || m.share < 1) || ms.reduce((a, m) => a + m.share, 0) !== 100) return { error: 'Milestone shares must be whole numbers adding up to 100%.' };
    if (d.startAt !== undefined && (!Number.isFinite(d.startAt) || d.startAt <= Date.now() || d.startAt >= d.deadline)) return { error: 'The start time must be in the future and before the deadline.' };
    if (d.recurrence) {
      if (d.kind === 'urgent') return { error: 'Urgent tasks cannot repeat. Use a short-term or long-term task.' };
      if (!['daily', 'weekly'].includes(d.recurrence.every) || !Number.isInteger(d.recurrence.total) || d.recurrence.total < 2 || d.recurrence.total > 12) return { error: 'Repeat daily or weekly, 2 to 12 times in total.' };
    }
    if (d.orderRef) {
      const o = this.db.orders.find(x => x.id === d.orderRef);
      if (!o || o.buyerId !== actor.id) return { error: 'That order is not yours to link.' };
    }
    const files = cleanAttachments(d.files);
    if (!files.ok) return { error: files.error };
    return { files: files.files };
  }

  private makeTask(actor: User, d: TaskDraft, files: Omit<Attachment, 'id'>[], extra: Partial<Task> = {}): Task {
    const ms = d.kind === 'urgent' && d.milestones.length === 0 ? [{ title: 'Delivery', share: 100 }] : d.milestones;
    const task: Task = {
      id: this.id('T'), kind: d.kind, title: d.title.trim(), description: d.description.trim(), category: d.category, budget: d.budget, deadline: d.deadline,
      createdAt: Date.now(), posterId: actor.id, anonymous: d.anonymous, status: 'open', bids: [], startAt: d.startAt, orderRef: d.orderRef,
      attachments: files.map(f => ({ ...f, id: this.id('F') })),
      milestones: ms.map((m, i) => ({ id: String(i + 1), title: m.title.trim(), share: m.share, amount: 0, status: 'pending' as const })),
      ...extra,
    };
    if (d.recurrence) task.recurrence = { ...d.recurrence, index: 1, seriesId: task.id };
    return task;
  }

  postTask(actor: User, d: TaskDraft): Result<{ taskId: string }> {
    const v = this.validateDraft(actor, d);
    if ('error' in v) return fail(v.error);
    if (this.balance(actor.id) < d.budget) return fail('Your wallet needs at least the budget in KC before posting (escrow is reserved when you accept a bid).');
    const t = this.makeTask(actor, d, v.files);
    this.db.tasks.unshift(t);
    return { ok: true, taskId: t.id };
  }

  // ---------- linked workflows: ordered steps, each unlocking when the previous completes ----------
  isLocked(t: Task): boolean {
    if (!t.workflowId || (t.step ?? 1) <= 1) return false;
    const prev = this.db.tasks.find(x => x.workflowId === t.workflowId && x.step === (t.step ?? 1) - 1);
    return prev?.status !== 'completed';
  }

  createWorkflow(actor: User, d: { title: string; steps: WorkflowStepDraft[]; orderRef?: string }): Result<{ workflowId: string }> {
    if (!can(actor, 'task:post')) return fail('Not allowed.');
    const title = d.title.trim();
    if (!title || title.length > 80) return fail('Name the workflow (80 chars max).');
    if (d.steps.length < 2 || d.steps.length > 4) return fail('A linked workflow has 2 to 4 steps.');
    let cumulative = 0;
    const drafts: TaskDraft[] = [];
    for (const [i, st] of d.steps.entries()) {
      if (!Number.isFinite(st.hours) || st.hours < 1 || st.hours > 72) return fail('Step ' + (i + 1) + ': allow 1 to 72 hours.');
      cumulative += st.hours;
      if (cumulative > 72) return fail('A workflow must finish within 72 hours in total. Use a long-term task for bigger projects.');
      drafts.push({
        kind: cumulative <= 6 ? 'urgent' : 'normal', title: st.title, description: st.description, category: st.category, budget: st.budget,
        deadline: Date.now() + cumulative * HOUR, anonymous: false, milestones: [{ title: 'Delivery', share: 100 }], orderRef: d.orderRef,
      });
    }
    const checked: Omit<Attachment, 'id'>[][] = [];
    for (const [i, dr] of drafts.entries()) {
      const v = this.validateDraft(actor, dr);
      if ('error' in v) return fail('Step ' + (i + 1) + ': ' + v.error);
      checked.push(v.files);
    }
    const total = drafts.reduce((a, x) => a + x.budget, 0);
    if (this.balance(actor.id) < total) return fail('Your wallet needs ' + total.toLocaleString('en-IN') + ' KC to cover every step.');
    const workflowId = this.id('WF');
    const made = drafts.map((dr, i) => this.makeTask(actor, dr, checked[i], { workflowId, step: i + 1 }));
    this.db.tasks.unshift(...[...made].reverse());
    this.db.workflows.unshift({ id: workflowId, ownerId: actor.id, title, taskIds: made.map(t => t.id), orderRef: d.orderRef, createdAt: Date.now() });
    return { ok: true, workflowId };
  }

  /** Runs after a task reaches a final state: unlock the next step, spawn the next repeat, or wind a chain down. */
  private afterTaskEnd(t: Task) {
    if (t.status === 'completed') {
      t.completedAt = Date.now();
      if (t.workflowId) {
        const nextStep = this.db.tasks.find(x => x.workflowId === t.workflowId && x.step === (t.step ?? 0) + 1);
        if (nextStep) this.notify(t.posterId, 'Step ' + nextStep.step + ' "' + nextStep.title + '" is now open for bids', '/tasks/' + nextStep.id);
      }
      if (t.recurrence && t.recurrence.index < t.recurrence.total) {
        const period = (t.recurrence.every === 'daily' ? 24 : 168) * HOUR;
        let deadline = t.deadline + period;
        while (deadline <= Date.now()) deadline += period;
        const shift = deadline - t.deadline;
        const nextTask: Task = {
          ...t, id: this.id('T'), createdAt: Date.now(), deadline, startAt: t.startAt ? t.startAt + shift : undefined,
          status: 'open', bids: [], assigneeId: undefined, acceptedAmount: undefined, completedAt: undefined,
          disputeReason: undefined, disputedBy: undefined, workflowId: undefined, step: undefined,
          recurrence: { ...t.recurrence, index: t.recurrence.index + 1 },
          attachments: t.attachments.map(a => ({ ...a, id: this.id('F') })),
          milestones: t.milestones.map(m => ({ ...m, amount: 0, status: 'pending' as const, deliverables: undefined, note: undefined })),
        };
        this.db.tasks.unshift(nextTask);
        this.notify(t.posterId, 'Next in your series: "' + t.title + '" (' + nextTask.recurrence!.index + ' of ' + t.recurrence.total + ') is open for bids', '/tasks/' + nextTask.id);
      }
    } else if (t.workflowId) {
      for (const later of this.db.tasks.filter(x => x.workflowId === t.workflowId && (x.step ?? 0) > (t.step ?? 0) && ['open', 'bidding'].includes(x.status))) {
        later.status = 'cancelled';
        this.notify(later.posterId, '"' + later.title + '" was cancelled because an earlier step did not finish', '/tasks/' + later.id);
      }
    }
  }

  placeBid(actor: User, taskId: string, d: { amount: number; etaHours: number; note: string }): Result {
    const t = this.task(taskId);
    if (!t) return fail('Task not found.');
    if (!can(actor, 'task:bid')) return fail('Not allowed.');
    if (t.posterId === actor.id) return fail('You cannot bid on your own task.');
    if (!['open', 'bidding'].includes(t.status)) return fail('This task is no longer taking bids.');
    if (this.isLocked(t)) return fail('This step opens when the previous step is completed.');
    if (!Number.isInteger(d.amount) || d.amount < 1 || d.amount > 100_000) return fail('Enter a valid bid.');
    if (!Number.isFinite(d.etaHours) || d.etaHours <= 0) return fail('Enter an ETA in hours.');
    const note = d.note.trim();
    if (!note || note.length > 250) return fail('Add a short proposal (250 chars max).');
    const existing = t.bids.find(b => b.providerId === actor.id);
    if (existing) {
      Object.assign(existing, { amount: d.amount, etaHours: d.etaHours, note, ts: Date.now() });
      this.settleQuotes(t.id + ':' + actor.id, 'superseded');
    }
    else {
      t.bids.push({ id: this.id('B'), providerId: actor.id, amount: d.amount, etaHours: d.etaHours, note, ts: Date.now() });
      const step = next(t.status, 'first_bid');
      if (step) t.status = step.to;
      this.notify(t.posterId, `New bid on "${t.title}"`, `/tasks/${t.id}`);
    }
    return { ok: true };
  }

  /** Accepting a bid reserves its full amount in escrow and closes the other bid threads. */
  acceptBid(actor: User, taskId: string, bidId: string): Result {
    const t = this.task(taskId);
    const bid = t?.bids.find(b => b.id === bidId);
    if (!t || !bid) return fail('Bid not found.');
    if (!can(actor, 'task:approve', { ownerId: t.posterId })) return fail('Only the poster can accept a bid.');
    const step = next(t.status, 'accept_bid');
    if (!step) return fail('This task cannot accept a bid right now.');
    if (this.isLocked(t)) return fail('This step opens when the previous step is completed.');
    const err = this.post(rules.escrowReserve(t.id, t.posterId, bid.amount));
    if (err) return fail(err);
    t.status = step.to;
    t.assigneeId = bid.providerId;
    t.acceptedAmount = bid.amount;
    let left = bid.amount;
    t.milestones.forEach((m, i) => {
      m.amount = i === t.milestones.length - 1 ? left : Math.floor(bid.amount * m.share / 100);
      left -= m.amount;
    });
    for (const b of t.bids) this.settleQuotes(t.id + ':' + b.providerId, 'expired');
    for (const other of t.bids.filter(b => b.id !== bidId)) this.system(`${t.id}:${other.providerId}`, 'The poster chose another provider. This conversation is closed.');
    this.system(`${t.id}:${bid.providerId}`, `Bid accepted. ${bid.amount} KC is held in escrow and released milestone by milestone.`);
    this.notify(bid.providerId, `Your bid on "${t.title}" was accepted`, `/tasks/${t.id}`);
    return { ok: true };
  }

  private moveTask(actor: User, taskId: string, event: TaskEvent, who: 'poster' | 'assignee' | 'either'): { t: Task } | { error: string } {
    const t = this.task(taskId);
    if (!t) return { error: 'Task not found.' };
    const step = next(t.status, event);
    if (!step) return { error: `Cannot ${event.replace('_', ' ')} while the task is ${t.status.replace('_', ' ')}.` };
    const isPoster = t.posterId === actor.id, isAssignee = t.assigneeId === actor.id;
    if (!can(actor, step.permission) || (who === 'poster' && !isPoster) || (who === 'assignee' && !isAssignee) || (who === 'either' && !isPoster && !isAssignee)) {
      return { error: 'You are not allowed to do that on this task.' };
    }
    return { t };
  }

  private remainingEscrow(t: Task) { return this.ledger.balance(A.escrow(t.id)); }

  startWork(actor: User, taskId: string): Result {
    const r = this.moveTask(actor, taskId, 'start_work', 'assignee');
    if ('error' in r) return fail(r.error);
    if (r.t.startAt && r.t.startAt > Date.now()) return fail('This task is scheduled. Work can start from ' + new Date(r.t.startAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + '.');
    r.t.status = 'in_progress';
    this.system(`${r.t.id}:${actor.id}`, 'Work started.');
    return { ok: true };
  }

  submitWork(actor: User, taskId: string, d: { note?: string; files?: FileLike[] } = {}): Result {
    const r = this.moveTask(actor, taskId, 'submit_work', 'assignee');
    if ('error' in r) return fail(r.error);
    const m = r.t.milestones.find(x => x.status === 'pending');
    if (!m) return fail('No milestone left to submit.');
    const note = (d.note ?? '').trim();
    if (note.length > 300) return fail('Keep the delivery note under 300 characters.');
    const files = cleanAttachments(d.files);
    if (!files.ok) return fail(files.error);
    m.note = note || undefined;
    m.deliverables = files.files.map(f => ({ ...f, id: this.id('F') }));
    m.status = 'submitted';
    r.t.status = 'review';
    this.system(`${r.t.id}:${actor.id}`, `Milestone ${m.id} "${m.title}" submitted for review.`);
    this.notify(r.t.posterId, `Milestone submitted on "${r.t.title}"`, `/tasks/${r.t.id}`);
    return { ok: true };
  }

  /** Approve the submitted milestone: release its share (net of fee); finish the task after the last one. */
  approveMilestone(actor: User, taskId: string): Result {
    const r = this.moveTask(actor, taskId, 'approve', 'poster');
    if ('error' in r) return fail(r.error);
    const t = r.t, m = t.milestones.find(x => x.status === 'submitted');
    if (!m || !t.assigneeId) return fail('Nothing to approve.');
    const err = this.post(rules.escrowRelease(t.id, Number(m.id), t.assigneeId, m.amount, this.db.fees));
    if (err) return fail(err);
    m.status = 'released';
    const more = t.milestones.some(x => x.status === 'pending');
    t.status = more ? 'in_progress' : 'completed';
    const key = `${t.id}:${t.assigneeId}`;
    this.system(key, `Milestone ${m.id} approved. ${m.amount} KC released (platform fee deducted).`);
    if (!more) {
      const p = this.profile(t.assigneeId);
      if (p) p.completed[t.category] = (p.completed[t.category] ?? 0) + 1;
      this.system(key, 'Task completed.');
      this.afterTaskEnd(t);
    }
    this.notify(t.assigneeId, `Payment released for "${t.title}"`, `/tasks/${t.id}`);
    return { ok: true };
  }

  requestChanges(actor: User, taskId: string, note: string): Result {
    const r = this.moveTask(actor, taskId, 'request_changes', 'poster');
    if ('error' in r) return fail(r.error);
    const m = r.t.milestones.find(x => x.status === 'submitted');
    if (m) m.status = 'pending';
    r.t.status = 'in_progress';
    this.system(`${r.t.id}:${r.t.assigneeId}`, `Changes requested${note.trim() ? `: ${note.trim().slice(0, 200)}` : '.'}`);
    return { ok: true };
  }

  cancelTask(actor: User, taskId: string): Result {
    const r = this.moveTask(actor, taskId, 'cancel', 'poster');
    if ('error' in r) return fail(r.error);
    const t = r.t, step = next(t.status, 'cancel')!;
    const held = this.remainingEscrow(t);
    if (step.effect === 'escrow_refund' && held > 0) {
      const err = this.post(rules.escrowRefund(t.id, t.posterId, held));
      if (err) return fail(err);
    }
    t.status = 'cancelled';
    for (const b of t.bids) this.settleQuotes(t.id + ':' + b.providerId, 'expired');
    this.afterTaskEnd(t);
    if (t.assigneeId) this.notify(t.assigneeId, `"${t.title}" was cancelled`, `/tasks/${t.id}`);
    return { ok: true };
  }

  openDispute(actor: User, taskId: string, reason: string): Result {
    const r = this.moveTask(actor, taskId, 'open_dispute', 'either');
    if ('error' in r) return fail(r.error);
    const text = reason.trim();
    if (!text || text.length > 400) return fail('Describe the problem (400 chars max).');
    r.t.status = 'disputed';
    r.t.disputeReason = text;
    r.t.disputedBy = actor.id;
    this.system(`${r.t.id}:${r.t.assigneeId}`, 'A dispute was opened. A platform administrator may now read this conversation.');
    return { ok: true };
  }

  resolveDispute(actor: User, taskId: string, outcome: 'refund_poster' | 'release_provider'): Result {
    const t = this.task(taskId);
    if (!t || !can(actor, 'dispute:resolve')) return fail('Not allowed.');
    if (!next(t.status, 'resolve_dispute')) return fail('This task has no open dispute.');
    const held = this.remainingEscrow(t);
    if (held > 0) {
      const err = this.post(outcome === 'refund_poster'
        ? rules.escrowRefund(t.id, t.posterId, held)
        : rules.escrowRelease(t.id, 99, t.assigneeId!, held, this.db.fees));
      if (err) return fail(err);
    }
    t.status = 'resolved';
    this.afterTaskEnd(t);
    this.audit(actor.id, `Resolved dispute on ${t.id}: ${outcome === 'refund_poster' ? 'refunded poster' : 'released to provider'} (${held} KC).`);
    return { ok: true };
  }

  // ---------- messaging ----------
  threadKeysFor(actor: User): string[] {
    const keys: string[] = [];
    for (const t of this.db.tasks) {
      if (t.posterId === actor.id) t.bids.forEach(b => keys.push(`${t.id}:${b.providerId}`));
      else if (t.bids.some(b => b.providerId === actor.id)) keys.push(`${t.id}:${actor.id}`);
    }
    return keys;
  }

  /** Poster and the bidder named in the key only; admins may read just while a dispute is open (and it is logged). */
  canReadThread(actor: User, threadKey: string): boolean {
    const [taskId, bidderId] = threadKey.split(':');
    const t = this.task(taskId);
    if (!t) return false;
    if (actor.id === t.posterId || actor.id === bidderId) return can(actor, 'thread:use', { ownerId: t.posterId, assigneeId: bidderId });
    return can(actor, 'dispute:resolve') && t.status === 'disputed' && t.assigneeId === bidderId;
  }

  readThread(actor: User, threadKey: string): Message[] {
    if (!this.canReadThread(actor, threadKey)) return [];
    const [taskId] = threadKey.split(':');
    const t = this.task(taskId)!;
    if (actor.id !== t.posterId && !threadKey.endsWith(`:${actor.id}`)) {
      const text = `Read dispute thread ${threadKey}.`;
      const last = this.db.audit.find(a => a.actorId === actor.id && a.text === text);
      if (!last || Date.now() - last.ts > 5 * 60_000) this.audit(actor.id, text); // one note per sitting, not per render
    }
    return this.db.messages.filter(m => m.threadKey === threadKey);
  }

  private rateLimited(actor: User) {
    return this.db.messages.filter(m => m.senderId === actor.id && Date.now() - m.ts < 10_000).length >= 8;
  }

  /** The poster or the bidder named in the thread key (never an admin), with the task. */
  private threadParty(actor: User, threadKey: string) {
    const [taskId, bidderId] = threadKey.split(':');
    const t = this.task(taskId);
    if (!t || (actor.id !== t.posterId && actor.id !== bidderId) || !this.canReadThread(actor, threadKey)) return null;
    return { t, bidderId };
  }

  sendMessage(actor: User, threadKey: string, body: string, files?: FileLike[]): Result {
    const party = this.threadParty(actor, threadKey);
    if (!party) return fail('You cannot write in this conversation.');
    const { t, bidderId } = party;
    if (['completed', 'cancelled', 'resolved'].includes(t.status)) return fail('This task is closed.');
    if (t.assigneeId && t.assigneeId !== bidderId) return fail('This conversation is closed.');
    const text = body.trim();
    const att = cleanAttachments(files);
    if (!att.ok) return fail(att.error);
    if (!text && att.files.length === 0) return fail('Write a message or attach a file.');
    if (text.length > 2000) return fail('Write a message up to 2,000 characters.');
    if (this.rateLimited(actor)) return fail('Slow down a little: too many messages in a few seconds.');
    this.db.messages.push({
      id: this.id('M'), threadKey, senderId: actor.id, body: text, kind: 'text', ts: Date.now(),
      attachments: att.files.length ? att.files.map(f => ({ ...f, id: this.id('F') })) : undefined,
    });
    this.notify(actor.id === t.posterId ? bidderId : t.posterId, 'New message about "' + t.title + '"', '/tasks/' + t.id);
    return { ok: true };
  }

  // ---------- counter-offers ----------
  private settleQuotes(threadKey: string, status: 'superseded' | 'expired') {
    for (const m of this.db.messages) if (m.threadKey === threadKey && m.quote?.status === 'pending') m.quote.status = status;
  }

  /** Propose new price/ETA terms in a bid thread. Either side can propose; the other side accepts or declines. */
  sendQuote(actor: User, threadKey: string, d: { amount: number; etaHours: number }): Result {
    const party = this.threadParty(actor, threadKey);
    if (!party) return fail('You cannot write in this conversation.');
    const { t, bidderId } = party;
    const bid = t.bids.find(b => b.providerId === bidderId);
    if (!bid || !['open', 'bidding'].includes(t.status)) return fail('Terms can only change while the task is taking bids.');
    if (this.isLocked(t)) return fail('This step is not open yet.');
    if (!Number.isInteger(d.amount) || d.amount < 1 || d.amount > 100_000) return fail('Enter a price from 1 to 100,000 KC.');
    if (!Number.isFinite(d.etaHours) || d.etaHours <= 0 || d.etaHours > 2000) return fail('Enter a realistic ETA in hours.');
    if (d.amount === bid.amount && d.etaHours === bid.etaHours) return fail('Those are already the current terms.');
    if (this.rateLimited(actor)) return fail('Slow down a little: too many messages in a few seconds.');
    this.settleQuotes(threadKey, 'superseded');
    this.db.messages.push({
      id: this.id('M'), threadKey, senderId: actor.id, kind: 'quote', ts: Date.now(),
      body: 'Proposed terms: ' + d.amount.toLocaleString('en-IN') + ' KC in ' + d.etaHours + ' h',
      quote: { bidId: bid.id, amount: d.amount, etaHours: d.etaHours, by: actor.id, status: 'pending' },
    });
    this.notify(actor.id === t.posterId ? bidderId : t.posterId, 'New offer on "' + t.title + '"', '/tasks/' + t.id);
    return { ok: true };
  }

  respondQuote(actor: User, messageId: string, accept: boolean): Result {
    const m = this.db.messages.find(x => x.id === messageId && x.kind === 'quote');
    if (!m?.quote) return fail('Offer not found.');
    const party = this.threadParty(actor, m.threadKey);
    if (!party) return fail('You cannot respond to this offer.');
    const { t } = party;
    if (m.quote.by === actor.id) return fail('You cannot answer your own offer.');
    if (m.quote.status !== 'pending') return fail('This offer is no longer open.');
    const bid = t.bids.find(b => b.id === m.quote!.bidId);
    if (!bid || !['open', 'bidding'].includes(t.status) || this.isLocked(t)) return fail('This offer has expired.');
    if (accept) {
      bid.amount = m.quote.amount; bid.etaHours = m.quote.etaHours; bid.ts = Date.now();
      m.quote.status = 'accepted';
      this.system(m.threadKey, 'Terms agreed: ' + bid.amount.toLocaleString('en-IN') + ' KC in ' + bid.etaHours + ' h. The bid was updated.');
    } else {
      m.quote.status = 'declined';
      this.system(m.threadKey, 'The offer was declined.');
    }
    this.notify(m.quote.by, 'Your offer on "' + t.title + '" was ' + (accept ? 'accepted' : 'declined'), '/tasks/' + t.id);
    return { ok: true };
  }

  /** Soft warning for off-platform contact details; never blocks. */
  static looksLikeContactInfo(text: string) {
    return /(\+?\d[\d\s-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)|(whats?app|telegram|insta(gram)?\b)/i.test(text);
  }

  /** What the viewer may see about a task's poster. */
  posterLabel(t: Task, viewer: User) {
    const poster = this.user(t.posterId)?.name ?? 'Unknown';
    if (!t.anonymous || viewer.id === t.posterId) return t.anonymous && viewer.id === t.posterId ? `${poster} (anonymous to others)` : poster;
    return 'Anonymous student';
  }

  // ---------- services, verification, admin ----------
  offerService(actor: User, d: { name: string; price: number; unit: string; desc: string }): Result {
    if (!can(actor, 'service:offer')) return fail('Not allowed.');
    if (!actor.providerEnabled) return fail('Get verified as a provider first.');
    const name = d.name.trim(), desc = d.desc.trim();
    if (!name || !desc || !Number.isInteger(d.price) || d.price < 1 || d.price > 100_000) return fail('Enter a name, description and price.');
    this.db.services.unshift({ id: this.id('SV'), providerId: actor.id, name, price: d.price, unit: d.unit, desc, icon: '✨' });
    return { ok: true };
  }

  requestProviderVerification(actor: User): Result {
    if (!can(actor, 'service:offer')) return fail('Not allowed.');
    if (this.db.verifications.some(v => v.userId === actor.id && v.kind === 'provider' && v.status === 'pending')) return fail('Request already pending.');
    this.db.verifications.unshift({ id: this.id('VR'), userId: actor.id, kind: 'provider', status: 'pending' });
    return { ok: true };
  }

  reviewVerification(actor: User, id: string, approve: boolean): Result {
    if (!can(actor, 'user:verify')) return fail('Not allowed.');
    const v = this.db.verifications.find(x => x.id === id);
    if (!v || v.status !== 'pending') return fail('Request not found.');
    v.status = approve ? 'approved' : 'rejected';
    const u = this.user(v.userId);
    if (approve && u && v.kind === 'provider') {
      u.providerEnabled = true;
      if (!this.profile(u.id)) this.db.profiles.push({ userId: u.id, rating: 0, ratingCount: 0, availability: 0.6, completed: {} });
    }
    this.audit(actor.id, `${approve ? 'Approved' : 'Rejected'} ${v.kind} verification for ${u?.name}.`);
    this.notify(v.userId, `Your ${v.kind} verification was ${v.status}`, '/services');
    return { ok: true };
  }

  setFees(actor: User, fees: Fees, pw: PriorityWeights, mw: MatchWeights): Result {
    if (!can(actor, 'fees:edit')) return fail('Not allowed.');
    const rate = (n: number) => Number.isFinite(n) && n >= 0 && n <= 0.3;
    if (!rate(fees.taskFeeRate) || !rate(fees.vendorCommissionRate)) return fail('Fee rates must be between 0% and 30%.');
    const sum = (o: object) => Object.values(o).reduce((a: number, b: number) => a + b, 0);
    if (Math.abs(sum(pw) - 1) > 0.001 || Math.abs(sum(mw) - 1) > 0.001) return fail('Weights must add up to 100%.');
    this.db.fees = fees; this.db.priorityWeights = pw; this.db.matchWeights = mw;
    this.audit(actor.id, 'Updated fees and scoring weights.');
    return { ok: true };
  }

  toggleStore(actor: User, storeId: string): Result {
    if (!can(actor, 'store:manage', { storeId })) return fail('Not your store.');
    const s = this.store(storeId)!;
    s.open = !s.open;
    return { ok: true };
  }

  setStock(actor: User, productId: string, stock: number): Result {
    const p = this.db.products.find(x => x.id === productId);
    if (!p || !can(actor, 'store:manage', { storeId: p.storeId })) return fail('Not your product.');
    if (!Number.isInteger(stock) || stock < 0 || stock > 10_000) return fail('Stock must be 0-10,000.');
    p.stock = stock;
    return { ok: true };
  }

  settle(actor: User, storeId: string): Result<{ amount: number }> {
    if (!can(actor, 'store:settlements', { storeId })) return fail('Not your store.');
    const s = this.store(storeId)!;
    const owed = this.ledger.balance(A.vendorPayable(s.vendorId));
    if (owed <= 0) return fail('Nothing to settle.');
    const batch = this.id('SB');
    const e1 = this.post(rules.vendorSettlement(s.vendorId, owed, batch));
    if (e1) return fail(e1);
    const e2 = this.post(rules.settlementConfirmed(owed, batch));
    return e2 ? fail(e2) : { ok: true, amount: owed };
  }

  audit(actorId: string, text: string) {
    this.db.audit.unshift({ id: this.id('AU'), ts: Date.now(), actorId, text });
  }

  async anchor(actor: User): Promise<Result<{ block: number }>> {
    if (!can(actor, 'chain:audit')) return fail('Not allowed.');
    const anchored = new Set(this.db.chain.flatMap(b => b.entryIds));
    const pending = this.ledger.entries.filter(e => !anchored.has(e.id));
    if (!pending.length) return fail('No new ledger entries to anchor.');
    const block = await appendBlock(this.db.chain, pending);
    return { ok: true, block: block.index };
  }

  /** Demo only: silently edit a ledger entry so chain verification can be seen to fail. */
  tamperDemo(actor: User): Result {
    if (!can(actor, 'chain:audit')) return fail('Not allowed.');
    const target = this.db.chain.length ? this.ledger.entries.find(e => this.db.chain[0].entryIds.includes(e.id)) : undefined;
    if (!target) return fail('Anchor at least one block first.');
    target.postings[0].amount += 1;
    this.audit(actor.id, `DEMO: altered ${target.id} to test tamper detection.`);
    return { ok: true };
  }

  // ---------- promo codes (platform-funded) ----------
  savePromo(actor: User, p: Promo): Result {
    if (!can(actor, 'fees:edit')) return fail('Not allowed.');
    const promo: Promo = { ...p, code: normalizeCode(p.code), label: p.label.trim() };
    const err = validatePromoDef(promo);
    if (err) return fail(err);
    const i = this.db.promos.findIndex(x => x.code === promo.code);
    if (i >= 0) this.db.promos[i] = promo; else this.db.promos.push(promo);
    this.audit(actor.id, 'Saved promo code ' + promo.code + '.');
    return { ok: true };
  }

  togglePromo(actor: User, code: string): Result {
    if (!can(actor, 'fees:edit')) return fail('Not allowed.');
    const promo = this.db.promos.find(x => x.code === code);
    if (!promo) return fail('Code not found.');
    promo.active = !promo.active;
    this.audit(actor.id, (promo.active ? 'Enabled' : 'Disabled') + ' promo code ' + code + '.');
    return { ok: true };
  }

  promoUsage(code: string) { return this.db.promoUses.filter(u => u.code === code).length; }

  // ---------- wishlist ----------
  wishlistFor(userId: string) { return this.db.wishlist.filter(w => w.userId === userId); }
  isWished(userId: string, productId: string) { return this.db.wishlist.some(w => w.userId === userId && w.productId === productId); }

  toggleWishlist(actor: User, productId: string): Result<{ saved: boolean }> {
    if (!can(actor, 'order:create')) return fail('Not allowed.');
    if (!this.db.products.some(p => p.id === productId)) return fail('Product not found.');
    const i = this.db.wishlist.findIndex(w => w.userId === actor.id && w.productId === productId);
    if (i >= 0) { this.db.wishlist.splice(i, 1); return { ok: true, saved: false }; }
    if (this.wishlistFor(actor.id).length >= 50) return fail('Your wishlist is full (50 items).');
    this.db.wishlist.unshift({ userId: actor.id, productId, ts: Date.now() });
    return { ok: true, saved: true };
  }

  // ---------- product reviews (verified buyers only) ----------
  hasBought(userId: string, productId: string) {
    return this.db.orders.some(o => o.buyerId === userId && o.status === 'Collected' && o.productIds?.includes(productId));
  }

  productReviews(productId: string) { return this.db.reviews.filter(r => r.kind === 'product' && r.refId === productId); }

  productRating(productId: string) {
    const rs = this.productReviews(productId);
    return { count: rs.length, average: rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : 0 };
  }

  reviewProduct(actor: User, productId: string, rating: number, comment: string): Result {
    const p = this.db.products.find(x => x.id === productId);
    if (!p) return fail('Product not found.');
    if (!this.hasBought(actor.id, productId)) return fail('You can review a product after you have collected it.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail('Choose a rating from 1 to 5 stars.');
    const text = comment.trim();
    if (text.length > 300) return fail('Keep the review under 300 characters.');
    const existing = this.db.reviews.find(r => r.kind === 'product' && r.refId === productId && r.fromId === actor.id);
    if (existing) { Object.assign(existing, { rating, comment: text, ts: Date.now() }); return { ok: true }; }
    this.db.reviews.unshift({ id: this.id('R'), kind: 'product', refId: productId, fromId: actor.id, toId: this.store(p.storeId)!.vendorId, as: 'store', rating, comment: text, ts: Date.now() });
    return { ok: true };
  }

  // ---------- reviews & reputation ----------
  /** Reviews a user may still write for a finished task: poster rates the provider, provider rates the poster. */
  reviewableTasks(userId: string): { task: Task; target: string; as: 'provider' | 'poster' }[] {
    const out: { task: Task; target: string; as: 'provider' | 'poster' }[] = [];
    for (const t of this.db.tasks) {
      if (t.status !== 'completed' || !t.assigneeId) continue;
      const mine = t.posterId === userId || t.assigneeId === userId;
      if (!mine || this.db.reviews.some(r => r.kind === 'task' && r.refId === t.id && r.fromId === userId)) continue;
      out.push(userId === t.posterId ? { task: t, target: t.assigneeId, as: 'provider' } : { task: t, target: t.posterId, as: 'poster' });
    }
    return out;
  }

  reviewTask(actor: User, taskId: string, rating: number, comment: string): Result {
    const t = this.task(taskId);
    if (!t || t.status !== 'completed' || !t.assigneeId) return fail('You can review a task once it is completed.');
    if (actor.id !== t.posterId && actor.id !== t.assigneeId) return fail('Only the poster and the provider can review this task.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail('Choose a rating from 1 to 5 stars.');
    const text = comment.trim();
    if (text.length > 300) return fail('Keep the review under 300 characters.');
    if (this.db.reviews.some(r => r.kind === 'task' && r.refId === t.id && r.fromId === actor.id)) return fail('You already reviewed this task.');
    const toId = actor.id === t.posterId ? t.assigneeId : t.posterId;
    this.db.reviews.unshift({ id: this.id('R'), kind: 'task', refId: t.id, fromId: actor.id, toId, as: actor.id === t.posterId ? 'provider' : 'poster', rating, comment: text, ts: Date.now() });
    this.applyRating(toId, rating);
    this.notify(toId, actor.name + ' left you a ' + rating + '-star review', '/provider');
    return { ok: true };
  }

  private applyRating(userId: string, rating: number) {
    let p = this.profile(userId);
    if (!p) { p = { userId, rating: 0, ratingCount: 0, availability: 0.5, completed: {} }; this.db.profiles.push(p); }
    p.rating = Math.round(((p.rating * p.ratingCount + rating) / (p.ratingCount + 1)) * 100) / 100;
    p.ratingCount += 1;
  }

  reviewOrder(actor: User, orderId: string, rating: number, comment: string): Result {
    const o = this.db.orders.find(x => x.id === orderId);
    if (!o || o.buyerId !== actor.id) return fail('Order not found.');
    if (o.status !== 'Collected') return fail('You can review an order after you have collected it.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail('Choose a rating from 1 to 5 stars.');
    const text = comment.trim();
    if (text.length > 300) return fail('Keep the review under 300 characters.');
    if (this.db.reviews.some(r => r.kind === 'order' && r.refId === o.id)) return fail('You already reviewed this order.');
    const store = this.store(o.storeId)!;
    this.db.reviews.unshift({ id: this.id('R'), kind: 'order', refId: o.id, fromId: actor.id, toId: store.vendorId, as: 'store', storeId: store.id, rating, comment: text, ts: Date.now() });
    this.notify(store.vendorId, 'New ' + rating + '-star review for ' + store.name, '/vendor');
    return { ok: true };
  }

  storeRating(storeId: string) {
    const rs = this.db.reviews.filter(r => r.storeId === storeId);
    return { count: rs.length, average: rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : 0 };
  }

  reviewsFor(userId: string, as?: 'provider' | 'poster') {
    return this.db.reviews.filter(r => r.toId === userId && r.kind === 'task' && (!as || r.as === as));
  }

  // ---------- notifications ----------
  notificationsFor(userId: string) { return this.db.notifications.filter(n => n.userId === userId); }
  unreadCount(userId: string) { return this.db.notifications.filter(n => n.userId === userId && !n.read).length; }

  markNotificationRead(actor: User, id: string): Result {
    const n = this.db.notifications.find(x => x.id === id && x.userId === actor.id);
    if (!n) return fail('Notification not found.');
    n.read = true;
    return { ok: true };
  }

  markAllRead(actor: User): Result {
    for (const n of this.db.notifications) if (n.userId === actor.id) n.read = true;
    return { ok: true };
  }

  // ---------- marketplace: buy / sell / rent (payment held in escrow until handover) ----------
  listing(id: string) { return this.db.listings.find(l => l.id === id); }
  private escrowId(l: Listing) { return `${l.id}~${l.cycle}`; }

  createListing(actor: User, d: { kind: 'sale' | 'rent'; name: string; price: number; condition: string; desc: string }): Result {
    if (!can(actor, 'listing:create')) return fail('Not allowed.');
    const name = d.name.trim(), desc = d.desc.trim();
    if (!name || name.length > 70 || !desc || desc.length > 250) return fail('Add a name (70 chars max) and description (250 chars max).');
    if (!Number.isInteger(d.price) || d.price < 1 || d.price > 100_000) return fail('Enter a price from 1 to 100,000 KC.');
    this.db.listings.unshift({
      id: this.id('L'), sellerId: actor.id, kind: d.kind, name, price: d.price, condition: d.condition, desc,
      icon: d.kind === 'rent' ? '🚲' : '📦', status: 'active', cycle: 0,
    });
    return { ok: true };
  }

  withdrawListing(actor: User, id: string): Result {
    const l = this.listing(id);
    if (!l || l.sellerId !== actor.id) return fail('Listing not found.');
    if (l.status !== 'active') return fail('Only listings that are not reserved can be withdrawn.');
    l.status = 'withdrawn';
    return { ok: true };
  }

  /** Buy or rent: the full amount moves into escrow and the listing is held for the buyer. */
  reserveListing(actor: User, id: string, days = 1): Result {
    const l = this.listing(id);
    if (!l) return fail('Listing not found.');
    if (!can(actor, 'order:create')) return fail('Not allowed.');
    if (l.sellerId === actor.id) return fail('You cannot buy your own listing.');
    if (l.status !== 'active') return fail('This listing is no longer available.');
    if (l.kind === 'rent' && (!Number.isInteger(days) || days < 1 || days > 30)) return fail('Rent for 1 to 30 days.');
    const nights = l.kind === 'rent' ? days : 1;
    const amount = l.price * nights;
    l.cycle += 1;
    const err = this.post(rules.escrowReserve(this.escrowId(l), actor.id, amount));
    if (err) { l.cycle -= 1; return fail(err); }
    Object.assign(l, { status: 'reserved', buyerId: actor.id, days: nights, amount });
    this.notify(l.sellerId, `${actor.name} reserved "${l.name}". Arrange the handover.`, '/marketplace');
    return { ok: true };
  }

  /** Buyer confirms they have the item: escrow pays the seller, net of fee. */
  confirmHandover(actor: User, id: string): Result {
    const l = this.listing(id);
    if (!l || l.status !== 'reserved' || l.buyerId !== actor.id || !l.amount) return fail('Nothing to confirm.');
    const err = this.post(rules.escrowRelease(this.escrowId(l), 1, l.sellerId, l.amount, this.db.fees));
    if (err) return fail(err);
    this.notify(l.sellerId, `Payment released for "${l.name}"`, '/marketplace');
    if (l.kind === 'sale') l.status = 'sold';
    else { l.status = 'active'; }
    l.buyerId = undefined; l.amount = undefined; l.days = undefined;
    return { ok: true };
  }

  /** Either party can call off a reservation before handover; the buyer is refunded in full. */
  cancelReservation(actor: User, id: string): Result {
    const l = this.listing(id);
    if (!l || l.status !== 'reserved' || !l.buyerId || !l.amount) return fail('Nothing to cancel.');
    if (actor.id !== l.sellerId && actor.id !== l.buyerId) return fail('Not your reservation.');
    const err = this.post(rules.escrowRefund(this.escrowId(l), l.buyerId, l.amount));
    if (err) return fail(err);
    this.notify(actor.id === l.sellerId ? l.buyerId : l.sellerId, `Reservation for "${l.name}" was cancelled and refunded`, '/marketplace');
    l.status = 'active'; l.buyerId = undefined; l.amount = undefined; l.days = undefined;
    return { ok: true };
  }

  // ---------- events ----------
  seatsLeft(e: CampusEvent) { return e.seats - this.db.tickets.filter(t => t.eventId === e.id).length; }

  submitEvent(actor: User, d: { name: string; desc: string; place: string; date: number; price: number; seats: number }): Result {
    if (!can(actor, 'event:create')) return fail('Not allowed.');
    const name = d.name.trim(), desc = d.desc.trim(), place = d.place.trim();
    if (!name || name.length > 70 || !desc || desc.length > 300 || !place || place.length > 60) return fail('Add a name, description and venue.');
    if (!Number.isFinite(d.date) || d.date <= Date.now()) return fail('Choose a future date.');
    if (!Number.isInteger(d.price) || d.price < 0 || d.price > 5000) return fail('Ticket price must be 0 to 5,000 KC.');
    if (!Number.isInteger(d.seats) || d.seats < 1 || d.seats > 2000) return fail('Seats must be 1 to 2,000.');
    this.db.events.unshift({ id: this.id('E'), hostId: actor.id, name, desc, place, date: d.date, price: d.price, seats: d.seats, icon: '🎟️', status: 'pending' });
    return { ok: true };
  }

  reviewEvent(actor: User, id: string, approve: boolean): Result {
    if (!can(actor, 'event:approve')) return fail('Not allowed.');
    const e = this.db.events.find(x => x.id === id);
    if (!e || e.status !== 'pending') return fail('Event not found.');
    e.status = approve ? 'approved' : 'rejected';
    this.audit(actor.id, `${approve ? 'Approved' : 'Rejected'} event "${e.name}".`);
    this.notify(e.hostId, `Your event "${e.name}" was ${e.status}`, '/events');
    return { ok: true };
  }

  registerEvent(actor: User, id: string): Result<{ ticketId: string }> {
    const e = this.db.events.find(x => x.id === id);
    if (!e || e.status !== 'approved') return fail('Event not found.');
    if (!can(actor, 'event:register')) return fail('Not allowed.');
    if (e.hostId === actor.id) return fail('You are hosting this event.');
    if (e.date <= Date.now()) return fail('This event has already started.');
    if (this.db.tickets.some(t => t.eventId === id && t.userId === actor.id)) return fail('You already have a ticket.');
    if (this.seatsLeft(e) <= 0) return fail('This event is full.');
    const ticketId = this.id('TKT');
    if (e.price > 0) {
      const err = this.post(rules.eventTicket(ticketId, actor.id, e.hostId, e.price, this.db.fees));
      if (err) return fail(err);
    }
    this.db.tickets.unshift({ id: ticketId, eventId: id, userId: actor.id, ts: Date.now(), code: `KRT-${ticketId.split('-')[1]}-${id.split('-')[1]}` });
    this.notify(e.hostId, `${actor.name} registered for "${e.name}"`, '/events');
    return { ok: true, ticketId };
  }

  // ---------- vendor onboarding ----------
  registerVendor(actor: User, d: { name: string; ownerName: string; type: StoreType }): Result {
    if (!can(actor, 'vendor:approve')) return fail('Not allowed.');
    const name = d.name.trim(), ownerName = d.ownerName.trim();
    if (!name || name.length > 50 || !ownerName || ownerName.length > 50) return fail('Enter the store and owner names.');
    if (this.db.stores.some(s => s.name.toLowerCase() === name.toLowerCase()) || this.db.vendorApps.some(a => a.status === 'pending' && a.name.toLowerCase() === name.toLowerCase())) return fail('A store with that name already exists.');
    this.db.vendorApps.unshift({ id: this.id('VA'), name, ownerName, type: d.type, status: 'pending' });
    return { ok: true };
  }

  reviewVendor(actor: User, id: string, approve: boolean): Result {
    if (!can(actor, 'vendor:approve')) return fail('Not allowed.');
    const a = this.db.vendorApps.find(x => x.id === id);
    if (!a || a.status !== 'pending') return fail('Application not found.');
    a.status = approve ? 'approved' : 'rejected';
    if (approve) {
      const n = ++this.db.seq;
      const user: User = { id: `v-${n}`, name: a.name, roles: ['vendor'], storeId: `st-${n}`, storeType: a.type, campusId: actor.campusId };
      this.db.users.push(user);
      this.db.stores.push({ id: user.storeId!, name: a.name, type: a.type, vendorId: user.id, open: true });
    }
    this.audit(actor.id, `${approve ? 'Approved' : 'Rejected'} vendor "${a.name}".`);
    return { ok: true };
  }

  addProduct(actor: User, d: { name: string; price: number; stock: number; desc: string }): Result {
    const store = actor.storeId ? this.store(actor.storeId) : undefined;
    if (!store || !can(actor, 'store:manage', { storeId: store.id })) return fail('Not your store.');
    if (store.type === 'xerox') return fail('Print shops are priced per page, not per product.');
    const name = d.name.trim(), desc = d.desc.trim();
    if (!name || name.length > 60 || !desc || desc.length > 120) return fail('Add a name and a short description.');
    if (!Number.isInteger(d.price) || d.price < 1 || d.price > 100_000) return fail('Price must be 1 to 100,000 KC.');
    if (!Number.isInteger(d.stock) || d.stock < 0 || d.stock > 10_000) return fail('Stock must be 0 to 10,000.');
    this.db.products.push({
      id: this.id('P'), storeId: store.id, name, price: d.price, stock: d.stock, desc,
      icon: store.type === 'canteen' ? '🍽️' : store.type === 'merch' ? '🎁' : '📎', category: store.type === 'canteen' ? 'food' : 'shop',
    });
    return { ok: true };
  }
}

// ---------- seed ----------
export function seed(now = Date.now()): Db {
  const common = { campusId: 'main' };
  const users: User[] = [
    { id: 'u-alex', name: 'Alex Sharma', roles: ['student'], ...common },
    { id: 'u-riya', name: 'Riya M.', roles: ['student'], providerEnabled: true, ...common },
    { id: 'u-nikhil', name: 'Nikhil K.', roles: ['student'], providerEnabled: true, ...common },
    { id: 'u-meera', name: 'Meera P.', roles: ['student'], ...common },
    { id: 'v-bites', name: 'Campus Bites', roles: ['vendor'], storeId: 'st-bites', storeType: 'canteen', ...common },
    { id: 'v-green', name: 'Green Plate', roles: ['vendor'], storeId: 'st-green', storeType: 'canteen', ...common },
    { id: 'v-xerox', name: 'Library Xerox', roles: ['vendor'], storeId: 'st-xerox', storeType: 'xerox', ...common },
    { id: 'v-scholars', name: 'Scholars Store', roles: ['vendor'], storeId: 'st-scholars', storeType: 'stationery', ...common },
    { id: 'a-dean', name: 'Dr. Rao (Campus Admin)', roles: ['campus_admin'], ...common },
    { id: 'p-ops', name: 'Platform Ops', roles: ['platform_admin'], ...common },
  ];
  const stores: Store[] = [
    { id: 'st-bites', name: 'Campus Bites', type: 'canteen', vendorId: 'v-bites', open: true },
    { id: 'st-green', name: 'Green Plate', type: 'canteen', vendorId: 'v-green', open: true },
    { id: 'st-xerox', name: 'Library Xerox', type: 'xerox', vendorId: 'v-xerox', open: true },
    { id: 'st-scholars', name: 'Scholars Store', type: 'stationery', vendorId: 'v-scholars', open: true },
  ];
  const pr = (id: string, storeId: string, name: string, price: number, icon: string, desc: string, category: 'food' | 'shop', stock = 40): Product =>
    ({ id, storeId, name, price, icon, desc, stock, category });
  const products: Product[] = [
    { ...pr('f1', 'st-bites', 'Masala Dosa Combo', 85, '🥘', 'Crisp dosa, chutney and filter coffee', 'food'), mrp: 110 },
    pr('f3', 'st-bites', 'Cold Coffee', 65, '🥤', 'Made to order, ready in 10 minutes', 'food'),
    pr('f2', 'st-green', 'Paneer Rice Bowl', 120, '🍛', 'A filling lunch between classes', 'food'),
    pr('f4', 'st-green', 'Veg Sandwich', 60, '🥪', 'Grilled with mint chutney', 'food'),
    pr('s1', 'st-scholars', 'Engineering Drawing Kit', 340, '📐', 'Tools for your first year drawing lab', 'shop', 12),
    pr('s2', 'st-scholars', 'A4 Lab Record Bundle', 180, '📚', 'Three lab records and a graph notebook', 'shop', 25),
    pr('s3', 'st-scholars', 'Scientific Calculator', 790, '🧮', 'Non-programmable exam-approved model', 'shop', 8),
  ];
  const ms = (...titles: [string, number][]) => titles.map(([title, share], i) => ({ id: `${i + 1}`, title, share, amount: 0, status: 'pending' as const }));
  const task = (id: string, kind: TaskKind, title: string, description: string, category: string, budget: number, hours: number, posterId: string, anonymous: boolean, milestones: Task['milestones'], ageHours = 2): Task =>
    ({ id, kind, title, description, category, budget, deadline: now + hours * HOUR, createdAt: now - ageHours * HOUR, posterId, anonymous, status: 'open', bids: [], milestones, attachments: [] });
  const tasks: Task[] = [
    task('T-208', 'urgent', 'Collect my printouts from Library Xerox', 'Three bound copies are ready. Bring them to the engineering block.', 'Pickup', 90, 3, 'u-meera', true, ms(['Delivery', 100]), 1),
    task('T-210', 'urgent', 'Pick up a reserved calculator', 'Collect from Scholars Store and deliver to Hostel C.', 'Delivery', 110, 5, 'u-alex', false, ms(['Delivery', 100]), 4),
    task('T-209', 'normal', 'Format a 10-slide lab presentation', 'Clean, consistent slides for the electronics lab.', 'Digital', 350, 30, 'u-meera', false, ms(['Draft slides', 100]), 8),
    task('T-211', 'normal', 'Proofread my 6-page report', 'Grammar and clarity pass on a mechanics report.', 'Academic help', 180, 48, 'u-alex', false, ms(['Proofread', 100]), 20),
    task('T-212', 'long_term', 'Weekly maths tutoring for 4 weeks', 'Two sessions a week covering calculus and linear algebra.', 'Academic help', 2000, 24 * 28, 'u-meera', false, ms(['Weeks 1-2', 50], ['Weeks 3-4', 50]), 30),
    task('T-213', 'long_term', 'Design club event identity pack', 'Logo, poster templates and social banners for the term.', 'Digital', 1600, 24 * 14, 'u-alex', false, ms(['Logo', 30], ['Templates', 40], ['Social pack', 30]), 12),
  ];
  tasks[2].bids.push({ id: 'B-1', providerId: 'u-nikhil', amount: 320, etaHours: 10, note: 'I do lab decks regularly. Can send a draft tonight.', ts: now - HOUR });
  tasks[2].status = 'bidding';
  const profiles: ProviderProfile[] = [
    { userId: 'u-riya', rating: 4.9, ratingCount: 42, availability: 0.8, completed: { 'Academic help': 14, Digital: 3 } },
    { userId: 'u-nikhil', rating: 4.8, ratingCount: 27, availability: 0.6, completed: { Digital: 11, Pickup: 2 } },
    { userId: 'u-alex', rating: 4.6, ratingCount: 9, availability: 0.5, completed: {} },
    { userId: 'u-meera', rating: 4.4, ratingCount: 5, availability: 0.5, completed: {} },
  ];
  const services: ServiceListing[] = [
    { id: 'v1', providerId: 'u-riya', name: 'Math & Physics Tutoring', price: 250, unit: 'hour', desc: 'One-on-one help for first year courses.', icon: '📖' },
    { id: 'v2', providerId: 'u-nikhil', name: 'Poster & Slide Design', price: 400, unit: 'project', desc: 'Clean posters and presentations for campus events.', icon: '🎨' },
  ];
  const day = 24 * HOUR;
  const ev = (id: string, hostId: string, name: string, icon: string, place: string, days: number, price: number, seats: number, desc: string, status: CampusEvent['status'] = 'approved'): CampusEvent =>
    ({ id, hostId, name, icon, place, date: now + days * day, price, seats, desc, status });
  const events: CampusEvent[] = [
    ev('E-1', 'u-nikhil', 'Hack the Campus', '💻', 'Innovation Hall', 9, 120, 48, 'A one-day build sprint for practical campus ideas.'),
    ev('E-2', 'u-riya', 'Design After Dark', '🎨', 'Auditorium B', 15, 0, 120, 'Talks, portfolios and hands-on design exercises.'),
    ev('E-3', 'u-nikhil', 'Founders Friday', '🎤', 'Seminar Room 2', 22, 80, 75, 'Student founders share what they learned building products.'),
    ev('E-4', 'u-meera', 'Open Mic Night', '🎸', 'Amphitheatre', 12, 40, 200, 'Music, poetry and stand-up from students.', 'pending'),
  ];
  const listings: Listing[] = [
    { id: 'L-1', sellerId: 'u-riya', kind: 'sale', name: 'Data Structures Textbook', price: 420, condition: 'Very good', desc: 'Second year edition, lightly highlighted.', icon: '📕', status: 'active', cycle: 0 },
    { id: 'L-2', sellerId: 'u-nikhil', kind: 'rent', name: 'City Cycle', price: 100, condition: 'Good', desc: 'Daily rental near the main gate, lock included.', icon: '🚲', status: 'active', cycle: 0 },
    { id: 'L-3', sellerId: 'u-meera', kind: 'sale', name: 'Scientific Calculator', price: 550, condition: 'Like new', desc: 'Exam-approved, with cover.', icon: '🧮', status: 'active', cycle: 0 },
  ];
  const vendorApps: VendorApp[] = [{ id: 'VA-1', name: 'Night Owl Café', ownerName: 'Karan T.', type: 'canteen', status: 'pending' }];
  const db: Db = {
    promos: [
      { code: 'KART10', kind: 'percent', value: 10, cap: 200, min: 150, label: '10% off, up to 200 KC', active: true },
      { code: 'NEW50', kind: 'flat', value: 50, min: 300, label: '50 KC off orders over 300 KC', active: true, maxUses: 100 },
      { code: 'LATE', kind: 'percent', value: 15, cap: 120, min: 90, label: '15% off orders over 90 KC', active: false },
    ], promoUses: [], wishlist: [],
    reviews: [], workflows: [], listings, events, tickets: [], vendorApps,
    users, stores, products, orders: [], tasks, messages: [], profiles, services, notifications: [], audit: [],
    verifications: [{ id: 'VR-1', userId: 'u-meera', kind: 'provider', status: 'pending' }],
    entries: [], chain: [], fees: { ...DEFAULT_FEES },
    priorityWeights: { ...DEFAULT_PRIORITY_WEIGHTS }, matchWeights: { ...DEFAULT_MATCH_WEIGHTS }, seq: 1000,
  };
  const k = new Kart(db);
  for (const id of ['u-alex', 'u-riya', 'u-nikhil', 'u-meera']) k.topUp(users.find(u => u.id === id)!, 2500);
  // Demo balances are simulated; no real money is involved until the PPI partner is connected.
  return k.db;
}

/** Blank campus state for authenticated installations. */
export function emptyState(): Db {
  return {
    promos: [], promoUses: [], wishlist: [], reviews: [], workflows: [], listings: [],
    events: [], tickets: [], vendorApps: [], users: [], stores: [], products: [],
    orders: [], tasks: [], messages: [], profiles: [], services: [], notifications: [],
    audit: [], verifications: [], entries: [], chain: [], fees: { ...DEFAULT_FEES },
    priorityWeights: { ...DEFAULT_PRIORITY_WEIGHTS }, matchWeights: { ...DEFAULT_MATCH_WEIGHTS }, seq: 0,
  };
}
