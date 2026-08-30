-- ============================================================================
-- storefront_roster
--
-- Two gaps the staff test exposed, both of which make the transparency
-- requirement fall apart in the UI.
--
-- 1. THE OWNER CANNOT SEE WHO THEIR STAFF ARE
--    storefront_staff stores user_id. profiles is locked to `auth.uid() = id`
--    (20260814102248_fix_profile_exposure), so joining it as the owner returns
--    nothing. A vendor would open "Managers" and see a list of UUIDs. They
--    cannot even resolve the person they invited last week.
--
-- 2. actor_name IS NULL FOR ANYONE WITHOUT A full_name
--    storefront_activity() reads profiles.full_name, which is nullable and in
--    practice often unset. An accountability feed whose actor column is blank
--    does not do the job it exists for.
--
-- WHY RETURNING THE EMAIL IS NOT A LEAK HERE
--    Both functions are scoped to branches the caller OWNS, and the owner
--    supplied that email themselves when they sent the invite. Showing it back
--    discloses nothing they did not already have. It is NOT exposed to staff,
--    to other vendors, or to students.
--
-- ROLLBACK
--   drop function if exists public.storefront_roster(uuid);
--   -- and restore storefront_activity from 20260822140000_storefront_activity.
-- ============================================================================

-- 1. Who has access, by name --------------------------------------------------
create or replace function public.storefront_roster(p_storefront_id uuid default null)
returns table (
  staff_id      uuid,
  storefront_id uuid,
  branch_name   text,
  user_id       uuid,
  full_name     text,
  email         text,
  role          text,
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
    st.joined_at,
    st.revoked_at,
    st.revoked_at is null
  from public.storefront_staff st
  join public.storefronts s on s.id = st.storefront_id
  left join public.profiles p on p.id = st.user_id
  left join auth.users     u on u.id = st.user_id
  where s.vendor_id = (select auth.uid())          -- owner only, restated
    and (p_storefront_id is null or st.storefront_id = p_storefront_id)
  -- Active first, then most recently added.
  order by (st.revoked_at is null) desc, st.joined_at desc;
$fn$;

grant execute on function public.storefront_roster(uuid) to authenticated, service_role;

-- 2. Pending invitations, so an owner can chase or revoke one ----------------
-- The token is deliberately NOT returned: it is the credential, and an owner
-- listing invites has no need to re-read it. Re-inviting supersedes instead.
create or replace function public.storefront_invites_pending(p_storefront_id uuid default null)
returns table (
  invite_id     uuid,
  storefront_id uuid,
  branch_name   text,
  email         text,
  role          text,
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
    i.id, i.storefront_id, s.name, i.email, i.role,
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

-- 3. Give the activity feed a usable actor label ------------------------------
-- Same body as 20260822140000 except actor_name, which now falls back through
-- full_name -> email -> 'Removed account' rather than rendering blank.
create or replace function public.storefront_activity(
  p_storefront_id uuid default null,
  p_limit         integer default 100
)
returns table (
  occurred_at  timestamptz,
  actor_id     uuid,
  actor_name   text,
  actor_role   text,
  action       text,
  entity_type  text,
  entity_id    text,
  storefront_id uuid,
  summary      jsonb
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    al.occurred_at,
    al.actor_id,
    -- An accountability feed with a blank actor column is not accountability.
    coalesce(
      nullif(trim(p.full_name), ''),
      u.email,
      case when al.actor_id is null then 'System' else 'Removed account' end
    ),
    al.actor_role,
    al.action,
    al.entity_type,
    al.entity_id,
    coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id')::uuid,
    jsonb_strip_nulls(jsonb_build_object(
      'name',   coalesce(al.after ->> 'name',   al.before ->> 'name'),
      'status', coalesce(al.after ->> 'status', al.before ->> 'status'),
      'price_kobo', coalesce(al.after ->> 'price_kobo', al.before ->> 'price_kobo'),
      'stock',  coalesce(al.after ->> 'stock',  al.before ->> 'stock'),
      'total_kobo', coalesce(al.after ->> 'total_kobo', al.before ->> 'total_kobo')
    ))
  from private.audit_log al
  left join public.profiles p on p.id = al.actor_id
  left join auth.users     u on u.id = al.actor_id
  where coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id') is not null
    and (
      p_storefront_id is null
      or coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id') = p_storefront_id::text
    )
    and exists (
      select 1 from public.storefronts s
       where s.id = coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id')::uuid
         and s.vendor_id = (select auth.uid())
    )
  order by al.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$fn$;

grant execute on function public.storefront_activity(uuid, integer) to authenticated, service_role;
