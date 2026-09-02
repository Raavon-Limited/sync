-- ============================================================================
-- activity_search
--
-- Find one person's changes in the activity feed.
--
-- WHY THE SEARCH IS IN SQL AND NOT IN THE COMPONENT
--   The feed is paged   the team screen asks for 40 rows. Filtering those 40
--   in the browser searches the most recent 40 events and calls the result
--   "everything Ada did", which is wrong in the exact case the search exists
--   for: looking for something somebody did last week. The filter has to run
--   before the limit.
--
-- WHAT IT MATCHES
--   The actor's name or email, and the subject line of the event (a listing or
--   store name). One box, because "search" that only matches one field makes a
--   person guess which one.
--
--   Matching the email as well as the name is not a disclosure: this function
--   is already owner-scoped and already returns the email through
--   storefront_roster, which the owner supplied when they sent the invite.
--
-- ILIKE, NOT full-text. An activity log is short strings and substring matching
-- is what "search for Ada" means; `to_tsquery` would miss "ada" in
-- "adaobi@..." and stem names into things nobody typed.
--
-- ROLLBACK
--   drop function if exists public.storefront_activity(uuid, integer, text, uuid);
--   -- then restore the 2-argument version from 20260822150000_storefront_roster.
-- ============================================================================

-- Superseding rather than overloading: two versions differing only by trailing
-- optional arguments are ambiguous to PostgREST, which resolves calls by
-- argument NAME and would have to guess which one a 2-argument call meant.
drop function if exists public.storefront_activity(uuid, integer);

create or replace function public.storefront_activity(
  p_storefront_id uuid    default null,
  p_limit         integer default 100,
  -- Free text: actor name, actor email, or the name of the thing changed.
  p_search        text    default null,
  -- An exact person, for "show me only what this manager did". Independent of
  -- p_search so the UI can offer both without one silently overriding the other.
  p_actor_id      uuid    default null
)
returns table (
  occurred_at   timestamptz,
  actor_id      uuid,
  actor_name    text,
  actor_role    text,
  action        text,
  entity_type   text,
  entity_id     text,
  storefront_id uuid,
  summary       jsonb
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with q as (
    select nullif(trim(coalesce(p_search, '')), '') as term
  )
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
  cross join q
  left join public.profiles p on p.id = al.actor_id
  left join auth.users     u on u.id = al.actor_id
  where coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id') is not null
    and (
      p_storefront_id is null
      or coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id') = p_storefront_id::text
    )
    and (p_actor_id is null or al.actor_id = p_actor_id)
    and (
      q.term is null
      or coalesce(p.full_name, '') ilike '%' || q.term || '%'
      or coalesce(u.email, '')     ilike '%' || q.term || '%'
      -- The subject line, so "jollof" finds every change to that listing.
      or coalesce(al.after ->> 'name', al.before ->> 'name', '') ilike '%' || q.term || '%'
      -- "System" and "Removed account" are rendered names with no row behind
      -- them; without this, searching for what the page shows finds nothing.
      or (al.actor_id is null and 'system' ilike '%' || lower(q.term) || '%')
    )
    -- Owner only, restated because SECURITY DEFINER turned RLS off. This is
    -- the record of what staff did, and someone who can read it can see what
    -- has been noticed.
    and exists (
      select 1 from public.storefronts s
       where s.id = coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id')::uuid
         and s.vendor_id = (select auth.uid())
    )
  order by al.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$fn$;

grant execute on function public.storefront_activity(uuid, integer, text, uuid)
  to authenticated, service_role;

comment on function public.storefront_activity(uuid, integer, text, uuid) is
  'The owner''s activity feed, optionally filtered to one store, one actor, or a search over actor name / email / subject. Filtering happens before the limit   searching a fetched page would only ever find recent events.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.storefront_activity(uuid, integer, text, uuid)') is null then
    raise exception 'storefront_activity(4) missing';
  end if;
  -- The old signature must be gone, or PostgREST has two candidates to pick
  -- between and resolves by argument name.
  if to_regprocedure('public.storefront_activity(uuid, integer)') is not null then
    raise exception 'the 2-argument storefront_activity still exists';
  end if;
end $$;
