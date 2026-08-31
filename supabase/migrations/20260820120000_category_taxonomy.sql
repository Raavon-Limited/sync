-- ============================================================================
-- category_taxonomy
--
-- Turns "what kind of vendor" and "what kind of product" from hardcoded lists
-- into data, so onboarding a clothing vendor is a row rather than a migration.
--
-- WHAT WAS WRONG
--   1. Vendor type was a CHECK constraint - ('landlord','food','beauty',
--      'laundry','tradesman') - duplicated on BOTH `profiles.vendor_category`
--      and `vendor_profiles.category`. Adding a type meant editing two
--      constraints in lockstep and hoping nobody missed one.
--   2. Listing categories existed only in the front end, as a food-shaped
--      constant. A clothing vendor got Rice, Soups and Grills.
--
-- THE MODEL
--   vendor_categories   reference table. One row per kind of business.
--   listing_categories  the product taxonomy, keyed BY vendor category, with
--                       two flavours distinguished by `vendor_id`:
--
--     vendor_id IS NULL  platform category, curated, shared by every vendor of
--                        that type. This is what makes browsing work - "Rice"
--                        means the same thing across every food vendor, so a
--                        shopper can filter the whole marketplace by it.
--     vendor_id SET      that vendor's own category, for the long tail a shared
--                        taxonomy will never cover.
--
--   Both appear in the vendor's picker; only platform ones are worth surfacing
--   as marketplace-wide filters. That split is the standard e-commerce answer:
--   a purely shared taxonomy is too rigid, a purely per-vendor one makes
--   cross-vendor browsing impossible.
--
-- ROLLBACK
--   drop table if exists public.listing_categories cascade;
--   alter table public.listings drop column if exists category_id;
--   -- then restore the two CHECK constraints from 0001 / 20260817090000.
-- ============================================================================

-- ── 1. Vendor categories as data ────────────────────────────────────────────
create table if not exists public.vendor_categories (
  slug        text primary key,
  name        text not null,
  description text,
  -- Drives which onboarding questions and dashboard a vendor gets.
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into public.vendor_categories (slug, name, description, sort_order) values
  ('food',        'Food',            'Meals, snacks and drinks',            1),
  ('clothing',    'Clothing',        'Fashion, thrift and accessories',     2),
  ('beauty',      'Beauty',          'Hair, nails, makeup and grooming',    3),
  ('laundry',     'Laundry',         'Wash, dry-clean and ironing',         4),
  ('tradesman',   'Trades',          'Repairs, carpentry, plumbing',        5),
  ('groceries',   'Groceries',       'Provisions and household items',      6),
  ('electronics', 'Electronics',     'Phones, accessories and repairs',     7),
  ('landlord',    'Hostels',         'Student accommodation',               8)
on conflict (slug) do nothing;
-- ── 2. Swap the CHECK constraints for foreign keys ──────────────────────────
-- A FK means adding a vendor type is an INSERT, and means a typo is rejected
-- with a referential error instead of silently sitting in a text column.
--
-- Every existing value is in the seed above, so this validates without a
-- backfill. `not valid` is deliberately NOT used - if a row somehow does not
-- match, this must fail loudly now rather than at some later write.
alter table public.profiles        drop constraint if exists profiles_vendor_category_check;
alter table public.vendor_profiles drop constraint if exists vendor_profiles_category_check;
alter table public.profiles
  add constraint profiles_vendor_category_fkey
  foreign key (vendor_category) references public.vendor_categories (slug)
  on update cascade on delete restrict;
alter table public.vendor_profiles
  add constraint vendor_profiles_category_fkey
  foreign key (category) references public.vendor_categories (slug)
  on update cascade on delete restrict;
-- ── 3. Listing categories ───────────────────────────────────────────────────
create table if not exists public.listing_categories (
  id              uuid primary key default gen_random_uuid(),
  vendor_category text not null references public.vendor_categories (slug) on update cascade,
  -- NULL = platform category shared by all vendors of this type.
  -- SET  = this vendor's own category.
  vendor_id       uuid references public.vendor_profiles (id) on delete cascade,
  name            text not null,
  slug            text not null,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Two partial uniques rather than one composite: a NULL vendor_id would make a
-- plain UNIQUE useless, because NULL never equals NULL in SQL and every
-- platform category would be free to duplicate.
create unique index if not exists listing_categories_platform_uniq
  on public.listing_categories (vendor_category, slug)
  where vendor_id is null;
create unique index if not exists listing_categories_vendor_uniq
  on public.listing_categories (vendor_id, slug)
  where vendor_id is not null;
create index if not exists listing_categories_lookup_idx
  on public.listing_categories (vendor_category, sort_order)
  where is_active;
-- A vendor may only create categories under their OWN vendor category. RLS
-- checks ownership; it cannot check that the type matches, so this does.
create or replace function public.guard_listing_category_type()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  vcat text;
begin
  if new.vendor_id is null then
    return new;
  end if;

  select v.category into vcat from public.vendor_profiles v where v.id = new.vendor_id;

  if vcat is null then
    raise exception 'vendor % has no storefront', new.vendor_id using errcode = 'P0002';
  end if;

  if vcat <> new.vendor_category then
    raise exception 'a % vendor cannot create a % category', vcat, new.vendor_category
      using errcode = '42501';
  end if;

  return new;
end;
$$;
drop trigger if exists listing_categories_guard_type on public.listing_categories;
create trigger listing_categories_guard_type
  before insert or update on public.listing_categories
  for each row execute function public.guard_listing_category_type();
-- ── 4. Seed the platform taxonomy ───────────────────────────────────────────
-- The food set is exactly what the front end hardcoded, so nothing shifts under
-- existing listings. The rest are starting points an admin can edit.
insert into public.listing_categories (vendor_category, name, slug, sort_order) values
  ('food', 'Rice',        'rice',        1),
  ('food', 'Soups',       'soups',       2),
  ('food', 'Grills',      'grills',      3),
  ('food', 'Snacks',      'snacks',      4),
  ('food', 'Seafood',     'seafood',     5),
  ('food', 'Beans',       'beans',       6),
  ('food', 'Specials',    'specials',    7),

  ('clothing', 'Tops',        'tops',        1),
  ('clothing', 'Bottoms',     'bottoms',     2),
  ('clothing', 'Dresses',     'dresses',     3),
  ('clothing', 'Footwear',    'footwear',    4),
  ('clothing', 'Bags',        'bags',        5),
  ('clothing', 'Accessories', 'accessories', 6),
  ('clothing', 'Thrift',      'thrift',      7),

  ('groceries', 'Provisions', 'provisions', 1),
  ('groceries', 'Drinks',     'drinks',     2),
  ('groceries', 'Toiletries', 'toiletries', 3),
  ('groceries', 'Household',  'household',  4),

  ('electronics', 'Phones',      'phones',      1),
  ('electronics', 'Accessories', 'accessories', 2),
  ('electronics', 'Audio',       'audio',       3),
  ('electronics', 'Repairs',     'repairs',     4),

  ('beauty',    'Hair',      'hair',      1),
  ('beauty',    'Nails',     'nails',     2),
  ('beauty',    'Makeup',    'makeup',    3),
  ('beauty',    'Skincare',  'skincare',  4),

  ('laundry',   'Wash & Fold',  'wash-fold',  1),
  ('laundry',   'Dry Cleaning', 'dry-clean',  2),
  ('laundry',   'Ironing',      'ironing',    3)
on conflict do nothing;
-- ── 5. Link listings to the taxonomy ────────────────────────────────────────
-- `category` (text) stays as a display SNAPSHOT so existing filters and the
-- category index keep working, and so a listing still renders correctly if its
-- category is later renamed or retired. `category_id` is the real link.
alter table public.listings
  add column if not exists category_id uuid references public.listing_categories (id) on delete set null;
create index if not exists listings_category_id_idx on public.listings (category_id);
-- Backfill: match existing free-text categories to the seeded food taxonomy.
update public.listings l
   set category_id = c.id
  from public.listing_categories c
 where c.vendor_id is null
   and c.vendor_category = 'food'
   and lower(c.name) = lower(l.category)
   and l.category_id is null;
-- ── 6. RLS ──────────────────────────────────────────────────────────────────
alter table public.vendor_categories  enable row level security;
alter table public.listing_categories enable row level security;
-- Reference data: world-readable. Shoppers filter by it before signing in.
drop policy if exists "vendor_categories_select" on public.vendor_categories;
create policy "vendor_categories_select" on public.vendor_categories
  for select to anon, authenticated using (is_active);
-- Both platform and vendor categories are publicly readable: a vendor's custom
-- category appears on their storefront, so hiding it would break browsing.
drop policy if exists "listing_categories_select" on public.listing_categories;
create policy "listing_categories_select" on public.listing_categories
  for select to anon, authenticated using (is_active);
-- A vendor manages only their OWN categories. The platform set is staff-only,
-- which is what stops one vendor renaming a category every other vendor filters
-- by.
drop policy if exists "listing_categories_write_own" on public.listing_categories;
create policy "listing_categories_write_own" on public.listing_categories
  for all to authenticated
  using (vendor_id is not null and vendor_id = (select auth.uid()))
  with check (vendor_id is not null and vendor_id = (select auth.uid()));
drop policy if exists "listing_categories_staff" on public.listing_categories;
create policy "listing_categories_staff" on public.listing_categories
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "vendor_categories_staff" on public.vendor_categories;
create policy "vendor_categories_staff" on public.vendor_categories
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.vendor_categories  from anon, authenticated;
revoke all on public.listing_categories from anon, authenticated;
grant select on public.vendor_categories  to anon, authenticated;
grant select on public.listing_categories to anon, authenticated;
grant insert, update, delete on public.listing_categories to authenticated;
-- ── 7. Verify ───────────────────────────────────────────────────────────────
do $$
declare
  orphan_vendors int;
  food_cats      int;
  clothing_cats  int;
begin
  -- Every existing vendor's category resolves. If this fails the FK above would
  -- have already errored, but assert it so the intent is recorded.
  select count(*) into orphan_vendors
    from public.vendor_profiles v
   where not exists (select 1 from public.vendor_categories c where c.slug = v.category);

  if orphan_vendors > 0 then
    raise exception '% vendor(s) reference an unknown category', orphan_vendors;
  end if;

  select count(*) into food_cats
    from public.listing_categories where vendor_category = 'food' and vendor_id is null;
  select count(*) into clothing_cats
    from public.listing_categories where vendor_category = 'clothing' and vendor_id is null;

  if food_cats = 0 or clothing_cats = 0 then
    raise exception 'platform taxonomy did not seed (food=%, clothing=%)', food_cats, clothing_cats;
  end if;

  -- A vendor must not be able to edit the shared taxonomy.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'listing_categories'
       and policyname = 'listing_categories_write_own'
       and qual not like '%vendor_id%'
  ) then
    raise exception 'the vendor write policy does not scope to vendor_id';
  end if;

  raise notice 'taxonomy ready: % vendor types, % platform categories.',
    (select count(*) from public.vendor_categories),
    (select count(*) from public.listing_categories where vendor_id is null);
end $$;
