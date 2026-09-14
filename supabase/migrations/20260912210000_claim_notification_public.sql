-- ============================================================================
-- claim_notification_public
--
-- WHY THIS EXISTS AS A SEPARATE MIGRATION
--   `20260912120000` created `private.claim_notification` and was applied. It
--   was then EDITED in place to create the function in `public` instead - which
--   changes nothing, because an applied migration never runs again. The remote
--   ended up recorded as having 20260912120000 while holding the function the
--   file no longer describes.
--
--   That is the trap the filenames-are-a-sequence rule exists to prevent:
--   once a migration is applied, the fix is always a new one. Editing the old
--   file makes every future `db push` a no-op against a database that silently
--   disagrees with the repo.
--
-- WHY IT HAD TO MOVE AT ALL
--   PostgREST exposes `public` and `graphql_public` only. A function in
--   `private` is unreachable over REST (PGRST106, "Invalid schema: private"),
--   so `applyVerifiedCharge` could never call it - and because that code treats
--   a failed claim as "do not send", the wallet top-up receipt would have gone
--   quiet forever with only a log line to show for it.
--
--   Reachability comes from the schema; safety comes from the grant. The TABLE
--   stays in `private`. `public.credit_wallet_topup` is the same shape.
--
-- IDEMPOTENT AGAINST EITHER STARTING POINT. This runs correctly whether the
-- remote has the private version, the public version, or neither - which
-- matters because the two are indistinguishable from the migration history.
-- ============================================================================

create table if not exists private.notification_claims (
  claim_key  text        not null,
  channel    text        not null,
  claimed_at timestamptz not null default now(),
  primary key (claim_key, channel)
);

comment on table private.notification_claims is
  'One row per (thing, channel) that has been claimed for sending. The primary key is the deduplication; see public.claim_notification.';

create or replace function public.claim_notification(
  p_key     text,
  p_channel text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_key is null or p_channel is null then
    raise exception 'claim key and channel are required' using errcode = '22023';
  end if;

  insert into private.notification_claims (claim_key, channel)
  values (p_key, p_channel)
  on conflict (claim_key, channel) do nothing;

  -- FOUND is false when the conflict clause swallowed the insert, which is
  -- precisely "somebody else already claimed this". Read-then-write would let
  -- two concurrent webhook deliveries both decide they were first.
  return found;
end;
$fn$;

revoke all on function public.claim_notification(text, text) from public, anon, authenticated;

grant execute on function public.claim_notification(text, text) to service_role;

comment on function public.claim_notification is
  'True for the first caller with this (key, channel), false thereafter. Service role only: a client must never be able to suppress a receipt.';

-- The unreachable one goes, so there is exactly one definition of this.
drop function if exists private.claim_notification(text, text);

-- ── Verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  v_first  boolean;
  v_second boolean;
  v_key    text := 'verify:' || gen_random_uuid()::text;
begin
  if to_regprocedure('public.claim_notification(text, text)') is null then
    raise exception 'public.claim_notification missing - the app cannot reach it in private';
  end if;
  if to_regprocedure('private.claim_notification(text, text)') is not null then
    raise exception 'the unreachable private.claim_notification is still here';
  end if;

  -- The whole point is that the SECOND call returns false. Asserted by calling
  -- it, not by reading the source: a rewrite into read-then-write looks fine
  -- and silently brings duplicate receipts back.
  select public.claim_notification(v_key, 'email') into v_first;
  select public.claim_notification(v_key, 'email') into v_second;
  if not v_first then
    raise exception 'claim_notification did not grant the first claim';
  end if;
  if v_second then
    raise exception 'claim_notification granted the same claim twice - duplicate receipts are back';
  end if;

  -- A different channel is a different claim, or adding push notifications
  -- later would silence every email.
  if not public.claim_notification(v_key, 'push') then
    raise exception 'claim_notification treated a second channel as already claimed';
  end if;

  delete from private.notification_claims where claim_key = v_key;

  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public'
       and routine_name = 'claim_notification'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'claim_notification is executable by a client role';
  end if;
end;
$verify$;
