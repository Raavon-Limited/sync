-- ============================================================================
-- full_access_covers_every_area   "Full access" was missing five of them.
--
-- THE SYMPTOM
--   An admin opens /admin/verify-visits, picks an agent, presses Assign, and is
--   told they do not have access. The page loads; the button does not work.
--
-- THE CAUSE
--   The page guard asks for `verify_visits`. `assertAgentStaff`, behind the
--   button, asks for `agents`. 20260902130000 seeded the 'Full access' role by
--   enumerating the fifteen areas that existed that day, and `agents` was not
--   one of them   the agent console came later, with 20260905120000. Nothing
--   backfills a role when an area is added, so the grant was never written.
--
--   `access_level` has an escape hatch for exactly this kind of mistake: a
--   super_admin always returns 'write'. There is no super_admin on this
--   project. All three staff accounts are plain 'admin', so the hatch has never
--   been available and the missing grant was absolute.
--
-- IT IS NOT ONLY `agents`
--   Five areas exist in modules/access/areas.ts and in no role's grants:
--   agents, mail, revenue, students, events. Every console screen behind them
--   answers /403 for everybody, which is a permission bug that looks exactly
--   like a missing feature.
--
-- WHY THE WHOLE LIST IS WRITTEN OUT AGAIN
--   There is no areas TABLE to join against - the catalogue lives in TypeScript
--   - so a migration cannot ask which areas exist. Restating it is the only
--   honest option, and the verify block below turns the next omission into a
--   failed migration rather than a button that does nothing.
--
-- ONLY 'Full access'. Manager and Finance are scoped on purpose; widening them
-- would hand a finance reviewer the agent console because a migration went
-- past. What "Full access" means is the thing being repaired.
--
-- ROLLBACK
--   delete from public.access_grants g using public.access_roles r
--    where g.role_id = r.id and r.scope = 'admin' and lower(r.name) = 'full access'
--      and g.area in ('agents', 'mail', 'revenue', 'students', 'events');
-- ============================================================================

do $fn$
declare
  v_role  uuid;
  v_area  text;
  v_added integer := 0;
begin
  select id into v_role
    from public.access_roles
   where scope = 'admin' and lower(name) = 'full access';

  if v_role is null then
    raise exception 'the Full access role is missing   20260902130000 should have seeded it';
  end if;

  foreach v_area in array array[
    'overview', 'vendors', 'landlords', 'riders', 'verification', 'verify_visits',
    'students', 'events', 'users', 'staff', 'analytics', 'editorial', 'reviews',
    'disputes', 'revenue', 'payouts', 'promotions', 'agents', 'mail', 'settings'
  ]
  loop
    insert into public.access_grants (role_id, area, level)
    values (v_role, v_area, 'write')
    on conflict (role_id, area) do nothing;
    if found then
      v_added := v_added + 1;
    end if;
  end loop;

  raise notice 'Full access gained % area(s)', v_added;
end;
$fn$;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $fn$
declare
  v_role    uuid;
  v_missing text[];
begin
  select id into v_role
    from public.access_roles
   where scope = 'admin' and lower(name) = 'full access';

  select array_agg(a) into v_missing
    from unnest(array[
      'overview', 'vendors', 'landlords', 'riders', 'verification', 'verify_visits',
      'students', 'events', 'users', 'staff', 'analytics', 'editorial', 'reviews',
      'disputes', 'revenue', 'payouts', 'promotions', 'agents', 'mail', 'settings'
    ]) a
   where not exists (
     select 1 from public.access_grants g
      where g.role_id = v_role and g.area = a and g.level = 'write'
   );

  if v_missing is not null then
    raise exception 'Full access still cannot reach: %', array_to_string(v_missing, ', ');
  end if;

  -- The one the report was about. Named separately so a future rewrite of the
  -- list above cannot quietly drop it again.
  if not exists (
    select 1 from public.access_grants g
     where g.role_id = v_role and g.area = 'agents' and g.level = 'write'
  ) then
    raise exception 'Full access cannot reach the agents area   Assign will keep failing';
  end if;

  -- Somebody has to actually hold the role, or this fixes nothing visible.
  if not exists (select 1 from public.access_members m where m.role_id = v_role) then
    raise exception 'nobody holds Full access';
  end if;
end;
$fn$;
