-- ============================================================================
-- profile_avatar
--
-- A profile picture on the account itself, so a person has a face on Sync.
--
-- WHAT WAS THERE
--   `DashboardProfile.avatarUrl` has existed since the sidebar was written and
--   has never been set by anything - the comment on it says "Supabase Storage
--   later". Every avatar in the product therefore falls back to an initial in a
--   circle, and a vendor could upload a logo while the student sitting in front
--   of them could not upload anything at all. The settings page had no way to
--   edit an account's own details either, so there was nowhere to put one.
--
-- WHY THIS IS NOT THE VERIFICATION SELFIE
--   20260905090000 says, correctly, that a person's card carries no face: the
--   only photograph Sync holds of a student or rider is the selfie they gave a
--   reviewer, it lives in a PRIVATE bucket, and publishing it behind an
--   unguessable URL would still be publishing it.
--
--   This column is a different thing and the distinction is the whole point.
--   It holds a picture the account holder CHOSE to publish, uploaded by them to
--   `public-media` - the same world-readable bucket their listing photos are
--   already in. Nothing here reads verification-docs, and `verify_card` is
--   untouched: the public /v/<code> page still shows a business logo and no
--   personal face, because a stranger who scanned a QR is not the audience for
--   a picture the holder put on their own dashboard.
--
-- THE URL IS VALIDATED IN THE ROUTE HANDLER, NOT HERE
--   /api/profile accepts an avatar_url only when it points into this project's
--   own public-media bucket, so the column cannot become an off-site tracking
--   pixel that renders wherever a name is shown. A CHECK constraint would have
--   to hard-code the project ref, which differs between local, staging and
--   production - it would fail migrations on the machines that need them most.
--
-- ROLLBACK
--   alter table public.profiles drop column if exists avatar_url;
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the profile picture the holder uploaded to the public-media bucket. Never the verification selfie, which is private and stays that way.';

-- No RLS change is needed: the profiles policies already let a user update
-- their own row, and this column is inside it. It is deliberately NOT added to
-- anything staff-only - a profile picture is not evidence.

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) then
    raise exception 'profiles.avatar_url missing';
  end if;

  raise notice 'profiles.avatar_url ready.';
end $$;
