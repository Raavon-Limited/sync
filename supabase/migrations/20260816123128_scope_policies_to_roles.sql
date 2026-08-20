-- ============================================================================
-- scope_policies_to_roles
--
-- PROBLEM
--   Not one policy created by 0006_student_core.sql or 0007_areas.sql carries a
--   `to <role>` clause. Postgres therefore attaches every one of them to PUBLIC,
--   which includes `anon`. This is the identical bug class that made
--   public.profiles world-readable and that 20260814102248 has just closed —
--   only here it is replicated across 14 tables and ~25 policies.
--
--   Confirmed live on 16 Aug 2026 by probing every table with the publishable
--   key that ships in the browser bundle. Every app table answered with `[]`
--   rather than `permission denied`, which means `anon` holds SELECT on all of
--   them and the empty result was an accident of there being no data yet.
--
-- WHY IT IS NOT CURRENTLY LEAKING
--   The private-table predicates all compare against auth.uid(), which is null
--   for anon, so `null = student_id` yields NULL and matches no row. The
--   protection is therefore incidental, not designed: it depends on every
--   present and future policy author remembering to reference auth.uid(). One
--   policy shaped like `using (true)` on a private table turns the whole set
--   into a leak. events_select_all is already that shape — correctly so, since
--   events are public, but it shows the shape is in active use.
--
--   This migration converts that accident into a guarantee.
--
-- APPROACH
--   `alter policy ... to <roles>` rewrites only the role list and leaves the
--   USING / WITH CHECK expressions untouched. No predicate is retyped here, so
--   this cannot silently change who matches a row — only which database roles
--   are allowed to be evaluated against it at all.
--
--   The loop reads pg_policies, so it is idempotent and cannot fail on a policy
--   that has been renamed or dropped.
--
-- WHAT STAYS PUBLIC
--   Six policies back anonymous browsing and keep `anon`:
--     hostels_select_active, hostel_images_select, hostel_rooms_select,
--     listings_select_active, events_select_all, areas_select_active
--   All six are SELECT-only over storefront data. Reviewed column by column:
--   public.hostels exposes name/address/landmark/area/price/amenities and a
--   bare landlord_id uuid — storefront fields, no PII. Landlord identity lives
--   in profiles, which anon can no longer read.
--
-- DELIBERATELY NOT DONE HERE
--   • The guard_*_privileged_cols() triggers still gate on
--     `current_user in ('authenticated','anon')`. That works because PostgREST
--     issues SET LOCAL ROLE, but it is a fragile way to express "not the
--     service role". Column grants are the right fix (BACKEND_BLUEPRINT §05)
--     and are a separate change.
--   • No `force row level security`. Same reasoning as 20260814102248: the
--     SECURITY DEFINER triggers insert as the table owner.
--
-- ROLLBACK
--   Restores PUBLIC on every policy this touched, and anon's grants:
--     do $$ declare r record; begin
--       for r in select tablename, policyname from pg_policies
--                 where schemaname = 'public'
--                   and tablename = any (array[
--                     'hostels','hostel_images','hostel_rooms','bookings',
--                     'hostel_inspections','hostel_verification_visits',
--                     'saved_hostels','listings','orders','order_items',
--                     'activity_log','events','tickets','areas'])
--       loop
--         execute format('alter policy %I on public.%I to public',
--                        r.policyname, r.tablename);
--       end loop;
--     end $$;
--     grant select, insert, update, delete on public.bookings, public.orders,
--       public.order_items, public.saved_hostels, public.activity_log,
--       public.tickets, public.hostel_inspections,
--       public.hostel_verification_visits to anon;
--   -- (Reopens the exposure. Emergency recovery only.)
-- ============================================================================

-- ── 1. Public browse policies: anon + authenticated ─────────────────────────
-- Named explicitly rather than pattern-matched. A policy becomes publicly
-- readable here only by being written into this list on purpose.
do $$
declare
  r record;
begin
  for r in
    select *
      from (values
        ('hostels',       'hostels_select_active'),
        ('hostel_images', 'hostel_images_select'),
        ('hostel_rooms',  'hostel_rooms_select'),
        ('listings',      'listings_select_active'),
        ('events',        'events_select_all'),
        ('areas',         'areas_select_active')
      ) as t (tablename, policyname)
  loop
    if exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename  = r.tablename
         and policyname = r.policyname
    ) then
      execute format('alter policy %I on public.%I to anon, authenticated',
                     r.policyname, r.tablename);
      raise notice 'public browse: %.% -> anon, authenticated',
                   r.tablename, r.policyname;
    else
      raise warning 'expected public-browse policy %.% not found — skipped',
                    r.tablename, r.policyname;
    end if;
  end loop;
end $$;
-- ── 2. Every other policy on app tables: authenticated only ─────────────────
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = any (array[
             'hostels','hostel_images','hostel_rooms','bookings',
             'hostel_inspections','hostel_verification_visits',
             'saved_hostels','listings','orders','order_items',
             'activity_log','events','tickets','areas'])
       and 'public' = any (roles)
  loop
    execute format('alter policy %I on public.%I to authenticated',
                   r.policyname, r.tablename);
    raise notice 'scoped to authenticated: %.%', r.tablename, r.policyname;
    n := n + 1;
  end loop;
  raise notice '% policy/policies rescoped to authenticated', n;
end $$;
-- ── 3. Strip anon's grants on the strictly-private tables ───────────────────
-- RLS already denies anon on these (no policy now applies to it). Grants are a
-- second, independent gate: they decide whether a column can be named in a
-- query at all, so a permissive policy added by mistake later still finds no
-- privilege behind it. This is what turns "not exploitable" into "not reachable".
revoke all on public.bookings                   from anon;
revoke all on public.orders                     from anon;
revoke all on public.order_items                from anon;
revoke all on public.saved_hostels              from anon;
revoke all on public.activity_log               from anon;
revoke all on public.tickets                    from anon;
revoke all on public.hostel_inspections         from anon;
revoke all on public.hostel_verification_visits from anon;
-- ── 4. On the public-browse tables, anon reads and nothing else ─────────────
revoke insert, update, delete, truncate on public.hostels       from anon;
revoke insert, update, delete, truncate on public.hostel_images from anon;
revoke insert, update, delete, truncate on public.hostel_rooms  from anon;
revoke insert, update, delete, truncate on public.listings      from anon;
revoke insert, update, delete, truncate on public.events        from anon;
revoke insert, update, delete, truncate on public.areas         from anon;
-- ── 5. Verify ───────────────────────────────────────────────────────────────
-- Fails the migration rather than leaving a half-scoped policy set behind.
do $$
declare
  public_policies int;
  anon_writes     int;
  anon_private    int;
begin
  select count(*) into public_policies
    from pg_policies
   where schemaname = 'public'
     and tablename = any (array[
           'profiles','hostels','hostel_images','hostel_rooms','bookings',
           'hostel_inspections','hostel_verification_visits','saved_hostels',
           'listings','orders','order_items','activity_log','events',
           'tickets','areas'])
     and 'public' = any (roles);

  select count(*) into anon_writes
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee      = 'anon'
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
     and table_name = any (array[
           'hostels','hostel_images','hostel_rooms','listings','events','areas']);

  select count(*) into anon_private
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee      = 'anon'
     and table_name = any (array[
           'bookings','orders','order_items','saved_hostels','activity_log',
           'tickets','hostel_inspections','hostel_verification_visits']);

  if public_policies > 0 then
    raise exception
      '% policy/policies still granted to PUBLIC across the app tables',
      public_policies;
  end if;

  if anon_writes > 0 then
    raise exception
      'anon still holds % write privilege(s) on public-browse tables', anon_writes;
  end if;

  if anon_private > 0 then
    raise exception
      'anon still holds % privilege(s) on strictly-private tables', anon_private;
  end if;

  raise notice
    'all app policies scoped; anon reads the six browse tables and nothing else.';
end $$;
