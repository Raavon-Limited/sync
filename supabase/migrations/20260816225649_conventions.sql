-- ============================================================================
-- conventions
--
-- The foundations BACKEND_BLUEPRINT §04 and §14 call for: the hidden `private`
-- schema, one shared updated_at trigger, the RLS helper functions, and the ops
-- tables. Nothing here is a domain table.
--
-- Everything after this migration depends on `private` existing   the ledger,
-- the messaging membership helper, the webhook log. It must stay first.
--
-- ORDER NOTE
--   The blueprint says "decide these once, before any domain table exists".
--   That ship sailed: 0006 created fourteen domain tables first. This migration
--   adapts rather than dictates   it attaches the shared trigger to tables that
--   already exist, and does NOT convert their check constraints to enums.
--
-- ENUMS ARE DELIBERATELY NOT CREATED
--   §04 prefers native enums. Every existing status column already ships as a
--   check constraint with live values. Converting means `alter column ... type
--   ... using`, which rewrites the table and invalidates the dependent views
--   `hostel_room_state` and `hostel_availability`. That cannot be made
--   idempotent and belongs on staging first. Creating enum types here without
--   converting anything would just add unused types.
--
-- FINDING 3 (`audit_log` collision) IS RESOLVED BY PLACEMENT
--   `public.audit_log` belongs to the marketing/waitlist backend. The ops audit
--   log is service-role-only and append-only, so it has no reason to sit in an
--   API-exposed schema. It is created here as `private.audit_log`, sidestepping
--   the collision rather than renaming another product's table.
--   `public.activity_log` (0006) is a third, unrelated thing: a per-user feed.
--
-- ROLLBACK
--   drop schema if exists private cascade;
--   drop table if exists public.feature_flags, public.app_settings;
--   drop function if exists public.auth_role(), public.is_admin(),
--                           public.set_updated_at() cascade;
-- ============================================================================

-- ── 1. The private schema ───────────────────────────────────────────────────
-- Not in the PostgREST exposed-schema list, so nothing here is reachable
-- through the Data API at any privilege level.
--
-- Two separate settings control this and both must stay clear of `private`:
--   • supabase/config.toml → [api] schemas   local dev only.
--   • Dashboard → Project Settings → API → Exposed schemas   governs the live
--     project. config.toml does NOT push to it.
-- The grants below mean that even if `private` were exposed by mistake, anon
-- and authenticated would still hold nothing in it.
create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant  usage on schema private to service_role;

-- Anything created in `private` later inherits this posture rather than relying
-- on whoever writes the next migration to remember.
alter default privileges in schema private revoke all on tables    from anon, authenticated;
alter default privileges in schema private revoke all on sequences from anon, authenticated;
alter default privileges in schema private revoke all on functions from anon, authenticated;

comment on schema private is
  'Hidden schema. Never added to the PostgREST exposed list. Service role only.';

-- ── 2. Shared updated_at trigger ────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. Attach to every table with the column.';

-- Attach to every public table that has an updated_at column and no trigger of
-- its own. Idempotent, and skips tables whose guard_*_privileged_cols() trigger
-- already stamps the column.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.relname as tablename
      from pg_class     c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a  on a.attrelid = c.oid
     where ns.nspname = 'public'
       and c.relkind  = 'r'
       and a.attname  = 'updated_at'
       and a.attisdropped is false
       and not exists (
         select 1 from pg_trigger t
          where t.tgrelid = c.oid
            and t.tgisinternal is false
            and t.tgname = 'set_updated_at'
       )
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      r.tablename);
    n := n + 1;
  end loop;
  raise notice 'set_updated_at attached to % table(s)', n;
end $$;

-- ── 3. RLS helper functions ─────────────────────────────────────────────────
-- STABLE so the planner evaluates them once per statement, not once per row.
-- `set search_path = ''` is mandatory on anything a policy calls: without it a
-- caller-controlled search_path can shadow the objects the function resolves.
--
-- auth_role() reads the app_role JWT claim, which does not exist yet   the
-- custom access token hook is still to be built (§15)   so it returns 'anon'
-- for everyone today. That is the safe direction to fail. The identity_roles
-- migration replaces is_admin() with a version that also consults profiles,
-- which is what actually works before the hook ships.
create or replace function public.auth_role()
returns text
language sql
stable
set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'app_role', 'anon') $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.auth_role() in ('admin', 'super_admin') $$;

comment on function public.auth_role() is
  'The app_role JWT claim, or ''anon''. Superseded for role checks by public.current_app_role().';

-- ── 4. private.webhook_events ───────────────────────────────────────────────
-- Insert BEFORE processing. The unique constraint on (provider,
-- provider_event_id) is the replay defence: a duplicate delivery collides
-- instead of being processed twice. Failures stay as rows for a retry worker
-- rather than vanishing into a console.error.
create table if not exists private.webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text        not null,
  provider_event_id  text        not null,
  event_type         text        not null,
  payload            jsonb       not null,
  signature_valid    boolean     not null default false,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  attempts           integer     not null default 0 check (attempts >= 0),
  last_error         text,
  constraint webhook_events_provider_event_uniq unique (provider, provider_event_id)
);

create index if not exists webhook_events_unprocessed_idx
  on private.webhook_events (received_at) where processed_at is null;

-- ── 5. private.idempotency_keys ─────────────────────────────────────────────
-- Same key + same request_hash replays the stored response; same key +
-- different hash is a 409. Guards client-initiated POSTs   checkout, top-up,
-- payout request.
create table if not exists private.idempotency_keys (
  key           text        primary key,
  user_id       uuid        references public.profiles (id) on delete cascade,
  endpoint      text        not null,
  request_hash  text        not null,
  response      jsonb,
  status        text        not null default 'in_progress'
                  check (status in ('in_progress', 'succeeded', 'failed')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours'
);

create index if not exists idempotency_keys_expiry_idx
  on private.idempotency_keys (expires_at);

-- ── 6. private.audit_log ────────────────────────────────────────────────────
create table if not exists private.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_role   text,
  action       text        not null,
  entity_type  text        not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  ip           inet,
  user_agent   text,
  occurred_at  timestamptz not null default now()
);

create index if not exists audit_log_entity_idx
  on private.audit_log (entity_type, entity_id, occurred_at desc);
create index if not exists audit_log_actor_idx
  on private.audit_log (actor_id, occurred_at desc);

-- Append-only for real, not by convention. Even the service role cannot rewrite
-- history through the Data API; correcting a bad row needs a superuser session.
revoke update, delete, truncate on private.audit_log
  from public, anon, authenticated, service_role;

-- ── 7. public.feature_flags ─────────────────────────────────────────────────
-- Per-campus module launches, and the kill switch when a payment integration
-- misbehaves. Readable by everyone: a flag gates public pages too, so an
-- anonymous request must be able to resolve it. Flag KEYS are therefore not
-- secret   do not name one after an unannounced feature.
create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean     not null default false,
  rollout_pct integer     not null default 0 check (rollout_pct between 0 and 100),
  campus_ids  text[]      not null default '{}',
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ── 8. public.app_settings ──────────────────────────────────────────────────
-- Service fee, minimum payout, escrow windows, support email. Config ops can
-- change without a deploy. NOT publicly readable   some values are commercial
-- terms. The server reads it with the service-role client.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb       not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('commission_pct',      '10'::jsonb),
  ('min_payout_kobo',     '100000'::jsonb),
  ('escrow_hold_hours',   '24'::jsonb),
  ('support_email',       '"support@syncng.app"'::jsonb)
on conflict (key) do nothing;

-- ── 9. RLS on the new public tables ─────────────────────────────────────────
-- §15's rule applied without exception: enable AND force. FORCE is safe here
-- because service_role holds BYPASSRLS and nothing writes to these through a
-- SECURITY DEFINER trigger.
alter table public.feature_flags enable row level security;
alter table public.feature_flags force  row level security;
alter table public.app_settings  enable row level security;
alter table public.app_settings  force  row level security;

drop policy if exists "feature_flags_read" on public.feature_flags;
create policy "feature_flags_read"
  on public.feature_flags for select to anon, authenticated using (true);

-- No policy at all on app_settings: reads go through the service role, which
-- bypasses RLS. An empty policy set is the strongest possible statement.

revoke all on public.feature_flags from anon, authenticated;
revoke all on public.app_settings  from anon, authenticated;
grant  select on public.feature_flags to anon, authenticated;

-- ── 10. Verify ──────────────────────────────────────────────────────────────
do $$
declare
  private_exposed int;
  audit_writable  int;
begin
  select count(*) into private_exposed
    from information_schema.role_table_grants
   where table_schema = 'private' and grantee in ('anon', 'authenticated');

  select count(*) into audit_writable
    from information_schema.role_table_grants
   where table_schema   = 'private'
     and table_name     = 'audit_log'
     and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
     and grantee in ('anon', 'authenticated', 'service_role');

  if private_exposed > 0 then
    raise exception 'anon/authenticated hold % grant(s) in the private schema', private_exposed;
  end if;

  if audit_writable > 0 then
    raise exception 'audit_log is not append-only: % write grant(s) remain', audit_writable;
  end if;

  raise notice 'conventions in place: private schema sealed, audit_log append-only.';
end $$;
