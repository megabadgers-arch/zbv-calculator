const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const html = readFileSync(
  require("node:path").join(__dirname, "index.html"),
  "utf8",
);
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = { module: { exports: {} } };
vm.runInNewContext(script, context);
// Передаємо JSON між контекстами, щоб перевіряти звичайні об’єкти Node.js.
const calculate = (values) =>
  JSON.parse(JSON.stringify(context.module.exports.calculate(values)));
const calculationError = (error) => error.name === "RangeError";
const defaults = {
  concrete: 0,
  concretePrice: 4500,
  steel: 0,
  steelPrice: 45,
  energy: 0,
  energyPrice: 7.2,
  labor: 0,
  laborPrice: 425,
  vat: 20,
};

test("Нульові обсяги", () => {
  assert.deepEqual(calculate(defaults), {
    costs: { concrete: 0, steel: 0, energy: 0, labor: 0 },
    net: 0,
    tax: 0,
    gross: 0,
  });
});
test("Усі статті та ПДВ: 2 м³, 100 кг, 10 кВт·год, 8 люд.-год", () => {
  assert.deepEqual(
    calculate({ ...defaults, concrete: 2, steel: 100, energy: 10, labor: 8 }),
    {
      costs: { concrete: 9000, steel: 4500, energy: 72, labor: 3400 },
      net: 16972,
      tax: 3394.4,
      gross: 20366.4,
    },
  );
});
test("Змінені ціни, дробові обсяги та ставка ПДВ", () => {
  const result = calculate({
    concrete: 0.5,
    concretePrice: 5000,
    steel: 2.5,
    steelPrice: 50,
    energy: 1.5,
    energyPrice: 8,
    labor: 0.5,
    laborPrice: 400,
    vat: 7,
  });
  assert.equal(result.net, 2837);
  assert.equal(result.tax, 198.59);
  assert.equal(result.gross, 3035.59);
  assert.equal(calculate({ ...defaults, concrete: 1, vat: 0 }).gross, 4500);
});
test("Некоректні та надмірні значення відхиляються", () => {
  for (const name of Object.keys(defaults)) {
    for (const value of [-1, NaN, Infinity, undefined, "2"])
      assert.throws(
        () => calculate({ ...defaults, [name]: value }),
        calculationError,
      );
  }
  assert.throws(
    () => calculate({ ...defaults, concrete: Number.MAX_VALUE }),
    calculationError,
  );
});

test("Контрольний приклад: 1 м³, 100 кг, 20 кВт·год, 5 люд.-год, ПДВ 20%", () => {
  assert.deepEqual(
    calculate({ ...defaults, concrete: 1, steel: 100, energy: 20, labor: 5 }),
    {
      costs: { concrete: 4500, steel: 4500, energy: 144, labor: 2125 },
      net: 11269,
      tax: 2253.8,
      gross: 13522.8,
    },
  );
});
