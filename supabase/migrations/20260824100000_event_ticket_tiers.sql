-- ============================================================================
-- event_ticket_tiers
--
-- WHAT WAS MISSING
--   `events` holds a name, venue and start time. `tickets` holds what somebody
--   ALREADY BOUGHT — its `tier` and `price_kobo` are snapshots on an issued
--   ticket. Nothing described what an event SELLS: no tier names, no prices, no
--   capacity. So an event page could show when and where, and nothing about how
--   to attend or what it costs.
--
--   The UI already assumed this existed — src/lib/event.ts carries a
--   `tickets: Ticket[]` array of tiers with names and prices, entirely
--   hardcoded, because there was nowhere to read it from.
--
-- WHAT THIS DELIBERATELY DOES NOT ADD
--   A purchase RPC. Issuing a ticket means taking money, and payment
--   verification lives in the Paystack webhook — the same pattern bookings use,
--   where `paid_at` is set by the webhook and never by a client. An RPC that
--   inserted a ticket on request would hand out free tickets to anyone who
--   could call it, so `tickets` keeps its read-only-to-clients posture and
--   purchase waits for the payment path.
--
--   The catalogue is still worth having now: it is what the event page needs to
--   DISPLAY, and displaying a price is not selling one.
--
-- CAPACITY IS NULLABLE ON PURPOSE
--   `quantity is null` means uncapped — a free campus talk with no door limit
--   is a real case, and forcing a number there would make somebody invent one.
--
-- ROLLBACK
--   alter table public.events drop column if exists cover_url,
--     drop column if exists category, drop column if exists description;
--   drop table if exists public.event_ticket_tiers cascade;
-- ============================================================================

-- 1. Fields the event page needs and could not read ---------------------------
alter table public.events
  add column if not exists cover_url   text,
  add column if not exists category    text,
  add column if not exists description text;
-- 2. What an event sells ------------------------------------------------------
create table if not exists public.event_ticket_tiers (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null,
  description text,
  price_kobo  bigint not null check (price_kobo >= 0),
  -- null = uncapped. See the header.
  quantity    integer check (quantity is null or quantity >= 0),
  -- Maintained when a ticket is issued, never written by a client.
  sold        integer not null default 0 check (sold >= 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Two tiers called "Regular" on one event is a data-entry mistake, not a
  -- feature.
  unique (event_id, name)
);
create index if not exists event_ticket_tiers_event_idx
  on public.event_ticket_tiers (event_id, sort_order) where is_active;
-- 3. Keep `sold` honest -------------------------------------------------------
-- Derived from the tickets actually issued rather than incremented by whoever
-- remembers to. A refunded ticket frees its seat again.
create or replace function public.sync_tier_sold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_event uuid;
  v_tier  text;
begin
  v_event := coalesce(new.event_id, old.event_id);
  v_tier  := coalesce(new.tier, old.tier);
  if v_tier is null then
    return coalesce(new, old);
  end if;

  update public.event_ticket_tiers t
     set sold = (
           select count(*) from public.tickets k
            where k.event_id = v_event
              and k.tier = t.name
              and k.status <> 'refunded'
         ),
         updated_at = now()
   where t.event_id = v_event and t.name = v_tier;

  return coalesce(new, old);
end;
$fn$;
drop trigger if exists tickets_sync_tier_sold on public.tickets;
create trigger tickets_sync_tier_sold
  after insert or update of status or delete on public.tickets
  for each row execute function public.sync_tier_sold();
-- 4. RLS ----------------------------------------------------------------------
alter table public.event_ticket_tiers enable row level security;
-- Anyone may see what an event sells; that is the point of a listing.
drop policy if exists "event_tiers_select_public" on public.event_ticket_tiers;
create policy "event_tiers_select_public" on public.event_ticket_tiers
  for select to anon, authenticated
  using (is_active);
-- Only the organiser edits their own tiers.
drop policy if exists "event_tiers_write_organizer" on public.event_ticket_tiers;
create policy "event_tiers_write_organizer" on public.event_ticket_tiers
  for all to authenticated
  using (
    exists (select 1 from public.events e
             where e.id = event_id and e.organizer_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.events e
             where e.id = event_id and e.organizer_id = (select auth.uid()))
  );
drop policy if exists "event_tiers_staff" on public.event_ticket_tiers;
create policy "event_tiers_staff" on public.event_ticket_tiers
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
revoke all on public.event_ticket_tiers from anon, authenticated;
grant select                 on public.event_ticket_tiers to anon, authenticated;
grant insert, update, delete on public.event_ticket_tiers to authenticated;
-- 5. `sold` is derived, so refuse client writes to it -------------------------
-- Loud rather than silent: a client trying to set it has a bug worth surfacing.
create or replace function public.guard_tier_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and new.sold is distinct from old.sold then
    raise exception 'event_ticket_tiers.sold is derived from issued tickets and cannot be set directly';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists event_tiers_guard on public.event_ticket_tiers;
create trigger event_tiers_guard
  before update on public.event_ticket_tiers
  for each row execute function public.guard_tier_cols();
