-- ============================================================================
-- onboarding_category_authority
--
-- THE WIZARD ASKED A QUESTION AND THREW THE ANSWER AWAY.
--
--   signup step 1        -> user_metadata.vendor_category
--                        -> handle_new_user (AFTER INSERT on auth.users)
--                        -> profiles.vendor_category + profiles.role
--
--   onboarding step 3    -> supabase.auth.updateUser({ data: ... })
--                        -> user_metadata.vendor_category
--                        -> (nothing)
--
-- There is no AFTER UPDATE trigger on auth.users, and there should not be one.
-- So the category chosen during onboarding never reached `profiles`, and every
-- server-trusted read -- the proxy gate, current_app_role(), RLS, the admin
-- verification queue -- kept seeing the answer given at signup.
--
-- Pick "landlord" at signup and "food" in the wizard and you finish onboarding
-- as profiles.role = 'landlord', get pushed to /vendor, and are refused by the
-- gate. Reverse it and you are locked out of /landlord instead. Either way the
-- KYC reviewer approves a category the vendor did not submit.
--
-- WHY AN RPC AND NOT A PLAIN UPDATE
--   `role`, `roles` and `verification_status` are frozen for `authenticated`
--   by guard_profile_privileged_cols, and `roles` only moves while the
--   `sync.role_grant` GUC is raised -- which only a SECURITY DEFINER function
--   can raise. Changing a category moves the role with it, so it has to be a
--   function, checked in the database, exactly like claim_role and switch_role.
--
-- WHY IT SWAPS THE BUSINESS ROLE RATHER THAN ADDING ONE
--   profiles_one_business_role allows at most one of {vendor, landlord, rider}.
--   This is not a person acquiring a second business; it is one business
--   correcting what kind of business it is. Appending would violate the
--   constraint; replacing is what the change actually means.
--
-- WHY IT SETS `role` EXPLICITLY INSTEAD OF LETTING sync_landlord_role DO IT
--   sync_landlord_role would get there -- it fires on UPDATE OF vendor_category
--   and moves role across the vendor/landlord pair. But it runs AFTER
--   guard_profile_privileged_cols (alphabetical trigger order), so the guard
--   validates `role = any(roles)` against a role the sync trigger has not
--   assigned yet, and the outcome depends on trigger naming. Setting both in
--   the same UPDATE makes the row valid at every trigger in the chain, and
--   leaves sync_landlord_role agreeing with it rather than repairing it.
--
-- IT WILL NOT MAKE YOU A BUSINESS
--   Refused unless the caller already holds vendor or landlord. Taking on a
--   business role is claim_role's job and has its own checks; this would be a
--   way around them.
--
-- IT WILL NOT YANK THE HAT YOU ARE WEARING
--   A student who also sells keeps role = 'student' while their business role
--   is swapped underneath them. Only someone actively wearing the business hat
--   is moved, because for them the hat has changed shape.
--
-- ROLLBACK
--   drop function if exists public.set_vendor_category(text, text);
-- ============================================================================

create or replace function public.set_vendor_category(p_category text, p_trade text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_role   text;
  v_roles  text[];
  v_target text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The FK on profiles.vendor_category would catch this too, a statement
  -- later and with a message about constraint names.
  if not exists (select 1 from public.vendor_categories where slug = p_category) then
    raise exception 'Unknown business category: %', p_category using errcode = '22023';
  end if;

  select role, roles into v_role, v_roles
    from public.profiles
   where id = v_uid
     for update;

  if not ('vendor' = any (coalesce(v_roles, '{}')) or 'landlord' = any (coalesce(v_roles, '{}'))) then
    raise exception 'This account has no business profile to categorise'
      using errcode = '42501';
  end if;

  v_target := case when p_category = 'landlord' then 'landlord' else 'vendor' end;

  perform set_config('sync.role_grant', 'on', true);

  update public.profiles
     set roles = array_append(
                   array(select r
                           from unnest(coalesce(roles, '{}')) r
                          where r not in ('vendor', 'landlord')),
                   v_target),
         role = case when v_role in ('vendor', 'landlord') then v_target else v_role end,
         vendor_category = p_category,
         trade = case when p_category = 'tradesman' then p_trade else null end,
         updated_at = now()
   where id = v_uid;

  perform set_config('sync.role_grant', 'off', true);

  -- What the caller should route to. Not what they are wearing: a student who
  -- just set their shop up is still wearing 'student'.
  return v_target;
end;
$fn$;

revoke all on function public.set_vendor_category(text, text) from public, anon;
grant execute on function public.set_vendor_category(text, text) to authenticated;

comment on function public.set_vendor_category(text, text) is
  'Set the caller''s business category, moving their business role with it. '
  'Refuses accounts that hold no business role - use claim_role for that.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_vendor_category'
  ) then
    raise exception 'set_vendor_category was not created';
  end if;
end $$;
