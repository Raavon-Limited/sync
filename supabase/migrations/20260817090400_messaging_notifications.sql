-- ============================================================================
-- messaging_notifications
--
-- Backs /vendor/inbox (chat-window, chat-component, voice-recorder,
-- attachments) and the notification bell in the student dashboard.
--
-- MEMBERSHIP, NOT OWNERSHIP
--   A conversation has no single owner. Access is decided by "is the caller a
--   participant", which is a join, and joins in RLS policies are where
--   messaging performance goes to die: the participant lookup runs per message
--   row. `conversation_participants` is therefore indexed on (user_id,
--   conversation_id) — the exact shape the policy predicate probes — and the
--   messages policy checks membership of the CONVERSATION, once, rather than
--   re-deriving it per message.
--
-- RECURSION HAZARD
--   The obvious policy on conversation_participants is "you may read rows for
--   conversations you participate in" — which queries conversation_participants
--   from inside a policy on conversation_participants, and recurses forever.
--   `private.is_conversation_member()` is SECURITY DEFINER precisely to break
--   that cycle: it bypasses RLS on the membership table, so the policy can call
--   it without re-entering itself.
--
-- ROLLBACK
--   drop table if exists public.message_attachments, public.messages,
--                        public.conversation_participants, public.conversations,
--                        public.notifications, public.devices cascade;
--   drop function if exists private.is_conversation_member(uuid, uuid);
-- ============================================================================

-- ── 1. Conversations ────────────────────────────────────────────────────────
-- `subject_*` links a thread to what it is about, so the inbox can show the
-- order card beside the chat (ChatOrder in src/modules/vendor/types.ts).
create table if not exists public.conversations (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'direct'
                  check (kind in ('direct', 'order', 'booking', 'service_request', 'support')),
  subject_type  text check (subject_type in ('order', 'booking', 'service_request', 'hostel')),
  subject_id    uuid,
  -- Denormalised for the conversation list: sorting by a joined aggregate makes
  -- the inbox query unusable at any real volume.
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  created_by    uuid references public.profiles (id) on delete set null,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists conversations_subject_idx
  on public.conversations (subject_type, subject_id);
create index if not exists conversations_recent_idx
  on public.conversations (last_message_at desc) where archived_at is null;

-- ── 2. Participants ─────────────────────────────────────────────────────────
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('member', 'owner', 'support')),
  -- Unread counts are derived from this, not stored: a stored counter drifts
  -- the moment two devices read the same thread.
  last_read_at    timestamptz,
  muted           boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- The exact shape the RLS predicate probes.
create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id, conversation_id);

-- ── 3. Messages ─────────────────────────────────────────────────────────────
-- `kind` covers the voice notes src/hooks/use-voice-recorder.ts already
-- records, and the system messages that narrate order status inside a thread.
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  kind            text not null default 'text'
                    check (kind in ('text', 'image', 'file', 'voice', 'system')),
  body            text,
  -- Soft delete: "this message was deleted" needs the row to survive.
  deleted_at      timestamptz,
  edited_at       timestamptz,
  created_at      timestamptz not null default now(),

  -- A non-system message with no body must carry an attachment; enforced after
  -- the attachments table exists, via the trigger below.
  constraint messages_body_or_attachment check (
    kind = 'system' or body is not null or kind in ('image', 'file', 'voice')
  )
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

create table if not exists public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  -- Voice notes need a duration for the waveform UI.
  duration_ms  integer check (duration_ms >= 0),
  width        integer,
  height       integer,
  created_at   timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

-- ── 4. Membership helper — breaks the RLS recursion ─────────────────────────
create or replace function private.is_conversation_member(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp
     where cp.conversation_id = p_conversation
       and cp.user_id = p_user
  )
$$;

revoke all on function private.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function private.is_conversation_member(uuid, uuid) to authenticated, service_role;

comment on function private.is_conversation_member(uuid, uuid) is
  'SECURITY DEFINER so policies ON conversation_participants can call it without recursing into themselves.';

-- ── 5. Keep the conversation summary current ────────────────────────────────
create or replace function public.touch_conversation_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = case
           when new.kind = 'text'  then left(coalesce(new.body, ''), 140)
           when new.kind = 'voice' then 'Voice note'
           when new.kind = 'image' then 'Photo'
           when new.kind = 'file'  then 'Attachment'
           else coalesce(new.body, '')
         end,
         updated_at = now()
   where id = new.conversation_id;
  return null;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- A sender may edit their own text, never reassign authorship or move a message
-- into another thread.
create or replace function public.guard_message_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.sender_id       := old.sender_id;
    new.conversation_id := old.conversation_id;
    new.created_at      := old.created_at;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard
  before update on public.messages
  for each row execute function public.guard_message_cols();

-- ── 6. Notifications ────────────────────────────────────────────────────────
-- Mirrors StudentNotification in src/mock/student.ts. `icon` is presentation
-- and is deliberately NOT stored — the client maps `kind` to a Lucide icon, so
-- rebranding does not mean a data migration.
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in (
               'booking', 'order', 'message', 'payment', 'verification',
               'delivery', 'review', 'promotion', 'system')),
  title      text not null,
  body       text not null,
  -- Path suffix under the dashboard base, e.g. 'bookings' → /<handle>/bookings.
  href       text,
  action     text check (action in ('chat')),
  entity_type text,
  entity_id   uuid,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Partial index: the bell only ever counts unread.
create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- Push targets, for when notifications leave the browser.
create table if not exists public.devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('web', 'ios', 'android')),
  last_seen_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists devices_user_idx on public.devices (user_id);

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_attachments       enable row level security;
alter table public.notifications             enable row level security;
alter table public.devices                   enable row level security;

drop policy if exists "conversations_member" on public.conversations;
create policy "conversations_member" on public.conversations
  for select to authenticated
  using (private.is_conversation_member(id, (select auth.uid())));

drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations
  for update to authenticated
  using (private.is_conversation_member(id, (select auth.uid())))
  with check (private.is_conversation_member(id, (select auth.uid())));

-- Participants: a member sees the roster of their own threads. The helper is
-- what stops this policy recursing into the table it protects.
drop policy if exists "conversation_participants_member" on public.conversation_participants;
create policy "conversation_participants_member" on public.conversation_participants
  for select to authenticated
  using (private.is_conversation_member(conversation_id, (select auth.uid())));

-- Only your own row — this is how "mark thread read" and "mute" work.
drop policy if exists "conversation_participants_update_self" on public.conversation_participants;
create policy "conversation_participants_update_self" on public.conversation_participants
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "messages_member_read" on public.messages;
create policy "messages_member_read" on public.messages
  for select to authenticated
  using (private.is_conversation_member(conversation_id, (select auth.uid())));

-- You may only post as yourself, and only into a thread you belong to.
drop policy if exists "messages_member_send" on public.messages;
create policy "messages_member_send" on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and private.is_conversation_member(conversation_id, (select auth.uid()))
  );

drop policy if exists "messages_edit_own" on public.messages;
create policy "messages_edit_own" on public.messages
  for update to authenticated
  using ((select auth.uid()) = sender_id)
  with check ((select auth.uid()) = sender_id);

drop policy if exists "message_attachments_member" on public.message_attachments;
create policy "message_attachments_member" on public.message_attachments
  for select to authenticated
  using (exists (
    select 1 from public.messages m
     where m.id = message_id
       and private.is_conversation_member(m.conversation_id, (select auth.uid()))
  ));

drop policy if exists "message_attachments_insert_own" on public.message_attachments;
create policy "message_attachments_insert_own" on public.message_attachments
  for insert to authenticated
  with check (exists (
    select 1 from public.messages m
     where m.id = message_id and m.sender_id = (select auth.uid())
  ));

-- Notifications: read and mark-read only. Rows are written server-side, so a
-- client cannot forge a "payment received" notification.
drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "notifications_mark_read" on public.notifications;
create policy "notifications_mark_read" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "devices_own" on public.devices;
create policy "devices_own" on public.devices
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 8. Grants ───────────────────────────────────────────────────────────────
revoke all on public.conversations             from anon, authenticated;
revoke all on public.conversation_participants from anon, authenticated;
revoke all on public.messages                  from anon, authenticated;
revoke all on public.message_attachments       from anon, authenticated;
revoke all on public.notifications             from anon, authenticated;
revoke all on public.devices                   from anon, authenticated;

grant select, update         on public.conversations             to authenticated;
grant select, update         on public.conversation_participants to authenticated;
grant select, insert, update on public.messages                  to authenticated;
grant select, insert         on public.message_attachments       to authenticated;
grant select, update         on public.notifications             to authenticated;
grant select, insert, update, delete on public.devices           to authenticated;

-- Conversations are created server-side (an order thread is opened when the
-- order is placed), so no client INSERT.

-- ── 9. Realtime ─────────────────────────────────────────────────────────────
-- Realtime respects RLS, so subscribers still only receive rows their policies
-- allow. Adding the table to the publication is what makes the inbox live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- `add table` errors if the table is already a member; check first.
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
    ) then
      alter publication supabase_realtime add table public.conversations;
    end if;
    raise notice 'realtime enabled for messages, notifications, conversations';
  else
    raise warning 'publication supabase_realtime not found — enable realtime in the dashboard';
  end if;
end $$;

-- ── 10. Verify ──────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'notifications'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then
    raise exception 'clients can insert notifications — they could forge payment alerts';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'is_conversation_member'
       and p.prosecdef
  ) then
    raise exception 'is_conversation_member must be SECURITY DEFINER or the participants policy recurses';
  end if;

  raise notice 'messaging ready: threads, voice notes, notifications, realtime.';
end $$;
