"use strict";
const assert = require("assert");
const D = require("../docs/app/dealmemo.js");
let n = 0; const t = (name, f) => { try { f(); n++; } catch (e) { console.error("FAIL", name); throw e; } };
t("arabic extraction with feddan, millions, down payment, years", () => {
  const x = D.extract("أرض ٥ فدان، السعر المطلوب ٣٢٠ مليون جنيه، مقدم 20% والباقي تقسيط على 3 سنين، معامل البناء 1.2").fields;
  assert.ok(Math.abs(x.land_area - 5 * D.FEDDAN) < 1e-6); assert.strictEqual(x.asking_price, 320e6);
  assert.strictEqual(x.land_down, 0.2); assert.strictEqual(x.land_years, 3); assert.strictEqual(x.land_mode, "installments"); assert.strictEqual(x.far, 1.2);
});
t("english extraction with price per m2 and k", () => {
  const x = D.extract("Plot of 18,000 sqm, asking 45,000 EGP per m2, cash, FAR: 1.5, selling price 70k").fields;
  assert.strictEqual(x.land_area, 18000); assert.strictEqual(x.asking_price, 810e6); assert.strictEqual(x.price_sqm, 70000); assert.strictEqual(x.land_mode, "cash");
});
t("billion", () => assert.strictEqual(D.extract("السعر 1.2 مليار").fields.asking_price, 1.2e9));
t("nothing found", () => assert.deepStrictEqual(D.extract("hello").found, []));
t("default deal is Go", () => assert.strictEqual(D.evaluate({}).verdict, "go"));
t("overpriced deal is Walk away", () => assert.strictEqual(D.evaluate({ asking_price: 600e6 }).verdict, "walk"));
t("tight deal is Negotiate", () => { const r = D.evaluate({ asking_price: 340e6 }); assert.strictEqual(r.verdict, "negotiate"); });
t("infeasible is Walk away", () => assert.strictEqual(D.evaluate({ cost_sqm: 80000 }).verdict, "walk"));
t("instalments raise the max bid", () => { const s = D.evaluate({}).structures; assert.ok(s[0].max_bid < s[1].max_bid && s[1].max_bid < s[2].max_bid); });
t("opening below walk-away", () => { const r = D.evaluate({}); assert.ok(r.opening_offer < r.walk_away); });
t("stress lowers margin", () => { const r = D.evaluate({}); assert.ok(r.stress.margin_at_ask < r.analysis.margin_at_ask); });
t("flags fire", () => {
  const r = D.evaluate({ efficiency: 0.9, price_growth: 0.3, cost_infl: 0.1, plan_months: 96, asking_price: 600e6 });
  ["efficiency_optimistic", "growth_optimistic", "plan_long", "margin_low"].forEach((f) => assert.ok(r.flags.includes(f), f));
});
t("memo has verdict and every flag text, both languages", () => {
  const r = D.evaluate({ asking_price: 600e6 });
  ["ar", "en"].forEach((l) => { const m = D.memo(r, l); assert.ok(m.includes(D.W[l].walk)); r.flags.forEach((f) => assert.ok(m.includes(D.W[l].flags[f]))); assert.ok(!/undefined|NaN/.test(m)); });
});
console.log(`ok: ${n} deal-memo tests passed`);
