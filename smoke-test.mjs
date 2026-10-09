import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app = { innerHTML: '' };
const storage = new Map();
const handlers = {};
const context = vm.createContext({
  console,
  Date,
  Math,
  FormData: class { constructor(form) { return Object.entries(form.values); } },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  document: {
    querySelector: selector => selector === '#app' ? app : null,
    querySelectorAll: () => [],
    addEventListener: (name, handler) => { handlers[name] = handler; },
    createElement: () => ({ textContent: '', remove() {} }),
    body: { append() {} }
  },
  window: { scrollTo() {} },
  setTimeout: () => 0,
  clearTimeout() {},
  confirm: () => true
});

vm.runInContext(await readFile(new URL('./app.js', import.meta.url), 'utf8'), context);
assert.match(app.innerHTML, /Explore KART/);
for (const page of ['explore', 'tasks', 'orders', 'wallet', 'events', 'services', 'resale', 'workspace']) {
  vm.runInContext(`page = '${page}'; render();`, context);
  assert.match(app.innerHTML, /class="content"/);
  assert.ok(app.innerHTML.length > 2000, `${page} did not render content`);
}
for (const kind of ['cart', 'profile', 'print', 'post-task', 'task', 'messages', 'event', 'service', 'new-listing', 'offer-service', 'order', 'customize']) {
  const id = ({ task: 'T-208', messages: 'T-208', event: 'e1', service: 'v1', order: 'KRT-1042', customize: 'm1' })[kind];
  vm.runInContext(`modal = { kind: ${JSON.stringify(kind)}, id: ${JSON.stringify(id)} }; render();`, context);
  assert.match(app.innerHTML, /role="dialog"/, `${kind} modal did not render`);
}
const startingBalance = vm.runInContext('state.balance', context);
assert.equal(vm.runInContext('spend(100, "Test order")', context), true);
assert.equal(vm.runInContext('state.balance', context), startingBalance - 100);
assert.equal(vm.runInContext('spend(99999, "Invalid")', context), false);
assert.equal(vm.runInContext('state.balance', context), startingBalance - 100);
vm.runInContext(`page = 'explore'; filter = 'xerox'; search = ''; render();`, context);
assert.match(app.innerHTML, /Configure print request/);
assert.doesNotMatch(app.innerHTML, /No matching items/);
vm.runInContext(`filter = 'all'; search = 'Hack the Campus'; render();`, context);
assert.match(app.innerHTML, /Hack the Campus/);
vm.runInContext(`filter = 'all'; search = 'lab presentation'; render();`, context);
assert.match(app.innerHTML, /Help format a lab presentation/);
vm.runInContext(`state.cart = ['f1']; modal = {kind:'cart'};`, context);
handlers.submit({ target: { id: 'checkout-form', values: { window: 'As soon as ready' } }, preventDefault() {} });
assert.equal(vm.runInContext('state.balance', context), startingBalance - 185);
assert.equal(vm.runInContext('state.cart.length', context), 0);
assert.equal(vm.runInContext('state.orders[0].title', context), 'Masala Dosa Combo');
handlers.submit({ target: { id: 'print-form', values: { document: 'Notes.pdf', pages: '3', copies: '2', color: 'bw', binding: 'none', shop: 'Library Xerox' } }, preventDefault() {} });
assert.equal(vm.runInContext('state.balance', context), startingBalance - 197);
assert.match(vm.runInContext('state.orders[0].title', context), /Notes.pdf/);
handlers.submit({ target: { id: 'customize-form', dataset: { id: 'm1' }, values: { color: 'Black', size: 'Large', quantity: '2' } }, preventDefault() {} });
assert.equal(vm.runInContext('state.cart[0].quantity', context), 2);
assert.match(app.innerHTML, /1,398 KC/);
handlers.submit({ target: { id: 'offer-service-form', values: { name: 'Chemistry tutoring', price: '210', unit: 'hour', desc: 'Study support' } }, preventDefault() {} });
assert.match(app.innerHTML, /Chemistry tutoring/);
const future = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
handlers.submit({ target: { id: 'task-form', values: { title: 'Bring my books', description: 'From the library', budget: '120', deadline: future, category: 'Pickup', anonymous: 'anonymous' } }, preventDefault() {} });
assert.match(app.innerHTML, /Bring my books/);
assert.equal(vm.runInContext('state.tasks[0].anonymous', context), true);
const taskId = vm.runInContext('state.tasks[0].id', context);
const bidId = vm.runInContext('state.tasks[0].bids[0].id', context);
const click = (action, id, extra = {}) => {
  const target = { dataset: { action, id, ...extra }, closest() { return this; } };
  handlers.click({ target });
};
click('accept-bid', taskId, { bid: bidId });
assert.equal(vm.runInContext('state.tasks[0].committed', context), 120);
assert.equal(vm.runInContext('state.balance', context), startingBalance - 317);
click('cancel-task', taskId);
assert.equal(vm.runInContext('state.tasks[0].status', context), 'Cancelled');
assert.equal(vm.runInContext('state.balance', context), startingBalance - 197);
assert.equal(vm.runInContext('state.tasks[0].committed', context), 0);
handlers.submit({ target: { id: 'checkout-form', values: { window: 'As soon as ready' } }, preventDefault() {} });
assert.equal(vm.runInContext('state.balance', context), startingBalance - 1595);
assert.match(vm.runInContext('state.orders[0].title', context), /Black \/ Large/);
const configuredOrder = vm.runInContext('state.orders[0].id', context);
click('advance-order', configuredOrder);
assert.equal(vm.runInContext('state.orders[0].status', context), 'Preparing');
click('advance-order', configuredOrder);
assert.equal(vm.runInContext('state.orders[0].status', context), 'Ready for pickup');
click('register-event', 'e1');
assert.equal(vm.runInContext('state.tickets.length', context), 1);
const afterEvent = vm.runInContext('state.balance', context);
click('register-event', 'e1');
assert.equal(vm.runInContext('state.balance', context), afterEvent);
const serviceDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
handlers.submit({ target: { id: 'service-form', dataset: { id: 'v1' }, values: { date: serviceDate, time: '12:00', note: 'Help with calculus' } }, preventDefault() {} });
assert.equal(vm.runInContext('state.bookings.length', context), 1);
const bookingId = vm.runInContext('state.bookings[0].id', context);
const beforeBookingRefund = vm.runInContext('state.balance', context);
click('cancel-booking', bookingId);
assert.equal(vm.runInContext('state.bookings[0].status', context), 'Cancelled');
assert.equal(vm.runInContext('state.balance', context), beforeBookingRefund + 250);
const rentStart = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const rentEnd = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
handlers.submit({ target: { id: 'rent-form', dataset: { id: 'r2' }, values: { start: rentStart, end: rentEnd } }, preventDefault() {} });
assert.match(vm.runInContext('state.orders[0].title', context), /2 days/);
const rentalOrder = vm.runInContext('state.orders[0].id', context);
const beforeRefund = vm.runInContext('state.balance', context);
click('cancel-order', rentalOrder);
assert.equal(vm.runInContext('state.balance', context), beforeRefund + 200);
console.log('KART smoke checks passed: pages, dialogs, search, orders, print, merchandise, services, tasks, tickets, rentals, and KC refunds.');
