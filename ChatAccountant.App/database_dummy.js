/* ============================================================================
   database_dummy.js  —  DUMMY DATA PROVIDER (runs with no server)
   ----------------------------------------------------------------------------
   This is the ONLY file that knows where data lives. The HTML never calls it
   directly: index.html -> panel.js (jQuery) -> window.Database (this file).

   TO GO LIVE LATER
   Write a file (e.g. database_supabase.js) that defines window.Database with
   the SAME shape as below, then swap the <script src="database_dummy.js"> tag
   in index.html for it. Nothing else has to change.

   CONTRACT — every method may return a native Promise or a jQuery promise:

     Database.mode                    "dummy" | "live"   (UI shows a demo badge for "dummy")
     Database.label                   text shown on the Profile page

     Database.auth.getSession()       -> user | null      (called on every page load)
     Database.auth.loginWithGoogle()  -> user             (live: supabase.auth.signInWithOAuth)
     Database.auth.logout()           -> (nothing)

     Database.config.get()            -> config object | null   (null = first-time user)
     Database.config.save(config)     -> config                 (whole object, saved as-is)

     Database.ledger.list()           -> array of ledger entries
     Database.ledger.add(entry)       -> saved entry, with a unique .id

     Database.resetAll()              -> (nothing)   deletes this user's config + ledger

   user shape (what a Google login provides):
     { id, name, givenName, familyName, email, emailVerified,
       picture, locale, provider: "google", createdAt, lastSignInAt }

   config shape: { currency, categories:{income[],expense[]}, accounts[],
                   debtors[], creditors[], gstRates[], billCounter,
                   invoiceFormat, shop:{name,address,state,gstNumber} }

   ledger entry shape: { id, date, type:"income"|"expense", category, account,
                         description, amount, and for GST credit sales/purchases:
                         taxableAmount, gstPercent, gstAmount, taxSplit, party }
   ============================================================================ */
(function (window) {
  "use strict";

  var LATENCY_MS = 150;            // simulated network delay, so the UI is tested against async behaviour
  var PREFIX = "dummyDB.";         // keys used in browser storage

  /* ---------- storage (browser storage, with an in-memory fallback) ---------- */
  var memory = {};
  var canStore = (function () {
    try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; }
    catch (e) { return false; }
  })();
  function read(key) {
    var raw = canStore ? localStorage.getItem(PREFIX + key) : memory[key];
    return raw ? JSON.parse(raw) : null;
  }
  function write(key, value) {
    var raw = JSON.stringify(value);
    if (canStore) localStorage.setItem(PREFIX + key, raw); else memory[key] = raw;
  }
  function remove(key) {
    if (canStore) localStorage.removeItem(PREFIX + key); else delete memory[key];
  }

  /* ---------- helpers ---------- */
  function wait(fn, ms) {          // run fn after a simulated delay, as a native Promise
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(fn()); } catch (e) { reject(e); }
      }, ms == null ? LATENCY_MS : ms);
    });
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function newId() { return "e_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- dummy "Google" account ---------- */
  var GOOGLE_USER = {
    id: "google|108234567890123456789",
    name: "Demo User",
    givenName: "Demo",
    familyName: "User",
    email: "demo.user@gmail.com",
    emailVerified: true,
    picture: null,                 // a real Google login returns an https://lh3.googleusercontent.com/... avatar URL
    locale: "en-IN",
    provider: "google"
  };

  /* ---------- fresh starting state (no sample/demo data) ----------
     Categories and accounts are sensible app defaults a new user needs to get going.
     Everything else — shop profile, GST rates, debtors, creditors, ledger — starts
     genuinely empty; the app's own first-time prompts (business profile, GST rates)
     fill these in as the user actually uses it. */
  function seedConfig() {
    return {
      currency: "₹",
      categories: {
        income: ["Consulting", "Salary", "Interest Income", "Other Income"],
        expense: ["Rent", "Utilities", "Salaries & Wages", "Office Supplies", "Marketing", "Travel", "Software & Subscriptions", "Bank Fees", "Miscellaneous"]
      },
      accounts: ["Cash", "UPI", "Other"],
      gstRates: [],
      billCounter: 1,
      invoiceFormat: "INV-[INDEX]",
      shop: { name: "", address: "", state: "", gstNumber: "" },
      debtors: [],
      creditors: []
    };
  }

  function seedLedger() {
    return [];
  }

  /* ---------- per-user key scoping ----------
     "session" is the single active browser session (unscoped — it's how we know WHO
     is currently signed in). Everything else — account, config, ledger — is namespaced
     by that user's id, so each signed-in user only ever sees their own data. */
  var currentUserId = null;
  function userKey(name, idOverride) { return name + "." + (idOverride || currentUserId || "anon"); }

  /* ---------- the Database object the panel talks to ---------- */
  window.Database = {
    mode: "dummy",
    label: "Dummy database (this browser only)",

    auth: {
      getSession: function () {
        return wait(function () {
          var session = read("session");
          currentUserId = session ? session.id : null;
          return session;
        });
      },
      loginWithGoogle: function () {
        // Simulates the Google sign-in pop-up (~0.7s), then returns the dummy Google account.
        return wait(function () {
          var user = clone(GOOGLE_USER);
          var prev = read(userKey("account", user.id));
          var now = new Date().toISOString();
          user.createdAt = prev ? prev.createdAt : now;
          user.lastSignInAt = now;
          currentUserId = user.id;
          write(userKey("account", user.id), { createdAt: user.createdAt });
          write("session", user);
          return user;
        }, 700);
      },
      logout: function () {
        return wait(function () { remove("session"); currentUserId = null; });
      }
    },

    config: {
      get: function () {
        return wait(function () {
          var cfg = read(userKey("config"));
          if (!cfg) { cfg = seedConfig(); write(userKey("config"), cfg); }
          return cfg;
        });
      },
      save: function (config) {
        return wait(function () { write(userKey("config"), config); return config; });
      }
    },

    ledger: {
      list: function () {
        return wait(function () {
          var list = read(userKey("ledger"));
          if (!list) { list = seedLedger(); write(userKey("ledger"), list); }
          return list;
        });
      },
      add: function (entry) {
        return wait(function () {
          var list = read(userKey("ledger")) || seedLedger();
          var saved = clone(entry);
          saved.id = newId();
          list.push(saved);
          write(userKey("ledger"), list);
          return saved;
        });
      }
    },

    resetAll: function () {
      // Demo mode: wipes THIS user's data so the dummy seed data is restored on next load.
      return wait(function () { remove(userKey("config")); remove(userKey("ledger")); });
    }
  };
})(window);
