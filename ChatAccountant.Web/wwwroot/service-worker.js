/* ============================================================================
   service-worker.js  -  makes the app shell work offline and load instantly.
   ----------------------------------------------------------------------------
   * The app shell (HTML/CSS/JS/fonts/icons) is cached on install.
   * Requests to the API are NEVER cached: your books always come from the server.
   * IMPORTANT: change VERSION every time you deploy changed front-end files, so
     installed apps pick up the update (they show a "Reload" banner).
   ============================================================================ */
const VERSION = "v1.1.0";
const CACHE = "chat-accountant-" + VERSION;

const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/tailwind.css",
  "css/app.css",
  "lib/fonts/fonts.css",
  "lib/phosphor/regular.css",
  "lib/phosphor/bold.css",
  "lib/phosphor/Phosphor.woff2",
  "lib/phosphor/Phosphor-Bold.woff2",
  "lib/fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  "lib/fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2",
  "lib/fonts/jetbrains-mono-latin-wght-normal.woff2",
  "lib/fonts/jetbrains-mono-latin-ext-wght-normal.woff2",
  "lib/jquery/jquery-3.7.1.min.js",
  "lib/pdf/html2canvas.min.js",
  "lib/pdf/jspdf.umd.min.js",
  "js/config.js",
  "js/database_api.js",
  "js/panel.js",
  "js/pwa.js",
  "js/01-state.js",
  "js/02-chat-ui.js",
  "js/03-export.js",
  "js/04-helpers.js",
  "js/05-flows-basic.js",
  "js/06-gst-billing.js",
  "js/07-print-share.js",
  "js/08-sale-purchase.js",
  "js/09-views.js",
  "js/10-statements.js",
  "js/11-main-menu.js",
  "js/12-navigation.js",
  "js/13-pin-settings.js",
  "js/14-manage.js",
  "js/15-requests.js",
  "js/16-profile.js",
  "js/17-boot.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-48.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));   // new worker waits until the user taps "Reload"
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("chat-accountant-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;   // API + Google scripts: straight to the network

  // Page loads: network first (so a deploy shows up), cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("index.html", copy));
        return res;
      }).catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Everything else: cached copy first, refreshed in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
