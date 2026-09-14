-- ============================================================================
-- notification_preferences
--
-- TWO THINGS HAPPEN HERE, AND THE FIRST IS A BUG FIX.
--
-- 1. `notify_inspection_paid` (20260912150000) passes 'inspection' as the kind,
--    and `notifications.kind` has carried a CHECK constraint since
--    20260817090400 that permits exactly nine values - 'inspection' not among
--    them. So the insert raised, `notify_money`'s own exception handler caught
--    it and downgraded it to a warning, and the alert was dropped in silence.
--    A paid viewing notified nobody, and the only evidence was a line in the
--    Postgres log.
--
--    That handler is right - an alert must never take down the money write that
--    caused it - which is exactly why a kind outside the vocabulary is so
--    expensive: it fails invisibly, forever. The fix is to use 'payment', which
--    is what a paid viewing is, rather than widening a constrained vocabulary
--    that four other places (the TS union, the icon map, the preference list,
--    the constraint) would then have to agree about.
--
-- 2. Preferences, which did not exist. `/user/notifications` has had a
--    Preferences tab since it was built, holding four toggles in React state
--    over a table that was never created; the page said so in its own header
--    rather than pretending. This is that table.
--
-- ABSENCE MEANS ON.
--   No row = every alert delivered. A preferences system that has to be
--   populated before anything is sent is one failed insert away from a silent
--   account, and every existing user would start muted. You only ever store a
--   row to say NO.
--
-- MONEY AND SECURITY CANNOT BE MUTED IN-APP.
--   `payment` and `system` ignore the in-app preference. A debit alert is the
--   one chance somebody has to notice a payment they did not make, and an
--   account that can be silenced is the first thing an attacker silences. The
--   EMAIL side of both stays optional - the point is that the record exists
--   where they will see it, not that we fill their inbox.
--
-- EMAIL IS STORED BUT NOT YET READ.
--   Nothing in the app sends per-kind email today; the only transactional mails
--   are the booking acceptance and the top-up receipt, each with its own
--   trigger. The column is here so the UI can be honest about what it is
--   collecting, and the sender reads it when it exists. It is NOT wired, and
--   the screen says so.
--
-- ROLLBACK
--   drop table if exists public.notification_preferences;
--   restore private.notify from 20260911150000 and
--   private.notify_money / notify_inspection_paid from 20260912150000.
-- ============================================================================

create table if not exists public.notification_preferences (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in (
               'booking', 'order', 'message', 'payment', 'verification',
               'delivery', 'review', 'promotion', 'system')),
  -- Both default TRUE so an inserted row that only sets one column does not
  -- silently mute the other.
  in_app     boolean not null default true,
  email      boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

comment on table public.notification_preferences is
  'Per-kind delivery choices. A MISSING ROW MEANS ON - rows are only stored to say no. payment and system ignore in_app; see private.notify.';

alter table public.notification_preferences enable row level security;

-- Own row only, in every direction. There is no reason for anybody - including
-- staff - to read or change what somebody chose to be told about.
drop policy if exists "notification_preferences_own" on public.notification_preferences;

create policy "notification_preferences_own" on public.notification_preferences
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notification_preferences to authenticated;

revoke all on public.notification_preferences from anon;

-- ── The gate ────────────────────────────────────────────────────────────────
create or replace function private.wants_notification(p_user_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    -- Money and security are not mutable in-app. See the header.
    case when p_kind in ('payment', 'system') then true
         else coalesce(
           (select p.in_app
              from public.notification_preferences p
             where p.user_id = p_user_id and p.kind = p_kind),
           -- No row means ON. Never mute by default.
           true)
    end;
$fn$;

revoke all on function private.wants_notification(uuid, text) from public, anon, authenticated;

-- ── private.notify, unchanged except that it now asks ───────────────────────
-- Reproduced from 20260911150000 rather than altered, because there is no way
-- to add a line to a function in place. The self-suppression and the swallowing
-- exception handler are both deliberate and both preserved verbatim.
create or replace function private.notify(
  p_user_id     uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text default null,
  p_action      text default null,
  p_entity_id   uuid default null,
  p_entity_type text default null,
  p_role        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Nobody to tell, or the actor telling themselves.
  if p_user_id is null or p_user_id = (select auth.uid()) then
    return;
  end if;

  -- They asked not to hear about this kind.
  if not private.wants_notification(p_user_id, p_kind) then
    return;
  end if;

  insert into public.notifications
    (user_id, kind, title, body, href, action, entity_type, entity_id, role)
  values
    (p_user_id, p_kind, p_title, p_body, p_href, p_action, p_entity_type, p_entity_id, p_role);
exception
  when others then
    -- An alert must never take down the write that caused it.
    raise warning 'notify failed for % (%): %', p_user_id, p_kind, sqlerrm;
end;
$fn$;

-- ── notify_money: same gate, and it will refuse an unknown kind loudly ──────
create or replace function private.notify_money(
  p_user_id     uuid,
  p_title       text,
  p_body        text,
  p_href        text default 'wallet',
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_kind        text default 'payment'
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_user_id is null then
    return;
  end if;

  /*
   * THE KIND IS CHECKED BEFORE THE INSERT, NOT BY THE INSERT.
   *
   * `notifications.kind` has a CHECK constraint, and the handler below turns
   * any failure into a warning - so a kind outside the vocabulary produced a
   * notification that was never delivered and never complained. That is how
   * 'inspection' got shipped and dropped every paid-viewing alert. Raising
   * here still hits the same handler, but the message names the actual
   * problem instead of a generic constraint violation.
   */
  if p_kind not in ('booking', 'order', 'message', 'payment', 'verification',
                    'delivery', 'review', 'promotion', 'system') then
    raise exception 'notify_money: % is not a permitted notification kind', p_kind;
  end if;

  if not private.wants_notification(p_user_id, p_kind) then
    return;
  end if;

  -- NO auth.uid() CHECK. The payer is exactly who wants this.
  insert into public.notifications
    (user_id, kind, title, body, href, entity_type, entity_id, role)
  values
    (p_user_id, p_kind, p_title, p_body, p_href, p_entity_type, p_entity_id, null);
exception
  when others then
    raise warning 'notify_money failed for % (%): %', p_user_id, p_title, sqlerrm;
end;
$fn$;

-- ── And the trigger that was passing the bad kind ────────────────────────────
create or replace function private.notify_inspection_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hostel text;
begin
  if new.status is not distinct from old.status or new.status <> 'scheduled' then
    return new;
  end if;

  select h.name into v_hostel from public.hostels h where h.id = new.hostel_id;

  perform private.notify_money(
    new.student_id,
    'Your viewing is booked',
    'We have your fee for ' || coalesce(v_hostel, 'the hostel') ||
    '. Agents can see your request now - one will take it and propose a time for you to confirm.',
    'bookings', 'inspection', new.id,
    -- 'payment', not 'inspection'. The latter is not in the kind vocabulary and
    -- silently dropped every one of these.
    'payment'
  );
  return new;
end;
$fn$;

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_user   uuid;
  v_before bigint;
  v_after  bigint;
begin
  if to_regprocedure('private.wants_notification(uuid, text)') is null then
    raise exception 'wants_notification missing';
  end if;

  -- The bad kind must now be REFUSED rather than silently dropped. Asserted by
  -- reading the source, because the call itself swallows its own exception.
  if position('is not a permitted notification kind' in
      (select prosrc from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'notify_money')) = 0 then
    raise exception 'notify_money no longer validates the kind';
  end if;

  -- ASSERTED POSITIVELY, because the obvious negative check is wrong: the
  -- string 'inspection' legitimately appears in this function as the
  -- entity_type argument ("what does this alert point at"), which is correct
  -- and unrelated to the kind. Searching for its absence failed on the very
  -- first push against a function that was already right. What matters is that
  -- the KIND it passes is a permitted one.
  if position('''payment''' in
      (select prosrc from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'notify_inspection_paid')) = 0 then
    raise exception 'notify_inspection_paid does not pass a permitted notification kind';
  end if;

  select id into v_user from public.profiles limit 1;
  if v_user is null then
    raise notice 'no profiles yet - skipping the delivery assertions';
    return;
  end if;

  -- 1. Absence means ON.
  delete from public.notification_preferences where user_id = v_user and kind = 'booking';
  if not private.wants_notification(v_user, 'booking') then
    raise exception 'a missing preference row muted the alert - the default is backwards';
  end if;

  -- 2. A stored false actually mutes.
  insert into public.notification_preferences (user_id, kind, in_app)
  values (v_user, 'booking', false)
  on conflict (user_id, kind) do update set in_app = false;
  if private.wants_notification(v_user, 'booking') then
    raise exception 'wants_notification ignored a stored preference';
  end if;

  -- 3. Money cannot be muted, however hard somebody tries.
  insert into public.notification_preferences (user_id, kind, in_app)
  values (v_user, 'payment', false)
  on conflict (user_id, kind) do update set in_app = false;
  if not private.wants_notification(v_user, 'payment') then
    raise exception 'a payment alert was mutable - a debit nobody is told about is the whole risk';
  end if;

  -- 4. And notify_money still delivers through the gate.
  select count(*) into v_before from public.notifications where user_id = v_user;
  perform private.notify_money(v_user, 'verify', 'verify', 'wallet', null, null, 'payment');
  select count(*) into v_after from public.notifications where user_id = v_user;
  if v_after <> v_before + 1 then
    raise exception 'notify_money stopped delivering';
  end if;

  delete from public.notifications where user_id = v_user and title = 'verify' and kind = 'payment';
  delete from public.notification_preferences where user_id = v_user and kind in ('booking', 'payment');
end;
$verify$;
