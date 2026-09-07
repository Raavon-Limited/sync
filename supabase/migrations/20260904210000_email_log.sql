-- ============================================================================
-- email_log
--
-- What the platform has sent, to whom, and who sent it.
--
-- WHY A ROW PER EMAIL
--   Two questions had no answer anywhere. On a verification screen: "have we
--   already asked this person for their matric number, or am I about to be the
--   third reviewer to ask?" And after any mailshot: "who actually got that?"
--   Resend knows both and the console could not see either, so the answer was
--   somebody's memory.
--
--   The button on the review screen reads this: it says "Ask for what is
--   missing" the first time and "Resend" with a count afterwards, which is the
--   difference between chasing somebody and pestering them.
--
-- IT IS A LOG, NOT A QUEUE
--   A row means "we handed this to Resend and Resend took it". It is not
--   delivery, not an open, and it must never be read as either - the provider
--   owns that and we do not mirror it. Nothing retries off this table.
--
-- THE ADDRESS IS COPIED IN, ON PURPOSE
--   `email` is denormalised beside `recipient_id` because auth.users is not
--   readable from here and because an address that changes later must not
--   rewrite what we sent last month. The id can go null when an account is
--   deleted; the record of having written to them survives, which is what an
--   audit trail is for.
--
-- ROLLBACK
--   drop table if exists public.email_log;
-- ============================================================================

create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  -- Null once the account is gone. See the header: the row outlives them.
  recipient_id uuid references public.profiles (id) on delete set null,
  email        text not null,
  kind         text not null check (kind in (
                 -- A decision: verified or rejected.
                 'verification_decision',
                 -- A reviewer asking for what is missing. This is the one the
                 -- Resend button counts.
                 'verification_request',
                 -- The mail centre, to everyone or to a chosen list.
                 'broadcast'
               )),
  subject      text not null,
  -- Which staff member. Null for anything the platform sent on its own.
  sent_by      uuid references public.profiles (id) on delete set null,
  /**
   * Ties one mailshot's rows together, so the mail centre can say "247 sent"
   * rather than counting rows that happen to share a subject line.
   */
  batch_id     uuid,
  created_at   timestamptz not null default now()
);

-- The review screen's question: how many times have we written to THIS person
-- about THIS kind of thing, most recent first.
create index if not exists email_log_recipient_idx
  on public.email_log (recipient_id, kind, created_at desc);

-- The mail centre's history.
create index if not exists email_log_batch_idx
  on public.email_log (batch_id, created_at desc) where batch_id is not null;

comment on table public.email_log is
  'One row per email handed to the provider. Staff-readable; written only by the server. Not a delivery record - the provider owns that.';

alter table public.email_log enable row level security;

-- Staff read it and nobody writes it from a client: every insert comes from the
-- server with the service-role key, which is above RLS. There is deliberately
-- no insert policy - a client that could write here could forge the record of
-- what was sent.
drop policy if exists "email_log_staff_read" on public.email_log;
create policy "email_log_staff_read" on public.email_log
  for select to authenticated
  using (public.is_staff());

revoke all on public.email_log from anon;
grant select on public.email_log to authenticated;
