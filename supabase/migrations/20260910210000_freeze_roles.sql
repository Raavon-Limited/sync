-- ============================================================================
-- freeze_roles
--
-- `profiles.roles` is writable by its owner, and that is a complete,
-- self-service path to super admin.
--
-- THE CHAIN, END TO END
--   1. `guard_profile_privileged_cols` freezes `role`, `verification_status`,
--      the suspension trio and `full_name`. It does NOT freeze `roles`, so a
--      signed-in user can PATCH their own row through PostgREST:
--        update profiles set roles = '{student,super_admin}' where id = me
--   2. `switch_role('super_admin')` then authorises purely on that column
--      &mdash; "you can only wear a hat you hold" &mdash; and passes.
--   3. It is SECURITY DEFINER, so the guard does not fire on its update and the
--      new `role` sticks.
--   4. The proxy gates /admin on `role`. Which is now super_admin.
--
--   Every link is a control working exactly as designed. The chain exists
--   because one column at the start of it is unlocked.
--
-- THIS BUG WAS FIXED IN AUGUST AND CAME BACK
--   `20260830100000_fix_role_guard.sql` exists because this exact escalation
--   worked once before. Its fix was one line. `20260902110000` rewrote the whole
--   function to add the `role` door and dropped that line on the way past;
--   `20260905180000` inherited the shape while adding the `full_name` lock.
--   Nobody removed it deliberately &mdash; it was lost in a rewrite, twice.
--
--   So this file ends with an assertion on the function's own source. The
--   `sync.role_grant` half has survived three rewrites precisely because it had
--   one; this half had nothing watching it.
--
-- FREEZING IT BREAKS NOTHING
--   Every legitimate writer of `roles` is SECURITY DEFINER and therefore never
--   sees `current_user = 'authenticated'`: `claim_role` (self-service, and it
--   excludes staff roles outright), `accept_staff_invite`, `accept_agent_invite`,
--   `set_account_role` and `create_admin`. Checked, all five, before writing
--   this. The only caller this stops is a client PATCH, which is the one that
--   should never have worked.
--
-- ROLLBACK
--   Re-run the guard block of 20260905180000 &mdash; and understand that doing so
--   re-opens self-service super admin.
-- ============================================================================

create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    -- `role` is writable only inside set_account_role, which raises this flag
    -- for the length of its own transaction and lowers it again. Nothing else
    -- sets it, so a direct PATCH on profiles still cannot make anyone staff.
    if coalesce(current_setting('sync.role_grant', true), '') <> 'on' then
      new.role := old.role;
    end if;

    -- THE SET OF HATS YOU HOLD IS NOT YOURS TO EDIT.
    --
    -- Unconditional, and not behind `sync.role_grant`: every function that
    -- legitimately grants a role is SECURITY DEFINER, so none of them reach
    -- this branch at all. A flag here would only widen what a client can do
    -- during somebody else's transaction.
    --
    -- Freezing `role` while leaving this open was never half a control. It was
    -- none of one: switch_role authorises on `roles`, so whoever writes `roles`
    -- decides `role` one call later.
    new.roles := old.roles;

    new.verification_status := old.verification_status;
    -- A self-service unsuspend is not a suspension.
    new.suspended_at     := old.suspended_at;
    new.suspended_reason := old.suspended_reason;
    new.suspended_by     := old.suspended_by;

    -- SET ONCE. An empty name may still be filled in; one that exists is the
    -- name a reviewer checked, and it is not the holder's to replace.
    if coalesce(trim(old.full_name), '') <> '' then
      new.full_name := old.full_name;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

comment on function public.guard_profile_privileged_cols() is
  'Reverts columns a client must not write on its own profile row: role, ROLES, verification_status, the suspension trio, and full_name once set. Fires only for authenticated/anon, so every SECURITY DEFINER granter is unaffected. Do not remove the roles line - switch_role authorises on it.';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- An assertion on the source, because this is the third time the line has had
-- to be put back and a rewrite is what removes it. A future edit that drops it
-- fails here rather than shipping.
do $$
declare
  v_src text;
begin
  select prosrc into v_src
    from pg_proc
   where proname = 'guard_profile_privileged_cols'
   limit 1;

  if v_src is null then
    raise exception 'guard_profile_privileged_cols is missing entirely';
  end if;
  if position('new.roles' in v_src) = 0 then
    raise exception 'the guard does not freeze roles - self-service super admin is open';
  end if;
  if position('new.role :=' in v_src) = 0 then
    raise exception 'the guard does not freeze role';
  end if;
end $$;
