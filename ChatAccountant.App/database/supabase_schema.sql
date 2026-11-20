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

-- Supabase grants every new table to anon + authenticated in full by default. Take all of that back,
-- then give signed-in users ONLY the verbs the app uses (anon gets nothing).
revoke all on public.user_config    from anon, authenticated;
revoke all on public.ledger_entries from anon, authenticated;
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


-- ============================================================================
-- TRANSACTION REQUESTS  (a debtor/creditor with a mobile number gets each transaction as a
-- request; if they accept, the app records the mirror entry in THEIR OWN account)
-- ----------------------------------------------------------------------------
-- Nothing is ever written into another user's tables. A request is just a row here that
-- its sender and its recipient can see. The recipient is the person whose VERIFIED mobile
-- number (confirmed by SMS code in the app's Profile page) equals to_phone. Supabase puts
-- that number inside the signed login token (auth.jwt()), so the browser cannot pretend
-- to be someone else. Numbers are stored in E.164 form, e.g. +919876543210.
-- ============================================================================

-- One-time migration: the first version addressed requests by email. Those requests were
-- short-lived, so the old table is simply replaced. Does nothing once migrated.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ledger_shares' and column_name = 'to_email') then
    drop table public.ledger_shares;
  end if;
end $$;

create table if not exists public.ledger_shares (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  from_phone   text not null,
  to_phone     text not null,
  kind         text not null check (kind in ('sale', 'purchase', 'received', 'paid', 'discount_allowed', 'discount_received')),   -- from the SENDER's side
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  payload      jsonb not null
               check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) < 16000),
  notified_at  timestamptz,            -- set by the (optional) SMS Edge Function once the text went out
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_phone ~ '^\+[1-9][0-9]{7,14}$' and to_phone ~ '^\+[1-9][0-9]{7,14}$')
);

-- Re-create the kind check so a table made earlier also accepts the discount kinds.
alter table public.ledger_shares drop constraint if exists ledger_shares_kind_check;
alter table public.ledger_shares add constraint ledger_shares_kind_check
  check (kind in ('sale', 'purchase', 'received', 'paid', 'discount_allowed', 'discount_received'));

create index if not exists ledger_shares_to_idx   on public.ledger_shares (to_phone, status);
create index if not exists ledger_shares_from_idx on public.ledger_shares (from_user_id, created_at desc);

-- The signed-in user's verified mobile number in E.164 form (null if none is verified yet).
-- Supabase keeps/puts it in the token without the leading "+", so it is added back here.
create or replace function public.my_phone()
returns text language sql stable set search_path = '' as $$
  select case when coalesce(auth.jwt() ->> 'phone', '') = '' then null
              else '+' || ltrim(auth.jwt() ->> 'phone', '+') end
$$;
revoke all on function public.my_phone() from public, anon;
grant execute on function public.my_phone() to authenticated;

-- A request can be answered once, and only pending -> accepted/rejected. This is also what makes
-- "accept" safe against double-taps and two open tabs: the second update finds nothing pending.
create or replace function public.ledger_shares_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is not distinct from old.status then
    return new;                                   -- e.g. the Edge Function stamping notified_at
  end if;
  if old.status <> 'pending' then
    raise exception 'This request was already answered.';
  end if;
  if new.status not in ('accepted', 'rejected') then
    raise exception 'Invalid response.';
  end if;
  new.responded_at := now();
  return new;
end $$;

drop trigger if exists ledger_shares_guard on public.ledger_shares;
create trigger ledger_shares_guard before update on public.ledger_shares
  for each row execute function public.ledger_shares_guard();

alter table public.ledger_shares enable row level security;

revoke all on public.ledger_shares from anon, authenticated;   -- (undo the default grants first)
grant select, insert, delete on public.ledger_shares to authenticated;
grant update (status)        on public.ledger_shares to authenticated;   -- the recipient may change ONLY the status

drop policy if exists "ledger_shares: sender or recipient can read" on public.ledger_shares;
drop policy if exists "ledger_shares: send as yourself"             on public.ledger_shares;
drop policy if exists "ledger_shares: recipient can answer"         on public.ledger_shares;
drop policy if exists "ledger_shares: sender can delete own"        on public.ledger_shares;

create policy "ledger_shares: sender or recipient can read" on public.ledger_shares
  for select to authenticated
  using ( from_user_id = (select auth.uid())
          or to_phone = (select public.my_phone()) );

-- from_phone must be YOUR verified number, so a request can't be made to look like it came from someone else
create policy "ledger_shares: send as yourself" on public.ledger_shares
  for insert to authenticated
  with check ( from_user_id = (select auth.uid())
               and from_phone = (select public.my_phone())
               and status = 'pending' and responded_at is null and notified_at is null );

create policy "ledger_shares: recipient can answer" on public.ledger_shares
  for update to authenticated
  using      ( to_phone = (select public.my_phone()) )
  with check ( to_phone = (select public.my_phone()) );

create policy "ledger_shares: sender can delete own" on public.ledger_shares
  for delete to authenticated using ( from_user_id = (select auth.uid()) );

-- Safety net: one accepted request can only ever create ONE ledger entry per user, even if two
-- browser tabs press Accept at the same moment (the app tags the entry with extra.shareId).
create unique index if not exists ledger_entries_share_unique
  on public.ledger_entries (user_id, (extra ->> 'shareId'))
  where extra ? 'shareId';


-- ============================================================================
-- LOOK UP A BUSINESS BY MOBILE NUMBER  (used when adding billing details for a customer/supplier)
-- ----------------------------------------------------------------------------
-- Returns ONLY the shared business profile (name, address, state, GSTIN) of the account whose
-- verified mobile number matches - never the user's ledger, debtors, email or anything else.
--   * the caller must be signed in with a verified number of their own
--   * the owner can opt out: config.shop.discoverable = false (Settings -> Business Profile)
--   * accounts with no business name saved are not returned
-- It runs with elevated rights (security definer) because users cannot read each other's rows.
-- ============================================================================
create or replace function public.find_business_by_phone(p_phone text)
returns table (business_name text, address text, state text, gst_number text)
language sql stable security definer set search_path = '' as $$
  select btrim(c.config #>> '{shop,name}'),
         coalesce(c.config #>> '{shop,address}', ''),
         coalesce(c.config #>> '{shop,state}', ''),
         coalesce(c.config #>> '{shop,gstNumber}', '')
  from auth.users u
  join public.user_config c on c.user_id = u.id
  where public.my_phone() is not null
    and p_phone ~ '^\+[1-9][0-9]{7,14}$'
    and ltrim(u.phone, '+') = ltrim(p_phone, '+')
    and coalesce(c.config #>> '{shop,discoverable}', 'true') <> 'false'
    and btrim(coalesce(c.config #>> '{shop,name}', '')) <> ''
  limit 1
$$;
revoke all on function public.find_business_by_phone(text) from public, anon;
grant execute on function public.find_business_by_phone(text) to authenticated;


-- ============================================================================
-- BILL PDFs  (sending a bill on WhatsApp)
-- ----------------------------------------------------------------------------
-- The app renders a bill to PDF, uploads it here, and puts a time-limited signed link in the WhatsApp message.
--   * the bucket is PRIVATE - nobody can list or browse it; a link only works because it carries a signed token
--   * each user can only add / read / delete files inside a folder named after their own user id
--   * PDFs only, 5 MB at most
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bills: add to own folder"      on storage.objects;
drop policy if exists "bills: read from own folder"   on storage.objects;
drop policy if exists "bills: delete from own folder" on storage.objects;

create policy "bills: add to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bills: read from own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bills: delete from own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text);
