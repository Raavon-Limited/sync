# Sync Backend Blueprint

**A build order for the Supabase backend behind Sync** — every table, every row-level security
policy, the money ledger, and the hardening a marketplace that holds student funds actually
needs. Written against the app as it stands today: Next 16 RSC front end, ~90 screens, nine applied
migrations, and a front end still rendering from `src/mock/`.

| | |
| --- | --- |
| **Stack** | Next 16 · Supabase Postgres · Paystack · Upstash · Resend |
| **Scope** | 8 modules · 6 roles (student, vendor, **landlord**, **rider**, admin, super_admin) · 1 campus at launch |
| **Today** | ~20 live tables · 9 tracked migrations · **Target** ~60 |
| **Branch** | `listings-page-fix` |

> Table names and columns here are a **design proposal, not generated SQL** — treat them as the
> contract to write migrations against.

---

## Start here

*Live database audit — first written 13 August 2026, **corrected and re-verified 16 August 2026**.
Read this before section 01; the rest of the document is reference, this part is the entry point.*

> **The 13 August audit was wrong about the scale of the database.** It reported one app table and
> no migration history. Both were mistaken: the project has a populated migration history table and
> a substantial domain schema that simply was not visible from this repo. What follows is the
> corrected picture. Where the original findings still stand, they are marked; where they are
> resolved, the migration that resolved them is named.

### What is actually in the Supabase project

| | |
| --- | --- |
| Project ref | `inehfobzuworypywaowy` · `https://inehfobzuworypywaowy.supabase.co` |
| Plan / compute | **Free** · nano · `eu-west-1` (West EU, Ireland) |
| Migrations | **9 recorded** — `0001`–`0007` plus two applied 16 Aug (see below) |
| Backups | **None** — Free tier has no automated backups and no PITR |
| GitHub / branches | Not connected · no branches |
| Auth users | 18, mostly test accounts (several duplicate display names) |

The history table was never empty. `supabase migration fetch --linked` recovered all of it, including
**three migrations that exist nowhere in this repo**:

| Version | What it does |
| --- | --- |
| `0001`–`0004` | Profiles, login method, admins, admin role seed — the hand-pasted originals, since recorded |
| `0005_landlord_role` | Promotes `landlord` from a `vendor_category` to a first-class role; rewrites `handle_new_user()` |
| `0006_student_core` | 33 KB. `hostels`, `hostel_images`, `hostel_rooms`, `bookings`, `hostel_inspections`, `hostel_verification_visits`, `saved_hostels`, `listings`, `orders`, `order_items`, `activity_log`, `events`, `tickets` · PostGIS geo search · booking-hold state machine |
| `0007_areas` | The `areas` table and an FK from `hostels` |
| `20260814102248_fix_profile_exposure` | Closes Finding 1 · applied 16 Aug 2026 |
| `20260816123128_scope_policies_to_roles` | Closes Finding 2 · applied 16 Aug 2026 |

So the app owns roughly twenty tables, not one. `supabase/migrations/` now mirrors this history
exactly and `supabase migration list --linked` reports every row matched — that directory is the
source of truth.

**The front end has not caught up.** Nothing in `src/` reads `hostels`, `listings`, `events` or
`areas`; the vendor screens still render from `src/mock/`. The schema is ahead of the UI, which is
why the 16 Aug policy changes could be made safely — see the note under Finding 2.

The remaining tables — `audit_log`, `automation_runs`, `automations`, `beta_responses`,
`beta_signups`, `email_log`, `email_templates`, `newsletters`, `segments`, `settings`,
`submissions` — are Sync's own **marketing / waitlist backend**, same product, different surface. No
project split is needed.

### Finding 1 — `profiles` was publicly readable ✅ resolved 16 Aug 2026

Migration `0001` created:

```sql
create policy "profiles_select_active" on public.profiles
  for select using (archived_at is null);
```

There is no `to authenticated` clause, so the policy applies to the `anon` role as well. Supabase
grants `anon` SELECT on `public` tables by default, and the publishable key ships in the browser
bundle. **Anyone can read every row of `profiles`** — including `phone`, `full_name` and
`business_address`.

The intent was correct: public vendor browsing for `/around` needs anonymous reads. The problem is
that `profiles` also holds student phone numbers, so the policy that enables browsing also leaks
PII.

Verify it directly:

```bash
curl "https://inehfobzuworypywaowy.supabase.co/rest/v1/profiles?select=full_name,phone" \
  -H "apikey: <publishable key>"
```

**Fixed by [`20260814102248_fix_profile_exposure.sql`](../supabase/migrations/20260814102248_fix_profile_exposure.sql).**
The policy is now scoped `to authenticated` and restricted to the caller's own row, and `anon`'s
grants on `profiles` are revoked outright so the column cannot be named in a query at all. Verified
live: the `curl` above now returns `401 permission denied for table profiles`.

Two notes from applying it:

- The migration's own assertion block **failed the first push and rolled the whole thing back**,
  because `profiles_update_own` (from `0001`) had no `to` clause either and was likewise attached to
  PUBLIC. It was never exploitable — for `anon`, `auth.uid()` is null, so `null = id` yields NULL and
  matches no row — but it was rescoped before the migration would apply. This is the assertion doing
  exactly what it was written to do.
- Splitting public storefront fields into `vendor_profiles` is **still outstanding**. It is no longer
  urgent, because nothing anonymous reads `profiles` at all now, but it is still the right shape and
  remains in Phase 02.

### Finding 2 — "Advisor found no issues" is not an audit ✅ audited 16 Aug 2026

The Supabase advisor checks whether RLS is *enabled* and whether indexes are missing. It does not
evaluate whether policies are *too permissive* — a wide-open `using (true)` policy passes it
cleanly. A green advisor alongside the policy above is exactly the combination that feels safe and
isn't. Treat the advisor as a linter; the pgTAP suite in [section 15](#15--rls-strategy) is what
actually catches this class of bug.

**Audit every table, not just `profiles`:**

```sql
select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
order by tablename;
```

Any row where `roles` is `{public}` and `qual` is permissive is readable by anyone holding the
publishable key.

**The audit was run, and it found the same bug at scale.** Not one policy created by `0006` or
`0007` carried a `to` clause — roughly 25 policies across 14 tables, every one attached to PUBLIC.
This is Finding 1's bug class, replicated wholesale.

It was not leaking, and *why* it was not leaking is the point worth keeping: every private-table
predicate compares against `auth.uid()`, which is null for `anon`, so `null = student_id` yields
NULL and matches nothing. The protection was incidental rather than designed — it held only so long
as every policy author remembered to reference `auth.uid()`. One `using (true)` on a private table
would have broken it, and `events_select_all` is already that shape (correctly — events are public —
but it shows the shape is in active use).

A more useful probe than reading `pg_policies` is to ask what an attacker actually gets. Hit every
table with the publishable key and read the *shape* of the failure:

```bash
curl -s "$SUPABASE_URL/rest/v1/<table>?select=*&limit=1" \
  -H "apikey: <publishable key>" -H "Authorization: Bearer <publishable key>"
```

`permission denied` means `anon` has no grant. **`[]` does not mean protected** — it means the query
was allowed and returned nothing, which on an empty table tells you precisely nothing. Before the
fix, all fourteen app tables answered `[]`. That is the single most misleading result in this whole
audit, and it is exactly the "feels safe and isn't" combination this section is about.

**Fixed by [`20260816123128_scope_policies_to_roles.sql`](../supabase/migrations/20260816123128_scope_policies_to_roles.sql).**
It uses `alter policy ... to <roles>`, which rewrites only the role list and leaves every
`USING` / `WITH CHECK` expression untouched — so no predicate is retyped and the change cannot alter
*which rows match*, only which database roles are evaluated at all. Six named policies keep `anon`
for public browsing (`hostels`, `hostel_images`, `hostel_rooms`, `listings`, `events`, `areas`);
everything else is `authenticated`-only; `anon`'s grants are stripped from the eight strictly-private
tables and reduced to SELECT on the six public ones.

This was safe to apply in one pass **only because the front end still runs on `src/mock/`** and reads
none of these tables. That window is closing — once the UI is wired up, a change this broad needs
staging first.

Verified after applying: all nine private tables return `permission denied` to `anon`, all six browse
tables still return `200`, and an anonymous `POST /rest/v1/events` returns `401` (that path had a real
grant behind it before, not just a null-predicate accident).

The marketing tables were **not** reachable through PostgREST at all — `beta_signups`, `submissions`
and `newsletters` all answered *"Could not find the table in the schema cache"*, so they are not
exposed to the Data API. That is not the same as having been audited: they should still be checked
directly with the `pg_policies` query above, since a service-role or dashboard path could read them.

Also confirm migration `0004` actually took:

```sql
select u.email, p.role
from public.profiles p join auth.users u on u.id = p.id
where lower(u.email) in ('hello@raavon.com', 'muiz@raavon.com');
```

### Finding 3 — one name collision ⚠️ still open

`audit_log` already exists as a marketing table. The blueprint needs that name (see
[section 14](#14--platform--ops-tables)). Either rename the marketing one to `marketing_audit_log`,
or drop it if unused. `settings` does **not** collide — the blueprint's config table is
`app_settings`.

Longer term, consider moving the ten marketing tables into a dedicated `marketing` schema so
`public` belongs to the app. Not urgent. Also note that `email_log`, `email_templates` and
`newsletters` overlap conceptually with the notifications system in
[section 12](#12--reviews--disputes) — unify them rather than building a second one.

**Update, 16 Aug 2026.** `0006` has since created `activity_log` — a per-user feed, RLS-scoped to
`auth.uid() = user_id`. That is *not* the same thing as the platform `audit_log` this document
specifies in [section 14](#14--platform--ops-tables), which is an append-only, service-role-only
record of privileged actions. Do not conflate them, and do not resolve the `audit_log` collision by
pointing at `activity_log`. Three distinct tables are in play: marketing's `audit_log`, the app's
`activity_log`, and the ops `audit_log` still to be built.

### The window

The 18 accounts are mostly test accounts. That means the schema can be restructured aggressively —
column shapes changed, tables dropped, auth reset — with no data-migration plan for anyone's
records. **That freedom disappears the moment real students sign up.** Every foundational item
below is cheap now and expensive in three months. Spend the time on foundations before features.

### Step 1 — link the CLI and baseline reality ✅ done 16 Aug 2026

~~The project reports "No migrations", which means Supabase has no record of the four SQL files.~~
**That was wrong**, and it was the error that hid `0005`–`0007` for three days. The history table was
populated all along; the original audit read the dashboard rather than querying it.

The recovery did **not** need `db pull` (which requires Docker — see the toolchain note below).
`migration fetch` reads the history table directly over the same connection `db push` uses:

```bash
npm i -D supabase
npx supabase login
npx supabase init
npx supabase link --project-ref inehfobzuworypywaowy
npx supabase migration fetch --linked   # writes every recorded migration into supabase/migrations/
npx supabase migration list --linked    # confirm every row matches local ↔ remote
```

`supabase/migrations/` is now a faithful mirror of what the database has actually run, and
[`supabase/_archive/`](../supabase/_archive/) is obsolete — the fetched copies of `0001`–`0004` are
byte-identical to the archived ones apart from whitespace.

**The lesson worth keeping:** when the CLI refuses to push because remote versions are missing
locally, `migration fetch` recovers them non-destructively. The error message instead suggests
`migration repair --status reverted`, which *deletes* those history rows — do not run it before you
know what the versions are. Following that suggestion here would have erased the only record that
`0005`–`0007` were ever applied.

#### Toolchain state — 13 August 2026

| | |
| --- | --- |
| CLI | v2.114.0, via `npx` (not pinned — run `npm i -D supabase`) |
| `supabase init` | ✅ done · `project_id = "sync"` · `major_version = 17` matches remote 17.6.1 |
| `supabase login` | ✅ done |
| `supabase link` | ✅ done · ref `inehfobzuworypywaowy` |
| `supabase db push` | ✅ **works without Docker** |
| `supabase db pull` / `db dump` / `start` | ❌ **require Docker Desktop**, which is not installed |

**What the missing Docker actually costs.** `db pull`, `db dump`, `db diff` and the local stack all
run Postgres tooling inside a container. Without it there is **no shadow database**, so
`supabase db push` applies migrations **straight to production with no dry run**.

Two consequences, both of which change how migrations must be written:

1. **The staging project becomes the shadow database.** Push to staging, verify, then push to
   production. This is a better practice than a local shadow anyway, and it is now load-bearing
   rather than optional.
2. **Every migration must be independently safe** — idempotent where possible (`if not exists`,
   `drop policy if exists`), small enough to read in full, and paired with a written rollback.

Installing Docker Desktop restores local development and is worth doing when convenient. It is not
a blocker for shipping migrations.

### Step 2 — the first migrations

> **Renumbered.** The original plan called these `0005`/`0006`/`0007`. Those versions are taken —
> they are `landlord_role`, `student_core` and `areas`, already applied. **Stop using sequential
> numbers.** The CLI names migrations `<UTC timestamp>_<name>.sql`, which cannot collide with work
> done in parallel on another machine; that collision is precisely how this plan and reality drifted
> apart. Create every new migration with `npx supabase migration new <name>`.

| Migration | Status |
| --- | --- |
| `20260814102248_fix_profile_exposure.sql` | ✅ **applied 16 Aug** — Finding 1 |
| `20260816123128_scope_policies_to_roles.sql` | ✅ **applied 16 Aug** — Finding 2 |
| `…_conventions.sql` | ⬜ Next. Enums, the `private` schema, `set_updated_at`, RLS helper functions, and the ops tables — `webhook_events`, `idempotency_keys`, `feature_flags`, `app_settings`, `audit_log` (after the Finding 3 collision is settled). |
| `…_vendor_profiles.sql` | ⬜ Splits public storefront fields out of `profiles` and gets `verification_status` out of `user_metadata`. Less urgent than it was — nothing anonymous reads `profiles` now — but still the right shape. |
| `…_column_grants.sql` | ⬜ Replaces the four `guard_*_privileged_cols()` triggers. All of them gate on `current_user in ('authenticated','anon')`, which works only because PostgREST issues `SET LOCAL ROLE` — a fragile way to express "not the service role". See [section 05](#05--identity--vendors). |

Then a second free Supabase project as staging, and on into
[Phase 02 — Geography & catalog](#02--geography--catalog). Note that much of Phase 02 and Phase 05
is **already built** by `0006`/`0007` — reconcile those phases against the live schema before
planning work that exists.

### Gates

- **Before real users:** ✅ Finding 1 resolved · ✅ Finding 2 resolved · ✅ CLI baseline in place ·
  ⬜ **staging project exists — the one still outstanding.**
- **Before Phase 06 (money):** upgrade to Pro. The ledger cannot live on a database with no
  point-in-time recovery.

**Why the staging gate is now the binding one.** Without Docker there is no shadow database, so
`supabase db push` applies straight to production with no dry run. Both 16 Aug migrations were pushed
that way. It was defensible only because they were assertion-guarded, transactional, and touched
tables the front end does not yet read — the failed first push of `fix_profile_exposure` rolled back
cleanly and cost nothing. None of those conditions survive contact with a UI wired to real data.
Stand up the second free project before the next migration, not after.

---

## Contents

| # | Section |
| --- | --- |
| — | [Start here — live database audit](#start-here) |
| 01 | [Where you actually are](#01--where-you-actually-are) |
| 02 | [Ten rules to build by](#02--ten-rules-to-build-by) |
| 03 | [Request lifecycle](#03--request-lifecycle) |
| 04 | [Schema conventions](#04--schema-conventions) |
| 05 | [Identity & vendors](#05--identity--vendors) |
| 06 | [Geography](#06--geography) |
| 07 | [Verification & trust](#07--verification--trust) |
| 08 | [Catalog](#08--catalog) |
| 09 | [Orders & bookings](#09--orders--bookings) |
| 10 | [Money & the ledger](#10--money--the-ledger) |
| 11 | [Messaging](#11--messaging) |
| 12 | [Reviews & disputes](#12--reviews--disputes) |
| 13 | [Promotions & content](#13--promotions--content) |
| 14 | [Platform & ops tables](#14--platform--ops-tables) |
| 15 | [RLS strategy](#15--rls-strategy) |
| 16 | [Storage & media](#16--storage--media) |
| 17 | [Realtime](#17--realtime) |
| 18 | [Search & geo queries](#18--search--geo-queries) |
| 19 | [Background jobs](#19--background-jobs) |
| 20 | [Security program](#20--security-program) |
| 21 | [Environments & CI](#21--environments--ci) |
| 22 | [Delivery phases](#22--delivery-phases) |
| 23 | [Decisions you owe](#23--decisions-you-owe) |
| 24 | [Delivery & riders](#24--delivery--riders) — extends 09 and 10 |

---

## 01 · Where you actually are

The front end is far ahead of the data layer. That is fine — but it means several screens have
already invented a data model in mock files, and those shapes will fight the real schema unless
you settle the schema first. Here is the honest state.

| Status | Item |
| --- | --- |
| **Built** | Auth: signup, email OTP verify, password sign-in, passwordless admin OTP, resend, sign-out — all as server actions with Zod re-validation and typed results (`src/modules/auth/actions.ts`). |
| **Built** | Three Supabase clients cleanly separated — browser, request-scoped server, service-role admin — with `server-only` guards on the last two. |
| **Built** | `profiles` table with RLS, a signup trigger that clamps role to student/vendor, and a column-guard trigger blocking client writes to `role`/`verification_status`. |
| **Built** | Route gate in `src/proxy.ts` using the *server-trusted* role, not `user_metadata`. Personalised `/<handle>` rewrites. 403 rewrite for wrong role. |
| **Built** | Security baseline: CSP + HSTS + Permissions-Policy in `next.config.ts`, Upstash rate-limit factories, PII masking helpers, sanitisation helpers. |
| **Built** | Paystack init/verify server helpers, inline popup client, HMAC-SHA512 webhook verification with timing-safe compare, signed Supabase send-email hook → Resend. |
| **Partial** | Account lifecycle: archive → self-restore <30d → admin restore <60d → cron purge. Works, but the purge cron and archive checks are the only things reading `profiles` server-side. |
| **Partial** | Vendor onboarding + verification write to `auth.users.user_metadata`. That is user-editable storage holding `verification_status`, `business_name`, `documents[]`. It must move to real tables. |
| **Built** | *(schema only)* `0006`/`0007` created `hostels`, `hostel_images`, `hostel_rooms`, `bookings`, `hostel_inspections`, `hostel_verification_visits`, `saved_hostels`, `listings`, `orders`, `order_items`, `activity_log`, `events`, `tickets`, `areas` — with RLS, PostGIS geo search, a booking-hold state machine and per-table column guards. |
| **Built** | All app policies scoped to real roles, `anon` reduced to SELECT on the six public browse tables (16 Aug). |
| **Partial** | **The tables above have no application code.** Every domain module (`hostels`, `food`, `events`, `beauty`, `laundry`, `workmanship`, `hotspots`, `around`, `messaging`, `payments`, `vendor`) is still a stub — `export {}` in queries and actions — and every screen still renders from `src/mock/` or a per-feature `data.ts`. The gap is now wiring, not modelling. Read the live schema before designing against these mock shapes. |
| **Missing** | Wallet, escrow, payouts, disputes, reviews, notifications, promotions, editorial — no tables and no code. |
| **Missing** | No generated database types, no RLS test suite, no seed script, no staging project, no idempotency or webhook-event tables. |

> ### ⚠ The single biggest structural risk
>
> `user_metadata` is currently doing three jobs it must not do: carrying `verification_status`,
> carrying vendor business identity, and carrying the document list. A user can PATCH their own
> `user_metadata` through the Supabase Auth API with nothing but their own access token. Today
> that means **a vendor can self-mark as `verified`**. Your `profiles` trigger protects the
> `profiles` copy — but `submitVendorVerification` writes to metadata, and several screens read
> metadata. Phase 1 exists to close this.

---

## 02 · Ten rules to build by

Write these into `AGENTS.md` so every future change is measured against them.

1. **The database is the authorization layer.** Proxy checks are UX. Server-action checks are
   convenience. RLS is the thing that must hold when both are bypassed. Assume every table is
   reachable from a hostile browser with a valid student token.
2. **Nothing the user can edit decides what the user can do.** Role, verification status, plan
   tier, commission rate, balances — server-written columns only, never `user_metadata`, never a
   request body field.
3. **Money is an append-only ledger.** Balances are derived, never edited. Every movement has an
   immutable double-entry pair and an idempotency key.
4. **Every external call is assumed to arrive twice.** Webhooks, payment callbacks, retries.
   Uniqueness constraints, not `if not exists` checks, enforce it.
5. **Prices are re-derived server-side at every boundary.** The client's cart is a suggestion.
   Order totals come from a database read of current listing prices inside the same transaction
   that creates the order.
6. **Snapshot what you sell.** Order lines store the name and price at purchase time. A vendor
   renaming a dish must not rewrite last month's receipts.
7. **Every privileged action is auditable.** Role changes, verification decisions, payout
   approvals, dispute resolutions, account purges — append-only `audit_log`, no update or delete
   grant on it for anyone.
8. **PII is minimised, encrypted, and masked.** NIN, BVN and bank account numbers: encrypted at
   rest, only last-4 in any readable column, never exposed to a client-reachable view.
9. **Migrations are forward-only and tested.** Never edit an applied migration. Every migration
   that touches RLS ships with a pgTAP test proving the negative case.
10. **Fail closed.** Missing config, unknown state, unverified signature, uncertain role → deny.
    Your proxy already does this when Supabase env is absent; extend the habit everywhere.

---

## 03 · Request lifecycle

Five gates. A request has to pass all five, and each one assumes the ones before it were skipped.
This is what you are building toward — most of gates 1 and 2 exist.

| Gate | Where | What it enforces | Never trusted for |
| --- | --- | --- | --- |
| **1 · Edge** | Vercel + `next.config.ts` headers | CSP, HSTS, Permissions-Policy, TLS, DDoS shielding, bot rules | Anything identity-related |
| **2 · Proxy** | `src/proxy.ts` + `lib/supabase/middleware` | Session refresh, redirect anon → `/login`, wrong role → `/403`, handle rewrites | Authorization. It is UX and defence-in-depth only |
| **3 · App** | Server actions, route handlers, RSC queries | `getUser()`, Zod parse, rate limit, idempotency key, business rules, field whitelists | Being the only check — actions are callable directly |
| **4 · Postgres RLS** | Per-table policies + column grants | Row visibility and mutability per role; the real boundary | Complex business invariants (use triggers/RPCs) |
| **5 · Invariants** | Constraints, triggers, `SECURITY DEFINER` RPCs | Ledger balance, state-machine legality, stock never negative, immutable audit rows | — |

### Where each kind of work belongs

- **RSC page reads** → `modules/<domain>/queries.ts` with the request-scoped server client,
  wrapped in React `cache()` like `getProfile` already is. RLS filters; the query does not.
- **Mutations from forms** → server actions in `modules/<domain>/actions.ts`. Auth check, Zod
  parse, then either a plain query (RLS-guarded) or an RPC when the write spans tables.
- **Multi-table money writes** → a `SECURITY DEFINER` Postgres function taking `auth.uid()`
  internally. One transaction, one round trip, no partial state.
- **Client-side live data** → the browser client for realtime channels only. Anything else goes
  through a route handler, as `/api/profile` already models.
- **Third-party callbacks** → route handlers under `/api/webhooks/*`, excluded from the proxy
  matcher (you already do this), authenticating by signature.

---

## 04 · Schema conventions

Decide these once, in migration `0005`, before any domain table exists.

| Concern | Convention | Why |
| --- | --- | --- |
| **Primary keys** | `uuid default gen_random_uuid()` | No enumerable ids in URLs. Keep separate human codes (`ORD-12456`, `DR-2843`) as a distinct `code` column from a sequence, since your UI already shows them. |
| **Money** | `bigint`, kobo, never float | Column names end in `_kobo`. Your Zod `nairaAmount` stays the API boundary (whole Naira in, ×100 at the edge). Never `numeric` arithmetic in JS. |
| **Time** | `timestamptz`, UTC, `created_at`/`updated_at` | One `set_updated_at()` trigger function reused everywhere. All display formatting in `lib/utils/format`. |
| **Enums** | Postgres `create type` | Your unions already exist in TS (`OrderStatus`, `DisputeStatus`, `VendorCategory`). Native enums keep generated types in lockstep. Use check constraints only where values change often. |
| **Deletes** | `archived_at` / `deleted_at` | Already the pattern in `profiles` and `Listing.archivedAt`. Partial indexes `where archived_at is null`. Hard delete only via the 60-day purge job. |
| **Naming** | snake_case, plural tables, `<table>_id` FKs | Generated types map to camelCase in the app layer at the query boundary, not in the DB. |
| **Schemas** | `public` exposed · `private` hidden | Ledger internals, webhook payloads, encrypted PII, job state live in `private`, which is *not* in the PostgREST exposed-schema list. Removes a whole class of accidental exposure. |
| **Pagination** | Keyset on `(created_at, id)` | Offset pagination degrades and leaks counts. Your data tables and infinite feeds both want cursors. |
| **Indexes** | Every FK, every RLS predicate column | RLS predicates run per row. An unindexed `vendor_id` in a policy is a full scan on every vendor query. |
| **Types** | `supabase gen types typescript` | Commit to `src/types/database.ts`; type every client as `SupabaseClient<Database>`. CI fails if the checked-in file drifts. |

> ### Migration hygiene
>
> Continue the numbered-file pattern you have. But `0003` writes directly into `auth.users` and
> `auth.identities` — and `0004`'s comment shows that already broke once against the new API keys.
> **Delete those helpers.** Admin creation belongs in `scripts/seed-admins.ts` via the Admin API,
> with role assignment through a `SECURITY DEFINER` RPC that is callable only by an existing
> super_admin.

---

## 05 · Identity & vendors

`profiles` stays the server-trusted spine. Vendor-only columns move out — it is already carrying
seven of them, and vendors need thirty more.

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | id (FK auth.users), role, full_name, phone, avatar_path, handle unique, campus_id, area_id, locale, archived_at, archived_reason, suspended_until, banned_at, last_seen_at, created_at, updated_at | Exists. Drop the vendor columns once `vendor_profiles` lands. Add `handle` as a real unique column — `lib/handle.ts` derives it today and admits it wants a stored one. |
| `vendor_profiles` | id PK = profiles.id, slug unique, business_name, category, trade, sells, bio, business_address, geo, campus_id, area_id, logo_path, cover_path, verification_status, verified_at, is_open, opening_hours jsonb, prep_time_minutes, delivery_fee_kobo, min_order_kobo, rating_avg, rating_count, orders_count, plan_id, commission_bps, suspended_at, created_at, updated_at | The public vendor storefront record. `commission_bps` lives here so a negotiated rate survives plan changes. `rating_avg`/`orders_count` are trigger-maintained caches — never client-written. |
| `student_profiles` | id PK = profiles.id, matric_number_hash, hostel_listing_id, level, department, default_address, default_geo, dietary jsonb | Optional but cheap. `hostel_listing_id` is what personalises `/around` — your mock `MOCK_USER.hostel` is this field. |
| `role_grants` | id, user_id, role, granted_by, reason, granted_at, revoked_at, revoked_by | Append-only history of privilege. `profiles.role` is the current value; this is how you answer "who made them an admin, and when". |
| `user_devices` | id, user_id, push_token, platform, app_version, last_seen_at, revoked_at | Push delivery + a coarse fraud signal (one device, twelve accounts). |

> ### 🔴 Replace the column-guard trigger
>
> `guard_profile_privileged_cols()` decides privilege by inspecting
> `current_user in ('authenticated','anon')`. Migration `0004` already documents the failure: with
> the new `sb_secret_` keys, legitimate service-role writes are also reverted. That is a policy
> expressed in the wrong mechanism.
>
> Use **Postgres column privileges** instead:
>
> ```sql
> revoke update on public.profiles from authenticated;
> grant  update (full_name, phone, avatar_path, locale)
>   on public.profiles to authenticated;
> ```
>
> The database rejects the write outright rather than silently reverting it, service-role keeps
> working, and the rule is visible in `\dp` rather than buried in PL/pgSQL. Keep a trigger only for
> `updated_at`.

---

## 06 · Geography

You launch at KWASU, Malete and expand market by market. Model that on day one — retrofitting a
tenant key across sixty tables later is the expensive kind of mistake.

| Table | Key columns | Notes |
| --- | --- | --- |
| `campuses` | id, name, slug, city, state, centroid geography(Point), radius_m, is_live, launched_at | KWASU is row one. `is_live` gates a market before launch. |
| `areas` | id, campus_id, name, slug, centroid, boundary geography(Polygon), walk_minutes_to_gate | Your five Malete zones: KWASU Gate, Safari, Malete Town, Amao, Nifeskwasu. Drives filters and the "4 min walk · KWASU Gate" strings you currently hardcode. |
| `addresses` | id, user_id, label, line1, area_id, campus_id, geo, directions, is_default | Delivery destinations for food and laundry. Keep separate from `profiles` so a student can hold several. |

Put `campus_id` on `listings`, `orders`, `events` and `banners`. It is your future sharding key,
your analytics dimension, and the cheapest way to scope an admin to one market later.

---

## 07 · Verification & trust

Verification is the product's core promise — "identity- and visit-verified before they can
transact". So it needs to be a state machine backed by tables, not a metadata string, and it must
actually gate transacting.

| Table | Key columns | Notes |
| --- | --- | --- |
| `vendor_verifications` | id, vendor_id, status, submitted_at, provider, provider_session_id, liveness_passed, nin_ciphertext, nin_last4, bvn_ciphertext, bvn_last4, provider_result jsonb, reviewed_by, reviewed_at, rejection_reason, expires_at | One row per attempt, not per vendor — you need the history of a rejected-then-resubmitted vendor. Ciphertext columns live in `private`; only `*_last4` is readable. |
| `verification_documents` | id, vendor_id, doc_type, storage_path, checksum_sha256, status, uploaded_at, reviewed_by, reviewed_at, action_message, expires_at | Directly models your `DocumentItem`: gov_id, biz_reg, tax_docs, bank_verify, address. `not_uploaded` is the absence of a row, not a status value. |
| `verification_visits` | id, vendor_id, scheduled_for, inspector_id, status, address, geo, notes, result, photo_paths[], started_at, completed_at | Your `/admin/verify-visits` screen, unmocked. `inspector_id` FK to profiles with an admin role. |
| `verification_events` | id, vendor_id, kind, label, actor_id, occurred_at, metadata | Append-only. This *is* the `INITIAL_TIMELINE` in your documents screen — render it from here instead of a constant. |

### The gate that makes verification mean something

```sql
-- Unverified vendors may hold a draft catalog. They may not be transacted with.
create policy "listings_public_read" on public.listings for select
  using (
    status = 'active'
    and archived_at is null
    and exists (
      select 1 from public.vendor_profiles v
      where v.id = listings.vendor_id
        and v.verification_status = 'verified'
        and v.suspended_at is null
    )
  );
```

Same predicate, expressed as a `check`, on order creation. Verification then cannot be bypassed by
a direct API call — which is what "verified marketplace" has to mean at the data layer.

---

## 08 · Catalog

Your `vendor-vocabulary.ts` already made the key architectural finding, and it is correct: a menu,
a service list, a property list and a job list are the same entity with different words. Build one
`listings` core plus thin per-module detail tables. One CRUD path, one search index, one media
pipeline, one boost mechanism.

| Table | Key columns | Notes |
| --- | --- | --- |
| `listings` | id, vendor_id, module, title, slug, description, category_id, price_kobo, compare_at_kobo, price_model, status, stock, sold_count, view_count, rating_avg, rating_count, campus_id, area_id, geo, boost_expires_at, published_at, archived_at, search_vector, created_at, updated_at | The core. `module` ∈ hostel · food · beauty · laundry · trade · event · hotspot. Unique `(vendor_id, slug)`. Partial index `where status='active' and archived_at is null`. |
| `listing_media` | id, listing_id, storage_path, kind, position, width, height, blurhash, alt | Ordered gallery. Storage path, never a URL — signed at read time. |
| `listing_categories` | id, module, parent_id, name, slug, position, icon | Your "Rice / Soups / Grills / Snacks" taxonomy, per module. Vendor-scoped custom categories get a nullable `vendor_id`. |
| `listing_option_groups` | id, listing_id, name, min_select, max_select, required, position | "Choose a protein", "Add extras". Food needs this before first order or you will be storing modifiers as free text. |
| `listing_options` | id, group_id, name, price_delta_kobo, is_available, position | Priced at order time and snapshotted into `order_items.options`. |
| `hostels` | listing_id PK, room_type, amenities[], rooms_total, rooms_available, price_per_session_kobo, session_start, session_end, landlord_id, tour_available, rules | 1:1 with a listing. Your `MockHostel` fields land here — amenities, area, type, price per session. |
| `hostel_rooms` | id, hostel_listing_id, label, room_type, price_kobo, status, held_until, occupant_id, booking_id | "3 rooms left" must be a count of real rows, or you will oversell. `held_until` is the checkout reservation window. |
| `events` | listing_id PK, starts_at, ends_at, venue, venue_geo, performer, age_restriction, capacity, going_count, organizer_id, doors_at | Drives `/events` and the `/around` featured card. |
| `event_ticket_types` | id, event_listing_id, name, price_kobo, quantity_total, quantity_sold, per_user_limit, sales_start, sales_end | `quantity_sold` incremented inside the order transaction with a check constraint against `quantity_total`. |
| `tickets` | id, ticket_type_id, order_item_id, owner_id, serial, qr_secret_hash, status, transferred_from, checked_in_at, checked_in_by | One row per admitted person. Store a hash of the QR secret, never the secret — a leaked table must not mint valid tickets. |
| `services` | listing_id PK, duration_minutes, requires_booking, home_service, pickup_available, turnaround_hours, price_model | Covers beauty, laundry and trades — the three that share the "Services" vocabulary. |
| `vendor_hours` | id, vendor_id, weekday, opens_at, closes_at | Plus `vendor_hour_exceptions` for closures. Feeds "is_open" and booking-slot generation. |
| `booking_slots` | id, vendor_id, listing_id, starts_at, ends_at, capacity, booked_count, status | Materialised availability. Cheaper and far safer than computing free slots per request under concurrency. |
| `hotspots` | listing_id PK, price_tier, here_count, tags[], curator_note, opening_line | Editorial-curated, admin-authored. Not vendor-owned — RLS differs. |
| `work_requests` | id, student_id, trade, title, description, budget_kobo, photo_paths[], area_id, geo, preferred_time, status, awarded_quote_id, created_at | The inverse marketplace at `/workmanship/request`: student posts, vendors bid. |
| `quotes` | id, request_id, vendor_id, amount_kobo, message, eta_hours, status, expires_at | Unique `(request_id, vendor_id)`. Accepting one creates an order and rejects the rest in the same transaction. |

> ### Why one table and not seven
>
> Seven independent listing tables means seven CRUD screens, seven search paths, seven media
> pipelines, seven boost implementations, and a `/search` page that unions across all of them. The
> shared core costs you one nullable-ish detail join and buys single implementations of everything
> cross-cutting. The detail tables keep each module's fields properly typed and constrained rather
> than dumped into a jsonb blob.

---

## 09 · Orders & bookings

One `orders` spine for every module, because the vendor order queue, the chat order pill, the
earnings table and the dispute record all already assume one shape. Module-specific fulfilment
hangs off it.

| Table | Key columns | Notes |
| --- | --- | --- |
| `carts` | id, user_id, vendor_id, campus_id, expires_at, updated_at | Move the cart server-side. Your Redux slice is a good UX cache, but the server must own quantities at checkout, and you get abandoned-cart recovery free. |
| `cart_items` | id, cart_id, listing_id, quantity, options jsonb, added_at | No prices stored. Prices are read fresh at checkout. |
| `orders` | id, code unique, buyer_id, vendor_id, module, campus_id, status, payment_status, escrow_state, subtotal_kobo, delivery_fee_kobo, service_fee_kobo, discount_kobo, total_kobo, commission_bps, commission_kobo, vendor_payout_kobo, coupon_id, address_id, delivery_note, placed_at, accepted_at, declined_reason, delivered_at, completed_at, cancelled_at, auto_release_at | Money columns are computed by the create-order RPC, never accepted from the client. `commission_bps` is snapshotted so a later plan change doesn't rewrite history. |
| `order_items` | id, order_id, listing_id, name_snapshot, unit_price_kobo, quantity, options jsonb, line_total_kobo | Snapshotted name and price. Non-negotiable for receipts and disputes. |
| `order_events` | id, order_id, from_status, to_status, actor_id, actor_role, reason, occurred_at | Append-only. Powers your `OrderStageTracker`, the decline-reason popover, and every "when did this go wrong" dispute question. |
| `bookings` | id, order_id, listing_id, room_id, slot_id, student_id, vendor_id, kind, starts_at, ends_at, move_in_date, status, inspection_deadline, cancelled_reason | Hostel tenancies, beauty appointments, laundry pickups. Your `StudentBooking` mock maps here — `daysLeft` becomes a computed value, not a stored one. |
| `fulfilment_windows` | module, action, hours | Config, not constants: how long a vendor has to accept, how long until escrow auto-releases, how long a dispute window stays open. Different per module — food is hours, a hostel tenancy is days. |

### Order status machine

```
pending ──accept──▶ processing ──▶ delivered ──confirm / auto──▶ completed
   │                    │                 │
   └──decline──▶ cancelled                └──dispute──▶ disputed ──▶ resolved
```

Enforce legal transitions in a trigger on `orders` that reads the pair `(old.status, new.status)`
against an allowed-transitions table and raises otherwise. Your `ORDER_STATUSES` union is the
source; the four values map one-to-one, with `completed` and `disputed` added for escrow.

> ### ⚠ Concurrency
>
> Checkout must take a row lock. `select ... for update` on the listing (or the hostel room, or
> the ticket type) inside the create-order function, decrement, and let a check constraint reject
> negatives. Two students tapping "pay" on the last room at the same second is a real event on a
> campus app during hostel allocation week.

---

## 10 · Money & the ledger

This is the part that must be right the first time. Wallet, escrow, commission, payouts, refunds
and subscriptions are all the same thing seen from different angles: movements between accounts.
Model them once, as double entry.

### The ledger

| Table | Key columns | Notes |
| --- | --- | --- |
| `ledger_accounts` | id, kind, owner_id, currency, created_at | Kinds: `student_wallet`, `vendor_payable`, `escrow`, `platform_revenue`, `psp_settlement`, `refunds_payable`, `promotions_spend`. One row per vendor and per student, plus the platform singletons. |
| `ledger_transactions` | id, kind, reference unique, order_id, actor_id, description, occurred_at, metadata | The envelope. `reference` unique is your idempotency guarantee — a replayed Paystack webhook hits the constraint and does nothing. |
| `ledger_entries` | id, transaction_id, account_id, direction, amount_kobo, currency | Two or more per transaction. A deferred constraint trigger asserts debits = credits per transaction. No updates, no deletes — ever. |
| `wallets` | user_id PK, account_id, balance_kobo, currency, status, updated_at | A *cache* of the ledger, maintained by trigger. A nightly job recomputes from entries and alerts on any drift. Never written directly by app code. |
| `wallet_transactions` | id, wallet_id, ledger_transaction_id, type, direction, amount_kobo, balance_after_kobo, status, reference, counterparty, description, created_at | The user-facing statement — exactly your `WalletTxn` mock. A projection of the ledger, so the UI never queries double-entry rows. |

### Payments, escrow, payouts

| Table | Key columns | Notes |
| --- | --- | --- |
| `payments` | id, user_id, order_id, provider, provider_reference unique, access_code, amount_kobo, fees_kobo, channel, status, authorization jsonb, verified_at, raw jsonb | Your `WALLET_<uid>_<uuid>` reference scheme is good — keep the purpose prefix. `raw` lives in `private`. |
| `payment_methods` | id, user_id, authorization_code_ciphertext, last4, brand, exp_month, exp_year, bank, is_default, created_at | Paystack reusable authorizations for the plan auto-renew screen. Never store a PAN or CVV — your `CardFormValues` type must never reach the server. |
| `escrow_holds` | id, order_id unique, amount_kobo, state, held_at, release_after, released_at, released_by, refunded_at, dispute_id | States: `held` → `released` / `refunded` / `split`. `release_after` comes from `fulfilment_windows`. |
| `payout_accounts` | id, vendor_id, bank_code, account_number_ciphertext, account_last4, account_name, recipient_code, verified_at, is_default | Resolve the account name with Paystack before saving; store only `recipient_code` plus last-4 in readable columns. Changing this account is a privileged, audited, re-authenticated action. |
| `payouts` | id, vendor_id, payout_account_id, amount_kobo, fee_kobo, status, provider_reference unique, transfer_code, idempotency_key unique, requested_at, approved_by, processed_at, failure_reason | Two-step: request → approve → transfer. New vendors get a holding period. Never auto-transfer on webhook alone. |
| `refunds` | id, order_id, payment_id, amount_kobo, reason, destination, status, provider_reference, initiated_by, created_at | `destination` ∈ wallet · original method. Wallet refunds are instant and cheap; card refunds are slow and cost you. |
| `fee_schedule` | id, module, plan_id, commission_bps, flat_fee_kobo, service_fee_bps, effective_from, effective_to | Fees change. Version them by date so historical orders reprice correctly during reconciliation. |
| `plans` | id, name, price_kobo, interval, commission_bps, listing_limit, features jsonb, is_active, position | Your four tiers — starter, growth, professional, enterprise — as data, not a constant file. |
| `subscriptions` | id, vendor_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, provider_subscription_code, trial_ends_at | Downgrade takes effect at period end; upgrade is immediate and prorated. |
| `invoices` | id, code, vendor_id, subscription_id, payment_id, amount_kobo, status, issued_at, paid_at, pdf_path | Your billing-history table, unmocked. |

### The escrow flow, end to end

```
1. checkout      → create_order() locks stock, computes totals, inserts order (pending)
2. pay           → /api/checkout initialises Paystack with a server-set amount
3. charge.success→ verify with Paystack API, insert webhook_event (unique id),
                   then post: DR psp_settlement / CR escrow   [ref = payment ref]
4. vendor accepts→ order → processing; auto_release_at stamped from fulfilment_windows
5. delivered     → student confirms, or the pg_cron sweep hits auto_release_at
6. release       → DR escrow / CR vendor_payable (net)
                             / CR platform_revenue (commission)
7. payout        → vendor requests, admin approves, Paystack transfer,
                   DR vendor_payable / CR psp_settlement   [idempotency_key]
–  dispute       → escrow frozen; resolution posts full or partial reversal
```

> ### 🔴 Regulatory — resolve before you ship the wallet
>
> A stored-value wallet plus escrow means Sync holds customer funds. In Nigeria that touches CBN
> licensing (PSSP / PSP categories) and Paystack's own terms on holding third-party money in your
> settlement balance. There are two lower-risk designs:
>
> - **(a) Paystack Split Payments / subaccounts**, where the vendor share settles directly and you
>   never custody it — this kills true escrow but is dramatically simpler.
> - **(b) Delayed settlement** with a documented custody arrangement.
>
> Get a written answer from Paystack and a lawyer before Phase 6. The ledger design above supports
> either — only which accounts move changes.

> ### Reconciliation
>
> Daily job, non-negotiable: assert every `ledger_transaction` balances; assert each cached
> `wallets.balance_kobo` equals its account's entry sum; compare `psp_settlement` against the
> Paystack settlement report; alert on any payment in `initialized` for more than an hour and any
> payout in `processing` for more than a day. Silent drift is how marketplaces lose money without
> noticing.

---

## 11 · Messaging

Your inbox already supports text, images, video, documents and voice notes, plus an order pill
deep-linked from the orders table. The schema has to carry all of that and stay cheap to
authorise.

| Table | Key columns | Notes |
| --- | --- | --- |
| `conversations` | id, kind, student_id, vendor_id, order_id, listing_id, status, last_message_at, last_message_preview, created_at | Unique `(student_id, vendor_id, coalesce(order_id, ...))` so "message about order X" resolves to one thread — the contract `lib/order-chat.ts` already encodes. |
| `conversation_participants` | conversation_id, user_id, role, unread_count, last_read_at, muted_until, archived_at, PK(conversation_id, user_id) | The RLS anchor for the whole module. Every message policy is "am I a participant", which is one indexed PK lookup. |
| `messages` | id, conversation_id, sender_id, kind, body, order_ref_id, reply_to_id, created_at, edited_at, deleted_at | Kinds: text · media · voice · system · order_ref. System messages are how status changes appear inline. Index `(conversation_id, created_at desc)`. |
| `message_attachments` | id, message_id, storage_path, type, mime, size_bytes, duration_ms, width, height, thumbnail_path | Mirrors your `Attachment` type minus the browser `File`. Voice notes carry `duration_ms`. |
| `message_reports` | id, conversation_id, message_id, reporter_id, reason, detail, status, reviewed_by, reviewed_at | Your chat report dialog, wired to admin moderation. |
| `user_blocks` | blocker_id, blocked_id, reason, created_at, PK(blocker_id, blocked_id) | Checked in the send-message RPC, not only in the UI. |

### Transport

Use **Realtime Broadcast from the database**, not `postgres_changes`. A trigger on `messages`
calls `realtime.broadcast_changes()` onto a private per-conversation topic, and an RLS policy on
`realtime.messages` authorises subscription by participant lookup. `postgres_changes` evaluates
RLS per connected client per row and stops scaling in the low thousands of subscribers — which a
campus app reaches fast. Presence and typing indicators ride the same channel with no database
writes.

Unread counts are trigger-maintained on `conversation_participants`. Never compute a badge with
`count(*)` across messages.

---

## 12 · Reviews & disputes

| Table | Key columns | Notes |
| --- | --- | --- |
| `reviews` | id, order_id unique, listing_id, vendor_id, author_id, rating, body, photo_paths[], status, vendor_reply, replied_at, created_at | Unique on `order_id` plus an insert policy requiring the order to be `completed` and owned by the author — that is what makes ratings mean something. Trigger recomputes `rating_avg`. |
| `disputes` | id, code unique, order_id, raised_by, vendor_id, category, priority, status, amount_kobo, description, evidence_paths[], assigned_to, sla_due_at, resolution, resolution_amount_kobo, resolved_by, resolved_at | Your `Dispute` type, exactly. Opening one freezes the escrow hold; resolving posts the ledger movement. |
| `dispute_messages` | id, dispute_id, author_id, body, attachment_paths[], is_internal, created_at | `is_internal` notes are admin-only — enforced in the RLS policy, not by filtering in the query. |
| `reports` | id, entity_type, entity_id, reporter_id, reason, detail, status, resolved_by, resolved_at, action_taken | One moderation queue for listings, reviews, messages and users. |
| `notifications` | id, user_id, type, title, body, data jsonb, entity_type, entity_id, read_at, created_at | Written by triggers on order/dispute/message events, plus a fan-out worker for push and email. |
| `notification_preferences` | user_id, category, in_app, email, push, sms, PK(user_id, category) | Your `/me/notifications` preferences screen. Also your NDPR consent record for marketing sends. |

---

## 13 · Promotions & content

| Table | Key columns | Notes |
| --- | --- | --- |
| `campaigns` | id, vendor_id, name, type, status, listing_ids[], starts_at, ends_at, budget_total_kobo, budget_spent_kobo, targeting jsonb, created_at | Your five promotion types. `budget_spent_kobo` is a ledger-backed cache — promotion spend is real money and posts to `promotions_spend`. |
| `campaign_events` | id, campaign_id, listing_id, kind, user_id, order_id, occurred_at | Impressions, clicks, conversions. High volume — partition monthly and roll up nightly; never query it raw for a dashboard. |
| `coupons` | id, code unique, vendor_id, kind, value, min_order_kobo, max_discount_kobo, usage_limit, per_user_limit, starts_at, ends_at, is_active | Nullable `vendor_id` = platform-wide. Validation happens in the create-order RPC, never client-side. |
| `coupon_redemptions` | id, coupon_id, user_id, order_id, discount_kobo, created_at | Unique `(coupon_id, order_id)` and a count check against limits inside the same transaction. This is the classic race-condition exploit — close it in SQL. |
| `articles` | id, slug unique, title, excerpt, content, category, author_id, cover_path, status, scheduled_for, published_at, view_count, featured | Your admin editorial screen. Content is markdown; render through a sanitiser — replace the `escapeHtml` placeholder in `sanitize.ts` before this ships. |
| `banners` | id, placement, campus_id, image_path, headline, body, cta_label, cta_href, sponsor, priority, starts_at, ends_at, is_active | The MTN-style sponsored slot on `/around`, as data. |
| `board_posts` | id, hostel_listing_id, author_id, title, body, status, created_at | The hostel board on `/around`. User-generated → needs reporting and moderation from day one. |
| `favorites` | user_id, listing_id, created_at, PK(user_id, listing_id) | Replaces your `favorites-context` client state. |

---

## 14 · Platform & ops tables

These are the ones teams skip and regret. Build them in Phase 0.

| Table | Key columns | Notes |
| --- | --- | --- |
| `private.webhook_events` | id, provider, provider_event_id unique, event_type, payload, signature_valid, received_at, processed_at, attempts, last_error | Insert *before* processing. The unique constraint is your replay defence. Failed rows are retried by a worker, not lost in a `console.error` as they are today. |
| `private.idempotency_keys` | key PK, user_id, endpoint, request_hash, response jsonb, status, created_at, expires_at | For client-initiated POSTs — checkout, top-up, payout request. Same key + same body returns the stored response; same key + different body is a 409. |
| `audit_log` | id, actor_id, actor_role, action, entity_type, entity_id, before jsonb, after jsonb, ip, user_agent, occurred_at | Append-only: `revoke update, delete on audit_log from public, anon, authenticated, service_role`. Written by triggers on privileged tables plus explicit calls from admin actions. |
| `analytics_events` | id, user_id, session_id, name, props jsonb, campus_id, occurred_at | Partitioned monthly. Feeds the admin analytics screens through nightly rollups, never live aggregation. |
| `feature_flags` | key PK, enabled, rollout_pct, campus_ids[], updated_by, updated_at | Launch a module per campus. Also your kill switch when a payment integration misbehaves. |
| `app_settings` | key PK, value jsonb, updated_by, updated_at | Service fee, minimum payout, escrow windows, support email. Config that ops changes without a deploy. |
| `mv_vendor_daily` *(view)* | vendor_id, day, orders, gross_kobo, commission_kobo, net_kobo, aov_kobo, cancels | Materialised, refreshed hourly by pg_cron. Every earnings chart and admin KPI reads this — not `orders`. |

---

## 15 · RLS strategy

Sixty tables of hand-written policies becomes unmaintainable fast. Standardise on a small set of
helper functions and five policy shapes, then apply them mechanically.

### Get the role out of the database read path

Today `updateSession` queries `profiles` on every navigation, and any role-checking policy would
repeat that read per row. Add a **custom access token hook** that stamps `app_role` and
`vendor_id` into the JWT at issue time. Policies then read a claim instead of hitting a table.

```sql
-- Helpers. STABLE so the planner caches them per statement.
create function public.auth_role() returns text
  language sql stable set search_path = ''
  as $$ select coalesce(auth.jwt() ->> 'app_role', 'anon') $$;

create function public.is_admin() returns boolean
  language sql stable set search_path = ''
  as $$ select public.auth_role() in ('admin','super_admin') $$;

-- Wrap auth.uid() in a subselect: Postgres treats it as an initplan,
-- evaluating once per statement rather than once per row.
create policy "orders_buyer_read" on public.orders for select
  to authenticated
  using ( buyer_id = (select auth.uid()) );
```

> ### ⚠ The JWT staleness trap
>
> A claim is fixed until the token refreshes (up to an hour). That is fine for role *grants* and
> terrible for *revocations*: a suspended vendor keeps a valid "vendor" claim until refresh. So
> check `banned_at` / `suspended_until` against the table, not the claim, in the policies that gate
> transacting — and force a global sign-out when you suspend someone.

### The five policy shapes

| Shape | Predicate | Applies to |
| --- | --- | --- |
| `public-read` | `status = 'active' and archived_at is null and vendor is verified` | listings, listing_media, vendor_profiles, articles, hotspots, banners, reviews |
| `own-row` | `user_id = (select auth.uid())` | addresses, favorites, notifications, wallets, wallet_transactions, carts, devices, preferences |
| `two-party` | `buyer_id = uid() or vendor_id = uid()` | orders, order_items, bookings, disputes, escrow_holds — separate policies per side, since a vendor may update status and a buyer may not |
| `membership` | `exists (select 1 from conversation_participants ...)` | conversations, messages, message_attachments |
| `staff-only` | `is_admin()` | verification_visits, reports, audit_log reads, feature_flags, dispute internal notes |

### Rules that apply to every table without exception

- `alter table ... enable row level security` **and** `force row level security` — on every table,
  including ones you think nothing reads.
- Write separate policies per command. A single `for all` policy is how "students can read their
  orders" quietly becomes "students can update their orders".
- Always name the role: `to authenticated` or `to anon`. An unqualified policy is evaluated for
  every role.
- Views bypass RLS by default. Create every view `with (security_invoker = on)`, or put it in
  `private`.
- `SECURITY DEFINER` functions: always `set search_path = ''`, always fully-qualify identifiers,
  always `revoke execute ... from public, anon` and grant narrowly. Your `login_method` already
  does this correctly — make it the template.
- Baseline the grants: `revoke all on all tables in schema public from anon, authenticated`, then
  grant per table per column. RLS filters rows; grants are what stop a column from being selected
  at all.
- Never expose `private` in the PostgREST schema list.

### Prove it

A pgTAP suite in `supabase/tests/`, run in CI against a fresh branch database. For every table, at
least: an anon read attempt, a wrong-user read attempt, a privilege-escalation write attempt. The
negative tests are the point — anyone can verify that the owner can read their own row.

```sql
-- The shape of every test that matters
set local role authenticated;
set local request.jwt.claims = '{"sub":"<student-b>","app_role":"student"}';
select is_empty(
  $$ select * from orders where buyer_id = '<student-a>' $$,
  'student B cannot see student A''s orders'
);
```

---

## 16 · Storage & media

| Bucket | Visibility | Path convention & rules |
| --- | --- | --- |
| `avatars` | public | `{user_id}/{uuid}.webp` · 2 MB · images only · owner writes |
| `listings` | public | `{vendor_id}/{listing_id}/{uuid}.webp` · 5 MB · write requires owning the vendor row |
| `kyc-documents` | **private** | `{vendor_id}/{doc_type}/{uuid}` · owner writes, *admin-only reads* via short-lived signed URLs · virus-scanned · never public |
| `chat-media` | **private** | `{conversation_id}/{message_id}/{uuid}` · read policy joins `conversation_participants` · signed URLs, 5-minute TTL |
| `dispute-evidence` | **private** | Parties to the dispute plus admins |
| `editorial` | public | Admin write only |

- Storage policies are RLS on `storage.objects` keyed off the first path segment — which is why
  the path conventions above are load-bearing, not cosmetic.
- Validate MIME and size **server-side** after upload, not just in the dropzone.
  `browser-image-compression` is UX; the server is the check.
- Strip EXIF on upload. A student's hostel photo carrying GPS coordinates is a safety problem, not
  a metadata problem.
- Store *paths* in the database, never URLs. Sign at read time so revoking access actually revokes
  access.
- Once real listing images exist, drop `images.unsplash.com` from `next.config.ts`
  `remotePatterns` — the TODO is already there.

---

## 17 · Realtime

| Surface | Mechanism | Notes |
| --- | --- | --- |
| Chat | Broadcast from DB trigger, private topic per conversation | Authorised by an RLS policy on `realtime.messages` |
| Typing / presence | Presence on the same channel | No database writes |
| Vendor order queue | Broadcast on `vendor:{id}:orders` | New order lands without a poll; also fires the notification row |
| Order tracking | Broadcast on `order:{id}` | Drives `OrderStageTracker` for the student |
| Notification bell | Broadcast on `user:{id}` | One channel per user for every notification type |
| Wallet balance | Broadcast on wallet update | Top-up lands from a webhook the client can't observe otherwise |

Subscribe from client components using `lib/supabase/client`. Always clean up channels on unmount,
cap concurrent channels per tab, and treat realtime as an *accelerator* — the page must still
render correctly from its RSC read if the socket never connects. Your CSP already allows
`wss://*.supabase.co`.

---

## 18 · Search & geo queries

- **Full text.** A generated `search_vector` column on `listings`, weighted title (A) → category
  (B) → description (C), GIN indexed, queried with `websearch_to_tsquery`. Add `pg_trgm` with a
  trigram index on `title` for typo tolerance — "jolof" must find jollof.
- **Geo.** Enable PostGIS. `geography(Point,4326)` on listings and addresses, GIST indexed,
  `ST_DWithin` for radius and `ST_Distance` for ordering. This is what makes `/around` honest
  rather than a hardcoded list.
- **One RPC per feed.** `search_listings(q, campus, module, filters, lat, lng, radius, cursor)` and
  `around_feed(user_id, lat, lng)` return ranked, paginated rows in a single round trip. Your
  `/around` page currently assembles eight mock blocks — make that one function.
- **Rank** = text score × distance decay × rating × boost, with `boost_expires_at` lifting
  promoted listings. Keep the formula in SQL so it is tunable without a deploy.
- **Cursors, not offsets.** Keyset on `(rank, id)`.
- If search outgrows Postgres, the escape hatch is a read-only mirror to a search service — but at
  one campus you will not need it for a long time.

---

## 19 · Background jobs

| Job | Cadence | Runs on |
| --- | --- | --- |
| escrow auto-release | every 15 min | pg_cron — releases holds past `release_after` with no open dispute |
| webhook retry | every 5 min | pgmq worker over unprocessed `webhook_events`, exponential backoff |
| payout batch | daily | Route handler — queues approved payouts, calls Paystack transfers with idempotency keys |
| reconciliation | daily 02:00 | pg_cron — ledger balance assertions + settlement comparison, alerts on drift |
| refresh rollups | hourly | pg_cron — `refresh materialized view concurrently` |
| expire boosts, coupons, holds | every 10 min | pg_cron — also frees `hostel_rooms.held_until` reservations |
| purge archived accounts | daily 03:00 | Exists at `/api/cron/purge-archived`; keep, but write an `audit_log` row per purge |
| dispute SLA sweep | hourly | Escalates past `sla_due_at`, notifies admins |
| digest notifications | daily | Resend batch, respecting `notification_preferences` |

Prefer **pg_cron** for anything that is pure SQL — it runs inside the database, cannot be
triggered by an outsider, and needs no shared secret. Reserve Vercel Cron for jobs that must call
a third party, and keep the `CRON_SECRET` bearer check you already have. Supabase Edge Functions
are only worth introducing if you need something outside Vercel's execution limits.

---

## 20 · Security program

Grouped by layer, ordered by what an attacker reaches first. Items you already have are marked —
the point of the list is that it is auditable, not that it is all new work.

### Keys & secrets

- You already separate publishable and secret keys correctly, with `server-only` on the admin
  client. Keep `createAdminClient` import-restricted — add an ESLint rule banning it outside
  `modules/*/actions.ts`, `app/api/**` and `scripts/`.
- Every service-role call site should carry a one-line comment saying *why* RLS is being bypassed.
  Most current uses (archive checks in `signIn`) could be a `SECURITY DEFINER` RPC instead, which
  is narrower.
- `.env.local` is on disk — confirm it is gitignored and add **gitleaks** to CI. Rotate any key
  that has ever been pasted into a chat, ticket or screenshot.
- Rotate Supabase secret, Paystack secret, webhook secrets and `CRON_SECRET` quarterly and on
  every team departure. Document the rotation runbook.
- Prod secrets live only in Vercel's encrypted env store, scoped per environment. No developer
  needs the production service key for day-to-day work.

### Database hardening

- RLS enabled *and forced* on every table; `private` schema unexposed; grants revoked by default
  and granted per column.
- All functions `set search_path = ''`; `execute` revoked from `public` and `anon`;
  `SECURITY DEFINER` used only where genuinely needed and reviewed on every change.
- Views created `security_invoker`. Remove the direct `auth.users` / `auth.identities` writes in
  migration `0003`.
- Enforce SSL, restrict direct Postgres connections to the pooler, IP-allowlist admin access, and
  turn on the Supabase database linter in CI.
- Statement timeout on the `authenticated` role (e.g. 10 s) so one pathological query cannot pin
  the database.

### Authentication

- Turn on **leaked-password protection** (HIBP) — your Zod rules allow "password1", which HIBP
  would reject.
- **MFA is mandatory for admin and super_admin.** They are passwordless-OTP today, which means an
  email compromise is a full platform compromise. Add TOTP enrolment and require AAL2 for every
  `/admin` route and every payout approval.
- Captcha (Turnstile or hCaptcha) on signup, login and OTP request. Your Upstash limiter caps
  rate; captcha caps automation.
- OTP: 6 digits (matches your Zod rule), expiry ≤ 10 minutes, resend cooldown enforced server-side
  as well as in the UI.
- Refresh-token rotation with reuse detection on; shorter session lifetime for admins; global
  sign-out on password change, role change, or suspension.
- Keep the account-enumeration discipline you already have — `getLoginMethod` defaulting to
  `password` for unknown emails is exactly right. Make failure timing uniform too.

### Application boundary

- Every server action re-checks `getUser()` itself. Server actions are addressable endpoints; the
  proxy does not protect them.
- Zod parse at the top of every action and route handler — already your convention, keep it
  absolute.
- Explicit field whitelists on every write, as `/api/profile` already models. Never spread a
  request body into an update.
- Idempotency keys on checkout, top-up and payout-request endpoints.
- Never return raw provider or Postgres errors to the client — your `{ ok, error }` result type is
  the right shape; make sure the string is yours, not Supabase's, since Postgres errors leak
  column and constraint names.
- Tighten CSP once inline scripts are gone: replace `'unsafe-inline'` in `script-src` with a
  nonce. Add `report-uri` and actually watch the reports.

### Payments & webhooks

- Signature verification with timing-safe compare — done for Paystack; the verification webhook is
  still a stub that accepts anything. Fail closed there before the provider goes live.
- Persist the event before processing; unique provider event id; process asynchronously; return
  200 fast.
- Always re-verify amount and status against the provider API — you do this, keep it.
- Amounts and references are server-generated. The browser receives an access code, never an
  amount, which your top-up route already gets right.
- Payout account changes require re-authentication, a 24-hour cool-off, and an email notification
  to the old address.
- Velocity rules: cap top-ups per user per day, hold first payouts for new vendors, flag rapid
  top-up-then-withdraw as laundering.

### Data protection (NDPR)

- Encrypt NIN, BVN and bank account numbers — Supabase Vault or app-level AES-GCM with the key in
  a KMS. Readable columns hold last-4 only. Your `mask.ts` handles display; this handles rest.
- Maintain a PII inventory: what is collected, why, where it lives, how long it is kept, who can
  read it.
- Retention: KYC documents purged N years after account closure; chat media after N months;
  analytics events after 13 months. Implement as pg_cron jobs, not intentions.
- Data export endpoint (subject access request) and the archive → purge path you already built.
- DPAs on file with Supabase, Paystack, Resend, Upstash, Vercel and the KYC provider. Publish a
  privacy policy naming them.
- Admin access to KYC documents is logged to `audit_log` with the reason — reading a student's ID
  should never be invisible.

### Detection & recovery

- Sentry for app errors; Supabase log drains to Axiom or similar; alerts on 401 spikes, webhook
  failures, payout failures, ledger imbalance and RLS policy errors.
- PITR enabled on the production project plus a nightly logical dump to separate storage.
  **Run a restore drill quarterly** — an untested backup is a hope.
- Written incident runbook: who rotates keys, who can suspend a vendor, how to freeze payouts, how
  to notify affected users.
- CI security gates: gitleaks, `npm audit`, CodeQL, the Supabase linter, and the pgTAP RLS suite.
  A red RLS test blocks merge.
- Before public launch: an external penetration test focused on RLS bypass, payment tampering and
  IDOR on order and message ids.

---

## 21 · Environments & CI

- **Three projects** — local (`supabase start`), staging, production. Plus a Supabase preview
  branch per pull request, so migrations run against a real database before merge.
- **Migrations forward-only**, numbered as you already do. Never edit an applied file. Any
  migration touching RLS ships with its pgTAP test in the same commit.
- **Seed script** — one campus, five areas, ten vendors across categories, sixty listings, twenty
  orders in assorted states, a wallet with history, two disputes. This replaces `src/mock/` and
  makes every screen demoable against real queries.
- **Type generation** in CI: regenerate and fail if `src/types/database.ts` drifts. Your existing
  pipeline (`npm ci → lint → build`) gains `db:migrate → db:test → gen:types → typecheck`.
- **Mock retirement** is a checklist, not a vibe. Track each `src/mock/*` file against the query
  that replaces it and delete on cutover — leaving both is how a screen quietly renders fake data
  in production.

---

## 22 · Delivery phases

Ordered by dependency, not by excitement. Each phase ends with a testable claim. Do not start a
phase whose predecessor's exit criteria are unmet — every one of these is a prerequisite for the
next, which is why they are numbered.

### 00 · Foundations

Conventions migration: enums, `set_updated_at`, the `private` schema, helper functions,
`audit_log`, `webhook_events`, `idempotency_keys`, `app_settings`, `feature_flags`. Type
generation, seed script, pgTAP harness, staging project, CI gates.

> **Exit** — A pull request that weakens an RLS policy fails CI.

### 01 · Identity hardening

`vendor_profiles`, `student_profiles`, `role_grants`, stored `handle`. Move every vendor field and
`verification_status` off `user_metadata`. Replace the column-guard trigger with column grants.
Custom access token hook for `app_role`. Admin MFA, captcha, leaked-password protection. Retire the
direct `auth.users` writes in migration 0003.

> **Exit** — A student's own access token cannot change anything that decides what they may do —
> proven by a pgTAP test.

### 02 · Geography & catalog

`campuses`, `areas`, `addresses`, `listings` + media + categories + options, the per-module detail
tables, storage buckets and policies, vendor listings CRUD.

> **Exit** — `/vendor/listings` is fully live — create, edit, archive, bulk actions, image upload —
> with `src/mock/listings.ts` deleted.

### 03 · Verification

Verification tables, KYC bucket with admin-only reads, encrypted NIN/BVN, the onboarding wizard
writing real rows, admin approval queue, visit scheduling, provider webhook with real signature
verification, the verified-vendor gate on listings and orders.

> **Exit** — An unverified vendor's listings are invisible to every reader, including a raw API
> call with a valid token.

### 04 · Discovery

PostGIS, search vectors, `search_listings` and `around_feed` RPCs, favorites, hotspots, editorial
articles and banners.

> **Exit** — `/around` and `/search` render entirely from the database, personalised by the
> student's hostel and area.

### 05 · Commerce

Server carts, `create_order` RPC with row locking, order items, order events, the status-transition
trigger, the vendor order queue, bookings, hostel rooms, tickets, work requests and quotes. No
money yet — orders can be placed and fulfilled with payment stubbed.

> **Exit** — Two concurrent checkouts for the last room produce one order and one clean failure.

### 05b · Riders & delivery

The `rider` role and its KYC, zones and delivery pricing, `deliveries` with its status trigger,
offer fan-out with the atomic claim, scan-verified handoffs, location pings and ETA. Full detail in
[section 24](#24--delivery--riders).

Sits here deliberately: orders must exist before deliveries attach to them, and the ledger in
Phase 06 has to be designed as a **three-way** split from the start rather than retrofitted.

> **Exit** — Exactly one of five notified riders wins the claim, and both handoffs are
> scan-verified with GPS gating.

### 06 · Money

The ledger, wallets, payments, escrow holds, refunds, payout accounts and payouts, plans,
subscriptions, invoices, fee schedule, full Paystack integration, reconciliation job. Regulatory
question answered first.

> **Exit** — A full cycle — top up, order, escrow, release, payout — leaves a balanced ledger, and
> a replayed webhook changes nothing.

### 07 · Messaging & notifications

Conversations, participants, messages, attachments, realtime broadcast, unread counts, blocks and
reports, notifications with preferences, push and email fan-out.

> **Exit** — A non-participant cannot read a message or fetch an attachment by guessing an id.

### 08 · Trust & safety

Reviews gated on completed orders, disputes with the escrow freeze, dispute messages, the
moderation queue, admin resolution tooling with ledger effects, suspension flows.

> **Exit** — A dispute resolved in the student's favour moves money correctly and is fully
> reconstructable from `audit_log`.

### 09 · Growth

Campaigns, boosts feeding the search rank, campaign events, coupons with race-safe redemption,
sponsored banners, referrals if wanted.

> **Exit** — Campaign budget can never be overspent, and a coupon can never exceed its usage limit
> under concurrency.

### 10 · Scale & assurance

Analytics event pipeline, rollup views behind every admin chart, log drains and alerting, load test
at expected peak (hostel allocation week, Friday night food), external penetration test, restore
drill, documented SLOs and runbooks.

> **Exit** — You can answer "what happened to order X" and "is the ledger balanced" in under a
> minute, without a developer.

---

## 23 · Decisions you owe

Each of these changes the schema. Answer them before the phase that depends on them, not during it.

| Question | Needed by | Recommendation |
| --- | --- | --- |
| **Do you custody funds?** True escrow wallet vs Paystack split payments with direct vendor settlement. | Phase 06 | Get legal and Paystack answers first. If custody is a problem, use subaccounts and treat "escrow" as delayed settlement — the ledger accommodates both. |
| **One `listings` table or per-module tables?** | Phase 02 | Shared core plus detail tables. Your own vocabulary config is the argument for it. |
| **PostGIS or the simpler `earthdistance`?** | Phase 04 | PostGIS. Area polygons and "within 10 minutes' walk" queries arrive quickly, and retrofitting is painful. |
| **Server cart or keep the Redux cart?** | Phase 05 | Server cart, Redux as cache. Enables abandoned-cart recovery and cross-device carts. |
| **Are landlords a vendor category or a separate entity?** | Phase 01 | Keep them a category — your routing and vocabulary already assume it. Divergence goes in `hostels`, not in a parallel identity model. |
| **Multi-campus now or later?** | Phase 02 | Add `campus_id` now even while KWASU is the only row. Free today, expensive in a year. |
| **Do admins share the app or get a separate deploy?** | Phase 03 | Same app is fine given MFA and RLS — but scope admin sessions shorter and require AAL2 on every `/admin` route. |
| **Which KYC provider — Smile ID or Dojah?** | Phase 03 | Decide before building the webhook. Their callback shapes and signature schemes differ enough to matter. |
| **Who bears the platform fee — student, vendor, or split?** | Phase 06 | Affects `orders` column semantics and every earnings figure. Model both as separate columns so the answer can change. |
| **Cash on delivery, or card/wallet only?** | Phase 05b | Card and wallet only at launch. COD brings rider cash balances, float limits, remittance and physical-money reconciliation — a second system, not a payment option. See [section 24](#24--delivery--riders). |
| **Are riders employees, contractors, or a partner fleet?** | Phase 05b | Changes tax handling, payout cadence, insurance liability and whether you can require shift hours at all. Get this answered before rider onboarding is built. |
| **Who absorbs a failed delivery — platform, vendor, or student?** | Phase 05b | Needs a written policy per failure reason before the refund logic can be built. The rider is paid regardless. |
| **ETA from haversine or a routing API?** | Phase 05b | Haversine with a calibrated speed constant at one campus. Move to Mapbox or self-hosted OSRM at the second campus, and update the CSP `connect-src` when you do. |

---

## 24 · Delivery & riders

*Added 13 August 2026. A third party enters the marketplace, which changes the role model, the
order state machine, the money split and the privacy surface. Read alongside
[section 09](#09--orders--bookings) and [section 10](#10--money--the-ledger).*

### Two corrections to the proposed flow

**1 · Dispatch on vendor acceptance, not on payment success.** The flow as described goes
`payment successful → notify riders`. That dispatches a rider for an order the vendor has not yet
agreed to fulfil. If the vendor is out of jollof and declines, a rider is already riding to a
pickup that will not exist — and you have paid for their time or burned their goodwill.

The correct trigger is **vendor acceptance**:

```text
payment successful → order lands in vendor inbox → vendor accepts → dispatch begins
                                                 → vendor declines → auto-refund, no dispatch
```

Later, when you have prep-time data, move to **offset dispatch**: start searching at
`ready_at − estimated_rider_travel_time`, so the rider arrives as the food does. Do not build that
first — you need real prep-time history before the offset means anything.

**2 · The dropoff code cannot come from the vendor.** Your instinct that the vendor issues the
pickup code is right. But if the vendor also issues the *dropoff* code, the rider sees both codes
while standing at the vendor's counter — and can mark the order delivered from anywhere. The proof
value collapses entirely.

The rule that makes handoffs verifiable:

> **The rider always scans. The counterparty always displays. A secret must never be in the
> rider's possession before the moment it is meant to prove.**

| Handoff | Displays the code | Scans | Proves |
| --- | --- | --- | --- |
| Pickup | **Vendor** | Rider | The rider was physically at the vendor and took custody |
| Dropoff | **Student** | Rider | The order reached the right person |

Neither party invents a code. **The server mints both** when the delivery is created, stores only a
hash (the same discipline as `tickets.qr_secret_hash` in [section 08](#08--catalog)), and reveals
each one to its owner at the right moment — the dropoff code is released to the student's app only
once the rider is marked `en_route_to_student`.

### Codes, QR and the manual fallback

Each code has two transports carrying the *same* secret:

- **QR** — the primary path. The QR encodes an opaque random token, not order data. The rider's app
  scans, posts the token, the server hashes and compares.
- **6-digit numeric** — the fallback for a dead battery, a cracked screen, or no signal. The owner
  reads it aloud, the rider types it.

The manual fallback is a known, accepted weakness: a colluding student can read the code down the
phone before the rider arrives. Chowdeck, Glovo and Uber Eats all live with this. Contain it rather
than solve it:

- **GPS proximity gate** — reject any handoff confirmation taken more than ~150 m from the expected
  location. Store the scan coordinates on the event either way.
- **Attempt limits** — 5 tries, then lock and require support intervention.
- **Short TTL** — the dropoff code is valid only while the delivery is `en_route_to_student` or
  `arrived`.
- **Rotate on failure** — a failed delivery that returns to the vendor gets fresh codes.

### Three state machines, not one

The biggest modelling risk here is collapsing everything into one giant `orders.status` enum. Keep
three independent axes and let the student-facing tracker be a *projection* of them.

| Axis | Column | Values |
| --- | --- | --- |
| Payment | `orders.payment_status` | `pending` · `paid` · `failed` · `refunded` |
| Fulfilment | `orders.status` | `pending` · `accepted` · `preparing` · `ready` · `in_delivery` · `delivered` · `completed` · `cancelled` · `disputed` |
| Courier leg | `deliveries.status` | `pending` · `searching` · `assigned` · `en_route_to_vendor` · `at_vendor` · `picked_up` · `en_route_to_student` · `arrived` · `delivered` · `failed` · `returned` · `cancelled` |

**Student-facing labels** — one display map, in `src/config/delivery-status.ts` alongside the
existing `order-status.ts`:

| Underlying state | Student sees | Vendor sees |
| --- | --- | --- |
| `payment_status = pending` | Confirming payment… | — |
| `status = pending` | Sent to vendor | **New order** |
| `status = accepted` | Vendor accepted | Accepted |
| `status = preparing` | Being prepared | Preparing |
| `delivery = searching` | Finding you a rider | Finding a rider |
| `delivery = assigned` | Rider on the way to vendor | Rider assigned — *Tunde, 4 min* |
| `delivery = picked_up` | **On the way — arriving ~7:42pm** | Picked up |
| `delivery = arrived` | Your rider has arrived | Arrived |
| `status = delivered` | Delivered — rate your order | Delivered |

Enforce legal transitions with a trigger on each table, exactly as
[section 09](#09--orders--bookings) does for orders. The two machines are coupled at four points
only: vendor accept starts dispatch, pickup scan sets `orders.status = in_delivery`, dropoff scan
sets `delivered`, and any cancellation cascades.

### Tables

| Table | Key columns | Notes |
| --- | --- | --- |
| `riders` | id PK = profiles.id, vehicle_type, plate_number, license_number_ciphertext, license_last4, status, is_online, current_zone_id, last_geo, last_geo_at, rating_avg, rating_count, acceptance_rate, completion_rate, deliveries_count, verification_status, verified_at, suspended_at | `last_geo` is updated **in place** — one row per rider, no history. `status` ∈ offline · online · on_delivery · break. |
| `rider_documents` | id, rider_id, doc_type, storage_path, checksum, status, reviewed_by, reviewed_at, expires_at | Riders need *more* KYC than vendors: licence, vehicle registration, insurance, guarantor details, passport photo. They meet students alone and carry goods. `expires_at` matters — an expired licence must take them offline automatically. |
| `rider_shifts` | id, rider_id, started_at, ended_at, zone_id, deliveries_count, earnings_kobo | Supply analytics and shift-based incentives. Also how you answer "were we short of riders last Friday". |
| `deliveries` | id, code unique, order_id unique, rider_id, status, pickup_geo, pickup_address, dropoff_geo, dropoff_address_id, distance_m, fee_kobo, rider_share_kobo, platform_share_kobo, dispatched_at, assigned_at, picked_up_at, arrived_at, delivered_at, eta_at, eta_recalculated_at, failure_reason, attempt_number, created_at | One delivery per order. `attempt_number` supports re-dispatch after a rider drops out. Unique on `order_id` — batching is a later change, not a launch feature. |
| `delivery_offers` | id, delivery_id, rider_id, wave, distance_m, sent_at, expires_at, responded_at, response | Unique `(delivery_id, rider_id)`. Responses: `accepted` · `declined` · `expired`. This table *is* your acceptance-rate metric and your dispatch debugging tool. |
| `handoff_codes` | id, delivery_id, kind, code_hash, salt, attempts, max_attempts, locked_at, issued_at, expires_at, consumed_at, consumed_by, scan_geo, scan_distance_m | `kind` ∈ pickup · dropoff. **Never store the raw code.** Two rows per delivery. Regenerated on re-dispatch. |
| `delivery_events` | id, delivery_id, from_status, to_status, actor_id, actor_role, geo, reason, occurred_at | Append-only, mirrors `order_events`. The dispute record for every delivery argument you will ever have. |
| `delivery_tracks` | id, delivery_id, geo, speed, heading, recorded_at | Breadcrumbs **only while a delivery is active**. Partition monthly, purge after 90 days. This is the only high-volume write in the module — keep it out of Realtime replication. |
| `zones` | id, campus_id, name, boundary geography(Polygon), is_active, base_fee_kobo, per_km_kobo, min_fee_kobo, max_radius_m | Extends `areas` from [section 06](#06--geography). Delivery pricing is per zone, not global. |
| `delivery_pricing_rules` | id, zone_id, effective_from, effective_to, base_kobo, per_km_kobo, surge_multiplier_bps, rider_share_bps, small_order_fee_kobo | Versioned by date, like `fee_schedule`. Surge is a multiplier you can set manually before you can compute it. |

### Location and ETA

You are on **one campus** at launch. Distances are 300 m to 3 km. That makes the simple approach
genuinely correct for now:

- **ETA v1** — haversine distance × a campus-calibrated speed constant, plus a fixed handling
  buffer. Calibrate the constant from your own `delivery_tracks` after fifty deliveries. It will be
  within a minute or two, which is all a student needs.
- **ETA v2** — a routing API (Mapbox Directions, or self-hosted OSRM since you are already on OSM
  tiles) once you have multiple campuses or real road complexity. Adding one means updating
  `connect-src` in [`src/lib/security/headers.ts`](../src/lib/security/headers.ts).
- **Never let a displayed ETA move backwards.** Recompute freely, but clamp the number the student
  sees to be monotonically decreasing unless the delivery genuinely re-dispatches. A countdown that
  jumps from 4 minutes to 9 destroys trust faster than a wrong estimate.
- **Location pings** — the rider's app posts every 10–15 s while on a delivery. This updates
  `riders.last_geo` in place and appends to `delivery_tracks`. It must **not** be a
  `postgres_changes` subscription — push to the student over a Realtime *broadcast* channel
  (`delivery:{id}`), which costs nothing at the database.

### Dispatch and the acceptance race

The hard requirement: many riders are offered one delivery, exactly one wins, and the losers find
out immediately.

**Claim atomically.** A `SECURITY DEFINER` RPC, `accept_delivery(delivery_id)`, performs a single
guarded update:

```sql
update deliveries
   set rider_id = auth.uid(), status = 'assigned', assigned_at = now()
 where id = p_delivery_id
   and status = 'searching'
   and rider_id is null;
-- 0 rows affected → another rider already claimed it. Return "taken", not an error.
```

No advisory locks, no transactions to reason about. The row is the lock. Everything else — closing
the sibling offers, writing the event, notifying the losers — happens in the same function after a
successful claim.

**Dispatch strategy.** Two options, and the simpler one is right for you:

- **Broadcast** — offer to every online rider within the zone at once. Fastest tapper wins, not the
  nearest. Simple, and entirely fine when you have eight riders on one campus.
- **Wave dispatch** — offer to the nearest 3 riders, 25-second timeout, then widen. Fairer to
  riders, better ETAs, more moving parts.

**Start with broadcast**, but build `delivery_offers` with the `wave` column from day one so
switching is a dispatcher change and not a migration. The atomic claim is identical either way.

**When nobody accepts.** After N waves or T seconds with no acceptance: notify the vendor, offer
the student the choice of waiting or cancelling for a full refund, and alert ops. An order that
sits in `searching` forever with food going cold is the worst outcome in the whole system — put a
hard timeout on it before launch, not after.

### Money — what riders change

Riders are a third payee, so the split at checkout becomes three-way:

| Component | Charged to | Settles to |
| --- | --- | --- |
| Subtotal | Student | `vendor_payable` (less commission) |
| Commission | — | `platform_revenue` |
| Delivery fee | Student | `rider_payable` (rider share) + `platform_revenue` (platform share) |
| Service fee | Student | `platform_revenue` |
| Tip *(if added)* | Student | `rider_payable`, 100%, never touched by commission |

Additions to [section 10](#10--money--the-ledger):

- `ledger_accounts.kind` gains **`rider_payable`**.
- `payouts` gains a `payee_type` (`vendor` | `rider`) — riders typically want daily or instant
  payouts where vendors accept weekly, so the *schedule* differs even though the mechanism does not.
- `payout_accounts` becomes polymorphic on the same `payee_type`.
- Escrow release now fans out to two payees instead of one. The rider's share releases on
  `delivered`; the vendor's share on the same event or on dispute-window expiry.
- **Failed delivery** needs an explicit policy: the rider still rode. Pay a partial fee from
  `platform_revenue`, refund the student, and decide who absorbs the food cost — usually the
  platform if the student was unreachable, the vendor if the order was wrong.

> #### 🔴 Cash on delivery — decide before building
>
> If riders ever collect cash, you inherit an entire second system: rider cash balances,
> remittance schedules, float limits, reconciliation of physical money, and the fraud surface that
> comes with all of it. **Recommendation: card and wallet only at launch.** Revisit once the
> ledger has been running cleanly for a few months. This decision changes the schema, so make it
> now.

### Riders as a role — what it touches

Adding `rider` to the role union is not a one-line change. Concretely:

- `profiles.role` check constraint gains `'rider'`, as does the `Role` type in
  [`src/modules/auth/types.ts`](../src/modules/auth/types.ts).
- The signup trigger in migration `0001` clamps to student/vendor — it must now allow rider, while
  still never allowing admin.
- [`src/proxy.ts`](../src/proxy.ts): a `/rider` entry in `PROTECTED_PREFIXES`, and `'rider'` and
  `'riders'` added to `RESERVED_HANDLES` in [`src/lib/handle.ts`](../src/lib/handle.ts).
- The `app_role` JWT claim from [section 15](#15--rls-strategy) carries it automatically.
- A rider dashboard at `/rider` — offer feed, active delivery, scanner, earnings, shift toggle.
- **The scanner needs the camera.** `Permissions-Policy` in
  [`headers.ts`](../src/lib/security/headers.ts) currently sets `camera=()`, which disables it for
  every origin including your own. Riders need `camera=(self)`.

### Privacy — the time-bound access problem

A rider must see a student's exact address and phone number. **Only while actively delivering to
them, and never afterwards.** This is the most interesting RLS problem in the whole system, and it
is not solvable by hiding fields in the UI.

```sql
-- The rider sees the dropoff address only for a delivery they currently hold.
create policy "rider_reads_active_dropoff" on public.addresses for select
  to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.dropoff_address_id = addresses.id
        and d.rider_id = (select auth.uid())
        and d.status in ('assigned','en_route_to_vendor','at_vendor',
                         'picked_up','en_route_to_student','arrived')
    )
  );
```

The moment the delivery reaches `delivered` or `cancelled`, the predicate stops matching and access
ends — no revocation job required. Mirror this for the student's phone, and for the student's view
of the rider's live location.

Also: **proxy the phone numbers** if you can afford it. A masked call/SMS relay means neither party
keeps the other's real number after the delivery. If that is out of budget at launch, at minimum
mask the display and log every reveal to `audit_log`.

### Reviews — now two subjects

[Section 12](#12--reviews--disputes) assumes a review has one subject: the vendor. Generalise it
**before** the table has rows, not after:

- `reviews` gains `subject_kind` (`vendor` | `rider` | `listing`) and `subject_id`, replacing the
  bare `vendor_id`.
- Unique on `(order_id, subject_kind)` — one vendor review and one rider review per order.
- Rider reviews stay insertable only where `deliveries.status = 'delivered'` and the author is the
  order's buyer.
- Rating a rider must be **skippable and low-friction** — a thumbs up/down plus optional tags
  ("fast", "polite", "food was cold") converts far better than five stars and free text, and gives
  you better signal for dispatch scoring.
- Cold food is usually a *vendor* problem and a late rider is usually a *rider* problem, but
  students blame whoever they last interacted with. Keep the two rating streams separate so one
  cannot quietly poison the other.

### Realtime channels

| Channel | Subscribers | Carries |
| --- | --- | --- |
| `rider:{rider_id}` | One rider | Incoming offers, cancellations, shift messages |
| `delivery:{delivery_id}` | Student, vendor, rider | Status transitions, rider location, ETA updates |
| `zone:{zone_id}:dispatch` | Ops dashboard | Live supply/demand view for the ops team |

All broadcast-from-trigger, per [section 17](#17--realtime). Rider location is broadcast **only** —
it never round-trips through a replicated table.

### Failure modes to design for now

Every one of these will happen in your first month. Design them in, or discover them at 9pm on a
Friday.

| Scenario | Handling |
| --- | --- |
| Rider accepts, then goes offline | Heartbeat timeout → auto-release → re-dispatch at `attempt_number + 1`, penalise acceptance rate |
| No rider found | Hard timeout → notify vendor + student → wait or full refund |
| Student unreachable at dropoff | `arrived` + 10 min → `failed` → return-to-vendor leg, rider paid, student charged per policy |
| Vendor cancels after pickup | Rider paid in full, student fully refunded, platform absorbs |
| Rider marks delivered fraudulently | Blocked by the scan requirement + GPS gate; repeat attempts → suspension |
| Code brute force | 5 attempts → lock → support unlock only |
| Two orders, same rider, same vendor | Out of scope at launch — `deliveries.order_id` is unique. Batching is a deliberate later project |
| Student cancels mid-transit | Not permitted after `picked_up`; becomes a dispute instead |

### Build order

Riders slot into [section 22](#22--delivery-phases) as **Phase 05b**, after commerce and before
money — orders must exist before deliveries can attach to them, and the three-way ledger split has
to be designed with riders already in view.

1. `rider` role, rider onboarding, rider KYC, `/rider` dashboard shell
2. `zones`, delivery pricing rules, fee calculation at checkout
3. `deliveries`, `delivery_events`, the status trigger, manual assignment by an admin
4. `delivery_offers` + `accept_delivery` RPC + broadcast dispatch
5. `handoff_codes`, QR generation, the rider scanner, GPS gating
6. Location pings, `delivery_tracks`, ETA v1, the live student map
7. Three-way ledger split, `rider_payable`, rider payouts
8. Rider reviews, dispatch scoring, the ops dashboard

> **Exit** — A student orders, a vendor accepts, exactly one of five notified riders wins the
> claim, both handoffs are scan-verified, the money splits three ways into a balanced ledger, and
> the rider's access to the student's address ends the moment the delivery completes.

---

## The three highest-leverage moves

In order:

1. Get `verification_status` out of `user_metadata`.
2. Stand up the ledger before the first real Naira moves.
3. Make the RLS test suite a merge gate before there are sixty tables to retrofit.

---

*Companion doc to [ROUTE_MAP.md](../ROUTE_MAP.md) and [README.md](../README.md). Also published as
an artifact: <https://claude.ai/code/artifact/91261a39-7de7-4ea5-9780-e723eabfb2fa>*
