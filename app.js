/* KART — router, interaction wiring, keyboard shortcuts */

const ui = {
  menu: false, drawer: null, modal: null, palette: false, help: false,
  query: '', searchOpen: false, focusSearch: false, caret: 0,
  explore: { cat: 'all', sort: 'featured', max: 1000, stock: false, minRating: 0, view: 'grid' },
  taskTab: 'discover', orderTab: 'orders', orderStatus: 'all',
  serviceTab: 'browse', resaleTab: 'all', walletCat: 'All', notifTab: 'all',
  eventCat: 'all', productTab: 'reviews', pdpQty: 1,
  checkout: { step: 1, mode: 'Pickup', slot: PICKUP_SLOTS[0], note: '', payment: 'KC balance' },
  thread: [], toastTimer: null, pendingAction: ''
};

const VIEWS = {
  home: homePage, explore: explorePage, search: searchPage, product: productPage,
  checkout: checkoutPage, orders: ordersPage, order: orderPage, tasks: tasksPage,
  task: taskPage, events: eventsPage, services: servicesPage, resale: resalePage,
  wishlist: wishlistPage, wallet: walletPage, notifications: notificationsPage,
  profile: profilePage, workspace: workspacePage
};

let route = { name: 'home', id: '', query: {} };

function parseHash(hash) {
  const raw = String(hash || (typeof location !== 'undefined' ? location.hash : '') || '#/home').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const segments = path.split('/').filter(Boolean);
  const query = {};
  String(qs || '').split('&').filter(Boolean).forEach(pair => {
    const [key, value = ''] = pair.split('=');
    query[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return { name: segments[0] || 'home', id: segments[1] || '', query };
}

function applyRoute() {
  route = parseHash();
  if (!VIEWS[route.name]) route = { name: 'home', id: '', query: {} };
  if (route.query.cat && EXPLORE_CATS.some(c => c[0] === route.query.cat)) ui.explore.cat = route.query.cat;
  if (route.query.q !== undefined) ui.query = route.query.q;
  if (route.name !== 'explore' && route.name !== 'search' && route.query.q === undefined && route.query.cat === undefined) ui.searchOpen = false;
}

function navigate(hash) {
  if (!/[?&]q=/.test(hash)) ui.query = '';
  if (typeof location !== 'undefined' && location.hash !== hash) location.hash = hash;
  applyRoute();
  ui.menu = false;
  ui.drawer = null;
  ui.modal = null;
  ui.palette = false;
  ui.help = false;
  ui.pdpQty = 1;
  render();
  if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

function openDrawer(name) { ui.drawer = ui.drawer === name ? null : name; ui.menu = false; render(); }
function openModal(kind, id = '', data = null) { ui.modal = { kind, id, data }; ui.drawer = null; render(); focusModal(); }
function closeModal() { ui.modal = null; render(); }

function focusModal() {
  setTimeout(() => {
    const el = $('.modal input:not([type=checkbox]), .modal textarea, .modal button');
    if (el && el.focus) el.focus();
  }, 0);
}

function render() {
  const view = VIEWS[route.name] || homePage;
  const app = $('#app');
  if (!app) return;
  app.innerHTML = shell(view(route.id));
  postRender();
}

function postRender() {
  applyTheme(state.settings.theme);
  const log = $('#chat-log');
  if (log) log.scrollTop = log.scrollHeight;
  if (ui.focusSearch) {
    const input = $('#global-search');
    if (input) {
      input.focus();
      try { input.setSelectionRange(ui.caret, ui.caret); } catch { /* ignore */ }
    }
    ui.focusSearch = false;
  }
  if (ui.palette) {
    const paletteInput = $('#palette-input');
    if (paletteInput) paletteInput.focus();
  }
  $$('[data-go]').forEach(el => { el.tabIndex = 0; if (!el.getAttribute('role')) el.setAttribute('role', 'link'); });
}

/* ---------- clicks ---------- */

document.addEventListener('click', event => {
  const el = event.target.closest('[data-act],[data-go],[data-drawer],[data-modal-close],[data-drawer-close],[data-palette-close],[data-help-close],[data-target]');
  if (!el) {
    const inside = event.target.closest('.drawer,.modal,.palette,.sidebar,.avatar-btn');
    if (ui.drawer && !inside) { ui.drawer = null; render(); return; }
    const pop = document.querySelector('.avatar-btn.open');
    if (pop && !event.target.closest('.avatar-btn')) pop.classList.remove('open');
    return;
  }
  const openPop = document.querySelector('.avatar-btn.open');
  if (openPop && !event.target.closest('.avatar-btn') && el.dataset.act !== 'account') openPop.classList.remove('open');
  if (el.dataset.target !== undefined) { runPalette(el.dataset.target); return; }
  if (el.hasAttribute('data-modal-close')) { closeModal(); return; }
  if (el.hasAttribute('data-drawer-close')) { ui.drawer = null; render(); return; }
  if (el.hasAttribute('data-palette-close')) { ui.palette = false; render(); return; }
  if (el.hasAttribute('data-help-close')) { ui.help = false; render(); return; }
  if (el.dataset.drawer) { openDrawer(el.dataset.drawer); return; }

  const act = el.dataset.act;
  if (act) { handleAction(act, el, event); return; }
  if (el.dataset.go) navigate(el.dataset.go);
});

function runPalette(target) {
  ui.palette = false;
  if (target.startsWith('#')) { navigate(target); return; }
  const action = target.replace(/^act:/, '');
  handleAction(action, { dataset: {} });
}

function handleAction(act, el, event) {
  const id = el.dataset.id;
  const stop = () => { /* helper for readability */ };
  switch (act) {
    /* shell */
    case 'menu': ui.menu = !ui.menu; render(); break;
    case 'close-menu': ui.menu = false; render(); break;
    case 'account': { const pop = $('.avatar-btn'); if (pop) pop.classList.toggle('open'); break; }
    case 'theme': {
      const next = state.settings.theme === 'dark' ? 'light' : 'dark';
      updateSettings({ theme: next });
      break;
    }
    case 'area': openDrawer('area'); break;
    case 'set-area': state.area = el.dataset.area; commit(`Campus area set to ${state.area}`); ui.drawer = null; break;
    case 'help': ui.help = true; ui.modal = null; render(); break;
    case 'palette': ui.palette = true; ui.help = false; render(); break;
    case 'reset': if (confirm('Reset all orders, tasks, wallet activity and listings in this browser?')) resetState(); break;
    case 'clear-search': ui.query = ''; ui.searchOpen = false; render(); break;
    case 'search-all': navigate(`#/search?q=${encodeURIComponent(ui.query)}`); break;

    /* explore */
    case 'cat': ui.explore.cat = el.dataset.cat; render(); break;
    case 'view': ui.explore.view = el.dataset.view; render(); break;
    case 'reset-filters': ui.explore = { cat: 'all', sort: 'featured', max: 1000, stock: false, minRating: 0, view: ui.explore.view }; ui.query = ''; render(); break;

    /* product */
    case 'wish': toggleWishlist(id); break;
    case 'add': {
      const p = getProduct(id);
      if (!p) break;
      if (p.rental) { openModal('rent', id); break; }
      if ((p.options || []).length) { openModal('customize', id); break; }
      addToCart(id, '', 1);
      break;
    }
    case 'quick': addToCart(id, '', 1); break;
    case 'add-pdp': addToCart(id, '', ui.pdpQty); break;
    case 'buy-now': addToCart(id, '', ui.pdpQty, true); navigate('#/checkout'); break;
    case 'pdp-qty': {
      const p = getProduct(route.id);
      if (!p) break;
      ui.pdpQty = Math.max(1, Math.min(p.stock || 1, ui.pdpQty + Number(el.dataset.delta)));
      render();
      break;
    }
    case 'product-tab': ui.productTab = el.dataset.tab; render(); break;
    case 'review': openModal('review', id); break;

    /* cart and checkout */
    case 'qty': setCartQty(Number(el.dataset.index), cartLines()[Number(el.dataset.index)].qty + Number(el.dataset.delta)); break;
    case 'remove-cart': removeFromCart(Number(el.dataset.index)); break;
    case 'promo': { const input = $('#promo-input'); applyPromo(input ? input.value : ''); break; }
    case 'clear-cart': clearCart(); break;
    case 'checkout-step': ui.checkout.step = Number(el.dataset.step); captureCheckoutFields(); render(); break;
    case 'checkout-mode': captureCheckoutFields(); ui.checkout.mode = el.dataset.mode; render(); break;
    case 'checkout-payment': ui.checkout.payment = el.dataset.payment; render(); break;
    case 'place-order': {
      const order = placeOrder(ui.checkout);
      if (!order) break;
      ui.checkout = { step: 1, mode: 'Pickup', slot: PICKUP_SLOTS[0], note: '', payment: 'KC balance' };
      navigate(`#/order/${order.id}`);
      toast(`Order ${order.id} is live — watch it move through the queue`, 'ok');
      break;
    }

    /* orders */
    case 'order-tab': ui.orderTab = el.dataset.tab; render(); break;
    case 'order-status': ui.orderStatus = el.dataset.status; render(); break;
    case 'cancel-order': cancelOrder(id); break;
    case 'reorder': reorder(id); break;
    case 'rate': openModal('rate', id); break;
    case 'advance-order': advanceOrder(id); break;
    case 'contact-vendor': { const o = getOrder(id); openModal('chat', id, { title: `Vendor · ${o ? o.vendor : 'Shop'}`, subtitle: o ? `${o.id} · ${o.status}` : '' }); break; }

    /* tickets */
    case 'checkin': toggleCheckIn(id); break;
    case 'cancel-ticket': cancelTicket(id); break;
    case 'event': openModal('event', id); break;
    case 'register': registerEvent(id); break;
    case 'event-cat': ui.eventCat = el.dataset.cat; render(); break;
    case 'new-event': openModal('new-event'); break;
    case 'delete-event': if (confirm('Remove this event and refund every ticket?')) deleteEvent(id); break;

    /* tasks */
    case 'post-task': openModal('post-task'); break;
    case 'task-tab': ui.taskTab = el.dataset.tab; render(); break;
    case 'accept-bid': acceptBid(id, el.dataset.bid); break;
    case 'submit-work': submitWork(id); break;
    case 'approve-task': approveTask(id); break;
    case 'cancel-task': if (confirm('Cancel this task and release any escrow?')) cancelTask(id); break;
    case 'withdraw-bid': withdrawBid(id); break;

    /* services */
    case 'service': openModal('service', id); break;
    case 'service-tab': ui.serviceTab = el.dataset.tab; render(); break;
    case 'offer-service': openModal('offer-service'); break;
    case 'remove-service': removeService(id); break;
    case 'complete-service': completeMyService(id); break;
    case 'cancel-booking': cancelBooking(id); break;
    case 'rate-booking': openModal('rate-booking', id); break;

    /* resale */
    case 'new-listing': openModal('new-listing'); break;
    case 'edit-listing': openModal('edit-listing', id); break;
    case 'delist': if (confirm('Delete this listing?')) removeListing(id); break;
    case 'sold': { const l = getListing(id); if (l) updateListing(id, { status: l.status === 'sold' ? 'live' : 'sold' }); break; }
    case 'buy-listing': if (confirm('Buy this item now? KC moves from your wallet.')) buyListing(id); break;
    case 'message-seller': openModal('seller', id); break;
    case 'resale-tab': ui.resaleTab = el.dataset.tab; render(); break;

    /* wallet */
    case 'add-funds': openModal('add-funds'); break;
    case 'send': openModal('send'); break;
    case 'request': openModal('request'); break;
    case 'settle-request': settleRequest(id); break;
    case 'wallet-cat': ui.walletCat = el.dataset.cat; render(); break;

    /* notifications */
    case 'open-notif': {
      const note = state.notifications.find(n => n.id === id);
      if (note) { note.read = true; save(); ui.drawer = null; if (note.link) navigate(note.link); else render(); }
      break;
    }
    case 'read-all': state.notifications.forEach(n => { n.read = true; }); commit('All notifications marked read'); break;
    case 'clear-notifs': state.notifications = []; commit('Notifications cleared'); break;
    case 'notif-tab': ui.notifTab = el.dataset.tab; render(); break;

    /* profile and console */
    case 'role': setRole(el.dataset.role); break;
    case 'export': exportBackup(); break;
    case 'quick-amount': { const box = document.querySelector('#add-funds-form input[name="amount"]'); if (box) box.value = el.dataset.amount; break; }
    case 'import': { const input = $('#import-file'); if (input) input.click(); break; }
    case 'moderate': moderateReport(id, el.dataset.decision); break;
    case 'toggle-user': toggleUser(id); break;
    case 'toggle-stock': toggleStock(id); break;
    case 'delete-product': if (confirm('Remove this item from the menu?')) deleteProduct(id); break;

    default: stop();
  }
}

function captureCheckoutFields() {
  const slot = document.querySelector('.checkout-main select[name="slot"]');
  const note = document.querySelector('.checkout-main input[name="note"]');
  if (slot) ui.checkout.slot = slot.value;
  if (note) ui.checkout.note = note.value;
}

function exportBackup() {
  try {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kart-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    toast('Backup downloaded', 'ok');
  } catch { toast('Export is not available in this browser.', 'warn'); }
}

/* ---------- change / input ---------- */

document.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'global-search') {
    ui.query = target.value;
    ui.focusSearch = true;
    ui.caret = target.selectionStart ?? target.value.length;
    ui.searchOpen = true;
    if (!['explore', 'search'].includes(route.name)) { navigate(`#/search?q=${encodeURIComponent(ui.query)}`); return; }
    render();
    return;
  }
  if (target.id === 'palette-input') { filterPalette(target.value); return; }
  if (target.dataset.act === 'max') {
    ui.explore.max = Number(target.value);
    const label = target.parentElement.querySelector('span');
    if (label) label.textContent = `Up to ${kc(ui.explore.max)}`;
    clearTimeout(ui.maxTimer);
    ui.maxTimer = setTimeout(render, 90);
    return;
  }
  if (target.closest && target.closest('#print-form')) updatePrintEstimate(target.form);
  if (target.closest && target.closest('#customize-form')) updateCustomizeEstimate(target.form);
  if (target.closest && target.closest('#rent-form')) updateRentEstimate(target.form);
  if (target.id === 'promo-input') ui.promoDraft = target.value;
});

document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'role-select') { setRole(target.value); navigate('#/workspace'); return; }
  if (target.dataset.act === 'sort') { ui.explore.sort = target.value; render(); return; }
  if (target.dataset.act === 'instock') { ui.explore.stock = target.checked; render(); return; }
  if (target.dataset.act === 'rated') { ui.explore.minRating = target.checked ? 4 : 0; render(); return; }
  if (target.dataset.act === 'checkin') { toggleCheckIn(target.dataset.id); return; }
  if (target.id === 'import-file' && target.files && target.files[0]) {
    const reader = new FileReader();
    reader.onload = () => importData(String(reader.result));
    reader.readAsText(target.files[0]);
    return;
  }
  if (target.closest && target.closest('#print-form')) updatePrintEstimate(target.form);
  if (target.closest && target.closest('#rent-form')) updateRentEstimate(target.form);
});

function filterPalette(query) {
  const q = query.trim().toLowerCase();
  const items = $$('.palette-item');
  let visible = 0;
  items.forEach(item => {
    const match = item.textContent.toLowerCase().includes(q);
    item.hidden = !match;
    if (match) visible += 1;
  });
  const empty = $('.palette-empty');
  if (empty) empty.hidden = visible > 0;
}

function updatePrintEstimate(form) {
  const box = $('#print-estimate');
  if (!form || !box) return;
  const pages = Number(form.pages.value) || 0;
  const copies = Number(form.copies.value) || 1;
  const perPage = form.colour.value === 'colour' ? 8 : 2;
  const total = pages * copies * perPage + (form.binding.value === 'spiral' ? 30 : 0);
  box.textContent = kc(total);
}

function updateCustomizeEstimate(form) {
  const box = $('#customize-estimate');
  const p = getProduct(form?.dataset.id);
  if (!box || !p) return;
  const qty = Math.max(1, Math.min(50, Number(form.qty.value) || 1));
  box.textContent = `${kc(p.price * qty)} · ${qty} × ${kc(p.price)}`;
}

function updateRentEstimate(form) {
  const box = $('#rent-estimate');
  const p = getProduct(form?.dataset.id);
  if (!box || !p) return;
  if (!form.start.value || !form.end.value) { box.textContent = 'Pick dates to calculate'; return; }
  const days = Math.round((new Date(form.end.value) - new Date(form.start.value)) / DAY) + 1;
  box.textContent = days < 1 ? 'End date must follow the start date' : `${kc(p.price * days)} · ${days} day${days > 1 ? 's' : ''}`;
}

/* ---------- forms ---------- */

document.addEventListener('submit', event => {
  const form = event.target;
  if (!form.id) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const id = form.dataset.id;

  switch (form.id) {
    case 'checkout-review': break;

    case 'customize-form': {
      const p = getProduct(id);
      const qty = Number(data.qty);
      if (!p || !Number.isInteger(qty) || qty < 1 || qty > 50) { toast('Choose a quantity from 1 to 50.', 'warn'); return; }
      const variant = (p.options || []).map(o => data[`opt_${o.name}`]).filter(Boolean).join(' / ');
      if (!addToCart(p.id, variant, qty)) return;
      ui.modal = null;
      openDrawer('cart');
      break;
    }

    case 'rent-form': {
      const p = getProduct(id);
      const start = new Date(data.start);
      const end = new Date(data.end);
      const days = Math.round((end - start) / DAY) + 1;
      if (!p || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start < new Date(new Date().toDateString()) || days < 1 || days > 30) {
        toast('Choose a valid rental window of up to 30 days.', 'warn');
        return;
      }
      if (!spend(p.price * days, `Rental · ${p.name}`, 'Resale')) return;
      state.orders.unshift({
        id: makeId('RNT'), type: 'resale', vendor: p.vendor, created: isoNow(), status: 'Placed', auto: false,
        payment: 'KC balance', fulfil: { mode: 'Meet-up', slot: `${data.start} → ${data.end}`, note: '' },
        items: [{ id: p.id, name: `${p.name} rental`, icon: p.icon, price: p.price, qty: days, variant: `${days} day${days > 1 ? 's' : ''}`, vendor: p.vendor, type: 'resale' }],
        subtotal: p.price * days, discount: 0, fee: 0, total: p.price * days, rating: 0,
        timeline: [{ status: 'Placed', at: isoNow() }]
      });
      notify('resale', 'Rental requested', `${p.name} for ${days} day${days > 1 ? 's' : ''}.`);
      ui.modal = null;
      navigate('#/orders');
      toast('Rental request placed', 'ok');
      break;
    }

    case 'print-form': {
      const pages = Number(data.pages);
      const copies = Number(data.copies);
      const name = String(data.document || '').trim();
      if (!name || !Number.isInteger(pages) || pages < 1 || pages > 500 || !Number.isInteger(copies) || copies < 1 || copies > 20) {
        toast('Check the document name, pages and copies.', 'warn');
        return;
      }
      const amount = pages * copies * (data.colour === 'colour' ? 8 : 2) + (data.binding === 'spiral' ? 30 : 0);
      if (!spend(amount, `Print · ${name}`, 'Orders')) return;
      state.orders.unshift({
        id: makeId('PRT'), type: 'xerox', vendor: data.shop, created: isoNow(), status: 'Placed', auto: true,
        payment: 'KC balance', fulfil: { mode: 'Pickup', slot: 'When ready', note: `${data.sides === 'duplex' ? 'Double-sided' : 'Single-sided'} · ${copies} cop${copies > 1 ? 'ies' : 'y'}` },
        items: [{ id: '', name: `Print: ${name}`, icon: '🖨️', price: amount, qty: 1, variant: `${pages} pages × ${copies}`, vendor: data.shop, type: 'xerox' }],
        subtotal: amount, discount: 0, fee: 0, total: amount, rating: 0,
        timeline: [{ status: 'Placed', at: isoNow() }]
      });
      notify('xerox', 'Print request created', `${name} · ${kc(amount)} at ${data.shop}`);
      audit(`Print request created for ${kc(amount)}`);
      ui.modal = null;
      navigate('#/orders');
      scheduleOrderProgress(state.orders[0].id);
      toast('Print request is in the queue', 'ok');
      break;
    }

    case 'task-form': {
      const task = postTask(data);
      if (!task) return;
      ui.modal = null;
      ui.taskTab = 'mine';
      navigate('#/task/' + task.id);
      break;
    }

    case 'bid-form': {
      const amount = Number(data.amount);
      const eta = String(data.eta || '').trim();
      const note = String(data.note || '').trim();
      if (!Number.isInteger(amount) || amount < 1 || amount > 100000 || !eta || !note) { toast('Enter a valid bid and proposal.', 'warn'); return; }
      placeBid(id, amount, eta, note);
      break;
    }

    case 'message-form': {
      const text = String(data.text || '').trim();
      if (!text) return;
      sendMessage(id, text);
      break;
    }

    case 'seller-form': {
      const text = String(data.text || '').trim();
      if (!text) return;
      const log = $('#seller-chat');
      if (log) {
        log.insertAdjacentHTML('beforeend', `<div class="message mine"><span>${esc(text)}</span><small>You · ${timeOnly(isoNow())}</small></div>`);
        log.scrollTop = log.scrollHeight;
        form.reset();
        setTimeout(() => {
          const reply = document.querySelector('#seller-chat');
          if (!reply) return;
          reply.insertAdjacentHTML('beforeend', `<div class="message"><span>Sure — I can meet near the main gate after 5 today. Price is slightly negotiable if you bring cash KC.</span><small>Seller · ${timeOnly(isoNow())}</small></div>`);
          reply.scrollTop = reply.scrollHeight;
        }, 1400);
      }
      break;
    }

    case 'chat-form': {
      const text = String(data.text || '').trim();
      if (!text) return;
      ui.thread.push({ mine: true, text, at: isoNow() });
      render();
      setTimeout(() => {
        ui.thread.push({ mine: false, text: 'Thanks for writing — your order is on track. Show the order number at the counter and we will hand it over.', at: isoNow() });
        if (ui.modal && ui.modal.kind === 'chat') render();
      }, 1400);
      break;
    }

    case 'service-form': {
      if (!bookService(id, data)) return;
      ui.modal = null;
      ui.serviceTab = 'bookings';
      navigate('#/services');
      break;
    }

    case 'offer-service-form': if (!offerService(data)) return; ui.modal = null; ui.serviceTab = 'offers'; navigate('#/services'); break;
    case 'listing-form': {
      const ok = id ? updateListing(id, { name: data.name, price: Number(data.price), condition: data.condition, desc: data.desc, icon: data.icon }) : createListing(data);
      if (!ok) return;
      ui.modal = null;
      ui.resaleTab = 'mine';
      navigate('#/resale');
      break;
    }
    case 'new-event-form': {
      const event = saveEvent(data);
      if (!event) return;
      ui.modal = null;
      state.role = 'Organizer';
      navigate('#/workspace');
      break;
    }
    case 'event-form': {
      const created = saveEvent(data);
      if (!created) return;
      form.reset();
      break;
    }
    case 'product-form': {
      if (!addProduct(data)) return;
      form.reset();
      break;
    }
    case 'send-form': if (!sendKC(data.amount, data.to, data.note)) return; ui.modal = null; navigate('#/wallet'); break;
    case 'request-form': if (!requestKC(data.amount, data.from, data.note)) return; ui.modal = null; navigate('#/wallet'); break;
    case 'add-funds-form': if (!addFunds(data.amount)) return; ui.modal = null; navigate('#/wallet'); break;

    case 'rate-form': {
      const rating = Number(data['order-rating'] || data.rating || 5);
      if (!rateOrder(id, rating, String(data.text || '').trim())) return;
      ui.modal = null;
      break;
    }
    case 'rate-booking-form': {
      const rating = Number(data['booking-rating'] || 5);
      if (!rateBooking(id, rating)) return;
      ui.modal = null;
      break;
    }
    case 'review-form': {
      const p = getProduct(id);
      const rating = Number(data['review-rating'] || 5);
      const text = String(data.text || '').trim();
      if (!p || !text) { toast('Write a few words about your experience.', 'warn'); return; }
      const list = (state.reviews[p.id] ||= []);
      const mine = list.find(r => r.user === state.profile.name);
      if (mine) { mine.rating = rating; mine.text = text; mine.at = isoNow(); }
      else list.unshift({ id: makeId('RV'), user: state.profile.name, rating, text, at: isoNow() });
      ui.modal = null;
      commit('Review published');
      break;
    }

    case 'profile-form': {
      if (!String(data.name || '').trim() || !String(data.email || '').trim()) { toast('Name and email are required.', 'warn'); return; }
      updateProfile({ name: String(data.name).trim(), email: String(data.email).trim(), hostel: String(data.hostel || '').trim(), bio: String(data.bio || '').trim() });
      state.area = data.area || state.area;
      save();
      break;
    }
    case 'settings-form': {
      updateSettings({ theme: data.theme, notify: !!data.notify });
      ui.explore.view = data.view || ui.explore.view;
      break;
    }

    default: break;
  }
});

/* ---------- keyboard ---------- */

let gPressed = false;
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);

  if (event.key === 'Escape') {
    if (ui.modal) { closeModal(); return; }
    if (ui.palette) { ui.palette = false; render(); return; }
    if (ui.help) { ui.help = false; render(); return; }
    if (ui.drawer) { ui.drawer = null; render(); return; }
    if (ui.menu) { ui.menu = false; render(); return; }
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    ui.palette = !ui.palette;
    ui.modal = null;
    render();
    return;
  }

  if (typing) {
    if (event.key === 'Enter' && ui.palette && event.target.id === 'palette-input') {
      const first = $$('.palette-item').find(item => !item.hidden);
      if (first) { event.preventDefault(); runPalette(first.dataset.target); }
    }
    if (event.key === 'Enter' && event.target.id === 'global-search') {
      event.preventDefault();
      navigate(`#/search?q=${encodeURIComponent(ui.query)}`);
    }
    return;
  }

  if (event.key === '/') { event.preventDefault(); ui.searchOpen = true; const input = $('#global-search'); if (input) input.focus(); return; }
  if (event.key === '?') { event.preventDefault(); ui.help = !ui.help; render(); return; }
  if (event.key.toLowerCase() === 'c') { openDrawer('cart'); return; }

  if (gPressed) {
    const map = { h: '#/home', e: '#/explore', o: '#/orders', w: '#/wallet', t: '#/tasks', p: '#/profile' };
    const target = map[event.key.toLowerCase()];
    gPressed = false;
    if (target) { event.preventDefault(); navigate(target); }
    return;
  }
  if (event.key.toLowerCase() === 'g') { gPressed = true; setTimeout(() => { gPressed = false; }, 1200); return; }

  if (event.key === 'Enter' && event.target.matches?.('[data-go]')) {
    event.preventDefault();
    navigate(event.target.dataset.go);
  }
});

/* ---------- boot ---------- */

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('hashchange', () => { applyRoute(); ui.drawer = null; render(); });
}

applyRoute();
applyTheme(state.settings.theme);
render();

state.orders.filter(o => o.auto && !['Picked up', 'Cancelled'].includes(o.status)).forEach(o => scheduleOrderProgress(o.id));
