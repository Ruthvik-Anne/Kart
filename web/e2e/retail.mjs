// Browser walkthrough for cart, promo codes, wishlist, product pages and theme.
// Run with the app started: BASE_URL=http://localhost:3100 npm run test:e2e:retail
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };

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
const clickText = async (label, sel = 'button, a') => {
  const ok = await page.evaluate((l, s) => {
    const el = [...document.querySelectorAll(s)].find(e => (e.textContent.trim().includes(l) || e.getAttribute('aria-label') === l) && !e.disabled);
    if (!el) return false; el.click(); return true;
  }, label, sel);
  if (!ok) throw new Error(`no clickable "${label}"`);
};
const go = async p => { await page.goto(BASE + p, { waitUntil: 'networkidle0' }); };
const loginAs = async name => { await go('/login'); await page.evaluate(() => localStorage.removeItem('kart-web-session-v1')); await go('/login'); await clickText(name); await page.waitForFunction(() => !location.pathname.startsWith('/login')); await sleep(400); };
const toast = async () => page.evaluate(() => [...document.querySelectorAll('[role=status]')].map(e => e.textContent).join(' | '));
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const balance = async () => Number(((await page.evaluate(() => document.querySelector('header')?.innerText ?? '')).match(/([\d,]+)\s*KC/) || [])[1]?.replace(/,/g, '') ?? NaN);
const setNum = async (el, v) => { await el.focus(); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.type(String(v)); };

try {
  // ---- admin creates a promo and it appears in the sidebar
  await loginAs('Platform Ops');
  check('admin sees Promo codes in the sidebar', (await page.$('a[href="/admin/promos"]')) !== null);
  await go('/admin/promos');
  check('seeded promos are listed', (await has('KART10')) && (await has('NEW50')));
  await page.type('input[placeholder="e.g. FRESH20"]', 'E2E15');
  await page.type('input[placeholder="Shown to shoppers"]', 'E2E test code');
  const numbers = await page.$$('input[type=number]');
  await setNum(numbers[0], 15);
  await clickText('Save');
  await sleep(500);
  check('new promo code is saved', await has('E2E15'), await toast());

  // ---- student: wishlist, product page, cart, promo, checkout
  await loginAs('Alex Sharma');
  const before = await balance();
  await go('/food');
  await clickText('Save to wishlist');
  await sleep(300);
  check('wishlist toggle confirms', (await toast()).includes('Saved to wishlist'), await toast());
  await go('/wishlist');
  check('wishlist page lists the saved item', !(await has('Nothing saved yet')));

  await go('/food');
  await page.evaluate(() => document.querySelector('article a[aria-label^="View"]')?.click());
  await page.waitForFunction(() => location.pathname.startsWith('/product/'));
  await sleep(400);
  check('product page opens with breadcrumb', (await page.$('nav[aria-label=Breadcrumb]')) !== null);
  await clickText('Add to cart');
  await sleep(300);
  await clickText('Open cart, 1 items', 'button');
  await sleep(300);
  check('cart modal shows the line and a total', (await has('Place order')) && (await page.$('input[aria-label="Promo code"]')) !== null);

  await page.type('input[aria-label="Promo code"]', 'NOSUCHCODE');
  await clickText('Apply');
  await sleep(300);
  check('invalid promo code is rejected', /invalid|not valid|unknown|isn.t|no such|not found/i.test((await toast()) + (await text())), await toast());
  await page.click('input[aria-label="Promo code"]', { clickCount: 3 });
  await page.keyboard.type('KART10');
  await clickText('Apply');
  await sleep(300);
  check('valid promo code shows a discount', /discount|KART10/i.test(await text()) && !/invalid/i.test(await toast()), await toast());
  await clickText('Place order');
  await sleep(600);
  const after = await balance();
  check('order placed and wallet debited', after < before, `before ${before} after ${after}`);
  await go('/orders');
  check('order appears in My Orders', !(await has('No orders')), (await text()).slice(0, 120));

  // ---- theme
  await go('/settings');
  await clickText('Dark', 'button[role=radio]');
  await sleep(200);
  check('dark theme applies immediately', (await theme()) === 'dark');
  await go('/tasks');
  check('dark theme persists across pages', (await theme()) === 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('body background is dark', bg !== 'rgb(245, 247, 242)', bg);
  const bad = [];
  for (const p of ['/dashboard', '/food', '/shop', '/wallet', '/orders', '/notifications', '/wishlist', '/settings', '/messages', '/events', '/marketplace']) {
    await go(p);
    const light = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => {
      const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.map(Number);
      return m && (m[3] === undefined || m[3] > 0.5) && m[0] > 235 && m[1] > 235 && m[2] > 225 && e.getBoundingClientRect().width > 60;
    }).length);
    if (light) bad.push(`${p}:${light}`);
  }
  check('no large light-coloured surfaces remain in dark mode', bad.length === 0, bad.join(' '));
  await go('/settings');
  await clickText('Light', 'button[role=radio]');
  await sleep(200);
  check('switching back to light works', (await theme()) === 'light');
  await page.reload({ waitUntil: 'networkidle0' });
  check('light choice survives reload', (await theme()) === 'light');
  check('no console or page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
} catch (e) {
  check('retail walkthrough completed', false, String(e));
} finally {
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
