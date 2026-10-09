import puppeteer from 'puppeteer-core';

const base = process.env.BASE_URL || 'http://localhost:3200';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

async function waitFor(text) {
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15_000 }, text);
}

async function click(label, selector = 'button') {
  const found = await page.evaluate((value, query) => {
    const button = [...document.querySelectorAll(query)].find(element => element.textContent.trim() === value);
    if (!button) return false;
    button.click(); return true;
  }, label, selector);
  if (!found) throw new Error(`Missing ${label}`);
}

async function submit(label, values) {
  const result = await page.evaluate((buttonText, fields) => {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === buttonText);
    const form = button?.closest('form');
    if (!form) return false;
    for (const [name, value] of Object.entries(fields)) {
      const input = form.elements.namedItem(name);
      if (!input) return false;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    form.requestSubmit(); return true;
  }, label, values);
  if (!result) throw new Error(`Could not submit ${label}`);
}

try {
  await page.goto(base + '/live', { waitUntil: 'networkidle0' });
  await submit('Enter demo workspace', { name: 'Live QA', campus: 'qa-campus' });
  await waitFor('1000 KC');
  await click('Campus shops');
  await submit('Create shop', { name: 'QA Canteen', type: 'canteen' });
  await waitFor('QA Canteen');
  await submit('Add product', { name: 'QA Lunch', description: 'Test meal', price: '45', stock: '3' });
  await waitFor('QA Lunch');
  await click('Buy one');
  await waitFor('Order placed');
  await click('KC & orders');
  await waitFor('QA Lunch ×1');
  await page.reload({ waitUntil: 'networkidle0' });
  await waitFor('955 KC');
  await click('KC & orders');
  await waitFor('QA Lunch ×1');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS  connected workspace: identity, shop, product, checkout, persisted wallet and order');
} finally {
  await browser.close();
}
