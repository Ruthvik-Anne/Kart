import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('dialog', d => d.accept());

const text = () => page.evaluate(() => document.body.innerText);
const has = async s => (await text()).includes(s);
const waitText = (s, t = 5000) => page.waitForFunction(x => document.body.innerText.includes(x), { timeout: t }, s);
const clickText = async (label, sel = 'button, a') => {
  const ok = await page.evaluate((l, s) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().includes(l) && !e.disabled);
    if (!el) return false; el.click(); return true;
  }, label, sel);
  if (!ok) throw new Error(`no clickable "${label}"`);
};
const go = async p => { await page.goto(BASE + p, { waitUntil: 'networkidle0' }); };
const loginAs = async name => { await go('/login'); await clickText(name); await page.waitForFunction(() => !location.pathname.startsWith('/login')); await new Promise(r => setTimeout(r, 400)); };
const switchUser = async name => {
  const id = await page.evaluate(n => { const o = [...document.querySelectorAll('#demo-user option')].find(x => x.textContent === n); return o?.value; }, name);
  await page.select('#demo-user', id); await new Promise(r => setTimeout(r, 600));
  // The switch performs a real sign-in; wait until the session (and select) actually changed.
  await page.waitForFunction(x => document.querySelector('#demo-user')?.value === x, { timeout: 5000 }, id);
};
const nav = async () => page.evaluate(() => [...document.querySelectorAll('aside nav a')].map(a => a.textContent.trim()));
const setNum = async (el, v) => { await el.focus(); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.type(String(v)); };
const shot = async n => page.screenshot({ path: `${process.env.SHOT_DIR || '.'}/${n}.png` });

try {
  await go('/login');
  await waitText('POSTGRES-SEEDED');
  const groupHeadings = ['students', 'vendors', 'campus administrators', 'platform administrators'];
  const loginText = (await text()).toLowerCase();
  check('login page has a credential form and lists all four demo roles',
    ['username', 'password', 'demo accounts', ...groupHeadings].every(s => loginText.includes(s)));

  // ----- student shell & nav
  await loginAs('Alex Sharma');
  let links = await nav();
  check('student sidebar has Food & Canteen and Xerox & Print as separate items', links.some(l => l.includes('Food & Canteen')) && links.some(l => l.includes('Xerox & Print')), links.join('|'));
  check('student sees no admin or store items', !links.some(l => /Ledger|Disputes|Order queue|Console/.test(l)), links.join('|'));
  check('dashboard greets student', await has('Alex'));

  // ----- 403 guard
  await go('/admin/ledger');
  await page.waitForFunction(() => document.body.innerText.includes('403') || document.body.innerText.includes('Ledger explorer'));
  check('student blocked from /admin/ledger with 403', await has("don't have access"));

  // ----- food checkout
  await go('/food');
  await clickText('Add to cart +');
  await clickText('Cart');
  await waitText('Place order');
  await clickText('Place order');
  await waitText('Order placed').catch(() => {});
  await go('/orders');
  check('order placed and visible in My Orders', await has('Placed'));
  await go('/wallet');
  check('wallet debited via ledger statement', await has('Order KRT-') && await has('Statement'));

  // ----- xerox print job
  await go('/xerox');
  await page.type('input[placeholder^="e.g. Physics"]', 'lab-report.pdf');
  await clickText('Send print request');
  await waitText('lab-report.pdf').catch(() => {});
  check('print job appears under Your print jobs', await has('Print: lab-report.pdf'));

  // ----- task board lanes & ranking
  await go('/tasks');
  check('task board shows Urgent lane with priority chips', await has('Priority') && await has('Urgent'));
  const urgentTitles = await page.evaluate(() => [...document.querySelectorAll('article h3')].map(h => h.textContent));
  check('urgent lane lists urgent tasks from other students', urgentTitles.length >= 1, urgentTitles.join('|'));
  await clickText('Long-term', '[role=tab]');
  await new Promise(r => setTimeout(r, 300));
  check('long-term lane shows milestone tasks', await has('milestones'));

  // ----- post a normal task, then bid/accept/deliver/approve across users
  await go('/tasks/new');
  await page.type('input[placeholder="What do you need done?"]', 'E2E proofreading job');
  await page.type('textarea', 'Please proofread my essay');
  await page.$eval('input[type=number]', el => { el.value = ''; });
  const budgetInput = (await page.$$('input[type=number]'))[0];
  await setNum(budgetInput, 200);
  await clickText('Publish task');
  await page.waitForFunction(() => location.pathname.startsWith('/tasks/T-'), { timeout: 5000 });
  const taskPath = await page.evaluate(() => location.pathname);
  check('normal task published and detail page opens', await has('E2E proofreading job'), taskPath);

  await switchUser('Riya M.');
  await go(taskPath);
  await page.type('textarea', 'I can do this tonight');
  const bidInputs = await page.$$('form input[type=number]');
  await setNum(bidInputs[0], 180);
  await clickText('Submit bid');
  await waitText('Bid submitted').catch(() => {});
  check('provider bid recorded with match score', await has('Riya M. (you)') && await has('Match'));
  await go('/messages');
  check('provider has no conversation until poster engages (thread listed after bid)', await has('E2E proofreading job'));

  await switchUser('Alex Sharma');
  await go(taskPath);
  check('poster sees bid ranked with Accept & hold', await has('Accept & hold 180 KC'));
  await clickText('Accept & hold');
  await waitText('Bid accepted').catch(() => {});
  check('accepting bid moves task to assigned', await has('assigned'));

  // chat: poster -> provider
  await page.type('input[aria-label="Message"]', 'Thanks, please start now');
  await clickText('Send');
  await waitText('Thanks, please start now');
  check('poster message appears in private thread', true);

  await switchUser('Meera P.');
  await go(taskPath);
  check('uninvolved student cannot see the conversation', !(await has('Thanks, please start now')));

  await switchUser('Riya M.');
  await go(taskPath);
  check('assignee sees the poster message', await has('Thanks, please start now'));
  await clickText('Start work'); await new Promise(r => setTimeout(r, 300));
  await clickText('Submit next milestone'); await new Promise(r => setTimeout(r, 300));
  await clickText('Submit for review'); await new Promise(r => setTimeout(r, 400));
  check('assignee submitted work for review', await has('review'));

  await switchUser('Alex Sharma');
  await go(taskPath);
  await clickText('Approve & release payment');
  await waitText('completed').catch(() => {});
  check('poster approval completes the task', await has('completed'));
  await switchUser('Riya M.');
  await go('/provider');
  check('provider hub shows payout net of 5% fee (171 KC)', await has('171 KC'));

  // ----- marketplace
  await switchUser('Alex Sharma');
  await go('/marketplace');
  await clickText('Buy now');
  await new Promise(r => setTimeout(r, 300));
  await clickText('My listings & purchases', '[role=tab]');
  check('purchase reserved with escrow and release control', await has('I got it. Release payment'));
  await clickText('I got it. Release payment');
  await new Promise(r => setTimeout(r, 300));
  check('handover confirmation clears the pending purchase', await has('Nothing waiting for handover'));

  // ----- events + admin approval
  await go('/events');
  await clickText('Register');
  await new Promise(r => setTimeout(r, 300));
  await clickText('My tickets', '[role=tab]');
  check('event ticket with door code issued', await has('KRT-'));

  // ----- vendor views
  await switchUser('Campus Bites');
  links = await nav();
  check('canteen vendor sees Menu & Order queue, not Print queue or Task Board', links.some(l => l.includes('Menu')) && links.some(l => l.includes('Order queue')) && !links.some(l => /Print queue|Task Board/.test(l)), links.join('|'));
  await go('/vendor/queue');
  check('vendor sees the new student order', await has('Masala Dosa') || await has('Placed'));
  await clickText('Start preparing'); await new Promise(r => setTimeout(r, 300));
  check('vendor advances order to Preparing', await has('Preparing'));
  await go('/vendor/print-queue');
  await page.waitForFunction(() => document.body.innerText.includes('403') || document.body.innerText.includes('Print queue'));
  check('canteen vendor blocked from print queue', await has("don't have access"));

  await switchUser('Library Xerox');
  links = await nav();
  check('xerox vendor sees Print queue and Pricing', links.some(l => l.includes('Print queue')) && links.some(l => l.includes('Pricing')) && !links.some(l => l.includes('Menu')), links.join('|'));
  await go('/vendor/print-queue');
  check('xerox vendor sees the print job', await has('lab-report.pdf'));

  // ----- campus admin
  await switchUser('Dr. Rao (Campus Admin)');
  links = await nav();
  check('campus admin sees verification, vendors, events; no ledger', links.some(l => l.includes('Verification')) && links.some(l => l.includes('Vendors')) && !links.some(l => l.includes('Ledger')), links.join('|'));
  await go('/admin/verification');
  await clickText('Approve'); await new Promise(r => setTimeout(r, 300));
  check('campus admin approves a provider request', await has('Queue is clear'));
  await go('/admin/events');
  await clickText('Approve'); await new Promise(r => setTimeout(r, 300));
  check('campus admin approves a pending event', await has('Nothing waiting'));
  await go('/admin/vendors');
  await clickText('Approve'); await new Promise(r => setTimeout(r, 300));
  check('campus admin approves a vendor, creating an active store', await has('Night Owl'));

  // ----- platform admin: ledger + chain
  await switchUser('Platform Ops');
  links = await nav();
  check('platform admin sees Disputes, Ledger explorer, Audit chain', ['Disputes', 'Ledger explorer', 'Audit chain'].every(x => links.some(l => l.includes(x))), links.join('|'));
  await go('/admin/ledger');
  check('trial balance reports balanced books', await has('The books balance'));
  await go('/admin/chain');
  await clickText('Anchor new entries'); await new Promise(r => setTimeout(r, 500));
  await clickText('Verify chain against ledger'); await new Promise(r => setTimeout(r, 500));
  check('clean chain verifies', await has('Chain verified'));
  await clickText('Tamper with an entry'); await new Promise(r => setTimeout(r, 300));
  await clickText('Verify chain against ledger'); await new Promise(r => setTimeout(r, 500));
  check('tampering is detected', await has('Verification failed') && await has('modified after anchoring'));
  await shot('chain-tamper');

  // ----- mobile layout
  await switchUser('Alex Sharma');
  await page.setViewport({ width: 375, height: 800 });
  await go('/tasks');
  const sidebarHidden = await page.evaluate(() => { const r = document.querySelector('aside').getBoundingClientRect(); return r.right <= 0; });
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('mobile: sidebar collapses off-screen', sidebarHidden);
  check('mobile: no horizontal overflow on task board', noHScroll);
  await page.click('button[aria-label="Open menu"]'); await new Promise(r => setTimeout(r, 400));
  check('mobile: menu opens as a drawer', await page.evaluate(() => document.querySelector('aside').getBoundingClientRect().left >= 0));
  await shot('mobile-menu');
} catch (e) {
  check('script ran to completion', false, e.message);
  await shot('failure');
}

const real = consoleErrors.filter(e => !/favicon|Download the React DevTools/.test(e));
check('no console or page errors', real.length === 0, real.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
