import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

/* ---------- minimal browser harness ---------- */

const app = { innerHTML: '' };
const storage = new Map();
const handlers = {};
const timers = [];

const context = vm.createContext({
  console,
  Date,
  Math,
  FormData: class { constructor(form) { return Object.entries(form.values || {}); } },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  location: { hash: '#/home' },
  document: {
    querySelector: selector => selector === '#app' ? app : null,
    querySelectorAll: () => [],
    addEventListener: (name, handler) => { handlers[name] = handler; },
    createElement: () => ({ textContent: '', innerHTML: '', className: '', remove() {}, click() {}, append() {} }),
    documentElement: { dataset: {} },
    body: { append() {} }
  },
  window: { addEventListener() {}, scrollTo() {} },
  setTimeout: fn => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
  confirm: () => true
});

const run = code => vm.runInContext(code, context);
const flush = (limit = 24) => { let n = 0; while (timers.length && n < limit) { timers.shift()(); n += 1; } };
const click = (act, dataset = {}) => run(`handleAction(${JSON.stringify(act)}, { dataset: ${JSON.stringify(dataset)} })`);
const submit = (id, values, dataset = {}) => handlers.submit({ target: { id, values, dataset }, preventDefault() {} });
const navigate = hash => run(`navigate(${JSON.stringify(hash)})`);
const balance = () => run('state.balance');
const html = () => app.innerHTML;
const future = days => new Date(Date.now() + days * 86400000).toISOString();

for (const file of ['data.js', 'store.js', 'ui.js', 'modals.js', 'pages.js', 'app.js']) {
  run(await readFile(new URL(`./${file}`, import.meta.url), 'utf8'));
}

/* ---------- boot and routing ---------- */

assert.match(html(), /KART|Explore|Dashboard/, 'app shell did not render');
assert.ok(html().length > 3000, 'home page too small');

const routes = [
  '#/explore', '#/explore?cat=food', '#/search?q=hack', '#/product/f1', '#/checkout',
  '#/orders', '#/order/KRT-1042', '#/tasks', '#/task/T-209', '#/events', '#/services',
  '#/resale', '#/wishlist', '#/wallet', '#/notifications', '#/profile', '#/workspace'
];
for (const hash of routes) {
  navigate(hash);
  assert.match(html(), /class="content"/, `${hash} did not render`);
  assert.ok(html().length > 600, `${hash} rendered too little content`);
}
navigate('#/product/f1');
assert.match(html(), /Masala Dosa Combo/);
navigate('#/search?q=Hack the Campus');
assert.match(html(), /Hack the Campus/);
navigate('#/explore?cat=food');
assert.equal(run('ui.explore.cat'), 'food');

/* ---------- dialogs ---------- */

const dialogs = [
  ['customize', 'm1'], ['rent', 'r2'], ['event', 'e1'], ['service', 'v1'], ['post-task', ''],
  ['print', ''], ['rate', 'KRT-1042'], ['review', 'f1'], ['new-listing', ''], ['offer-service', ''],
  ['send', ''], ['request', ''], ['seller', 'L-3001'], ['chat', 'KRT-1042'], ['rate-booking', 'BK-1'],
  ['new-event', ''], ['add-funds', '']
];
run('state.bookings = [{ id: "BK-1", name: "Math tutoring", provider: "Riya M.", amount: 250, when: new Date(Date.now()+86400000).toISOString(), note: "Calculus", status: "Confirmed", rated: 0 }]');
for (const [kind, id] of dialogs) {
  run(`openModal(${JSON.stringify(kind)}, ${JSON.stringify(id)})`);
  assert.match(html(), /role="dialog"/, `${kind} dialog did not render`);
}
run('closeModal()');
assert.doesNotMatch(html(), /role="dialog"/);

/* ---------- cart, promo, checkout ---------- */

const start = balance();
click('add', { id: 'f1' });
assert.equal(run('state.cart.length'), 1);
run('openModal("customize", "m1")');
submit('customize-form', { opt_Colour: 'Black', opt_Size: 'Large', qty: '2' }, { id: 'm1' });
assert.equal(run('state.cart.length'), 2);
assert.equal(run('state.cart[1].qty'), 2);
assert.match(run('JSON.stringify(state.cart[1])'), /Black \/ Large/);

run('addToCart("f2")');
assert.equal(run('applyPromo("KART10")'), true, 'valid promo code should apply');
assert.equal(run('cartTotals().discount'), 160, '10% promo capped at 200 KC');
assert.equal(run('state.promo'), 'KART10');
assert.equal(run('applyPromo("NOPE")'), false, 'unknown promo code should be rejected');
assert.equal(run('state.promo'), 'KART10');

const totals = JSON.parse(run('JSON.stringify(cartTotals())'));
assert.equal(totals.discount, 160);
assert.equal(totals.fee, 0, 'orders over 300 KC skip the service fee');
const expected = totals.total;
run('ui.checkout = { step: 3, mode: "Pickup", slot: "As soon as ready", note: "extra chutney", payment: "KC balance" }');
click('place-order');
assert.equal(balance(), start - expected, 'checkout did not debit the exact cart total');
assert.equal(run('state.cart.length'), 0);
assert.equal(run('state.orders.length'), 2);
assert.equal(run('state.orders[0].fulfil.note'), 'extra chutney');
assert.match(html(), /Picked|Placed|Preparing|Ready/, 'order page did not render a status');
const placedOrder = run('state.orders[0].id');

/* ---------- print, merchandise and rental orders ---------- */

const afterCheckout = balance();
submit('print-form', { document: 'Notes.pdf', pages: '3', copies: '2', colour: 'bw', sides: 'duplex', binding: 'spiral', shop: 'Library Xerox' });
assert.equal(balance(), afterCheckout - (3 * 2 * 2 + 30));
assert.match(run('state.orders[0].title || state.orders[0].items[0].name'), /Notes\.pdf/);

const afterPrint = balance();
submit('rent-form', { start: future(3), end: future(4) }, { id: 'r2' });
assert.equal(balance(), afterPrint - 200);
assert.match(run('state.orders[0].items[0].name'), /Cycle for Rent/);
assert.match(run('state.orders[0].items[0].variant'), /2 days/);

/* ---------- orders: advance, cancel, reorder ---------- */

run(`state.orders.find(o => o.id === ${JSON.stringify(placedOrder)}).auto = false`);
click('advance-order', { id: placedOrder });
assert.equal(run(`state.orders.find(o => o.id === ${JSON.stringify(placedOrder)}).status`), 'Preparing');
click('advance-order', { id: placedOrder });
assert.equal(run(`state.orders.find(o => o.id === ${JSON.stringify(placedOrder)}).status`), 'Ready for pickup');
const beforeCancel = balance();
click('cancel-order', { id: placedOrder });
assert.equal(balance(), beforeCancel + expected);
assert.equal(run(`state.orders.find(o => o.id === ${JSON.stringify(placedOrder)}).status`), 'Cancelled');

const beforeReorder = run('state.cart.length');
click('reorder', { id: 'KRT-1042' });
assert.ok(run('state.cart.length') > beforeReorder, 'reorder did not refill the cart');
run('state.cart = []; state.promo = null; save(); render();');

/* ---------- tasks: post, bid, escrow, refund, worker payout ---------- */

const beforeTask = balance();
const taskId = run(`postTask({ title: "Bring my books", description: "From the library", budget: "120", deadline: ${JSON.stringify(future(2))}, category: "Pickup", anonymous: "anonymous" }).id`);
assert.ok(taskId, 'task was not created');
assert.equal(run(`state.tasks.find(t => t.id === ${JSON.stringify(taskId)}).anonymous`), true);
assert.equal(run(`state.tasks.find(t => t.id === ${JSON.stringify(taskId)}).poster`), 'You');

const postedTaskId = taskId;
run(`{ const t = state.tasks.find(x => x.id === ${JSON.stringify(postedTaskId)}); t.bids.push({ id: "B-TEST", worker: "Riya M.", amount: 100, note: "I can do this now", at: new Date().toISOString() }); save(); }`);
assert.equal(run(`acceptBid(${JSON.stringify(postedTaskId)}, "B-TEST")`), true, 'poster should be able to accept a bid');
assert.equal(balance(), beforeTask - 100, 'accepting a bid should escrow the KC');
assert.equal(run(`state.tasks.find(t => t.id === ${JSON.stringify(postedTaskId)}).status`), 'Assigned');
const afterEscrow = balance();
click('cancel-task', { id: postedTaskId });
assert.equal(balance(), afterEscrow + 100, 'cancelling an assigned task must refund escrow');
assert.equal(run(`state.tasks.find(t => t.id === ${JSON.stringify(postedTaskId)}).status`), 'Cancelled');
assert.equal(run(`state.tasks.find(t => t.id === ${JSON.stringify(postedTaskId)}).committed || 0`), 0);

assert.equal(run('placeBid("T-210", 100, "Today 5 PM", "I can do this now")'), true);
assert.ok(run('state.tasks.find(t => t.id === "T-210").bids.some(b => b.worker === "You")'));
assert.equal(run('placeBid("T-210", 100, "Today 5 PM", "I can do this now")'), true, 're-bidding updates the existing proposal');
assert.equal(run('state.tasks.find(t => t.id === "T-210").bids.filter(b => b.worker === "You").length'), 1);
assert.equal(run('acceptBid("T-210", "B-NOPE")'), false, 'cannot accept a bid on someone else task');
assert.equal(run(`placeBid(${JSON.stringify(postedTaskId)}, 50, "now", "me again")`), false, 'closed tasks reject new bids');

/* worker side: poster accepts, work submitted, payment released */
run(`{ const t = state.tasks.find(x => x.id === "T-210"); t.status = "Assigned"; t.worker = "You"; t.committed = 100; t.acceptedBid = t.bids[0].id; save(); }`);
assert.equal(run('submitWork("T-210")'), true);
assert.equal(run('state.tasks.find(t => t.id === "T-210").status'), 'In review');
const beforePayout = balance();
run('releaseTask(state.tasks.find(t => t.id === "T-210"), false)');
assert.equal(balance(), beforePayout + 100);
assert.equal(run('state.tasks.find(t => t.id === "T-210").status'), 'Completed');

/* ---------- events, tickets, seats ---------- */

const seatsBefore = run('state.events.find(e => e.id === "e1").taken');
assert.equal(run('registerEvent("e1")'), true);
assert.equal(run('state.events.find(e => e.id === "e1").taken'), seatsBefore + 1);
assert.equal(run('state.tickets.length'), 1);
assert.equal(run('registerEvent("e1")'), false, 'double registration should be rejected');
const ticketId = run('state.tickets[0].id');
const beforeTicket = balance();
assert.equal(run(`cancelTicket(${JSON.stringify(ticketId)})`), true);
assert.equal(balance(), beforeTicket + 120);
assert.equal(run('state.events.find(e => e.id === "e1").taken'), seatsBefore);
assert.equal(run('state.tickets.length'), 0);

/* ---------- services, bookings and refunds ---------- */

const beforeBooking = balance();
assert.equal(run(`bookService("v1", { date: ${JSON.stringify(future(2).slice(0, 10))}, time: "12:00", note: "Calculus help" })`), true);
assert.equal(balance(), beforeBooking - 250);
const bookingId = run('state.bookings.find(b => b.serviceId === "v1" && b.status !== "Cancelled").id');
assert.equal(run(`cancelBooking(${JSON.stringify(bookingId)})`), true);
assert.equal(balance(), beforeBooking);
assert.equal(run(`rateBooking(${JSON.stringify(bookingId)}, 5)`), false, 'cancelled bookings cannot be rated');

assert.equal(run(`offerService({ name: "Chemistry tutoring", price: "210", unit: "hour", desc: "Study support" })`), true);
navigate('#/services');
assert.match(html(), /Chemistry tutoring/);
const ownService = run('state.serviceListings[0].id');
const beforeServiceEarn = balance();
assert.equal(run(`completeMyService(${JSON.stringify(ownService)})`), true);
assert.equal(balance(), beforeServiceEarn + 210);
assert.equal(run(`removeService(${JSON.stringify(ownService)})`), true);

/* ---------- resale ---------- */

assert.ok(run(`createListing({ name: "Desk Fan", price: "260", condition: "Good", desc: "Works perfectly" })`), 'listing should be created');
const listingId = run('state.listings[0].id');
assert.equal(run(`updateListing(${JSON.stringify(listingId)}, { price: 240 })`), true);
assert.equal(run(`state.listings.find(l => l.id === ${JSON.stringify(listingId)}).price`), 240);
const beforeBuy = balance();
assert.equal(run('buyListing("L-3006")'), true);
assert.equal(balance(), beforeBuy - 690);
assert.equal(run('state.listings.find(l => l.id === "L-3006").status'), 'sold');
assert.equal(run(`removeListing(${JSON.stringify(listingId)})`), true);

/* ---------- wallet ---------- */

const beforeFunds = balance();
assert.equal(run('addFunds(500)'), true);
assert.equal(balance(), beforeFunds + 500);
assert.equal(run('addFunds(40)'), false, 'below minimum top-up should fail');
assert.equal(run('sendKC(100, "Meera P.", "mess bill")'), true);
assert.equal(balance(), beforeFunds + 400);
assert.equal(run('sendKC(999999, "Nobody", "")'), false, 'overspend should fail');
assert.equal(run('requestKC(150, "Arjun K.", "printouts")'), true);
const requestId = run('state.requests[0].id');
const beforeSettle = balance();
assert.equal(run(`settleRequest(${JSON.stringify(requestId)})`), true);
assert.equal(balance(), beforeSettle + 150);

/* ---------- wishlist, reviews, ratings ---------- */

click('wish', { id: 'f2' });
assert.ok(run('state.wishlist.includes("f2")'));
click('wish', { id: 'f2' });
assert.ok(!run('state.wishlist.includes("f2")'));
submit('review-form', { 'review-rating': '4', text: 'Quick pickup and hot food.' }, { id: 'f1' });
assert.ok(run('state.reviews.f1.some(r => r.text.includes("Quick pickup"))'));
submit('rate-form', { 'order-rating': '5', text: 'Great' }, { id: 'KRT-1042' });
assert.equal(run('state.orders.find(o => o.id === "KRT-1042").rating'), 5);

/* ---------- moderation, console actions, settings ---------- */

const reportId = run('state.moderation.find(r => r.status === "pending").id');
assert.equal(run(`moderateReport(${JSON.stringify(reportId)}, "removed")`), true);
assert.equal(run(`state.moderation.find(r => r.id === ${JSON.stringify(reportId)}).status`), 'removed');
const userId = run('state.users[1].id');
const userStatus = run(`state.users[1].status`);
assert.equal(run(`toggleUser(${JSON.stringify(userId)})`), true);
assert.notEqual(run(`state.users[1].status`), userStatus);
const stockBefore = run('state.products.find(p => p.id === "f1").stock');
assert.equal(run('toggleStock("f1")'), true);
assert.notEqual(run('state.products.find(p => p.id === "f1").stock'), stockBefore);
assert.equal(run(`addProduct({ name: "Cheese Maggi", price: "70", type: "food", icon: "🍜", desc: "Late night bowl" })`), true);
const newProduct = run('state.products[0].id');
assert.equal(run(`deleteProduct(${JSON.stringify(newProduct)})`), true);
assert.equal(run(`saveEvent({ name: "Robotics Showcase", place: "Innovation Hall", date: ${JSON.stringify(future(6))}, price: "0", seats: "40", desc: "Demos and judging" })`) !== null, true);

const beforeTheme = run('state.settings.theme');
click('theme');
assert.notEqual(run('state.settings.theme'), beforeTheme);
click('theme');
assert.equal(run('state.settings.theme'), beforeTheme);

run('setRole("Vendor")');
assert.equal(run('state.role'), 'Vendor');
navigate('#/workspace');
assert.match(html(), /Preparation queue/);
run('setRole("Admin")');
navigate('#/workspace');
assert.match(html(), /Moderation queue/);
run('setRole("Organizer")');
navigate('#/workspace');
assert.match(html(), /Publish an event/);
run('setRole("Student")');

/* ---------- notifications and drawers ---------- */

assert.ok(run('unreadCount()') >= 0);
click('read-all');
assert.equal(run('unreadCount()'), 0);
run('openDrawer("cart")');
assert.equal(run('ui.drawer'), 'cart');
run('openDrawer("cart")');
assert.equal(run('ui.drawer'), null);

/* ---------- messaging and command palette ---------- */

run('navigate("#/task/T-208")');
submit('message-form', { text: 'I can collect it in ten minutes' }, { id: 'T-208' });
assert.equal(run('state.messages["T-208"].length'), 1);
assert.match(html(), /I can collect it/);
run('ui.palette = true; render();');
assert.match(html(), /palette-item/);
run('ui.help = true; ui.palette = false; render();');
assert.match(html(), /Keyboard shortcuts/);
run('ui.help = false; render();');

/* ---------- simulated campus activity (timers) ---------- */

const beforeLive = balance();
assert.equal(run('placeBid("T-208", 70, "10 minutes", "I am at the canteen now")'), true);
assert.equal(run('state.tasks.find(t => t.id === "T-208").status'), 'Open');
flush(200); // the poster reviews the bid asynchronously
assert.equal(run('state.tasks.find(t => t.id === "T-208").status'), 'Assigned', 'poster response should assign the task');
assert.equal(run('state.tasks.find(t => t.id === "T-208").worker'), 'You');
assert.equal(run('submitWork("T-208")'), true);
assert.equal(run('state.tasks.find(t => t.id === "T-208").status'), 'In review');
flush(60); // the poster approves asynchronously
assert.equal(run('state.tasks.find(t => t.id === "T-208").status'), 'Completed');
assert.equal(balance(), beforeLive + 70, 'approved work should pay out to the worker');

/* ---------- persistence ---------- */

const persisted = JSON.parse(storage.get('kart-v2'));
assert.equal(persisted.version, 2);
assert.ok(Array.isArray(persisted.orders) && persisted.orders.length >= 3);
assert.ok(typeof persisted.balance === 'number');
assert.equal(run('exportData().length') > 100, true);
assert.equal(run('importData(JSON.stringify(state))'), true);

console.log('KART smoke checks passed: routing, dialogs, cart, promo, checkout, print, rentals, order lifecycle, tasks with escrow and payouts, events, services, resale, wallet, reviews, moderation, consoles, notifications, palette, timers and persistence.');
