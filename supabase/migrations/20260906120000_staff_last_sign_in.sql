-- ============================================================================
-- staff_last_sign_in
--
-- Whether somebody with console access has ever actually used it.
--
-- WHY THIS IS WORTH A MIGRATION
--   Granting access and being able to open the console are two different
--   events, and only the first one was visible. `inviteStaff` has two paths: an
--   address with no account gets an invitation, which sits in a pending list
--   until it is accepted; an address that already has one is granted access on
--   the spot and appears in the roster immediately   with nothing recording
--   whether that person ever came in.
--
--   So the roster answered "who may open this console" and was read as "who is
--   on the team". Those diverge silently: an admin who never signed in looks
--   exactly like one who signs in daily, and the "Resend invite" button beside
--   them has no way to say which of them needs it.
--
-- IT IS READ FROM auth.users, NOT RECORDED SEPARATELY
--   `last_sign_in_at` is already maintained by GoTrue on every sign-in. A
--   column of our own would be a second, worse copy of it   one more thing to
--   write on a path that has nothing to do with staff, and wrong the moment
--   somebody signs in through a route that forgot to update it.
--
-- THE FUNCTION IS DROPPED AND RECREATED, NOT REPLACED
--   `create or replace` cannot change a function's return type, and this adds a
--   column to the OUT table. Re-running the file over an install that has the
--   old shape would fail with "cannot change return type of existing function"
--   rather than upgrading it   the same trap 20260903090000 documents for
--   create_staff_invite.
--
-- NOTHING ELSE CHANGES. Same is_staff() gate, same rows, same order. A staff
-- member could already read every one of these columns; last_sign_in_at about
-- one's colleagues is not a new disclosure to somebody who can already remove
-- their access.
--
-- ROLLBACK
--   Re-run the list_staff block of 20260902110000_admin_roles_in_db.sql.
-- ============================================================================

drop function if exists public.list_staff();

create function public.list_staff()
returns table (
  id               uuid,
  full_name        text,
  email            text,
  role             text,
  created_at       timestamptz,
  -- NULL means never   the account exists and has never been signed into. The
  -- console reads that as the actionable state, so it must stay null rather
  -- than being coalesced to the creation date here.
  last_sign_in_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Only Sync staff can see this' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.role, p.created_at, u.last_sign_in_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.role in ('admin', 'super_admin')
     order by p.role desc, p.created_at;
end;
$fn$;

revoke all on function public.list_staff() from public, anon;
grant execute on function public.list_staff() to authenticated, service_role;

comment on function public.list_staff() is
  'Everyone with console access, with the last time each of them signed in. NULL last_sign_in_at means never   an account that was granted access and has not used it.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'list_staff'
       and 'last_sign_in_at' = any (p.proargnames)
  ) then
    raise exception 'list_staff is missing last_sign_in_at   the drop/create did not take';
  end if;

  raise notice 'list_staff reports last sign-in.';
end $$;
