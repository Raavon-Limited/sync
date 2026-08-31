-- ============================================================================
-- money_ledger
--
-- Backs /wallet, /vendor/earnings, /vendor/plan and the Paystack integration.
--
-- THE ONE RULE
--   Money moves by writing a balanced transaction to the ledger. Nothing
--   anywhere updates a balance directly. `wallets.balance_kobo` is a CACHE,
--   maintained by trigger from the ledger and re-derivable at any time by
--   `private.recompute_wallet(uuid)`. If the cache and the ledger disagree, the
--   ledger is right — that is the entire point of keeping one.
--
-- WHY DOUBLE ENTRY
--   Single-entry balance updates cannot answer "where did this ₦2,000 come
--   from". Every transaction here has ≥2 entries summing to exactly zero,
--   enforced by a deferred constraint trigger. A bug that loses money becomes
--   an error at COMMIT instead of a slow drift nobody notices until payout.
--
-- WHY `private`
--   Ledger internals are never client-readable. Students see their wallet and
--   their own transaction list through views; they never touch entries. The
--   `private` schema is not in the PostgREST exposed list, so this is enforced
--   by topology, not only by RLS.
--
-- MONEY REPRESENTATION
--   bigint kobo everywhere. No numeric, no float, no exceptions. ₦5,000 =
--   500000 kobo. §04.
--
-- ROLLBACK
--   drop table if exists private.ledger_entries, private.ledger_transactions,
--                        public.payouts, public.bank_accounts,
--                        public.escrow_holds, public.subscriptions,
--                        public.plans, public.wallets cascade;
--   drop function if exists private.post_transaction, private.recompute_wallet;
-- ============================================================================

-- ── 1. Wallets ──────────────────────────────────────────────────────────────
-- One per user, any role. A vendor's "available balance" and a student's
-- top-up balance are the same primitive.
create table if not exists public.wallets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null unique references public.profiles (id) on delete cascade,
  currency       text   not null default 'NGN' check (currency = 'NGN'),
  -- CACHE. Derived from private.ledger_entries. Never write this directly.
  balance_kobo   bigint not null default 0,
  -- Money earned but not yet released from escrow.
  pending_kobo   bigint not null default 0 check (pending_kobo >= 0),
  is_frozen      boolean not null default false,
  frozen_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- ── 2. The ledger ───────────────────────────────────────────────────────────
create table if not exists private.ledger_transactions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in (
                'order_payment', 'order_refund', 'escrow_hold', 'escrow_release',
                'wallet_topup', 'wallet_withdrawal', 'payout', 'commission',
                'delivery_fee', 'subscription_charge', 'adjustment')),
  reference   text unique,
  order_id    uuid references public.orders (id) on delete set null,
  booking_id  uuid references public.bookings (id) on delete set null,
  request_id  uuid references public.service_requests (id) on delete set null,
  narrative   text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists ledger_transactions_order_idx on private.ledger_transactions (order_id);
create index if not exists ledger_transactions_kind_idx  on private.ledger_transactions (kind, created_at desc);
-- One line of a transaction. `amount_kobo` is signed: positive credits the
-- account, negative debits it. Sum over a transaction must be zero.
create table if not exists private.ledger_entries (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references private.ledger_transactions (id) on delete cascade,
  -- Either a user wallet, or one of the platform's internal accounts.
  wallet_id      uuid references public.wallets (id) on delete restrict,
  account        text not null check (account in (
                    'user_wallet', 'platform_revenue', 'platform_escrow',
                    'payment_gateway', 'rider_earnings', 'refunds')),
  amount_kobo    bigint not null,
  created_at     timestamptz not null default now(),

  -- A user_wallet line must name a wallet; an internal account must not.
  constraint ledger_entries_wallet_matches_account check (
    (account = 'user_wallet' and wallet_id is not null) or
    (account <> 'user_wallet' and wallet_id is null)
  )
);
create index if not exists ledger_entries_txn_idx    on private.ledger_entries (transaction_id);
create index if not exists ledger_entries_wallet_idx on private.ledger_entries (wallet_id, created_at desc);
-- ── 3. Balance enforcement ──────────────────────────────────────────────────
-- DEFERRABLE so a transaction can be built line by line and is only checked at
-- COMMIT. A non-deferred check would reject the first line of every legitimate
-- transaction, since one line alone never balances.
create or replace function private.assert_ledger_balanced()
returns trigger language plpgsql as $$
declare
  imbalance bigint;
begin
  select coalesce(sum(amount_kobo), 0) into imbalance
    from private.ledger_entries
   where transaction_id = coalesce(new.transaction_id, old.transaction_id);

  if imbalance <> 0 then
    raise exception
      'ledger transaction % does not balance: % kobo unaccounted for',
      coalesce(new.transaction_id, old.transaction_id), imbalance;
  end if;
  return null;
end;
$$;
drop trigger if exists ledger_entries_balanced on private.ledger_entries;
create constraint trigger ledger_entries_balanced
  after insert or update or delete on private.ledger_entries
  deferrable initially deferred
  for each row execute function private.assert_ledger_balanced();
-- ── 4. Wallet cache maintenance ─────────────────────────────────────────────
create or replace function private.recompute_wallet(p_wallet_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  total bigint;
begin
  select coalesce(sum(e.amount_kobo), 0) into total
    from private.ledger_entries e
   where e.wallet_id = p_wallet_id;

  update public.wallets set balance_kobo = total, updated_at = now()
   where id = p_wallet_id;

  return total;
end;
$$;
comment on function private.recompute_wallet(uuid) is
  'Rebuilds wallets.balance_kobo from the ledger. The ledger is the source of truth; this is reconciliation.';
create or replace function private.sync_wallet_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.wallet_id is not null then
    perform private.recompute_wallet(new.wallet_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.wallet_id is not null
     and old.wallet_id is distinct from new.wallet_id then
    perform private.recompute_wallet(old.wallet_id);
  end if;
  return null;
end;
$$;
drop trigger if exists ledger_entries_sync_wallet on private.ledger_entries;
create trigger ledger_entries_sync_wallet
  after insert or update or delete on private.ledger_entries
  for each row execute function private.sync_wallet_balance();
-- ── 5. The only sanctioned way to move money ────────────────────────────────
-- Takes a whole transaction at once so it can never be half-written. Entries
-- arrive as jsonb: [{"account":"user_wallet","wallet_id":"…","amount_kobo":-5000}, …]
create or replace function private.post_transaction(
  p_kind      text,
  p_narrative text,
  p_entries   jsonb,
  p_reference text default null,
  p_order_id  uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  txn_id uuid;
  entry  jsonb;
  total  bigint := 0;
begin
  if jsonb_array_length(p_entries) < 2 then
    raise exception 'a ledger transaction needs at least two entries, got %',
      jsonb_array_length(p_entries);
  end if;

  -- Fail before writing anything rather than relying on the deferred trigger.
  select sum((e ->> 'amount_kobo')::bigint) into total
    from jsonb_array_elements(p_entries) e;
  if total <> 0 then
    raise exception 'entries do not balance: % kobo', total;
  end if;

  insert into private.ledger_transactions (kind, narrative, reference, order_id, created_by)
  values (p_kind, p_narrative, p_reference, p_order_id, auth.uid())
  returning id into txn_id;

  for entry in select * from jsonb_array_elements(p_entries) loop
    insert into private.ledger_entries (transaction_id, wallet_id, account, amount_kobo)
    values (
      txn_id,
      nullif(entry ->> 'wallet_id', '')::uuid,
      entry ->> 'account',
      (entry ->> 'amount_kobo')::bigint
    );
  end loop;

  return txn_id;
end;
$$;
comment on function private.post_transaction is
  'The ONLY sanctioned way to move money. Balanced or it raises. Service role only.';
-- ── 6. Escrow ───────────────────────────────────────────────────────────────
-- Student pays -> funds sit in platform_escrow -> released to the vendor on
-- delivery, or refunded on dispute. §10.
create table if not exists public.escrow_holds (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references public.orders (id) on delete cascade,
  booking_id   uuid references public.bookings (id) on delete cascade,
  request_id   uuid references public.service_requests (id) on delete cascade,
  payer_id     uuid not null references public.profiles (id) on delete restrict,
  payee_id     uuid not null references public.profiles (id) on delete restrict,
  amount_kobo  bigint not null check (amount_kobo > 0),
  commission_kobo bigint not null default 0 check (commission_kobo >= 0),
  status       text not null default 'held'
                 check (status in ('held', 'released', 'refunded', 'disputed')),
  release_after timestamptz,
  released_at  timestamptz,
  refunded_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Exactly one subject. A hold that belongs to nothing is unreleasable.
  constraint escrow_holds_one_subject check (
    (order_id is not null)::int + (booking_id is not null)::int + (request_id is not null)::int = 1
  )
);
create index if not exists escrow_holds_payee_idx  on public.escrow_holds (payee_id, status);
create index if not exists escrow_holds_due_idx    on public.escrow_holds (release_after)
  where status = 'held';
-- ── 7. Bank accounts & payouts ──────────────────────────────────────────────
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  bank_code      text not null,
  bank_name      text not null,
  account_number text not null,
  account_name   text not null,
  is_default     boolean not null default false,
  -- Set by the Paystack resolve call, never by the client.
  is_verified    boolean not null default false,
  recipient_code text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, bank_code, account_number)
);
create unique index if not exists bank_accounts_one_default_idx
  on public.bank_accounts (owner_id) where is_default;
create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete restrict,
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  amount_kobo     bigint not null check (amount_kobo > 0),
  fee_kobo        bigint not null default 0 check (fee_kobo >= 0),
  status          text not null default 'requested' check (status in
                    ('requested', 'processing', 'paid', 'failed', 'reversed')),
  provider_ref    text unique,
  failure_reason  text,
  requested_at    timestamptz not null default now(),
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists payouts_owner_idx on public.payouts (owner_id, status, requested_at desc);
-- ── 8. Plans & subscriptions ────────────────────────────────────────────────
-- Backs /vendor/plan.
create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  description    text,
  price_kobo     bigint  not null check (price_kobo >= 0),
  interval       text    not null default 'monthly' check (interval in ('monthly', 'yearly')),
  features       jsonb   not null default '[]',
  max_listings   integer,
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
insert into public.plans (code, name, price_kobo, interval, max_listings, sort_order, description) values
  ('free',    'Starter', 0,      'monthly', 10,   1, 'Get listed and start selling.'),
  ('growth',  'Growth',  250000, 'monthly', 100,  2, 'More listings, promotions and analytics.'),
  ('pro',     'Pro',     600000, 'monthly', null, 3, 'Unlimited listings and priority placement.')
on conflict (code) do nothing;
create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendor_profiles (id) on delete cascade,
  plan_id         uuid not null references public.plans (id) on delete restrict,
  status          text not null default 'active' check (status in
                    ('active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null default now() + interval '30 days',
  cancel_at_period_end boolean not null default false,
  provider_ref    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists subscriptions_one_active_idx
  on public.subscriptions (vendor_id) where status in ('active', 'past_due');
-- ── 9. Client-facing wallet transaction view ────────────────────────────────
-- Students and vendors need a statement. They must not read private.* directly,
-- so this view projects only their own lines. security_invoker keeps wallets'
-- RLS in force, and the join to wallets is what scopes it to the caller.
create or replace view public.wallet_transactions
with (security_invoker = true) as
select
  e.id,
  w.owner_id,
  t.kind,
  t.narrative,
  t.reference,
  t.order_id,
  e.amount_kobo,
  case when e.amount_kobo >= 0 then 'in' else 'out' end as direction,
  e.created_at
from private.ledger_entries e
join public.wallets w on w.id = e.wallet_id
join private.ledger_transactions t on t.id = e.transaction_id;
comment on view public.wallet_transactions is
  'Per-user statement projected from the ledger. Mirrors WalletTxn in src/mock/student.ts.';
-- ── 10. Guards ──────────────────────────────────────────────────────────────
-- The balance cache is trigger-maintained. Reject any client attempt to write
-- it outright rather than silently reverting, so a bug surfaces loudly.
create or replace function public.guard_wallet_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.balance_kobo is distinct from old.balance_kobo
       or new.pending_kobo is distinct from old.pending_kobo then
      raise exception 'wallet balances are ledger-derived and cannot be set directly';
    end if;
    new.is_frozen     := old.is_frozen;
    new.frozen_reason := old.frozen_reason;
  end if;
  return new;
end;
$$;
drop trigger if exists wallets_guard on public.wallets;
create trigger wallets_guard
  before update on public.wallets
  for each row execute function public.guard_wallet_cols();
create or replace function public.guard_payout_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.amount_kobo    := old.amount_kobo;
    new.status         := old.status;
    new.provider_ref   := old.provider_ref;
    new.fee_kobo       := old.fee_kobo;
    new.processed_at   := old.processed_at;
  end if;
  return new;
end;
$$;
drop trigger if exists payouts_guard on public.payouts;
create trigger payouts_guard
  before update on public.payouts
  for each row execute function public.guard_payout_cols();
create or replace function public.guard_bank_account_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.is_verified    := old.is_verified;
    new.recipient_code := old.recipient_code;
  end if;
  return new;
end;
$$;
drop trigger if exists bank_accounts_guard on public.bank_accounts;
create trigger bank_accounts_guard
  before update on public.bank_accounts
  for each row execute function public.guard_bank_account_cols();
-- Auto-create a wallet on signup so no code path has to check for its absence.
create or replace function public.ensure_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallets (owner_id) values (new.id) on conflict (owner_id) do nothing;
  return new;
end;
$$;
drop trigger if exists profiles_ensure_wallet on public.profiles;
create trigger profiles_ensure_wallet
  after insert on public.profiles
  for each row execute function public.ensure_wallet();
insert into public.wallets (owner_id)
select p.id from public.profiles p
on conflict (owner_id) do nothing;
-- ── 11. RLS ─────────────────────────────────────────────────────────────────
alter table public.wallets       enable row level security;
alter table public.escrow_holds  enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.payouts       enable row level security;
alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table private.ledger_transactions enable row level security;
alter table private.ledger_entries      enable row level security;
alter table private.ledger_transactions force row level security;
alter table private.ledger_entries      force row level security;
-- No policies on the ledger at all: service role only, by design.

drop policy if exists "wallets_own" on public.wallets;
create policy "wallets_own" on public.wallets
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "escrow_holds_party" on public.escrow_holds;
create policy "escrow_holds_party" on public.escrow_holds
  for select to authenticated using ((select auth.uid()) in (payer_id, payee_id));
drop policy if exists "bank_accounts_own" on public.bank_accounts;
create policy "bank_accounts_own" on public.bank_accounts
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists "payouts_own" on public.payouts;
create policy "payouts_own" on public.payouts
  for select to authenticated using ((select auth.uid()) = owner_id);
-- A vendor requests a payout; the server decides whether it can be paid.
drop policy if exists "payouts_request_own" on public.payouts;
create policy "payouts_request_own" on public.payouts
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and status = 'requested');
drop policy if exists "plans_select" on public.plans;
create policy "plans_select" on public.plans
  for select to anon, authenticated using (is_active);
drop policy if exists "subscriptions_own" on public.subscriptions;
create policy "subscriptions_own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = vendor_id);
drop policy if exists "escrow_holds_staff" on public.escrow_holds;
create policy "escrow_holds_staff" on public.escrow_holds
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "payouts_staff" on public.payouts;
create policy "payouts_staff" on public.payouts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- ── 12. Grants ──────────────────────────────────────────────────────────────
revoke all on public.wallets       from anon, authenticated;
revoke all on public.escrow_holds  from anon, authenticated;
revoke all on public.bank_accounts from anon, authenticated;
revoke all on public.payouts       from anon, authenticated;
revoke all on public.plans         from anon, authenticated;
revoke all on public.subscriptions from anon, authenticated;
grant select                         on public.wallets       to authenticated;
grant update                         on public.wallets       to authenticated;
-- guarded; balances rejected
grant select                         on public.escrow_holds  to authenticated;
grant select, insert, update, delete on public.bank_accounts to authenticated;
grant select, insert                 on public.payouts       to authenticated;
grant select                         on public.plans         to anon, authenticated;
grant select                         on public.subscriptions to authenticated;
grant select                         on public.wallet_transactions to authenticated;
-- post_transaction and recompute_wallet are service-role only. A client that
-- could call post_transaction could mint money.
revoke all on function private.post_transaction(text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function private.recompute_wallet(uuid) from public, anon, authenticated;
grant execute on function private.post_transaction(text, text, jsonb, text, uuid) to service_role;
grant execute on function private.recompute_wallet(uuid) to service_role;
-- ── 13. Verify ──────────────────────────────────────────────────────────────
-- Structural assertions only. An earlier draft of this block posted a real
-- unbalanced transaction to prove the trigger fires, then relied on catching
-- the error to roll it back. That is the wrong trade in a migration that runs
-- against production: a subtransaction that behaves unexpectedly leaves live
-- rows in the ledger, and the ledger is the one table that must never carry
-- test data. The balance trigger is exercised by the pgTAP suite instead
-- (BLUEPRINT §15), where a throwaway database makes it free.
do $$
declare
  wallets_without_owner int;
begin
  -- The deferred balance trigger exists and is actually deferred. A trigger
  -- created NOT DEFERRABLE would reject the first line of every transaction.
  if not exists (
    select 1
      from pg_trigger t
      join pg_class   c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private'
       and c.relname = 'ledger_entries'
       and t.tgname  = 'ledger_entries_balanced'
       and t.tgdeferrable
       and t.tginitdeferred
  ) then
    raise exception
      'ledger_entries_balanced is missing or not deferrable — the ledger is unguarded';
  end if;

  -- No client role can reach the ledger.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'private' and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'the ledger is reachable by a client role';
  end if;

  -- post_transaction must not be callable by a client: anyone who can call it
  -- can mint money.
  if exists (
    select 1
      from information_schema.routine_privileges
     where routine_schema = 'private'
       and routine_name   = 'post_transaction'
       and grantee in ('anon', 'authenticated', 'public')
  ) then
    raise exception 'post_transaction is callable by a client role';
  end if;

  -- Every profile has a wallet, so no code path needs a null check.
  select count(*) into wallets_without_owner
    from public.profiles p
   where not exists (select 1 from public.wallets w where w.owner_id = p.id);

  if wallets_without_owner > 0 then
    raise exception '% profile(s) have no wallet', wallets_without_owner;
  end if;

  raise notice 'money layer ready: double-entry ledger, escrow, payouts, plans.';
end $$;
