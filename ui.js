/* KART — formatting helpers, shared components, app shell, drawers, modals */

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kc = n => `${Math.round(Number(n || 0)).toLocaleString('en-IN')} KC`;
const shortDate = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
const dateTime = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
const timeOnly = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); };
const relative = iso => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (Number.isNaN(mins)) return '—';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
const countdown = iso => {
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return '—';
  if (diff <= 0) return 'happening now';
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
};
const iconFor = type => ({ food: '🍽️', xerox: '🖨️', stationery: '📐', tasks: '⚡', resale: '🔄', events: '🎟️', merch: '👕', services: '✨' }[type] || '🛍️');
const money = n => `${Number(n || 0).toLocaleString('en-IN')}`;

function toast(message, kind = 'ok') {
  const old = $('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="toast-dot"></span>${esc(message)}`;
  document.body.append(el);
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.remove(), 3400);
}

function copyText(text) {
  const value = String(text || '');
  if (!value) return false;
  const done = () => toast(`Code ${value} copied`, 'ok');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done, () => fallbackCopy(value, done));
      return true;
    }
  } catch { /* fall through */ }
  fallbackCopy(value, done);
  return true;
}

function fallbackCopy(value, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch { toast('Copying is not available in this browser.', 'warn'); }
}

function applyTheme(theme) {
  const resolved = theme === 'system'
    ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = resolved;
}

/* ---------- small components ---------- */

const stars = (rating, count = null) => `<span class="stars" title="${Number(rating || 0)} out of 5">${'★'.repeat(Math.round(Number(rating) || 0))}${'★'.repeat(5 - Math.round(Number(rating) || 0)).replace(/★/g, '<i>★</i>')}</span>${count ? `<span class="rating-count">${count}</span>` : ''}`;

const badge = (label, kind = '') => `<span class="badge ${kind}">${esc(label)}</span>`;

function sectionTitle(title, link = '', linkLabel = 'See all →') {
  return `<div class="section-title"><h2>${esc(title)}</h2>${link ? `<a class="text-link" data-go="${esc(link)}">${esc(linkLabel)}</a>` : ''}</div>`;
}

function statCard(label, value, sub = '') {
  return `<div class="stat"><span>${esc(label)}</span><strong>${value}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

function emptyState(icon, title, body, action = '') {
  return `<div class="empty"><div class="empty-icon">${icon}</div><strong>${esc(title)}</strong><p>${esc(body)}</p>${action}</div>`;
}

function progressTrack(percent) {
  return `<div class="track"><div class="track-fill" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div>`;
}

function timeline(order) {
  const { steps, at, percent } = orderProgress(order);
  return `<ol class="timeline">${steps.map((step, index) => {
    const entry = order.timeline.find(t => t.status === step);
    const done = index <= at && order.status !== 'Cancelled';
    return `<li class="${done ? 'done' : ''} ${index === at ? 'current' : ''}">
      <span class="timeline-dot"></span>
      <b>${esc(step)}</b>
      <small>${entry ? (entry.at.includes('T') ? dateTime(entry.at) : esc(entry.at)) : 'pending'}</small>
    </li>`;
  }).join('')}</ol>${progressTrack(percent)}`;
}

function ratingInput(name = 'rating') {
  return `<div class="rating-input">${[5, 4, 3, 2, 1].map(n => `
    <input type="radio" id="${name}-${n}" name="${name}" value="${n}" ${n === 5 ? 'checked' : ''} />
    <label for="${name}-${n}" title="${n} stars">★</label>`).join('')}</div>`;
}

/* ---------- cards ---------- */

function productCard(p, context = 'explore') {
  const wished = state.wishlist.includes(p.id);
  const out = !p.stock;
  const rating = productRating(p);
  const reviewCount = (state.reviews[p.id] || []).length + (p.ratingCount || 0);
  return `<article class="card product-card ${out ? 'is-out' : ''}" data-go="#/product/${p.id}" tabindex="0" role="link" aria-label="${esc(p.name)}">
    <div class="card-art">
      <span class="card-emoji">${p.icon}</span>
      ${p.tag ? `<span class="chip chip-tag">${esc(p.tag)}</span>` : ''}
      <button class="heart ${wished ? 'on' : ''}" data-act="wish" data-id="${p.id}" aria-label="Save to wishlist">${wished ? '♥' : '♡'}</button>
      ${out ? '<span class="chip chip-out">Out of stock</span>' : ''}
    </div>
    <div class="card-body">
      <div class="card-eyebrow">${esc(p.vendor || 'Campus')} · ${p.eta ? `${p.eta} min` : esc(p.area || '')}</div>
      <h3>${esc(p.name)}</h3>
      <p class="card-desc">${esc(p.desc)}</p>
      <div class="card-meta">${stars(rating, reviewCount)}</div>
      <div class="card-foot">
        <div class="price">${kc(p.price)}${p.mrp && p.mrp > p.price ? `<s>${kc(p.mrp)}</s>` : ''}</div>
        ${context === 'wishlist'
          ? `<div class="card-actions"><button class="btn tiny ghost" data-act="wish" data-id="${p.id}">Remove</button><button class="btn tiny" data-act="add" data-id="${p.id}">Move to cart</button></div>`
          : out
            ? `<button class="btn tiny ghost" disabled>Sold out</button>`
            : `<div class="card-actions">
                <button class="btn tiny ghost" data-act="quick" data-id="${p.id}">＋</button>
                <button class="btn tiny" data-act="add" data-id="${p.id}">${p.options?.length ? 'Options' : p.rental ? 'Rent' : 'Add'}</button>
              </div>`}
      </div>
    </div>
  </article>`;
}

function eventCard(e) {
  const left = e.seats - e.taken;
  const mine = state.tickets.some(t => t.eventId === e.id);
  return `<article class="card event-card" data-go="#/events" data-act="event" data-id="${e.id}" tabindex="0" role="button" aria-label="${esc(e.name)}">
    <div class="card-art event-art">
      <span class="card-emoji">${e.icon}</span>
      <span class="chip chip-tag">${esc(e.category)}</span>
      ${mine ? '<span class="chip chip-out">Your ticket</span>' : ''}
    </div>
    <div class="card-body">
      <div class="card-eyebrow">${esc(e.host)} · ${shortDate(e.date)} · ${timeOnly(e.date)}</div>
      <h3>${esc(e.name)}</h3>
      <p class="card-desc">${esc(e.desc)}</p>
      <div class="card-meta"><span class="badge ${left <= 10 ? 'warn' : ''}">${left <= 0 ? 'Sold out' : `${left} seats left`}</span>${badge(`Starts in ${countdown(e.date)}`)}</div>
      <div class="card-foot">
        <div class="price">${e.price ? kc(e.price) : 'Free'}</div>
        <div class="card-actions">
          ${mine ? '<button class="btn tiny ghost" data-go="#/orders">View ticket</button>' : ''}
          <button class="btn tiny" data-act="event" data-id="${e.id}">${left <= 0 ? 'Join waitlist' : 'Details'}</button>
        </div>
      </div>
    </div>
  </article>`;
}

function serviceCard(s) {
  const mine = !!s.mine;
  const booked = state.bookings.find(b => b.serviceId === s.id && b.status !== 'Cancelled');
  return `<article class="card service-card ${mine ? 'is-mine' : ''}">
    <div class="card-art"><span class="card-emoji">${s.icon}</span><span class="chip chip-tag">${esc((s.tags && s.tags[0]) || 'Peer skill')}</span></div>
    <div class="card-body">
      <div class="card-eyebrow">${esc(s.provider)} · ${stars(s.rating || 5, s.ratingCount || 0)}</div>
      <h3>${esc(s.name)}</h3>
      <p class="card-desc">${esc(s.desc)}</p>
      <div class="card-foot">
        <div class="price">${kc(s.price)}<small class="muted"> / ${esc(s.unit)}</small></div>
        <div class="card-actions">
          ${mine
            ? `<button class="btn tiny ghost" data-act="remove-service" data-id="${s.id}">Remove</button><button class="btn tiny" data-act="complete-service" data-id="${s.id}">Mark done · earn</button>`
            : booked
              ? `<button class="btn tiny ghost" data-go="#/services">Booked</button>`
              : `<button class="btn tiny" data-act="service" data-id="${s.id}">Book</button>`}
        </div>
      </div>
    </div>
  </article>`;
}

function listingCard(l) {
  const mine = l.seller === 'You';
  return `<article class="card listing-card ${l.status === 'sold' ? 'is-out' : ''}">
    <div class="card-art"><span class="card-emoji">${l.icon}</span><span class="chip chip-tag">${esc(l.condition)}</span>${l.status === 'sold' ? '<span class="chip chip-out">Sold</span>' : ''}</div>
    <div class="card-body">
      <div class="card-eyebrow">${esc(l.seller)} · ${relative(l.at)}</div>
      <h3>${esc(l.name)}</h3>
      <p class="card-desc">${esc(l.desc)}</p>
      <div class="card-meta">${badge(l.area || 'Main Campus')}</div>
      <div class="card-foot">
        <div class="price">${kc(l.price)}${l.rental ? '<small class="muted"> / day</small>' : ''}</div>
        <div class="card-actions">
          ${mine
            ? `<button class="btn tiny ghost" data-act="delist" data-id="${l.id}">Delete</button><button class="btn tiny" data-act="sold" data-id="${l.id}">${l.status === 'sold' ? 'Relist' : 'Mark sold'}</button>`
            : l.status === 'sold'
              ? '<button class="btn tiny ghost" disabled>Sold</button>'
              : `<button class="btn tiny ghost" data-act="message-seller" data-id="${l.id}">Chat</button><button class="btn tiny" data-act="buy-listing" data-id="${l.id}">Buy</button>`}
        </div>
      </div>
    </div>
  </article>`;
}

function taskCard(t) {
  const mine = t.poster === 'You';
  const myBid = t.bids.find(b => b.worker === 'You');
  const kind = t.urgent ? 'warn' : t.status === 'Open' ? 'blue' : '';
  const mineBid = t.status === 'Assigned' && t.worker === 'You';
  return `<article class="card task-card ${t.urgent ? 'urgent' : ''}">
    <div class="task-head">
      <div class="task-tags">${badge(t.urgent ? '⚡ Urgent' : t.category, kind)}${badge(t.status, t.status === 'Cancelled' ? 'warn' : t.status === 'Completed' ? 'ok' : 'blue')}</div>
      <button class="btn tiny ghost" data-go="#/task/${t.id}">Open →</button>
    </div>
    <h3>${esc(t.title)}</h3>
    <p class="card-desc">${esc(t.description)}</p>
    <div class="task-meta">
      <span>◷ ${countdown(t.deadline)} left</span>
      <span>♙ ${esc(mine ? (t.anonymous ? 'You (anonymous)' : 'You') : t.poster)}</span>
      <span>◇ ${t.bids.length} bid${t.bids.length === 1 ? '' : 's'}</span>
      ${myBid ? `<span class="mine">Your bid ${kc(myBid.amount)}</span>` : ''}
    </div>
    <div class="task-foot">
      <strong>${kc(t.budget)}</strong>
      <div class="card-actions">
        ${mine && t.status === 'Open' ? `<button class="btn tiny" data-go="#/task/${t.id}">Review bids</button>` : ''}
        ${mineBid ? `<button class="btn tiny" data-act="submit-work" data-id="${t.id}">Submit work</button>` : ''}
        ${!mine && t.status === 'Open' && !myBid ? `<button class="btn tiny" data-go="#/task/${t.id}">Bid now</button>` : ''}
        ${!mine && t.status === 'Open' && myBid ? `<button class="btn tiny ghost" data-go="#/task/${t.id}">Manage bid</button>` : ''}
        ${mineBid ? `<button class="btn tiny ghost" data-go="#/task/${t.id}">Open thread</button>` : ''}
      </div>
    </div>
  </article>`;
}

function orderCard(o) {
  const cancelled = o.status === 'Cancelled';
  const ready = o.status === 'Ready for pickup';
  const done = o.status === 'Picked up';
  return `<article class="card order-card ${cancelled ? 'is-out' : ''}">
    <div class="order-top">
      <div class="order-icons">${o.items.slice(0, 3).map(i => `<span>${i.icon || iconFor(i.type)}</span>`).join('')}</div>
      <div class="order-head">
        <div class="card-eyebrow">${esc(o.id)} · ${relative(o.created)}</div>
        <h3>${esc(o.items.map(i => i.name).join(', '))}</h3>
        <p class="card-desc">${esc(o.vendor)} · ${esc(o.fulfil.mode)} · ${esc(o.payment)}</p>
      </div>
      <div class="order-price">${kc(o.total)}${o.rating ? ` <span class="stars">★</span>` : ''}</div>
    </div>
    <div class="order-status">
      ${badge(cancelled ? 'Cancelled' : ready ? 'Ready for pickup' : done ? 'Picked up' : o.status, cancelled ? 'warn' : ready ? 'ok' : 'blue')}
      ${!cancelled ? progressTrack(orderProgress(o).percent) : ''}
    </div>
    ${o.handoverCode && !cancelled ? qrPassPanel(o, { compact: true }) : ''}
    <div class="card-actions spread">
      <button class="btn tiny ghost" data-go="#/order/${o.id}">Track order</button>
      <div class="card-actions">
        ${!cancelled && !done ? `<button class="btn tiny ghost" data-act="cancel-order" data-id="${o.id}">Cancel</button>` : ''}
        ${done && !o.rating ? `<button class="btn tiny ghost" data-act="rate" data-id="${o.id}">Rate</button>` : ''}
        <button class="btn tiny" data-act="reorder" data-id="${o.id}">Reorder</button>
      </div>
    </div>
  </article>`;
}

/* ---------- shell ---------- */

const NAV_MAIN = [
  ['home', '▦', 'Dashboard'],
  ['explore', '⌕', 'Explore'],
  ['tasks', '⚡', 'Tasks'],
  ['orders', '◫', 'My orders'],
  ['wallet', '◉', 'KC wallet']
];
const NAV_MORE = [
  ['events', '◇', 'Events'],
  ['services', '✦', 'Student services'],
  ['resale', '⇄', 'Buy / sell / rent'],
  ['wishlist', '♡', 'Wishlist']
];
const NAV_ACCOUNT = [
  ['notifications', '🔔', 'Notifications'],
  ['workspace', '▤', 'Workspace'],
  ['profile', '☰', 'Profile & settings']
];

function navLink([id, icon, label]) {
  const active = route.name === id || (id === 'orders' && route.name === 'order') || (id === 'tasks' && route.name === 'task') || (id === 'explore' && route.name === 'product');
  let count = '';
  if (id === 'tasks') count = String(state.tasks.filter(t => t.status === 'Open').length);
  if (id === 'orders') count = String(state.orders.filter(o => !['Picked up', 'Cancelled'].includes(o.status)).length);
  if (id === 'wishlist') count = String(state.wishlist.length);
  if (id === 'notifications' && unreadCount()) count = String(unreadCount());
  return `<button class="nav-link ${active ? 'active' : ''}" data-go="#/${id}"><span class="nav-icon">${icon}</span><span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</button>`;
}

function sidebar() {
  const openTasks = state.tasks.filter(t => t.status === 'Open').length;
  return `<aside class="sidebar ${ui.menu ? 'open' : ''}">
    <button class="brand" data-go="#/home">
      <span class="brand-mark">K</span>
      <span class="brand-text">KART<small>CAMPUS, CONNECTED</small></span>
    </button>
    <nav class="nav-scroll">
      <div class="nav-group"><div class="nav-caption">Campus</div>${NAV_MAIN.map(navLink).join('')}</div>
      <div class="nav-group"><div class="nav-caption">More for you</div>${NAV_MORE.map(navLink).join('')}</div>
      <div class="nav-group"><div class="nav-caption">You</div>${NAV_ACCOUNT.map(navLink).join('')}</div>
    </nav>
    <div class="side-bottom">
      <button class="campus-card" data-go="#/tasks">
        <strong>⚡ ${openTasks} open tasks</strong>
        <p>Students near ${esc(state.area)} are earning KC right now. See what you can pick up →</p>
      </button>
      <button class="side-profile" data-go="#/profile">
        <span class="avatar">${esc(state.profile.initials)}</span>
        <span class="side-profile-text"><b>${esc(state.profile.name)}</b><small>${esc(state.role)} · ${esc(state.area)}</small></span>
        <span class="side-chevron">›</span>
      </button>
    </div>
  </aside>
  ${ui.menu ? '<div class="side-scrim" data-act="close-menu"></div>' : ''}`;
}

function suggestions() {
  const q = ui.query.trim().toLowerCase();
  if (!q) return '';
  const products = state.products.filter(p => `${p.name} ${p.vendor}`.toLowerCase().includes(q)).slice(0, 4);
  const tasks = state.tasks.filter(t => `${t.title}`.toLowerCase().includes(q) && t.status === 'Open').slice(0, 2);
  const events = state.events.filter(e => `${e.name} ${e.host}`.toLowerCase().includes(q)).slice(0, 2);
  const rows = [
    ...products.map(p => `<button class="suggestion" data-go="#/product/${p.id}"><span>${p.icon}</span><div><b>${esc(p.name)}</b><small>${esc(p.vendor)} · ${kc(p.price)}</small></div></button>`),
    ...events.map(e => `<button class="suggestion" data-act="event" data-id="${e.id}"><span>${e.icon}</span><div><b>${esc(e.name)}</b><small>${esc(e.host)} · ${shortDate(e.date)}</small></div></button>`),
    ...tasks.map(t => `<button class="suggestion" data-go="#/task/${t.id}"><span>⚡</span><div><b>${esc(t.title)}</b><small>${kc(t.budget)} · ${t.bids.length} bids</small></div></button>`)
  ];
  if (!rows.length) return `<div class="suggestion empty-sug">No matches for “${esc(ui.query)}”</div>`;
  return `${rows.join('')}<button class="suggestion see-all" data-act="search-all">See all results for “${esc(ui.query)}” →</button>`;
}

function topbar() {
  const theme = state.settings.theme;
  return `<header class="topbar">
    <button class="icon-btn mobile-menu" data-act="menu" aria-label="Open menu">☰</button>
    <div class="search-wrap ${ui.searchOpen ? 'open' : ''}">
      <span class="search-icon">⌕</span>
      <input id="global-search" autocomplete="off" placeholder="Search food, tasks, events, services…" value="${esc(ui.query)}" aria-label="Search KART" />
      ${ui.query ? '<button class="search-clear" data-act="clear-search" aria-label="Clear search">×</button>' : ''}
      <kbd class="search-kbd">/</kbd>
      ${ui.searchOpen && ui.query ? `<div class="suggestions">${suggestions()}</div>` : ''}
    </div>
    <div class="top-actions">
      <button class="pill area-pill" data-act="area">📍 ${esc(state.area)}</button>
      <button class="pill wallet-pill" data-go="#/wallet">◉ ${money(state.balance)}<span class="pill-unit">KC</span></button>
      <button class="icon-btn" data-act="theme" aria-label="Toggle theme" title="Toggle theme">${theme === 'dark' ? '☀' : '☾'}</button>
      <button class="icon-btn has-dot" data-drawer="notifications" aria-label="Notifications">🔔${unreadCount() ? `<sup>${unreadCount()}</sup>` : ''}</button>
      <button class="icon-btn cart-btn" data-drawer="cart" aria-label="Open cart">🛒${state.cart.length ? `<sup>${state.cart.length}</sup>` : ''}</button>
      <div class="avatar-btn" data-act="account" role="button" tabindex="0" aria-label="Account menu">${esc(state.profile.initials)}<span class="pop">${accountPop()}</span></div>
    </div>
  </header>`;
}

function accountPop() {
  return `<div class="pop-card" onclick="event.stopPropagation()">
    <div class="pop-head"><b>${esc(state.profile.name)}</b><small>${esc(state.profile.email)}</small></div>
    <button data-go="#/profile">☰ Profile & settings</button>
    <button data-go="#/wallet">◉ Wallet · ${money(state.balance)} KC</button>
    <button data-act="palette">⌘ Command palette</button>
    <button data-act="help">? Keyboard shortcuts</button>
    <button data-act="theme">◐ Switch to ${state.settings.theme === 'dark' ? 'light' : 'dark'} theme</button>
    <button class="danger" data-act="reset">↺ Reset demo data</button>
  </div>`;
}

function cartDrawer() {
  const lines = cartLines();
  const totals = cartTotals(lines);
  return `<div class="overlay" data-drawer-close></div>
  <aside class="drawer" role="dialog" aria-label="Cart">
    <div class="drawer-head"><h2>Your cart <span class="badge">${lines.length}</span></h2><button class="icon-btn" data-drawer-close aria-label="Close">×</button></div>
    <div class="drawer-body">
      ${lines.length ? lines.map((line, index) => `
        <div class="cart-line">
          <span class="cart-art">${line.product.icon}</span>
          <div class="cart-info">
            <b>${esc(line.product.name)}</b>
            <small>${esc(line.product.vendor)}${line.variant ? ` · ${esc(line.variant)}` : ''}</small>
            <div class="qty">
              <button data-act="qty" data-index="${index}" data-delta="-1" aria-label="Decrease">−</button>
              <span>${line.qty}</span>
              <button data-act="qty" data-index="${index}" data-delta="1" aria-label="Increase" ${line.qty >= line.product.stock ? 'disabled' : ''}>＋</button>
            </div>
          </div>
          <div class="cart-end">
            <b>${kc(line.product.price * line.qty)}</b>
            <button class="link-btn" data-act="remove-cart" data-index="${index}">Remove</button>
          </div>
        </div>`).join('') : emptyState('🛒', 'Your cart is empty', 'Explore campus picks and add something you like.', '<button class="btn" data-go="#/explore">Browse marketplace</button>')}
      ${lines.length ? `
        <div class="promo-row">
          <input id="promo-input" placeholder="Promo code (try KART10)" value="${state.promo ? esc(state.promo) : ''}" />
          <button class="btn tiny ghost" data-act="promo">Apply</button>
        </div>
        <dl class="totals">
          <div><dt>Subtotal</dt><dd>${kc(totals.subtotal)}</dd></div>
          ${totals.discount ? `<div class="plus"><dt>Discount (${esc(state.promo)})</dt><dd>−${kc(totals.discount)}</dd></div>` : ''}
          <div><dt>Service fee</dt><dd>${totals.fee ? kc(totals.fee) : 'Free'}</dd></div>
          <div class="grand"><dt>Total</dt><dd>${kc(totals.total)}</dd></div>
        </dl>` : ''}
    </div>
    ${lines.length ? `<div class="drawer-foot">
      <button class="btn ghost full" data-act="clear-cart">Clear cart</button>
      <button class="btn full" data-go="#/checkout">Checkout · ${kc(totals.total)} →</button>
    </div>` : ''}
  </aside>`;
}

function notificationsDrawer() {
  const list = state.notifications;
  return `<div class="overlay" data-drawer-close></div>
  <aside class="drawer" role="dialog" aria-label="Notifications">
    <div class="drawer-head"><h2>Notifications ${unreadCount() ? `<span class="badge warn">${unreadCount()} new</span>` : ''}</h2>
      <div class="row">${list.some(n => !n.read) ? '<button class="btn tiny ghost" data-act="read-all">Mark all read</button>' : ''}<button class="icon-btn" data-drawer-close aria-label="Close">×</button></div></div>
    <div class="drawer-body">
      ${list.length ? list.map(n => `
        <button class="notif ${n.read ? '' : 'unread'}" data-act="open-notif" data-id="${n.id}">
          <span class="notif-icon">${iconFor(n.type) || '🔔'}</span>
          <span class="notif-body"><b>${esc(n.title)}</b><small>${esc(n.body)}</small><time>${relative(n.at)}</time></span>
        </button>`).join('') : emptyState('🔔', 'All caught up', 'Order updates, bids and ticket alerts appear here.')}
    </div>
  </aside>`;
}

function areaDrawer() {
  return `<div class="overlay" data-drawer-close></div>
  <aside class="drawer" role="dialog" aria-label="Campus area">
    <div class="drawer-head"><h2>Campus area</h2><button class="icon-btn" data-drawer-close aria-label="Close">×</button></div>
    <div class="drawer-body">
      <p class="muted" style="font-size:12px">Delivery windows and pickup points are grouped by area.</p>
      ${CAMPUS_AREAS.map(area => `<button class="area-option ${area === state.area ? 'on' : ''}" data-act="set-area" data-area="${esc(area)}">
        <span>📍 ${esc(area)}</span><small>${state.products.filter(p => p.area === area).length} vendors · ${state.events.filter(e => e.place.includes(area.split(' ')[0])).length} events</small>
      </button>`).join('')}
    </div>
  </aside>`;
}

function drawerView() {
  if (ui.drawer === 'cart') return cartDrawer();
  if (ui.drawer === 'notifications') return notificationsDrawer();
  if (ui.drawer === 'area') return areaDrawer();
  return '';
}

/* ---------- shell ---------- */

function shell(content) {
  return `<div class="app">
    ${sidebar()}
    <main class="main">
      ${topbar()}
      <div class="content" id="content">${content}</div>
    </main>
  </div>
  ${drawerView()}
  ${ui.modal ? renderModal() : ''}
  ${ui.palette ? paletteView() : ''}
  ${ui.help ? helpView() : ''}`;
}
