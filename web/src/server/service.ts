// Database-agnostic server logic: runs one Kart action under a state lock and builds the per-user view.
// No Next.js or pg imports here so it can be unit tested with an in-memory store.
import { Kart, type Db, type Result } from '@/mock/db';
import type { User } from '@/rbac/policy';

/** Every mutating Kart method the browser may call. The actor is always the session user, never client supplied. */
export const ACTIONS = [
  'acceptBid', 'addProduct', 'advanceOrder', 'anchor', 'approveMilestone', 'cancelOrder', 'cancelReservation', 'cancelTask', 'checkout',
  'confirmHandover', 'createListing', 'createWorkflow', 'markAllRead', 'markNotificationRead', 'offerService', 'placeBid', 'postTask',
  'printRequest', 'registerEvent', 'registerVendor', 'requestProviderVerification', 'reserveListing', 'resolveDispute', 'respondQuote',
  'reviewEvent', 'reviewOrder', 'reviewProduct', 'reviewTask', 'reviewVendor', 'reviewVerification', 'savePromo', 'sendMessage',
  'sendQuote', 'setFees', 'setStock', 'settle', 'startWork', 'submitEvent', 'togglePromo', 'toggleStore', 'toggleWishlist', 'topUp',
  'submitWork', 'requestChanges', 'openDispute',
] as const;
export type ActionName = (typeof ACTIONS)[number];
const ALLOWED = new Set<string>(ACTIONS);

export interface StateTx { load(): Promise<Db>; save(db: Db): Promise<void> }
export interface StateStore { transaction<T>(campusId: string, fn: (tx: StateTx) => Promise<T>): Promise<T> }

const MAX_ARGS = 8;

export async function runAction(store: StateStore, campusId: string, actorId: string, method: string, args: unknown): Promise<Result<Record<string, unknown>>> {
  if (!ALLOWED.has(method)) return { ok: false, error: 'Unknown action.' };
  if (!Array.isArray(args) || args.length > MAX_ARGS) return { ok: false, error: 'Invalid request.' };
  return store.transaction(campusId, async tx => {
    const db = await tx.load();
    const kart = new Kart(db);
    const actor = kart.user(actorId);
    if (!actor) return { ok: false as const, error: 'Account not found.' };
    const fn = (kart as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    if (typeof fn !== 'function') return { ok: false as const, error: 'Unknown action.' };
    const result = await fn.call(kart, actor, ...args) as Result<Record<string, unknown>> | undefined;
    if (!result || typeof result !== 'object' || !('ok' in result)) return { ok: false as const, error: 'Action failed.' };
    if (result.ok) await tx.save(kart.db);
    return result;
  });
}

const isAdmin = (u: User) => u.roles.includes('platform_admin');
const isStaff = (u: User) => isAdmin(u) || u.roles.includes('campus_admin');

/** What this user may see. The browser holds a snapshot, so anything not needed for the user's own pages is removed here. */
export function viewFor(db: Db, user: User): Db {
  const kart = new Kart(structuredClone(db));
  const d = kart.db;
  const mine = (account: string) => account.endsWith(`:${user.id}`) || (!!user.storeId && account.endsWith(`:${user.storeId}`));
  d.messages = d.messages.filter(m => kart.canReadThread(user, m.threadKey));
  d.notifications = d.notifications.filter(n => n.userId === user.id);
  d.wishlist = d.wishlist.filter(w => w.userId === user.id);
  d.promoUses = d.promoUses.filter(p => isAdmin(user) || p.userId === user.id);
  d.orders = d.orders.filter(o => isStaff(user) || o.buyerId === user.id || (!!user.storeId && o.storeId === user.storeId));
  d.verifications = d.verifications.filter(v => isStaff(user) || v.userId === user.id);
  d.tickets = d.tickets.filter(t => isStaff(user) || t.userId === user.id);
  if (!isAdmin(user)) {
    d.audit = [];
    d.chain = [];
    d.entries = d.entries.filter(e => e.postings.some(p => mine(p.account)));
  }
  return d;
}
