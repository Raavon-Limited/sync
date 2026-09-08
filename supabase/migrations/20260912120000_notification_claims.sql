-- ============================================================================
-- notification_claims
--
-- WHY
--   A receipt email must be sent exactly once per payment, and as of
--   /api/payments/verify there are now TWO code paths that apply the same
--   charge: the Paystack webhook, and the payer's own browser returning from
--   checkout. Both call `applyVerifiedCharge`, and both are meant to - the
--   money effects are idempotent by payment reference inside
--   `credit_wallet_topup` and `confirm_inspection_payment`, so whichever runs
--   second is a no-op.
--
--   Sending mail is not. There is no reference column on an email, so the
--   second path would cheerfully send a second receipt for one top-up, and
--   Paystack's own retries would send a third.
--
--   The money RPCs cannot answer "was this new?" - both return the same
--   transaction id on a replay, deliberately, because their caller does not
--   care. Rather than change a money function's return type (`42P13`, and a
--   drop/recreate of something the webhook depends on) this adds a separate,
--   additive claim: a table whose primary key IS the thing being deduplicated.
--
-- WHAT
--   `private.claim_notification(key, channel)` returns TRUE for the first
--   caller and FALSE for every caller after it. `on conflict do nothing` plus
--   `found` is the whole mechanism - no read-then-write, so two concurrent
--   deliveries cannot both see "not sent yet".
--
--   It is in `private` and granted only to `service_role`. Nothing a browser
--   does should be able to suppress somebody's receipt, which is exactly what
--   an exposed claim would allow.
--
--   THIS TURNED OUT TO BE WRONG AND 20260912210000 MOVES IT. PostgREST exposes
--   `public` and `graphql_public` only, so nothing in the app can call a
--   function that lives in `private` (PGRST106). Left as it was applied rather
--   than edited, because an applied migration that no longer describes the
--   database is worse than one that records a mistake.
--
--   The key is caller-chosen and carries its own meaning - the payment
--   reference for a receipt. `channel` separates "we emailed about X" from
--   "we pushed about X", so adding a second channel later does not silence the
--   first.
--
-- NOT A LOG
--   This records that a send was CLAIMED, not that it succeeded. A claim that
--   is followed by a failed SMTP call is a receipt nobody gets, and that is the
--   deliberate trade: a missing receipt is recoverable by a human, a duplicate
--   one about money is not. `private.email_log` is where delivery is recorded.
--
-- ROLLBACK
--   drop function if exists private.claim_notification(text, text);
--   drop table if exists private.notification_claims;
-- ============================================================================

create table if not exists private.notification_claims (
  claim_key  text        not null,
  channel    text        not null,
  claimed_at timestamptz not null default now(),
  primary key (claim_key, channel)
);

comment on table private.notification_claims is
  'One row per (thing, channel) that has been claimed for sending. The primary key is the deduplication; see claim_notification.';

create or replace function private.claim_notification(
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

revoke all on function private.claim_notification(text, text) from public, anon, authenticated;
grant execute on function private.claim_notification(text, text) to service_role;

comment on function private.claim_notification is
  'True for the first caller with this (key, channel), false thereafter. Service role only: a client must never be able to suppress a receipt.';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- The whole value of this function is that the SECOND call returns false. A
-- rewrite that turns it into a read-then-write still passes a casual reading
-- and silently reintroduces double receipts, so the behaviour is asserted
-- rather than the definition.
do $verify$
declare
  v_first  boolean;
  v_second boolean;
  v_key    text := 'verify:' || gen_random_uuid()::text;
begin
  select private.claim_notification(v_key, 'email') into v_first;
  select private.claim_notification(v_key, 'email') into v_second;

  if not v_first then
    raise exception 'claim_notification did not grant the first claim';
  end if;
  if v_second then
    raise exception 'claim_notification granted the same claim twice - duplicate receipts are back';
  end if;

  -- A different channel for the same key is a DIFFERENT claim, or adding push
  -- notifications later would silence every email.
  if not private.claim_notification(v_key, 'push') then
    raise exception 'claim_notification treated a second channel as already claimed';
  end if;

  delete from private.notification_claims where claim_key = v_key;

  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'claim_notification'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'claim_notification is executable by a client role';
  end if;
end;
$verify$;
