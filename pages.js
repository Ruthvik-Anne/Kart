/* KART — page views */

function heading(kicker, title, subtitle = '', action = '') {
  return `<div class="page-head">
    <div><div class="eyebrow">${esc(kicker)}</div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
    ${action ? `<div class="page-actions">${action}</div>` : ''}
  </div>`;
}

const moduleCards = () => `<div class="grid module-grid">${MODULES.map(([id, icon, title, sub]) => `
  <button class="module" data-go="${['food', 'stationery', 'merch', 'xerox'].includes(id) ? `#/explore?cat=${id}` : id === 'tasks' ? '#/tasks' : id === 'resale' ? '#/resale' : id === 'events' ? '#/events' : id === 'services' ? '#/services' : '#/explore'}">
    <span class="mod-icon">${icon}</span><strong>${title}</strong><small>${sub} →</small>
  </button>`).join('')}</div>`;

function homePage() {
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLine = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const activeOrders = state.orders.filter(o => !['Picked up', 'Cancelled'].includes(o.status));
  const openTasks = state.tasks.filter(t => t.status === 'Open');
  const nextEvent = state.events.filter(e => new Date(e.date) > new Date()).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const feed = state.notifications.slice(0, 4);
  const popular = state.products.filter(p => p.stock).slice(0, 4);

  return `
  ${heading(dateLine, `${greeting}, ${esc(state.profile.name.split(' ')[0])} 👋`, 'Everything you need on campus, all in one place.',
    `<button class="btn ghost" data-act="post-task">+ Post a task</button><button class="btn" data-go="#/explore">Explore marketplace ↗</button>`)}
  <div class="hero">
    <div class="hero-main">
      <div class="eyebrow">YOUR CAMPUS, SIMPLIFIED</div>
      <h2>Make the most of every campus moment.</h2>
      <p>Grab lunch, print notes, book a peer, or earn KC helping another student — from one live marketplace.</p>
      <div class="hero-actions">
        <button class="btn" data-go="#/explore">Start exploring ↗</button>
        <button class="btn ghost light" data-act="print">🖨️ Print documents</button>
      </div>
      <div class="hero-strip">
        <span>⚡ ${openTasks.length} open tasks</span>
        <span>🎟️ ${state.events.length} events this month</span>
        <span>◉ ${money(state.balance)} KC in wallet</span>
      </div>
    </div>
    <div class="hero-aside">
      <div class="eyebrow">LIVE ON CAMPUS</div>
      <ul class="live-feed">
        ${feed.length ? feed.map(n => `<li class="${n.read ? '' : 'hot'}" data-act="open-notif" data-id="${n.id}"><span>${iconFor(n.type)}</span><div><b>${esc(n.title)}</b><small>${relative(n.at)}</small></div></li>`).join('') : '<li>No activity yet</li>'}
      </ul>
      <button class="text-link" data-drawer="notifications">Open notifications →</button>
    </div>
  </div>

  <div class="stats grid four">
    ${statCard('Wallet', `${money(state.balance)} KC`, 'demo credits')}
    ${statCard('Active orders', String(activeOrders.length), activeOrders.length ? activeOrders[0].status : 'all settled')}
    ${statCard('Open tasks', String(openTasks.length), 'bidding now')}
    ${statCard('Next event', nextEvent ? countdown(nextEvent.date) : '—', nextEvent ? nextEvent.name : 'none scheduled')}
  </div>

  ${sectionTitle('Explore KART', '#/explore', 'See everything →')}
  ${moduleCards()}

  <div class="grid two-col">
    <section>
      ${sectionTitle('Popular right now', '#/explore', 'Browse →')}
      <div class="grid product-grid">${popular.map(p => productCard(p)).join('')}</div>
    </section>
    <section>
      ${sectionTitle('Happening soon', '#/events', 'All events →')}
      <div class="stack">${state.events.slice(0, 3).map(e => `
        <button class="row-card" data-act="event" data-id="${e.id}">
          <span class="row-icon">${e.icon}</span>
          <span class="row-body"><b>${esc(e.name)}</b><small>${esc(e.host)} · ${shortDate(e.date)} · ${esc(e.place)}</small></span>
          <span class="badge">${e.price ? kc(e.price) : 'Free'}</span>
        </button>`).join('')}</div>
      ${sectionTitle('Tasks you could pick up', '#/tasks', 'All tasks →')}
      <div class="stack">${openTasks.slice(0, 3).map(t => `
        <button class="row-card" data-go="#/task/${t.id}">
          <span class="row-icon">⚡</span>
          <span class="row-body"><b>${esc(t.title)}</b><small>${countdown(t.deadline)} left · ${t.bids.length} bids</small></span>
          <span class="badge ok">${kc(t.budget)}</span>
        </button>`).join('')}</div>
    </section>
  </div>`;
}

/* ---------- explore ---------- */

const EXPLORE_CATS = [['all', 'All'], ['food', 'Food'], ['xerox', 'Print'], ['stationery', 'Supplies'], ['merch', 'Merch'], ['resale', 'Resale'], ['events', 'Events'], ['services', 'Services'], ['tasks', 'Tasks']];

function filteredProducts() {
  const f = ui.explore;
  const q = ui.query.trim().toLowerCase();
  let list = state.products.filter(p => f.cat === 'all' || p.type === f.cat);
  if (q) list = list.filter(p => `${p.name} ${p.vendor} ${p.desc} ${p.tag}`.toLowerCase().includes(q));
  list = list.filter(p => p.price <= f.max);
  if (f.stock) list = list.filter(p => p.stock > 0);
  if (f.minRating) list = list.filter(p => productRating(p) >= f.minRating);
  if (f.sort === 'price-low') list = [...list].sort((a, b) => a.price - b.price);
  if (f.sort === 'price-high') list = [...list].sort((a, b) => b.price - a.price);
  if (f.sort === 'rating') list = [...list].sort((a, b) => productRating(b) - productRating(a));
  if (f.sort === 'discount') list = [...list].sort((a, b) => ((b.mrp || b.price) - b.price) - ((a.mrp || a.price) - a.price));
  if (f.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function explorePage() {
  const f = ui.explore;
  const q = ui.query.trim();
  const products = filteredProducts();
  const listings = state.listings.filter(l => (f.cat === 'all' || f.cat === 'resale') && l.status === 'live' && (!q || `${l.name} ${l.desc}`.toLowerCase().includes(q.toLowerCase())) && l.price <= f.max);
  const foundEvents = state.events.filter(e => (f.cat === 'all' || f.cat === 'events') && (!q || `${e.name} ${e.host} ${e.desc}`.toLowerCase().includes(q.toLowerCase())));
  const foundServices = allServices().filter(s => (f.cat === 'all' || f.cat === 'services') && (!q || `${s.name} ${s.provider} ${s.desc}`.toLowerCase().includes(q.toLowerCase())));
  const foundTasks = state.tasks.filter(t => t.status === 'Open' && (f.cat === 'all' || f.cat === 'tasks') && (!q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase())));
  const foundListings = state.serviceListings.filter(s => f.cat === 'services' && (!q || s.name.toLowerCase().includes(q.toLowerCase())));

  const showProducts = ['all', 'food', 'stationery', 'merch', 'resale', 'xerox'].includes(f.cat);
  const printPanel = `<div class="panel print-panel">
    <div><div class="eyebrow">XEROX & PRINT</div><h3>Print documents, your way</h3>
    <p class="muted">Pages, copies, colour, sides and binding — with a live price estimate before you confirm.</p></div>
    <button class="btn" data-act="print">Configure print request →</button>
  </div>`;

  const total = products.length + listings.length + foundEvents.length + foundServices.length + foundTasks.length;

  return `
  ${heading('DISCOVER', 'Explore campus', q ? `Results for “${esc(q)}”` : 'Everything you need, right around the corner.',
    `<button class="btn ghost" data-act="print">🖨️ Print request</button><button class="btn" data-act="post-task">+ Post a task</button>`)}
  <div class="filter-bar">
    <div class="filters">${EXPLORE_CATS.map(([id, label]) => `<button class="filter ${f.cat === id ? 'active' : ''}" data-act="cat" data-cat="${id}">${label}</button>`).join('')}</div>
    <div class="filter-tools">
      <label class="tool"><span>Sort</span>
        <select data-act="sort">
          ${[['featured', 'Featured'], ['price-low', 'Price: low to high'], ['price-high', 'Price: high to low'], ['rating', 'Top rated'], ['discount', 'Biggest saving'], ['name', 'A–Z']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <label class="tool range"><span>Up to ${kc(f.max)}</span><input type="range" min="50" max="1000" step="10" value="${f.max}" data-act="max" /></label>
      <label class="tool check"><input type="checkbox" data-act="instock" ${f.stock ? 'checked' : ''} /> In stock</label>
      <label class="tool check"><input type="checkbox" data-act="rated" ${f.minRating ? 'checked' : ''} /> 4★ & up</label>
      <button class="btn tiny ghost" data-act="reset-filters">Reset</button>
    </div>
  </div>
  <div class="result-row"><span><b>${total}</b> results${q ? ` for “${esc(q)}”` : ''} · ${esc(f.cat === 'all' ? 'all categories' : EXPLORE_CATS.find(c => c[0] === f.cat)[1])}</span>
    <div class="view-toggle">
      <button class="${f.view === 'grid' ? 'on' : ''}" data-act="view" data-view="grid" aria-label="Grid view">▦</button>
      <button class="${f.view === 'list' ? 'on' : ''}" data-act="view" data-view="list" aria-label="List view">☰</button>
    </div>
  </div>

  ${f.cat === 'xerox' ? printPanel : ''}
  ${showProducts && products.length ? `${sectionTitle(q ? 'Products and listings' : f.cat === 'all' ? 'Campus picks' : EXPLORE_CATS.find(c => c[0] === f.cat)[1])}
    <div class="grid product-grid ${f.view === 'list' ? 'list-view' : ''}">${products.map(p => productCard(p)).join('')}</div>` : ''}
  ${showProducts && listings.length ? `${sectionTitle('Student listings')}
    <div class="grid product-grid ${f.view === 'list' ? 'list-view' : ''}">${listings.map(listingCard).join('')}</div>` : ''}
  ${(f.cat === 'all' || f.cat === 'events') && foundEvents.length ? `${sectionTitle('Events')}<div class="grid product-grid">${foundEvents.map(eventCard).join('')}</div>` : ''}
  ${(f.cat === 'all' || f.cat === 'services') && (foundServices.length || foundListings.length) ? `${sectionTitle('Student services')}<div class="grid product-grid">${foundServices.map(serviceCard).join('')}${foundListings.map(serviceCard).join('')}</div>` : ''}
  ${foundTasks.length ? `${sectionTitle('Open tasks')}<div class="grid two-col">${foundTasks.map(taskCard).join('')}</div>` : ''}
  ${!total ? emptyState('🔍', 'Nothing matches those filters', 'Try another category, a wider price range or a different search term.', '<button class="btn" data-act="reset-filters">Reset filters</button>') : ''}`;
}

function searchPage() {
  const q = ui.query.trim().toLowerCase();
  const products = state.products.filter(p => `${p.name} ${p.vendor} ${p.desc}`.toLowerCase().includes(q));
  const events = state.events.filter(e => `${e.name} ${e.host} ${e.desc}`.toLowerCase().includes(q));
  const services = allServices().filter(s => `${s.name} ${s.provider} ${s.desc}`.toLowerCase().includes(q));
  const tasks = state.tasks.filter(t => `${t.title} ${t.description}`.toLowerCase().includes(q));
  const listings = state.listings.filter(l => `${l.name} ${l.desc}`.toLowerCase().includes(q));
  const total = products.length + events.length + services.length + tasks.length + listings.length;
  return `
  ${heading('SEARCH', `Results for “${esc(ui.query)}”`, `${total} matches across campus`)}
  ${!total ? emptyState('🔍', 'No results', 'Try a shorter keyword, or browse categories from Explore.', '<button class="btn" data-go="#/explore">Open explore</button>') : ''}
  ${products.length ? `${sectionTitle('Products')}<div class="grid product-grid">${products.map(p => productCard(p)).join('')}</div>` : ''}
  ${listings.length ? `${sectionTitle('Student listings')}<div class="grid product-grid">${listings.map(listingCard).join('')}</div>` : ''}
  ${events.length ? `${sectionTitle('Events')}<div class="grid product-grid">${events.map(eventCard).join('')}</div>` : ''}
  ${services.length ? `${sectionTitle('Services')}<div class="grid product-grid">${services.map(serviceCard).join('')}</div>` : ''}
  ${tasks.length ? `${sectionTitle('Tasks')}<div class="grid two-col">${tasks.map(taskCard).join('')}</div>` : ''}`;
}

/* ---------- product ---------- */

function productPage(id) {
  const p = getProduct(id);
  if (!p) return emptyState('🛍️', 'Product not found', 'It may have been removed by the vendor.', '<button class="btn" data-go="#/explore">Back to explore</button>');
  const reviews = state.reviews[p.id] || [];
  const wished = state.wishlist.includes(p.id);
  const rating = productRating(p);
  const related = state.products.filter(x => x.type === p.type && x.id !== p.id).slice(0, 4);
  const mineReview = reviews.find(r => r.user === state.profile.name);
  return `
  <nav class="crumbs"><a data-go="#/home">Home</a> / <a data-go="#/explore?cat=${p.type}">${esc(p.type)}</a> / <span>${esc(p.name)}</span></nav>
  <div class="product-layout">
    <div class="product-stage">
      <div class="stage-art">${p.icon}</div>
      <div class="stage-thumbs">
        <span class="on">${p.icon}</span><span>${iconFor(p.type)}</span><span>🏷️</span>
      </div>
      <div class="stage-note">${badge(p.tag || 'Campus favourite')} ${badge(p.stock ? `${p.stock} in stock` : 'Out of stock', p.stock ? 'ok' : 'warn')}</div>
    </div>
    <div class="product-info">
      <div class="eyebrow">${esc(p.vendor)} · ${esc(p.area)}</div>
      <h1>${esc(p.name)}</h1>
      <div class="product-rating">${stars(rating, reviews.length + (p.ratingCount || 0))}<button class="link-btn" data-act="review" data-id="${p.id}">${mineReview ? 'Edit your review' : 'Write a review'}</button></div>
      <p class="lead">${esc(p.desc)}</p>
      <div class="price-row">
        <span class="price big">${kc(p.price)}</span>
        ${p.mrp && p.mrp > p.price ? `<s>${kc(p.mrp)}</s>${badge(`Save ${kc(p.mrp - p.price)}`, 'ok')}` : ''}
      </div>
      <div class="detail-list">
        <div class="detail-item"><span>Ready in</span><b>${p.eta ? `${p.eta} minutes` : 'by arrangement'}</b></div>
        <div class="detail-item"><span>Pickup area</span><b>${esc(p.area)}</b></div>
        <div class="detail-item"><span>Payment</span><b>KC balance${p.rental ? ' · rental' : ''}</b></div>
        ${(p.options || []).map(o => `<div class="detail-item"><span>${esc(o.name)}</span><b>${o.choices.join(' · ')}</b></div>`).join('')}
      </div>
      ${p.stock ? `
        <div class="buy-row">
          <div class="qty big">
            <button data-act="pdp-qty" data-delta="-1">−</button>
            <span id="pdp-qty">${ui.pdpQty}</span>
            <button data-act="pdp-qty" data-delta="1" ${ui.pdpQty >= p.stock ? 'disabled' : ''}>＋</button>
          </div>
          <button class="btn" data-act="${p.rental ? 'rent' : (p.options || []).length ? 'customize' : 'add-pdp'}" data-id="${p.id}">${p.rental ? 'Choose dates' : (p.options || []).length ? 'Choose options' : 'Add to cart'}</button>
          <button class="btn ghost" data-act="buy-now" data-id="${p.id}">Buy now</button>
          <button class="icon-btn heart-lg ${wished ? 'on' : ''}" data-act="wish" data-id="${p.id}">${wished ? '♥' : '♡'}</button>
        </div>` : `<div class="notice warn">Out of stock — ask the vendor to restock from the vendor console.</div>`}
      <p class="footnote">Sold by ${esc(p.vendor)} · demo KC only, no real payment is taken.</p>
    </div>
  </div>

  <div class="tabs">
    ${[['reviews', `Reviews (${reviews.length})`], ['related', 'Related items']].map(([key, label]) => `<button class="tab ${ui.productTab === key ? 'active' : ''}" data-act="product-tab" data-tab="${key}">${label}</button>`).join('')}
  </div>
  ${ui.productTab === 'related' || !reviews.length
    ? `<div class="grid product-grid">${related.map(x => productCard(x)).join('')}</div>`
    : `<div class="review-grid">${reviews.map(r => `
        <article class="review">
          <div class="review-head"><span class="avatar sm">${esc(r.user.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>
            <div><b>${esc(r.user)}</b><small>${relative(r.at)}</small></div>
            ${stars(r.rating)}</div>
          <p>${esc(r.text)}</p>
          ${r.user === state.profile.name ? `<button class="link-btn" data-act="review" data-id="${p.id}">Edit</button>` : ''}
        </article>`).join('')}
      <div class="panel"><b>Share your experience</b><p class="muted small">Your review helps other students pick faster.</p><button class="btn small" data-act="review" data-id="${p.id}">Write a review</button></div>
    </div>`}`;
}

/* ---------- checkout ---------- */

function checkoutPage() {
  const lines = cartLines();
  const totals = cartTotals(lines);
  const c = ui.checkout;
  if (!lines.length) return `${heading('CHECKOUT', 'Your cart is empty', 'Add something you like before checking out.')}
    ${emptyState('🛒', 'Nothing to check out', 'Browse the marketplace, add items, then come back here.', '<button class="btn" data-go="#/explore">Browse marketplace</button>')}`;
  const steps = ['Review', 'Fulfilment', 'Payment'];
  return `
  ${heading('CHECKOUT', 'Checkout', 'Three quick steps, then your order is live in the vendor queue.')}
  <div class="checkout-layout">
    <div class="checkout-main">
      <ol class="stepper">${steps.map((s, i) => `<li class="${c.step === i + 1 ? 'on' : ''} ${c.step > i + 1 ? 'done' : ''}"><span>${c.step > i + 1 ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>

      ${c.step === 1 ? `
        <section class="panel">
          <h3>Review your cart</h3>
          ${lines.map((line, index) => `<div class="cart-line">
            <span class="cart-art">${line.product.icon}</span>
            <div class="cart-info"><b>${esc(line.product.name)}</b><small>${esc(line.product.vendor)}${line.variant ? ` · ${esc(line.variant)}` : ''} · ${kc(line.product.price)} each</small></div>
            <div class="qty"><button data-act="qty" data-index="${index}" data-delta="-1">−</button><span>${line.qty}</span><button data-act="qty" data-index="${index}" data-delta="1">＋</button></div>
            <b>${kc(line.product.price * line.qty)}</b>
            <button class="link-btn" data-act="remove-cart" data-index="${index}">Remove</button>
          </div>`).join('')}
          <div class="row gap" style="margin-top:14px">
            <input id="promo-input" class="grow" placeholder="Promo code (KART10, NEW50, LATE)" value="${state.promo ? esc(state.promo) : ''}" />
            <button class="btn small ghost" data-act="promo">Apply</button>
          </div>
          <div class="modal-foot"><button class="btn ghost" data-go="#/explore">← Keep shopping</button><button class="btn" data-act="checkout-step" data-step="2">Continue to fulfilment →</button></div>
        </section>` : ''}

      ${c.step === 2 ? `
        <section class="panel">
          <h3>How do you want it?</h3>
          <div class="choice-grid">
            ${[['Pickup', '🏪', 'Collect from the vendor counter'], ['Delivery', '🛵', 'Brought to your block · +15 KC under 300 KC']].map(([mode, icon, label]) => `
              <button class="choice ${c.mode === mode ? 'on' : ''}" data-act="checkout-mode" data-mode="${mode}"><span>${icon}</span><b>${mode}</b><small>${label}</small></button>`).join('')}
          </div>
          <div class="form-grid" style="margin-top:16px">
            ${field('Time slot', select('slot', PICKUP_SLOTS, c.slot))}
            ${field('Note for the vendor', input('note', `maxlength="120" placeholder="e.g. Extra chutney, call when ready" value="${esc(c.note)}"`), true)}
          </div>
          <div class="modal-foot"><button class="btn ghost" data-act="checkout-step" data-step="1">← Back</button><button class="btn" data-act="checkout-step" data-step="3">Continue to payment →</button></div>
        </section>` : ''}

      ${c.step === 3 ? `
        <section class="panel">
          <h3>Payment</h3>
          <div class="choice-grid">
            ${[['KC balance', '◉', `Pay from your wallet · ${money(state.balance)} KC available`], ['Campus UPI', '📲', 'Simulated UPI intent — no real money moves'], ['Pay at counter', '🏪', 'Settle when you collect']].map(([mode, icon, label]) => `
              <button class="choice ${c.payment === mode ? 'on' : ''} ${mode === 'KC balance' && state.balance < totals.total ? 'disabled' : ''}" data-act="checkout-payment" data-payment="${mode}"><span>${icon}</span><b>${mode}</b><small>${label}</small></button>`).join('')}
          </div>
          <div class="notice">Orders are paid in simulated KC. Nothing is charged to a bank account or card.</div>
          <div class="modal-foot"><button class="btn ghost" data-act="checkout-step" data-step="2">← Back</button><button class="btn" data-act="place-order">Place order · ${kc(totals.total)} →</button></div>
        </section>` : ''}
    </div>

    <aside class="summary">
      <h3>Order summary</h3>
      <dl class="totals">
        <div><dt>${lines.length} item${lines.length > 1 ? 's' : ''}</dt><dd>${kc(totals.subtotal)}</dd></div>
        ${totals.discount ? `<div class="plus"><dt>Promo ${esc(state.promo)}</dt><dd>−${kc(totals.discount)}</dd></div>` : ''}
        <div><dt>Service fee</dt><dd>${totals.fee ? kc(totals.fee) : 'Free'}</dd></div>
        <div><dt>Fulfilment</dt><dd>${c.mode}${totals.subtotal - totals.discount < 300 && c.mode === 'Delivery' ? ' · 15 KC' : ''}</dd></div>
        <div class="grand"><dt>Total</dt><dd>${kc(totals.total)}</dd></div>
      </dl>
      <p class="footnote">You earn 1 KC back on every 100 KC spent at campus vendors (demo cashback, applied after pickup).</p>
    </aside>
  </div>`;
}

/* ---------- orders ---------- */

function ordersPage() {
  const tab = ui.orderTab;
  const statusFilter = ui.orderStatus;
  const orders = state.orders.filter(o => statusFilter === 'all' || (statusFilter === 'active' ? !['Picked up', 'Cancelled'].includes(o.status) : o.status === statusFilter));
  return `
  ${heading('YOUR ACTIVITY', 'My orders', 'Track every request from placement to pickup, and reorder in one tap.',
    `<button class="btn ghost" data-go="#/explore">Explore more →</button>`)}
  <div class="tabs">
    <button class="tab ${tab === 'orders' ? 'active' : ''}" data-act="order-tab" data-tab="orders">Orders (${state.orders.length})</button>
    <button class="tab ${tab === 'tickets' ? 'active' : ''}" data-act="order-tab" data-tab="tickets">Tickets (${state.tickets.length})</button>
    <button class="tab ${tab === 'bookings' ? 'active' : ''}" data-act="order-tab" data-tab="bookings">Bookings (${state.bookings.length})</button>
  </div>

  ${tab === 'orders' ? `
    <div class="filter-bar"><div class="filters">
      ${[['all', 'All'], ['active', 'In progress'], ['Placed', 'Placed'], ['Preparing', 'Preparing'], ['Ready for pickup', 'Ready'], ['Picked up', 'Picked up'], ['Cancelled', 'Cancelled']].map(([id, label]) => `<button class="filter ${statusFilter === id ? 'active' : ''}" data-act="order-status" data-status="${id}">${label}</button>`).join('')}
    </div></div>
    ${orders.length ? `<div class="grid two-col">${orders.map(orderCard).join('')}</div>`
      : emptyState('◫', 'No orders in this view', 'Orders you place from the marketplace or print desk appear here.', '<button class="btn" data-go="#/explore">Browse marketplace</button>')}` : ''}

  ${tab === 'tickets' ? (state.tickets.length ? `
    <div class="grid product-grid">${state.tickets.map(t => {
      const event = getEvent(t.eventId);
      return `<article class="card ticket">
        <div class="ticket-stub"><span>${event ? event.icon : '🎟️'}</span><b>${esc(t.code)}</b></div>
        <div class="card-body">
          <div class="card-eyebrow">${shortDate(t.date)} · ${timeOnly(t.date)}</div>
          <h3>${esc(t.name)}</h3>
          <p class="card-desc">${esc(t.place)} · purchased ${relative(t.at)}</p>
          <div class="card-actions spread">
            <label class="tool check"><input type="checkbox" data-act="checkin" data-id="${t.id}" ${t.checkedIn ? 'checked' : ''} /> Gate checked in</label>
            <button class="btn tiny ghost" data-act="cancel-ticket" data-id="${t.id}">Cancel & refund</button>
          </div>
        </div>
      </article>`;
    }).join('')}</div>` : emptyState('🎟️', 'No tickets yet', 'Register for an event and your pass lands here with a gate check-in toggle.', '<button class="btn" data-go="#/events">See events</button>')) : ''}

  ${tab === 'bookings' ? (state.bookings.length ? `
    <div class="stack">${state.bookings.map(b => `
      <div class="panel booking">
        <div class="row gap">
          <span class="row-icon">${b.icon || '✨'}</span>
          <div class="row-body"><b>${esc(b.name)}</b><small>${esc(b.provider)} · ${dateTime(b.when)} · ${kc(b.amount)}</small><p class="muted small">${esc(b.note)}</p></div>
          <div class="stack right">
            ${badge(b.status, b.status === 'Cancelled' ? 'warn' : b.status === 'Confirmed' ? 'ok' : 'blue')}
            ${b.rated ? stars(b.rated) : ''}
          </div>
        </div>
        <div class="card-actions" style="margin-top:12px">
          ${b.status === 'Cancelled' ? '' : `<button class="btn tiny ghost" data-act="cancel-booking" data-id="${b.id}">Cancel & refund</button>`}
          ${b.status === 'Confirmed' && !b.rated ? `<button class="btn tiny" data-act="rate-booking" data-id="${b.id}">Rate provider</button>` : ''}
        </div>
      </div>`).join('')}</div>` : emptyState('✨', 'No bookings yet', 'Book a peer for tutoring, design, photography or repairs.', '<button class="btn" data-go="#/services">Browse services</button>')) : ''}`;
}

function orderPage(id) {
  const order = getOrder(id);
  if (!order) return emptyState('◫', 'Order not found', 'It may have been removed.', '<button class="btn" data-go="#/orders">Back to orders</button>');
  const cancelled = order.status === 'Cancelled';
  const cashback = Math.floor(order.total / 100);
  return `
  <nav class="crumbs"><a data-go="#/orders">My orders</a> / <span>${esc(order.id)}</span></nav>
  ${heading(`${order.id} · ${relative(order.created)}`, esc(order.items.map(i => i.name).join(', ')),
    `${esc(order.vendor)} · ${esc(order.fulfil.mode)} · ${esc(order.payment)}`,
    `${!cancelled && !['Picked up'].includes(order.status) ? `<button class="btn ghost" data-act="cancel-order" data-id="${order.id}">Cancel order</button>` : ''}
     ${order.rating ? '' : `<button class="btn ghost" data-act="rate" data-id="${order.id}">Rate order</button>`}
     <button class="btn" data-act="reorder" data-id="${order.id}">Reorder →</button>`)}
  <div class="grid two-col">
    <section class="panel">
      <h3>${cancelled ? 'Cancelled' : order.status === 'Picked up' ? 'Completed' : 'Live status'}</h3>
      ${timeline(order)}
      <div class="detail-list" style="margin-top:18px">
        <div class="detail-item"><span>Pickup window</span><b>${esc(order.fulfil.slot)}</b></div>
        ${order.fulfil.note ? `<div class="detail-item"><span>Note</span><b>${esc(order.fulfil.note)}</b></div>` : ''}
        <div class="detail-item"><span>Placed</span><b>${dateTime(order.created)}</b></div>
        <div class="detail-item"><span>Payment</span><b>${esc(order.payment)}${order.payment === 'KC balance' ? ` · ${kc(order.total)}` : ''}</b></div>
        <div class="detail-item"><span>Cashback</span><b>${cashback ? `+${kc(cashback)} on pickup` : 'None on this order'}</b></div>
      </div>
      <div class="card-actions" style="margin-top:16px">
        <button class="btn small ghost" data-act="contact-vendor" data-id="${order.id}">Message vendor</button>
        <button class="btn small ghost" data-act="help">Need help?</button>
      </div>
    </section>
    <section class="panel">
      <h3>Items</h3>
      ${order.items.map(item => `<div class="cart-line">
        <span class="cart-art">${item.icon || iconFor(item.type)}</span>
        <div class="cart-info"><b>${esc(item.name)}</b><small>${item.qty} × ${kc(item.price)}${item.variant ? ` · ${esc(item.variant)}` : ''}</small></div>
        <b>${kc(item.price * item.qty)}</b>
      </div>`).join('')}
      <dl class="totals">
        <div><dt>Subtotal</dt><dd>${kc(order.subtotal)}</dd></div>
        ${order.discount ? `<div class="plus"><dt>Discount</dt><dd>−${kc(order.discount)}</dd></div>` : ''}
        <div><dt>Fee</dt><dd>${order.fee ? kc(order.fee) : 'Free'}</dd></div>
        <div class="grand"><dt>Total</dt><dd>${kc(order.total)}</dd></div>
      </dl>
      ${order.review ? `<div class="review" style="margin-top:14px">${stars(order.rating)}<p>${esc(order.review)}</p></div>` : ''}
    </section>
  </div>`;
}

/* ---------- tasks ---------- */

function tasksPage() {
  const tab = ui.taskTab;
  const q = ui.query.trim().toLowerCase();
  let list = state.tasks.filter(t =>
    tab === 'mine' ? t.poster === 'You'
      : tab === 'assigned' ? t.status === 'Assigned' && t.worker === 'You'
      : tab === 'history' ? ['Completed', 'Cancelled'].includes(t.status)
      : t.status === 'Open' && t.poster !== 'You');
  if (q) list = list.filter(t => `${t.title} ${t.description}`.toLowerCase().includes(q));
  const openCount = state.tasks.filter(t => t.status === 'Open').length;
  return `
  ${heading('TASK MARKETPLACE', 'Get help. Earn KC.', 'Post an errand, or bid on one and get paid when it is approved.',
    `<button class="btn" data-act="post-task">+ Post a task</button>`)}
  <div class="stats grid four">
    ${statCard('Open tasks', String(openCount), 'bidding live')}
    ${statCard('Urgent now', String(state.tasks.filter(t => t.urgent && t.status === 'Open').length), 'quick payouts')}
    ${statCard('Your posts', String(state.tasks.filter(t => t.poster === 'You').length), 'manage below')}
    ${statCard('Wallet', `${money(state.balance)} KC`, 'available')}
  </div>
  <div class="tabs">
    ${[['discover', 'Discover'], ['mine', 'My posts'], ['assigned', 'Assigned to me'], ['history', 'History']].map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-act="task-tab" data-tab="${id}">${label}${id === 'discover' ? ` (${openCount})` : ''}</button>`).join('')}
  </div>
  ${list.length
    ? `<div class="grid two-col">${list.map(taskCard).join('')}</div>`
    : emptyState('⚡', 'Nothing here yet', tab === 'discover' ? 'New tasks are posted by students all day — check back soon or post your own.' : 'Tasks you post or join will show up here.', `<button class="btn" data-act="post-task">Post a task</button>`)}`;
}

function taskPage(id) {
  const t = getTask(id);
  if (!t) return emptyState('⚡', 'Task not found', 'It may have been completed or cancelled.', '<button class="btn" data-go="#/tasks">Back to tasks</button>');
  const mine = t.poster === 'You';
  const myBid = t.bids.find(b => b.worker === 'You');
  const accepted = t.bids.find(b => b.id === t.acceptedBid);
  const thread = state.messages[t.id] || [];
  const canBid = !mine && t.status === 'Open';
  return `
  <nav class="crumbs"><a data-go="#/tasks">Tasks</a> / <span>${esc(t.title)}</span></nav>
  <div class="grid two-col">
    <section class="panel">
      <div class="task-tags">${badge(t.urgent ? '⚡ Urgent' : t.category, t.urgent ? 'warn' : 'blue')}${badge(t.status, t.status === 'Cancelled' ? 'warn' : t.status === 'Completed' ? 'ok' : 'blue')}</div>
      <h2 class="task-title">${esc(t.title)}</h2>
      <p class="muted">${esc(t.description)}</p>
      <div class="detail-list">
        <div class="detail-item"><span>Budget</span><b>${kc(t.budget)}</b></div>
        <div class="detail-item"><span>Deadline</span><b>${dateTime(t.deadline)} · in ${countdown(t.deadline)}</b></div>
        <div class="detail-item"><span>Posted by</span><b>${esc(mine ? (t.anonymous ? 'You (anonymous)' : 'You') : t.poster)}</b></div>
        <div class="detail-item"><span>Posted</span><b>${relative(t.createdAt)}</b></div>
        ${t.committed ? `<div class="detail-item"><span>Held in escrow</span><b>${kc(t.committed)}</b></div>` : ''}
        ${accepted ? `<div class="detail-item"><span>Assigned to</span><b>${esc(accepted.worker)}</b></div>` : ''}
      </div>
      ${mine ? `<div class="card-actions" style="margin-top:16px">
        ${t.status === 'Assigned' ? `<button class="btn small" data-act="approve-task" data-id="${t.id}">Approve & release ${kc(t.committed || 0)}</button>` : ''}
        ${['Open', 'Assigned'].includes(t.status) ? `<button class="btn small ghost" data-act="cancel-task" data-id="${t.id}">Cancel task</button>` : ''}
      </div>` : ''}
      ${t.worker === 'You' && t.status === 'Assigned' ? `<div class="card-actions" style="margin-top:16px">
        <button class="btn small" data-act="submit-work" data-id="${t.id}">Submit work for approval</button>
        <button class="btn small ghost" data-go="#/tasks">Back to list</button>
      </div>` : ''}
      ${t.status === 'In review' ? `<div class="notice ok">Work submitted — the poster reviews it automatically in this demo, then ${kc(t.budget)} is released to you.</div>` : ''}
      ${t.status === 'Completed' ? `<div class="notice ok">Completed. ${mine ? 'Escrow released to the worker.' : `${kc(t.budget)} was paid to your wallet.`}</div>` : ''}
    </section>

    <section class="panel">
      <h3>Bids (${t.bids.length})</h3>
      ${t.bids.length ? `<div class="stack">${t.bids.map(b => `
        <div class="bid ${b.id === t.acceptedBid ? 'accepted' : ''}">
          <div class="row gap"><span class="avatar sm">${esc(b.worker.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>
            <div class="row-body"><b>${esc(b.worker)} · ${kc(b.amount)}</b><small>${relative(b.at || t.createdAt)}</small></div>
            ${b.id === t.acceptedBid ? badge('Accepted', 'ok') : ''}
          </div>
          <p>${esc(b.note)}</p>
          ${mine && t.status === 'Open' ? `<button class="btn tiny" data-act="accept-bid" data-id="${t.id}" data-bid="${b.id}">Accept & hold ${kc(b.amount)}</button>` : ''}
        </div>`).join('')}</div>`
        : '<div class="empty small">No bids yet — you could be the first.</div>'}

      ${canBid ? (myBid
        ? `<div class="notice ok">Your bid of ${kc(myBid.amount)} is with the poster. <button class="link-btn" data-act="withdraw-bid" data-id="${t.id}">Withdraw</button></div>`
        : `<form id="bid-form" data-id="${t.id}" class="form-grid" style="margin-top:16px">
            ${field('Your bid (KC)', input('amount', `type="number" min="1" max="100000" value="${t.budget}" required`))}
            ${field('Your ETA', input('eta', 'required maxlength="60" placeholder="e.g. Today, 5 PM"'))}
            ${field('Proposal', textarea('note', 'required maxlength="250" placeholder="How will you get it done?"'), true)}
            <button class="btn wide" type="submit">Submit bid</button>
          </form>`) : ''}
      ${mine && !t.bids.length ? '<p class="footnote">Bids usually arrive within a minute of publishing.</p>' : ''}
    </section>
  </div>

  <section class="panel chat-panel">
    <div class="chat-head"><h3>Conversation</h3><span class="muted small">Local demo thread — replies are simulated</span></div>
    <div class="chat-log" id="chat-log">
      ${thread.length ? thread.map(m => `<div class="message ${m.mine ? 'mine' : ''}"><span>${esc(m.text)}</span><small>${m.mine ? 'You' : esc(t.poster === 'You' ? 'Worker' : t.poster)} · ${timeOnly(m.at)}</small></div>`).join('')
        : `<div class="empty small">No messages yet. Say hello or share pickup details.</div>`}
    </div>
    <form id="message-form" data-id="${t.id}" class="row gap">
      <input name="text" required maxlength="400" class="grow" placeholder="Write a message…" />
      <button class="btn small" type="submit">Send</button>
    </form>
  </section>`;
}

/* ---------- events ---------- */

function eventsPage() {
  const cat = ui.eventCat;
  const q = ui.query.trim().toLowerCase();
  let list = state.events.filter(e => cat === 'all' || e.category === cat);
  if (q) list = list.filter(e => `${e.name} ${e.host} ${e.desc}`.toLowerCase().includes(q));
  const cats = ['all', ...Array.from(new Set(state.events.map(e => e.category)))];
  const soon = list.filter(e => new Date(e.date) > new Date()).sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = list.filter(e => new Date(e.date) <= new Date());
  return `
  ${heading('WHAT’S HAPPENING', 'Campus events', 'Clubs, workshops and nights worth leaving the hostel for.',
    `<button class="btn" data-act="new-event">+ Publish an event</button>`)}
  <div class="filter-bar"><div class="filters">${cats.map(c => `<button class="filter ${cat === c ? 'active' : ''}" data-act="event-cat" data-cat="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('')}</div></div>
  ${state.tickets.length ? `${sectionTitle('Your tickets', '#/orders', 'Manage →')}<div class="stack">${state.tickets.map(t => `
    <button class="row-card" data-go="#/orders"><span class="row-icon">🎟️</span><span class="row-body"><b>${esc(t.name)}</b><small>${shortDate(t.date)} · ${esc(t.place)} · ${esc(t.code)}</small></span><span class="badge ok">${t.checkedIn ? 'Checked in' : 'Confirmed'}</span></button>`).join('')}</div>` : ''}
  ${soon.length ? `${sectionTitle('Upcoming')}<div class="grid product-grid">${soon.map(eventCard).join('')}</div>` : ''}
  ${past.length ? `${sectionTitle('Happening now')}<div class="grid product-grid">${past.map(eventCard).join('')}</div>` : ''}
  ${!list.length ? emptyState('🎟️', 'No events here yet', 'Try another category, or publish one from your organizer console.', '<button class="btn" data-go="#/workspace">Open workspace</button>') : ''}`;
}

/* ---------- services ---------- */

function servicesPage() {
  const tab = ui.serviceTab;
  const q = ui.query.trim().toLowerCase();
  const list = allServices().filter(s => !q || `${s.name} ${s.provider} ${s.desc}`.toLowerCase().includes(q));
  return `
  ${heading('SKILLS ON CAMPUS', 'Student services', 'Learn, create and collaborate with talented peers.',
    `<button class="btn" data-act="offer-service">+ Offer a service</button>`)}
  <div class="tabs">
    ${[['browse', 'Browse'], ['bookings', `My bookings (${state.bookings.length})`], ['offers', `My offers (${state.serviceListings.length})`]].map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-act="service-tab" data-tab="${id}">${label}</button>`).join('')}
  </div>
  ${tab === 'browse' ? (list.length ? `<div class="grid product-grid">${list.map(serviceCard).join('')}</div>`
    : emptyState('✨', 'No services match', 'Clear the search or offer your own skill to campus.', '<button class="btn" data-act="offer-service">Offer a service</button>')) : ''}
  ${tab === 'bookings' ? (state.bookings.length ? `<div class="stack">${state.bookings.map(b => `
    <div class="panel"><div class="row gap">
      <span class="row-icon">${b.icon || '✨'}</span>
      <div class="row-body"><b>${esc(b.name)}</b><small>${esc(b.provider)} · ${dateTime(b.when)} · ${kc(b.amount)}</small><p class="muted small">${esc(b.note)}</p></div>
      <div class="stack right">${badge(b.status, b.status === 'Cancelled' ? 'warn' : b.status === 'Confirmed' ? 'ok' : 'blue')}${b.rated ? stars(b.rated) : ''}</div>
    </div>
    <div class="card-actions" style="margin-top:12px">
      ${b.status !== 'Cancelled' ? `<button class="btn tiny ghost" data-act="cancel-booking" data-id="${b.id}">Cancel & refund</button>` : ''}
      ${b.status === 'Confirmed' && !b.rated ? `<button class="btn tiny" data-act="rate-booking" data-id="${b.id}">Rate provider</button>` : ''}
    </div></div>`).join('')}</div>`
    : emptyState('📅', 'No bookings', 'Book tutoring, design, photography or repairs from the Browse tab.', '<button class="btn" data-act="service-tab" data-tab="browse">Browse services</button>')) : ''}
  ${tab === 'offers' ? (state.serviceListings.length ? `<div class="grid product-grid">${state.serviceListings.map(serviceCard).join('')}</div>`
    : emptyState('💡', 'You are not offering anything yet', 'Publish a skill — tutoring, design, repairs — and earn KC from peers.', '<button class="btn" data-act="offer-service">Offer a service</button>')) : ''}`;
}

/* ---------- resale ---------- */

function resalePage() {
  const tab = ui.resaleTab;
  const q = ui.query.trim().toLowerCase();
  let list = state.listings.filter(l => tab === 'all' ? true : tab === 'mine' ? l.seller === 'You' : tab === 'rent' ? l.rental : l.status === 'sold');
  if (q) list = list.filter(l => `${l.name} ${l.desc} ${l.seller}`.toLowerCase().includes(q));
  const shop = state.products.filter(p => p.type === 'resale' && (tab === 'all' || tab === 'shop'));
  return `
  ${heading('PASS IT ON', 'Buy, sell or rent', 'Great things deserve a second campus life.',
    `<button class="btn" data-act="new-listing">+ Create listing</button>`)}
  <div class="tabs">
    ${[['all', 'All listings'], ['mine', 'My listings'], ['rent', 'For rent'], ['shop', 'Campus exchange'], ['sold', 'Sold']].map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-act="resale-tab" data-tab="${id}">${label}</button>`).join('')}
  </div>
  ${tab === 'shop'
    ? `<div class="grid product-grid">${shop.map(p => productCard(p)).join('')}</div>`
    : list.length
      ? `<div class="grid product-grid">${list.map(listingCard).join('')}</div>`
      : emptyState('🔄', 'Nothing listed here', 'Create a listing in seconds — textbooks, gadgets, winter gear.', '<button class="btn" data-act="new-listing">Create listing</button>')}`;
}

/* ---------- wishlist ---------- */

function wishlistPage() {
  const items = state.wishlist.map(getProduct).filter(Boolean);
  return `
  ${heading('SAVED', 'Wishlist', 'Everything you are keeping an eye on.')}
  ${items.length ? `<div class="grid product-grid">${items.map(p => productCard(p, 'wishlist')).join('')}</div>`
    : emptyState('♡', 'No saved items yet', 'Tap the heart on any product to keep it here for later.', '<button class="btn" data-go="#/explore">Find something you love</button>')}`;
}

/* ---------- wallet ---------- */

function walletPage() {
  const cat = ui.walletCat;
  const cats = ['All', 'Orders', 'Earnings', 'Refunds', 'Top-ups', 'Transfers', 'Tasks', 'Events', 'Services'];
  const tx = state.transactions.filter(t => cat === 'All' || t.cat === cat);
  const earned = state.transactions.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const spent = state.transactions.filter(t => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  const escrow = state.tasks.reduce((a, t) => a + (t.committed || 0), 0);
  const week = [...Array(7)].map((_, i) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - i));
    const next = day.getTime() + DAY;
    const value = state.transactions.filter(t => t.amount < 0 && new Date(t.at).getTime() >= day.getTime() && new Date(t.at).getTime() < next).reduce((a, t) => a + Math.abs(t.amount), 0);
    return { label: day.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2), value };
  });
  const peak = Math.max(1, ...week.map(w => w.value));
  return `
  ${heading('KART CREDITS', 'KC wallet', 'Your campus balance, cash flow and every movement of KC.',
    `<button class="btn ghost" data-act="request">⇢ Request KC</button><button class="btn ghost" data-act="send">→ Send KC</button><button class="btn" data-act="add-funds">＋ Add demo KC</button>`)}
  <div class="wallet-grid">
    <div class="wallet-hero">
      <span>Available balance</span>
      <strong>${money(state.balance)}<small>KC</small></strong>
      <div class="wallet-meta">
        <span>Earned ${kc(earned)}</span><span>Spent ${kc(spent)}</span><span>Escrow ${kc(escrow)}</span>
      </div>
      <div class="wallet-actions">
        <button class="btn light" data-act="add-funds">Add demo KC</button>
        <button class="btn ghost light" data-act="send">Send to a student</button>
      </div>
    </div>
    <div class="panel chart-panel">
      <div class="row spread"><h3>Spend this week</h3><span class="muted small">${kc(week.reduce((a, w) => a + w.value, 0))} out</span></div>
      <div class="chart">${week.map(w => `<div class="bar" title="${kc(w.value)}"><span style="height:${Math.round((w.value / peak) * 100)}%"></span><small>${w.label}</small></div>`).join('')}</div>
    </div>
  </div>

  <div class="stats grid four">
    ${statCard('Earned', kc(earned), 'all time')}
    ${statCard('Spent', kc(spent), 'all time')}
    ${statCard('In escrow', kc(escrow), 'task commitments')}
    ${statCard('Transactions', String(state.transactions.length), 'recorded')}
  </div>

  ${state.requests.length ? `${sectionTitle('Payment requests')}<div class="stack">${state.requests.map(r => `
    <div class="panel"><div class="row spread"><div class="row-body"><b>${kc(r.amount)} from ${esc(r.from)}</b><small>${esc(r.note || 'No note')} · ${relative(r.at)}</small></div>
    <div class="card-actions">${badge(r.status, r.status === 'Settled' ? 'ok' : 'blue')}${r.status === 'Pending' ? `<button class="btn tiny" data-act="settle-request" data-id="${r.id}">Simulate payment</button>` : ''}</div></div></div>`).join('')}</div>` : ''}

  ${sectionTitle('Transaction history')}
  <div class="filter-bar"><div class="filters">${cats.map(c => `<button class="filter ${cat === c ? 'active' : ''}" data-act="wallet-cat" data-cat="${esc(c)}">${c}</button>`).join('')}</div></div>
  <div class="table-wrap">
    <table><thead><tr><th>Transaction</th><th>Category</th><th>Date</th><th>Reference</th><th class="right">Amount</th></tr></thead>
    <tbody>${tx.length ? tx.map(t => `<tr>
      <td><strong>${esc(t.title.replace(/^-/, ''))}</strong></td>
      <td>${badge(t.cat)}</td>
      <td>${dateTime(t.at)}</td>
      <td class="muted">${esc(t.id)}</td>
      <td class="right ${t.amount > 0 ? 'money-plus' : t.amount < 0 ? 'money-minus' : 'money-zero'}">${t.amount > 0 ? '+' : t.amount < 0 ? '−' : ''}${t.amount ? kc(Math.abs(t.amount)) : 'release'}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted">No transactions in this category.</td></tr>'}</tbody></table>
  </div>
  <p class="footnote">KC is simulated, browser-local and holds no monetary value.</p>`;
}

/* ---------- notifications ---------- */

function notificationsPage() {
  const unreadOnly = ui.notifTab === 'unread';
  const list = state.notifications.filter(n => !unreadOnly || !n.read);
  return `
  ${heading('UPDATES', 'Notifications', 'Order status, bids, tickets and wallet movements in one stream.',
    `${unreadCount() ? '<button class="btn ghost" data-act="read-all">Mark all read</button>' : ''}<button class="btn ghost" data-act="clear-notifs">Clear all</button>`)}
  <div class="tabs">
    <button class="tab ${!unreadOnly ? 'active' : ''}" data-act="notif-tab" data-tab="all">All (${state.notifications.length})</button>
    <button class="tab ${unreadOnly ? 'active' : ''}" data-act="notif-tab" data-tab="unread">Unread (${unreadCount()})</button>
  </div>
  ${list.length ? `<div class="stack">${list.map(n => `
    <button class="notif big ${n.read ? '' : 'unread'}" data-act="open-notif" data-id="${n.id}">
      <span class="notif-icon">${iconFor(n.type) || '🔔'}</span>
      <span class="notif-body"><b>${esc(n.title)}</b><small>${esc(n.body)}</small><time>${dateTime(n.at)} · ${relative(n.at)}</time></span>
      ${n.link ? '<span class="notif-go">→</span>' : ''}
    </button>`).join('')}</div>`
    : emptyState('🔔', 'Nothing here', unreadOnly ? 'You have read everything. Nice work.' : 'Updates will appear as campus activity happens.', '<button class="btn" data-act="notif-tab" data-tab="all">Show all</button>')}`;
}

/* ---------- profile ---------- */

function profilePage() {
  const p = state.profile;
  const initials = p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `
  ${heading('YOUR ACCOUNT', 'Profile & settings', 'Personal details, preferences and your local data.')}
  <div class="grid two-col">
    <section class="panel">
      <div class="profile-hero">
        <span class="avatar xl">${esc(initials)}</span>
        <div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.email)} · ${esc(p.hostel)}</p><p class="muted small">${esc(p.bio)}</p></div>
      </div>
      <form id="profile-form" class="form-grid" style="margin-top:16px">
        ${field('Display name', input('name', `required maxlength="50" value="${esc(p.name)}"`), true)}
        ${field('Email', input('email', `type="email" required maxlength="80" value="${esc(p.email)}"`), true)}
        ${field('Hostel / block', input('hostel', `maxlength="40" value="${esc(p.hostel)}"`))}
        ${field('Area', select('area', CAMPUS_AREAS, state.area))}
        ${field('Bio', textarea('bio', `maxlength="160"`, ), true)}
        <button class="btn wide" type="submit">Save profile</button>
      </form>
    </section>

    <section class="panel">
      <h3>Preferences</h3>
      <form id="settings-form" class="form-grid">
        ${field('Theme', select('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']], state.settings.theme))}
        ${field('Default explore view', select('view', [['grid', 'Grid'], ['list', 'List']], ui.explore.view))}
        <label class="field wide check"><input type="checkbox" name="notify" ${state.settings.notify ? 'checked' : ''} /> Show campus notifications</label>
        <button class="btn wide ghost" type="submit">Save preferences</button>
      </form>
      <div class="divider"></div>
      <h3>Explore as</h3>
      <p class="muted small">Switch between demo roles to see how the same campus data looks from each side.</p>
      <div class="card-actions">${['Student', 'Vendor', 'Organizer', 'Admin'].map(r => `<button class="btn tiny ${state.role === r ? '' : 'ghost'}" data-act="role" data-role="${r}">${r}</button>`).join('')}</div>
      <div class="divider"></div>
      <h3>Your data</h3>
      <p class="muted small">Everything lives in this browser. Export a backup, restore it later, or start fresh.</p>
      <div class="card-actions">
        <button class="btn tiny ghost" data-act="export">Export JSON</button>
        <button class="btn tiny ghost" data-act="import">Import backup</button>
        <button class="btn tiny ghost" data-act="reset">Reset demo data</button>
      </div>
      <input type="file" id="import-file" accept="application/json" hidden />
    </section>
  </div>

  <div class="stats grid four">
    ${statCard('Orders', String(state.orders.length), 'lifetime')}
    ${statCard('Tasks posted', String(state.tasks.filter(t => t.poster === 'You').length), 'as poster')}
    ${statCard('Listings', String(state.listings.filter(l => l.seller === 'You').length), 'on campus')}
    ${statCard('Member since', shortDate(isoIn(-240)), 'demo account')}
  </div>`;
}

/* ---------- workspace ---------- */

function workspacePage() {
  const role = state.role;
  return `
  ${heading('YOUR SPACE', role === 'Student' ? 'My workspace' : `${role} console`,
    'Switch views to work the campus from every side.',
    `<select class="select" id="role-select" aria-label="Demo role">${['Student', 'Vendor', 'Organizer', 'Admin'].map(r => `<option ${r === role ? 'selected' : ''}>${r}</option>`).join('')}</select>`)}
  <div class="notice">Role switching is a demonstration view. Real permissions require verified accounts and server enforcement.</div>
  ${role === 'Vendor' ? vendorConsole() : role === 'Organizer' ? organizerConsole() : role === 'Admin' ? adminConsole() : studentConsole()}`;
}

function studentConsole() {
  const active = state.orders.filter(o => !['Picked up', 'Cancelled'].includes(o.status));
  const assigned = state.tasks.filter(t => t.worker === 'You' && ['Assigned', 'In review'].includes(t.status));
  return `
  <div class="stats grid four">
    ${statCard('Active orders', String(active.length), active.map(o => o.status)[0] || 'none')}
    ${statCard('Tasks in progress', String(assigned.length), 'as worker')}
    ${statCard('Tickets', String(state.tickets.length), 'events')}
    ${statCard('Wallet', `${money(state.balance)} KC`, 'available')}
  </div>
  <div class="grid two-col">
    <section class="panel">
      <h3>Quick actions</h3>
      <div class="quick-row">
        <button class="btn secondary small" data-act="post-task">Post task</button>
        <button class="btn secondary small" data-act="print">Print documents</button>
        <button class="btn secondary small" data-act="new-listing">Sell an item</button>
        <button class="btn secondary small" data-act="offer-service">Offer a service</button>
        <button class="btn secondary small" data-act="new-event">Publish event</button>
        <button class="btn secondary small" data-go="#/wallet">Wallet</button>
      </div>
    </section>
    <section class="panel">
      <h3>Recent activity</h3>
      <div class="stack">${state.transactions.slice(0, 5).map(t => `
        <div class="activity"><div class="activity-icon">${t.amount >= 0 ? '＋' : '−'}</div>
        <div class="activity-body"><b>${esc(t.title.replace(/^-/, ''))}</b><span>${dateTime(t.at)} · ${t.cat}</span></div>
        <div class="activity-end ${t.amount > 0 ? 'money-plus' : 'money-minus'}">${t.amount ? `${t.amount > 0 ? '+' : '−'}${kc(Math.abs(t.amount))}` : 'released'}</div></div>`).join('')}</div>
    </section>
  </div>`;
}

function vendorConsole() {
  const vendorOrders = state.orders.filter(o => !['resale'].includes(o.type) && o.status !== 'Cancelled');
  const menu = state.products.filter(p => ['food', 'stationery', 'merch'].includes(p.type));
  const revenue = vendorOrders.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + o.total, 0);
  return `
  <div class="stats grid four">
    ${statCard('Revenue', kc(revenue), 'demo, all vendors')}
    ${statCard('In queue', String(vendorOrders.filter(o => ['Placed', 'Preparing'].includes(o.status)).length), 'needs action')}
    ${statCard('Ready', String(vendorOrders.filter(o => o.status === 'Ready for pickup').length), 'awaiting pickup')}
    ${statCard('Menu items', String(menu.length), `${menu.filter(m => !m.stock).length} out of stock`)}
  </div>
  <section>
    ${sectionTitle('Preparation queue')}
    <div class="stack">${vendorOrders.length ? vendorOrders.map(o => `
      <div class="panel">
        <div class="row spread">
          <div class="row gap">
            <span class="row-icon">${o.items[0] ? o.items[0].icon : '🛍️'}</span>
            <div class="row-body"><b>${esc(o.items.map(i => i.name).join(', '))}</b><small>${esc(o.id)} · ${esc(o.vendor)} · ${kc(o.total)} · ${relative(o.created)}</small></div>
          </div>
          <div class="card-actions">
            ${badge(o.status, o.status === 'Ready for pickup' ? 'ok' : o.status === 'Placed' ? 'blue' : '')}
            ${o.status === 'Placed' ? `<button class="btn tiny" data-act="advance-order" data-id="${o.id}">Start preparing</button>` : ''}
            ${o.status === 'Preparing' ? `<button class="btn tiny" data-act="advance-order" data-id="${o.id}">Mark ready</button>` : ''}
            ${o.status === 'Ready for pickup' ? `<button class="btn tiny ghost" data-act="advance-order" data-id="${o.id}">Hand over</button>` : ''}
            <button class="btn tiny ghost" data-go="#/order/${o.id}">Open</button>
          </div>
        </div>
      </div>`).join('') : emptyState('🍽️', 'Queue is clear', 'New orders from the marketplace appear here instantly.')}</div>
  </section>
  <section>
    ${sectionTitle('Menu management')}
    <div class="grid two-col">
      <div class="panel">
        <h3>Add an item</h3>
        <form id="product-form" class="form-grid">
          ${field('Name', input('name', 'required maxlength="60" placeholder="Cheese Maggi Bowl"'))}
          ${field('Price in KC', input('price', 'type="number" min="1" required'))}
          ${field('Category', select('type', [['food', 'Food'], ['stationery', 'Supplies'], ['merch', 'Merch']]))}
          ${field('Icon', select('icon', ['🍜', '🥪', '🥤', '🍰', '📐', '📚', '👕'], '🍜'))}
          ${field('Description', textarea('desc', 'maxlength="140"'), true)}
          <button class="btn wide" type="submit">Add to menu</button>
        </form>
      </div>
      <div class="panel">
        <h3>Your items</h3>
        <div class="stack">${menu.map(p => `
          <div class="row spread">
            <div class="row gap"><span class="row-icon">${p.icon}</span><div class="row-body"><b>${esc(p.name)}</b><small>${kc(p.price)} · ${p.stock ? `${p.stock} in stock` : 'out of stock'}</small></div></div>
            <div class="card-actions">
              <button class="btn tiny ${p.stock ? 'ghost' : ''}" data-act="toggle-stock" data-id="${p.id}">${p.stock ? 'Mark out' : 'Restock'}</button>
              <button class="btn tiny ghost" data-act="delete-product" data-id="${p.id}">Remove</button>
            </div>
          </div>`).join('')}</div>
      </div>
    </div>
  </section>`;
}

function organizerConsole() {
  const myEvents = state.events;
  return `
  <div class="stats grid four">
    ${statCard('Events', String(myEvents.length), 'published')}
    ${statCard('Tickets issued', String(state.tickets.length), 'you hold')}
    ${statCard('Seats', String(myEvents.reduce((a, e) => a + e.seats, 0)), 'capacity')}
    ${statCard('Registrations', String(myEvents.reduce((a, e) => a + e.taken, 0)), 'all events')}
  </div>
  <div class="grid two-col">
    <section class="panel">
      <h3>Publish an event</h3>
      <form id="event-form" class="form-grid">
        ${field('Event name', input('name', 'required maxlength="60" placeholder="Robotics Showcase"'), true)}
        ${field('Date & time', input('date', 'type="datetime-local" required'))}
        ${field('Venue', input('place', 'required maxlength="60" placeholder="Innovation Hall"'))}
        ${field('Ticket price (0 = free)', input('price', 'type="number" min="0" value="0"'))}
        ${field('Seats', input('seats', 'type="number" min="1" value="50"'))}
        ${field('Category', select('category', ['Technology', 'Design', 'Business', 'Sports', 'Culture', 'Career', 'Campus']))}
        ${field('Icon', select('icon', ['🎉', '💻', '🎨', '🎤', '🏃', '📄', '🎙️'], '🎉'))}
        ${field('Description', textarea('desc', 'required maxlength="240"'), true)}
        <button class="btn wide" type="submit">Publish event</button>
      </form>
    </section>
    <section class="panel">
      <h3>Your events</h3>
      <div class="stack">${myEvents.map(e => `
        <div class="row spread">
          <div class="row gap"><span class="row-icon">${e.icon}</span>
            <div class="row-body"><b>${esc(e.name)}</b><small>${shortDate(e.date)} · ${esc(e.place)} · ${e.taken}/${e.seats} seats</small>
            <div class="track" style="margin-top:6px"><div class="track-fill" style="width:${Math.round((e.taken / e.seats) * 100)}%"></div></div></div>
          </div>
          <div class="card-actions">
            <button class="btn tiny ghost" data-act="event" data-id="${e.id}">Preview</button>
            <button class="btn tiny ghost" data-act="delete-event" data-id="${e.id}">Remove</button>
          </div>
        </div>`).join('')}</div>
      <div class="divider"></div>
      <h3>Gate check-in</h3>
      ${state.tickets.length ? state.tickets.map(t => `
        <div class="row spread"><div class="row-body"><b>${esc(t.name)}</b><small>${esc(t.code)} · ${esc(t.place)}</small></div>
        <label class="tool check"><input type="checkbox" data-act="checkin" data-id="${t.id}" ${t.checkedIn ? 'checked' : ''} /> Checked in</label></div>`).join('')
        : '<p class="muted small">No tickets issued yet.</p>'}
    </section>
  </div>`;
}

function adminConsole() {
  const pending = state.moderation.filter(r => r.status === 'pending');
  const gmv = state.orders.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + o.total, 0);
  return `
  <div class="stats grid four">
    ${statCard('Marketplace items', String(state.products.length), `${state.products.filter(p => !p.stock).length} out of stock`)}
    ${statCard('Open tasks', String(state.tasks.filter(t => t.status === 'Open').length), 'live bids')}
    ${statCard('GMV', kc(gmv), 'demo order value')}
    ${statCard('Reports', String(pending.length), 'awaiting review')}
  </div>
  <div class="grid two-col">
    <section class="panel">
      <h3>Moderation queue</h3>
      ${state.moderation.length ? `<div class="stack">${state.moderation.map(r => `
        <div class="mini-card">
          <div class="row spread"><div class="row-body"><b>${esc(r.title)}</b><small>${esc(r.kind)} · ${esc(r.owner)} · ${relative(r.at)}</small></div>${badge(r.status === 'pending' ? 'Pending' : r.status, r.status === 'pending' ? 'warn' : r.status === 'approved' ? 'ok' : '')}</div>
          <p class="muted small">${esc(r.reason)}</p>
          ${r.status === 'pending' ? `<div class="card-actions">
            <button class="btn tiny" data-act="moderate" data-id="${r.id}" data-decision="approved">Approve</button>
            <button class="btn tiny ghost" data-act="moderate" data-id="${r.id}" data-decision="removed">Remove</button>
          </div>` : ''}
        </div>`).join('')}</div>` : '<p class="muted small">Queue is clear.</p>'}
    </section>
    <section class="panel">
      <h3>Campus accounts</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Account</th><th>Role</th><th>Status</th><th class="right">Action</th></tr></thead>
        <tbody>${state.users.map(u => `<tr>
          <td><strong>${esc(u.name)}</strong><br><small class="muted">${esc(u.hostel)} · joined ${shortDate(u.joined)}</small></td>
          <td>${badge(u.role)}</td>
          <td>${badge(u.status, u.status === 'Active' ? 'ok' : u.status === 'Suspended' ? 'warn' : 'blue')}</td>
          <td class="right"><button class="btn tiny ${u.status === 'Suspended' ? '' : 'ghost'}" data-act="toggle-user" data-id="${u.id}">${u.status === 'Suspended' ? 'Reactivate' : 'Suspend'}</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>
  </div>
  <section class="panel">
    <h3>Audit log</h3>
    <div class="stack">${state.audit.slice(0, 10).map(a => `<div class="activity">
      <div class="activity-icon">🛡️</div>
      <div class="activity-body"><b>${esc(a.action)}</b><span>${esc(a.actor)}</span></div>
      <div class="activity-end muted">${dateTime(a.at)}</div></div>`).join('')}</div>
  </section>`;
}
