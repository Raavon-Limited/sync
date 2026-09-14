-- ============================================================================
-- notification_role_filter   the read side of 20260911150000.
--
-- 20260911150000 made a notification's hat recordable and deliberately left
-- the bell alone, because every historical row had a null role and no producer
-- stamped one. Both are now true enough: landlord, student, agent, vendor and
-- staff alerts are stamped, and a null role still means "show under every hat",
-- so filtering hides nothing that was ever visible without a role.
--
-- WHY THE DASHBOARD AND NOT THE WORN ROLE
--   The obvious filter is `profiles.role`, the hat being worn. It is wrong
--   here. The proxy admits every dashboard except /admin on a role the account
--   HOLDS (docs/WORKFLOW.md invariant 4), so someone wearing 'student' can sit
--   in /landlord. Filtering on the worn role would hide their tenants' alerts
--   on the one screen built to show them. The caller passes the dashboard it is
--   rendering; that is the only thing that knows which base an href resolves
--   against, which was the bug the column was added to fix.
--
-- THE COUNT, THE LIST AND "MARK ALL READ" MUST AGREE
--   The list is filtered in the client query, but the badge comes from
--   get_unread_counts and "Mark all read" from mark_notifications_read. Filter
--   only the list and the badge says 3 over a dropdown showing 1. Filter only
--   the list and "Mark all read" in /admin silently clears a landlord badge the
--   person has not seen yet. So all three take the same role.
--
-- STAFF IS ONE HAT
--   notify_staff stamps 'admin', and a super_admin wears 'super_admin'. Matching
--   literally would hide every staff alert from the most senior accounts.
--
-- NULL p_role IS THE OLD BEHAVIOUR, so an unchanged caller keeps working.
--
-- THE OLD SIGNATURES ARE DROPPED FIRST. Adding a defaulted parameter with
-- `create or replace` makes a second overload, and a zero-argument call is then
-- ambiguous (42725). That is how 20260911150000 broke room requests and why
-- 20260911180000 exists.
--
-- ROLLBACK
--   drop the two functions below and restore both from 20260817090600;
--   drop function if exists private.notification_hats(text);
-- ============================================================================

create or replace function private.notification_hats(p_role text)
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select case
           when p_role in ('admin', 'super_admin') then array['admin', 'super_admin']
           else array[p_role]
         end;
$fn$;

comment on function private.notification_hats(text) is
  'The notification roles shown under one dashboard. Staff is one hat: notify_staff stamps admin and a super_admin must still see it.';

revoke all on function private.notification_hats(text) from public, anon;
grant execute on function private.notification_hats(text) to authenticated, service_role;

-- ── Badge ───────────────────────────────────────────────────────────────────
drop function if exists public.get_unread_counts();

create or replace function public.get_unread_counts(p_role text default null)
returns table (notifications integer, messages integer)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    (select count(*)::int from public.notifications n
      where n.user_id = auth.uid()
        and n.read_at is null
        and (p_role is null
             or n.role is null
             or n.role = any (private.notification_hats(p_role)))),
    -- Messages are not per-hat: a conversation belongs to the person.
    (select count(*)::int
       from public.messages m
       join public.conversation_participants cp
         on cp.conversation_id = m.conversation_id and cp.user_id = auth.uid()
      where m.sender_id is distinct from auth.uid()
        and m.deleted_at is null
        and (cp.last_read_at is null or m.created_at > cp.last_read_at))
$fn$;

revoke all on function public.get_unread_counts(text) from public, anon;
grant execute on function public.get_unread_counts(text) to authenticated, service_role;

-- ── Mark read ───────────────────────────────────────────────────────────────
drop function if exists public.mark_notifications_read(uuid[]);

create or replace function public.mark_notifications_read(
  p_ids  uuid[] default null,
  p_role text   default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.notifications n
     set read_at = now()
   where n.user_id = v_uid
     and n.read_at is null
     and (p_ids is null or n.id = any (p_ids))
     -- "Mark all read" means all read HERE. Without this, clearing the staff
     -- bell cleared the landlord one too.
     and (p_role is null
          or n.role is null
          or n.role = any (private.notification_hats(p_role)));

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public.mark_notifications_read(uuid[], text) from public, anon;
grant execute on function public.mark_notifications_read(uuid[], text) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $fn$
begin
  -- Exactly one of each. Two overloads make every existing call ambiguous.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_unread_counts') <> 1 then
    raise exception 'get_unread_counts is overloaded   zero-argument calls will be ambiguous';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'mark_notifications_read') <> 1 then
    raise exception 'mark_notifications_read is overloaded   existing calls will be ambiguous';
  end if;

  if private.notification_hats('super_admin') <> array['admin', 'super_admin'] then
    raise exception 'a super_admin would not see staff alerts';
  end if;

  if has_function_privilege('anon', 'public.get_unread_counts(text)', 'execute')
     or has_function_privilege('anon', 'public.mark_notifications_read(uuid[], text)', 'execute') then
    raise exception 'anon can execute a notification RPC';
  end if;
end;
$fn$;
