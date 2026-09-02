-- ============================================================================
-- landlord_booking_actions
--
-- A landlord can READ bookings on their hostels (bookings_select_own covers
-- them) but cannot UPDATE any: bookings_update_own is `auth.uid() = student_id`
-- alone. So a request lands and nothing the landlord does can move it. The
-- update returns no error and changes no rows   RLS filters it silently, which
-- is why this went unnoticed.
--
-- WHAT IS *NOT* WRONG HERE
--   guard_booking_privileged_cols already restricts authenticated callers to
--   ('interested','requested','awaiting_payment','cancelled') and its comment
--   states the intent plainly: confirmed / expired / completed are server-only,
--   driven by the payment webhook. That is correct and stays. A landlord must
--   not be able to mark a booking paid.
--
--   The gap is narrower: the landlord cannot reach the two statuses that ARE
--   allowed   approving a request into 'awaiting_payment', or declining it as
--   'cancelled'. Those are exactly the landlord's decisions to make.
--
-- WHY THE GUARD GROWS TOO
--   Granting UPDATE to the landlord also hands them every other column. A
--   landlord has no business rewriting move_in, end_date, or which room the
--   student asked for. The guard now freezes the student's own fields whenever
--   the actor is not the student, mirroring how it already freezes paid_at.
--
-- ROLLBACK
--   drop policy if exists "bookings_update_landlord" on public.bookings;
--   -- and restore guard_booking_privileged_cols from 0006_student_core.sql
-- ============================================================================

-- 1. The landlord may act on bookings for their own hostels -------------------
drop policy if exists "bookings_update_landlord" on public.bookings;
create policy "bookings_update_landlord" on public.bookings
  for update to authenticated
  using (
    exists (select 1 from public.hostels h
             where h.id = hostel_id and h.landlord_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.hostels h
             where h.id = hostel_id and h.landlord_id = (select auth.uid()))
  );

-- 2. Whoever is acting, they may only change what is theirs -------------------
create or replace function public.guard_booking_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- Unchanged from 0006: confirmed / expired / completed are server-only,
    -- driven by the payment webhook. Neither party may set them.
    if new.status is distinct from old.status
       and new.status not in ('interested','requested','awaiting_payment','cancelled') then
      new.status := old.status;
    end if;
    new.paid_at           := old.paid_at;
    new.payment_reference := old.payment_reference;

    -- NEW: a landlord acting on someone else's booking may move its STATUS and
    -- nothing else. Without this, granting them UPDATE would also let them
    -- rewrite the move-in date or swap the room the student chose.
    if (select auth.uid()) is distinct from old.student_id then
      new.student_id := old.student_id;
      new.hostel_id  := old.hostel_id;
      new.room_id    := old.room_id;
      new.move_in    := old.move_in;
      new.end_date   := old.end_date;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
