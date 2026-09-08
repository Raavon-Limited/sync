-- ============================================================================
-- notification_roles
--
-- One person holding two roles got one merged notification stream, and the
-- links in it went to the wrong dashboard.
--
-- `notifications` is keyed on `user_id` alone. An account that is both a
-- landlord and a student - which is normal here, and every staff member is one
-- too - therefore sees their tenants' booking alerts while wearing the student
-- hat and their own room alerts while wearing the landlord one.
--
-- THE LINKS ARE THE HALF THAT ACTUALLY BREAKS. `notifications.href` is
-- documented as "path suffix under the dashboard base", and the bell resolves
-- it as `${rootHref}/${href}` against WHICHEVER DASHBOARD IS OPEN. So a
-- landlord notification with href 'requests', clicked while the same person is
-- in /admin, resolves to /admin/requests - a page that does not exist. This is
-- the same shape as the agent bug where every alert pointed at /agent/visits
-- from a dashboard that had no such route: a suffix is only meaningful next to
-- the base it was written for, and nothing recorded which base that was.
--
-- WHY A COLUMN AND NOT A PARAMETER ON EVERY CALL SITE
--   `private.notify` has 35 callers across 9 migrations. Adding a required
--   argument to all of them in one migration is a large, mechanical change with
--   35 chances to pick the wrong role, and it would have to be redone for every
--   producer written afterwards.
--
--   So the column is NULLABLE and null means "show under every hat" - exactly
--   today's behaviour. Nothing regresses on day one. Producers then declare a
--   role as they are touched, and each one that does removes a stream from the
--   wrong dashboard. The optional parameter below is how they declare it.
--
-- THE READ SIDE IS NOT CHANGED HERE. This migration only makes the information
-- recordable; the bell still shows everything until it filters on
-- `role is null or role = <active role>`. Doing both at once would hide
-- existing notifications the moment this lands, because every historical row
-- has a null role and no producer sets one yet.
-- ============================================================================

-- The same list as `profiles_role_check` (20260905120000). Written out rather
-- than referenced because there is no roles TABLE to point a foreign key at -
-- the role vocabulary lives in check constraints. If a role is added there, add
-- it here too; a mismatch shows up as an insert that raises rather than an
-- alert that silently goes to nobody.
alter table public.notifications
  add column if not exists role text;

alter table public.notifications drop constraint if exists notifications_role_check;
alter table public.notifications add constraint notifications_role_check
  check (role is null or role in (
    'student', 'vendor', 'landlord', 'rider',
    'event_manager', 'creator',
    'agent',
    'admin', 'super_admin'
  ));

comment on column public.notifications.role is
  'Which hat this notification belongs to. NULL = show under every role (the default, and what every row created before 20260911150000 carries). Set it so a landlord alert does not appear - or resolve its href - inside /admin.';

-- Partial index over the bell's actual query: unread, newest first, for one
-- person. Mirrors notifications_unread_idx with the role in it.
create index if not exists notifications_unread_role_idx
  on public.notifications (user_id, role, created_at desc)
  where read_at is null;

/**
 * Same funnel, one more optional field.
 *
 * `p_role` is last and defaults to null so all 35 existing calls keep
 * compiling and keep meaning exactly what they meant.
 */
create or replace function private.notify(
  p_user_id     uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text default null,
  p_action      text default null,
  p_entity_id   uuid default null,
  p_entity_type text default null,
  p_role        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Nobody to tell, or the actor telling themselves.
  if p_user_id is null or p_user_id = (select auth.uid()) then
    return;
  end if;

  insert into public.notifications
    (user_id, kind, title, body, href, action, entity_type, entity_id, role)
  values
    (p_user_id, p_kind, p_title, p_body, p_href, p_action, p_entity_type, p_entity_id, p_role);
exception
  when others then
    -- See the header: an alert must never take down the write that caused it.
    raise warning 'notify failed for % (%): %', p_user_id, p_kind, sqlerrm;
end;
$fn$;

/**
 * Staff alerts are staff alerts, so this one can be decided outright.
 *
 * `notify_staff` fans out to every admin and super_admin BECAUSE they are
 * staff - there is no ambiguity about which hat it is for, and an admin who is
 * also a landlord should not meet a fraud alert on their landlord dashboard.
 */
create or replace function private.notify_staff(
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text default null,
  p_entity_id   uuid default null,
  p_entity_type text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select p.id from public.profiles p
     where p.role in ('admin', 'super_admin')
        or p.roles && array['admin', 'super_admin']
  loop
    perform private.notify(
      v_row.id, p_kind, p_title, p_body, p_href, null, p_entity_id, p_entity_type,
      -- Staff notifications belong to the staff hat, always.
      'admin'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications' and column_name = 'role'
  ) then
    raise exception 'notifications.role was not added';
  end if;

  -- Nullable is the whole compatibility story. A NOT NULL here would reject
  -- every one of the 35 existing producers on their next insert.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and column_name = 'role' and is_nullable = 'NO'
  ) then
    raise exception 'notifications.role is NOT NULL - existing producers would fail';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'notify_staff' limit 1;
  if v_src is null or position('''admin''' in v_src) = 0 then
    raise exception 'notify_staff does not stamp a role';
  end if;
end $$;
