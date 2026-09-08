-- ============================================================================
-- notify_drop_old_overload
--
-- Requesting a room failed with:
--   function private.notify(uuid, unknown, unknown, text, unknown, unknown,
--                           uuid, unknown) is not unique
--
-- MY BUG, FROM 20260911150000. That migration added `p_role` to
-- `private.notify` using `create or replace function`. `create or replace` only
-- replaces a function with the SAME argument list - adding a parameter makes a
-- new OVERLOAD and leaves the original in place. So the database ended up with
-- both:
--
--   private.notify(uuid, text, text, text, text, text, uuid, text)          -- old, 8 args
--   private.notify(uuid, text, text, text, text, text, uuid, text, text)    -- new, 9 args
--
-- Every existing caller passes 8 arguments, most of them untyped literals that
-- Postgres types as `unknown`. With one candidate it coerces them happily; with
-- two it cannot decide which to prefer and raises 42725 rather than guessing.
--
-- The failure surfaced at the worst possible place: `notify_booking_status` is
-- a TRIGGER on `bookings`, so the error aborted the INSERT and a student could
-- not request a room at all. An alert that cannot be delivered took down the
-- thing it was supposed to be reporting on.
--
-- THE FIX IS TO DROP THE OLD SIGNATURE, not to re-create it. The 9-argument
-- version is a superset - `p_role` defaults to null - so every 8-argument call
-- resolves to it unchanged and keeps meaning exactly what it meant.
--
-- LESSON, worth writing down because it is not obvious: adding a defaulted
-- parameter to an existing function is a BREAKING change in Postgres unless the
-- old signature is dropped in the same migration. `create or replace` reads as
-- though it replaces; for a changed argument list it does not.
-- ============================================================================

drop function if exists private.notify(uuid, text, text, text, text, text, uuid, text);

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'notify';

  if v_count = 0 then
    raise exception 'private.notify is gone entirely - every producer would now fail';
  end if;

  -- The whole point. More than one and ambiguous calls raise 42725 again.
  if v_count > 1 then
    raise exception 'private.notify still has % overloads; ambiguous calls will keep failing', v_count;
  end if;

  -- And it must be the one that takes the role.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'notify' and p.pronargs = 9
  ) then
    raise exception 'the surviving private.notify does not take p_role';
  end if;
end $$;
