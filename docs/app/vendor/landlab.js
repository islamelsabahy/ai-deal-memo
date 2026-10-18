/* Browser port of landlab/engine.py (the Python code is the reference).
 * Only + - * / on doubles (no pow/exp/log), so results match Python. `node tests/test_landlab.js` replays tests/vectors.json.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LandLab = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULTS = {
    land_area: 20000, far: 1.2, efficiency: 0.82, price_sqm: 68000, cost_sqm: 16000, soft_pct: 0.08,
    contingency_pct: 0.05, sales_pct: 0.03, overhead_m: 400000, target_margin: 0.20, discount: 0.20,
    price_growth: 0.14, cost_infl: 0.14, start_delay: 9, build: 28, launch: 3, sales_months: 30,
    plan_down: 0.20, plan_months: 36, land_mode: "cash", land_down: 0.20, land_years: 3, land_per_year: 1,
    land_grace_years: 0, asking_price: 300000000
  };
  var INT = ["start_delay", "build", "launch", "sales_months", "plan_months", "land_years", "land_per_year", "land_grace_years"];
  var TORNADO_DRIVERS = ["price_sqm", "cost_sqm", "efficiency", "far", "discount", "sales_months", "plan_months", "target_margin", "build"];

  function params(d) {
    var p = {}, k;
    for (k in DEFAULTS) p[k] = DEFAULTS[k];
    if (d) for (k in d) if (k in DEFAULTS) p[k] = d[k];
    for (k in DEFAULTS) {
      if (k === "land_mode") { if (p[k] !== "cash" && p[k] !== "installments") bad("land_mode must be cash or installments"); }
      else if (INT.indexOf(k) >= 0) p[k] = Math.trunc(Number(p[k]));
      else p[k] = Number(p[k]);
      if (k !== "land_mode" && !(p[k] === p[k])) bad(k + " must be a number");
    }
    ["land_area", "far", "efficiency", "price_sqm", "cost_sqm"].forEach(function (n) { if (!(p[n] > 0)) bad(n + " must be > 0"); });
    if (p.efficiency > 1) bad("efficiency must be <= 1");
    ["soft_pct", "contingency_pct", "sales_pct", "overhead_m", "asking_price"].forEach(function (n) { if (p[n] < 0) bad(n + " must be >= 0"); });
    if (!(p.target_margin >= 0 && p.target_margin < 1)) bad("target_margin must be 0..1");
    ["discount", "price_growth", "cost_infl"].forEach(function (n) { if (!(p[n] >= -0.5 && p[n] <= 5)) bad(n + " out of range"); });
    if (!(p.plan_down >= 0 && p.plan_down <= 1)) bad("plan_down must be 0..1");
    if (!(p.land_down >= 0 && p.land_down <= 1)) bad("land_down must be 0..1");
    if (!(p.start_delay >= 0 && p.start_delay <= 120 && p.build >= 1 && p.build <= 120 && p.launch >= 0 && p.launch <= 240 &&
      p.sales_months >= 1 && p.sales_months <= 240 && p.plan_months >= 0 && p.plan_months <= 240)) bad("timing out of range");
    if ([1, 2, 4, 12].indexOf(p.land_per_year) < 0) bad("land_per_year must be 1, 2, 4 or 12");
    if (!(p.land_years >= 1 && p.land_years <= 20 && p.land_grace_years >= 0 && p.land_grace_years <= 10)) bad("land years out of range");
    return p;
  }
  function bad(m) { throw new Error(m); }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  function weights(n) {
    function s(x) { return 3 * x * x - 2 * x * x * x; }
    var out = [];
    for (var k = 1; k <= n; k++) out.push(s(k / n) - s((k - 1) / n));
    return out;
  }
  function growth(rate, n) { var o = [1], f = 1 + rate / 12; for (var i = 0; i < n; i++) o.push(o[o.length - 1] * f); return o; }
  function discount(rate, n) { var o = [1], f = 1 + rate / 12; for (var i = 0; i < n; i++) o.push(o[o.length - 1] / f); return o; }

  function landSchedule(p) {
    if (p.land_mode === "cash") return [[0, 1]];
    var out = [[0, p.land_down]], n = p.land_years * p.land_per_year, each = (1 - p.land_down) / n, step = Math.floor(12 / p.land_per_year);
    for (var j = 1; j <= n; j++) out.push([p.land_grace_years * 12 + j * step, each]);
    return out;
  }
  function horizon(p) {
    var end = 0;
    landSchedule(p).forEach(function (x) { if (x[0] > end) end = x[0]; });
    return Math.max(p.start_delay + p.build, p.launch + p.sales_months + p.plan_months, end) + 1;
  }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  function flows(p, T) {
    var bua = p.land_area * p.far, sell = bua * p.efficiency, pidx = growth(p.price_growth, T), cidx = growth(p.cost_infl, T);
    var rev = zeros(T + 1), sc = zeros(T + 1), con = zeros(T + 1), over = zeros(T + 1), m, j, t;
    for (m = p.launch; m < p.launch + p.sales_months; m++) {
      var sale = sell * p.price_sqm / p.sales_months * pidx[m];
      rev[m] += sale * p.plan_down;
      var rest = sale * (1 - p.plan_down);
      if (p.plan_months > 0) { var each = rest / p.plan_months; for (j = 1; j <= p.plan_months; j++) rev[m + j] += each; }
      else rev[m] += rest;
      sc[m] += p.sales_pct * sale;
    }
    var total = bua * p.cost_sqm, w = weights(p.build), mult = 1 + p.soft_pct + p.contingency_pct;
    for (var k = 1; k <= p.build; k++) { t = p.start_delay + k - 1; con[t] += total * w[k - 1] * cidx[t] * mult; }
    var activeEnd = Math.max(p.start_delay + p.build, p.launch + p.sales_months);
    for (t = 0; t < activeEnd; t++) over[t] = p.overhead_m;
    return { bua: bua, sell: sell, pidx: pidx, cidx: cidx, rev: rev, salescost: sc, constr: con, over: over };
  }
  function pv(arr, df) { var a = 0; for (var t = 0; t < arr.length; t++) a += arr[t] * df[t]; return a; }
  function landFactor(p, df) { var a = 0; landSchedule(p).forEach(function (x) { a += x[1] * df[x[0]]; }); return a; }

  function irrMonthly(fl) {
    function npv(rate) { var d = 1, a = 0, step = 1 + rate; for (var i = 0; i < fl.length; i++) { a += fl[i] * d; d = d / step; } return a; }
    var lo = -0.5, hi = 1.0, flo = npv(lo), fhi = npv(hi);
    if (flo === 0) return lo;
    if (fhi === 0) return hi;
    if ((flo > 0) === (fhi > 0)) return null;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2, fm = npv(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function analyze(input) {
    var p = params(input), T = horizon(p), f = flows(p, T), df = discount(p.discount, T + 1);
    var pvRev = pv(f.rev, df), pvSales = pv(f.salescost, df), pvCon = pv(f.constr, df), pvOver = pv(f.over, df);
    var pvCosts = pvSales + pvCon + pvOver, target = p.target_margin * pvRev, allowed = pvRev - pvCosts - target;
    var lf = landFactor(p, df), maxBid = allowed > 0 ? allowed / lf : 0;
    var gdv = f.sell * p.price_sqm;
    var staticCosts = f.bua * p.cost_sqm * (1 + p.soft_pct + p.contingency_pct) + p.sales_pct * gdv;
    var out = { bua: f.bua, sellable: f.sell, gdv_today: gdv, pv_revenue: pvRev, pv_construction: pvCon, pv_sales_cost: pvSales,
      pv_overhead: pvOver, pv_target_profit: target, pv_land_allowed: allowed, land_factor: lf, max_bid: maxBid,
      max_bid_per_m2: maxBid / p.land_area, static_residual: gdv - staticCosts - p.target_margin * gdv, feasible: allowed > 0,
      margin_at_ask: null, headroom: null };
    var price = p.asking_price > 0 ? p.asking_price : maxBid, landPv = price * lf;
    if (p.asking_price > 0) { out.margin_at_ask = (pvRev - pvCosts - landPv) / pvRev; out.headroom = maxBid - p.asking_price; }
    var pay = zeros(T + 1), fl = [];
    landSchedule(p).forEach(function (x) { pay[x[0]] += price * x[1]; });
    for (var t = 0; t <= T; t++) fl.push(f.rev[t] - f.salescost[t] - f.constr[t] - f.over[t] - pay[t]);
    var irr = irrMonthly(fl);
    out.irr_annual = irr === null ? null : irr * 12;
    out.irr_at = price;
    return out;
  }

  function compare(parcels, shared) {
    var rows = parcels.map(function (pc, i) {
      var d = copy(shared || {}), k;
      for (k in pc) if (k !== "name") d[k] = pc[k];
      return { name: pc.name !== undefined ? pc.name : "Parcel " + (i + 1), land_area: Number(d.land_area !== undefined ? d.land_area : DEFAULTS.land_area),
        asking_price: Number(d.asking_price !== undefined ? d.asking_price : 0), result: analyze(d) };
    });
    var idx = rows.map(function (_, i) { return i; });
    function key(i) { var r = rows[i].result; return r.margin_at_ask !== null ? [0, -r.margin_at_ask, i] : [1, -r.max_bid_per_m2, i]; }
    idx.sort(function (a, b) { var x = key(a), y = key(b); return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0) || x[2] - y[2]; });
    idx.forEach(function (i, n) { rows[i].rank = n + 1; });
    return rows;
  }

  function landStructures(input, structures) {
    var base = params(input);
    return structures.map(function (s) {
      var d = copy(base);
      ["land_mode", "land_down", "land_years", "land_per_year", "land_grace_years"].forEach(function (k) { if (k in s) d[k] = s[k]; });
      var r = analyze(d);
      return { name: s.name || "", land_factor: r.land_factor, max_bid: r.max_bid, max_bid_per_m2: r.max_bid_per_m2 };
    });
  }

  function jv(input, ownerCash, share, barter, haircut) {
    haircut = haircut || 0;
    var p = params(input);
    if (!(share >= 0 && share < 1) || !(barter >= 0 && barter < 1) || ownerCash < 0 || !(haircut >= 0 && haircut < 1)) bad("bad jv inputs");
    var T = horizon(p), f = flows(p, T), df = discount(p.discount, T + 1);
    var R = pv(f.rev, df), S = pv(f.salescost, df), C = pv(f.constr, df) + pv(f.over, df), tgt = p.target_margin * R;
    var Tc = p.start_delay + p.build, unit = f.sell * p.price_sqm * f.pidx[Tc] * df[Tc] * (1 - haircut);
    var devCash = R - S - C - ownerCash, devShare = (1 - share) * R - S - C, devBarter = (1 - barter) * (R - S) - C;
    var sMax = 1 - (S + C) / R - p.target_margin, yMax = R - S > 0 ? 1 - (tgt + C) / (R - S) : 0;
    var sMin = ownerCash / R, yMin = unit > 0 ? ownerCash / unit : null;
    function zone(lo, hi) {
      if (lo === null) return { min: null, max: hi, agree: false, mid: null };
      var ok = lo <= hi;
      return { min: lo, max: hi, agree: ok, mid: ok ? (lo + hi) / 2 : null };
    }
    return { pv_revenue: R, pv_sales_cost: S, pv_costs: C, pv_target_profit: tgt, barter_unit_value: unit,
      cash: { owner_pv: ownerCash, dev_profit: devCash, dev_margin: devCash / R },
      share: { share: share, owner_pv: share * R, dev_profit: devShare, dev_margin: devShare / R },
      barter: { barter: barter, owner_pv: barter * unit, dev_profit: devBarter, dev_margin: devBarter / R },
      share_zone: zone(sMin, sMax), barter_zone: zone(yMin, yMax) };
  }

  function tornado(input, swing) {
    swing = swing === undefined ? 0.2 : swing;
    var p = params(input), base = analyze(p).max_bid_per_m2, rows = [];
    TORNADO_DRIVERS.forEach(function (k) {
      var v = p[k], lo = v * (1 - swing), hi = v * (1 + swing);
      if (INT.indexOf(k) >= 0) { lo = Math.max(1, Math.floor(lo + 0.5)); hi = Math.max(1, Math.floor(hi + 0.5)); }
      if (k === "efficiency") hi = Math.min(hi, 1);
      var a = copy(p), b = copy(p); a[k] = lo; b[k] = hi;
      var bl = analyze(a).max_bid_per_m2, bh = analyze(b).max_bid_per_m2;
      rows.push({ driver: k, low_value: lo, high_value: hi, bid_low: bl, bid_high: bh, swing: Math.abs(bh - bl) });
    });
    rows.sort(function (x, y) { return y.swing - x.swing || (x.driver < y.driver ? -1 : x.driver > y.driver ? 1 : 0); });
    return { base: base, rows: rows };
  }

  function bidMap(input, prices, costs) {
    var p = params(input);
    return { prices: prices.slice(), costs: costs.slice(), grid: prices.map(function (pr) {
      return costs.map(function (c) { var d = copy(p); d.price_sqm = pr; d.cost_sqm = c; return analyze(d).max_bid_per_m2; });
    }) };
  }

  return { DEFAULTS: DEFAULTS, analyze: analyze, compare: compare, landStructures: landStructures, jv: jv, tornado: tornado, bidMap: bidMap };
});
