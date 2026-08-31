-- ============================================================================
-- invite_account_flow
--
-- One small function the invite redemption needs and cannot get any other way:
-- "does this address already have an account?"
--
-- WHY IT IS NOT `auth.admin.listUsers()`
--   The Auth admin API has no lookup-by-email. `listUsers` pages through every
--   user in the project, so answering this question in the app would mean
--   walking the whole table on every invite click — fine at fifty accounts,
--   quietly catastrophic later, and wrong in between because the answer would
--   depend on which page happened to contain them.
--
-- WHY IT IS SERVICE-ROLE ONLY
--   "Is there an account for this email?" is an account-enumeration oracle.
--   Handed to `anon` it lets anybody test addresses against the user table;
--   that is exactly why `login_method` deliberately answers 'password' for
--   unknown emails instead of admitting it does not know them. This function
--   gives a straight yes/no, so it is reachable only by the service role — a
--   trusted server action that already holds an invite token — and never from
--   a browser.
--
--   The GRANT is the whole security boundary here. Do not widen it.
--
-- ROLLBACK
--   drop function if exists public.email_has_account(text);
-- ============================================================================

create or replace function public.email_has_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from auth.users u
     where lower(u.email) = lower(trim(coalesce(p_email, '')))
  );
$fn$;

-- Revoked from everyone first, then granted to exactly one role. Written this
-- way round so a future `grant execute ... to authenticated` has to be a
-- deliberate line somebody adds, not an accident of the default.
revoke all on function public.email_has_account(text) from public, anon, authenticated;
grant execute on function public.email_has_account(text) to service_role;

comment on function public.email_has_account(text) is
  'Whether an email already has an account. SERVICE ROLE ONLY — it is an account-enumeration oracle and must never be exposed to anon or authenticated.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.email_has_account(text)') is null then
    raise exception 'email_has_account missing';
  end if;

  -- The grant is the security property, so it is what gets asserted.
  if has_function_privilege('authenticated', 'public.email_has_account(text)', 'execute') then
    raise exception 'email_has_account is executable by authenticated — it must not be';
  end if;
  if has_function_privilege('anon', 'public.email_has_account(text)', 'execute') then
    raise exception 'email_has_account is executable by anon — it must not be';
  end if;
end $$;
