const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { chromium } = require("playwright");
test("v2 у браузері: пропозиції, CSV, знімок, перезавантаження, JSON та мобільний вигляд", async () => {
  const server = createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/styles.css" ? "text/css" : "text/html; charset=utf-8",
    );
    res.end(
      readFileSync(
        __dirname + (req.url === "/styles.css" ? "/styles.css" : "/index.html"),
      ),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const tab = async (id) => page.locator(`[data-tab=${id}]`).click();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (const [name, value] of Object.entries({
      concrete: "1",
      steel: "100",
      energy: "20",
      labor: "5",
    }))
      await page.locator(`[name=${name}]`).fill(value);
    await page.locator("#calculationTitle").fill("Плита — перша ціна");
    await page.locator("#saveCalculation").click();
    const saved = JSON.parse(
      await page.evaluate(() => localStorage.getItem("zbv-calculator-v2")),
    ).snapshots;
    assert.equal(saved[0].gross, 13522.8);
    await tab("offers");
    const add = page.locator("#addOffer");
    await add.locator("[name=price]").fill("5000");
    await add
      .locator("[name=supplier]")
      .fill("Перевірений користувачем постачальник");
    await add.locator("[name=date]").fill("2026-10-20");
    await add.locator("[name=source]").fill("КП №1");
    await add.getByRole("button").click();
    await page.locator("[data-approve]").click();
    await tab("calc");
    assert.match(await page.locator("#gross").textContent(), /14\s?122,80/);
    assert.match(await page.locator("#snapshots").textContent(), /13\s?522,80/);
    assert.equal(
      await page.locator("[name=concretePrice]").inputValue(),
      "5000",
    );
    await tab("offers");
    const header = "Матеріал;Одиниця;Ціна без ПДВ;Постачальник;Дата;Джерело\n";
    const csv = async (text) =>
      page
        .locator("#csvFile")
        .setInputFiles({
          name: "prices.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(text),
        });
    await csv(header + "Бетон;кг;6000;ТОВ;2026-10-20;КП №2");
    await page.waitForFunction(() =>
      document.querySelector("#importPreview").textContent.includes("Одиниця"),
    );
    assert.equal(await page.locator("#importPrices").isDisabled(), true);
    await csv(header + "Бетон;м³;6000;ТОВ;2026-10-20;КП №2");
    await page.waitForFunction(
      () => !document.querySelector("#importPrices").disabled,
    );
    await page.locator("#importPrices").click();
    let data = JSON.parse(
      await page.evaluate(() => localStorage.getItem("zbv-calculator-v2")),
    );
    assert.equal(data.offers.length, 2);
    assert.equal(data.resources[0].price, 5000);
    await page.locator("[data-approve]").click();
    data = JSON.parse(
      await page.evaluate(() => localStorage.getItem("zbv-calculator-v2")),
    );
    assert.equal(data.resources[0].price, 6000);
    assert.equal(data.history.length, 2);
    assert.deepEqual(data.snapshots, saved);
    await page.reload();
    await tab("resources");
    assert.match(
      await page.locator("#resourceTable").textContent(),
      /6\s?000,00/,
    );
    await tab("settings");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#exportJSON").click();
    const download = await downloadPromise;
    const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.deepEqual(backup, data);
    page.on("dialog", (d) => d.accept());
    await page
      .locator("#restoreJSON")
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
      });
    await page.waitForFunction(() =>
      document.querySelector("#notice").textContent.includes("відновлено"),
    );
    assert.deepEqual(
      JSON.parse(
        await page.evaluate(() => localStorage.getItem("zbv-calculator-v2")),
      ),
      data,
    );
    await page
      .locator("#restoreJSON")
      .setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"version":1}'),
      });
    await page.waitForFunction(() =>
      document.querySelector("#notice").textContent.includes("скасовано"),
    );
    assert.deepEqual(
      JSON.parse(
        await page.evaluate(() => localStorage.getItem("zbv-calculator-v2")),
      ),
      data,
    );
    await tab("resources");
    const resource = page.locator("#addResource");
    await resource.locator("[name=name]").fill("Пісок");
    await resource.locator("[name=category]").fill("Матеріали");
    await resource.locator("[name=unit]").selectOption("кг");
    await resource.getByRole("button").click();
    assert.match(await page.locator("#resourceTable").textContent(), /Пісок/);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const id of ["calc", "resources", "offers", "history", "settings"]) {
        await tab(id);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${id} at ${width}`,
        );
      }
    }
    await tab("calc");
    await page.screenshot({ path: "/tmp/zbv-v2-preview.png", fullPage: true });
    assert.deepEqual(errors, []);
    // Інша вкладка не повинна мовчки перезаписувати зміни.
    await page.evaluate(() =>
      localStorage.setItem(
        "zbv-calculator-v2",
        JSON.stringify({
          ...JSON.parse(localStorage.getItem("zbv-calculator-v2")),
          vat: 7,
        }),
      ),
    );
    await page.locator("#saveCalculation").click();
    assert.match(await page.locator("#notice").textContent(), /іншій вкладці/);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
