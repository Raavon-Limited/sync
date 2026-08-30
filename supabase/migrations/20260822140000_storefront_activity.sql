-- ============================================================================
-- storefront_activity
--
-- "Full transparency, so the owner can monitor every activity happening."
--
-- private.audit_log has existed since 20260816225649 with exactly the right
-- shape - actor, action, entity, before/after jsonb - and NOTHING has ever
-- written to it. Staff are what make it necessary: once someone else can change
-- your stock and work your orders, "what happened at my Tanke branch today" has
-- to be answerable from data rather than trust.
--
-- WHY THE TRIGGERS RECORD storefront_id IN JSONB
--   audit_log is deliberately generic - entity_type/entity_id, no per-feature
--   columns - so branch attribution goes in the payload and is indexed by
--   expression. Adding a storefront_id column would make a shared audit table
--   care about one feature.
--
-- WHY READING NEEDS AN RPC
--   audit_log lives in `private`, which is not exposed through PostgREST. That
--   is correct: it holds before/after images of rows across the whole app. The
--   owner reads a filtered slice through storefront_activity(), which scopes to
--   branches they own - the same pattern as conversation_counterparties().
--
-- ROLLBACK
--   drop function if exists public.storefront_activity(uuid, integer);
--   drop trigger if exists listings_audit    on public.listings;
--   drop trigger if exists orders_audit      on public.orders;
--   drop trigger if exists storefronts_audit on public.storefronts;
--   drop function if exists private.audit_storefront_change();
-- ============================================================================

-- 1. One trigger function for every audited table -----------------------------
create or replace function private.audit_storefront_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor    uuid := auth.uid();
  v_store    uuid;
  v_action   text;
  v_before   jsonb;
  v_after    jsonb;
  v_entity   text := tg_argv[0];
  v_id       text;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
    v_id     := old.id::text;
  elsif tg_op = 'INSERT' then
    v_before := null;
    v_after  := to_jsonb(new);
    v_id     := new.id::text;
  else
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_id     := new.id::text;
  end if;

  -- Which branch this happened at. `storefronts` IS the branch; the others
  -- carry a storefront_id.
  if v_entity = 'storefront' then
    v_store := coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid);
  else
    v_store := coalesce((v_after ->> 'storefront_id')::uuid, (v_before ->> 'storefront_id')::uuid);
  end if;

  -- Unattributable rows are worse than no row: skip writes with no branch
  -- rather than filling the log with entries nobody can filter to.
  if v_store is null then
    return coalesce(new, old);
  end if;

  -- Orders churn through statuses; recording every UPDATE would bury the
  -- meaningful events. Only status transitions are interesting here.
  if v_entity = 'order' and tg_op = 'UPDATE'
     and (v_before ->> 'status') is not distinct from (v_after ->> 'status') then
    return new;
  end if;

  v_action := v_entity || '.' || lower(tg_op) ||
              case when v_entity = 'order' and tg_op = 'UPDATE'
                   then '.' || coalesce(v_after ->> 'status', '?')
                   else '' end;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (
    v_actor,
    -- Cheap and useful: was this the owner, or someone they invited?
    case
      when v_actor is null then 'system'
      when exists (select 1 from public.storefronts s
                    where s.id = v_store and s.vendor_id = v_actor) then 'owner'
      else 'staff'
    end,
    v_action,
    v_entity,
    v_id,
    -- Keep the branch reachable from either image.
    case when v_before is null then null else v_before || jsonb_build_object('storefront_id', v_store) end,
    case when v_after  is null then null else v_after  || jsonb_build_object('storefront_id', v_store) end
  );

  return coalesce(new, old);
end;
$fn$;

drop trigger if exists listings_audit on public.listings;
create trigger listings_audit
  after insert or update or delete on public.listings
  for each row execute function private.audit_storefront_change('listing');

drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after insert or update on public.orders
  for each row execute function private.audit_storefront_change('order');

drop trigger if exists storefronts_audit on public.storefronts;
create trigger storefronts_audit
  after insert or update on public.storefronts
  for each row execute function private.audit_storefront_change('storefront');

-- The filter storefront_activity() probes.
create index if not exists audit_log_storefront_idx
  on private.audit_log ((coalesce(after ->> 'storefront_id', before ->> 'storefront_id')), occurred_at desc);

-- 2. The owner's window on it -------------------------------------------------
-- Scoped to branches the caller OWNS. Staff deliberately cannot read the
-- activity log: it is the owner's oversight of them, and a manager who can read
-- it can see what the owner has noticed.
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
    p.full_name,
    al.actor_role,
    al.action,
    al.entity_type,
    al.entity_id,
    coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id')::uuid,
    -- Not the raw row images: those carry more than an activity feed needs, and
    -- the feed is the thing a UI renders. Just what changed, in words.
    jsonb_strip_nulls(jsonb_build_object(
      'name',   coalesce(al.after ->> 'name',   al.before ->> 'name'),
      'status', coalesce(al.after ->> 'status', al.before ->> 'status'),
      'price_kobo', coalesce(al.after ->> 'price_kobo', al.before ->> 'price_kobo'),
      'stock',  coalesce(al.after ->> 'stock',  al.before ->> 'stock'),
      'total_kobo', coalesce(al.after ->> 'total_kobo', al.before ->> 'total_kobo')
    ))
  from private.audit_log al
  left join public.profiles p on p.id = al.actor_id
  where coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id') is not null
    and (
      p_storefront_id is null
      or coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id') = p_storefront_id::text
    )
    -- Ownership, restated because SECURITY DEFINER turned RLS off. Without this
    -- the function would read the whole audit log for every caller.
    and exists (
      select 1 from public.storefronts s
       where s.id = coalesce(al.after ->> 'storefront_id', al.before ->> 'storefront_id')::uuid
         and s.vendor_id = (select auth.uid())
    )
  order by al.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$fn$;

grant execute on function public.storefront_activity(uuid, integer) to authenticated, service_role;
