-- ============================================================================
-- fix_set_primary_storefront
--
-- WHAT WAS BROKEN
--   set_primary_storefront() promoted a branch with a single statement:
--
--     update public.storefronts
--        set is_primary = (id = p_storefront_id)
--      where vendor_id = v_vendor;
--
--   which fails the moment a brand already has a primary:
--     ERROR: duplicate key value violates unique constraint
--            "storefronts_one_primary_idx"
--
--   A unique INDEX is enforced per row as the update walks the table, not at
--   statement end. If the row being promoted is reached before the row being
--   demoted, two rows momentarily carry is_primary = true and the index fires.
--   Whether it fails is down to physical row order, which is why the backfilled
--   single-branch case passed and the four-branch case did not.
--
-- WHY THE ORIGINAL REASONING WAS WRONG
--   The one-statement form was chosen to avoid "clear then set" leaving a brand
--   with NO primary if the two interleaved. That risk does not exist here: a
--   plpgsql function body runs inside a single transaction, so the intermediate
--   state where nothing is primary is never visible to another session, and a
--   failure rolls both statements back together. Two statements were always
--   safe; one statement was never correct.
--
--   Deferring the constraint is not an option: only unique CONSTRAINTS can be
--   DEFERRABLE, and this is a PARTIAL unique index (`where is_primary and
--   archived_at is null`), which Postgres cannot express as a constraint.
--
-- ROLLBACK
--   Restore the previous body from 20260822090000_storefronts.sql (note it is
--   the broken version).
-- ============================================================================

create or replace function public.set_primary_storefront(p_storefront_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_vendor uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the target row, and read the brand it belongs to.
  select s.vendor_id into v_vendor
    from public.storefronts s
   where s.id = p_storefront_id
     and s.archived_at is null
     for update;

  if v_vendor is null then
    raise exception 'storefront not found' using errcode = 'P0002';
  end if;

  -- Authorisation, restated because SECURITY DEFINER turned RLS off.
  if v_vendor <> v_uid then
    raise exception 'not your storefront' using errcode = '42501';
  end if;

  -- Step 1: demote. After this no row for the brand is primary, which is the
  -- state the partial unique index needs before the promotion below.
  update public.storefronts
     set is_primary = false,
         updated_at = now()
   where vendor_id = v_vendor
     and is_primary
     and id <> p_storefront_id;

  -- Step 2: promote. Both statements share this function's transaction, so the
  -- gap between them is invisible outside it.
  update public.storefronts
     set is_primary = true,
         updated_at = now()
   where id = p_storefront_id;
end;
$fn$;

grant execute on function public.set_primary_storefront(uuid) to authenticated, service_role;
