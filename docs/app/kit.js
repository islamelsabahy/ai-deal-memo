/* Shared page helpers: bilingual text, help tips, CSV download. */
(function (root) {
  "use strict";
  var K = {};
  K.lang = (function () { try { return localStorage.getItem("ie_lang") || "ar"; } catch (e) { return "ar"; } })();
  K.setLang = function (l) { K.lang = l; try { localStorage.setItem("ie_lang", l); } catch (e) {} document.documentElement.lang = l; document.documentElement.dir = l === "ar" ? "rtl" : "ltr"; };
  K.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  K.q = function (text) { return '<button class="q" type="button" data-tip="' + K.esc(text) + '">?</button>'; };
  K.fmt = function (x, d) { return Number(x).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  K.csv = function (rows, name) {
    var safe = function (v) { if (typeof v === "number") return String(v); v = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows.map(function (r) { return r.map(safe).join(","); }).join("\n")], { type: "text/csv" }));
    a.download = name; a.click();
  };
  K.initTips = function () {
    var tip = document.createElement("div"); tip.className = "tip"; document.body.appendChild(tip);
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-tip]");
      if (b) { tip.textContent = b.getAttribute("data-tip"); tip.style.display = "block"; var r = b.getBoundingClientRect(); tip.style.top = Math.min(innerHeight - 80, r.bottom + 6) + "px"; tip.style.left = Math.max(8, Math.min(innerWidth - 280, r.left - 120)) + "px"; e.stopPropagation(); return; }
      tip.style.display = "none";
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") tip.style.display = "none"; });
  };
  root.Kit = K;
})(typeof self !== "undefined" ? self : this);
