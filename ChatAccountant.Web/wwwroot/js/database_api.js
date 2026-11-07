/* ============================================================================
   database_api.js  -  LIVE DATA PROVIDER (talks to the ASP.NET Core 8 API)
   ----------------------------------------------------------------------------
   Same window.Database contract as database_dummy.js / database_supabase.js, so
   panel.js and the UI do not change. Settings come from js/config.js.

   Login: Google Identity Services pop-up -> access token -> POST /api/auth/google
          -> the API verifies it with Google and returns its own JWT, kept in
          localStorage. (No Google client id configured? It uses POST /api/auth/dev,
          which the API only allows in Development.)
   ============================================================================ */
(function (window) {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var API = String(CFG.apiBaseUrl || "").replace(/\/+$/, "");
  var TOKEN_KEY = "chatAccountant.token";

  /* ---------- token storage ---------- */
  var memToken = null;
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || memToken; } catch (e) { return memToken; } }
  function setToken(t) {
    memToken = t || null;
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ }
  }

  /* ---------- HTTP ---------- */
  function apiError(message, status, code) {
    var e = new Error(message); e.status = status; if (code) e.code = code; return e;
  }

  // Resolves the parsed JSON body (or null for 204 / empty). Rejects with Error(message).
  function api(method, path, body, opts) {
    opts = opts || {};
    var headers = { "Accept": "application/json" };
    var token = getToken();
    if (token && !opts.anonymous) headers["Authorization"] = "Bearer " + token;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    return fetch(API + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) })
      .catch(function () { throw apiError("Can't reach the server. Check your internet connection.", 0); })
      .then(function (res) {
        if (res.status === 204) return null;
        return res.text().then(function (text) {
          var json = null;
          if (text) { try { json = JSON.parse(text); } catch (e) { json = null; } }
          if (res.ok) return json;
          if (res.status === 401 && !opts.anonymous) {
            setToken(null);
            throw apiError("You're signed out. Please sign in again.", 401);
          }
          var msg = (json && (json.message || json.title)) || ("Request failed (" + res.status + ").");
          throw apiError(msg, res.status);
        });
      });
  }

  /* ---------- Google sign-in (Google Identity Services, loaded on demand) ---------- */
  var gisLoading = null;
  function gisReady() { return !!(window.google && window.google.accounts && window.google.accounts.oauth2); }
  function loadGis() {
    if (gisReady()) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { gisLoading = null; reject(apiError("Couldn't load Google sign-in. Check your internet connection.", 0)); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }
  if (CFG.googleClientId && navigator.onLine) { loadGis().catch(function () {}); }   // preload, so the pop-up opens right after the tap

  function googleAccessToken() {
    return new Promise(function (resolve, reject) {
      var client = window.google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleClientId,
        scope: "openid email profile",
        prompt: "select_account",
        callback: function (r) {
          if (!r || r.error || !r.access_token) reject(apiError((r && (r.error_description || r.error)) || "Google sign-in failed.", 0));
          else resolve(r.access_token);
        },
        error_callback: function (e) {
          reject(apiError(e && e.type === "popup_closed" ? "Sign-in was cancelled." : "Google sign-in failed.", 0));
        }
      });
      client.requestAccessToken();
    });
  }

  function finishLogin(res) {
    if (!res || !res.token || !res.user) throw apiError("Sign-in failed. Please try again.", 0);
    setToken(res.token);
    return res.user;
  }

  /* ---------- the Database object the panel talks to ---------- */
  window.Database = {
    mode: "live",
    label: "SQL Server via .NET API",

    auth: {
      getSession: function () {
        if (!getToken()) return Promise.resolve(null);
        return api("GET", "/api/auth/me").catch(function (err) {
          if (err.status === 401) return null;     // expired / invalid token: just show the login screen
          throw err;                               // offline or server down: let the app say so
        });
      },

      loginWithGoogle: function () {
        if (!CFG.googleClientId) {                 // development shortcut (API must allow it)
          return api("POST", "/api/auth/dev", {}, { anonymous: true }).then(finishLogin);
        }
        return loadGis().then(googleAccessToken).then(function (accessToken) {
          return api("POST", "/api/auth/google", { accessToken: accessToken }, { anonymous: true });
        }).then(finishLogin);
      },

      logout: function () { setToken(null); return Promise.resolve(); },

      // Step 1 texts a code to the number; step 2 confirms it and links it to this account.
      sendPhoneOtp: function (phone) {
        return api("POST", "/api/auth/phone/send", { phone: phone }).then(function (r) { return r && r.phone ? r.phone : phone; });
      },
      verifyPhoneOtp: function (phone, code) {
        return api("POST", "/api/auth/phone/verify", { phone: phone, code: String(code || "").trim() });
      }
    },

    config: {
      get: function () { return api("GET", "/api/config"); },                       // null = first-time user
      save: function (config) { return api("PUT", "/api/config", config).then(function () { return config; }); }
    },

    ledger: {
      list: function () { return api("GET", "/api/ledger").then(function (r) { return r || []; }); },
      add: function (entry) {
        return api("POST", "/api/ledger", entry).catch(function (err) {
          if (err.status === 409) err.code = "23505";   // "already recorded" - app.js treats this as success
          throw err;
        });
      }
    },

    /* Transaction requests between users (addressed to a verified mobile number). */
    shares: {
      send: function (input) { return api("POST", "/api/shares", input); },
      listIncoming: function () { return api("GET", "/api/shares/incoming").then(function (r) { return r || []; }); },
      listOutgoing: function () { return api("GET", "/api/shares/outgoing").then(function (r) { return r || []; }); },
      respond: function (id, status) {
        return api("POST", "/api/shares/" + encodeURIComponent(id) + "/respond", { status: status });
      }
    },

    /* Shared business profile of the account that owns a verified mobile number, or null. */
    profiles: {
      lookupByPhone: function (phone) {
        return api("GET", "/api/profiles/lookup?phone=" + encodeURIComponent(phone));
      }
    },

    // Permanently deletes THIS user's transactions, settings and sent requests.
    resetAll: function () { return api("DELETE", "/api/account/data").then(function () {}); }
  };
})(window);
