/* ============================================================
   Heart2Heart Kenya — Supabase configuration
   ------------------------------------------------------------
   Paste your project's URL and PUBLIC anon key below to switch
   the app from local-only mode to real Supabase Auth + database.

   Find these in your Supabase dashboard:
     Project Settings → API →
       • Project URL          -> url
       • Project API keys → anon / public   -> anonKey

   ⚠️  Use ONLY the "anon" / "public" key here. It is safe to
       commit and ship in front-end code (Row-Level Security
       protects your data). NEVER put the "service_role" key here.

   Leave both blank to keep the app in local-only mode (the
   default) — nothing external is loaded and everything works
   from the browser's localStorage.
   ============================================================ */
window.SUPABASE_CONFIG = {
  url: "",       // e.g. "https://abcdefgh.supabase.co"
  anonKey: "",   // e.g. "eyJhbGciOi...."  (anon/public key only)
};
