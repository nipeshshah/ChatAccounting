/* js/loader.js — starts the app.
   1. Fetches the HTML partials listed in index.html (<div data-include="partials/…">) and puts them in place.
   2. Loads the scripts in order (data provider first, app.js last). They share one global scope on purpose:
      every file adds functions/state that the other files call, so ORDER MATTERS — see SCRIPTS below.
   The app has to be served over http(s) (any static server works) because partials are fetched. */
(function () {
  "use strict";
  var cfg = window.APP_CONFIG || { provider: "dummy" };

  var PROVIDER = cfg.provider === "supabase"
    ? [cfg.supabaseLib || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", "js/data/database_supabase.js"]
    : ["js/data/database_dummy.js"];

  var SCRIPTS = [].concat(
    ["assets/vendor/jquery/jquery-3.7.1.min.js"],
    PROVIDER,
    [
      "js/data/panel.js",                 // jQuery promise layer + write queue between the pages and the provider
      // core: helpers, state, the chat UI itself
      "js/core/utils.js",
      "js/core/state.js",
      "js/core/chat-ui.js",
      "js/core/summary.js",
      "js/core/sync-status.js",
      // printing, sharing and documents (bill / statement)
      "js/print/modes.js",
      "js/print/words.js",
      "js/print/output.js",
      "js/print/whatsapp.js",
      "js/print/bill.js",
      "js/print/statement-doc.js",
      // chat flows
      "js/flows/shared.js",
      "js/flows/review-undo.js",
      "js/flows/income-expense.js",
      "js/flows/received-paid.js",
      "js/flows/sale-purchase.js",
      "js/flows/view.js",
      "js/flows/setup-wizard.js",
      "js/flows/main-menu.js",
      // features
      "js/features/export-csv.js",
      "js/features/statement.js",
      "js/features/reporting.js",
      // pages
      "js/pages/navigation.js",
      "js/pages/lock-screen.js",
      "js/pages/settings.js",
      "js/pages/party-sync.js",
      "js/pages/manage.js",
      "js/pages/requests.js",
      "js/pages/reporting.js",
      "js/pages/profile.js",
      // boot
      "js/app.js"
    ]
  );

  function fail(message) {
    var box = document.createElement("div");
    box.style.cssText = "font:14px/1.5 system-ui,sans-serif;color:#fff;background:#0B192C;padding:24px;min-height:100vh;";
    box.innerHTML = "<h2 style='margin:0 0 8px'>Chat Accountant couldn't start</h2><p style='margin:0 0 8px'></p>" +
      "<p style='margin:0;opacity:.8'>The app loads its pages from separate files, so it must be opened through a web server " +
      "(for example <code>npm start</code>, or <code>python3 -m http.server</code> in this folder) — not by double-clicking index.html.</p>";
    box.querySelector("p").textContent = message;
    document.body.innerHTML = "";
    document.body.appendChild(box);
  }

  function fetchText(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " → HTTP " + r.status);
      return r.text();
    });
  }

  // replaces every <div data-include="…"> with that file's markup (partials may include partials)
  function includePartials() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-include]"));
    if (!nodes.length) return Promise.resolve();
    return Promise.all(nodes.map(function (node) {
      return fetchText(node.getAttribute("data-include")).then(function (html) { return { node: node, html: html }; });
    })).then(function (list) {
      list.forEach(function (item) {
        var t = document.createElement("template");
        t.innerHTML = item.html;
        item.node.replaceWith(t.content);
      });
      return includePartials();
    });
  }

  // async=false keeps dynamically added scripts executing in the order they were added
  function loadScripts(list) {
    return new Promise(function (resolve, reject) {
      var left = list.length;
      list.forEach(function (src) {
        var s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.onload = function () { if (--left === 0) resolve(); };
        s.onerror = function () { reject(new Error("Couldn't load " + src)); };
        document.head.appendChild(s);
      });
    });
  }

  includePartials().then(function () { return loadScripts(SCRIPTS); }).catch(function (err) {
    if (window.console) console.error("[loader]", err);
    fail(err && err.message ? err.message : String(err));
  });
})();
