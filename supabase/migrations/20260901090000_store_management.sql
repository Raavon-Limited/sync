-- ============================================================================
-- store_management
--
-- VOCABULARY: storefront = the business (vendor_profiles); store = one
-- location (public.storefronts, legacy name). See modules/storefronts/README.
--
-- Five changes, all about who may do what to a store:
--
--   1. THE BACKLOG LIMIT SHIPS ON.  `auto_pause_after` was opt-in and null by
--      default, which in practice meant nobody had it. Every store now starts
--      at 5 unfinished orders and a vendor can raise it, lower it, or turn it
--      off. Null stops being a value: 0 is "never".
--
--   2. AN AUTOMATIC PAUSE ENDS WHEN THE KITCHEN CATCHES UP, not when a timer
--      says so. Clearing the backlog reopens the store immediately; still
--      being buried when an order moves rolls the deadline forward. The
--      deadline survives as the one thing that cannot fail — see below.
--
--   3. ARCHIVING IS A SUPPORTED, REVERSIBLE STATE with the two guards it
--      needs: you cannot archive a store that still owes somebody food, and
--      you cannot archive your last one.
--
--   4. ADDING A SECOND STORE REQUIRES A VERIFIED BUSINESS. The first one is
--      how a vendor starts trading, so it is never blocked.
--
--   5. STAFF GET SCOPES. "Manage my Tanke shop" was all-or-nothing; an owner
--      can now hand someone the order queue without the menu.
--
-- WHY THE PAUSE DEADLINE STAYS EVEN THOUGH DRAINING CLEARS IT
--   "Pause until the orders are sent out" is right up until the orders are
--   never sent out — a vendor who closes their laptop with four tickets open
--   would have a store that is shut forever and no way to notice. Postgres has
--   no timer, so nothing would ever run to reopen it. The deadline is the
--   floor under that: the store reopens on its own, and if the backlog is
--   genuinely still there the very next order re-pauses it. Draining is what
--   normally ends the pause; the clock is what stops a bug becoming a closed
--   shop.
--
-- ROLLBACK
--   drop trigger if exists orders_sync_backlog_pause on public.orders;
--   drop trigger if exists storefronts_require_verification on public.storefronts;
--   drop function if exists public.sync_store_backlog_pause();
--   drop function if exists public.guard_storefront_insert();
--   drop function if exists public.set_storefront_archived(uuid, boolean);
--   drop function if exists public.set_storefront_staff_scopes(uuid, text[]);
--   drop function if exists private.storefront_scope(uuid, uuid, text);
--   drop function if exists public.create_storefront_invite(uuid, text, text, text[]);
--   alter table public.storefront_staff   drop column if exists scopes;
--   alter table public.storefront_invites drop column if exists scopes;
--   -- and restore the four functions and four policies this file replaces from
--   -- 20260822130000_storefront_staff, 20260822150000_storefront_roster and
--   -- 20260829090500_store_cooldown.
-- ============================================================================

-- ── 1. The backlog limit is on by default ───────────────────────────────────
-- Null used to mean "never auto-pause" and was the default, so the feature
-- existed and did nothing for every vendor who never found the field. Zero is
-- the explicit off switch now, which leaves null free to mean nothing at all.
do $$
declare
  v_con text;
begin
  -- The constraint was created inline by `add column ... check (...)`, so its
  -- name is generated. Find it by what it mentions rather than guessing.
  for v_con in
    select c.conname
      from pg_constraint c
      join pg_class      t on t.oid = c.conrelid
      join pg_namespace  n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'storefronts'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%auto_pause_after%'
  loop
    execute format('alter table public.storefronts drop constraint %I', v_con);
  end loop;
end $$;
update public.storefronts set auto_pause_after = 5 where auto_pause_after is null;
alter table public.storefronts
  alter column auto_pause_after set default 5,
  alter column auto_pause_after set not null,
  add constraint storefronts_auto_pause_after_check
    check (auto_pause_after >= 0);
comment on column public.storefronts.auto_pause_after is
  'Pause the store once this many orders are accepted and unfinished. 0 = never. Defaults to 5; the vendor owns the number.';
-- ── 2. Auto-pause, and the drain that ends it ───────────────────────────────
-- Same body as 20260829090500 except the opt-out test, which moved from
-- `is null` to `= 0` along with the default above.
create or replace function public.auto_pause_busy_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store   public.storefronts%rowtype;
  v_backlog integer;
begin
  if new.storefront_id is null then
    return new;
  end if;

  select * into v_store from public.storefronts where id = new.storefront_id;

  -- Turned off, or already inside a cooldown. Re-pausing an already-paused
  -- store would extend the cooldown with every order that slipped through.
  if v_store.auto_pause_after = 0
     or (v_store.paused_until is not null and v_store.paused_until > now()) then
    return new;
  end if;

  -- Accepted and not yet out the door. 'picked_up' and 'on_the_way' are the
  -- rider's problem, not the kitchen's, so they do not count against capacity.
  select count(*) into v_backlog
    from public.orders o
   where o.storefront_id = new.storefront_id
     and o.status in ('pending', 'preparing');

  if v_backlog >= v_store.auto_pause_after then
    update public.storefronts
       set paused_until = now() + make_interval(mins => v_store.auto_pause_minutes),
           pause_reason = 'auto_backlog',
           updated_at   = now()
     where id = new.storefront_id;
  end if;

  return new;
exception
  when others then
    -- A failure to pause must never fail the order that is already paid for.
    raise warning 'auto_pause_busy_store failed for store %: %', new.storefront_id, sqlerrm;
    return new;
end;
$fn$;
/**
 * The other half: an automatic pause lasts as long as the backlog does.
 *
 * ONLY TOUCHES 'auto_backlog' PAUSES. A vendor who tapped "15 minutes" is
 * having a break, and finishing an order is not them asking to be reopened.
 * Clearing a manual pause here would make the button lie.
 */
create or replace function public.sync_store_backlog_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store   public.storefronts%rowtype;
  v_backlog integer;
begin
  if new.storefront_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_store from public.storefronts where id = new.storefront_id;

  if v_store.pause_reason is distinct from 'auto_backlog'
     or v_store.paused_until is null then
    return new;
  end if;

  select count(*) into v_backlog
    from public.orders o
   where o.storefront_id = new.storefront_id
     and o.status in ('pending', 'preparing');

  if v_store.auto_pause_after = 0 or v_backlog < v_store.auto_pause_after then
    -- Caught up. Reopen now rather than making them sit out the rest of a
    -- cooldown they no longer need.
    update public.storefronts
       set paused_until = null,
           pause_reason = null,
           updated_at   = now()
     where id = new.storefront_id;
  else
    -- Orders are moving and the store is still over its limit, so the pause
    -- has not done its job yet. Rolling the deadline forward is what makes
    -- this "until they are sent out" rather than "for ten minutes".
    update public.storefronts
       set paused_until = now() + make_interval(mins => v_store.auto_pause_minutes),
           updated_at   = now()
     where id = new.storefront_id;
  end if;

  return new;
exception
  when others then
    raise warning 'sync_store_backlog_pause failed for store %: %', new.storefront_id, sqlerrm;
    return new;
end;
$fn$;
drop trigger if exists orders_sync_backlog_pause on public.orders;
create trigger orders_sync_backlog_pause
  after update of status on public.orders
  for each row execute function public.sync_store_backlog_pause();
-- ── 3. Staff scopes ─────────────────────────────────────────────────────────
-- Membership said WHICH store. It never said which part of it, so inviting
-- someone to work the Saturday rush also handed them the menu and the prices.
--
-- WHAT IS DELIBERATELY NOT A SCOPE: money. Wallet, payouts, bank accounts and
-- the subscription live on vendor_profiles (the business), and nothing here
-- reaches that table. That boundary is structural and stays that way — see
-- modules/storefronts/README.
--
-- 'inbox' IS A UI SCOPE TODAY, NOT AN ENFORCED ONE. Conversations resolve
-- their vendor from listings.vendor_id, so a store's messages reach the owner
-- and there is no storefront_id on a conversation to scope against. The scope
-- is recorded now so the grant exists when messaging becomes store-routed;
-- until then granting it opens nothing, and the UI says so.
create or replace function private.storefront_scope_names()
returns text[]
language sql
immutable
set search_path = ''
as $fn$ select array['orders', 'listings', 'inbox', 'store']::text[] $fn$;
-- Added with the FULL set as the column default, not the invite default.
-- Anyone already hired had the run of their store, and a deploy that silently
-- narrowed a working manager's access would look like a bug to both of them.
-- New invites choose explicitly; the default is only ever seen by these rows.
alter table public.storefront_staff
  add column if not exists scopes text[] not null
      default array['orders', 'listings', 'inbox', 'store'];
alter table public.storefront_invites
  add column if not exists scopes text[] not null
      default array['orders', 'listings', 'inbox', 'store'];
-- Spelled out rather than calling storefront_scope_names(): a CHECK that
-- depends on a function cannot be altered without dropping the constraint, and
-- pg_dump has to reload it in the right order. The function stays as the one
-- definition the RPCs validate against.
alter table public.storefront_staff
  drop constraint if exists storefront_staff_scopes_check,
  add  constraint storefront_staff_scopes_check
       check (cardinality(scopes) > 0
              and scopes <@ array['orders', 'listings', 'inbox', 'store']::text[]);
alter table public.storefront_invites
  drop constraint if exists storefront_invites_scopes_check,
  add  constraint storefront_invites_scopes_check
       check (cardinality(scopes) > 0
              and scopes <@ array['orders', 'listings', 'inbox', 'store']::text[]);
/**
 * "May you do THIS at this store?" — the scoped sibling of
 * private.can_manage_storefront().
 *
 * The owner passes every scope; there is no way to grant yourself less than
 * everything, and no reason to. Staff pass only what they were handed.
 *
 * SECURITY DEFINER for the same two reasons can_manage_storefront is: a policy
 * has to ask without the caller being able to read the rows, and the policy on
 * storefront_staff would otherwise recurse into storefront_staff.
 */
create or replace function private.storefront_scope(
  p_storefront uuid,
  p_user       uuid,
  p_scope      text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.storefronts s
     where s.id = p_storefront and s.vendor_id = p_user and s.archived_at is null
    union all
    select 1 from public.storefront_staff st
      join public.storefronts s2 on s2.id = st.storefront_id
     where st.storefront_id = p_storefront
       and st.user_id       = p_user
       and st.revoked_at    is null
       and s2.archived_at   is null
       and p_scope = any (st.scopes)
  );
$fn$;
grant execute on function private.storefront_scope(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.storefront_scope_names() to authenticated, service_role;
comment on function private.storefront_scope(uuid, uuid, text) is
  'Whether a user may act on one part of a store. Widen permissions here, never by editing individual policies.';
-- Narrow the four policies that used to ask the unscoped question.
drop policy if exists "listings_write_own" on public.listings;
create policy "listings_write_own" on public.listings
  for all to authenticated
  using       ((select auth.uid()) = vendor_id
               or private.storefront_scope(storefront_id, (select auth.uid()), 'listings'))
  with check  ((select auth.uid()) = vendor_id
               or private.storefront_scope(storefront_id, (select auth.uid()), 'listings'));
drop policy if exists "orders_update_vendor" on public.orders;
create policy "orders_update_vendor" on public.orders
  for update to authenticated
  using       ((select auth.uid()) = vendor_id
               or private.storefront_scope(storefront_id, (select auth.uid()), 'orders'))
  with check  ((select auth.uid()) = vendor_id
               or private.storefront_scope(storefront_id, (select auth.uid()), 'orders'));
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select to authenticated
  using ((select auth.uid()) = student_id
         or (select auth.uid()) = vendor_id
         or private.storefront_scope(storefront_id, (select auth.uid()), 'orders'));
-- Trading details — hours, area, the map pin, the capacity limit. The column
-- guard already stops staff touching anything structural; this decides whether
-- they may touch the rest at all.
drop policy if exists "storefronts_update_staff" on public.storefronts;
create policy "storefronts_update_staff" on public.storefronts
  for update to authenticated
  using       (private.storefront_scope(id, (select auth.uid()), 'store'))
  with check  (private.storefront_scope(id, (select auth.uid()), 'store'));
-- Pausing is an order-queue act: the person watching the tickets pile up is
-- the person who needs to stop them.
create or replace function public.pause_store(p_storefront_id uuid, p_minutes integer default 10)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_until timestamptz;
begin
  if not private.storefront_scope(p_storefront_id, (select auth.uid()), 'orders') then
    raise exception 'Not allowed to pause this store' using errcode = '42501';
  end if;

  if p_minutes is null or p_minutes < 1 or p_minutes > 120 then
    raise exception 'Pause must be between 1 and 120 minutes' using errcode = 'P0001';
  end if;

  -- Extends from NOW, not from an existing deadline: tapping "10 minutes"
  -- twice means ten more minutes, which is what the person tapping it means.
  v_until := now() + make_interval(mins => p_minutes);

  update public.storefronts
     set paused_until = v_until,
         pause_reason = 'manual',
         updated_at   = now()
   where id = p_storefront_id;

  return v_until;
end;
$fn$;
create or replace function public.resume_store(p_storefront_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not private.storefront_scope(p_storefront_id, (select auth.uid()), 'orders') then
    raise exception 'Not allowed to resume this store' using errcode = '42501';
  end if;

  update public.storefronts
     set paused_until = null,
         pause_reason = null,
         updated_at   = now()
   where id = p_storefront_id;
end;
$fn$;
-- ── 4. Handing out and changing scopes ──────────────────────────────────────
-- Superseding the 3-argument invite rather than adding a 4th with a default:
-- two overloads that differ only by an optional trailing argument are
-- ambiguous to PostgREST, which resolves by argument NAMES and would have to
-- guess.
drop function if exists public.create_storefront_invite(uuid, text, text);
create or replace function public.create_storefront_invite(
  p_storefront_id uuid,
  p_email         text,
  p_role          text default 'manager',
  p_scopes        text[] default array['orders', 'listings']
)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_scopes text[];
  v_row    public.storefront_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select s.vendor_id into v_owner
    from public.storefronts s
   where s.id = p_storefront_id and s.archived_at is null;

  if v_owner is null then
    raise exception 'storefront not found' using errcode = 'P0002';
  end if;
  -- Owner only, restated because SECURITY DEFINER turned RLS off.
  if v_owner <> v_uid then
    raise exception 'only the owner can invite' using errcode = '42501';
  end if;
  if lower(p_email) = lower(coalesce((select u.email from auth.users u where u.id = v_uid), '')) then
    raise exception 'you already own this storefront' using errcode = 'P0001';
  end if;

  -- Deduplicated and validated here rather than left to the check constraint,
  -- so a bad scope name says which one.
  select coalesce(array_agg(distinct sc), '{}')
    into v_scopes
    from unnest(coalesce(p_scopes, '{}')) sc;

  if cardinality(v_scopes) = 0 then
    raise exception 'Choose at least one section for this person to manage'
      using errcode = 'P0001';
  end if;
  if not (v_scopes <@ private.storefront_scope_names()) then
    raise exception 'Unknown section: %',
      array_to_string(array(select s from unnest(v_scopes) s
                             where not (s = any (private.storefront_scope_names()))), ', ')
      using errcode = '22023';
  end if;

  -- Supersede any pending invite for the same address rather than colliding
  -- with storefront_invites_pending_idx.
  update public.storefront_invites
     set revoked_at = now()
   where storefront_id = p_storefront_id
     and lower(email) = lower(p_email)
     and accepted_at is null and revoked_at is null;

  insert into public.storefront_invites (storefront_id, email, role, scopes, invited_by)
  values (p_storefront_id, lower(p_email), p_role, v_scopes, v_uid)
  returning * into v_row;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'owner', 'invite.created', 'storefront', p_storefront_id::text,
          jsonb_build_object('email', lower(p_email), 'role', p_role,
                             'scopes', to_jsonb(v_scopes),
                             'storefront_id', p_storefront_id::text));

  return query select v_row.id, v_row.token, v_row.expires_at;
end;
$fn$;
revoke all on function public.create_storefront_invite(uuid, text, text, text[]) from public, anon;
grant execute on function public.create_storefront_invite(uuid, text, text, text[])
  to authenticated, service_role;
/**
 * Change what an existing manager may reach, without making the owner revoke
 * and re-invite them — which loses the invite trail and their history.
 */
create or replace function public.set_storefront_staff_scopes(
  p_staff_id uuid,
  p_scopes   text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_st     public.storefront_staff%rowtype;
  v_scopes text[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select st.* into v_st from public.storefront_staff st where st.id = p_staff_id for update;
  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select s.vendor_id into v_owner from public.storefronts s where s.id = v_st.storefront_id;
  if v_owner is distinct from v_uid then
    raise exception 'only the owner can change what a manager can reach' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct sc), '{}')
    into v_scopes
    from unnest(coalesce(p_scopes, '{}')) sc;

  if cardinality(v_scopes) = 0 then
    raise exception 'Choose at least one section, or revoke this person instead'
      using errcode = 'P0001';
  end if;
  if not (v_scopes <@ private.storefront_scope_names()) then
    raise exception 'Unknown section' using errcode = '22023';
  end if;

  update public.storefront_staff set scopes = v_scopes where id = p_staff_id;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'owner', 'staff.scopes', 'storefront', v_st.storefront_id::text,
          jsonb_build_object('scopes', to_jsonb(v_st.scopes)),
          jsonb_build_object('scopes', to_jsonb(v_scopes),
                             'storefront_id', v_st.storefront_id::text));
end;
$fn$;
revoke all on function public.set_storefront_staff_scopes(uuid, text[]) from public, anon;
grant execute on function public.set_storefront_staff_scopes(uuid, text[])
  to authenticated, service_role;
-- The roster and the pending list both gain a scopes column, so the owner can
-- see what they granted without opening an edit form.
drop function if exists public.storefront_roster(uuid);
create function public.storefront_roster(p_storefront_id uuid default null)
returns table (
  staff_id      uuid,
  storefront_id uuid,
  branch_name   text,
  user_id       uuid,
  full_name     text,
  email         text,
  role          text,
  scopes        text[],
  joined_at     timestamptz,
  revoked_at    timestamptz,
  is_active     boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    st.id,
    st.storefront_id,
    s.name,
    st.user_id,
    p.full_name,
    u.email,
    st.role,
    st.scopes,
    st.joined_at,
    st.revoked_at,
    st.revoked_at is null
  from public.storefront_staff st
  join public.storefronts s on s.id = st.storefront_id
  left join public.profiles p on p.id = st.user_id
  left join auth.users     u on u.id = st.user_id
  where s.vendor_id = (select auth.uid())          -- owner only, restated
    and (p_storefront_id is null or st.storefront_id = p_storefront_id)
  order by (st.revoked_at is null) desc, st.joined_at desc;
$fn$;
grant execute on function public.storefront_roster(uuid) to authenticated, service_role;
drop function if exists public.storefront_invites_pending(uuid);
create function public.storefront_invites_pending(p_storefront_id uuid default null)
returns table (
  invite_id     uuid,
  storefront_id uuid,
  branch_name   text,
  email         text,
  role          text,
  scopes        text[],
  invited_at    timestamptz,
  expires_at    timestamptz,
  is_expired    boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    i.id, i.storefront_id, s.name, i.email, i.role, i.scopes,
    i.created_at, i.expires_at, i.expires_at <= now()
  from public.storefront_invites i
  join public.storefronts s on s.id = i.storefront_id
  where s.vendor_id = (select auth.uid())
    and i.accepted_at is null
    and i.revoked_at  is null
    and (p_storefront_id is null or i.storefront_id = p_storefront_id)
  order by i.created_at desc;
$fn$;
grant execute on function public.storefront_invites_pending(uuid) to authenticated, service_role;
/**
 * Cancel an invitation that has not been redeemed.
 *
 * Without this the only way to undo a mistyped address was to wait seven days,
 * and the token is live that whole time.
 */
create or replace function public.revoke_storefront_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_inv   public.storefront_invites%rowtype;
begin
  select i.* into v_inv from public.storefront_invites i where i.id = p_invite_id for update;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  select s.vendor_id into v_owner from public.storefronts s where s.id = v_inv.storefront_id;
  if v_owner is distinct from v_uid then
    raise exception 'only the owner can cancel an invite' using errcode = '42501';
  end if;

  update public.storefront_invites set revoked_at = now() where id = p_invite_id;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before)
  values (v_uid, 'owner', 'invite.revoked', 'storefront', v_inv.storefront_id::text,
          jsonb_build_object('email', v_inv.email,
                             'storefront_id', v_inv.storefront_id::text));
end;
$fn$;
revoke all on function public.revoke_storefront_invite(uuid) from public, anon;
grant execute on function public.revoke_storefront_invite(uuid) to authenticated, service_role;
-- Redemption has to carry the scopes across, or every invite would land as the
-- table default no matter what the owner ticked.
create or replace function public.accept_storefront_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_inv    public.storefront_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The VERIFIED address only. Matching an unconfirmed email would let anyone
  -- claim an invite by typing someone else's address at sign-up.
  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'confirm your email address first' using errcode = 'P0001';
  end if;

  select * into v_inv from public.storefront_invites
   where token = p_token
     for update;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invite already used' using errcode = 'P0001';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invite was revoked' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invite has expired' using errcode = 'P0001';
  end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'this invite was sent to a different address' using errcode = '42501';
  end if;

  insert into public.storefront_staff (storefront_id, user_id, role, scopes, invited_by)
  values (v_inv.storefront_id, v_uid, v_inv.role, v_inv.scopes, v_inv.invited_by)
  on conflict (storefront_id, user_id) where revoked_at is null do nothing;

  update public.storefront_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, v_inv.role, 'invite.accepted', 'storefront', v_inv.storefront_id::text,
          jsonb_build_object('email', v_email, 'role', v_inv.role,
                             'scopes', to_jsonb(v_inv.scopes),
                             'storefront_id', v_inv.storefront_id::text));

  return v_inv.storefront_id;
end;
$fn$;
grant execute on function public.accept_storefront_invite(text) to authenticated, service_role;
-- ── 5. Archive and restore, with the guards that make it safe ───────────────
/**
 * Take a store out of circulation, or put it back.
 *
 * ARCHIVING IS ALREADY INVISIBLE TO STUDENTS — storefronts_select_public is
 * `using (archived_at is null)`, so an archived store drops out of discovery,
 * out of nearby_storefronts and out of its own page with no extra filtering.
 * The owner still sees it, because their own policy has no such clause. That
 * is exactly the toggle the product wants; what was missing was a safe way to
 * flip it.
 *
 * TWO REFUSALS, BOTH ABOUT SOMEBODY ELSE'S EXPECTATIONS
 *   - A store with orders in flight owes food to a student who has paid. The
 *     order would survive (orders.storefront_id is ON DELETE RESTRICT and this
 *     is a soft delete anyway), but the queue it is worked from would vanish
 *     from the vendor's app. Finish them first.
 *   - The last active store cannot go. A business with zero stores has nowhere
 *     to put a listing, nowhere for a cart to belong and no primary for a link
 *     to resolve to — resolvePrimaryStorefrontId throws, and checkout with it.
 *
 * IT MOVES THE PRIMARY FLAG RATHER THAN DROPPING IT. storefronts_one_primary_idx
 * allows zero primaries, so nothing would have complained — a link to the
 * business would just have stopped resolving.
 */
create or replace function public.set_storefront_archived(
  p_storefront_id uuid,
  p_archived      boolean
)
returns public.storefronts
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_store     public.storefronts%rowtype;
  v_unfinished integer;
  v_others    integer;
  v_heir      uuid;
  v_result    public.storefronts%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_store from public.storefronts where id = p_storefront_id for update;
  if not found then
    raise exception 'store not found' using errcode = 'P0002';
  end if;
  -- Owner only. Archiving is structural, and guard_storefront_privileged_cols
  -- already silently reverts a manager who tries it through a plain update.
  if v_store.vendor_id is distinct from v_uid then
    raise exception 'Only the owner can archive a store' using errcode = '42501';
  end if;

  if p_archived then
    if v_store.archived_at is not null then
      return v_store;                                   -- idempotent
    end if;

    select count(*) into v_unfinished
      from public.orders o
     where o.storefront_id = p_storefront_id
       and o.status in ('pending', 'preparing', 'picked_up', 'on_the_way');

    if v_unfinished > 0 then
      raise exception
        'This store still has % order(s) to finish. Complete or cancel them before archiving it.',
        v_unfinished
        using errcode = 'P0001';
    end if;

    select count(*) into v_others
      from public.storefronts s
     where s.vendor_id = v_store.vendor_id
       and s.id <> p_storefront_id
       and s.archived_at is null;

    if v_others = 0 then
      raise exception 'This is your only open store. Add another one before archiving this.'
        using errcode = 'P0001';
    end if;

    -- Hand the primary flag on before leaving, so a link to the business still
    -- resolves somewhere.
    if v_store.is_primary then
      select s.id into v_heir
        from public.storefronts s
       where s.vendor_id = v_store.vendor_id
         and s.id <> p_storefront_id
         and s.archived_at is null
       order by s.created_at
       limit 1;

      update public.storefronts set is_primary = true, updated_at = now() where id = v_heir;
    end if;

    update public.storefronts
       set archived_at = now(),
           is_primary  = false,
           -- An archived store takes no orders regardless, but leaving the
           -- switch on means restoring one silently reopens it to students
           -- before the vendor has looked at their stock.
           is_accepting_orders = false,
           updated_at  = now()
     where id = p_storefront_id
    returning * into v_result;
  else
    if v_store.archived_at is null then
      return v_store;                                   -- idempotent
    end if;

    update public.storefronts
       set archived_at = null,
           updated_at  = now()
     where id = p_storefront_id
    returning * into v_result;

    -- A business with no primary is a business whose public link 404s. If the
    -- one being restored is the only one left standing, it takes the flag.
    if not exists (
      select 1 from public.storefronts s
       where s.vendor_id = v_store.vendor_id and s.is_primary and s.archived_at is null
    ) then
      update public.storefronts set is_primary = true, updated_at = now()
       where id = p_storefront_id
      returning * into v_result;
    end if;
  end if;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'owner',
          case when p_archived then 'storefront.archived' else 'storefront.restored' end,
          'storefront', p_storefront_id::text,
          jsonb_build_object('name', v_store.name,
                             'storefront_id', p_storefront_id::text));

  return v_result;
end;
$fn$;
revoke all on function public.set_storefront_archived(uuid, boolean) from public, anon;
grant execute on function public.set_storefront_archived(uuid, boolean)
  to authenticated, service_role;
comment on function public.set_storefront_archived(uuid, boolean) is
  'Archive or restore a store. Refuses while orders are unfinished or it is the last open store, and carries the primary flag with it.';
-- ── 6. A second store requires a verified business ──────────────────────────
/**
 * WHY THE FIRST ONE IS FREE
 *   Every account gets a store the moment it becomes a vendor — the backfill
 *   in 20260822090000 gave one to every existing business, and a new one needs
 *   somewhere to put its first listing before anybody has reviewed it.
 *   Blocking that would mean onboarding could not complete. What verification
 *   gates is EXPANSION: a second address on the campus map, claimed by an
 *   account nobody has checked, is the thing worth stopping.
 *
 *   Counting non-archived stores rather than all of them on purpose: a vendor
 *   who archived their only store is back to zero and can open one again.
 *
 * ONLY FOR CLIENT-SIDE CALLERS, like the other guards in this schema. Migrations
 * and service-role backfills run as a different role and are not subject to it.
 */
create or replace function public.guard_storefront_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_existing integer;
  v_status   text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select count(*) into v_existing
    from public.storefronts s
   where s.vendor_id = new.vendor_id
     and s.archived_at is null;

  if v_existing = 0 then
    return new;
  end if;

  select vp.verification_status into v_status
    from public.vendor_profiles vp
   where vp.id = new.vendor_id;

  if coalesce(v_status, 'unverified') <> 'verified' then
    raise exception
      'Verify your business before adding another store.'
      using errcode = '42501',
            hint    = 'Your first store is always open to you; extra locations need a verified account.';
  end if;

  return new;
end;
$fn$;
drop trigger if exists storefronts_require_verification on public.storefronts;
create trigger storefronts_require_verification
  before insert on public.storefronts
  for each row execute function public.guard_storefront_insert();
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'storefronts'
         and column_name = 'auto_pause_after') is distinct from '5' then
    raise exception 'auto_pause_after did not take its default';
  end if;

  if to_regprocedure('private.storefront_scope(uuid, uuid, text)') is null then
    raise exception 'storefront_scope missing';
  end if;

  if to_regprocedure('public.set_storefront_archived(uuid, boolean)') is null then
    raise exception 'set_storefront_archived missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'storefront_staff'
       and column_name = 'scopes'
  ) then
    raise exception 'storefront_staff.scopes missing';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'orders_sync_backlog_pause'
  ) then
    raise exception 'orders_sync_backlog_pause missing';
  end if;
end $$;
