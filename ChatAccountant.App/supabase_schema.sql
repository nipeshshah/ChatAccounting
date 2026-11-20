-- ============================================================================
-- supabase_schema.sql  —  tables + security for database_supabase.js
-- ----------------------------------------------------------------------------
-- Run this ONCE: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again (it only creates what is missing and re-creates the
-- policies).
--
-- SECURITY MODEL
--   The anon/publishable API key ends up in browser code, so anyone can read it.
--   That is fine ONLY because of Row Level Security (RLS): every policy below
--   limits a signed-in user to rows where user_id = their own auth.uid(), and
--   the anonymous role gets nothing. Never put the service_role / secret key
--   in index.html or database_supabase.js.
-- ============================================================================

-- ---------- 1. one settings row per user (categories, accounts, debtors, ...) ----------
create table if not exists public.user_config (
  user_id    uuid primary key default auth.uid()
             references auth.users (id) on delete cascade,
  config     jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- 2. one row per transaction ----------
create table if not exists public.ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,          -- keeps insertion order
  user_id        uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  entry_date     date not null,
  type           text not null check (type in ('income', 'expense')),
  category       text not null default '',
  account        text not null default '',
  description    text not null default '',
  amount         numeric(14, 2) not null,
  party          text,                                         -- debtor / creditor name (credit sales & purchases)
  taxable_amount numeric(14, 2),                               -- GST fields: only set on Sale / Purchase entries
  gst_percent    numeric(6, 3),
  gst_amount     numeric(14, 2),
  tax_split      jsonb,                                        -- {type:"CGST_SGST"|"IGST", ...}
  extra          jsonb,                                        -- any field the app adds later, so nothing is dropped
  created_at     timestamptz not null default now()
);

create index if not exists ledger_entries_user_seq_idx
  on public.ledger_entries (user_id, seq);

-- ---------- 3. Row Level Security ----------
alter table public.user_config    enable row level security;
alter table public.ledger_entries enable row level security;

-- Nothing for the anonymous role; signed-in users get only the verbs the app uses.
revoke all on public.user_config    from anon;
revoke all on public.ledger_entries from anon;
grant select, insert, update, delete on public.user_config    to authenticated;
grant select, insert, delete         on public.ledger_entries to authenticated;  -- the app never edits a saved entry

-- user_config: full access to your own row (upsert needs insert + update + select)
drop policy if exists "user_config: select own" on public.user_config;
drop policy if exists "user_config: insert own" on public.user_config;
drop policy if exists "user_config: update own" on public.user_config;
drop policy if exists "user_config: delete own" on public.user_config;

create policy "user_config: select own" on public.user_config
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_config: insert own" on public.user_config
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_config: update own" on public.user_config
  for update to authenticated using ((select auth.uid()) = user_id)
                              with check ((select auth.uid()) = user_id);
create policy "user_config: delete own" on public.user_config
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ledger_entries: read / add / delete your own rows
drop policy if exists "ledger_entries: select own" on public.ledger_entries;
drop policy if exists "ledger_entries: insert own" on public.ledger_entries;
drop policy if exists "ledger_entries: delete own" on public.ledger_entries;

create policy "ledger_entries: select own" on public.ledger_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ledger_entries: insert own" on public.ledger_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ledger_entries: delete own" on public.ledger_entries
  for delete to authenticated using ((select auth.uid()) = user_id);
