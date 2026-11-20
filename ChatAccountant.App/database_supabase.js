/* ============================================================================
   database_supabase.js  —  LIVE DATA PROVIDER (Supabase: Postgres + Google login)
   ----------------------------------------------------------------------------
   Drop-in replacement for database_dummy.js. It defines the same window.Database
   contract, so panel.js and index.html do not change — you only swap scripts.

   SETUP (one time)
   1. Supabase project -> SQL Editor -> run  supabase_schema.sql  (tables + security).
   2. Authentication -> Providers -> Google: enable it and paste your Google OAuth
      client ID + secret. In Google Cloud Console the OAuth client's "Authorized
      redirect URI" must be:   https://<your-project-ref>.supabase.co/auth/v1/callback
   3. Authentication -> URL Configuration: add the address this app is served from
      to "Redirect URLs" (e.g. https://your-name.github.io/your-repo/  and, for
      testing, http://localhost:8000/ ). It must match the page URL exactly.
   4. Put your project URL and anon / publishable key below. (Both are meant to be
      public; row-level security protects the data. NEVER use the service_role /
      secret key here.)
   5. In index.html replace
          <script src="database_dummy.js"></script>
      with
          <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
          <script src="database_supabase.js"></script>

   NOTE: Google sign-in is a full-page redirect and needs the app served over
   http(s). It cannot work from a double-clicked file:// page.

   HOW LOGIN DIFFERS FROM THE DUMMY
   loginWithGoogle() sends the browser to Google, so its promise intentionally
   never resolves. When Google sends the user back, the page boots again and
   getSession() finds the signed-in user — the existing boot code already handles
   that path.

   WHERE THE DATA GOES
     user_config      one row per user: the whole config object, saved as-is
     ledger_entries   one row per transaction (real columns, so it can be queried)
   Every row carries user_id, and row-level security restricts each signed-in user
   to their own rows.
   ============================================================================ */
(function (window) {
  "use strict";

  /* ---------- 1. YOUR PROJECT SETTINGS ----------
     You can also define window.SUPABASE_CONFIG = { url, anonKey, redirectTo }
     in a small inline script before this file, to keep keys out of this file. */
  var CONFIG = window.SUPABASE_CONFIG || {
    url: "https://wrqocosuhmepkokmgxew.supabase.co/",
    anonKey: "sb_publishable_j1xqkFAUzDAk3Iw2mpByeg_c_Is7hdy"
    // redirectTo: "https://your-name.github.io/your-repo/"   // optional; defaults to this page's address
  };

  var TABLE_CONFIG = "user_config";
  var TABLE_LEDGER = "ledger_entries";
  var PAGE_SIZE = 1000;            // rows fetched per request (Supabase's default per-request cap)

  /* ---------- 2. CLIENT ---------- */
  var client = null;
  var initError = null;

  (function init() {
    try {
      var placeholder = /YOUR-/.test(String(CONFIG && CONFIG.url) + String(CONFIG && CONFIG.anonKey));
      if (!CONFIG || !CONFIG.url || !CONFIG.anonKey || placeholder) {
        throw new Error("Supabase isn't configured yet. Open database_supabase.js and set your project URL and anon key (see the setup steps at the top of that file).");
      }
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("The Supabase library didn't load. In index.html, add <script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script> before database_supabase.js.");
      }
      client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
        auth: {
          flowType: "pkce",            // the login code is exchanged for tokens; tokens never sit in the URL
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true     // finishes the Google redirect when the user comes back
        }
      });
    } catch (e) {
      initError = e;
      if (window.console) console.error("[database_supabase] " + e.message);
    }
  })();

  /* ---------- 3. HELPERS ---------- */
  function ensureClient() {
    if (!client) throw initError || new Error("Supabase isn't ready.");
    return client;
  }

  // Runs fn(client) as a Promise, so a synchronous throw becomes a normal rejection.
  function run(fn) {
    return new Promise(function (resolve) { resolve(fn(ensureClient())); });
  }

  function toError(err) {
    if (err instanceof Error) return err;
    var msg = (err && err.message) || String(err);
    var tableMissing = err && (err.code === "42P01" || err.code === "PGRST205" || /schema cache|does not exist/i.test(msg));
    if (tableMissing && /user_config|ledger_entries/.test(msg)) {
      msg += " — have you run supabase_schema.sql in your Supabase project?";
    }
    var e = new Error(msg);
    if (err) { e.code = err.code; e.details = err.details; e.hint = err.hint; e.status = err.status; }
    return e;
  }

  // supabase-js resolves with { data, error } instead of throwing
  function unwrap(res) {
    if (res && res.error) throw toError(res.error);
    return res ? res.data : null;
  }

  // Always uses the signed-in user's id, so a row can never be written for anyone else
  // (and row-level security would refuse it anyway).
  function currentUserId(c) {
    return c.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session || !session.user) throw new Error("You're signed out. Please sign in again.");
      return session.user.id;
    });
  }

  // Google -> the user shape the app expects
  function mapUser(u) {
    var m = u.user_metadata || {};
    var name = m.full_name || m.name || (u.email ? u.email.split("@")[0] : "");
    var parts = String(name).split(/\s+/).filter(Boolean);
    return {
      id: u.id,
      name: name,
      givenName: m.given_name || parts[0] || "",
      familyName: m.family_name || parts.slice(1).join(" "),
      email: u.email || m.email || "",
      emailVerified: m.email_verified != null ? !!m.email_verified : !!u.email_confirmed_at,
      picture: m.avatar_url || m.picture || null,
      locale: m.locale || (window.navigator && window.navigator.language) || "",
      provider: (u.app_metadata && u.app_metadata.provider) || "google",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at
    };
  }

  // After coming back from Google the URL still carries ?code=… ; a refresh would try to use that
  // one-time code again and fail, so remove it once the library has finished with it.
  function cleanAuthParamsFromUrl() {
    try {
      var url = new URL(window.location.href);
      var changed = false;
      ["code", "error", "error_code", "error_description"].forEach(function (k) {
        if (url.searchParams.has(k)) { url.searchParams.delete(k); changed = true; }
      });
      if (/access_token=|refresh_token=|error=/.test(url.hash)) { url.hash = ""; changed = true; }
      if (changed && window.history && window.history.replaceState) {
        window.history.replaceState(null, document.title, url.pathname + url.search + url.hash);
      }
    } catch (e) { /* cosmetic only */ }
  }

  function redirectUrl() {
    return CONFIG.redirectTo || (window.location.origin + window.location.pathname);
  }

  /* ---------- 4. ledger entry  <->  table row ----------
     Known fields get real columns. Anything else the app adds later goes into the
     `extra` json column, so no field is ever silently dropped. Empty values are
     omitted when reading (not returned as null), because the app tells plain
     entries from GST entries by whether e.taxableAmount is undefined. */
  var KNOWN = {
    id: 1, date: 1, type: 1, category: 1, account: 1, description: 1, amount: 1,
    party: 1, taxableAmount: 1, gstPercent: 1, gstAmount: 1, taxSplit: 1
  };

  function orNull(v) { return v == null ? null : v; }

  function toRow(entry, userId) {
    var extra = {}, hasExtra = false;
    Object.keys(entry).forEach(function (k) {
      if (!KNOWN[k] && entry[k] !== undefined) { extra[k] = entry[k]; hasExtra = true; }
    });
    return {
      user_id: userId,
      entry_date: entry.date,
      type: entry.type,
      category: entry.category || "",
      account: entry.account || "",
      description: entry.description || "",
      amount: entry.amount,
      party: orNull(entry.party),
      taxable_amount: orNull(entry.taxableAmount),
      gst_percent: orNull(entry.gstPercent),
      gst_amount: orNull(entry.gstAmount),
      tax_split: orNull(entry.taxSplit),
      extra: hasExtra ? extra : null
    };
  }

  function fromRow(r) {
    var e = {
      id: r.id,
      date: r.entry_date,
      type: r.type,
      category: r.category,
      account: r.account,
      description: r.description,
      amount: Number(r.amount)
    };
    if (r.party != null) e.party = r.party;
    if (r.taxable_amount != null) e.taxableAmount = Number(r.taxable_amount);
    if (r.gst_percent != null) e.gstPercent = Number(r.gst_percent);
    if (r.gst_amount != null) e.gstAmount = Number(r.gst_amount);
    if (r.tax_split != null) e.taxSplit = r.tax_split;
    if (r.extra && typeof r.extra === "object") {
      Object.keys(r.extra).forEach(function (k) { if (!(k in e)) e[k] = r.extra[k]; });
    }
    return e;
  }

  /* ---------- 5. the Database object the panel talks to ---------- */
  var pendingLogin = null;

  // Pressing "back" from Google's page restores this page frozen in its "Signing in…" state.
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted && pendingLogin) {
      var p = pendingLogin;
      pendingLogin = null;
      p.reject(new Error("Sign-in was cancelled."));
    }
  });

  window.Database = {
    mode: "live",
    label: "Supabase cloud database",

    auth: {
      getSession: function () {
        return run(function (c) {
          return c.auth.getSession().then(function (res) {
            cleanAuthParamsFromUrl();
            if (res && res.error && window.console) console.warn("[database_supabase] getSession:", res.error.message);
            var session = res && res.data && res.data.session;
            return session && session.user ? mapUser(session.user) : null;
          });
        });
      },

      // Redirects to Google, so this promise deliberately never resolves — the page is leaving.
      // It only rejects if the redirect could not start (or the user pressed Back from Google).
      loginWithGoogle: function () {
        return new Promise(function (_resolve, reject) {
          pendingLogin = { reject: reject };
          run(function (c) {
            if (!/^https?:$/.test(window.location.protocol)) {
              throw new Error("Google sign-in needs this app served over http(s) — open it from your hosted address or a local server, not as a double-clicked file.");
            }
            return c.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: redirectUrl(), queryParams: { prompt: "select_account" } }
            });
          }).then(function (res) {
            if (res && res.error) { pendingLogin = null; reject(toError(res.error)); }
          }).catch(function (err) {
            pendingLogin = null;
            reject(toError(err));
          });
        });
      },

      logout: function () {
        return run(function (c) {
          // "local": sign out of this device only (the default would sign the user out everywhere)
          return c.auth.signOut({ scope: "local" }).then(function (res) {
            if (res && res.error && window.console) console.warn("[database_supabase] signOut:", res.error.message);
          });
        });
      }
    },

    config: {
      // null = first-time user (the app then starts from its built-in defaults)
      get: function () {
        return run(function (c) {
          return currentUserId(c).then(function (uid) {
            return c.from(TABLE_CONFIG).select("config").eq("user_id", uid).limit(1);
          }).then(function (res) {
            var rows = unwrap(res);
            return rows && rows[0] ? rows[0].config : null;
          });
        });
      },

      save: function (config) {
        return run(function (c) {
          return currentUserId(c).then(function (uid) {
            return c.from(TABLE_CONFIG).upsert(
              { user_id: uid, config: config, updated_at: new Date().toISOString() },
              { onConflict: "user_id" }
            );
          }).then(function (res) {
            unwrap(res);
            return config;
          });
        });
      }
    },

    ledger: {
      // Oldest first, in the order the entries were recorded.
      list: function () {
        return run(function (c) {
          return currentUserId(c).then(function (uid) {
            var all = [];
            function page(from) {
              return c.from(TABLE_LEDGER)
                .select("*", { count: "exact" })
                .eq("user_id", uid)
                .order("seq", { ascending: true })
                .range(from, from + PAGE_SIZE - 1)
                .then(function (res) {
                  var rows = unwrap(res) || [];
                  all = all.concat(rows);
                  var next = from + rows.length;
                  var done = rows.length === 0 ||
                    (res.count != null ? next >= res.count : rows.length < PAGE_SIZE);
                  return done ? all : page(next);
                });
            }
            return page(0);
          }).then(function (rows) { return rows.map(fromRow); });
        });
      },

      add: function (entry) {
        return run(function (c) {
          if (!entry || !isFinite(Number(entry.amount))) throw new Error("This transaction has no valid amount.");
          return currentUserId(c).then(function (uid) {
            return c.from(TABLE_LEDGER).insert(toRow(entry, uid)).select("*");
          }).then(function (res) {
            var rows = unwrap(res);
            if (!rows || !rows[0]) throw new Error("The transaction was not saved.");
            return fromRow(rows[0]);
          });
        });
      }
    },

    // Permanently deletes THIS user's transactions and settings (never anyone else's).
    resetAll: function () {
      return run(function (c) {
        return currentUserId(c).then(function (uid) {
          return c.from(TABLE_LEDGER).delete().eq("user_id", uid).then(function (res) {
            unwrap(res);
            return c.from(TABLE_CONFIG).delete().eq("user_id", uid);
          }).then(function (res) { unwrap(res); });
        });
      });
    }
  };
})(window);
