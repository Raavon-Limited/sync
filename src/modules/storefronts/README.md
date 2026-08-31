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
  A link to the storefront resolves to the primary store. The index permits
  *zero*, so anything that clears the flag has to hand it on — see
  `set_storefront_archived`.

- **The backlog limit is on by default, and 0 is off.**
  `auto_pause_after` shipped nullable and null-by-default, which meant the
  feature existed and protected nobody. Since `20260901090000` it is NOT NULL,
  defaults to `DEFAULT_AUTO_PAUSE_AFTER` (5), and `0` is the explicit "never".
  Null is no longer a value — `updateStorefront` normalises it to 0 so a UI
  sending null for an empty field does not hit a constraint.

  **An automatic pause ends when the kitchen catches up, not when a timer
  fires.** `sync_store_backlog_pause` runs on every order status change: under
  the limit clears the pause immediately, still over it rolls `paused_until`
  forward. `auto_pause_minutes` survives as the floor under a store where
  *nothing* moves — Postgres has no timer, so without a deadline a vendor who
  walks away from four open tickets has a shop that is shut until someone
  notices. Draining is the normal exit; the clock is what stops a bug becoming
  a closed shop. Manual pauses are never touched by the drain: a vendor who
  tapped "15 minutes" is having a break, and finishing an order is not them
  asking to be reopened.
- **Three permission questions, three functions. Do not confuse them.**
  - `private.owns_storefront(storefront, user)` — *do you own this storefront?*
    Governs the things only an owner may do: creating, archiving and deleting
    stores, promoting a primary, hiring and firing, reading the activity log.
  - `private.can_manage_storefront(storefront, user)` — *may you work this
    store at all?* True for the owner **or** any active staff. Still the right
    question for anything that is not one section of the product.
  - `private.storefront_scope(storefront, user, scope)` — *may you work THIS
    PART of this store?* True for the owner, or for staff granted that scope.
    This is what the write policies ask (`20260901090000`): `listings` for
    `listings_write_own`, `orders` for `orders_select_own` /
    `orders_update_vendor` and for `pause_store`, `store` for
    `storefronts_update_staff`.

  All three are `SECURITY DEFINER`, so a policy can ask without the caller
  needing read access to rows they do not own — and so the policy on
  `storefront_staff` can consult `storefront_staff` without recursing. Widen
  permissions inside these functions, never by editing individual policies.

- **Archiving goes through `set_storefront_archived(store, bool)`, never a
  column write.** It refuses to archive a store with unfinished orders, refuses
  to archive the vendor's last open store, and hands the primary flag to
  another store on the way out — `storefronts_one_primary_idx` permits *zero*
  primaries, so a plain `update ... set archived_at = now(), is_primary = false`
  could leave a business whose public link resolves to nothing. Students never
  see an archived store: `storefronts_select_public` is
  `using (archived_at is null)`, so it drops out of discovery, out of
  `nearby_storefronts` and out of its own page with no extra filtering.

- **A second store needs a verified business.** `guard_storefront_insert`
  refuses an INSERT when the vendor already has an active store and
  `vendor_profiles.verification_status <> 'verified'`. The FIRST store is never
  blocked — onboarding could not complete otherwise. The guard is deliberately
  *invoker-rights*, like `guard_storefront_privileged_cols`: a SECURITY DEFINER
  trigger reports `current_user` as its owner, so the "is this a client call?"
  test would never match and the guard would pass everything.

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
storefront_staff    storefront_id + user_id + role + scopes, revoked_at (never deleted)
storefront_invites  targets an EMAIL, single-use token, 7-day expiry, carries scopes
```

**Staff reach fulfilment, never money.** Listings, stock, orders, their store's
trading hours, its messages: yes. Wallet, payouts, bank accounts, subscription:
owner only. That boundary is structural — money lives on `vendor_profiles` (the
storefront) and fulfilment on `storefronts` (the store), so widening store
permissions cannot reach the money tables. Keep it that way.

### Scopes

Membership used to be all-or-nothing: inviting somebody to work the Saturday
rush also handed them the menu and the prices. `storefront_staff.scopes` is a
`text[]` naming the sections that person may work, checked by
`private.storefront_scope()` above and mirrored in `STAFF_SCOPES` in
`./types.ts`.

| scope        | governs                                  | scoped to        | enforced by RLS    |
| ------------ | ---------------------------------------- | ---------------- | ------------------ |
| `orders`     | the queue, order status, `pause_store`   | the store        | yes                |
| `listings`   | `listings` and `storefront_listings`     | the store        | yes                |
| `inbox`      | customer messages                        | the store        | **no — see below** |
| `store`      | trading hours, area, pin, capacity limit | the store        | yes                |
| `promotions` | discount campaigns                       | **the business** | yes                |

**`promotions` is the one scope that is not per store, and that is a property of
the schema, not a shortcut.** `promotions.vendor_id` references
`vendor_profiles`, so a campaign belongs to the business and there is no such
thing as a Tanke-only discount. Granting it at one store therefore lets that
person create a discount every store honours — the picker says "all your
stores" on that row for exactly this reason. It is answered by
`private.business_scope(vendor, user, scope)` (added in `20260901120000`, a
separate migration because `20260901090000` had already run), the brand-level
sibling of `storefront_scope`. **Nothing money-shaped may ever consult that
function**:
wallets, payouts, bank accounts and the subscription are brand-wide too, and
the boundary that keeps them safe is that no store-derived grant reaches them.
`business_scope` is store-derived. It stops at promotions.

`inbox` is recorded but opens nothing yet, and both the type and the UI say so
out loud. `open_listing_conversation` resolves the vendor from
`listings.vendor_id` and a conversation carries no `storefront_id`, so there is
nothing to scope against — widening it to "every conversation of the owner"
would hand one store's manager every store's messages. The grant exists so it
is already in place when messaging becomes store-routed. Do not quietly make it
look enforced before it is.

Adding a scope means: the name in `private.storefront_scope_names()`, the CHECK
constraints on both tables, `STAFF_SCOPES` in `./types.ts`, and the policy that
consults it. The two RPCs that write scopes — `create_storefront_invite` and
`set_storefront_staff_scopes` — validate against the function, so a typo is
refused rather than stored.

Other invariants, each enforced rather than assumed:

- **`private.can_manage_storefront()` is the only definition of "may manage".**
  `listings_write_own`, `orders_update_vendor` and `orders_select_own` all
  consult it. Widen permissions there, never by editing individual policies.
- **Only the owner hires, fires and re-scopes.** A manager inviting managers is
  how an owner loses track of who has access.
- **A member always has at least one scope.** Both RPCs refuse an empty array
  and the CHECK constraints enforce `cardinality(scopes) > 0`. Somebody who can
  sign in and do nothing reads as broken, not as revoked — revoking is the way
  to take everything away.
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
