-- ============================================================================
-- access_roles
--
-- Named roles with per-area access, at two scopes: the admin console and a
-- vendor's branch. One model, because they are the same question asked twice.
--
-- WHAT EXISTS TODAY AND WHY IT IS NOT ENOUGH
--   Admin: `profiles.role` is 'admin' or 'super_admin' and that is the whole
--   vocabulary. Somebody hired to review documents can also resolve disputes,
--   edit the homepage and change platform settings.
--
--   Vendor: `storefront_staff.role` is 'manager' or 'staff', and 20260822130000
--   says outright that "both are treated the same by the policies below for
--   now". Two names, identical access — so inviting a counter assistant hands
--   over the branch, earnings included.
--
-- THE MODEL
--   access_roles     a named role. Platform-wide, or belonging to one branch.
--   access_grants    what that role may do in each area: read, or write.
--   access_members   who holds it.
--
--   Access is the HIGHEST level across the roles you hold. Two roles, one
--   granting read and one write, means write — union, never intersection, so
--   adding a role can only ever add access. The alternative surprises people:
--   being given a second job would take the first one away.
--
-- 'none' IS NOT STORED
--   A missing grant IS no access. Storing an explicit 'none' would create two
--   ways to say the same thing and a question about which wins when two roles
--   disagree. The level column is read/write only.
--
-- AREAS ARE TEXT, NOT AN ENUM
--   The canonical list lives in src/modules/access/areas.ts next to the code
--   that uses it, for the same reason verification requirements do: adding a
--   screen should not need a migration. An unknown area simply grants nothing.
--
-- SUPER ADMIN IS NOT A ROLE HERE
--   It bypasses this system entirely — access_level returns 'write' for a
--   super admin whatever the tables say. Somebody has to be able to fix a
--   permission mistake, and that person cannot be locked out by the mistake.
--
-- NOBODY LOSES ACCESS WHEN THIS LANDS
--   A 'Full access' system role is seeded and every existing admin is put in
--   it. Without that, applying this migration would silently strip the console
--   from everyone who has it.
--
-- ROLLBACK
--   drop function if exists public.access_level(text, uuid);
--   drop function if exists public.my_access(uuid);
--   drop function if exists public.set_role_grant(uuid, text, text);
--   drop function if exists public.assign_access_role(uuid, uuid);
--   drop function if exists public.revoke_access_role(uuid, uuid);
--   drop function if exists public.create_access_role(text, text, text, uuid);
--   drop table if exists public.access_members, public.access_grants, public.access_roles;
--   alter table public.storefront_staff drop column if exists access_role_id;
-- ============================================================================

-- ── 1. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.access_roles (
  id            uuid primary key default gen_random_uuid(),
  -- 'admin' roles are platform-wide; 'storefront' roles belong to one branch
  -- and are managed by that vendor.
  scope         text not null check (scope in ('admin', 'storefront')),
  storefront_id uuid references public.storefronts (id) on delete cascade,
  name          text not null,
  description   text,
  -- Built in, and undeletable: removing 'Full access' would strip the console
  -- from everyone holding it, usually while trying to tidy up.
  is_system     boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A storefront role belongs to a storefront; an admin role does not.
  constraint access_roles_scope_matches check (
    (scope = 'storefront') = (storefront_id is not null)
  )
);

-- Names are how people refer to these out loud, so two roles called
-- "Reviewer" in the same place would be a support call waiting to happen.
create unique index if not exists access_roles_admin_name_idx
  on public.access_roles (lower(name)) where scope = 'admin';
create unique index if not exists access_roles_store_name_idx
  on public.access_roles (storefront_id, lower(name)) where scope = 'storefront';

create table if not exists public.access_grants (
  role_id uuid not null references public.access_roles (id) on delete cascade,
  area    text not null,
  level   text not null check (level in ('read', 'write')),
  primary key (role_id, area)
);

create table if not exists public.access_members (
  role_id    uuid not null references public.access_roles (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (role_id, user_id)
);

create index if not exists access_members_user_idx on public.access_members (user_id);

comment on table public.access_roles is
  'A named set of permissions, platform-wide or for one storefront. Access is the highest level across every role a person holds.';

-- The vendor side hangs off the membership that already exists rather than a
-- parallel one. Null keeps today's behaviour — full access to the branch —
-- so nothing changes for anyone until a vendor sets a role.
alter table public.storefront_staff
  add column if not exists access_role_id uuid references public.access_roles (id) on delete set null;

comment on column public.storefront_staff.access_role_id is
  'Scopes what this person can do in the branch. Null means the whole branch, which is what every membership was before roles existed.';

-- ── 2. Resolving access ─────────────────────────────────────────────────────
-- The one function everything else asks. Returns 'none', 'read' or 'write'.
create or replace function public.access_level(p_area text, p_storefront uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_role  text;
  v_level text;
begin
  if v_uid is null then
    return 'none';
  end if;

  select role into v_role from public.profiles where id = v_uid;

  -- A super admin is never locked out by a permission mistake, including their
  -- own. This is the escape hatch that makes the rest safe to edit.
  if v_role = 'super_admin' then
    return 'write';
  end if;

  -- Admin-scope areas need the console role as well as the grant. Losing
  -- `profiles.role` should remove access even if a stale membership survives.
  if p_storefront is null and v_role is distinct from 'admin' then
    return 'none';
  end if;

  -- A branch owner is not staff of their own branch and has no membership row,
  -- so they would resolve to 'none' without this.
  if p_storefront is not null then
    if exists (
      select 1 from public.storefronts s
       where s.id = p_storefront and s.vendor_id = v_uid
    ) then
      return 'write';
    end if;
  end if;

  -- Highest level across every role held. 'write' sorts after 'read', so max()
  -- is the union this model promises.
  select max(g.level) into v_level
    from public.access_members m
    join public.access_roles  r on r.id = m.role_id
    join public.access_grants g on g.role_id = r.id
   where m.user_id = v_uid
     and g.area = p_area
     and (
       (p_storefront is null and r.scope = 'admin')
       or (p_storefront is not null and r.scope = 'storefront' and r.storefront_id = p_storefront)
     );

  -- A branch membership with no role attached is the pre-roles arrangement:
  -- the whole branch. Only consulted when no grant said otherwise.
  if v_level is null and p_storefront is not null then
    if exists (
      select 1 from public.storefront_staff ss
       where ss.storefront_id = p_storefront
         and ss.user_id = v_uid
         and ss.revoked_at is null
         and ss.access_role_id is null
    ) then
      return 'write';
    end if;
  end if;

  return coalesce(v_level, 'none');
end;
$fn$;

revoke all on function public.access_level(text, uuid) from public, anon;
grant execute on function public.access_level(text, uuid) to authenticated, service_role;

comment on function public.access_level is
  'What the caller may do in one area: none, read or write. Super admin is always write. Highest level across every role held.';

-- Every area the caller can reach, in one call — a sidebar needs the whole map
-- and would otherwise ask once per item.
create or replace function public.my_access(p_storefront uuid default null)
returns table (area text, level text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_role text;
begin
  if v_uid is null then
    return;
  end if;

  select role into v_role from public.profiles where id = v_uid;

  if v_role = 'super_admin' and p_storefront is null then
    -- Everything, without needing to know what "everything" is: the caller
    -- compares against its own list of areas.
    return query select '*'::text, 'write'::text;
    return;
  end if;

  return query
    select g.area, max(g.level)
      from public.access_members m
      join public.access_roles  r on r.id = m.role_id
      join public.access_grants g on g.role_id = r.id
     where m.user_id = v_uid
       and (
         (p_storefront is null and r.scope = 'admin')
         or (p_storefront is not null and r.scope = 'storefront' and r.storefront_id = p_storefront)
       )
     group by g.area;
end;
$fn$;

revoke all on function public.my_access(uuid) from public, anon;
grant execute on function public.my_access(uuid) to authenticated, service_role;

-- ── 3. Who may manage roles ─────────────────────────────────────────────────
-- Admin roles: super admin only, same reasoning as set_account_role — anyone
-- who can edit permissions can grant themselves any permission.
-- Storefront roles: the branch owner.
create or replace function private.may_manage_roles(p_scope text, p_storefront uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return false;
  end if;

  if p_scope = 'admin' then
    return (select role from public.profiles where id = v_uid) = 'super_admin';
  end if;

  return exists (
    select 1 from public.storefronts s
     where s.id = p_storefront and s.vendor_id = v_uid
  );
end;
$fn$;

grant execute on function private.may_manage_roles(text, uuid) to authenticated, service_role;

create or replace function public.create_access_role(
  p_name        text,
  p_description text default null,
  p_scope       text default 'admin',
  p_storefront  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A role needs a name' using errcode = '22023';
  end if;

  if not private.may_manage_roles(p_scope, p_storefront) then
    raise exception 'You cannot create roles here' using errcode = '42501';
  end if;

  insert into public.access_roles (scope, storefront_id, name, description, created_by)
  values (p_scope, p_storefront, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
          (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.create_access_role(text, text, text, uuid) from public, anon;
grant execute on function public.create_access_role(text, text, text, uuid)
  to authenticated, service_role;

-- Set one area on one role. `p_level` of null removes the grant, which is how
-- 'none' is expressed — see the header on why it is not a stored value.
create or replace function public.set_role_grant(p_role uuid, p_area text, p_level text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_role public.access_roles%rowtype;
begin
  select * into v_role from public.access_roles where id = p_role;
  if not found then
    raise exception 'no such role' using errcode = 'P0002';
  end if;

  if not private.may_manage_roles(v_role.scope, v_role.storefront_id) then
    raise exception 'You cannot change this role' using errcode = '42501';
  end if;

  if v_role.is_system then
    raise exception 'Built-in roles cannot be edited. Make a new role instead.'
      using errcode = 'P0001';
  end if;

  if p_level is null then
    delete from public.access_grants where role_id = p_role and area = p_area;
    return 'none';
  end if;

  if p_level not in ('read', 'write') then
    raise exception 'Level must be read or write' using errcode = '22023';
  end if;

  insert into public.access_grants (role_id, area, level)
  values (p_role, p_area, p_level)
  on conflict (role_id, area) do update set level = excluded.level;

  update public.access_roles set updated_at = now() where id = p_role;
  return p_level;
end;
$fn$;

revoke all on function public.set_role_grant(uuid, text, text) from public, anon;
grant execute on function public.set_role_grant(uuid, text, text) to authenticated, service_role;

create or replace function public.assign_access_role(p_role uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_role public.access_roles%rowtype;
begin
  select * into v_role from public.access_roles where id = p_role;
  if not found then
    raise exception 'no such role' using errcode = 'P0002';
  end if;

  if not private.may_manage_roles(v_role.scope, v_role.storefront_id) then
    raise exception 'You cannot assign this role' using errcode = '42501';
  end if;

  insert into public.access_members (role_id, user_id, granted_by)
  values (p_role, p_user, (select auth.uid()))
  on conflict (role_id, user_id) do nothing;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values ((select auth.uid()), 'staff', 'access.assigned', 'profile', p_user::text,
          '{}'::jsonb, jsonb_build_object('role', v_role.name));
end;
$fn$;

create or replace function public.revoke_access_role(p_role uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_role public.access_roles%rowtype;
begin
  select * into v_role from public.access_roles where id = p_role;
  if not found then
    raise exception 'no such role' using errcode = 'P0002';
  end if;

  if not private.may_manage_roles(v_role.scope, v_role.storefront_id) then
    raise exception 'You cannot change this role' using errcode = '42501';
  end if;

  delete from public.access_members where role_id = p_role and user_id = p_user;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values ((select auth.uid()), 'staff', 'access.revoked', 'profile', p_user::text,
          jsonb_build_object('role', v_role.name), '{}'::jsonb);
end;
$fn$;

revoke all on function public.assign_access_role(uuid, uuid) from public, anon;
revoke all on function public.revoke_access_role(uuid, uuid) from public, anon;
grant execute on function public.assign_access_role(uuid, uuid) to authenticated, service_role;
grant execute on function public.revoke_access_role(uuid, uuid) to authenticated, service_role;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
alter table public.access_roles   enable row level security;
alter table public.access_grants  enable row level security;
alter table public.access_members enable row level security;

-- Readable by staff and by the branch that owns them; written only through the
-- functions above, which is why there is no write policy at all.
drop policy if exists "access_roles_read" on public.access_roles;
create policy "access_roles_read" on public.access_roles
  for select to authenticated
  using (
    public.is_staff()
    or (storefront_id is not null and exists (
      select 1 from public.storefronts s
       where s.id = access_roles.storefront_id and s.vendor_id = (select auth.uid())
    ))
  );

drop policy if exists "access_grants_read" on public.access_grants;
create policy "access_grants_read" on public.access_grants
  for select to authenticated
  using (exists (
    select 1 from public.access_roles r where r.id = access_grants.role_id
  ));

drop policy if exists "access_members_read" on public.access_members;
create policy "access_members_read" on public.access_members
  for select to authenticated
  using (public.is_staff() or user_id = (select auth.uid()));

revoke all on public.access_roles, public.access_grants, public.access_members from anon;
grant select on public.access_roles, public.access_grants, public.access_members to authenticated;

-- ── 5. Nobody loses access today ────────────────────────────────────────────
-- Seeded with every admin area, and every current admin put into it. Applying
-- this migration without it would strip the console from everyone who has it.
do $$
declare
  v_role uuid;
  v_area text;
begin
  select id into v_role from public.access_roles
   where scope = 'admin' and lower(name) = 'full access';

  if v_role is null then
    insert into public.access_roles (scope, name, description, is_system)
    values ('admin', 'Full access',
            'Everything in the console. The role every admin had before roles existed.', true)
    returning id into v_role;
  end if;

  foreach v_area in array array[
    'overview', 'vendors', 'landlords', 'riders', 'verification', 'verify_visits',
    'users', 'staff', 'analytics', 'editorial', 'reviews', 'disputes', 'payouts',
    'promotions', 'settings'
  ]
  loop
    insert into public.access_grants (role_id, area, level)
    values (v_role, v_area, 'write')
    on conflict (role_id, area) do nothing;
  end loop;

  insert into public.access_members (role_id, user_id)
  select v_role, p.id from public.profiles p where p.role = 'admin'
  on conflict do nothing;
end $$;
