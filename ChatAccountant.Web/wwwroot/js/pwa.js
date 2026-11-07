/* ============================================================================
   pwa.js  -  service-worker registration, "new version" banner, install helper
   Exposes window.PWA.buildInstallCard(container) for the Settings page.
   ============================================================================ */
(function (window) {
  "use strict";
  var deferredPrompt = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function isIos() { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();               // keep the event so the Settings button can trigger it
    deferredPrompt = e;
    document.dispatchEvent(new CustomEvent("pwa:installable"));
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    document.dispatchEvent(new CustomEvent("pwa:installed"));
  });

  function toast(message, actionLabel, onAction) {
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 70px);z-index:200;max-width:92%;"
      + "background:#0B192C;color:#fff;border:1px solid #2A3F5F;border-radius:12px;padding:10px 12px;font-size:12.5px;display:flex;gap:12px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.3)";
    var span = document.createElement("span"); span.textContent = message; el.appendChild(span);
    if (actionLabel) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = actionLabel;
      b.style.cssText = "background:#2563EB;color:#fff;border-radius:8px;padding:5px 10px;font-weight:700;font-size:12px";
      b.onclick = function () { el.remove(); if (onAction) onAction(); };
      el.appendChild(b);
    }
    document.body.appendChild(el);
    return el;
  }

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").then(function (reg) {
        function promptReload(worker) {
          toast("A new version is available.", "Reload", function () { worker.postMessage("SKIP_WAITING"); });
        }
        if (reg.waiting && navigator.serviceWorker.controller) promptReload(reg.waiting);
        reg.addEventListener("updatefound", function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", function () {
            if (w.state === "installed" && navigator.serviceWorker.controller) promptReload(w);
          });
        });
        // check for a newer version whenever the app comes back to the foreground
        document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") reg.update().catch(function () {}); });
      }).catch(function (err) { if (window.console) console.warn("[pwa] service worker not registered:", err); });

      var reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (reloading) return; reloading = true; window.location.reload();
      });
    });
  }

  window.addEventListener("offline", function () { toast("You're offline. Saving needs a connection."); });

  /* Settings card: "Install app" */
  function buildInstallCard(container) {
    var card = document.createElement("div");
    card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
    function render() {
      var body, status;
      if (isStandalone()) { status = "Installed on this device"; body = ""; }
      else if (deferredPrompt) {
        status = "Add it to your home screen for a full-screen app";
        body = '<button type="button" id="pwaInstallBtn" class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg py-2">Install app</button>';
      } else if (isIos()) {
        status = "Add it to your home screen";
        body = '<p class="text-[11px] text-slate-600 mt-2 leading-relaxed">In Safari tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>';
      } else {
        status = "Install from your browser menu";
        body = '<p class="text-[11px] text-slate-600 mt-2 leading-relaxed">Open the browser menu and choose <b>Install app</b> / <b>Add to Home screen</b>. (Needs HTTPS.)</p>';
      }
      card.innerHTML = '<div class="flex items-center gap-2">'
        + '<div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-device-mobile-camera text-slate-600"></i></div>'
        + '<div class="min-w-0"><div class="text-sm font-semibold text-slate-800">Install app</div><div class="text-[11px] text-slate-500">' + status + '</div></div></div>' + body;
      var btn = card.querySelector("#pwaInstallBtn");
      if (btn) btn.onclick = function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () { deferredPrompt = null; render(); });
      };
    }
    render();
    document.addEventListener("pwa:installable", render);
    document.addEventListener("pwa:installed", render);
    container.appendChild(card);
  }

  window.PWA = { buildInstallCard: buildInstallCard, isStandalone: isStandalone };
})(window);
