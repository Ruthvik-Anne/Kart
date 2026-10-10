import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/server/auth';
import { database, lockedState, saveState, transaction } from '@/server/database';
import { emptyState, Kart, type Db, type Result } from '@/mock/db';
import type { User } from '@/rbac/policy';
import { rateLimit } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

// Explicit allow-list of mutations the client may invoke. Every entry is still re-checked by the
// permission layer inside Kart, and the session identity is always the first argument.
const ACTIONS = new Set([
  // campus commerce
  'placeOrder', 'checkout', 'printRequest', 'placePrintOrder', 'cancelOrder', 'reviewOrder',
  'advanceOrder', 'verifyHandover', 'acceptDelivery', 'handoverToRunner', 'deliverOrder',
  'topUp',
  // tasks, chat and workflows
  'postTask', 'createWorkflow', 'placeBid', 'acceptBid', 'startWork', 'submitWork', 'approveMilestone',
  'requestChanges', 'cancelTask', 'openDispute', 'resolveDispute', 'reviewTask',
  'sendMessage', 'sendQuote', 'respondQuote',
  // marketplace, events, services
  'createListing', 'withdrawListing', 'reserveListing', 'confirmHandover', 'cancelReservation',
  'submitEvent', 'reviewEvent', 'registerEvent',
  'offerService', 'requestProviderVerification', 'reviewVerification',
  // campus operations
  'registerVendor', 'reviewVendor', 'addProduct', 'setStock', 'toggleStore', 'settle', 'setFees',
  'markAllRead', 'markNotificationRead',
  // audit chain
  'anchor', 'tamperDemo',
]);

function visibleState(state: Db, user: User): Db {
  const admin = user.roles.includes('campus_admin') || user.roles.includes('platform_admin');
  const platform = user.roles.includes('platform_admin');
  const k = new Kart(state);
  const ownAccounts = new Set([`USER_WALLET:${user.id}`, `VENDOR_PAYABLE:${user.id}`]);
  // Delivery jobs are campus-wide: a runner must see the shop, window and drop point before accepting.
  const deliveryBoard = (o: Db['orders'][number]) =>
    o.fulfillment === 'delivery' && ['Ready', 'Out for delivery'].includes(o.status);
  return {
    ...state,
    messages: state.messages.filter(m => k.canReadThread(user, m.threadKey)),
    notifications: state.notifications.filter(n => n.userId === user.id),
    orders: state.orders.filter(o => admin || o.buyerId === user.id || o.storeId === user.storeId
      || (user.roles.includes('student') && deliveryBoard(o)))
      .map(o => o.buyerId === user.id ? o : { ...o, handoverCode: undefined }),
    tickets: state.tickets.filter(t => admin || t.userId === user.id),
    verifications: state.verifications.filter(v => admin || v.userId === user.id),
    workflows: state.workflows.filter(w => admin || w.ownerId === user.id),
    vendorApps: admin ? state.vendorApps : [],
    audit: admin ? state.audit : [],
    chain: platform ? state.chain : [],
    entries: platform ? state.entries : state.entries
      .filter(e => e.postings.some(p => ownAccounts.has(p.account)))
      .map(e => ({ ...e, postings: e.postings.map(p => ownAccounts.has(p.account) ? p : { ...p, account: 'COUNTERPARTY' }) })),
    tasks: state.tasks.map(t => (t.posterId === user.id || t.assigneeId === user.id || admin)
      ? t : { ...t, attachments: [], milestones: t.milestones.map(m => ({ ...m, deliverables: [] })) }),
  };
}

async function ensureState(campusId: string) {
  await database().query(
    'INSERT INTO campus_state (campus_id, data) VALUES ($1, $2::jsonb) ON CONFLICT (campus_id) DO NOTHING',
    [campusId, JSON.stringify(emptyState())]);
}

function ensureUser(state: Db, identity: User): User {
  const existing = state.users.find(u => u.id === identity.id);
  if (existing) {
    Object.assign(existing, { name: identity.name, roles: identity.roles, campusId: identity.campusId });
    return existing;
  }
  const user = { id: identity.id, name: identity.name, roles: identity.roles, campusId: identity.campusId };
  state.users.push(user);
  return user;
}

export async function GET() {
  const identity = await currentUser();
  if (!identity) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  try {
    await ensureState(identity.campusId);
    const state = await transaction(async client => {
      const state = await lockedState(client, identity.campusId);
      ensureUser(state, identity);
      await saveState(client, identity.campusId, state);
      return state;
    });
    return NextResponse.json({ state: visibleState(state, identity) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[state] read failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Campus data is unavailable.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  if (!req.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 415 });
  }
  const identity = await currentUser();
  if (!identity) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  let input: { action?: unknown; args?: unknown };
  try { input = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof input.action !== 'string' || !ACTIONS.has(input.action) || !Array.isArray(input.args)) {
    return NextResponse.json({ error: 'This action is unavailable until its production service is connected.' }, { status: 400 });
  }
  if ((input.action === 'verifyHandover' || input.action === 'deliverOrder') && !rateLimit(`handover:${identity.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many code attempts. Try again in a minute.' }, { status: 429 });
  }
  try {
    await ensureState(identity.campusId);
    const output = await transaction(async client => {
      const state = await lockedState(client, identity.campusId);
      const actor = ensureUser(state, identity);
      const kart = new Kart(state);
      const action = input.action as keyof Kart;
      const method = kart[action];
      if (typeof method !== 'function') throw new Error('Invalid action.');
      const args = input.args as unknown[];
      if (action === 'sendMessage' && Array.isArray(args[3]) && args[3].length) {
        return { result: { ok: false, error: 'Attachments are unavailable until file storage is connected.' } as Result, state: visibleState(state, actor) };
      }
      if (action === 'registerEvent') {
        const event = state.events.find(e => e.id === args[1]);
        if (event?.price) return { result: { ok: false, error: 'Paid registration is unavailable until payments are connected.' } as Result, state: visibleState(state, actor) };
      }
      const result = (method as (...values: unknown[]) => Result).call(kart, actor, ...args.slice(1));
      if (result.ok) await saveState(client, identity.campusId, kart.db);
      return { result, state: visibleState(kart.db, actor) };
    });
    return NextResponse.json(output, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[state] action failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not save this change.' }, { status: 500 });
  }
}
