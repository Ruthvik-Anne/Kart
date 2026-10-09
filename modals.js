/* KART — dialogs, command palette and shortcut help */

const field = (label, control, wide = false) => `<label class="field ${wide ? 'wide' : ''}"><span>${esc(label)}</span>${control}</label>`;
const input = (name, attrs = '') => `<input name="${name}" ${attrs} />`;
const textarea = (name, attrs = '') => `<textarea name="${name}" ${attrs}></textarea>`;
const select = (name, options, selected = '') => `<select name="${name}">${options.map(o => {
  const value = Array.isArray(o) ? o[0] : o;
  const label = Array.isArray(o) ? o[1] : o;
  return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
}).join('')}</select>`;

function modalFrame(title, body, foot = '') {
  return `<div class="overlay" data-modal-close></div>
  <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-modal-close aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>`;
}

function renderModal() {
  const { kind, id } = ui.modal;
  const data = ui.modal.data || {};

  if (kind === 'customize') {
    const p = getProduct(id);
    if (!p) return '';
    const optionBlocks = (p.options || []).map(o => field(o.name, select(`opt_${o.name}`, o.choices, data[`opt_${o.name}`] || o.choices[0]))).join('');
    return modalFrame(`Configure · ${p.name}`, `
      <p class="muted small">${esc(p.desc)}</p>
      <div class="modal-art">${p.icon}</div>
      <form id="customize-form" data-id="${p.id}" class="form-grid">
        ${optionBlocks}
        ${field('Quantity', input('qty', 'type="number" min="1" max="50" value="1" required'))}
        <div class="field wide"><span>Estimated price</span><div class="estimate" id="customize-estimate">${kc(p.price)}</div></div>
        <button class="btn wide" type="submit">Add configured item to cart</button>
      </form>`);
  }

  if (kind === 'rent') {
    const p = getProduct(id) || getListing(id);
    if (!p) return '';
    return modalFrame(`Rent · ${p.name}`, `
      <p class="muted small">${kc(p.price)} per day · ${esc(p.seller || p.vendor)}</p>
      <form id="rent-form" data-id="${p.id}" class="form-grid">
        ${field('Start date', input('start', 'type="date" required'))}
        ${field('End date', input('end', 'type="date" required'))}
        <div class="field wide"><span>Estimated total</span><div class="estimate" id="rent-estimate">Pick dates to calculate</div></div>
        <button class="btn wide" type="submit">Confirm demo rental</button>
      </form>
      <p class="footnote">Deposits and handover confirmations are outside this prototype.</p>`);
  }

  if (kind === 'event') {
    const e = getEvent(id);
    if (!e) return '';
    const mine = state.tickets.find(t => t.eventId === id);
    const left = e.seats - e.taken;
    return modalFrame(e.name, `
      <div class="modal-art">${e.icon}</div>
      <p class="muted small">${esc(e.desc)}</p>
      <div class="detail-list">
        <div class="detail-item"><span>Hosted by</span><b>${esc(e.host)}</b></div>
        <div class="detail-item"><span>When</span><b>${dateTime(e.date)} · in ${countdown(e.date)}</b></div>
        <div class="detail-item"><span>Venue</span><b>${esc(e.place)}</b></div>
        <div class="detail-item"><span>Ticket</span><b>${e.price ? kc(e.price) : 'Free'}</b></div>
        <div class="detail-item"><span>Seats</span><b>${left} of ${e.seats} left</b></div>
      </div>
      ${mine
        ? `<div class="notice ok">You hold ticket <b>${esc(mine.code)}</b>. It is in My orders with a gate check-in toggle.</div>
           <button class="btn full ghost" data-go="#/orders">View my ticket</button>`
        : left <= 0
          ? '<div class="notice warn">Sold out. Events with free tickets release returns 24 hours before the start.</div>'
          : `<button class="btn full" data-act="register" data-id="${e.id}">${e.price ? `Register · ${kc(e.price)}` : 'Register for free'}</button>`}
      <p class="footnote">Tickets are local records with a demo gate check-in.</p>`);
  }

  if (kind === 'service') {
    const s = getService(id);
    if (!s || s.mine) return '';
    return modalFrame(`Book · ${s.name}`, `
      <p class="muted small">${esc(s.desc)} · ${esc(s.provider)} · ${stars(s.rating, s.ratingCount)}</p>
      <div class="notice">Booking holds ${kc(s.price)} from your wallet until the session is completed or cancelled.</div>
      <form id="service-form" data-id="${s.id}" class="form-grid">
        ${field('Preferred date', input('date', 'type="date" required'))}
        ${field('Preferred time', input('time', 'type="time" required'))}
        ${field('What do you need?', textarea('note', 'required maxlength="350" placeholder="Briefly describe the request"'), true)}
        <button class="btn wide" type="submit">Request booking · ${kc(s.price)}</button>
      </form>`);
  }

  if (kind === 'post-task') {
    return modalFrame('Post a task', `
      <form id="task-form" class="form-grid">
        ${field('Task title', input('title', 'required maxlength="80" placeholder="What do you need done?"'), true)}
        ${field('Details', textarea('description', 'required maxlength="500" placeholder="Describe the task and how you will confirm it is done"'), true)}
        ${field('Budget in KC', input('budget', 'type="number" min="1" max="100000" placeholder="150" required'))}
        ${field('Deadline', input('deadline', 'type="datetime-local" required'))}
        ${field('Category', select('category', TASK_CATEGORIES))}
        ${field('Visibility', select('anonymous', [['public', 'Public profile'], ['anonymous', 'Anonymous to bidders']]))}
        <label class="field wide check"><input type="checkbox" name="urgent" /> Mark as urgent — shown first with a ⚡ badge</label>
        <button class="btn wide" type="submit">Publish task</button>
      </form>
      <p class="footnote">KC is only held in escrow when you accept a bid. Other students start bidding within seconds.</p>`);
  }

  if (kind === 'print') {
    const estimate = data.estimate;
    return modalFrame('New print request', `
      <div class="notice">Request details only — no file leaves your browser and nothing is sent to a printer.</div>
      <form id="print-form" class="form-grid">
        ${field('Document name', input('document', 'required maxlength="80" placeholder="e.g. Physics lab report.pdf"'), true)}
        ${field('Pages', input('pages', 'type="number" min="1" max="500" value="10" required'))}
        ${field('Copies', input('copies', 'type="number" min="1" max="20" value="1" required'))}
        ${field('Colour', select('colour', [['bw', 'Black & white (2 KC/page)'], ['colour', 'Colour (8 KC/page)']]))}
        ${field('Sides', select('sides', [['single', 'Single-sided'], ['duplex', 'Double-sided']]))}
        ${field('Binding', select('binding', [['none', 'No binding'], ['spiral', 'Spiral binding (+30 KC)']]))}
        ${field('Pickup shop', select('shop', PRINT_SHOPS))}
        <div class="field wide"><span>Live estimate</span><div class="estimate" id="print-estimate">${estimate ? kc(estimate) : '20 KC'}</div></div>
        <button class="btn wide" type="submit">Create print request</button>
      </form>`);
  }

  if (kind === 'rate') {
    const order = getOrder(id);
    if (!order) return '';
    return modalFrame(`Rate ${order.id}`, `
      <p class="muted small">${esc(order.items.map(i => i.name).join(', '))} · ${esc(order.vendor)}</p>
      <form id="rate-form" data-id="${order.id}" class="stack">
        <div class="field"><span>How was it?</span>${ratingInput('order-rating')}</div>
        ${field('Review (optional)', textarea('text', 'maxlength="240" placeholder="What stood out?"'))}
        <button class="btn full" type="submit">Submit review</button>
      </form>`);
  }

  if (kind === 'review') {
    const p = getProduct(id);
    if (!p) return '';
    const existing = (state.reviews[p.id] || []).find(r => r.user === state.profile.name);
    if (existing) return modalFrame('Edit your review', `
      <form id="review-form" data-id="${p.id}" class="stack">
        <div class="field"><span>Your rating</span>${ratingInput('review-rating')}</div>
        ${field('Your review', textarea('text', 'required maxlength="240"', ), true)}
        <button class="btn full" type="submit">Update review</button>
      </form>`);
    return modalFrame(`Review · ${p.name}`, `
      <form id="review-form" data-id="${p.id}" class="stack">
        <div class="field"><span>Your rating</span>${ratingInput('review-rating')}</div>
        ${field('Your review', textarea('text', 'required maxlength="240" placeholder="What should other students know?"'), true)}
        <button class="btn full" type="submit">Publish review</button>
      </form>`);
  }

  if (kind === 'new-listing' || kind === 'edit-listing') {
    const listing = kind === 'edit-listing' ? getListing(id) : null;
    return modalFrame(listing ? 'Edit listing' : 'Create a listing', `
      <form id="listing-form" data-id="${listing ? listing.id : ''}" class="form-grid">
        ${field('Item name', input('name', `required maxlength="70" value="${esc(listing ? listing.name : '')}"`), true)}
        ${field('Price in KC', input('price', `type="number" min="1" max="100000" required value="${listing ? listing.price : ''}"`))}
        ${field('Condition', select('condition', ['Like new', 'Good', 'Used', 'For rent'], listing ? listing.condition : 'Good'))}
        ${field('Icon', select('icon', ['📦', '📕', '🧮', '🚲', '💡', '🧥', '📷', '🔊', '🖥️', '🎽'], listing ? listing.icon : '📦'))}
        ${field('Description', textarea('desc', `required maxlength="250"`), true)}
        <button class="btn wide" type="submit">${listing ? 'Save changes' : 'Publish listing'}</button>
      </form>`);
  }

  if (kind === 'offer-service') {
    return modalFrame('Offer a student service', `
      <div class="notice">Your offer appears instantly in Student services and can earn KC when you mark it complete.</div>
      <form id="offer-service-form" class="form-grid">
        ${field('Service title', input('name', 'required maxlength="70" placeholder="e.g. Chemistry tutoring"'), true)}
        ${field('Price in KC', input('price', 'type="number" min="1" max="100000" required'))}
        ${field('Unit', select('unit', [['hour', 'Per hour'], ['project', 'Per project'], ['session', 'Per session'], ['load', 'Per load'], ['visit', 'Per visit']]))}
        ${field('What you offer', textarea('desc', 'required maxlength="250"'), true)}
        <button class="btn wide" type="submit">Publish service</button>
      </form>`);
  }

  if (kind === 'send') {
    return modalFrame('Send KC', `
      <form id="send-form" class="form-grid">
        ${field('Amount', input('amount', 'type="number" min="1" max="100000" placeholder="250" required'))}
        ${field('To', input('to', 'required maxlength="60" placeholder="Student name or handle"'))}
        ${field('Note', input('note', 'maxlength="80" placeholder="For the mess bill"', true))}
        <button class="btn wide" type="submit">Send KC</button>
      </form>
      <p class="footnote">Transfers are simulated between local demo accounts.</p>`);
  }

  if (kind === 'request') {
    return modalFrame('Request KC', `
      <form id="request-form" class="form-grid">
        ${field('Amount', input('amount', 'type="number" min="1" max="100000" placeholder="400" required'))}
        ${field('From', input('from', 'required maxlength="60" placeholder="Who owes you?"'))}
        ${field('Note', input('note', 'maxlength="80" placeholder="Split for the printout"', true))}
        <button class="btn wide" type="submit">Send request</button>
      </form>
      <p class="footnote">Settling a request simulates the incoming payment.</p>`);
  }

  if (kind === 'seller') {
    const listing = getListing(id);
    if (!listing) return '';
    return modalFrame(`Chat · ${listing.seller}`, `
      <div class="mini-card"><b>${esc(listing.name)}</b><p>${esc(listing.desc)}</p></div>
      <div class="stack chat-log" id="seller-chat">
        <div class="message"><span>Hey! Yes it is still available. I am near ${esc(listing.area || 'the main gate')} today.</span><small>${esc(listing.seller)} · ${relative(listing.at)}</small></div>
      </div>
      <form id="seller-form" data-id="${listing.id}" class="row gap">
        ${input('text', 'required maxlength="200" placeholder="Ask about condition, price, pickup…" class="grow"')}
        <button class="btn small" type="submit">Send</button>
      </form>
      <p class="footnote">Replies are simulated by the other student.</p>`);
  }

  if (kind === 'chat') {
    const meta = ui.modal.data || {};
    return modalFrame(meta.title || 'Conversation', `
      <p class="muted small">${esc(meta.subtitle || 'Demo thread with a campus partner.')}</p>
      <div class="chat-log" id="seller-chat">
        ${ui.thread.filter(m => m.mine !== false || true).map(m => `<div class="message ${m.mine ? 'mine' : ''}"><span>${esc(m.text)}</span><small>${m.mine ? 'You' : 'Them'} · ${timeOnly(m.at)}</small></div>`).join('')}
      </div>
      <form id="chat-form" class="row gap">
        ${input('text', 'required maxlength="240" placeholder="Write a message…" class="grow"')}
        <button class="btn small" type="submit">Send</button>
      </form>`);
  }

  if (kind === 'rate-booking') {
    const booking = state.bookings.find(b => b.id === id);
    if (!booking) return '';
    return modalFrame(`Rate · ${booking.name}`, `
      <p class="muted small">${esc(booking.provider)} · ${dateTime(booking.when)}</p>
      <form id="rate-booking-form" data-id="${booking.id}" class="stack">
        <div class="field"><span>How was the session?</span>${ratingInput('booking-rating')}</div>
        <button class="btn full" type="submit">Submit rating</button>
      </form>`);
  }

  if (kind === 'new-event') {
    return modalFrame('Publish an event', `
      <div class="notice">Your event appears on the campus events feed the moment you publish it.</div>
      <form id="new-event-form" class="form-grid">
        ${field('Event name', input('name', 'required maxlength="60" placeholder="Robotics Showcase"'), true)}
        ${field('Date & time', input('date', 'type="datetime-local" required'))}
        ${field('Venue', input('place', 'required maxlength="60" placeholder="Innovation Hall"'))}
        ${field('Ticket price (0 = free)', input('price', 'type="number" min="0" value="0"'))}
        ${field('Seats', input('seats', 'type="number" min="1" value="50"'))}
        ${field('Category', select('category', ['Technology', 'Design', 'Business', 'Sports', 'Culture', 'Career', 'Campus']))}
        ${field('Icon', select('icon', ['🎉', '💻', '🎨', '🎤', '🏃', '📄', '🎙️'], '🎉'))}
        ${field('Description', textarea('desc', 'required maxlength="240"'), true)}
        <button class="btn wide" type="submit">Publish event</button>
      </form>`);
  }

  if (kind === 'add-funds') {
    return modalFrame('Add demo KC', `
      <div class="notice">These are simulated credits for testing the prototype. They hold no monetary value.</div>
      <form id="add-funds-form" class="form-grid">
        ${field('Amount', input('amount', 'type="number" min="50" max="5000" value="500" required'))}
        <div class="field wide"><span>Quick amounts</span>
          <div class="card-actions">${[100, 500, 1000, 2500].map(v => `<button class="btn tiny ghost" type="button" data-act="quick-amount" data-amount="${v}">${v} KC</button>`).join('')}</div>
        </div>
        <button class="btn wide" type="submit">Add to wallet</button>
      </form>`);
  }

  return '';
}

/* ---------- command palette ---------- */

const PALETTE_ITEMS = () => ([
  ['Go to dashboard', '#/home', '⌂'],
  ['Explore marketplace', '#/explore', '⌕'],
  ['Open cart', '#/checkout', '🛒'],
  ['My orders', '#/orders', '◫'],
  ['KC wallet', '#/wallet', '◉'],
  ['Task marketplace', '#/tasks', '⚡'],
  ['Campus events', '#/events', '🎟️'],
  ['Student services', '#/services', '✦'],
  ['Buy / sell / rent', '#/resale', '⇄'],
  ['Wishlist', '#/wishlist', '♡'],
  ['Workspace console', '#/workspace', '▤'],
  ['Profile & settings', '#/profile', '☰'],
  ['Post a task', 'act:post-task', '⚡'],
  ['New print request', 'act:print', '🖨️'],
  ['Create a listing', 'act:new-listing', '📦'],
  ['Offer a service', 'act:offer-service', '✨'],
  ['Send KC to a student', 'act:send', '⇢'],
  ['Add demo KC', 'act:add-funds', '＋'],
  ['Switch theme', 'act:theme', '◐'],
  ['Reset demo data', 'act:reset', '↺']
]);

function paletteView() {
  return `<div class="overlay" data-palette-close></div>
  <div class="palette" role="dialog" aria-label="Command palette">
    <div class="palette-input"><span>⌘</span><input id="palette-input" placeholder="Type a command or page…" autocomplete="off" /><kbd>esc</kbd></div>
    <div class="palette-list" id="palette-list">
      ${PALETTE_ITEMS().map(([label, target, icon]) => `<button class="palette-item" data-target="${esc(target)}"><span>${icon}</span>${esc(label)}</button>`).join('')}
      <div class="palette-empty" hidden>No matching command</div>
    </div>
  </div>`;
}

function helpView() {
  const rows = [
    ['/', 'Focus search'],
    ['⌘ / Ctrl + K', 'Command palette'],
    ['G then H', 'Dashboard'],
    ['G then E', 'Explore'],
    ['G then O', 'Orders'],
    ['G then W', 'Wallet'],
    ['G then T', 'Tasks'],
    ['C', 'Open cart'],
    ['Esc', 'Close dialog or panel'],
    ['?', 'This help']
  ];
  return `<div class="overlay" data-help-close></div>
  <div class="modal small" role="dialog" aria-label="Keyboard shortcuts">
    <div class="modal-head"><h2>Keyboard shortcuts</h2><button class="icon-btn" data-help-close aria-label="Close">×</button></div>
    <div class="modal-body">
      <div class="shortcut-list">${rows.map(([key, label]) => `<div class="shortcut"><kbd>${esc(key)}</kbd><span>${esc(label)}</span></div>`).join('')}</div>
    </div>
  </div>`;
}
