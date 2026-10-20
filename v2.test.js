const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const context = {
  module: { exports: {} },
  crypto: require("node:crypto").webcrypto,
};
vm.runInNewContext(
  readFileSync(__dirname + "/index.html", "utf8").match(
    /<script>([\s\S]*?)<\/script>/,
  )[1],
  context,
);
const { initialState, totals, approve, snapshot, parseCSV, validateBackup } =
  context.module.exports;
const json = (v) => JSON.parse(JSON.stringify(v));
const offer = (id, price) => ({
  id,
  resourceId: "concrete",
  unit: "м³",
  price,
  supplier: "Постачальник",
  date: "2026-10-20",
  source: "КП 001",
});

test("v2: контрольна сума, дробові значення, нульовий ПДВ, переповнення", () => {
  assert.deepEqual(
    json(
      totals(
        [
          { quantity: 1, price: 4500 },
          { quantity: 100, price: 45 },
          { quantity: 20, price: 7.2 },
          { quantity: 5, price: 425 },
        ],
        20,
      ),
    ),
    { costs: [4500, 4500, 144, 2125], net: 11269, tax: 2253.8, gross: 13522.8 },
  );
  assert.equal(totals([{ quantity: 0.5, price: 7.2 }], 0).gross, 3.6);
  for (const value of ["", -1, Infinity, "abc"])
    assert.throws(() => totals([{ quantity: value, price: 1 }], 20));
  assert.throws(() => totals([{ quantity: Number.MAX_VALUE, price: 2 }], 20));
});
test("v2: одна затверджена пропозиція, історія та незмінний знімок", () => {
  const s = initialState();
  s.offers.push(offer("a", 5000), offer("b", 6000));
  s.snapshots.push(snapshot(s, { concrete: 1 }, "До затвердження"));
  const before = JSON.stringify(s.snapshots);
  approve(s, "a");
  assert.equal(s.resources[0].price, 5000);
  approve(s, "b");
  assert.equal(s.resources[0].approvedId, "b");
  assert.equal(s.resources[0].price, 6000);
  assert.equal(s.history.length, 2);
  assert.equal(s.history[1].oldPrice, 5000);
  assert.equal(JSON.stringify(s.snapshots), before);
  assert.equal(s.snapshots[0].gross, 5400);
  assert.equal(snapshot(s, { concrete: 1 }, "Після").gross, 7200);
  validateBackup(json(s));
});
test("v2: CSV UTF-8, BOM, лапки, десяткова кома, помилки одиниць та даних", () => {
  const s = initialState(),
    header = "Матеріал;Одиниця;Ціна без ПДВ;Постачальник;Дата;Джерело\n";
  const rows = parseCSV(
    "\uFEFF" + header + 'Бетон;м³;4500,50;"ТОВ; Бетон";2026-10-20;КП\n',
    s.resources,
  );
  assert.equal(rows[0].price, 4500.5);
  assert.equal(rows[0].supplier, "ТОВ; Бетон");
  assert.equal(rows[0].error, "");
  for (const row of [
    "Бетон;кг;12;ТОВ;2026-10-20;КП",
    "Бетон;м³;-2;ТОВ;2026-10-20;КП",
    "Бетон;м³;2;ТОВ;2026-02-30;КП",
    "Невідомий;кг;2;ТОВ;2026-10-20;КП",
    "Бетон;м³;;ТОВ;2026-10-20;КП",
  ])
    assert.ok(parseCSV(header + row, s.resources)[0].error);
  const comma =
    'Матеріал,Одиниця,Ціна без ПДВ,Постачальник,Дата,Джерело\nБетон,м³,"7,2",ТОВ,2026-10-20,КП';
  assert.equal(parseCSV(comma, s.resources)[0].price, 7.2);
  assert.throws(() => parseCSV(header + '"Бетон', s.resources));
});
test("v2: JSON round trip і відхилення пошкоджених даних", () => {
  const s = initialState();
  assert.deepEqual(json(validateBackup(json(s))), json(s));
  for (const edit of [
    (s) => (s.version = 1),
    (s) => (s.resources[0].price = -1),
    (s) => (s.resources[0].unit = "тонна"),
    (s) => s.resources.push(s.resources[0]),
    (s) => (s.resources[0].approvedId = "missing"),
  ]) {
    const broken = json(s);
    edit(broken);
    assert.throws(() => validateBackup(broken));
  }
  s.snapshots.push(snapshot(s, { concrete: 2 }, "Тест"));
  s.snapshots[0].gross = 1;
  assert.throws(() => validateBackup(s));
});

test("v2: неприпустимі типи чисел та одиниці пропозиції", () => {
  for (const quantity of [[], {}, null, false])
    assert.throws(() => totals([{ quantity, price: 1 }], 20));
  const state = initialState();
  state.offers.push({ ...offer("wrong-unit", 12), unit: "кг" });
  assert.throws(() => approve(state, "wrong-unit"));
  assert.equal(state.resources[0].price, 4500);
  assert.equal(state.history.length, 0);
});
