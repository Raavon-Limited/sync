-- ============================================================================
-- storage_buckets
--
-- Object storage for chat attachments, verification documents, and the public
-- imagery on listings/hostels/storefronts.
--
-- WHY THIS IS NEEDED NOW
--   The vendor inbox already records voice notes (src/hooks/use-voice-recorder)
--   and accepts file attachments. Without a bucket those exist only as in-memory
--   object URLs and are gone on reload - a chat that appears to send a voice
--   note and then loses it is worse than one that never offered.
--
-- THE ACCESS MODEL
--   Three buckets, because they have three different audiences:
--
--   message-attachments  PRIVATE. Readable only by participants of the
--                        conversation the file belongs to. Served via signed
--                        URLs, never public links.
--   verification-docs    PRIVATE. Owner + staff only. These are ID documents.
--   public-media         PUBLIC read. Listing photos, hostel galleries, logos -
--                        things that appear on pages anonymous visitors can see.
--
-- PATH CONVENTION IS LOad-BEARING
--   Policies below authorize on the FIRST PATH SEGMENT. For private buckets that
--   segment is the owning user's uuid:
--
--       message-attachments/<user_id>/<conversation_id>/<file>
--       verification-docs/<user_id>/<file>
--
--   `storage.foldername(name)[1]` is that segment. A user can only write under
--   their own id, which is what stops one user planting a file in another's
--   folder and what makes the read policy tractable.
--
-- ROLLBACK
--   delete from storage.buckets where id in
--     ('message-attachments','verification-docs','public-media');
--   (Deleting a bucket deletes its objects. There is no undo.)
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('message-attachments', 'message-attachments', false, 26214400,
   array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/mpeg',
         'audio/mp4','audio/ogg','video/mp4','video/webm','application/pdf']),
  ('verification-docs', 'verification-docs', false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('public-media', 'public-media', true, 5242880,
   array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- The 25MB ceiling on attachments is a deliberate DoS bound: a voice note is
-- tens of KB and a photo a couple of MB. Storage is billed by the gigabyte.

-- ── message-attachments ─────────────────────────────────────────────────────
-- Write: only under your own uuid folder.
drop policy if exists "attachments_insert_own" on storage.objects;
create policy "attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "attachments_update_own" on storage.objects;
create policy "attachments_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "attachments_delete_own" on storage.objects;
create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Read: your own files, OR a file attached to a message in a conversation you
-- participate in. The second arm is what lets the other party see what you sent.
--
-- `private.is_conversation_member` is SECURITY DEFINER, which matters here for
-- the same reason it did in the messaging migration: evaluating membership from
-- inside a policy must not re-enter the RLS that is being evaluated.
drop policy if exists "attachments_read_participants" on storage.objects;
create policy "attachments_read_participants" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
          from public.message_attachments ma
          join public.messages m on m.id = ma.message_id
         where ma.storage_path = storage.objects.name
           and private.is_conversation_member(m.conversation_id, (select auth.uid()))
      )
    )
  );
-- ── verification-docs ───────────────────────────────────────────────────────
-- Owner writes; owner and staff read. Nobody deletes but the owner - a rejected
-- document is replaced, and staff must not be able to destroy evidence.
drop policy if exists "vdocs_insert_own" on storage.objects;
create policy "vdocs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "vdocs_read_own_or_staff" on storage.objects;
create policy "vdocs_read_own_or_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );
drop policy if exists "vdocs_delete_own" on storage.objects;
create policy "vdocs_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- ── public-media ────────────────────────────────────────────────────────────
-- World-readable by design: these are the images on pages a signed-out visitor
-- can already see. Writes are still scoped to the uploader's own folder, so a
-- vendor cannot overwrite another vendor's logo.
drop policy if exists "public_media_read" on storage.objects;
create policy "public_media_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'public-media');
drop policy if exists "public_media_insert_own" on storage.objects;
create policy "public_media_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'public-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "public_media_update_own" on storage.objects;
create policy "public_media_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'public-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "public_media_delete_own" on storage.objects;
create policy "public_media_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'public-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  buckets int;
  public_private int;
begin
  select count(*) into buckets
    from storage.buckets
   where id in ('message-attachments', 'verification-docs', 'public-media');

  if buckets <> 3 then
    raise exception 'expected 3 buckets, found %', buckets;
  end if;

  -- The two private buckets must not be flagged public. A public bucket serves
  -- every object by unguessable-but-permanent URL, which for ID documents is
  -- indistinguishable from having no access control at all.
  select count(*) into public_private
    from storage.buckets
   where id in ('message-attachments', 'verification-docs') and public;

  if public_private > 0 then
    raise exception '% private bucket(s) are flagged public', public_private;
  end if;

  raise notice 'storage ready: attachments + docs private, media public.';
end $$;
