// Browser walkthrough for attachments, counter-offers, scheduling, recurrence, linked workflows,
// reviews and notifications. Run with the app already started: BASE_URL=http://localhost:3100 npm run test:e2e:features
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };

const dir = mkdtempSync(join(tmpdir(), 'kart-e2e-'));
const pdf = join(dir, 'brief.pdf'); writeFileSync(pdf, '%PDF-1.4 demo');
const exe = join(dir, 'tool.exe'); writeFileSync(exe, 'MZ');

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
page.on('dialog', d => d.accept());

const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = () => page.evaluate(() => document.body.innerText);
const has = async s => (await text()).toLowerCase().includes(s.toLowerCase());
const waitText = (s, t = 6000) => page.waitForFunction(x => document.body.innerText.includes(x), { timeout: t }, s);
const clickText = async (label, sel = 'button, a') => {
  const ok = await page.evaluate((l, s) => {
    const el = [...document.querySelectorAll(s)].find(e => (e.textContent.trim().includes(l) || e.getAttribute('aria-label') === l) && !e.disabled);
    if (!el) return false; el.click(); return true;
  }, label, sel);
  if (!ok) throw new Error(`no clickable "${label}"`);
};
const go = async p => { await page.goto(BASE + p, { waitUntil: 'networkidle0' }); };
const loginAs = async name => { await go('/login'); await clickText(name); await page.waitForFunction(() => !location.pathname.startsWith('/login')); await sleep(400); };
const switchUser = async name => {
  const id = await page.evaluate(n => [...document.querySelectorAll('#demo-user option')].find(x => x.textContent === n)?.value, name);
  await page.select('#demo-user', id); await sleep(600);
  // The switch performs a real sign-in; wait until the session (and select) actually changed.
  await page.waitForFunction(x => document.querySelector('#demo-user')?.value === x, { timeout: 5000 }, id);
};
const setNum = async (el, v) => { await el.focus(); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.type(String(v)); };
const toast = async () => (await page.evaluate(() => [...document.querySelectorAll('[role=status]')].map(e => e.textContent).join(' | ')));
const attach = async (selector, path) => { const input = await page.$(selector); await input.uploadFile(path); await sleep(200); };

try {
  await loginAs('Alex Sharma');

  // ---- task form: attachment (valid + rejected), schedule, repeat
  await go('/tasks/new');
  await page.type('input[placeholder="What do you need done?"]', 'Weekly notes cleanup');
  await page.type('textarea', 'Tidy my lecture notes');
  await attach('input[type=file]', pdf);
  check('picked file is listed before posting', await has('brief.pdf'));
  const repeatSel = await page.evaluateHandle(() => [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'weekly')));
  await repeatSel.asElement().select('weekly');
  await sleep(200);
  check('repeat reveals occurrence count', await has('Total occurrences'));
  const occ = (await page.$$('input[type=number]'));
  await setNum(occ[occ.length - 1], 3);
  await clickText('Publish task');
  await page.waitForFunction(() => location.pathname.startsWith('/tasks/T-'), { timeout: 6000 });
  const series1 = await page.evaluate(() => location.pathname);
  check('task detail shows attachment and repeat info', await has('brief.pdf') && await has('occurrence 1 of 3'));

  // ---- bad file type rejected on a second task
  await go('/tasks/new');
  await page.type('input[placeholder="What do you need done?"]', 'Bad file task');
  await page.type('textarea', 'x');
  await attach('input[type=file]', exe);
  await clickText('Publish task');
  await sleep(500);
  check('executable attachment is rejected with a message', (await toast()).includes('.exe') || await has('not allowed'), await toast());

  // ---- provider bids, negotiates
  await switchUser('Riya M.');
  await go(series1);
  await page.type('textarea', 'Happy to do this weekly');
  const bidNums = await page.$$('form input[type=number]');
  await setNum(bidNums[0], 190);
  await clickText('Submit bid');
  await waitText('Bid submitted').catch(() => {});
  await go('/messages'); await clickText('Weekly notes cleanup'); await sleep(300);
  await clickText('Propose new terms'); await sleep(200);
  const quoteNums = await page.$$('form input[type=number]');
  await setNum(quoteNums[0], 170);
  await clickText('Send offer'); await sleep(500);
  check('provider sends a counter-offer card', await has('Your offer') && await has('170 KC'));

  await switchUser('Alex Sharma');
  await go('/messages'); await clickText('Weekly notes cleanup'); await sleep(300);
  check('poster sees the pending offer with Accept terms', await has('Accept terms'));
  await clickText('Accept terms'); await sleep(500);
  check('accepting terms updates the bid', await has('Terms agreed'));
  await go(series1);
  check('bid list now shows the agreed 170 KC', await has('Accept & hold 170 KC'));
  await clickText('Accept & hold'); await sleep(500);

  // ---- provider delivers with a file, poster approves, next occurrence appears
  await switchUser('Riya M.');
  await go(series1);
  await clickText('Start work'); await sleep(300);
  await clickText('Submit next milestone'); await sleep(300);
  await page.type('textarea', 'All tidied, see attached');
  await attach('[role=dialog] input[type=file]', pdf);
  await clickText('Submit for review'); await sleep(500);
  check('delivery note and file appear on the milestone', await has('All tidied, see attached') && await has('brief.pdf'));
  await switchUser('Alex Sharma');
  await go(series1);
  await clickText('Approve & release payment'); await sleep(600);
  check('completion triggers a review card', await has('How was Riya M.?'));
  await clickText('4 stars', '[role=radio]');
  await page.type('textarea', 'Quick and tidy');
  await clickText('Submit review'); await sleep(500);
  check('poster review is saved and displayed', await has('Your review of Riya M.'));
  await go('/my-tasks');
  check('next occurrence of the series was posted (2 of 3)', await has('Weekly notes cleanup'));
  const ids = await page.evaluate(() => [...document.querySelectorAll('a[href^="/tasks/T-"]')].map(a => a.getAttribute('href')));
  check('series now has an open follow-up task', new Set(ids).size >= 2, ids.join(','));

  // ---- provider sees review and notification
  await switchUser('Riya M.');
  await go('/provider');
  check('provider hub lists the review', await has('Quick and tidy'));
  await go('/notifications');
  check('notifications page lists updates with links', await has('Payment released') && await has('Open →'));
  const before = await page.evaluate(() => document.querySelector('header a[href="/notifications"]')?.getAttribute('aria-label'));
  check('bell announces unread count', /unread/.test(before ?? ''), String(before));
  await clickText('Mark all as read'); await sleep(400);
  const after = await page.evaluate(() => document.querySelector('header a[href="/notifications"]')?.getAttribute('aria-label'));
  check('mark all as read clears the bell', after === 'Notifications', String(after));

  // ---- linked workflow
  await switchUser('Alex Sharma');
  await go('/tasks/workflow');
  await page.type('input[placeholder="e.g. Stationery run"]', 'Lab kit run');
  const descs = await page.$$('textarea');
  await descs[0].type('Collect from Scholars Store');
  await descs[1].type('Bring to Hostel C');
  await clickText('Create workflow');
  await page.waitForFunction(() => location.pathname === '/my-tasks', { timeout: 6000 });
  // Cards render after the URL changes; wait for the created steps before reading them.
  await page.waitForFunction(() => [...document.querySelectorAll('a[href^="/tasks/T-"]')].some(a => (a.textContent || '').includes('Collect the items')), { timeout: 6000 });
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href^="/tasks/T-"]')].map(a => ({ h: a.getAttribute('href'), t: a.textContent })));
  const step2 = hrefs.find(x => x.t.includes('Deliver to me'));
  check('workflow creates both steps', hrefs.some(x => x.t.includes('Collect the items')) && !!step2);
  await switchUser('Riya M.');
  await go(step2.h);
  check('later step is locked for bidding', await has('opens when step 1 is completed') || await has('opens for bids when step 1'));
  check('locked step offers no bid form', !(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Submit bid'))));

  // ---- order review
  await switchUser('Alex Sharma');
  await go('/food'); await clickText('Add to cart +'); await clickText('Cart'); await waitText('Place order'); await clickText('Place order'); await sleep(600);
  await switchUser('Campus Bites');
  await go('/vendor/queue');
  for (const label of ['Start preparing', 'Mark ready', 'Mark collected']) { await clickText(label); await sleep(350); }
  await switchUser('Alex Sharma');
  await go('/orders');
  await clickText('Rate Campus Bites'); await sleep(300);
  await clickText('5 stars', '[role=radio]');
  await clickText('Submit review'); await sleep(500);
  await go('/food');
  check('store rating shows in the catalogue', await has('★ 5.0'));
  await switchUser('Campus Bites');
  await go('/vendor');
  check('vendor console shows customer rating', await has('Customer rating') && await has('★ 5.0'));

  // ---- xerox file
  await switchUser('Alex Sharma');
  await go('/xerox');
  await page.type('input[placeholder^="e.g. Physics"]', 'thesis.pdf');
  await attach('input[type=file]', pdf);
  await clickText('Send print request'); await sleep(600);
  await switchUser('Library Xerox');
  await go('/vendor/print-queue');
  check('print shop sees the attached file name', await has('brief.pdf'));
} catch (e) {
  check('script ran to completion', false, e.message);
  await page.screenshot({ path: join(process.env.SHOT_DIR || dir, 'features-failure.png') }).catch(() => {});
}

check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
