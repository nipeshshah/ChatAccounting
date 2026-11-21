/* js/config.js — the only file you edit to switch environments.

   provider: "dummy"     runs entirely in this browser (localStorage), Google sign-in is simulated — good for trying the app.
             "supabase"  real accounts + cloud database. Fill in SUPABASE_CONFIG below and run database/supabase_schema.sql once.

   The anon / publishable key is meant to be public (row-level security protects the data).
   NEVER put the service_role / secret key here. */
window.APP_CONFIG = {
  provider: "supabase"
  // supabaseLib: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"   // override only if you want to host the library yourself
};

window.SUPABASE_CONFIG = {
  url: "https://wrqocosuhmepkokmgxew.supabase.co",
  anonKey: "sb_publishable_j1xqkFAUzDAk3Iw2mpByeg_c_Is7hdy"
  // redirectTo: "https://your-name.github.io/your-repo/"   // optional; defaults to this page's address
};
