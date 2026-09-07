-- ============================================================================
-- unverified_hostels_hidden
--
-- An unverified hostel is visible to students, and bookable.
--
--   hostels_select_active:  for select using (archived_at is null)
--
-- Verification is not in that policy at all. `fetchHostels` has carried an
-- optional `verifiedOnly` flag since it was written and NOTHING passes it   not
-- the browse page, not search, not `hostels_near`. So the sentence the product
-- says out loud on the landlord form   "A Sync agent visits before it can be
-- booked"   was not true, and the verified badge marked a subset of a list
-- everybody could already see and book from.
--
-- THIS IS RLS AND NOT A FILTER IN THE QUERY
--   modules/hostels/README says it plainly: authorization belongs in RLS, and
--   the module's own checks are UX. A `.eq('verified', true)` in one query is
--   one screen fixed and PostgREST still answering /rest/v1/hostels to anyone
--   with the anon key. There are three list paths (browse, search, near-me) and
--   a fourth will be written; the policy covers all four and everything after.
--
-- WHO STILL SEES AN UNVERIFIED ONE, AND WHY
--   the landlord who owns it   otherwise they cannot see, edit or fix the
--                              listing they just created, which is the whole
--                              of their dashboard
--   staff                      because reviewing it is the job
--
--   Everyone else, signed in or not, sees verified listings only.
--
-- THE CHILD TABLES MOVE WITH IT
--   `hostel_images` and `hostel_rooms` policies test the parent's
--   `archived_at`, so an unverified hostel's photos and rooms stayed readable
--   even once the hostel row itself was hidden   which leaks the gallery of a
--   listing nobody is supposed to see yet, and lets a room be read by id. They
--   now defer to the same rule.
--
-- WHAT THIS DOES NOT DO
--   It does not hide a hostel that WAS verified and has since been rejected in
--   a later visit   `verified` goes back to false and the listing goes away,
--   which is correct and worth knowing before somebody reports it as a bug.
--
-- ROLLBACK
--   drop policy if exists "hostels_select_visible" on public.hostels;
--   create policy "hostels_select_active" on public.hostels
--     for select using (archived_at is null);
--   -- and restore hostel_images_select / hostel_rooms_select from 0006.
-- ============================================================================

create or replace function public.hostel_is_visible(p_hostel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.hostels h
     where h.id = p_hostel
       and h.archived_at is null
       and (
         h.verified
         or h.landlord_id = (select auth.uid())
         or public.is_staff()
       )
  );
$$;

comment on function public.hostel_is_visible is
  'One definition of "may this hostel be read", used by the hostels policy and by its child tables so a photo cannot outlive its listing''s visibility.';

grant execute on function public.hostel_is_visible(uuid) to anon, authenticated;

-- ── The listing itself ──────────────────────────────────────────────────────
drop policy if exists "hostels_select_active" on public.hostels;
drop policy if exists "hostels_select_visible" on public.hostels;
create policy "hostels_select_visible" on public.hostels
  for select using (
    archived_at is null
    and (
      verified
      or landlord_id = (select auth.uid())
      or public.is_staff()
    )
  );

-- ── Its photos and its rooms ────────────────────────────────────────────────
drop policy if exists "hostel_images_select" on public.hostel_images;
create policy "hostel_images_select" on public.hostel_images
  for select using (public.hostel_is_visible(hostel_id));

drop policy if exists "hostel_rooms_select" on public.hostel_rooms;
create policy "hostel_rooms_select" on public.hostel_rooms
  for select using (public.hostel_is_visible(hostel_id));
