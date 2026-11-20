/* ============================================================================
   database_dummy.js  —  DUMMY DATA PROVIDER (runs with no server)
   ----------------------------------------------------------------------------
   This is the ONLY file that knows where data lives. The HTML never calls it
   directly: index.html -> panel.js (jQuery) -> window.Database (this file).

   TO GO LIVE LATER
   Write a file (e.g. database_supabase.js) that defines window.Database with
   the SAME shape as below, then select it with  provider  in js/config.js.
   Nothing else has to change.

   CONTRACT — every method may return a native Promise or a jQuery promise:

     Database.mode                    "dummy" | "live"   (UI shows a demo badge for "dummy")
     Database.label                   text shown on the Profile page

     Database.auth.getSession()       -> user | null      (called on every page load)
     Database.auth.loginWithGoogle()  -> user             (live: supabase.auth.signInWithOAuth)
     Database.auth.logout()           -> (nothing)
     Database.auth.sendPhoneOtp(phone)        -> normalised number   (live: texts a code)
     Database.auth.verifyPhoneOtp(phone,code) -> updated user, now with .phone (demo code: 123456)

     Database.config.get()            -> config object | null   (null = first-time user)
     Database.config.save(config)     -> config                 (whole object, saved as-is)

     Database.ledger.list()           -> array of ledger entries
     Database.ledger.add(entry)       -> saved entry, with a unique .id
     Database.ledger.remove(id)       -> (nothing)   used by Undo right after a save

     Database.profiles                OPTIONAL. If a provider leaves it out, profile lookup is skipped.
     Database.profiles.lookupByPhone(phone)
                                      -> { name, address, state, gstNumber } | null   (the shared
                                         business profile of the account with that verified number)

     Database.files                   OPTIONAL. If a provider leaves it out, bills go through the share sheet instead of a WhatsApp link.
     Database.files.uploadBill(blob, filename)
                                      -> { url, days }   a private link to the PDF, valid for `days` days

     Database.resetAll()              -> (nothing)   deletes this user's config + ledger
                                                     (and the requests this user has sent)

     Database.shares                  OPTIONAL. If a provider leaves it out, the app hides Requests.
     Database.shares.send({kind, toPhone, payload})
                                      -> saved share (+ .notifyStatus: "sent" | "not-sent" | "demo")
     Database.shares.listIncoming()   -> pending shares addressed to the signed-in user's verified mobile number
     Database.shares.listOutgoing()   -> shares this user sent, newest first, any status
     Database.shares.respond(id, "accepted" | "rejected")
                                      -> updated share. Rejects if it is not addressed to the
                                         signed-in user or was already answered.
     Database.shares.withdraw(id)     -> true if a still-pending request sent by this user was removed (Undo)

   A "share" is a transaction one user proposes to ANOTHER user's books. Nothing is written to the
   recipient's account until they accept — the app then records the mirror entry itself, in the
   recipient's own account, so no provider ever writes into someone else's data.
     share: { id, kind: "sale"|"purchase"|"received"|"paid",       (kind is from the SENDER's side)
              status: "pending"|"accepted"|"rejected",
              fromPhone, toPhone, createdAt, respondedAt,
              payload: { from:{name,business,state,address,gstNumber}, toName,
                         entry:{date,amount,description,category,account,
                                taxableAmount,gstPercent,gstAmount,taxSplit} } }

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
  function normalizePhone(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return "";
    var d = s.replace(/\D/g, "");
    if (s.charAt(0) !== "+") {
      if (d.length === 11 && d.charAt(0) === "0") d = "91" + d.slice(1);   // 0 98765 43210
      else if (d.length === 10) d = "91" + d;                              // bare Indian mobile
    }
    return /^[1-9]\d{7,14}$/.test(d) ? "+" + d : "";
  }

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
  function accountKeys() {         // storage keys of every account that has ever signed in here
    var out = [], i, k;
    if (canStore) { for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (k.indexOf(PREFIX + "account.") === 0) out.push(k.slice(PREFIX.length)); } }
    else { Object.keys(memory).forEach(function (m) { if (m.indexOf("account.") === 0) out.push(m); }); }
    return out;
  }
  var pendingPhone = null;         // number a demo code was "sent" to
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
          user.phone = prev && prev.phone ? prev.phone : "";
          user.lastSignInAt = now;
          currentUserId = user.id;
          write(userKey("account", user.id), { createdAt: user.createdAt, phone: user.phone });
          write("session", user);
          return user;
        }, 700);
      },
      logout: function () {
        return wait(function () { remove("session"); currentUserId = null; });
      },
      sendPhoneOtp: function (phone) {
        return wait(function () {
          var p = normalizePhone(phone);
          if (!p) throw new Error("Enter a valid mobile number, e.g. +91 98765 43210.");
          pendingPhone = p;            // demo: no SMS is sent; the code is always 123456
          return p;
        });
      },
      verifyPhoneOtp: function (phone, code) {
        return wait(function () {
          var p = normalizePhone(phone), me = read("session");
          if (!me) throw new Error("You're signed out. Please sign in again.");
          if (!p || p !== pendingPhone) throw new Error("Request a code for this number first.");
          if (String(code).trim() !== "123456") throw new Error("Wrong code (the demo code is 123456).");
          me.phone = p;
          write("session", me);
          var acc = read(userKey("account")) || {};
          acc.phone = p;
          write(userKey("account"), acc);
          pendingPhone = null;
          return clone(me);
        });
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
      },
      remove: function (id) {
        return wait(function () {
          var list = read(userKey("ledger")) || [];
          write(userKey("ledger"), list.filter(function (e) { return e.id !== id; }));
        });
      }
    },

    /* ---------- transaction requests between users ----------
       Stored in ONE browser-wide list (not scoped per user) because they cross accounts:
       a request is visible to whoever is signed in with the address it was sent to.
       Demo tip: verify a number in Profile (code 123456), add a debtor with that same number, and send
       yourself a request to try the full loop. */
    shares: {
      send: function (input) {
        return wait(function () {
          var me = read("session");
          if (!me) throw new Error("You're signed out. Please sign in again.");
          if (!input || !input.toPhone || !input.kind || !input.payload) throw new Error("Incomplete request.");
          if (!me.phone) throw new Error("Verify your own mobile number in the Profile tab before sending requests.");
          if (!normalizePhone(input.toPhone)) throw new Error("That mobile number doesn't look right.");
          var list = read("shares") || [];
          var share = {
            id: "s_" + newId(),
            kind: input.kind,
            status: "pending",
            fromPhone: me.phone,
            fromUserId: me.id,
            toPhone: normalizePhone(input.toPhone),
            createdAt: new Date().toISOString(),
            respondedAt: null,
            payload: clone(input.payload)
          };
          list.push(share);
          write("shares", list);
          var out = clone(share);
          out.notifyStatus = "demo";            // no SMS is sent in demo mode
          return out;
        });
      },
      listIncoming: function () {
        return wait(function () {
          var me = read("session");
          var phone = me && me.phone ? me.phone : null;
          if (!phone) return [];
          return (read("shares") || []).filter(function (s) { return s.status === "pending" && s.toPhone === phone; }).map(clone);
        });
      },
      listOutgoing: function () {
        return wait(function () {
          var me = read("session");
          if (!me) return [];
          return (read("shares") || []).filter(function (s) { return s.fromUserId === me.id; }).reverse().map(clone);
        });
      },
      respond: function (id, status) {
        return wait(function () {
          if (status !== "accepted" && status !== "rejected") throw new Error("Invalid response.");
          var me = read("session");
          var phone = me && me.phone ? me.phone : null;
          var list = read("shares") || [];
          var share = list.filter(function (s) { return s.id === id; })[0];
          if (!share || !phone || share.toPhone !== phone) throw new Error("This request no longer exists.");
          if (share.status !== "pending") throw new Error("This request was already answered.");
          share.status = status;
          share.respondedAt = new Date().toISOString();
          write("shares", list);
          return clone(share);
        });
      },
      withdraw: function (id) {
        return wait(function () {
          var me = read("session");
          var list = read("shares") || [];
          var keep = list.filter(function (s) { return !(s.id === id && me && s.fromUserId === me.id && s.status === "pending"); });
          var removed = keep.length !== list.length;
          if (removed) write("shares", keep);
          return removed;
        });
      }
    },

    /* Demo: searches the accounts that signed in on this browser. (The demo has one Google account,
       so it can only find YOU - verify a number, save a business profile, then add yourself as a
       debtor with that same number to try the "fetch profile" flow.) */
    profiles: {
      lookupByPhone: function (phone) {
        return wait(function () {
          var me = read("session"), p = normalizePhone(phone);
          if (!me || !me.phone || !p) return null;
          var keys = accountKeys();
          for (var i = 0; i < keys.length; i++) {
            var acc = read(keys[i]);
            if (!acc || acc.phone !== p) continue;
            var cfg = read("config." + keys[i].slice("account.".length));
            var shop = cfg && cfg.shop;
            if (shop && shop.name && shop.discoverable !== false) {
              return { name: shop.name, address: shop.address || "", state: shop.state || "", gstNumber: shop.gstNumber || "" };
            }
          }
          return null;
        });
      }
    },

    resetAll: function () {
      // Demo mode: wipes THIS user's data so the blank starting state is restored on next load,
      // plus the requests this user sent (so nobody can accept a transaction that no longer exists).
      return wait(function () {
        remove(userKey("config")); remove(userKey("ledger"));
        var me = read("session");
        if (me) write("shares", (read("shares") || []).filter(function (s) { return s.fromUserId !== me.id; }));
      });
    }
  };
})(window);
