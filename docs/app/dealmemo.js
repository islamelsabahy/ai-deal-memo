/* AI Deal Memo engine: reads a land/project offer, runs the land-deal-lab and payment-plan engines,
 * and turns the numbers into a verdict, a negotiation range, red flags and a written memo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vendor/landlab.js"), require("./vendor/payplans.js"));
  else root.DealMemo = factory(root.LandLab, root.PayPlans);
})(typeof self !== "undefined" ? self : this, function (LandLab, PayPlans) {
  "use strict";
  var FEDDAN = 4200.83;
  var STRUCTURES = [
    { id: "cash", land_mode: "cash" },
    { id: "inst3", land_mode: "installments", land_down: 0.20, land_years: 3, land_per_year: 1, land_grace_years: 0 },
    { id: "inst5", land_mode: "installments", land_down: 0.15, land_years: 5, land_per_year: 4, land_grace_years: 1 }
  ];

  function digits(s) { return String(s || "").replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); }).replace(/٫/g, ".").replace(/٬/g, ","); }
  function num(s) { return Number(String(s).replace(/,/g, "")); }
  var N = "(\\d[\\d,]*(?:\\.\\d+)?)";

  /* Best-effort extraction of deal terms from free text (Arabic or English). Returns {fields, found[]}. */
  function extract(text) {
    var s = digits(text).replace(/\s+/g, " "), f = {}, found = [], m;
    function hit(k, v) { if (v === v && v > 0) { f[k] = v; found.push(k); } }
    if ((m = new RegExp(N + "\\s*(?:فدان|فدادين|feddans?)", "i").exec(s))) hit("land_area", num(m[1]) * FEDDAN);
    else if ((m = new RegExp(N + "\\s*(?:م2|م²|متر مربع|مترمربع|m2|m²|sqm|square met)", "i").exec(s))) hit("land_area", num(m[1]));
    var per = new RegExp(N + "\\s*(?:ألف|الف|k)?\\s*(?:جنيه|ج\\.?م|egp|le)?\\s*(?:للمتر|/\\s*م2|/\\s*م²|per\\s*(?:m2|sqm|square meter)|/\\s*m2)", "i");
    var askM = new RegExp("(?:السعر|سعر الأرض|سعر الارض|المطلوب|مطلوب|asking|price)[^\\d]{0,25}" + N + "\\s*(مليار|مليون|million|billion|bn|m)\\b", "i");
    var totalM = new RegExp(N + "\\s*(مليار|مليون|million|billion|bn)", "i");
    if ((m = askM.exec(s)) || (m = totalM.exec(s))) hit("asking_price", num(m[1]) * (/مليار|billion|bn/i.test(m[2]) ? 1e9 : 1e6));
    var pm = per.exec(s);
    if (pm && !f.asking_price && f.land_area) hit("asking_price", num(pm[1]) * (/ألف|الف|k/i.test(pm[0]) ? 1000 : 1) * f.land_area);
    if ((m = new RegExp("(?:معامل (?:البناء|الاستغلال)|far)\\s*[:=]?\\s*" + N, "i").exec(s))) hit("far", num(m[1]));
    if ((m = new RegExp("(?:سعر البيع|البيع للمتر|selling price|sale price)[^\\d]{0,20}" + N + "\\s*(ألف|الف|k)?", "i").exec(s))) hit("price_sqm", num(m[1]) * (m[2] ? 1000 : 1));
    if ((m = new RegExp("(?:تكلفة (?:البناء|الإنشاء|الانشاء)|construction cost|build cost)[^\\d]{0,20}" + N + "\\s*(ألف|الف|k)?", "i").exec(s))) hit("cost_sqm", num(m[1]) * (m[2] ? 1000 : 1));
    if ((m = new RegExp("(?:مقدم|down(?: payment)?)\\s*[:=]?\\s*" + N + "\\s*%", "i").exec(s)) || (m = new RegExp(N + "\\s*%\\s*(?:مقدم|down)", "i").exec(s))) hit("land_down", num(m[1]) / 100);
    if ((m = new RegExp("(?:تقسيط|أقساط|اقساط|installments?|over)[^\\d]{0,20}" + N + "\\s*(?:سنين|سنوات|سنة|years?)", "i").exec(s))) { hit("land_years", Math.round(num(m[1]))); f.land_mode = "installments"; }
    else if (/كاش|نقد[اًي]|cash/i.test(s)) { f.land_mode = "cash"; found.push("land_mode"); }
    return { fields: f, found: found };
  }

  function verdictOf(a, p) {
    var ask = p.asking_price;
    if (!a.feasible || !(ask > 0) || a.max_bid < 0.85 * ask) return "walk";
    if (a.max_bid - ask >= 0.10 * ask && a.margin_at_ask >= p.target_margin) return "go";
    return "negotiate";
  }

  function evaluate(input) {
    var p = {}, k;
    for (k in LandLab.DEFAULTS) p[k] = LandLab.DEFAULTS[k];
    for (k in input) if (k in LandLab.DEFAULTS) p[k] = input[k];
    var a = LandLab.analyze(p), ask = Number(p.asking_price);
    var structs = LandLab.landStructures(p, STRUCTURES).map(function (s, i) { s.id = STRUCTURES[i].id; return s; });
    var tor = LandLab.tornado(p, 0.2);
    var stressIn = {}; for (k in p) stressIn[k] = p[k];
    stressIn.price_sqm = p.price_sqm * 0.85; stressIn.cost_sqm = p.cost_sqm * 1.20;
    var stress = LandLab.analyze(stressIn);
    var planHaircut = p.plan_months > 0 ? 1 - PayPlans.pvShare({ down_pct: Math.min(1, p.plan_down), term: p.plan_months, freq: 1 }, p.discount)[0] : 0;
    var flags = [];
    if (a.margin_at_ask !== null && a.margin_at_ask < p.target_margin) flags.push("margin_low");
    if (a.irr_annual !== null && a.irr_annual < p.discount) flags.push("irr_below_hurdle");
    if (stress.margin_at_ask !== null && stress.margin_at_ask < 0) flags.push("stress_loss");
    if (p.efficiency > 0.85) flags.push("efficiency_optimistic");
    if (p.price_growth > p.cost_infl + 0.03) flags.push("growth_optimistic");
    if (p.plan_months > p.build + 24) flags.push("plan_long");
    if (tor.base > 0 && tor.rows[0].swing > 0.5 * tor.base) flags.push("fragile");
    if (ask > 0 && ask > 0.35 * a.pv_revenue) flags.push("land_heavy");
    var verdict = verdictOf(a, p);
    var walkaway = a.max_bid, opening = Math.min(ask > 0 ? ask : a.max_bid, a.max_bid) * 0.92;
    return { params: p, analysis: a, verdict: verdict, opening_offer: opening, walk_away: walkaway, structures: structs,
      tornado: tor.rows.slice(0, 3), stress: { price_sqm: stressIn.price_sqm, cost_sqm: stressIn.cost_sqm, margin_at_ask: stress.margin_at_ask, max_bid: stress.max_bid },
      plan_haircut: planHaircut, flags: flags };
  }

  var W = {
    ar: { go: "ادخل", negotiate: "فاوض", walk: "انسحب",
      flags: { margin_low: "هامش الربح بالسعر المطلوب أقل من المستهدف.", irr_below_hurdle: "العائد الداخلي أقل من معدل الخصم (تكلفة الفلوس).", stress_loss: "لو سعر البيع نزل 15% والتكلفة زادت 20% المشروع يخسر.", efficiency_optimistic: "نسبة المساحة القابلة للبيع فوق 85%، وده متفائل.", growth_optimistic: "زيادة أسعار البيع المفترضة أعلى من التضخم في التكلفة بفرق كبير.", plan_long: "خطة تقسيط العملاء ممتدة أكتر من سنتين بعد التسليم.", fragile: "القرار حساس جدًا لعامل واحد: تغيير 20% فيه يحرك أقصى سعر للأرض أكتر من النص.", land_heavy: "سعر الأرض المطلوب أكتر من 35% من قيمة الإيرادات الحالية." },
      drivers: { price_sqm: "سعر بيع المتر", cost_sqm: "تكلفة إنشاء المتر", efficiency: "نسبة المساحة القابلة للبيع", far: "معامل البناء", discount: "معدل الخصم", sales_months: "مدة البيع", plan_months: "مدة تقسيط العملاء", target_margin: "الهامش المستهدف", build: "مدة الإنشاء" },
      structs: { cash: "كاش", inst3: "تقسيط 3 سنين (20% مقدم)", inst5: "تقسيط 5 سنين ربع سنوي بسنة سماح (15% مقدم)" } },
    en: { go: "Go", negotiate: "Negotiate", walk: "Walk away",
      flags: { margin_low: "Margin at the asking price is below target.", irr_below_hurdle: "IRR is below the discount rate (cost of money).", stress_loss: "If selling prices drop 15% and costs rise 20%, the project loses money.", efficiency_optimistic: "Sellable efficiency above 85% is optimistic.", growth_optimistic: "Assumed price growth beats cost inflation by a wide margin.", plan_long: "Buyer instalments run more than two years past handover.", fragile: "The decision hinges on one driver: a 20% change moves the max land price by more than half.", land_heavy: "Asking price is above 35% of present-value revenue." },
      drivers: { price_sqm: "selling price per m²", cost_sqm: "construction cost per m²", efficiency: "sellable efficiency", far: "FAR", discount: "discount rate", sales_months: "sales period", plan_months: "buyer instalment term", target_margin: "target margin", build: "build duration" },
      structs: { cash: "Cash", inst3: "3-year instalments (20% down)", inst5: "5-year quarterly, 1-year grace (15% down)" } }
  };
  function money(x) { return x === null || x === undefined ? "—" : (Math.round(x / 1e5) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M"; }
  function pct(x) { return x === null || x === undefined ? "—" : (x * 100).toFixed(1) + "%"; }

  function memo(r, lang, title) {
    var w = W[lang] || W.en, a = r.analysis, p = r.params, L = [];
    var ar = lang === "ar";
    L.push("# " + (title || (ar ? "مذكرة صفقة أرض" : "Land deal memo")));
    L.push((ar ? "**القرار: " : "**Verdict: ") + w[r.verdict] + "**");
    L.push("");
    if (ar) {
      L.push("- السعر المطلوب: " + money(p.asking_price) + " جنيه، وأقصى سعر يحقق هامش " + pct(p.target_margin) + ": " + money(a.max_bid) + " جنيه (" + Math.round(a.max_bid_per_m2).toLocaleString("en-US") + " جنيه للمتر).");
      L.push("- هامش الربح بالسعر المطلوب: " + pct(a.margin_at_ask) + "، والعائد الداخلي السنوي: " + pct(a.irr_annual) + ".");
      L.push("- نطاق التفاوض: ابدأ من " + money(r.opening_offer) + " وانسحب فوق " + money(r.walk_away) + ".");
      L.push("- اختبار الضغط (بيع -15%، تكلفة +20%): الهامش يبقى " + pct(r.stress.margin_at_ask) + ".");
      L.push("- خطة تقسيط العملاء (" + pct(p.plan_down) + " مقدم على " + p.plan_months + " شهر) فيها خصم مخفي " + pct(r.plan_haircut) + " من قيمة المبيعات.");
      L.push("- أكتر عوامل بتأثر على القرار: " + r.tornado.map(function (t) { return w.drivers[t.driver]; }).join("، ") + ".");
      L.push("");
      L.push("**تأثير طريقة دفع الأرض على أقصى سعر:**");
    } else {
      L.push("- Asking price: EGP " + money(p.asking_price) + "; the most you can pay and still earn a " + pct(p.target_margin) + " margin: EGP " + money(a.max_bid) + " (EGP " + Math.round(a.max_bid_per_m2).toLocaleString("en-US") + " per m²).");
      L.push("- Margin at the asking price: " + pct(a.margin_at_ask) + "; annual IRR: " + pct(a.irr_annual) + ".");
      L.push("- Negotiation range: open at " + money(r.opening_offer) + ", walk away above " + money(r.walk_away) + ".");
      L.push("- Stress test (prices -15%, costs +20%): margin becomes " + pct(r.stress.margin_at_ask) + ".");
      L.push("- The buyer payment plan (" + pct(p.plan_down) + " down over " + p.plan_months + " months) carries a hidden discount of " + pct(r.plan_haircut) + " of sales value.");
      L.push("- Drivers that move the decision most: " + r.tornado.map(function (t) { return w.drivers[t.driver]; }).join(", ") + ".");
      L.push("");
      L.push("**How the land payment structure changes the max price:**");
    }
    r.structures.forEach(function (s) { L.push("- " + w.structs[s.id] + ": " + money(s.max_bid)); });
    L.push("");
    L.push(ar ? "**علامات تحذير:**" : "**Red flags:**");
    if (!r.flags.length) L.push(ar ? "- لا توجد" : "- None");
    r.flags.forEach(function (f) { L.push("- " + w.flags[f]); });
    L.push("");
    L.push(ar ? "_الأرقام بالجنيه المصري (M = مليون). تحليل استرشادي يعتمد على الافتراضات المدخلة، وليس نصيحة استثمارية._" : "_Figures in EGP (M = million). Indicative analysis based on the inputs, not investment advice._");
    return L.join("\n");
  }
  return { FEDDAN: FEDDAN, STRUCTURES: STRUCTURES, W: W, extract: extract, evaluate: evaluate, memo: memo, verdictOf: verdictOf, digits: digits };
});
