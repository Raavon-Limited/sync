-- ============================================================================
-- listing_video
--
-- A landlord can show a student photographs of a room and not a walk through
-- it, which is the thing that actually answers "is this place real and does it
-- look like the pictures". Two things stopped it:
--
--   1. `public-media` accepts image mime types only, at 5MB. A 30-second phone
--      video is neither.
--   2. `hostel_images` has a url and a position and no way to say that a row is
--      a video, so even a stored one could not be rendered correctly.
--
-- A SEPARATE BUCKET, NOT A WIDER public-media
--   Raising public-media to video size would raise it for AVATARS and LOGOS
--   too, and those are 5MB for a reason: they are fetched on nearly every page,
--   by everybody, and a 40MB "avatar" is a bill and a slow page rather than an
--   attack. The limits describe what the content IS, so content with different
--   limits gets a different bucket.
--
--   `listing-media` is public-read for the same reason public-media is: these
--   play on a listing page a signed-out student can already see.
--
-- THE 40MB CEILING IS A DELIBERATE BOUND, like the 25MB on attachments. A
-- walkthrough is thirty seconds on a phone, not a feature film, and storage is
-- billed by the gigabyte. Long enough to be useful; short enough that one
-- landlord cannot fill a disk.
--
-- kind, NOT A FILENAME CHECK
--   Deciding "is this a video" by sniffing the extension off the URL works
--   right up until a signed URL grows a query string or somebody uploads
--   `room.mp4.jpg`. The row says what it is, once, at insert.
--
-- WHY hostel_images KEEPS ITS NAME
--   Renaming it to hostel_media would touch every query in the stack for a
--   cosmetic gain, and PostgREST embeds are written as `hostel_images(...)` in
--   six places. The column comment carries the truth instead.
--
-- ROLLBACK
--   alter table public.hostel_images drop column if exists kind;
--   delete from storage.buckets where id = 'listing-media';
--   -- (Deleting a bucket deletes its objects. There is no undo.)
-- ============================================================================

-- ── 1. A bucket sized for video ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-media', 'listing-media', true, 41943040,
   array['image/jpeg','image/png','image/webp','image/avif',
         'video/mp4','video/webm','video/quicktime'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

-- Same shape as public-media: world-readable, writes scoped to the uploader's
-- own uuid folder by the FIRST PATH SEGMENT. See 20260819180000's header   that
-- convention is load-bearing, not decorative.
drop policy if exists "listing_media_read" on storage.objects;
create policy "listing_media_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-media');

drop policy if exists "listing_media_insert_own" on storage.objects;
create policy "listing_media_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "listing_media_update_own" on storage.objects;
create policy "listing_media_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "listing_media_delete_own" on storage.objects;
create policy "listing_media_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ── 2. The row says what it is ──────────────────────────────────────────────
alter table public.hostel_images
  add column if not exists kind text not null default 'image'
    check (kind in ('image', 'video'));

comment on column public.hostel_images.kind is
  'image or video. The table keeps its name for compatibility   it is the listing''s MEDIA, and position 0 is still the primary tile.';

comment on column public.hostel_images.position is
  'Display order. 0 is the PRIMARY image the cards show   keep a photo there, since a video cannot be a thumbnail.';
