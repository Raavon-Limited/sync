-- ============================================================================
-- conventions
--
-- The foundations BACKEND_BLUEPRINT §04 and §14 call for: the hidden `private`
-- schema, one shared updated_at trigger, the RLS helper functions, and the five
-- ops tables. Nothing here is a domain table.
--
-- ORDER NOTE
--   The blueprint says "decide these once, before any domain table exists".
--   That ship has sailed — 0006 created fourteen domain tables first. This
--   migration therefore adapts rather than dictates: it attaches the shared
--   trigger to tables that already exist, and it does NOT convert their check
--   constraints to native enums (see below).
--
-- ENUMS ARE DELIBERATELY NOT CREATED HERE
--   §04 prefers native enums over check constraints. Every existing status
--   column (`orders.status`, `bookings.status`, `hostel_inspections.status`,
--   `hostels.room_type`, …) already ships as a check constraint with live
--   values. Converting means `alter column ... type ... using`, which rewrites
--   the table, invalidates dependent views (`hostel_room_state`,
--   `hostel_availability`) and policies, and cannot be done idempotently in a
--   migration that must also be safe to re-run. It is a separate, staged
--   change that belongs on staging first. Creating the enum types here without
--   converting anything would just add unused types.
--
-- FINDING 3 (the `audit_log` name collision) IS RESOLVED BY PLACEMENT
--   `public.audit_log` already belongs to the marketing/waitlist backend. The
--   blueprint's ops audit log is service-role-only and append-only, so it has
--   no reason to live in an API-exposed schema at all. It is created here as
--   `private.audit_log`. That sidesteps the collision entirely rather than
--   renaming another product's table, and it is the stricter placement.
--   `public.activity_log` (from 0006) is a third, unrelated thing: a per-user
--   feed. Do not conflate the three.
--
-- ROLLBACK
--   drop schema if exists private cascade;
--   drop table if exists public.feature_flags, public.app_settings;
--   drop function if exists public.auth_role(), public.is_admin(),
--                           public.set_updated_at() cascade;
--   -- (Dropping set_updated_at with cascade also removes the triggers this
--   --  migration attached to existing tables. Their guard triggers, which set
--   --  updated_at independently, are untouched.)
-- ============================================================================

-- ── 1. The private schema ───────────────────────────────────────────────────
-- Not in the PostgREST exposed-schema list, so nothing in here is reachable
-- through the Data API at any privilege level. Ledger internals, webhook
-- payloads and job state live here.
--
-- Two separate settings control this and both must stay clear of `private`:
--   • supabase/config.toml → [api] schemas — local dev only (currently
--     ["public", "graphql_public"], correct).
--   • Dashboard → Project Settings → API → Exposed schemas — this is the one
--     that governs the live project. config.toml does NOT push to it.
-- The grants below mean that even if `private` were exposed by mistake, anon
-- and authenticated would still hold nothing in it.
create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant  usage on schema private to service_role;

-- Anything created in `private` later inherits this posture rather than
-- relying on whoever writes the next migration to remember.
alter default privileges in schema private
  revoke all on tables from anon, authenticated;
alter default privileges in schema private
  revoke all on sequences from anon, authenticated;
alter default privileges in schema private
  revoke all on functions from anon, authenticated;

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

-- Attach to every public table that has an updated_at column and lacks it.
-- Idempotent, and skips tables whose guard_*_privileged_cols() trigger already
-- stamps the column — a second stamp would be harmless but the trigger is
-- redundant, so it is not created twice.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.relname as tablename
      from pg_class      c
      join pg_namespace  ns on ns.oid = c.relnamespace
      join pg_attribute  a  on a.attrelid = c.oid
     where ns.nspname   = 'public'
       and c.relkind    = 'r'
       and a.attname    = 'updated_at'
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
    raise notice 'set_updated_at attached to %', r.tablename;
    n := n + 1;
  end loop;
  raise notice 'set_updated_at attached to % table(s)', n;
end $$;

-- ── 3. RLS helper functions ─────────────────────────────────────────────────
-- STABLE so the planner evaluates them once per statement, not once per row.
-- `set search_path = ''` is mandatory on anything a policy calls: without it a
-- caller-controlled search_path can shadow the objects the function resolves.
--
-- auth_role() reads the app_role JWT claim, which does not exist yet — the
-- custom access token hook that stamps it is still to be built (§15). Until
-- then it returns 'anon' for everyone, so is_admin() is uniformly false. That
-- is the safe direction to fail, and it is why no policy below depends on it.
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
  'The app_role JWT claim, or ''anon''. Returns ''anon'' until the access token hook ships.';
comment on function public.is_admin() is
  'True for admin/super_admin per the JWT claim. Uniformly false until the hook ships.';

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
  constraint webhook_events_provider_event_uniq
    unique (provider, provider_event_id)
);

create index if not exists webhook_events_unprocessed_idx
  on private.webhook_events (received_at)
  where processed_at is null;

-- ── 5. private.idempotency_keys ─────────────────────────────────────────────
-- Same key + same request_hash replays the stored response; same key +
-- different hash is a 409. Guards client-initiated POSTs — checkout, top-up,
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
-- Append-only. See the Finding 3 note in the header for why this is `private`
-- and not `public.audit_log`.
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

-- Append-only for real, not by convention. Even the service role cannot
-- rewrite history through the Data API; correcting a bad row needs a
-- deliberate superuser session.
revoke update, delete, truncate on private.audit_log from public, anon, authenticated, service_role;

-- ── 7. public.feature_flags ─────────────────────────────────────────────────
-- Per-campus module launches, and the kill switch when a payment integration
-- misbehaves. Readable by everyone: a flag gates public pages too, so an
-- anonymous visitor's request must be able to resolve it. Flag KEYS are
-- therefore not secret — do not name one after an unannounced feature.
create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean     not null default false,
  rollout_pct integer     not null default 0
                check (rollout_pct between 0 and 100),
  campus_ids  text[]      not null default '{}',
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ── 8. public.app_settings ──────────────────────────────────────────────────
-- Service fee, minimum payout, escrow windows, support email. Config ops can
-- change without a deploy. NOT publicly readable — some values are commercial
-- terms. The server reads it with the service-role client.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb       not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ── 9. RLS on the new public tables ─────────────────────────────────────────
-- §15's rule, applied without exception: enable AND force, separate policies
-- per command, every policy scoped to a role. FORCE is safe here because
-- service_role holds BYPASSRLS and nothing writes to these through a
-- SECURITY DEFINER trigger.
alter table public.feature_flags enable row level security;
alter table public.feature_flags force  row level security;
alter table public.app_settings  enable row level security;
alter table public.app_settings  force  row level security;

drop policy if exists "feature_flags_read" on public.feature_flags;
create policy "feature_flags_read"
  on public.feature_flags
  for select
  to anon, authenticated
  using (true);

-- No policy at all on app_settings: reads go through the service role, which
-- bypasses RLS. An empty policy set is the strongest possible statement.

-- Writes to both are service-role only, so strip the privilege behind the
-- absent policies rather than relying on the absence alone.
revoke all on public.feature_flags from anon, authenticated;
revoke all on public.app_settings  from anon, authenticated;
grant  select on public.feature_flags to anon, authenticated;

-- ── 10. Verify ──────────────────────────────────────────────────────────────
do $$
declare
  missing_updated_at int;
  private_exposed    int;
  audit_writable     int;
begin
  -- Every public table with updated_at now has the trigger, or a guard trigger
  -- that stamps it.
  select count(*) into missing_updated_at
    from pg_class     c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a  on a.attrelid = c.oid
   where ns.nspname = 'public'
     and c.relkind  = 'r'
     and a.attname  = 'updated_at'
     and a.attisdropped is false
     and not exists (
       select 1 from pg_trigger t
        where t.tgrelid = c.oid and t.tgisinternal is false
     );

  -- anon / authenticated hold nothing in the private schema.
  select count(*) into private_exposed
    from information_schema.role_table_grants
   where table_schema = 'private'
     and grantee in ('anon', 'authenticated');

  -- audit_log cannot be rewritten by any Data API role.
  select count(*) into audit_writable
    from information_schema.role_table_grants
   where table_schema   = 'private'
     and table_name     = 'audit_log'
     and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
     and grantee in ('anon', 'authenticated', 'service_role');

  if missing_updated_at > 0 then
    raise exception
      '% table(s) have updated_at but no trigger to stamp it', missing_updated_at;
  end if;

  if private_exposed > 0 then
    raise exception
      'anon/authenticated hold % grant(s) in the private schema', private_exposed;
  end if;

  if audit_writable > 0 then
    raise exception
      'audit_log is not append-only: % write grant(s) remain', audit_writable;
  end if;

  raise notice
    'conventions in place: private schema sealed, audit_log append-only, updated_at universal.';
end $$;
