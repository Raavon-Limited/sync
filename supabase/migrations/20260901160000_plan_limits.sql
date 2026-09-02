-- ============================================================================
-- plan_limits
--
-- The plans stop being a pricing page and start being limits the database
-- keeps.
--
-- WHAT WAS THERE BEFORE
--   `plans.max_listings` existed, was rendered on the pricing card, and was
--   enforced by absolutely nothing. A vendor on the free plan could add ten
--   thousand listings and the only thing that ever mentioned the cap was the
--   card advertising it. A limit nobody enforces is not a limit, it is a
--   claim   and it is the kind that gets noticed by the people you least want
--   noticing it.
--
-- THE LADDER
--                     listings  stores  team    AI replies  disputes   boost
--   Starter (free)           1       1  none    none        none          0%
--   Growth                   5       3  yes     limited     managed      30%
--   Pro                     10       5  yes     full        priority     50%
--
-- ENFORCED IN THE DATABASE, NOT THE FORM. A client-side check is a hint; a
-- vendor with the network tab open is not bound by it, and neither is a second
-- client we write later. The triggers below are the limit; the UI just says so
-- before you hit it.
--
-- COUNTS ARE OF WHAT IS LIVE, NOT OF WHAT EVER EXISTED. Archived listings and
-- archived stores do not count   otherwise a vendor who tidied up would be
-- permanently poorer for having done so, and the only fix would be a hard
-- delete we deliberately do not offer.
--
-- DOWNGRADES DO NOT DELETE ANYTHING. Dropping from Pro to Starter with four
-- stores leaves four stores standing; what the vendor loses is the ability to
-- add a FIFTH. Enforcing on the way down would mean this migration deciding
-- which of somebody's shops to close, which is not a decision a trigger gets
-- to make. The caps are on creation only, and the plan screen says so.
--
-- NO PLAN = THE FREE PLAN. A vendor who never subscribed is on Starter's
-- limits, not on none: `effective_plan()` falls back to the cheapest active
-- plan rather than returning null and letting every caller decide for itself.
--
-- ROLLBACK
--   drop trigger if exists listings_enforce_plan_limit on public.listings;
--   drop trigger if exists storefronts_enforce_plan_limit on public.storefronts;
--   drop function if exists public.enforce_listing_plan_limit();
--   drop function if exists public.enforce_store_plan_limit();
--   drop function if exists private.effective_plan(uuid);
--   alter table public.plans
--     drop column if exists max_stores, drop column if exists max_team,
--     drop column if exists ai_replies, drop column if exists dispute_support,
--     drop column if exists boost_percent;
--   -- and restore create_storefront_invite from 20260901090000.
-- ============================================================================

-- ── 1. What a plan grants ───────────────────────────────────────────────────
-- Null means UNLIMITED everywhere here, which is why `max_team` for Starter is
-- 0 and not null: "no team invites" and "as many as you like" must not be the
-- same value.
alter table public.plans
  add column if not exists max_stores      integer,
  add column if not exists max_team        integer,
  add column if not exists ai_replies      text not null default 'none'
    check (ai_replies in ('none', 'limited', 'full')),
  add column if not exists dispute_support text not null default 'none'
    check (dispute_support in ('none', 'managed', 'priority')),
  add column if not exists boost_percent   integer not null default 0
    check (boost_percent between 0 and 100);

comment on column public.plans.max_stores is 'Live stores this plan allows. Null = unlimited.';
comment on column public.plans.max_team is 'Active staff per business. 0 = no invites at all; null = unlimited.';
comment on column public.plans.boost_percent is 'Discount on promotion placement, as a percentage. 0 = pays full price.';

update public.plans set
  max_listings    = 1,
  max_stores      = 1,
  max_team        = 0,
  ai_replies      = 'none',
  dispute_support = 'none',
  boost_percent   = 0,
  description     = 'Get listed and start selling.'
 where code = 'free';

update public.plans set
  max_listings    = 5,
  max_stores      = 3,
  -- Unlimited: the brief said Growth has team invites and did not cap them.
  -- A number invented here would be a limit nobody agreed to.
  max_team        = null,
  ai_replies      = 'limited',
  dispute_support = 'managed',
  boost_percent   = 30,
  description     = 'More stores, promotions and help when an order goes wrong.'
 where code = 'growth';

update public.plans set
  max_listings    = 10,
  max_stores      = 5,
  max_team        = null,
  ai_replies      = 'full',
  dispute_support = 'priority',
  boost_percent   = 50,
  description     = 'Everything Sync does, with the fastest support.'
 where code = 'pro';

-- The feature bullets the pricing card renders. Stored rather than hardcoded
-- in the component so changing what a plan offers is a data change.
update public.plans set features = '[
  "1 store",
  "No team members",
  "Basic chat with customers"
]'::jsonb where code = 'free';

update public.plans set features = '[
  "Up to 3 stores",
  "Invite your team",
  "AI replies when you are away (limited)",
  "Dispute management",
  "30% off promotion boosts"
]'::jsonb where code = 'growth';

update public.plans set features = '[
  "Up to 5 stores",
  "Invite your team",
  "AI replies and ticket generation",
  "Priority dispute resolution",
  "50% off promotion boosts",
  "Every feature Sync has"
]'::jsonb where code = 'pro';

-- ── 2. Which plan a vendor is actually on ───────────────────────────────────
-- One definition, so a trigger, an RPC and a screen cannot disagree about
-- whether somebody is on Growth.
create or replace function private.effective_plan(p_vendor uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.*
    from public.plans p
   where p.id = (
     select s.plan_id
       from public.subscriptions s
      where s.vendor_id = p_vendor
        and s.status in ('active', 'past_due')
        and s.current_period_end > now()
      order by s.current_period_end desc
      limit 1
   )
  union all
  -- No subscription, or an expired one: the cheapest active plan. Selected by
  -- price rather than by the literal code 'free', so renaming the entry plan
  -- does not silently remove everyone's limits.
  --
  -- PARENTHESISED so the ORDER BY / LIMIT belong to THIS branch. Written flat,
  -- they attach to the whole UNION instead, where the alias `p` is out of
  -- scope - a union's output is an unnamed relation whose columns can only be
  -- named by output label or ordinal. That is the "missing FROM-clause entry
  -- for table p" this migration failed on. The branches are mutually exclusive
  -- (the second's NOT EXISTS is the negation of the first's subquery), so the
  -- limit was always meant for the fallback alone.
  (
    select p.*
      from public.plans p
     where p.is_active
       and not exists (
         select 1 from public.subscriptions s
          where s.vendor_id = p_vendor
            and s.status in ('active', 'past_due')
            and s.current_period_end > now()
       )
     order by p.price_kobo, p.sort_order
     limit 1
  );
$fn$;

grant execute on function private.effective_plan(uuid) to authenticated, service_role;

-- ── 3. Listings ─────────────────────────────────────────────────────────────
-- Invoker-rights, like the other guards here: a SECURITY DEFINER trigger
-- reports `current_user` as its owner, so the "is this a client call?" test
-- would never match and the limit would never apply. See guard_storefront_insert.
create or replace function public.enforce_listing_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_plan  public.plans%rowtype;
  v_count integer;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select * into v_plan from private.effective_plan(new.vendor_id);

  if v_plan.max_listings is null then
    return new;
  end if;

  select count(*) into v_count
    from public.listings l
   where l.vendor_id = new.vendor_id
     and l.archived_at is null;

  if v_count >= v_plan.max_listings then
    raise exception
      'The % plan allows % listing(s). Archive one, or upgrade to add more.',
      v_plan.name, v_plan.max_listings
      using errcode = 'P0001',
            hint = 'Plans are on /vendor/plan.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists listings_enforce_plan_limit on public.listings;
create trigger listings_enforce_plan_limit
  before insert on public.listings
  for each row execute function public.enforce_listing_plan_limit();

-- ── 4. Stores ───────────────────────────────────────────────────────────────
-- Separate from guard_storefront_insert on purpose: that one is about identity
-- (has this business been reviewed?) and this one is about the plan. They fail
-- for different reasons and have to say different things.
create or replace function public.enforce_store_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_plan  public.plans%rowtype;
  v_count integer;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select * into v_plan from private.effective_plan(new.vendor_id);

  if v_plan.max_stores is null then
    return new;
  end if;

  select count(*) into v_count
    from public.storefronts s
   where s.vendor_id = new.vendor_id
     and s.archived_at is null;

  if v_count >= v_plan.max_stores then
    raise exception
      'The % plan allows % store(s). Archive one, or upgrade to open more.',
      v_plan.name, v_plan.max_stores
      using errcode = 'P0001',
            hint = 'Plans are on /vendor/plan.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists storefronts_enforce_plan_limit on public.storefronts;
create trigger storefronts_enforce_plan_limit
  before insert on public.storefronts
  for each row execute function public.enforce_store_plan_limit();

-- ── 5. Team ─────────────────────────────────────────────────────────────────
-- Checked when the INVITE is created, not when it is redeemed. Refusing at
-- redemption would mean the owner sends a link, the person signs up, and only
-- then finds out they were never allowed in   the failure lands on the wrong
-- person, days late.
--
-- Pending invites count against the cap. Otherwise a Starter vendor could
-- issue twenty and be over the limit the moment they are accepted.
--
-- Same body as 20260901090000 plus the plan check.
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
  v_plan   public.plans%rowtype;
  v_seats  integer;
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

  select * into v_plan from private.effective_plan(v_owner);

  if v_plan.max_team is not null then
    select
      (select count(*) from public.storefront_staff st
         join public.storefronts s on s.id = st.storefront_id
        where s.vendor_id = v_owner and st.revoked_at is null and s.archived_at is null)
      + (select count(*) from public.storefront_invites i
           join public.storefronts s2 on s2.id = i.storefront_id
          where s2.vendor_id = v_owner
            and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
    into v_seats;

    if v_seats >= v_plan.max_team then
      if v_plan.max_team = 0 then
        raise exception
          'The % plan does not include team members. Upgrade to invite someone.', v_plan.name
          using errcode = 'P0001', hint = 'Plans are on /vendor/plan.';
      else
        raise exception
          'The % plan allows % team member(s). Revoke someone, or upgrade.',
          v_plan.name, v_plan.max_team
          using errcode = 'P0001', hint = 'Plans are on /vendor/plan.';
      end if;
    end if;
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

-- ── 6. What the app is allowed to show ──────────────────────────────────────
-- The screens need to say "3 of 5 stores" and grey out Invite BEFORE the
-- vendor hits a refusal. One RPC so they all read the same numbers the
-- triggers enforce.
create or replace function public.my_plan_usage()
returns table (
  plan_code       text,
  plan_name       text,
  price_kobo      bigint,
  max_listings    integer,
  used_listings   integer,
  max_stores      integer,
  used_stores     integer,
  max_team        integer,
  used_team       integer,
  ai_replies      text,
  dispute_support text,
  boost_percent   integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with me as (select (select auth.uid()) as uid),
  plan as (select (private.effective_plan((select uid from me))).*)
  select
    plan.code,
    plan.name,
    plan.price_kobo,
    plan.max_listings,
    (select count(*)::integer from public.listings l
      where l.vendor_id = (select uid from me) and l.archived_at is null),
    plan.max_stores,
    (select count(*)::integer from public.storefronts s
      where s.vendor_id = (select uid from me) and s.archived_at is null),
    plan.max_team,
    (select count(*)::integer from public.storefront_staff st
       join public.storefronts s on s.id = st.storefront_id
      where s.vendor_id = (select uid from me)
        and st.revoked_at is null and s.archived_at is null),
    plan.ai_replies,
    plan.dispute_support,
    plan.boost_percent
  from plan;
$fn$;

revoke all on function public.my_plan_usage() from public, anon;
grant execute on function public.my_plan_usage() to authenticated, service_role;

comment on function public.my_plan_usage() is
  'The caller''s plan and what they have used of it. The same numbers the triggers enforce   read this rather than counting in the client.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_free public.plans%rowtype;
begin
  select * into v_free from public.plans where code = 'free';
  if v_free.max_listings is distinct from 1 or v_free.max_stores is distinct from 1
     or v_free.max_team is distinct from 0 then
    raise exception 'the free plan did not take its limits';
  end if;

  if to_regprocedure('private.effective_plan(uuid)') is null then
    raise exception 'effective_plan missing';
  end if;
  if to_regprocedure('public.my_plan_usage()') is null then
    raise exception 'my_plan_usage missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'listings_enforce_plan_limit') then
    raise exception 'listing limit trigger missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'storefronts_enforce_plan_limit') then
    raise exception 'store limit trigger missing';
  end if;
end $$;
