-- ============================================================================
-- shared_catalogue
--
-- VOCABULARY (see src/modules/storefronts/README.md)
--   storefront = the business  = public.vendor_profiles
--   store      = one location  = public.storefronts  (legacy table name)
--
-- WHAT CHANGES
--   The catalogue moves from the store to the storefront. A `listings` row is
--   now something the BUSINESS sells; `storefront_listings` says which STORES
--   carry it, at what price, with how much stock.
--
--   Before: adding jollof rice to three stores meant three `listings` rows,
--   edited three times, each with its own name, photo and description to keep
--   in step. The catalogue was a per-store thing and the vendor did the
--   reconciling by hand.
--
--   After: one catalogue row, three `storefront_listings` rows. Renaming the
--   dish or replacing its photo is one edit. Price and stock stay per store,
--   because those genuinely differ by location   which was the right half of
--   the original design and is kept.
--
-- 20260822090000 ARGUED FOR THE OPPOSITE, DELIBERATELY
--   "Per-store was chosen because campus vendors genuinely price and stock
--   differently by location, and because splitting a shared catalogue apart
--   later is far harder than consolidating independent ones."
--   The first clause survives: price and stock are still per store. The second
--   is why this migration is safe to write now   consolidating is the easy
--   direction, and it is the one we are going in.
--
-- NOTHING IS MERGED
--   The obvious move is to collapse rows with the same (vendor_id, name) into
--   one catalogue item. This migration does NOT do that. Two stores that both
--   sell "Jollof Rice" today keep two catalogue rows, each carried by the one
--   store that had it. Merging is lossy and irreversible   different photos,
--   different descriptions, different `sold` counts   and it cannot be
--   distinguished from two genuinely different dishes with the same name. The
--   vendor consolidates from the UI, where they can see what they are merging.
--   What this migration buys is the CAPABILITY: from now on, one item can be
--   carried by many stores.
--
-- listings.storefront_id IS KEPT, AND DEMOTED
--   It stays NOT NULL and now means "the store this item was created at"   its
--   home. Availability is `storefront_listings`. Dropping the column would
--   break `sync_listing_vendor_to_storefront`, which derives `vendor_id` from
--   it and is the thing stopping staff writing a listing into another
--   storefront. That guard is load-bearing; the column stays to feed it.
--
-- PRICE RESOLUTION IS A FALLBACK, NOT A COPY
--   `storefront_listings.price_kobo` is nullable and null means "use the
--   catalogue price". Copying the price into every store would mean a price
--   change silently failing to reach the stores that never overrode it.
--
-- ROLLBACK
--   drop function if exists public.store_price(uuid, uuid);
--   drop table if exists public.storefront_listings cascade;
--   (and re-run 20260822120000 to restore the previous checkout_cart)
-- ============================================================================

-- 1. Which stores carry which catalogue items -------------------------------
create table if not exists public.storefront_listings (
  storefront_id uuid not null references public.storefronts (id) on delete cascade,
  listing_id    uuid not null references public.listings    (id) on delete cascade,

  -- null = inherit listings.price_kobo. See the note above: a copy would rot.
  price_kobo    bigint check (price_kobo >= 0),

  -- NULL MEANS UNTRACKED, 0 MEANS SOLD OUT. Most campus kitchens cook to
  -- order and do not count portions; forcing them to would empty their menu
  -- the first day they forgot to top the number up. `listings.stock` is
  -- `not null default 0`, which combined with the editor defaulting the field
  -- to 0 means every listing created without touching it is born unbuyable  
  -- visible on the menu, addable to a cart, and refused at the Pay button.
  -- This column is nullable so that the common case (we just cook it) has a
  -- representation, and 0 can mean what it says.
  stock         integer check (stock is null or stock >= 0),

  -- A store can stop carrying an item without losing its price and stock
  -- history, and without the vendor deleting it from the catalogue. This is
  -- the manual "not today"; stock = 0 is "we ran out".
  is_listed     boolean not null default true,

  -- ONE DEFINITION OF AVAILABLE, IN THE SCHEMA.
  -- Generated rather than written by a trigger, and stored rather than
  -- computed per read, so it can be indexed and cannot drift from the two
  -- columns it is derived from. Every reader filters on this; nobody
  -- re-implements `is_listed and (stock is null or stock > 0)` in a query.
  is_available  boolean generated always as
                  (is_listed and (stock is null or stock > 0)) stored,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (storefront_id, listing_id)
);

create index if not exists storefront_listings_listing_idx
  on public.storefront_listings (listing_id);
-- The student-facing query: what does THIS store sell right now.
create index if not exists storefront_listings_available_idx
  on public.storefront_listings (storefront_id) where is_available;

-- 2. Backfill: every existing listing is carried by its home store -----------
--    Price is left null (inherit) rather than copied, per the note above.
--
--    STOCK 0 BECOMES NULL, NOT 0. `listings.stock` defaults to 0 and the
--    listing editor defaults the field to 0, so almost every existing 0 means
--    "nobody ever set this", not "we sold out". Carrying those across as a
--    literal 0 would mark most of the platform's menu sold out the moment this
--    migration ran. A vendor who genuinely is sold out re-marks it in one tap;
--    a vendor whose whole menu vanished has no idea why.
insert into public.storefront_listings (storefront_id, listing_id, stock, is_listed)
select l.storefront_id,
       l.id,
       nullif(coalesce(l.stock, 0), 0),
       l.status = 'Active'
  from public.listings l
 where l.storefront_id is not null
on conflict (storefront_id, listing_id) do nothing;

-- 3. Price resolution, in one place ------------------------------------------
--    Every caller that needs "what does this item cost at this store" asks
--    here, so the fallback rule cannot be implemented differently twice.
create or replace function public.store_price(p_storefront_id uuid, p_listing_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(
           (select sl.price_kobo
              from public.storefront_listings sl
             where sl.storefront_id = p_storefront_id
               and sl.listing_id    = p_listing_id),
           (select l.price_kobo from public.listings l where l.id = p_listing_id)
         );
$$;

grant execute on function public.store_price(uuid, uuid) to anon, authenticated, service_role;

comment on function public.store_price(uuid, uuid) is
  'Price of a catalogue item at one store: the store override if set, else the catalogue price. One definition of the fallback so two callers cannot disagree.';

-- 4. RLS ---------------------------------------------------------------------
alter table public.storefront_listings enable row level security;

-- Readable by anyone who can already see the store and the item; this table
-- adds no new disclosure, it only says where something is sold.
drop policy if exists "storefront_listings_select_public" on public.storefront_listings;
create policy "storefront_listings_select_public" on public.storefront_listings
  for select to anon, authenticated using (true);

-- Written by whoever may work that store   the same predicate as listings, so
-- widening `can_manage_storefront` widens both together and neither drifts.
drop policy if exists "storefront_listings_write_manager" on public.storefront_listings;
create policy "storefront_listings_write_manager" on public.storefront_listings
  for all to authenticated
  using (private.can_manage_storefront(storefront_id, (select auth.uid())))
  with check (private.can_manage_storefront(storefront_id, (select auth.uid())));

revoke all on public.storefront_listings from anon, authenticated;
grant select                         on public.storefront_listings to anon, authenticated;
grant insert, update, delete         on public.storefront_listings to authenticated;

-- 5. A listing is always carried by its home store ---------------------------
--    Without this, an item created through the normal listings path would be
--    in the catalogue and sold nowhere, which looks exactly like a bug in the
--    storefront page.
create or replace function public.carry_listing_at_home_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.storefront_id is not null then
    -- Same 0 -> null reading as the backfill: a new listing whose stock field
    -- was left alone is untracked, not sold out.
    insert into public.storefront_listings (storefront_id, listing_id, stock, is_listed)
    values (new.storefront_id, new.id, nullif(coalesce(new.stock, 0), 0), new.status = 'Active')
    on conflict (storefront_id, listing_id) do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists listings_carry_at_home_store on public.listings;
create trigger listings_carry_at_home_store
  after insert on public.listings
  for each row execute function public.carry_listing_at_home_store();

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
declare
  v_orphans integer;
begin
  select count(*) into v_orphans
    from public.listings l
   where l.storefront_id is not null
     and not exists (
       select 1 from public.storefront_listings sl
        where sl.listing_id = l.id and sl.storefront_id = l.storefront_id
     );

  if v_orphans > 0 then
    raise exception 'backfill missed % listing(s)', v_orphans;
  end if;
end $$;
