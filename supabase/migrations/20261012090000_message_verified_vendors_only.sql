-- ============================================================================
-- message_verified_vendors_only   students can only open a NEW thread with a
-- vendor Sync has verified.
--
-- WHAT THIS IS
--   The landlord door, `open_hostel_conversation` (20260822160000), already
--   connects a student to a property owner before any booking exists. Its
--   vendor twin, `open_listing_conversation` (20260820160000), has the same
--   shape and has been live since, but it asked only "does the listing exist",
--   so ANY vendor could be messaged: verified or not, archived or not, and for
--   an item that had already been pulled.
--
--   Verification is the whole reason a student can trust who is on the other end
--   of a thread, so it is the condition for opening one.
--
-- WHAT IS CHECKED, AND IN WHAT ORDER
--   1. Signed in.
--   2. The listing exists and is not archived.
--   3. Not the vendor's own listing.
--   4. THE CALLER'S EXISTING THREAD IS RETURNED NEXT, before the checks below.
--      A student who already has a conversation keeps it - and its history -
--      even if the vendor is later suspended. The gate is on STARTING a
--      conversation, not on reading one; hiding a thread would delete the
--      student's record of what was agreed.
--   5. Only now, for a thread that does not exist yet: the vendor is verified
--      and not archived, and the branch the item is sold from is not archived.
--
-- WHY THE MESSAGES READ AS SENTENCES
--   They reach a toast through MessageVendorButton. lib/errors.ts passes our own
--   raises through unchanged when they are not jargon, so these are written for
--   the person holding the phone, not for a log.
--
-- WHAT IS NOT CHANGED
--   Idempotency stays per (listing, caller): many students enquire about one
--   item, and a lookup on the listing alone would hand student B student A's
--   messages. No new subject type, so conversations_*_check is untouched and
--   nothing that reads a thread needs to change.
--
-- KNOWN GAP, LEFT ALONE: a branch manager (storefront_staff) is not added to the
--   thread, so enquiries reach the owner only. Fixing it means deciding what a
--   manager may read, which is a product call and not part of this change.
--
-- ROLLBACK
--   Restore the body from 20260820160000_listing_conversations.sql.
-- ============================================================================

create or replace function public.open_listing_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_listing public.listings%rowtype;
  v_convo   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found or v_listing.archived_at is not null then
    raise exception 'That item is no longer available.' using errcode = 'P0002';
  end if;

  -- SECURITY DEFINER turned RLS off, so this is restated by hand. A vendor
  -- opening a thread with themselves would insert two participant rows with the
  -- same key.
  if v_uid = v_listing.vendor_id then
    raise exception 'cannot open a thread with yourself' using errcode = '42501';
  end if;

  -- The caller's own thread, if any. Scoped to the caller, not the listing.
  select c.id into v_convo
    from public.conversations c
    join public.conversation_participants p
      on p.conversation_id = c.id and p.user_id = v_uid
   where c.subject_type = 'listing'
     and c.subject_id   = p_listing_id
   limit 1;

  if v_convo is not null then
    return v_convo;
  end if;

  -- A NEW thread: the other end has to be somebody Sync has vouched for.
  if not exists (
    select 1
      from public.vendor_profiles vp
     where vp.id = v_listing.vendor_id
       and vp.verification_status = 'verified'
       and vp.archived_at is null
  ) then
    raise exception 'You can only message vendors that Sync has verified.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.storefronts s
     where s.id = v_listing.storefront_id
       and s.archived_at is not null
  ) then
    raise exception 'That store is closed, so it cannot be messaged.'
      using errcode = 'P0002';
  end if;

  insert into public.conversations (kind, subject_type, subject_id, created_by, last_message_preview)
  values ('listing', 'listing', p_listing_id, v_uid, v_listing.name)
  returning id into v_convo;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_convo, v_uid,               'member'),
         (v_convo, v_listing.vendor_id, 'owner')
  on conflict do nothing;

  return v_convo;
end;
$fn$;

-- Signed-in callers only. The original never revoked the default PUBLIC execute,
-- so anon could reach the function and be turned away inside it; it should not
-- be reachable at all.
revoke all on function public.open_listing_conversation(uuid) from public, anon;
grant execute on function public.open_listing_conversation(uuid) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $fn$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'open_listing_conversation';

  if v_src is null then
    raise exception 'open_listing_conversation is missing';
  end if;
  if v_src not like '%verification_status%verified%' then
    raise exception 'open_listing_conversation does not require a verified vendor';
  end if;
  if v_src not like '%archived_at%' then
    raise exception 'open_listing_conversation does not refuse archived listings';
  end if;

  -- The existing-thread return must come BEFORE the verification gate, or a
  -- suspended vendor would lock students out of their own history.
  if position('return v_convo' in v_src) = 0
     or position('return v_convo' in v_src) > position('verification_status' in v_src) then
    raise exception 'an existing thread must be returned before the verified check';
  end if;

  if has_function_privilege('anon', 'public.open_listing_conversation(uuid)', 'execute') then
    raise exception 'anon can execute open_listing_conversation';
  end if;
  if not has_function_privilege('authenticated', 'public.open_listing_conversation(uuid)', 'execute') then
    raise exception 'authenticated cannot execute open_listing_conversation';
  end if;
end;
$fn$;
