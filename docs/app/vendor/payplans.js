/* Browser port of payplans/engine.py (the Python code is the reference).
 * Only + - * / on doubles, so results match Python. `node tests/test_payplans.js` replays tests/vectors.json. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PayPlans = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DEFAULTS = { down_pct: 0.10, term: 96, freq: 3, grace: 0, delivery_pct: 0.0, delivery_month: 0, balloon_pct: 0.0 };
  var FREQS = [1, 3, 6, 12];
  function bad(m) { throw new Error(m); }
  function share(v, n) { v = Number(v); if (!(v >= 0 && v <= 1)) bad(n + " must be between 0 and 1"); return v; }

  function normalize(plan) {
    var p = {}, k;
    for (k in DEFAULTS) p[k] = DEFAULTS[k];
    for (k in plan) if (k in DEFAULTS) p[k] = plan[k];
    var o = { name: plan.name === undefined ? "" : String(plan.name) };
    o.down_pct = share(p.down_pct, "down_pct"); o.delivery_pct = share(p.delivery_pct, "delivery_pct"); o.balloon_pct = share(p.balloon_pct, "balloon_pct");
    o.term = Math.trunc(Number(p.term)); o.freq = Math.trunc(Number(p.freq)); o.grace = Math.trunc(Number(p.grace)); o.delivery_month = Math.trunc(Number(p.delivery_month));
    if (FREQS.indexOf(o.freq) < 0) bad("freq must be 1, 3, 6 or 12");
    if (!(o.term >= 1) || !(o.grace >= 0) || !(o.delivery_month >= 0)) bad("term must be >= 1; grace and delivery_month >= 0");
    if (o.term < o.freq) bad("term is shorter than one installment period");
    if (o.term > 360 || o.grace > 120 || o.delivery_month > 480) bad("timing out of range");
    if (o.balloon_pct > 0 && (o.freq === 12 || o.term < 12)) bad("yearly payments conflict with yearly installments or a term under 12 months: choose one");
    if (o.down_pct + o.delivery_pct + o.balloon_pct > 1.0 + 1e-12) bad("down payment + delivery + yearly payments exceed 100% of the price");
    return o;
  }

  function schedule(p) {
    var n = Math.floor(p.term / p.freq), inst = 1.0 - p.down_pct - p.delivery_pct - p.balloon_pct;
    if (inst < 1e-12) inst = 0.0;
    var last = p.grace + n * p.freq, flows = {};
    function add(m, x) { flows[m] = (flows[m] || 0.0) + x; }
    add(0, p.down_pct);
    var j;
    for (j = 1; j <= n; j++) add(p.grace + j * p.freq, inst / n);
    var b = Math.floor(p.term / 12);
    for (j = 1; j <= b; j++) add(p.grace + 12 * j, p.balloon_pct / b);
    if (p.delivery_pct > 0.0) add(p.delivery_month > 0 ? p.delivery_month : last, p.delivery_pct);
    return Object.keys(flows).map(Number).sort(function (a, c) { return a - c; }).map(function (m) { return [m, flows[m]]; });
  }

  function pvShare(plan, annualRate) {
    var r = Number(annualRate);
    if (!(r >= 0 && r <= 5)) bad("annual_rate must be between 0 and 5 (500%)");
    var p = normalize(plan), sched = schedule(p), last = sched[sched.length - 1][0], mr = r / 12.0;
    var df = 1.0, total = 0.0, wal = 0.0, nominal = 0.0, i = 0;
    for (var m = 0; m <= last; m++) {
      if (m > 0) df = df / (1.0 + mr);
      if (i < sched.length && sched[i][0] === m) { var x = sched[i][1]; total += x * df; wal += x * m; nominal += x; i++; }
    }
    return [total, wal, nominal, last];
  }

  function compare(price, annualRate, plans, reference) {
    price = Number(price); reference = reference || 0;
    if (!(price > 0)) bad("price must be > 0");
    var rows = plans.map(function (pl) {
      var p = normalize(pl), r = pvShare(p, annualRate);
      return { name: p.name, pv: price * r[0], pv_share: r[0], haircut: 1.0 - r[0], wal_months: r[1], last_month: r[3], nominal: r[2] };
    });
    var ref = rows.length ? rows[reference].pv_share : 1.0;
    rows.forEach(function (r) { r.equiv_price = price * ref / r.pv_share; });
    return { price: price, annual_rate: Number(annualRate), reference: reference, rows: rows };
  }

  return { DEFAULTS: DEFAULTS, FREQS: FREQS, normalize: normalize, schedule: schedule, pvShare: pvShare, compare: compare };
});
