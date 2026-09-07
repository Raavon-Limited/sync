-- ============================================================================
-- storefront_staff
--
-- A vendor invites someone to run one of their branches. Membership is per
-- BRANCH, not per brand: "manage my Tanke shop" must not also mean "manage my
-- Gaa Akanbi shop".
--
-- THE MONEY BOUNDARY IS THE POINT
--   Staff reach FULFILMENT and never MONEY. Listings, stock, orders, their
--   branch's hours and its messages: yes. Wallet, payouts, bank accounts,
--   subscription, plan changes: owner only.
--
--   That boundary is free because of how storefronts was designed - money lives
--   on vendor_profiles (the brand) and fulfilment on storefronts (the branch),
--   so widening branch permissions cannot reach the money tables. No policy
--   below touches wallets, payouts, bank_accounts or subscriptions. Keep it
--   that way: handing a manager hired last week the withdrawal account is how a
--   vendor loses their takings.
--
-- WHY INVITES TARGET AN EMAIL, NOT A USER
--   The person being invited usually has no account yet. An invite therefore
--   names an email and is redeemed after sign-up, matched against the caller's
--   VERIFIED email so an unverified address cannot claim someone else's invite.
--
-- THE RLS RIPPLE THIS RESOLVES
--   Every vendor write policy was written as `auth.uid() = vendor_id`. A
--   manager's uid is not the vendor's uid, so without the widening below an
--   invited manager could sign in, see the branch, and edit nothing. Those
--   policies now consult private.can_manage_storefront(), which is the single
--   place that knows what "may manage" means.
--
-- ROLLBACK
--   Restore listings_write_own / orders_update_vendor / storefronts_write_own
--   from 0006_student_core.sql and 20260822090000_storefronts.sql;
--   drop function if exists public.accept_storefront_invite(text);
--   drop function if exists public.create_storefront_invite(uuid, text, text);
--   drop function if exists public.revoke_storefront_staff(uuid);
--   drop function if exists public.storefront_activity(uuid, integer);
--   drop function if exists private.can_manage_storefront(uuid, uuid);
--   drop table if exists public.storefront_invites, public.storefront_staff cascade;
-- ============================================================================

-- 1. Membership ---------------------------------------------------------------
create table if not exists public.storefront_staff (
  id           uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.storefronts (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- 'manager' runs the branch. 'staff' is reserved for a narrower role later;
  -- both are treated the same by the policies below for now.
  role         text not null default 'manager' check (role in ('manager', 'staff')),
  invited_by   uuid references public.profiles (id) on delete set null,
  joined_at    timestamptz not null default now(),
  -- Revoked, never deleted: the audit trail must still resolve who did what.
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- One active membership per person per branch.
create unique index if not exists storefront_staff_unique_active_idx
  on public.storefront_staff (storefront_id, user_id) where revoked_at is null;
-- The shape the permission check probes.
create index if not exists storefront_staff_user_idx
  on public.storefront_staff (user_id, storefront_id) where revoked_at is null;

-- 2. Invitations --------------------------------------------------------------
create table if not exists public.storefront_invites (
  id            uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.storefronts (id) on delete cascade,
  email         text not null,
  role          text not null default 'manager' check (role in ('manager', 'staff')),
  -- Random, single-use, and never exposed by a SELECT policy - the invite is
  -- delivered out of band. Anyone who can read tokens can join any branch.
  --
  -- Two v4 UUIDs rather than gen_random_bytes(): that function comes from
  -- pgcrypto, which this schema never declares, whereas gen_random_uuid() is
  -- built into Postgres 13+ and is already the default on every table here. Two
  -- of them stripped of dashes give 64 hex characters and 244 bits of
  -- randomness - far past guessable, with no extension dependency to verify.
  token         text not null unique
                  default replace(gen_random_uuid()::text, '-', '')
                       || replace(gen_random_uuid()::text, '-', ''),
  invited_by    uuid not null references public.profiles (id) on delete cascade,
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  accepted_by   uuid references public.profiles (id) on delete set null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists storefront_invites_pending_idx
  on public.storefront_invites (storefront_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- 3. What "may manage" means --------------------------------------------------
-- SECURITY DEFINER for two reasons. It lets a policy ask the question without
-- the caller needing read access to storefronts or storefront_staff rows they
-- do not own; and it breaks the recursion that would otherwise occur when the
-- policy ON storefront_staff needs to consult storefront_staff. Same technique
-- as private.is_conversation_member().
create or replace function private.can_manage_storefront(p_storefront uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    -- The owner. vendor_profiles.id = profiles.id, so this is a direct compare.
    select 1 from public.storefronts s
     where s.id = p_storefront and s.vendor_id = p_user and s.archived_at is null
    union all
    -- Or active staff of that branch.
    select 1 from public.storefront_staff st
      join public.storefronts s2 on s2.id = st.storefront_id
     where st.storefront_id = p_storefront
       and st.user_id = p_user
       and st.revoked_at is null
       and s2.archived_at is null
  );
$fn$;

grant execute on function private.can_manage_storefront(uuid, uuid) to authenticated, service_role;

-- 4. Integrity: a listing's brand must match its branch's brand ---------------
-- Without this, staff who may write a listing for their branch could set
-- vendor_id to another brand, and the row would satisfy both the policy and the
-- foreign keys while being nonsense. Worth having regardless of staff.
create or replace function public.sync_listing_vendor_to_storefront()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_owner uuid;
begin
  if new.storefront_id is null then
    return new;
  end if;
  select s.vendor_id into v_owner from public.storefronts s where s.id = new.storefront_id;
  if v_owner is null then
    raise exception 'storefront % does not exist', new.storefront_id using errcode = 'P0002';
  end if;
  -- Derived, not trusted: the branch decides the brand.
  new.vendor_id := v_owner;
  return new;
end;
$fn$;

drop trigger if exists listings_sync_vendor on public.listings;
create trigger listings_sync_vendor
  before insert or update of storefront_id, vendor_id on public.listings
  for each row execute function public.sync_listing_vendor_to_storefront();

-- 5. Staff may not change what makes a branch theirs --------------------------
-- Follows guard_order_privileged_cols in 0006: silently restore rather than
-- raise, so an over-broad client patch degrades instead of failing.
create or replace function public.guard_storefront_privileged_cols()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if current_user in ('authenticated', 'anon')
     and (select auth.uid()) is distinct from old.vendor_id then
    -- Not the owner: staff may edit trading details, nothing structural.
    new.vendor_id  := old.vendor_id;
    new.is_primary := old.is_primary;
    new.slug       := old.slug;
    new.archived_at := old.archived_at;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists storefronts_guard_cols on public.storefronts;
create trigger storefronts_guard_cols
  before update on public.storefronts
  for each row execute function public.guard_storefront_privileged_cols();

-- 6. Widen the write policies -------------------------------------------------
-- listings: owner OR branch staff.
drop policy if exists "listings_write_own" on public.listings;
create policy "listings_write_own" on public.listings
  for all to authenticated
  using       ((select auth.uid()) = vendor_id
               or private.can_manage_storefront(storefront_id, (select auth.uid())))
  with check  ((select auth.uid()) = vendor_id
               or private.can_manage_storefront(storefront_id, (select auth.uid())));

-- orders: the branch working the queue must be able to advance status. Money
-- columns on orders stay protected by guard_order_privileged_cols from 0006.
drop policy if exists "orders_update_vendor" on public.orders;
create policy "orders_update_vendor" on public.orders
  for update to authenticated
  using       ((select auth.uid()) = vendor_id
               or private.can_manage_storefront(storefront_id, (select auth.uid())))
  with check  ((select auth.uid()) = vendor_id
               or private.can_manage_storefront(storefront_id, (select auth.uid())));

-- orders select: students, the owner, and now branch staff.
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select to authenticated
  using ((select auth.uid()) = student_id
         or (select auth.uid()) = vendor_id
         or private.can_manage_storefront(storefront_id, (select auth.uid())));

-- storefronts: creating, deleting and re-parenting a branch stay owner-only.
-- Staff get UPDATE, narrowed to trading columns by the guard above.
drop policy if exists "storefronts_write_own" on public.storefronts;
create policy "storefronts_write_own" on public.storefronts
  for all to authenticated
  using       ((select auth.uid()) = vendor_id)
  with check  ((select auth.uid()) = vendor_id);

drop policy if exists "storefronts_update_staff" on public.storefronts;
create policy "storefronts_update_staff" on public.storefronts
  for update to authenticated
  using       (private.can_manage_storefront(id, (select auth.uid())))
  with check  (private.can_manage_storefront(id, (select auth.uid())));

-- 7. RLS on the new tables ----------------------------------------------------
alter table public.storefront_staff   enable row level security;
alter table public.storefront_invites enable row level security;

-- You can see a roster if you can manage the branch, or if it is your own row.
drop policy if exists "storefront_staff_read" on public.storefront_staff;
create policy "storefront_staff_read" on public.storefront_staff
  for select to authenticated
  using (user_id = (select auth.uid())
         or private.can_manage_storefront(storefront_id, (select auth.uid())));

-- Only the OWNER hires and fires. A manager inviting other managers is how an
-- owner loses track of who has access; revisit only if the product asks for it.
drop policy if exists "storefront_staff_write_owner" on public.storefront_staff;
create policy "storefront_staff_write_owner" on public.storefront_staff
  for all to authenticated
  using       (exists (select 1 from public.storefronts s
                        where s.id = storefront_id and s.vendor_id = (select auth.uid())))
  with check  (exists (select 1 from public.storefronts s
                        where s.id = storefront_id and s.vendor_id = (select auth.uid())));

-- Invites are never readable by the invitee: the token IS the credential, and a
-- SELECT policy that exposed it would let anyone who can list invites join any
-- branch. Redemption goes through accept_storefront_invite() instead.
drop policy if exists "storefront_invites_owner" on public.storefront_invites;
create policy "storefront_invites_owner" on public.storefront_invites
  for all to authenticated
  using       (exists (select 1 from public.storefronts s
                        where s.id = storefront_id and s.vendor_id = (select auth.uid())))
  with check  (exists (select 1 from public.storefronts s
                        where s.id = storefront_id and s.vendor_id = (select auth.uid())));

revoke all on public.storefront_staff   from anon, authenticated;
revoke all on public.storefront_invites from anon, authenticated;
grant select, insert, update, delete on public.storefront_staff   to authenticated;
grant select, insert, update, delete on public.storefront_invites to authenticated;

-- 8. Invite lifecycle ---------------------------------------------------------
create or replace function public.create_storefront_invite(
  p_storefront_id uuid,
  p_email         text,
  p_role          text default 'manager'
)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_row   public.storefront_invites%rowtype;
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

  -- Supersede any pending invite for the same address rather than colliding
  -- with storefront_invites_pending_idx.
  update public.storefront_invites
     set revoked_at = now()
   where storefront_id = p_storefront_id
     and lower(email) = lower(p_email)
     and accepted_at is null and revoked_at is null;

  insert into public.storefront_invites (storefront_id, email, role, invited_by)
  values (p_storefront_id, lower(p_email), p_role, v_uid)
  returning * into v_row;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, 'owner', 'invite.created', 'storefront', p_storefront_id::text,
          jsonb_build_object('email', lower(p_email), 'role', p_role));

  return query select v_row.id, v_row.token, v_row.expires_at;
end;
$fn$;

grant execute on function public.create_storefront_invite(uuid, text, text) to authenticated, service_role;

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

  insert into public.storefront_staff (storefront_id, user_id, role, invited_by)
  values (v_inv.storefront_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (storefront_id, user_id) where revoked_at is null do nothing;

  update public.storefront_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, after)
  values (v_uid, v_inv.role, 'invite.accepted', 'storefront', v_inv.storefront_id::text,
          jsonb_build_object('email', v_email, 'role', v_inv.role));

  return v_inv.storefront_id;
end;
$fn$;

grant execute on function public.accept_storefront_invite(text) to authenticated, service_role;

create or replace function public.revoke_storefront_staff(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_st    public.storefront_staff%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select st.* into v_st from public.storefront_staff st where st.id = p_staff_id for update;
  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select s.vendor_id into v_owner from public.storefronts s where s.id = v_st.storefront_id;
  if v_owner <> v_uid then
    raise exception 'only the owner can revoke' using errcode = '42501';
  end if;

  -- Revoked, not deleted: private.audit_log.actor_id must still resolve.
  update public.storefront_staff set revoked_at = now() where id = p_staff_id;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before)
  values (v_uid, 'owner', 'staff.revoked', 'storefront', v_st.storefront_id::text,
          jsonb_build_object('user_id', v_st.user_id, 'role', v_st.role));
end;
$fn$;

grant execute on function public.revoke_storefront_staff(uuid) to authenticated, service_role;
