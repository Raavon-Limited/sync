# Backend Connection Plan

How every screen in Sync gets wired to real data. Derived from a full read of the
codebase as of `main` @ `bec245f`.

**Short version:** the architecture is fully scaffolded and one vertical slice
(`profile`) is built end-to-end. Auth, payments plumbing, and verification are
real. *Every other domain is a stub or reads from `src/mock/`.* The work is
mostly repeating one proven pattern 11 more times.

---

## 1. The two data paths

There are exactly two legal ways to reach the database. Anything else is a bug.

### Path A   Server (RSC pages + Server Actions)

```
RSC page  ──▶ modules/<domain>/queries.ts  ──▶ lib/supabase/server.createClient()
<form>    ──▶ modules/<domain>/actions.ts  ──▶ lib/supabase/server.createClient()
```

- `queries.ts` is `import 'server-only'`   reads for RSC pages.
- `actions.ts` is `'use server'`   writes. Must re-validate input with a zod
  schema from `@/lib/validations` and return a typed result, never throw raw.
- RLS is the real authorization layer; these return only what the caller may see.

### Path B   Client (interactive components)

```
client component ──▶ RTK Query (store/api/*) ──▶ /api/<route>/route.ts ──▶ supabase/server
```

The rule from [base-api.ts](src/store/api/base-api.ts): **all client-side
reads/writes go through our own `/api` route handlers   never Supabase
directly.** That keeps the schema and the service-role key out of the browser,
lets route handlers whitelist writable fields, and keeps RLS as defence in depth.

> `lib/supabase/client.ts` exists for browser auth only. Do not use it to query
> domain tables.

### The reference implementation

Copy this slice for every new domain   it is the only complete one:

| Layer | File |
| --- | --- |
| Route handler | [src/app/api/profile/route.ts](src/app/api/profile/route.ts) |
| RTK Query slice | [src/store/api/profile-api.ts](src/store/api/profile-api.ts) |
| Server queries | [src/modules/auth/queries.ts](src/modules/auth/queries.ts) |

Note the three things `/api/profile` does that every handler must repeat:
`getUser()` (network-verified, never `getSession()`), scope every query to
`user.id`, and whitelist updatable columns (`UPDATABLE`) so a crafted request
can't touch `role` / `verification_status`.

---

## 2. Current state

### Built and real

| Area | Files |
| --- | --- |
| Auth (signup/login/logout/reset) | `modules/auth/actions.ts` (10.8 KB), `queries.ts` |
| Account archive/delete | `modules/account/actions.ts` |
| Identity verification | `modules/verification/actions.ts` |
| Profile read/write | `api/profile`, `store/api/profile-api.ts` |
| Paystack client/server | `lib/paystack/*` |
| Security | `lib/security/{headers,mask,rate-limit,sanitize}.ts` |
| Session refresh + role gate | `src/proxy.ts`, `lib/supabase/middleware.ts` |

### Stubs   every one is `export {}` with a TODO

`around` · `beauty` · `events` · `food` · `hostels` · `hotspots` · `laundry` ·
`messaging` · `payments` · `vendor` · `workmanship` (both `actions.ts` and
`queries.ts`), plus `verification/queries.ts`.

### Existing API routes

`/api/auth/send-email` · `/api/cron/purge-archived` · `/api/profile` ·
`/api/wallet/topup` · `/api/webhooks/paystack` · `/api/webhooks/verification`

### What the UI reads today

- **`src/mock/`**   11 files (`around`, `banks`, `chart`, `chat`, `document`,
  `highlights`, `hostels`, `listings`, `student`, `vendor`, `StatsCard`).
  **30 files import from `@/mock`.**
- **`localStorage`** as fake persistence in `demo-order.ts`, `cart.ts`,
  `use-chat-store.ts`, `favorites-context.tsx`, `chat-component.tsx`.
- **`lib/vendor.ts` (23 KB)** and **`lib/event.ts` (10.8 KB)**   large in-memory
  data modules backing the vendor and event screens.

Each of these is a cut-over point: the mock module's exported shape is the
de-facto contract the real query must satisfy.

---

## 3. Database   what exists vs. what's needed

Existing migrations: `0001_profiles` · `0002_login_method` · `0003_admins` ·
`0004_seed_admin_roles` · `0005_landlord_role`.

**`public.profiles` is the only domain table.** Everything else must be created.

### Verified baseline (2026-08-14)

The Supabase project previously hosted an unrelated product   **Klario**
(`klario.finance`), a fintech beta waitlist. Its schema was left behind and has
now been removed. Audited against the codebase, which touches exactly two
database objects: `public.profiles` and the `login_method()` RPC.

Removed (11 tables, all empty except one row of Klario email config):
`audit_log` · `automation_runs` · `automations` · `beta_responses` ·
`beta_signups` · `email_log` · `email_templates` · `newsletters` · `segments` ·
`settings` · `submissions`, plus the `rls_auto_enable()` function and its event
trigger   that one mattered, since an event trigger auto-enabling RLS would have
silently locked every new table created in Phase 1.

`public` now contains `profiles` and five functions
(`create_admin`, `guard_profile_privileged_cols`, `handle_new_user`,
`login_method`, `promote_to_admin`), plus `sync_landlord_role` once `0005` is
applied. Anything else appearing in `public` is not ours.

> Auth email sends from **`sync@raavon.com`** via Resend   a stand-in domain
> until Sync's own is ready. Unrelated to Klario. The Supabase **Site URL and
> redirect allowlist** are a separate setting and must always point at Sync's own
> app, whatever domain the mail is sent from.

`profiles` already carries: `role` (`student|vendor|admin|super_admin`),
`vendor_category` (`landlord|food|beauty|laundry|tradesman`), `trade`,
`business_name`, `verification_status`, `archived_at`, with RLS, a
privileged-column guard trigger, and a signup trigger that clamps role so nobody
can self-assign `admin`.

### Tables to create

Ordered by dependency. Every table needs `enable row level security` plus
policies, or it is unreachable through Path A/B.

```sql
-- Core commerce
listings          (id, vendor_id→profiles, category, name, price, stock, sold,
                   status, archived_at, image_url, created_at)
orders            (id, buyer_id→profiles, vendor_id→profiles, status, subtotal,
                   sync_fee, total, delivery_address, created_at)
order_items       (id, order_id→orders, listing_id→listings, qty, unit_price)

-- Hostels / landlord
hostels           (id, landlord_id→profiles, name, address, geo, rent, status)
hostel_rooms      (id, hostel_id→hostels, label, price, available)
bookings          (id, hostel_id→hostels, student_id→profiles, status, dates)
booking_requests  (id, hostel_id→hostels, student_id→profiles, status, message)

-- Events
events            (id, organizer_id→profiles, title, slug, venue, starts_at)
ticket_tiers      (id, event_id→events, name, description, price, quantity)
tickets           (id, tier_id→ticket_tiers, owner_id→profiles, order_id, qr_code)

-- Messaging
conversations     (id, vendor_id→profiles, customer_id→profiles, last_message_at)
messages          (id, conversation_id→conversations, sender_id, content, created_at)
attachments       (id, message_id→messages, kind, url, size, mime)

-- Money
wallets           (id, user_id→profiles unique, balance_kobo, currency)
wallet_txns       (id, wallet_id→wallets, kind, amount_kobo, reference, status)
payouts           (id, vendor_id→profiles, amount_kobo, bank_code, status)
subscriptions     (id, vendor_id→profiles, plan, status, current_period_end)
billing_history   (id, vendor_id→profiles, amount_kobo, invoice_url, paid_at)

-- Discovery & engagement
hotspots          (id, name, geo, category, created_by)
promotions        (id, vendor_id→profiles, kind, discount, starts_at, ends_at)
reviews           (id, author_id→profiles, subject_type, subject_id, rating, body)
favorites         (id, user_id→profiles, subject_type, subject_id)
notifications     (id, user_id→profiles, kind, payload, read_at)

-- Admin
disputes          (id, order_id→orders, raised_by→profiles, status, resolution)
editorial_posts   (id, author_id→profiles, title, slug, status, body)
verification_visits (id, subject_id→profiles, agent_id, scheduled_for, outcome)
```

**Storage buckets** are also needed   chat attachments, listing images, hostel
photos, and KYC documents. The listings branch already pulled in
`browser-image-compression`, `react-dropzone`, `react-easy-crop`, and
`react-photo-view`, so the upload UI exists with nowhere to upload to.

---

## 4. Per-module connection steps

Each row is the same six-step recipe. Do them in this order per module:

1. Write the migration (table + indexes + RLS policies).
2. Regenerate types: `supabase gen types typescript --linked > src/types/database.ts`.
3. Fill `modules/<domain>/queries.ts` (RSC reads).
4. Fill `modules/<domain>/actions.ts` (writes, zod-validated).
5. Add `/api/<domain>/route.ts` **only if a client component needs it**.
6. Add the RTK Query slice + register the tag in `base-api.ts` `tagTypes`.
7. Delete the mock import and the `localStorage` shim.

| Module | Tables | Replaces | Client API needed? |
| --- | --- | --- | --- |
| `food` | listings, orders, order_items | `demo-order.ts`, `cart.ts`, `mock/listings` | Yes   cart, live order tracking |
| `hostels` | hostels, hostel_rooms, bookings | `mock/hostels` | Yes   booking flow |
| `events` | events, ticket_tiers, tickets | `lib/event.ts` | Yes   ticket selection |
| `vendor` | listings, orders, promotions, subscriptions | `lib/vendor.ts`, `mock/vendor` | Yes   dashboard tables |
| `messaging` | conversations, messages, attachments | `use-chat-store.ts`, `mock/chat` | Yes   **Realtime** |
| `payments` | wallets, wallet_txns, payouts | `mock/banks` | Yes   top-up, payout |
| `beauty` / `laundry` / `workmanship` | listings (category-scoped), orders |   | Yes |
| `hotspots` | hotspots |   | No   RSC only |
| `around` | profiles + hostels + hotspots (map) | `mock/around` | No   RSC only |
| `verification` | verification_visits | `mock/document` | Partial   `queries.ts` still a stub |

### Special cases

**Messaging needs Supabase Realtime**, not just REST. The chat UI in
`vendor/inbox/(components)/` already assumes live message delivery, typing
state, and read receipts. Subscribe to `postgres_changes` on `messages` scoped
by `conversation_id`, and enable Realtime on that table in the dashboard.

**Wallet/orders need webhook reconciliation.** `/api/webhooks/paystack` exists
but has no `wallet_txns` table to write into. Payment state must be driven by
the webhook, never by the browser redirect   the client can drop the callback.

**Admin analytics** (`mock/chart.ts`, `mock/StatsCard.tsx`) should be Postgres
views or RPCs, not client-side aggregation over full table reads.

---

## 5. Blockers to resolve first

These are ordered   the first two are correctness/security issues that exist on
`main` right now.

### 5.1 `/admin` and `/landlord` have no route gate

In [src/proxy.ts:50-51](src/proxy.ts#L50-L51) both entries are commented out:

```ts
// { prefix: '/landlord', roles: ['vendor'] },
// { prefix: '/admin', roles: ['admin', 'super_admin'] },
```

With no entry, `guarded` is `undefined`, and the proxy returns early at
`if (!guarded) return response`. **No layout under `(admin)` or `(vendor)`
performs any auth check**   verified by grepping every `layout.tsx` for
`getUser`/`redirect`. So `/admin` is reachable without a session today.

RLS will still refuse the *data* once tables exist, so this is not yet a data
breach   but the admin shell renders, and it must be closed before any admin
table ships.

### 5.2 Landlord promoted to a first-class role   DONE (migration pending)

**Resolved in code; `supabase/migrations/0005_landlord_role.sql` still needs to
be applied.** Until you run it the DB `check` constraint rejects
`role='landlord'`, so no landlord row can exist and `/landlord` will 403.

What changed:

| File | Change |
| --- | --- |
| `supabase/migrations/0005_landlord_role.sql` | New: constraint, backfill, trigger rewrite, role↔category sync |
| `src/proxy.ts` | `Role` union, `ALL`, `/landlord` gate, `/onboarding` accepts both, base uses **trustedRole** |
| `src/modules/auth/types.ts` | `Role` union + `isBusinessRole()` helper |
| `src/modules/auth/queries.ts` | `Profile.role` union |
| `src/modules/auth/actions.ts` | `verifySignupOtp` returns trusted `profiles.role` |
| `src/lib/handle.ts` | Landlords key off `business_name` |
| `src/components/layouts/*` | Dashboard hrefs, role labels, dock tabs, `super_admin` handling |
| `src/app/(auth)/verify/verify-form.tsx` | Both business roles → `/onboarding` |

The signup form still submits `role: 'vendor'` + `vendor_category: 'landlord'`;
the DB trigger performs the promotion. That is deliberate   it keeps role
assignment server-side, so a client can never self-assign `landlord` either.

Note `proxy.ts` now resolves the handle-rewrite base from the **server-trusted**
role rather than `user_metadata`. That was required: a landlord's metadata still
reads `vendor`, so the old code would have rewritten them to `/vendor`.

<details>
<summary>Original analysis (why <code>roles: ['vendor']</code> was wrong)</summary>

This is the `roles: ['vendor']` conflict. Landlord is currently modelled as
`role='vendor'` **plus** `vendor_category='landlord'`, not as its own role:

- `Role` in [proxy.ts:27](src/proxy.ts#L27) is `student|vendor|admin|super_admin`.
- The DB `check` constraint in `0001_profiles.sql` allows the same four.
- `landlord` is a `vendor_category` value.
- [proxy.ts:99](src/proxy.ts#L99) branches on `meta.vendor_category === 'landlord'`
  to pick `/landlord` vs `/vendor` as the handle rewrite base.

So with `roles: ['vendor']` the gate **cannot separate the two dashboards**   a
food vendor could open `/landlord` and a landlord could open `/vendor`. That is
the real conflict.

Writing `roles: ['landlord']` will not compile as-is. Two options:

**Option A   promote `landlord` to a first-class role.** Changes needed:
1. `Role` union in `proxy.ts`.
2. `profiles_role_check` constraint (new migration).
3. `handle_new_user()` trigger, which currently clamps to `vendor`/`student`.
4. Role resolution in `lib/supabase/middleware.ts`.
5. Backfill: `update profiles set role='landlord' where vendor_category='landlord'`.
6. Every `roles: ['vendor']` entry that landlords must still reach (`/onboarding`,
   and the shared marketplace prefixes already use `ALL`).

**Option B   keep `roles: ['vendor']`, enforce category in the layout.** Matches
the existing `// category-check happens in the page itself` comment. Add a
`getUser` + `vendor_category` check in `(vendor)/landlord/layout.tsx` and the
mirror check in `(vendor)/vendor/layout.tsx`. Much smaller, no migration.

Option A is cleaner long-term; Option B unblocks today.

</details>

### 5.3 Five landlord pages don't exist   this is the "can't find" error

[dashboard-nav.ts:121-143](src/config/dashboard-nav.ts#L121-L143) links to seven
landlord routes. Only two have a `page.tsx`:

| Nav link | Status |
| --- | --- |
| `/landlord` | exists |
| `/landlord/settings` | exists |
| `/landlord/properties` | **404   no page.tsx** |
| `/landlord/tenants` | **404   no page.tsx** |
| `/landlord/requests` | **404   no page.tsx** |
| `/landlord/inbox` | **404   no page.tsx** |
| `/landlord/earnings` | **404   no page.tsx** |

The vendor equivalents all exist (9 pages), so these can be scaffolded from
`(vendor)/vendor/*`   `earnings` and `inbox` are near-direct ports.

### 5.4 `ListingStatus` typecheck failure   DONE

`listings-page-fix` narrowed `ListingStatus` to `'Active' | 'Out of Stock' |
'Archived'` but left four files using the removed `'Draft'`. Resolved by
honouring the rename   `Draft` → `Archived` in `listings-view.tsx`,
`listings-grid-card.tsx`, `mock/listings.ts`, and `listings.tsx`, plus
`listings-modal.tsx` now writes `archivedAt: null` instead of `archived: false`.

Two latent bugs surfaced while fixing it:

- `handleArchive` in `listings.tsx` set status to `'Draft'`, so the Archive
  action never actually archived anything. It now sets `'Archived'` and stamps
  `archivedAt`.
- `listings-filters.tsx` still offered a **Draft** filter option, which after the
  rename matched zero rows. Replaced with **Archived**.

**`tsc --noEmit` now exits clean.** These three values become the
`listings.status` check constraint:

```sql
status text not null default 'Active'
  check (status in ('Active', 'Out of Stock', 'Archived'))
archived_at timestamptz
```

### 5.5 No generated database types

There is no `src/types/database.ts`. Every query will be untyped (`any`) until
`supabase gen types` is wired into the workflow. Do this before writing queries,
not after.

---

## 6. External services

All keys are already documented in [.env.example](.env.example)   the contracts
are decided, the integrations are partly unbuilt.

| Service | Env | State |
| --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVER_ROLE_KEY` | Auth live; domain schema missing |
| Paystack | `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` | Client/server helpers built; no tables to reconcile into |
| Smile ID / Dojah | `VERIFICATION_PROVIDER`, `VERIFICATION_API_KEY`, `VERIFICATION_WEBHOOK_SECRET` | Actions + webhook exist; `queries.ts` stub |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM`, `SEND_EMAIL_HOOK_SECRET` | Send-email hook built |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | `lib/security/rate-limit.ts` built |
| Vercel Cron | `CRON_SECRET` | `/api/cron/purge-archived` built |

Webhook routes are deliberately excluded from the proxy matcher
([proxy.ts:137](src/proxy.ts#L137)) because they authenticate by signature, not
session cookies. Keep it that way when adding new ones.

---

## 7. Suggested sequence

**Phase 0   unblock (no new tables)**
~~Decide the landlord role question (5.2)~~ · ~~fix `ListingStatus` (5.4)~~ ·
**apply migration `0005`** · close the `/admin` gate (5.1) · scaffold the 5
missing landlord pages (5.3) · wire `supabase gen types` (5.5).

**Phase 1   commerce spine**
`listings` + `orders` + `order_items`, RLS, then the `food` and `vendor`
modules. This retires `demo-order.ts`, `cart.ts`, `mock/listings`, and most of
`lib/vendor.ts`   the largest single reduction in mock surface.

**Phase 2   money**
`wallets`, `wallet_txns`, `payouts`, `subscriptions`. Make
`/api/webhooks/paystack` the single source of truth for payment state.

**Phase 3   messaging**
`conversations`, `messages`, `attachments` + Realtime + Storage. Highest
complexity: the chat UI already assumes live delivery.

**Phase 4   hostels & events**
`hostels`, `bookings`, `events`, `ticket_tiers`, `tickets`. Unblocks the
landlord dashboard properly.

**Phase 5   admin & discovery**
`disputes`, `editorial_posts`, `verification_visits`, `reviews`, `hotspots`,
analytics views.

---

## 8. Definition of done per module

- [ ] Migration applied with RLS enabled **and** policies written
- [ ] Types regenerated
- [ ] `queries.ts` / `actions.ts` implemented; zod validation on every write
- [ ] Route handler whitelists writable columns and calls `getUser()`
- [ ] RTK Query tag registered in `base-api.ts` and invalidated on mutation
- [ ] Mock import deleted, `localStorage` shim removed
- [ ] `tsc --noEmit` clean
