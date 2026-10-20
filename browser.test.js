// Запуск: node --test browser.test.js (потрібні Playwright та Chromium).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

test('Самодостатній HTML: контрольні дані та перерахунок кожного поля', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Вебперегляд лише HTML: жоден зовнішній скрипт не буде доступний.
    await page.route('**/*', route => route.abort());
    await page.setContent(readFileSync(join(__dirname, 'index.html'), 'utf8'));
    const money = async id => Number((await page.locator(`#${id}`).textContent()).replace(/[^\d,.-]/g, '').replace(',', '.'));
    for (const [name, value] of Object.entries({ concrete: 1, steel: 100, energy: 20, labor: 5 })) {
      await page.locator(`[name="${name}"]`).fill(String(value));
    }
    for (const [id, expected] of Object.entries({ concreteCost: 4500, steelCost: 4500, energyCost: 144, laborCost: 2125, net: 11269, tax: 2253.8, gross: 13522.8 })) {
      assert.equal(await money(id), expected, id);
    }
    for (const name of ['concrete', 'concretePrice', 'steel', 'steelPrice', 'energy', 'energyPrice', 'labor', 'laborPrice', 'vat']) {
      const input = page.locator(`[name="${name}"]`);
      const original = await input.inputValue();
      await input.fill(String(Number(original) + 1));
      assert.notEqual(await money('gross'), 13522.8, `${name}: input`);
      await input.fill(original);
      assert.equal(await money('gross'), 13522.8);
      await input.evaluate(element => { element.value = String(Number(element.value) + 1); element.dispatchEvent(new Event('change', { bubbles: true })); });
      assert.notEqual(await money('gross'), 13522.8, `${name}: change`);
      await input.fill(original);
    }
    await page.locator('[name="concrete"]').fill('-1');
    assert.equal(await page.locator('#error').isVisible(), true);
    assert.equal(await page.locator('#gross').textContent(), '—');
    await page.getByRole('button', { name: 'Скинути розрахунок' }).click();
    await page.waitForFunction(() => document.querySelector('#error').hidden);
    assert.equal(await money('gross'), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
