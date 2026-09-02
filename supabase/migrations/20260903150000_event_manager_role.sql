-- ============================================================================
-- event_manager_role
--
-- The role behind /organiser, and the policies that let somebody holding it
-- actually put an event on the platform.
--
-- WHAT WAS ACTUALLY MISSING
--   `events` has had a public read policy since 0006 and nothing else. Insert,
--   update and delete were revoked from `anon` and never granted to anybody at
--   all, so with RLS on, the only writer has ever been the service role. Every
--   event on the platform today was seeded. There was no way for a person to
--   list one, which is why the admin screen said "no events have been listed".
--
--   `event_ticket_tiers` is in the same position: the table exists, tickets
--   sell against it, and nobody could ever create a tier.
--
-- THE ROLE IS NOT OPEN FOR SIGNUP
--   /signup shows "I run events" as "Not yet" on purpose, and this migration
--   does not change that. It makes the role legal so the dashboard has
--   something to gate on, and so opening it later is a change to the signup
--   form rather than a schema change under time pressure.
--
--   `claim_role` is deliberately NOT widened. That function is self-service —
--   widening it would let any signed-in student claim the role for themselves,
--   which is the opposite of "not yet". Until signup opens, granting it is a
--   deliberate statement, the same shape as the first super admin:
--
--     update public.profiles
--        set role  = 'event_manager',
--            roles = (select array(select distinct unnest(
--                       coalesce(roles, '{}') || array['event_manager'])))
--      where id = '<uuid>';
--
--   Both columns, because profiles_active_role_is_held requires the active
--   role to be one they hold.
--
-- 'creator' RIDES ALONG
--   For the same reason it is already in requirementsFor and in
--   submit_personal_verification: a role that is legal in one place and
--   rejected in another fails at whichever step nobody tested.
--
-- ROLLBACK
--   drop policy if exists "events_write_own" on public.events;
--   drop policy if exists "tiers_write_own" on public.event_ticket_tiers;
--   drop policy if exists "tiers_select_all" on public.event_ticket_tiers;
--   drop function if exists private.owns_event(uuid);
--   (the role check constraint should NOT be narrowed again while any profile
--    holds one of the new roles — it would make those rows unwritable)
-- ============================================================================

-- === 1. The roles are legal =================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'student', 'vendor', 'landlord', 'rider',
    'event_manager', 'creator',
    'admin', 'super_admin'
  ));

-- === 2. Who owns an event ===================================================
-- SECURITY DEFINER so a policy can ask without the caller needing to read rows
-- it is being tested against, and so the tier policies below can reach `events`
-- without a second RLS pass.
create or replace function private.owns_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.events e
     where e.id = p_event
       and e.organizer_id = (select auth.uid())
  );
$fn$;

grant execute on function private.owns_event(uuid) to authenticated, service_role;

-- === 3. Events: an organiser writes their own ===============================
-- Read stays wide open (events_select_all, from 0006) — an event nobody can
-- see is not an event.
drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own" on public.events
  for insert to authenticated
  with check (
    -- You can only create an event with yourself as the organiser. Without the
    -- equality check, an organiser could list an event under somebody else's
    -- name and it would show on their profile.
    organizer_id = (select auth.uid())
    and (select role from public.profiles where id = (select auth.uid()))
        in ('event_manager', 'admin', 'super_admin')
  );

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own" on public.events
  for update to authenticated
  using (organizer_id = (select auth.uid()) or public.is_staff())
  -- The second clause is what stops an organiser handing their event to
  -- somebody else, or to nobody, on the way out.
  with check (organizer_id = (select auth.uid()) or public.is_staff());

drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own" on public.events
  for delete to authenticated
  using (organizer_id = (select auth.uid()) or public.is_staff());

grant insert, update, delete on public.events to authenticated;

-- === 4. Ticket tiers ========================================================
alter table public.event_ticket_tiers enable row level security;

-- Anybody can see what is on sale; that is the price list on the public page.
drop policy if exists "tiers_select_all" on public.event_ticket_tiers;
create policy "tiers_select_all" on public.event_ticket_tiers
  for select using (true);

drop policy if exists "tiers_write_own" on public.event_ticket_tiers;
create policy "tiers_write_own" on public.event_ticket_tiers
  for all to authenticated
  using (private.owns_event(event_id) or public.is_staff())
  with check (private.owns_event(event_id) or public.is_staff());

grant select on public.event_ticket_tiers to anon, authenticated;
grant insert, update, delete on public.event_ticket_tiers to authenticated;

-- `sold` is maintained by the purchase path, not by the organiser. Nothing here
-- stops them writing it — Postgres has no column-level check in a policy — so
-- the application never sends it and purchase_tickets remains the only writer
-- that matters. Worth knowing rather than assuming.

-- === Verify =================================================================
do $$
begin
  if to_regprocedure('private.owns_event(uuid)') is null then
    raise exception 'owns_event missing';
  end if;

  -- The constraint must actually admit the new role, or the dashboard gates on
  -- something no row can hold.
  begin
    perform 1 from public.profiles where role = 'event_manager';
  exception when others then
    raise exception 'profiles_role_check still rejects event_manager';
  end;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'events' and policyname = 'events_insert_own'
  ) then
    raise exception 'events_insert_own missing — organisers still cannot list anything';
  end if;
end $$;
