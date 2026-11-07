/* ============================================================================
   panel.js  —  jQuery PANEL between the HTML and the API/database file
   ----------------------------------------------------------------------------
   The page never touches storage or the server. It only calls Panel.*, and the
   Panel calls window.Database (database_dummy.js today, a real backend later).

   What the panel adds on top of the Database file:
     • one consistent jQuery promise API for every call (.done / .fail / .always)
     • an ordered WRITE QUEUE, so saves reach the server in the order they were made
     • coalescing: several quick config saves collapse into the latest one
     • snapshots: data is copied at call time, so later edits can't change a save
     • events for the UI (Panel.on):
         "busy" / "idle"   a call started / all calls finished
         "saving" / "saved" / "error"   write progress (error has .write = true for writes)
         "login" / "logout"

   Load order in index.html:  jQuery -> database_*.js -> panel.js
   ============================================================================ */
(function (window, $) {
  "use strict";
  if (!$) throw new Error("panel.js needs jQuery — load it first.");
  if (!window.Database) throw new Error("panel.js needs a database file (e.g. database_dummy.js) loaded first.");

  var DB = window.Database;
  var $bus = $(document);
  var pending = 0;

  function emit(name, payload) { $bus.trigger("panel:" + name, [payload || {}]); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  // Runs one Database call and normalises it to a jQuery promise (works with native Promises too).
  function run(label, fn, isWrite) {
    var d = $.Deferred();
    pending++;
    emit("busy", { label: label, pending: pending });
    if (isWrite) emit("saving", { label: label });

    var result;
    try { result = fn(); } catch (err) { result = $.Deferred().reject(err).promise(); }

    $.when(result)
      .done(function (value) {
        if (isWrite) emit("saved", { label: label });
        d.resolve(value);
      })
      .fail(function (err) {
        if (window.console) console.error("[Panel] " + label + " failed:", err);
        emit("error", { label: label, error: err, write: !!isWrite });
        d.reject(err);
      })
      .always(function () {
        pending--;
        emit("idle", { pending: pending });
      });

    return d.promise();
  }

  /* ---------- ordered write queue ---------- */
  var queue = [];
  var working = false;

  function enqueue(label, key, fn) {
    if (key) {                                   // same key still waiting? just replace it with the newer save
      for (var i = 0; i < queue.length; i++) {
        if (queue[i].key === key) { queue[i].fn = fn; return queue[i].d.promise(); }
      }
    }
    var job = { label: label, key: key, fn: fn, d: $.Deferred() };
    queue.push(job);
    pump();
    return job.d.promise();
  }

  function pump() {
    if (working || !queue.length) return;
    working = true;
    var job = queue.shift();
    run(job.label, job.fn, true)
      .done(job.d.resolve)
      .fail(job.d.reject)
      .always(function () { working = false; pump(); });
  }

  /* ---------- public API ---------- */
  var Panel = {
    mode: DB.mode,
    label: DB.label || DB.mode,
    isDemo: DB.mode === "dummy",
    user: null,                                  // filled after session()/loginWithGoogle()

    on: function (name, handler) {
      $bus.on("panel:" + name, function (e, payload) { handler(payload, e); });
      return Panel;
    },

    auth: {
      session: function () {
        return run("auth.session", function () { return DB.auth.getSession(); })
          .done(function (u) { Panel.user = u || null; });
      },
      loginWithGoogle: function () {
        return run("auth.login", function () { return DB.auth.loginWithGoogle(); })
          .done(function (u) { Panel.user = u || null; emit("login", { user: u }); });
      },
      logout: function () {
        return run("auth.logout", function () { return DB.auth.logout(); })
          .done(function () { Panel.user = null; emit("logout"); });
      },
      // Mobile-number verification (needed to send/receive transaction requests)
      sendPhoneOtp: function (phone) {
        return run("auth.phoneOtp", function () { return DB.auth.sendPhoneOtp(phone); });
      },
      verifyPhoneOtp: function (phone, code) {
        return run("auth.phoneVerify", function () { return DB.auth.verifyPhoneOtp(phone, code); })
          .done(function (u) { if (u) Panel.user = u; });
      }
    },

    config: {
      load: function () { return run("config.load", function () { return DB.config.get(); }); },
      save: function (config) {
        var snapshot = clone(config);
        return enqueue("config.save", "config", function () { return DB.config.save(snapshot); });
      }
    },

    ledger: {
      list: function () { return run("ledger.list", function () { return DB.ledger.list(); }); },
      add: function (entry) {
        var snapshot = clone(entry);
        return enqueue("ledger.add", null, function () { return DB.ledger.add(snapshot); });
      }
    },

    // Transaction requests between users. Optional: a provider without Database.shares just
    // turns the feature off (supportsShares = false) instead of breaking.
    supportsShares: !!DB.shares,
    supportsLookup: !!(DB.profiles && DB.profiles.lookupByPhone),
    profiles: {
      lookupByPhone: function (phone) { return run("profiles.lookup", function () { return DB.profiles.lookupByPhone(phone); }); }
    },
    supportsPhone: !!(DB.auth && DB.auth.sendPhoneOtp && DB.auth.verifyPhoneOtp),
    shares: {
      send: function (input) {
        var snapshot = clone(input);
        return enqueue("shares.send", null, function () { return DB.shares.send(snapshot); });
      },
      listIncoming: function () { return run("shares.incoming", function () { return DB.shares.listIncoming(); }); },
      listOutgoing: function () { return run("shares.outgoing", function () { return DB.shares.listOutgoing(); }); },
      respond: function (id, status) {
        return enqueue("shares.respond", null, function () { return DB.shares.respond(id, status); });
      }
    },

    // Everything the app needs after sign-in, in one call
    loadAll: function () {
      return $.when(Panel.config.load(), Panel.ledger.list()).then(function (config, ledger) {
        return { config: config, ledger: ledger || [] };
      });
    },

    resetAll: function () {
      return enqueue("resetAll", null, function () { return DB.resetAll(); });
    },

    pending: function () { return pending + queue.length; }
  };

  window.Panel = Panel;
})(window, window.jQuery);
