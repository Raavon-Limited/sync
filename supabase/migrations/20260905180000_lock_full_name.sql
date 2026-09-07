-- ============================================================================
-- lock_full_name
--
-- Your name stops being yours to edit once you have one.
--
-- WHY
--   `full_name` is not a display preference. It is the string a reviewer held
--   against a government ID and a school ID before deciding this account is a
--   real person - and every card, every verification queue and every "who is
--   coming to your gate" notification repeats it afterwards.
--
--   Leaving it editable means a verified account can be renamed after the
--   check that verified it. Somebody passes review as one person and trades as
--   another, with the badge intact and nothing in the audit trail saying the
--   name moved. That is not a cosmetic problem: an ID card whose name can be
--   changed by its holder verifies nothing at all.
--
-- SET ONCE, NOT NEVER
--   The rule is the one `guard_vendor_profile_cols` already applies to
--   business_name: a BLANK name may still be filled in, and a name that exists
--   may not be replaced. Locking it unconditionally would trap any account
--   whose signup metadata carried no name - they would read "No name set"
--   forever, be unverifiable for exactly that reason, and have no way to fix
--   it themselves.
--
-- STAFF CAN STILL CHANGE IT
--   The guard only fires for 'authenticated' and 'anon', which is every
--   PostgREST request from a browser. The service role and the SQL editor are
--   untouched, so a support correction - a typo, a legal name change with
--   documents behind it - goes through staff, which is the point: it becomes a
--   decision somebody is accountable for instead of a text input.
--
-- ROLLBACK
--   Re-run the guard_profile_privileged_cols block of 20260902110000.
-- ============================================================================

create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- `role` is writable only inside set_account_role, which raises this flag
    -- for the length of its own transaction and lowers it again. Nothing else
    -- sets it, so a direct PATCH on profiles still cannot make anyone staff.
    if coalesce(current_setting('sync.role_grant', true), '') <> 'on' then
      new.role := old.role;
    end if;

    new.verification_status := old.verification_status;
    -- A self-service unsuspend is not a suspension.
    new.suspended_at     := old.suspended_at;
    new.suspended_reason := old.suspended_reason;
    new.suspended_by     := old.suspended_by;

    -- SET ONCE. An empty name may still be filled in; one that exists is the
    -- name a reviewer checked, and it is not the holder's to replace. See the
    -- header for why this is a verification concern rather than a preference.
    if coalesce(trim(old.full_name), '') <> '' then
      new.full_name := old.full_name;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_profile_privileged_cols() is
  'Reverts columns a client must not write on its own profile row: role, verification_status, the suspension trio, and full_name once it has been set. Fires only for authenticated/anon, so staff and the service role can still correct a name.';
