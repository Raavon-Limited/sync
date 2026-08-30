-- ============================================================================
-- listing_conversations
--
-- Adds the pre-order messaging door. Until now the ONLY way to create a
-- conversation was open_order_conversation(), which hard-requires an order —
-- so a student could not ask "is this still available?" before buying, which
-- is the single most common question a marketplace has to carry.
--
-- WHY AN RPC AND NOT A GRANT
--   public.conversations is deliberately granted select+update to authenticated
--   and NOT insert (see 20260817090400_messaging_notifications.sql:316). That is
--   what stops a client inventing a thread, adding itself to someone else's, or
--   forging created_by. We keep that closed and add a second audited door
--   rather than opening the table.
--
-- IDEMPOTENCY IS PER (LISTING, STUDENT) — NOT PER LISTING
--   open_order_conversation can look up its thread by subject alone, because an
--   order has exactly two parties. A listing has MANY interested students, so
--   the same lookup here would hand student B the thread belonging to student A
--   and leak a stranger's message history. The existing-thread probe therefore
--   joins conversation_participants on the CALLER.
--
-- ROLLBACK
--   drop function if exists public.open_listing_conversation(uuid);
--   -- constraint changes below are additive; to revert, restore the two
--   -- original check constraints listed in each `alter table` comment.
-- ============================================================================

-- ── 1. Widen the subject/kind vocabularies ──────────────────────────────────
-- Originally: check (kind in ('direct','order','booking','service_request','support'))
alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add  constraint conversations_kind_check
  check (kind in ('direct', 'order', 'listing', 'booking', 'service_request', 'support'));

-- Originally: check (subject_type in ('order','booking','service_request','hostel'))
alter table public.conversations drop constraint if exists conversations_subject_type_check;
alter table public.conversations add  constraint conversations_subject_type_check
  check (subject_type in ('order', 'listing', 'booking', 'service_request', 'hostel'));

-- ── 2. open_listing_conversation ────────────────────────────────────────────
-- Idempotent per (listing, caller): returns the caller's existing thread about
-- this listing if there is one. Called when a student taps "Message vendor" on
-- a listing, before any order exists.
create or replace function public.open_listing_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_convo   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;

  -- Authorisation, restated because SECURITY DEFINER turned RLS off. A vendor
  -- opening a thread with themselves would create a conversation whose two
  -- participant rows collide on the primary key.
  if v_uid = v_listing.vendor_id then
    raise exception 'cannot open a thread with yourself' using errcode = '42501';
  end if;

  -- Scoped to the caller — see IDEMPOTENCY note in the header.
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

  insert into public.conversations (kind, subject_type, subject_id, created_by, last_message_preview)
  values ('listing', 'listing', p_listing_id, v_uid, v_listing.name)
  returning id into v_convo;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_convo, v_uid,               'member'),
         (v_convo, v_listing.vendor_id, 'owner')
  on conflict do nothing;

  return v_convo;
end;
$$;

grant execute on function public.open_listing_conversation(uuid) to authenticated, service_role;
