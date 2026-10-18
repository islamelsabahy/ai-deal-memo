/* Optional AI layer (bring your own key). The tool works fully without it.
 * The key lives only in this page's memory: it is never stored, logged or sent anywhere except api.anthropic.com. */
(function (root) {
  "use strict";
  var TX = {
    ar: { title: "طبقة AI اختيارية", note: "الأداة شغالة كاملة من غير AI. لو عايز سرد مكتوب للنتيجة، حط مفتاح Anthropic API بتاعك. المفتاح بيفضل في الصفحة دي بس ومش بيتخزن.", key: "مفتاح API", model: "الموديل", run: "اكتب التحليل", busy: "جاري الكتابة…", err: "حصل خطأ: ", nokey: "حط المفتاح الأول", lang: "اكتب الرد بالعربية المصرية المهنية." },
    en: { title: "Optional AI layer", note: "The tool is complete without AI. To get a written narrative of the result, paste your own Anthropic API key. The key stays in this page only and is never stored.", key: "API key", model: "Model", run: "Write the analysis", busy: "Writing…", err: "Error: ", nokey: "Paste a key first", lang: "Reply in clear professional English." }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function mount(el, opts) {
    var lang = function () { return (opts.lang && opts.lang()) || "en"; };
    var keyVal = "";
    function render() {
      var t = TX[lang()];
      el.innerHTML = '<details class="ai"><summary>✦ ' + t.title + '</summary><p class="note">' + t.note + '</p>' +
        '<div class="row"><div class="f"><label>' + t.key + '</label><input type="password" autocomplete="off" class="ai-key" placeholder="sk-ant-…"></div>' +
        '<div class="f"><label>' + t.model + '</label><input class="ai-model" value="' + esc(opts.model || "claude-sonnet-5-5") + '"></div></div>' +
        '<div class="row" style="margin-top:8px"><button class="b ai-run" type="button">' + t.run + '</button></div><div class="ai-out"></div></details>';
      var k = el.querySelector(".ai-key"); k.value = keyVal; k.oninput = function () { keyVal = k.value.trim(); };
      el.querySelector(".ai-run").onclick = run;
    }
    function run() {
      var t = TX[lang()], out = el.querySelector(".ai-out"), btn = el.querySelector(".ai-run");
      if (!keyVal) { out.textContent = t.nokey; return; }
      btn.disabled = true; out.textContent = t.busy;
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": keyVal, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: el.querySelector(".ai-model").value.trim(), max_tokens: 1500, system: opts.system + " " + t.lang + " Use only the numbers given; never invent figures.", messages: [{ role: "user", content: opts.prompt() }] })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || r.status); return j; }); })
        .then(function (j) { out.textContent = (j.content || []).filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("\n"); })
        .catch(function (e) { out.textContent = t.err + e.message; })
        .then(function () { btn.disabled = false; });
    }
    render();
    return { render: render };
  }
  root.AIPanel = { mount: mount };
})(typeof self !== "undefined" ? self : this);
