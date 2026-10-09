/* KART — state, persistence and every mutating action */

const STORE_KEY = 'kart-v2';
const clone = value => JSON.parse(JSON.stringify(value));
const makeId = prefix => `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

const seedOrder = () => ({
  id: 'KRT-1042',
  type: 'food',
  vendor: 'Campus Bites',
  created: isoHours(-3),
  status: 'Ready for pickup',
  auto: false,
  payment: 'KC balance',
  fulfil: { mode: 'Pickup', slot: 'As soon as ready', note: '' },
  items: [{ id: 'f1', name: 'Masala Dosa Combo', icon: '🥘', price: 85, qty: 1, variant: '', vendor: 'Campus Bites', type: 'food' }],
  subtotal: 85, discount: 0, fee: 0, total: 85,
  rating: 0,
  timeline: [
    { status: 'Placed', at: isoHours(-3) },
    { status: 'Preparing', at: isoHours(-2.6) },
    { status: 'Ready for pickup', at: isoHours(-2.1) }
  ]
});

const seedTasks = () => ([
  {
    id: 'T-208', title: 'Collect my printouts from Library Xerox',
    description: 'Three bound copies are ready. Please bring them to the engineering block before 4 PM.',
    budget: 90, deadline: isoHours(3), category: 'Pickup', poster: 'Anonymous student',
    anonymous: true, urgent: true, status: 'Open', bids: [], createdAt: isoHours(-6)
  },
  {
    id: 'T-209', title: 'Help format a lab presentation',
    description: 'Need a clean 10-slide presentation for the electronics lab. Slides and content are ready.',
    budget: 350, deadline: isoIn(4, 17, 0), category: 'Digital', poster: 'Meera P.',
    anonymous: false, urgent: false, status: 'Open', bids: [
      { id: 'B-7781', worker: 'Nikhil K.', amount: 320, note: 'I design club decks every week. ETA: tomorrow evening.', at: isoHours(-9) }
    ], createdAt: isoHours(-14)
  },
  {
    id: 'T-210', title: 'Pick up stationery from main gate',
    description: 'Collect a reserved calculator and deliver it to Hostel C, desk 214.',
    budget: 110, deadline: isoHours(6), category: 'Delivery', poster: 'Arjun K.',
    anonymous: false, urgent: false, status: 'Open', bids: [], createdAt: isoHours(-2)
  }
]);

const defaults = () => ({
  version: 2,
  role: 'Student',
  area: 'Main Campus',
  profile: { name: 'Alex Sharma', email: 'alex.sharma@campus.edu', bio: 'Second year, CSE. Always up for a quick delivery run.', hostel: 'Hostel C', initials: 'AS' },
  settings: { theme: 'light', notify: true, autosave: true },
  balance: 2315,
  cart: [],
  wishlist: [],
  promo: null,
  products: clone(SEED_PRODUCTS),
  events: clone(SEED_EVENTS),
  services: clone(SEED_SERVICES),
  listings: clone(SEED_LISTINGS),
  reviews: clone(SEED_REVIEWS),
  users: clone(SEED_USERS),
  serviceListings: [],
  orders: [seedOrder()],
  tasks: seedTasks(),
  tickets: [],
  bookings: [],
  messages: {},
  requests: [],
  transactions: [
    { id: 'TX-1002', title: 'Food order · Masala Dosa Combo', amount: -85, at: isoHours(-3), type: 'debit', cat: 'Orders' },
    { id: 'TX-1001', title: 'Welcome demo credits', amount: 2400, at: isoIn(-30), type: 'credit', cat: 'Top-ups' }
  ],
  notifications: clone(SEED_NOTIFICATIONS),
  moderation: [
    { id: 'MD-1', kind: 'Listing', title: 'Bluetooth Speaker', owner: 'Kabir M.', reason: 'Price flagged 40% above campus median', at: isoHours(-8), status: 'pending' },
    { id: 'MD-2', kind: 'Service', title: '“Exam代办” exam proxy offer', owner: 'Unknown', reason: 'Reported by 3 students', at: isoHours(-30), status: 'pending' },
    { id: 'MD-3', kind: 'Task', title: 'Buy exam questions paper', owner: 'Guest 4471', reason: 'Academic misconduct', at: isoHours(-52), status: 'pending' }
  ],
  audit: [
    { id: 'AU-1', at: isoHours(-30), actor: 'System', action: 'Demo ledger initialised with 2400 KC' },
    { id: 'AU-2', at: isoHours(-8), actor: 'Admin', action: 'Flagged listing L-3006 for price review' }
  ]
});

function migrate(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const next = { ...base, ...raw, version: 2 };
  if (raw.version !== 2) {
    if (Array.isArray(raw.cart)) next.cart = raw.cart.map(entry => typeof entry === 'string' ? { id: entry, variant: '', qty: 1 } : { qty: 1, variant: '', ...entry });
    if (Array.isArray(raw.orders)) next.orders = raw.orders.map(o => ({
      id: o.id, type: o.type || 'food', vendor: o.vendor || 'Campus Bites', created: o.created && o.created !== 'Demo sample' ? o.created : isoIn(-1),
      status: o.status || 'Placed', auto: false, payment: 'KC balance',
      fulfil: { mode: 'Pickup', slot: o.window || 'As soon as ready', note: '' },
      items: [{ id: '', name: o.title, icon: '🛍️', price: o.amount || 0, qty: 1, variant: '', vendor: o.vendor || '', type: o.type || 'food' }],
      subtotal: o.amount || 0, discount: 0, fee: 0, total: o.amount || 0, rating: 0,
      timeline: [{ status: o.status || 'Placed', at: isoIn(-1) }]
    }));
    if (Array.isArray(raw.messages)) {
      next.messages = {};
      raw.messages.forEach(m => { (next.messages[m.taskId] ||= []).push(m); });
    }
    if (Array.isArray(raw.transactions)) next.transactions = raw.transactions.map(t => ({ ...t, at: t.date && t.date !== 'Demo sample' ? t.date : isoIn(-2), cat: t.amount >= 0 ? 'Top-ups' : 'Orders' }));
    if (Array.isArray(raw.listings)) next.listings = raw.listings.map(l => ({ ...l, status: 'live', seller: 'You', area: base.area, at: isoIn(-1) }));
    if (Array.isArray(raw.serviceListings)) next.serviceListings = raw.serviceListings.map(s => ({ ...s, tags: ['Mine'] }));
    ['tasks', 'tickets', 'bookings', 'notifications'].forEach(k => { if (Array.isArray(raw[k])) next[k] = raw[k]; });
    next.tasks = next.tasks.map(t => ({ bids: [], status: 'Open', urgent: false, anonymous: false, createdAt: isoIn(-1), ...t }));
  }
  const guard = (key, fallback) => { if (!Array.isArray(next[key])) next[key] = fallback; };
  Object.keys(base).forEach(key => { if (Array.isArray(base[key])) guard(key, base[key]); });
  if (!Number.isFinite(next.balance) || next.balance < 0) next.balance = base.balance;
  if (!['Student', 'Vendor', 'Organizer', 'Admin'].includes(next.role)) next.role = 'Student';
  return next;
}

let state;
try { state = migrate(JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem('kart-demo-v1') || 'null')); }
catch { state = defaults(); }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('Browser storage is unavailable — changes last until this tab closes.', 'warn'); }
}

function commit(message, kind = 'ok') {
  save();
  render();
  if (message) toast(message, kind);
}

function resetState() {
  state = defaults();
  save();
  render();
  toast('Demo data reset to a fresh campus', 'ok');
}

/* ---------- ledger ---------- */

function record(title, amount, cat = 'Other', type = null) {
  state.transactions.unshift({
    id: makeId('TX'), title, amount,
    at: isoNow(), cat,
    type: type || (amount >= 0 ? 'credit' : 'debit')
  });
}

function earn(amount, title, cat = 'Earnings') {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  state.balance += amount;
  record(title, amount, cat, 'credit');
  return true;
}

function spend(amount, title, cat = 'Orders') {
  if (!Number.isInteger(amount) || amount <= 0) { toast('Enter a valid KC amount.', 'warn'); return false; }
  if (state.balance < amount) { toast('Not enough KC for this action.', 'warn'); return false; }
  state.balance -= amount;
  record(`-${title}`, -amount, cat, 'debit');
  return true;
}

function notify(type, title, body, link = '') {
  if (!state.settings.notify && type !== 'system') return;
  state.notifications.unshift({ id: makeId('N'), type, title, body, at: isoNow(), read: false, link });
  state.notifications = state.notifications.slice(0, 60);
}

function audit(action) {
  state.audit.unshift({ id: makeId('AU'), at: isoNow(), actor: state.role, action });
  state.audit = state.audit.slice(0, 80);
}

const unreadCount = () => state.notifications.filter(n => !n.read).length;

/* ---------- selectors ---------- */

const getProduct = id => state.products.find(p => p.id === id);
const getEvent = id => state.events.find(e => e.id === id);
const getTask = id => state.tasks.find(t => t.id === id);
const getListing = id => state.listings.find(l => l.id === id);
const getService = id => state.services.concat(state.serviceListings).find(s => s.id === id);
const getOrder = id => state.orders.find(o => o.id === id);
const allServices = () => state.services.concat(state.serviceListings);

function cartLines() {
  return state.cart.map(entry => {
    const product = getProduct(entry.id);
    const qty = Number(entry.qty);
    return { entry, product, qty: Number.isInteger(qty) && qty >= 1 && qty <= 50 ? qty : 1, variant: entry.variant || '' };
  }).filter(line => line.product);
}

function cartTotals(lines = cartLines()) {
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  let discount = 0;
  const promo = PROMOS[state.promo];
  if (promo && subtotal >= promo.min) discount = promo.kind === 'percent' ? Math.min(promo.cap, Math.round(subtotal * promo.value / 100)) : promo.value;
  const fee = subtotal === 0 || subtotal - discount >= 300 ? 0 : 15;
  return { subtotal, discount, fee, total: Math.max(0, subtotal - discount + fee) };
}

const productRating = p => {
  const list = state.reviews[p.id] || [];
  if (!list.length) return p.rating || 0;
  const all = [p.rating || 0].concat(list.map(r => r.rating));
  return Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10;
};

/* ---------- cart ---------- */

function addToCart(id, variant = '', qty = 1, silent = false) {
  const product = getProduct(id);
  if (!product) return false;
  if (!product.stock) { toast('That item is out of stock right now.', 'warn'); return false; }
  const existing = state.cart.find(e => e.id === id && e.variant === variant);
  if (existing) existing.qty = Math.min(50, existing.qty + qty);
  else state.cart.push({ id, variant, qty });
  if (!silent) commit(`${product.name} added to cart`);
  return true;
}

function setCartQty(index, qty) {
  const entry = state.cart[index];
  if (!entry) return;
  if (qty < 1) state.cart.splice(index, 1);
  else entry.qty = Math.min(50, qty);
  commit();
}

function removeFromCart(index) {
  const line = cartLines()[index];
  state.cart.splice(index, 1);
  commit(line ? `${line.product.name} removed` : 'Removed from cart');
}

function applyPromo(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!PROMOS[key]) { toast('That promo code is not valid.', 'warn'); return false; }
  const { subtotal } = cartTotals();
  if (subtotal < PROMOS[key].min) { toast(`Add ${(PROMOS[key].min - subtotal)} KC more to use ${key}.`, 'warn'); return false; }
  state.promo = key;
  commit(`${key} applied — ${PROMOS[key].label}`);
  return true;
}

function clearCart() { state.cart = []; state.promo = null; commit('Cart cleared'); }

/* ---------- orders ---------- */

function placeOrder({ mode, slot, note = '', payment = 'KC balance' }) {
  const lines = cartLines();
  if (!lines.length) { toast('Your cart is empty.', 'warn'); return null; }
  const totals = cartTotals(lines);
  if (!spend(totals.total, `Order · ${lines.length} item${lines.length > 1 ? 's' : ''}`, 'Orders')) return null;
  const vendor = lines.length === 1 ? lines[0].product.vendor : `${lines.length} campus vendors`;
  const order = {
    id: makeId('KRT'), type: lines[0].product.type, vendor,
    created: isoNow(), status: 'Placed', auto: true, payment,
    fulfil: { mode, slot, note },
    items: lines.map(l => ({ id: l.product.id, name: l.product.name, icon: l.product.icon, price: l.product.price, qty: l.qty, variant: l.variant, vendor: l.product.vendor, type: l.product.type })),
    subtotal: totals.subtotal, discount: totals.discount, fee: totals.fee, total: totals.total,
    rating: 0, timeline: [{ status: 'Placed', at: isoNow() }]
  };
  lines.forEach(l => { if (typeof l.product.stock === 'number') l.product.stock = Math.max(0, l.product.stock - l.qty); });
  state.orders.unshift(order);
  state.cart = [];
  state.promo = null;
  notify('order', `Order ${order.id} placed`, `${vendor} · ${totals.total} KC · ${mode.toLowerCase()} ${slot}`);
  audit(`Order ${order.id} created for ${totals.total} KC`);
  scheduleOrderProgress(order.id);
  return order;
}

function advanceOrder(id, silent = false) {
  const order = getOrder(id);
  if (!order) return null;
  const flow = { 'Placed': 'Preparing', 'Preparing': 'Ready for pickup', 'Ready for pickup': 'Picked up' };
  const next = flow[order.status];
  if (!next) return order;
  order.status = next;
  order.timeline.push({ status: next, at: isoNow() });
  if (next === 'Picked up') order.auto = false;
  notify('order', `${order.titleSafe || order.items[0].name} — ${next.toLowerCase()}`, `Order ${order.id} · ${order.vendor}`);
  if (!silent) commit(`Order moved to ${next.toLowerCase()}`);
  return order;
}

function cancelOrder(id) {
  const order = getOrder(id);
  if (!order || ['Cancelled', 'Picked up'].includes(order.status)) return false;
  order.status = 'Cancelled';
  order.auto = false;
  order.timeline.push({ status: 'Cancelled', at: isoNow() });
  earn(order.total, `Refund · ${order.id}`, 'Refunds');
  notify('order', `Order ${order.id} cancelled`, `${order.total} KC returned to your wallet.`);
  commit('Order cancelled and KC refunded');
  return true;
}

function reorder(id) {
  const order = getOrder(id);
  if (!order) return false;
  let added = 0;
  order.items.forEach(item => { if (getProduct(item.id) && addToCart(item.id, item.variant, item.qty, true)) added += 1; });
  if (!added) { toast('Those items are no longer available.', 'warn'); return false; }
  commit(`${added} item${added > 1 ? 's' : ''} added to cart — review then checkout`);
  openDrawer('cart');
  return true;
}

function rateOrder(id, rating, text) {
  const order = getOrder(id);
  if (!order) return false;
  order.rating = rating;
  order.review = text;
  order.items.forEach(item => {
    if (!item.id) return;
    (state.reviews[item.id] ||= []).unshift({ id: makeId('RV'), user: state.profile.name, rating, text, at: isoNow() });
  });
  commit('Thanks — your review is live');
  return true;
}

const orderProgress = order => {
  const steps = order.status === 'Cancelled' ? ['Placed', 'Cancelled'] : ['Placed', 'Preparing', 'Ready for pickup', 'Picked up'];
  const at = steps.indexOf(order.status);
  return { steps, at: at < 0 ? 0 : at, percent: steps.length === 1 ? 100 : Math.round((at / (steps.length - 1)) * 100) };
};

const scheduledOrders = new Set();

function scheduleOrderProgress(orderId) {
  if (scheduledOrders.has(orderId)) return;
  scheduledOrders.add(orderId);
  const step = () => {
    const order = getOrder(orderId);
    if (!order || !order.auto || order.status === 'Cancelled') { scheduledOrders.delete(orderId); return; }
    if (order.status === 'Picked up') { scheduledOrders.delete(orderId); return; }
    advanceOrder(orderId, true);
    save();
    if (route.name === 'orders' || route.name === 'order') render();
    setTimeout(step, 9000);
  };
  setTimeout(step, 7000);
}

/* ---------- wishlist ---------- */

function toggleWishlist(id) {
  const at = state.wishlist.indexOf(id);
  if (at >= 0) { state.wishlist.splice(at, 1); commit('Removed from wishlist'); }
  else { state.wishlist.push(id); commit('Saved to wishlist'); }
}

/* ---------- tasks ---------- */

function postTask(data) {
  const deadline = new Date(data.deadline);
  if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) { toast('Choose a future deadline.', 'warn'); return null; }
  const budget = Number(data.budget);
  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();
  if (!title || !description || !Number.isInteger(budget) || budget < 1 || budget > 100000) { toast('Enter a valid task and budget.', 'warn'); return null; }
  const task = {
    id: makeId('T'), title, description, budget, deadline: deadline.toISOString(),
    category: data.category || 'Other', poster: 'You', anonymous: data.anonymous === 'anonymous',
    urgent: !!data.urgent, status: 'Open', bids: [], createdAt: isoNow(), worker: null
  };
  state.tasks.unshift(task);
  notify('task', 'Task published', `${title} · ${budget} KC budget`);
  audit(`Task ${task.id} published`);
  scheduleIncomingBids(task.id);
  commit('Task published — students will start bidding');
  return task;
}

function placeBid(taskId, amount, eta, note) {
  const task = getTask(taskId);
  if (!task || task.status !== 'Open') { toast('This task is no longer open.', 'warn'); return false; }
  if (task.poster === 'You') { toast('You cannot bid on your own task.', 'warn'); return false; }
  if (task.bids.some(b => b.worker === 'You')) { toast('You already bid — updating your proposal.', 'warn'); }
  const existing = task.bids.find(b => b.worker === 'You');
  const payload = { worker: 'You', amount, note: `${note} · ETA: ${eta}`, at: isoNow() };
  if (existing) Object.assign(existing, payload);
  else task.bids.push({ id: makeId('B'), ...payload });
  audit(`Bid ${existing ? 'updated' : 'placed'} on ${task.id}`);
  commit(existing ? 'Proposal updated' : 'Bid submitted — the poster will review it');
  schedulePosterResponse(taskId);
  return true;
}

function acceptBid(taskId, bidId) {
  const task = getTask(taskId);
  const bid = task?.bids.find(b => b.id === bidId);
  if (!task || !bid || task.poster !== 'You' || task.status !== 'Open') return false;
  if (!spend(bid.amount, `Task escrow · ${task.title}`, 'Tasks')) return false;
  task.status = 'Assigned';
  task.acceptedBid = bid.id;
  task.worker = bid.worker;
  task.committed = bid.amount;
  notify('task', `Bid accepted for ${task.title}`, `${bid.worker} is on it · ${bid.amount} KC held in escrow`);
  audit(`Bid accepted on ${task.id}, ${bid.amount} KC escrowed`);
  commit('Bid accepted — KC held in escrow');
  return true;
}

function submitWork(taskId) {
  const task = getTask(taskId);
  if (!task || task.status !== 'Assigned' || task.worker !== 'You') return false;
  task.status = 'In review';
  notify('task', 'Work submitted for review', `${task.title} — waiting for the poster to approve.`);
  commit('Work submitted for review');
  scheduleApproval(taskId);
  return true;
}

function approveTask(taskId) {
  const task = getTask(taskId);
  if (!task || task.poster !== 'You' || task.status !== 'Assigned') return false;
  releaseTask(task, true);
  return true;
}

function releaseTask(task, local) {
  const amount = task.committed || 0;
  task.status = 'Completed';
  task.committed = 0;
  if (local) {
    record(`Task released · ${task.title}`, 0, 'Tasks', 'release');
    notify('task', 'Task completed', `${task.title} · ${amount} KC released to ${task.worker}`);
    commit('Task completed and escrow released');
  } else {
    earn(amount, `Task earned · ${task.title}`, 'Earnings');
    notify('task', `You earned ${amount} KC`, `${task.title} — payment released to your wallet.`);
    audit(`Task ${task.id} completed, ${amount} KC paid out`);
    commit(`${amount} KC earned — added to your wallet`);
  }
}

function cancelTask(taskId) {
  const task = getTask(taskId);
  if (!task || task.poster !== 'You' || !['Open', 'Assigned'].includes(task.status)) return false;
  if (task.committed) earn(task.committed, `Task refund · ${task.title}`, 'Refunds');
  task.committed = 0;
  task.status = 'Cancelled';
  notify('task', 'Task cancelled', `${task.title} · any escrow was refunded.`);
  commit('Task cancelled and escrow refunded');
  return true;
}

function withdrawBid(taskId) {
  const task = getTask(taskId);
  if (!task || task.status !== 'Open') return false;
  task.bids = task.bids.filter(b => b.worker !== 'You');
  commit('Bid withdrawn');
  return true;
}

function scheduleIncomingBids(taskId) {
  const pool = [
    { worker: 'Riya M.', amount: 0.9, note: 'I pass that counter every day — can do it in 20 minutes.' },
    { worker: 'Arjun K.', amount: 0.8, note: 'Available now, I will send a photo when done.' },
    { worker: 'Sneha T.', amount: 1, note: 'Done this for my own batch twice. Happy to start immediately.' }
  ];
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const add = delay => setTimeout(() => {
    const task = getTask(taskId);
    if (!task || task.status !== 'Open') return;
    const person = pick();
    if (task.bids.some(b => b.worker === person.worker)) return;
    task.bids.push({
      id: makeId('B'), worker: person.worker,
      amount: Math.max(20, Math.round(task.budget * person.amount)),
      note: person.note, at: isoNow()
    });
    notify('task', `New bid on ${task.title}`, `${person.worker} bid on your task.`);
    save();
    if (route.name === 'tasks' || route.name === 'task') render();
  }, delay);
  add(9000);
  add(21000);
}

function schedulePosterResponse(taskId) {
  setTimeout(() => {
    const task = getTask(taskId);
    if (!task || task.status !== 'Open') return;
    const myBid = task.bids.find(b => b.worker === 'You');
    if (!myBid) return;
    task.status = 'Assigned';
    task.acceptedBid = myBid.id;
    task.worker = 'You';
    task.committed = myBid.amount;
    notify('task', `Your bid was accepted — ${task.title}`, 'Submit your work when finished to get paid.');
    audit(`Poster accepted the bid on ${task.id}`);
    save();
    if (route.name === 'tasks' || route.name === 'task') render();
    toast(`${task.poster === 'You' ? 'Bid' : task.poster} accepted your bid — submit work to get paid`, 'ok');
  }, 6000);
}

function scheduleApproval(taskId) {
  setTimeout(() => {
    const task = getTask(taskId);
    if (!task || task.status !== 'In review') return;
    releaseTask(task, false);
    save();
    if (route.name === 'tasks' || route.name === 'task') render();
  }, 6000);
}

function sendMessage(taskId, text) {
  const task = getTask(taskId);
  if (!task || !text.trim()) return false;
  (state.messages[taskId] ||= []).push({ id: makeId('M'), text: text.trim(), at: isoNow(), mine: true });
  save();
  const reply = task.poster === 'You'
    ? 'Thanks! I will confirm as soon as I can see the progress.'
    : ['Sounds good — thanks for the quick reply.', 'Perfect, please share an ETA when you can.', 'Got it. Ping me once it is done.'][Math.floor(Math.random() * 3)];
  setTimeout(() => {
    (state.messages[taskId] ||= []).push({ id: makeId('M'), text: reply, at: isoNow(), mine: false });
    save();
    if (route.name === 'task' && route.id === taskId) render();
  }, 1600);
  render();
  return true;
}

/* ---------- events ---------- */

function registerEvent(eventId) {
  const event = getEvent(eventId);
  if (!event || state.tickets.some(t => t.eventId === eventId)) { toast('You already hold a ticket.', 'warn'); return false; }
  if (event.taken >= event.seats) { toast('This event is sold out.', 'warn'); return false; }
  if (event.price && !spend(event.price, `Ticket · ${event.name}`, 'Events')) return false;
  event.taken += 1;
  state.tickets.unshift({
    id: makeId('TKT'), eventId, name: event.name, date: event.date, place: event.place,
    price: event.price, at: isoNow(), checkedIn: false, code: `KART-${Math.floor(100000 + Math.random() * 899999)}`
  });
  notify('event', 'Ticket confirmed', `${event.name} · ${event.place}`);
  audit(`Ticket issued for ${event.name}`);
  commit('Ticket confirmed — check My orders for the pass');
  return true;
}

function cancelTicket(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return false;
  const event = getEvent(ticket.eventId);
  if (event) event.taken = Math.max(0, event.taken - 1);
  if (ticket.price) earn(ticket.price, `Ticket refund · ${ticket.name}`, 'Refunds');
  state.tickets = state.tickets.filter(t => t.id !== ticketId);
  notify('event', 'Ticket cancelled', `${ticket.name} · refund processed.`);
  commit('Ticket cancelled and KC refunded');
  return true;
}

function saveEvent(data) {
  const name = String(data.name || '').trim();
  const price = Number(data.price);
  const seats = Number(data.seats);
  const when = new Date(data.date);
  if (!name || !data.place || Number.isNaN(when.getTime()) || when <= new Date()) { toast('Add a name, venue and future date.', 'warn'); return null; }
  if (!Number.isInteger(price) || price < 0 || !Number.isInteger(seats) || seats < 1) { toast('Set a valid price and seat count.', 'warn'); return null; }
  const event = {
    id: makeId('E'), name, host: state.profile.name, icon: data.icon || '🎉', date: when.toISOString(),
    place: data.place, price, seats, taken: 0, category: data.category || 'Campus',
    desc: String(data.desc || '').trim(), status: 'Published'
  };
  state.events.unshift(event);
  notify('event', 'Event published', `${name} · ${seats} seats`);
  audit(`Event ${event.name} published`);
  commit('Event published to the campus feed');
  return event;
}

function deleteEvent(eventId) {
  const event = getEvent(eventId);
  if (!event) return false;
  state.events = state.events.filter(e => e.id !== eventId);
  state.tickets.filter(t => t.eventId === eventId).forEach(t => { if (t.price) earn(t.price, `Event cancelled refund · ${t.name}`, 'Refunds'); });
  state.tickets = state.tickets.filter(t => t.eventId !== eventId);
  audit(`Event ${event.name} removed`);
  commit('Event removed and tickets refunded');
  return true;
}

function toggleCheckIn(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return false;
  ticket.checkedIn = !ticket.checkedIn;
  commit(ticket.checkedIn ? 'Checked in at the gate' : 'Check-in undone');
  return true;
}

/* ---------- services ---------- */

function bookService(serviceId, data) {
  const service = getService(serviceId);
  if (!service || service.mine) return false;
  const when = new Date(`${data.date}T${data.time}`);
  const note = String(data.note || '').trim();
  if (Number.isNaN(when.getTime()) || when <= new Date() || !note) { toast('Choose a future time and describe your request.', 'warn'); return false; }
  if (!spend(service.price, `Booking · ${service.name}`, 'Services')) return false;
  state.bookings.unshift({
    id: makeId('BK'), serviceId, amount: service.price, name: service.name, provider: service.provider,
    icon: service.icon, when: when.toISOString(), note, status: 'Requested', rated: 0, at: isoNow()
  });
  notify('service', 'Booking requested', `${service.name} with ${service.provider}`);
  audit(`Service booked: ${service.name}`);
  commit('Booking requested — the provider will confirm shortly');
  scheduleProviderResponse(state.bookings[0].id);
  return true;
}

function scheduleProviderResponse(bookingId) {
  setTimeout(() => {
    const booking = state.bookings.find(b => b.id === bookingId);
    if (!booking || booking.status !== 'Requested') return;
    booking.status = 'Confirmed';
    notify('service', 'Booking confirmed', `${booking.name} · ${booking.provider} accepted your request.`);
    save();
    if (route.name === 'services') render();
    toast('Provider confirmed your booking', 'ok');
  }, 5000);
}

function cancelBooking(bookingId) {
  const booking = state.bookings.find(b => b.id === bookingId);
  if (!booking || booking.status === 'Cancelled') return false;
  booking.status = 'Cancelled';
  earn(booking.amount, `Booking refund · ${booking.name}`, 'Refunds');
  notify('service', 'Booking cancelled', `${booking.name} · ${booking.amount} KC refunded.`);
  commit('Booking cancelled and KC refunded');
  return true;
}

function rateBooking(bookingId, rating) {
  const booking = state.bookings.find(b => b.id === bookingId);
  if (!booking || booking.status === 'Cancelled') return false;
  booking.rated = rating;
  booking.status = 'Completed';
  const service = getService(booking.serviceId);
  if (service) service.rating = Math.round(((service.rating * service.ratingCount + rating) / (service.ratingCount + 1)) * 10) / 10;
  commit('Rating submitted — thanks!');
  return true;
}

function offerService(data) {
  const name = String(data.name || '').trim();
  const desc = String(data.desc || '').trim();
  const price = Number(data.price);
  if (!name || !desc || !Number.isInteger(price) || price < 1 || price > 100000) { toast('Enter a valid service and price.', 'warn'); return false; }
  const service = {
    id: makeId('SV'), name, provider: state.profile.name, price, unit: data.unit || 'hour',
    icon: '✨', rating: 5.0, ratingCount: 0, desc, tags: ['Mine'], mine: true, at: isoNow()
  };
  state.serviceListings.unshift(service);
  notify('service', 'Service published', `${name} · ${price} KC / ${service.unit}`);
  audit(`Service offered: ${name}`);
  commit('Service published to the marketplace');
  return true;
}

function removeService(id) {
  state.serviceListings = state.serviceListings.filter(s => s.id !== id);
  commit('Service removed');
  return true;
}

function completeMyService(id) {
  const service = state.serviceListings.find(s => s.id === id);
  if (!service) return false;
  earn(service.price, `Service earned · ${service.name}`, 'Earnings');
  notify('service', 'Service marked complete', `${service.name} · ${service.price} KC added to your wallet.`);
  commit('Marked complete — KC added to your wallet');
  return true;
}

/* ---------- resale ---------- */

function createListing(data) {
  const name = String(data.name || '').trim();
  const desc = String(data.desc || '').trim();
  const price = Number(data.price);
  if (!name || !desc || !Number.isInteger(price) || price < 1 || price > 100000) { toast('Enter a valid listing and price.', 'warn'); return false; }
  const listing = {
    id: makeId('L'), name, price, condition: data.condition || 'Good', desc,
    icon: data.icon || '📦', seller: 'You', status: 'live', rental: data.condition === 'For rent',
    at: isoNow(), area: state.area, mine: true
  };
  state.listings.unshift(listing);
  notify('resale', 'Listing is live', `${name} · ${price} KC`);
  audit(`Listing created: ${name}`);
  commit('Listing published to campus');
  return true;
}

function updateListing(id, patch) {
  const listing = getListing(id);
  if (!listing) return false;
  Object.assign(listing, patch);
  commit('Listing updated');
  return true;
}

function removeListing(id) {
  state.listings = state.listings.filter(l => l.id !== id);
  commit('Listing removed');
  return true;
}

function buyListing(id) {
  const listing = getListing(id);
  if (!listing) return false;
  if (listing.seller === 'You') { toast('This is your own listing.', 'warn'); return false; }
  if (listing.status === 'sold') { toast('Already sold — create your own listing instead.', 'warn'); return false; }
  if (!spend(listing.price, `Campus purchase · ${listing.name}`, 'Resale')) return false;
  listing.status = 'sold';
  const order = {
    id: makeId('KRT'), type: 'resale', vendor: listing.seller, created: isoNow(), status: 'Placed', auto: false,
    payment: 'KC balance', fulfil: { mode: 'Meet-up', slot: 'Arrange with seller', note: listing.area || '' },
    items: [{ id: listing.id, name: listing.name, icon: listing.icon, price: listing.price, qty: 1, variant: '', vendor: listing.seller, type: 'resale' }],
    subtotal: listing.price, discount: 0, fee: 0, total: listing.price, rating: 0,
    timeline: [{ status: 'Placed', at: isoNow() }]
  };
  state.orders.unshift(order);
  notify('resale', 'Purchase complete', `${listing.name} — coordinate pickup with ${listing.seller}.`);
  audit(`Purchased ${listing.name} from ${listing.seller}`);
  commit('Purchase complete — meet-up details are in My orders');
  navigate('#/orders');
  return true;
}

/* ---------- wallet ---------- */

function addFunds(amount) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 50 || value > 5000) { toast('Choose between 50 and 5000 KC.', 'warn'); return false; }
  earn(value, 'Demo top-up', 'Top-ups');
  notify('wallet', `${value} KC added`, 'Demo credits are simulated and hold no real value.');
  commit(`${value} KC added to your wallet`);
  return true;
}

function sendKC(amount, to, note) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 1 || !String(to || '').trim()) { toast('Enter a valid amount and recipient.', 'warn'); return false; }
  if (!spend(value, `Sent to ${to}`, 'Transfers')) return false;
  notify('wallet', 'Transfer sent', `${value} KC → ${to}${note ? ` · ${note}` : ''}`);
  audit(`Transferred ${value} KC to ${to}`);
  commit(`${value} KC sent to ${to}`);
  return true;
}

function requestKC(amount, from, note) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 1 || !String(from || '').trim()) { toast('Enter a valid amount and name.', 'warn'); return false; }
  state.requests.unshift({ id: makeId('RQ'), amount: value, from: from.trim(), note: String(note || '').trim(), at: isoNow(), status: 'Pending' });
  notify('wallet', 'Payment request sent', `${value} KC requested from ${from}`);
  commit('Request sent — it shows below until settled');
  return true;
}

function settleRequest(id) {
  const request = state.requests.find(r => r.id === id);
  if (!request || request.status !== 'Pending') return false;
  request.status = 'Settled';
  earn(request.amount, `Request settled · ${request.from}`, 'Top-ups');
  commit('Request settled — KC received');
  return true;
}

/* ---------- profile and admin ---------- */

function updateProfile(patch) {
  Object.assign(state.profile, patch);
  const initials = state.profile.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (initials) state.profile.initials = initials;
  commit('Profile updated');
}

function updateSettings(patch) {
  Object.assign(state.settings, patch);
  if (patch.theme) applyTheme(patch.theme);
  commit('Preferences saved');
}

function setRole(role) {
  state.role = role;
  audit(`Switched to ${role} view`);
  commit(`Now exploring as ${role}`);
}

function moderateReport(id, decision) {
  const report = state.moderation.find(r => r.id === id);
  if (!report || report.status !== 'pending') return false;
  report.status = decision;
  audit(`${decision === 'approved' ? 'Approved' : 'Removed'} ${report.kind.toLowerCase()} “${report.title}”`);
  notify('admin', `Report ${decision}`, `${report.title} was ${decision} by ${state.role}.`);
  commit(decision === 'approved' ? 'Content approved' : 'Content removed and owner notified');
  return true;
}

function toggleUser(id) {
  const user = state.users.find(u => u.id === id);
  if (!user) return false;
  user.status = user.status === 'Suspended' ? 'Active' : 'Suspended';
  audit(`${user.status === 'Suspended' ? 'Suspended' : 'Reactivated'} account ${user.name}`);
  commit(`${user.name} is now ${user.status.toLowerCase()}`);
  return true;
}

function toggleStock(id) {
  const product = getProduct(id);
  if (!product) return false;
  product.stock = product.stock ? 0 : 12;
  audit(`${product.name} marked ${product.stock ? 'in stock' : 'out of stock'}`);
  commit(product.stock ? 'Marked in stock' : 'Marked out of stock');
  return true;
}

function addProduct(data) {
  const name = String(data.name || '').trim();
  const price = Number(data.price);
  if (!name || !Number.isInteger(price) || price < 1) { toast('Enter a name and price.', 'warn'); return false; }
  const product = {
    id: makeId('P'), type: data.type || 'food', name, vendor: state.profile.name, price,
    mrp: price, icon: data.icon || '🍽️', desc: String(data.desc || '').trim() || 'Added from the vendor console.',
    tag: 'Just added', stock: Number(data.stock) || 10, rating: 5, ratingCount: 0, eta: 20,
    area: state.area, options: []
  };
  state.products.unshift(product);
  notify('vendor', 'Menu item added', `${name} · ${price} KC`);
  audit(`Vendor added ${name}`);
  commit('Menu item added');
  return true;
}

function deleteProduct(id) {
  state.products = state.products.filter(p => p.id !== id);
  commit('Menu item removed');
  return true;
}

function exportData() {
  return JSON.stringify(state, null, 2);
}

function importData(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('bad');
    state = migrate(parsed);
    save();
    render();
    toast('Backup imported', 'ok');
    return true;
  } catch { toast('That file is not a valid KART backup.', 'warn'); return false; }
}
