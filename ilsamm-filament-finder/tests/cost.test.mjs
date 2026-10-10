import test from "node:test";
import assert from "node:assert/strict";
import {
  COST_DEFAULTS,
  costEstimate,
  restoreCost,
  costReport,
} from "../src/web/cost.mjs";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const batch = {
  ...COST_DEFAULTS,
  units: 4,
  grams: 360,
  wasteGrams: 40,
  spoolPrice: 24,
  spoolGrams: 750,
  hours: 3,
  minutes: 30,
  watts: 200,
  energy: 0.25,
  machinePrice: 600,
  machineLife: 3000,
  maintenance: 0.1,
  failure: 20,
  setupMinutes: 30,
  finishMinutes: 5,
  labor: 18,
  packaging: 0.6,
  extras: 2,
};
const item = (r, key) => r.breakdown.find((row) => row.key === key).value;

test("material-only and electricity estimate preserves a simple print", () => {
  const r = costEstimate(COST_DEFAULTS);
  near(item(r, "material"), 2.4);
  near(item(r, "electricity"), 0.18);
  near(r.total, 2.58);
  near(r.unit, 2.58);
  assert.equal(r.sale, null);
});
test("a four-piece batch separates per-batch, per-piece and repeated costs", () => {
  const r = costEstimate(batch);
  near(item(r, "material"), 12.8);
  near(item(r, "electricity"), 0.175);
  near(item(r, "machine"), 1.05);
  near(item(r, "reprints"), 3.50625);
  near(item(r, "labor"), 15);
  near(item(r, "packaging"), 2.4);
  near(r.total, 36.93125);
  near(r.unit, 9.2328125);
  near(r.expectedHours, 4.375);
  near(r.expectedKwh, 0.875);
});
test("piece count does not multiply the slicer's batch weight and time", () => {
  const r = costEstimate({ ...COST_DEFAULTS, units: 10 });
  near(r.total, 2.58);
  near(r.unit, 0.258);
});
test("50 percent full-print failures double print costs but not finishing and packaging", () => {
  const r = costEstimate({
    ...COST_DEFAULTS,
    failure: 50,
    setupMinutes: 60,
    labor: 10,
    packaging: 2,
  });
  near(item(r, "reprints"), 2.58);
  near(item(r, "labor"), 10);
  near(item(r, "packaging"), 2);
  near(r.total, 17.16);
});
test("a 50 percent margin requires twice the cost, not a 50 percent markup", () => {
  const r = costEstimate({
    ...COST_DEFAULTS,
    grams: 1000,
    spoolPrice: 10,
    hours: 0,
    sell: true,
    margin: 50,
  });
  near(r.sale.net, 20);
  near(r.sale.profit, 10);
  near(r.sale.actualMargin, 50);
});
test("sale covers VAT-inclusive fees and one fixed fee across the batch", () => {
  const r = costEstimate({
    ...batch,
    sell: true,
    margin: 30,
    feePercent: 5,
    feeFixed: 0.35,
    vat: 22,
  });
  near(r.sale.netUnit, 14.59);
  near(r.sale.net, 58.36);
  near(r.sale.tax, 12.8392);
  near(r.sale.gross, 71.1992);
  near(r.sale.fees, 3.90996);
  near(r.sale.profit, 17.51879);
  assert.ok(r.sale.actualMargin >= 30);
});
test("rounding the quoted unit price upwards preserves the requested margin", () => {
  const r = costEstimate({ ...COST_DEFAULTS, units: 3, sell: true });
  near(r.sale.netUnit, 1.23);
  near(r.sale.net, 3.69);
  assert.ok(r.sale.actualMargin >= 30);
});
test("exact cent boundaries do not round up an extra cent from binary noise", () => {
  const r = costEstimate({
    ...COST_DEFAULTS,
    grams: 7,
    spoolPrice: 10,
    hours: 0,
    sell: true,
    margin: 30,
  });
  near(r.total, 0.07);
  near(r.sale.netUnit, 0.1);
});
test("invalid and singular values cannot yield plausible stale totals", () => {
  for (const [key, value] of [
    ["units", 0],
    ["units", 1.5],
    ["spoolGrams", 0],
    ["machineLife", 0],
    ["minutes", 60],
    ["hours", 1.5],
    ["failure", 100],
    ["grams", -1],
    ["grams", " "],
    ["grams", null],
    ["grams", true],
    ["grams", Infinity],
    ["grams", NaN],
    ["grams", []],
    ["energy", ""],
  ]) {
    assert.throws(
      () => costEstimate({ ...COST_DEFAULTS, [key]: value }),
      (error) => error.field === key,
    );
  }
  assert.throws(
    () =>
      costEstimate({
        ...COST_DEFAULTS,
        sell: true,
        margin: 90,
        feePercent: 10,
      }),
    /assorbono/,
  );
});
test("disabling sales ignores inactive drafts; legitimate zero costs remain zero", () => {
  const r = costEstimate({
    ...COST_DEFAULTS,
    grams: 0,
    hours: 0,
    margin: "",
    sell: false,
  });
  near(r.total, 0);
  assert.equal(r.sale, null);
});
test("saved quotes restore valid data and reject damaged storage", () => {
  const restored = restoreCost({ version: 1, name: "Supporto", values: batch });
  assert.equal(restored.name, "Supporto");
  assert.equal(restored.saved, true);
  near(costEstimate(restored.values).total, 36.93125);
  for (const saved of [
    null,
    [],
    "x",
    { version: 1, name: "x", values: { ...batch, units: 0 } },
    { version: 1, name: "x", values: null },
  ]) {
    assert.deepEqual(restoreCost(saved).values, COST_DEFAULTS);
    assert.equal(restoreCost(saved).saved, false);
  }
});
test("export contains the product, inputs, per-piece costs and pricing assumptions", () => {
  const text = costReport("Supporto sensore", { ...batch, sell: true });
  assert.match(text, /Supporto sensore/);
  assert.match(text, /Lotto: 4 pezzi/);
  assert.match(text, /Costo per pezzo: 9,23/);
  assert.match(text, /Costo lotto: 36,93/);
  assert.match(text, /Prezzo netto per pezzo:/);
  assert.match(text, /Supporti e spurghi \(g\): 40/);
  assert.match(text, /Un lotto equivale a un ordine/);
});
