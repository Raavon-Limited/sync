-- ============================================================================
-- promotion_targets
--
-- Lets a promotion target a specific listing.
--
-- WHY A FOREIGN KEY AND NOT JUST THE NAME
--   The promotions form previously took a free-text "campaign name". To run a
--   campaign ON a product, the row has to reference the product: a name alone
--   cannot be joined, breaks the moment the vendor renames the listing, and
--   gives the analytics no way to attribute sales back to what was promoted.
--
-- NULLABLE ON PURPOSE
--   `listing_id is null` means a STORE-WIDE promotion, which is what every
--   existing row is and what a coupon campaign usually wants. Making it NOT NULL
--   would invalidate promotions that are legitimately not about one product.
--
-- THE OWNERSHIP HOLE THIS ALSO CLOSES
--   `promotions_write_own` checks `vendor_id = auth.uid()` - it says nothing
--   about the listing. Without the trigger below, a vendor could insert a
--   promotion against ANOTHER vendor's listing_id: their own row, someone
--   else's product. RLS cannot express that constraint because it spans two
--   tables, so it is enforced where it can be.
--
-- ROLLBACK
--   alter table public.promotions drop column if exists listing_id;
--   drop function if exists public.guard_promotion_listing_owner() cascade;
-- ============================================================================

alter table public.promotions
  add column if not exists listing_id uuid references public.listings (id) on delete cascade;

comment on column public.promotions.listing_id is
  'Listing this campaign promotes. NULL = store-wide. Ownership enforced by trigger.';

create index if not exists promotions_listing_idx
  on public.promotions (listing_id) where listing_id is not null;

-- ── A vendor may only promote their own listing ─────────────────────────────
create or replace function public.guard_promotion_listing_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if new.listing_id is null then
    return new;
  end if;

  select l.vendor_id into owner from public.listings l where l.id = new.listing_id;

  if owner is null then
    raise exception 'listing % does not exist', new.listing_id using errcode = 'P0002';
  end if;

  -- SECURITY DEFINER so this can read a listing regardless of who is calling;
  -- the check itself is what makes that safe.
  if owner <> new.vendor_id then
    raise exception 'a promotion can only target your own listing'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists promotions_guard_listing_owner on public.promotions;
create trigger promotions_guard_listing_owner
  before insert or update on public.promotions
  for each row execute function public.guard_promotion_listing_owner();

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'promotions' and column_name = 'listing_id'
  ) then
    raise exception 'promotions.listing_id was not created';
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'promotions' and t.tgname = 'promotions_guard_listing_owner'
  ) then
    raise exception 'the listing-ownership guard is missing; cross-vendor targeting is possible';
  end if;

  raise notice 'promotions can target listings; ownership enforced.';
end $$;
