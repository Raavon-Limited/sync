# modules/storefronts

One vendor account is one **storefront** — the business as a whole, with its
name, logo, verification, rating, wallet and subscription. A storefront trades
from one or more **stores**: physical locations, each with its own address,
hours and open/closed switch.

> ## Read this before reading any SQL
>
> **The table named `storefronts` holds STORES.** It was written before the
> vocabulary settled and it is the location table, not the business table. The
> mapping, once:
>
> | You say        | It is                | In the database                    |
> | -------------- | -------------------- | ---------------------------------- |
> | **storefront** | the business / brand | `public.vendor_profiles` (one row) |
> | **store**      | one location         | `public.storefronts` (many rows)   |
>
> Everything spelled `storefront_id`, `storefront_staff`, `storefront_invites`,
> `can_manage_storefront`, `nearby_storefronts`, `storefront_activity` refers to
> a **store**. The name was left alone deliberately: renaming it touches 16
> migrations and 94 uses of `storefront_id` across live RLS policies, which is a
> lot of risk to buy a word. The user-facing product says *store* everywhere.

## Files
- `queries.ts` - Data fetching, used by both the hooks and RSC pages.
- `hooks.ts` - React Query hooks for client islands.
- `types.ts` - Domain types specific to this module.
- `active-storefront.tsx` - Which store the vendor is currently working in.

## The model

```
profiles (the person, = auth.uid())
  └── vendor_profiles  = the STOREFRONT   one per account. name, logo, rating,
        │                                 verification, wallet, subscription
        └── storefronts = the STORES      many per storefront. area, geo, hours,
              │           (yes, really)   is_accepting_orders, is_primary
              ├── listings                what THIS store sells
              ├── carts                   one open cart per (student, store)
              └── orders                  which store physically fulfils
```

## `vendor_id` vs `storefront_id`

This is the distinction the whole module exists to make, and getting it backwards
is the most likely bug in anything built on top:

- **`vendor_id` = who owns it and who gets paid.** Points at `profiles.id` on
  `listings` and `orders`, at `vendor_profiles.id` everywhere else. Those are the
  same uuid, because `vendor_profiles.id references profiles.id`.
- **`storefront_id` = where it physically happens.** Always points at
  `storefronts.id`.

The schema used `vendor_id` for both meanings before stores existed and got
away with it, because one account had exactly one location. Multi-store is what
pulls them apart. The `20260822090000_storefronts` migration **repoints nothing**
— it only adds `storefront_id` — so every existing RLS policy written as
`auth.uid() = vendor_id` keeps working, and an owner automatically reaches all of
their stores.

## Rules

- **Money is per storefront, fulfilment is per store.** Wallet, payouts, bank
  accounts, subscriptions, verification and `listing_categories` stay on
  `vendor_profiles`. Do not add a wallet to a storefront; per-store *reporting*
  is a `group by storefront_id`, not a second ledger.
- **The catalogue is per storefront; price and stock are per store.** A
  `listings` row is something the BUSINESS sells. `storefront_listings` says
  which stores carry it, at what price and with how much stock
  (`20260829090000`). Renaming a dish or changing its photo is one edit that
  reaches every store; the price at Tanke and the price at Gaa Akanbi stay
  independent.
  - `storefront_listings.price_kobo` is **nullable, and null means inherit**.
    Copying the catalogue price into each store would mean a price change
    silently failing to reach every store that never overrode it.
  - `public.store_price(store, listing)` is the only definition of the
    fallback. Checkout, the storefront page and the cart all call it.
  - `listings.storefront_id` still exists and now means *where this item was
    created* — its home store. It is not what makes an item available; it
    feeds `sync_listing_vendor_to_storefront`, which is what stops staff
    writing a listing into another storefront.
- **A cart belongs to a store.** `carts_one_open_per_storefront_idx` enforces
  one open cart per `(student_id, storefront_id)`. Ordering from two stores of
  the same storefront is two carts; merging them would let a student buy stock that
  one location does not have.
- **Exactly one store is primary.** `storefronts_one_primary_idx` enforces it.
  A link to the storefront resolves to the primary store.
- **Two permission questions, two functions. Do not confuse them.**
  - `private.owns_storefront(storefront, user)` — *do you own this storefront?*
    Governs the things only an owner may do: creating and deleting stores,
    promoting a primary, hiring and firing, reading the activity log.
  - `private.can_manage_storefront(storefront, user)` — *may you work this
    store?* True for the owner **or** active staff. Governs listings, stock and
    the order queue.

  Both are `SECURITY DEFINER`, so a policy can ask without the caller needing
  read access to rows they do not own — and so the policy on `storefront_staff`
  can consult `storefront_staff` without recursing. Widen permissions inside
  these functions, never by editing individual policies.

## Discovery is location-first

Students see stores near them, not whole storefronts. `storefronts.geo` is a PostGIS
`geography(Point, 4326)` with a GiST index, alongside `area` (matching
`public.areas`) and `campus_id`.

Prefer **ranking by distance over filtering by boundary**. A hard area filter
means a student a few hundred metres past an arbitrary line sees an empty app;
sorting by distance degrades gracefully and needs no correct boundaries.

## Staff and invitations

A vendor invites someone to run one store. Membership is per **store**:
"manage my Tanke shop" must not also mean "manage my Gaa Akanbi shop".

```
storefront_staff    storefront_id + user_id + role, revoked_at (never deleted)
storefront_invites  targets an EMAIL, single-use token, 7-day expiry
```

**Staff reach fulfilment, never money.** Listings, stock, orders, their store's
trading hours, its messages: yes. Wallet, payouts, bank accounts, subscription:
owner only. That boundary is structural — money lives on `vendor_profiles` (the
storefront) and fulfilment on `storefronts` (the store), so widening store
permissions cannot reach the money tables. Keep it that way.

Other invariants, each enforced rather than assumed:

- **`private.can_manage_storefront()` is the only definition of "may manage".**
  `listings_write_own`, `orders_update_vendor` and `orders_select_own` all
  consult it. Widen permissions there, never by editing individual policies.
- **Only the owner hires and fires.** A manager inviting managers is how an
  owner loses track of who has access.
- **Invites are never readable.** The token *is* the credential; there is no
  SELECT policy exposing it. `create_storefront_invite()` returns it once.
  Redemption matches the caller's **confirmed** email — an unverified address
  cannot claim someone else's invite.
- **Revoke, never delete.** `revoked_at` keeps the activity trail resolvable.
- **`guard_storefront_privileged_cols`** silently restores `vendor_id`,
  `is_primary`, `slug` and `archived_at` for non-owners, so staff can edit
  trading details and nothing structural.
- **`sync_listing_vendor_to_storefront`** derives `listings.vendor_id` from the
  store. Without it, staff permitted to write for their store could set
  `vendor_id` to another storefront and produce a row that satisfies every policy and
  foreign key while being nonsense.

### Use `useManagedStorefronts`, not `useMyStorefronts`

`useMyStorefronts` filters on ownership. An invited manager owns nothing, so it
returns an empty store switcher for them. `useManagedStorefronts` returns owned
**and** staffed stores, each tagged `capacity: 'owner' | 'staff'`.

## Transparency

`private.audit_log` existed since `20260816225649` and nothing ever wrote to it.
Staff are what make it necessary: once someone else changes your stock, "what
happened at Tanke today" has to come from data rather than trust.

Triggers on `listings`, `orders` and `storefronts` record actor, action and
before/after images, tagged `owner` or `staff`. Order updates log **status
transitions only** — logging every UPDATE buries the meaningful events. Rows
with no resolvable store are skipped rather than written unfilterable.

`storefront_activity()` is **owner-scoped**. Staff cannot read it by design: it
is the record of what they did, and someone who can read it can see what has
been noticed. It also records *attempted* privileged changes — the column guard
reverts them, but the attempt still lands in the log.

`storefront_roster()` exists because the owner otherwise cannot see their own
staff by name: `storefront_staff` holds `user_id`, and `profiles` is
own-row-only, so a plain join returns UUIDs. It returns the email too, which is
safe precisely because it is owner-scoped and the owner supplied that address
when inviting.

## Not in scope yet

- **Promotions are still storefront-level.** `promotions.vendor_id` points at
  `vendor_profiles`. Boosting a single store in a single area probably wants
  `storefront_id`, but that is a separate migration.
- **Messaging routes to the owner.** `open_listing_conversation` resolves the
  vendor from `listings.vendor_id`, so a message about a store's item reaches
  the owner. Owner-receives-all with a store filter is the intended v1; routing
  to a store requires the staff model above.
- **The public location feed.** `activity_log` is a *personal* history keyed by
  `user_id`. A public "what is happening in other areas" feed is a different
  table with a different privacy model — do not overload `activity_log` for it.

## Conventions
- This module never imports from other `modules/*` directly - cross-module composition happens in pages or in `components/shared`.
- Authorization belongs in Supabase RLS; this module's checks are UX, not security.
