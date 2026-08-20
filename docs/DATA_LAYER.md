# Connecting the front end to the backend

Written 17 August 2026. Companion to [`BACKEND_BLUEPRINT.md`](./BACKEND_BLUEPRINT.md), which is the
design; this is the wiring.

---

## 1. Migrations — ✅ applied 18 August 2026

All eight applied cleanly to production, every assertion block passing. The CLI is now a pinned
devDependency (`supabase@2.114.0`) rather than an unpinned `npx` fetch, so `npx supabase …` resolves
locally and survives an npm cache clear.

Order is enforced by filename timestamp:

| Migration | What it adds |
| --- | --- |
| `20260816225649_conventions` | `private` schema, `set_updated_at`, `auth_role`/`is_admin`, `webhook_events`, `idempotency_keys`, `audit_log`, `feature_flags`, `app_settings` |
| `20260817090000_identity_roles` | **`rider` role**, `campuses`, `vendor_profiles`, `rider_profiles`, `verification_documents`, `current_app_role()`/`has_role()`/`is_staff()` |
| `20260817090100_services_catalog` | `service_categories`, `services`, `service_requests`, `service_request_events`, `hotspots` |
| `20260817090200_commerce_delivery` | `carts`, `cart_items`, `favorites`, `order_events`, `deliveries`, `delivery_offers`, `active_delivery_positions` |
| `20260817090300_money_ledger` | `wallets`, double-entry ledger, `escrow_holds`, `bank_accounts`, `payouts`, `plans`, `subscriptions`, `wallet_transactions` |
| `20260817090400_messaging_notifications` | `conversations`, `conversation_participants`, `messages`, `message_attachments`, `notifications`, `devices`, realtime |
| `20260817090500_trust_content` | `reviews`, `disputes`, `dispute_messages`, `reports`, `promotions`, `articles`, `banners`, `analytics_events` |
| `20260817090600_rpc_helpers` | `checkout_cart`, `accept_delivery_offer`, `toggle_favorite`, `mark_notifications_read`, `get_unread_counts`, `open_order_conversation`, `submit_review`, `vendor_earnings_summary` |

Every one ends with a `do $$` assertion block that fails the migration rather than leaving a
half-applied state. That is not decoration — it already caught a real hole once (see the blueprint's
Finding 1).

> **There is still no staging project.** `db push` goes straight to production with no dry run,
> because `db pull` needs Docker. This was survivable while the front end read none of these tables.
> The moment you wire up the hooks below, it stops being survivable.

## 2. Types — ✅ generated and wired

`src/types/database.types.ts` holds 58 typed tables and views. All four clients in
`src/lib/supabase/` are `createClient<Database>(…)`, and every `src/modules/*/queries.ts` types its
client as `SupabaseClient<Database>` — so column names, insert payloads and RPC arguments are all
checked at compile time.

Regenerate after any migration:

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.types.ts
```

**Turning this on caught ten real bugs that would have failed at runtime.** Worth knowing, because
the same traps recur:

- `carts.student_id` and `hostel_inspections.{full_name, phone, fee_kobo}` are NOT NULL with no
  default. RLS decides what you may *write*; it does not fill columns in for you. Inserts omitting
  them would have thrown.
- **Trigger-assigned columns still count as required.** `service_requests.code` is filled by
  `service_requests_set_code`, but Postgres does not know that, so the generated `Insert` type
  demands it. The trigger replaces null *or* empty string, so pass `code: ''`.
- **RPC optional arguments want `undefined`, not `null`.** A SQL parameter with a default is typed
  optional; passing `null` explicitly is a type error.
- `Partial<T>` is the wrong input type for an upsert — it lets a caller omit a NOT NULL column. The
  create paths now require the mandatory fields explicitly.

`src/app/api/profile/route.ts` is done: the patch is typed as
`Database['public']['Tables']['profiles']['Update']` and the `UPDATABLE` whitelist is tied to it with
`satisfies readonly (keyof ProfileUpdate)[]`, so renaming a column fails the build instead of
silently no-op'ing a security boundary.

## 3. The module pattern

Three files per domain, and the split is load-bearing:

```text
src/modules/<domain>/
  types.ts     domain shapes — camelCase, what components see
  queries.ts   the ONLY file that knows column names
  hooks.ts     React Query hooks — what components import
```

**`queries.ts` takes the Supabase client as its first argument** rather than importing one. The
browser client, the request-scoped server client and the service-role client are three different
objects with three different privilege levels; a module that reaches for one itself cannot be used
from the other two. Hooks pass the browser client, server components pass their own, cron jobs pass
the admin client.

Reference implementations, both complete and typechecking:

- **[`src/modules/food/`](../src/modules/food/)** — browse → cart → checkout → orders → live
  tracking. Shows optimistic cart updates with rollback, and a non-optimistic checkout (deliberately:
  it creates an order, an escrow hold and a delivery, so showing success before the server confirms
  would render an order that may not exist).
- **[`src/modules/messaging/`](../src/modules/messaging/)** — conversations, messages, voice-note
  attachments, notifications, and the realtime bridge.

Copy either shape for the remaining domains (listed in §5).

## 4. Query keys and cache invalidation

All keys live in [`src/lib/query/keys.ts`](../src/lib/query/keys.ts). Never inline a key.

The hierarchy is what makes invalidation work:

```ts
qk.orders.all        // ['orders']                  — invalidate everything
qk.orders.lists()    // ['orders','list']           — all list views
qk.orders.list({…})  // ['orders','list',{…}]       — one filtered view
qk.orders.detail(id) // ['orders','detail',id]      — one order
```

TanStack matches by prefix, so `invalidateQueries({ queryKey: qk.orders.all })` clears every order
query. **Invalidate the narrowest key that is still correct** — blanket-invalidating after editing
one row refetches every list on screen.

## 5. Realtime

`messages`, `notifications` and `conversations` are in the `supabase_realtime` publication. Realtime
respects RLS, so subscribers only receive rows their policies already allow.

The pattern in `useConversationRealtime` is: **realtime invalidates, React Query refetches.** Do not
splice realtime payloads straight into the cache — a payload is a single row without its joins (a
message arrives with no attachments), and merging a partial row into a fully-joined cache entry is
how "the attachment vanished" bugs happen.

Always `supabase.removeChannel(channel)` on unmount, or you leak a websocket per thread opened.

## 6. Module status

| Module | Status |
| --- | --- |
| `food` | ✅ browse, cart, checkout, orders, live tracking, favorites |
| `messaging` | ✅ conversations, messages, voice notes, notifications, realtime |
| `hostels` | ✅ browse, proximity, detail, bookings, inspections, landlord CRUD |
| `services` | ✅ shared catalogue + request lifecycle for all three verticals |
| `beauty` / `laundry` / `workmanship` | ✅ thin bindings over `services` with `vertical` fixed |
| `payments` | ✅ wallet, statement, escrow, banks, payouts, plans, earnings |
| `vendor` | ✅ storefront, listings CRUD, order inbox, promotions |
| `events` | ✅ events + tickets (read); ticket ISSUANCE still needs an RPC |
| `hotspots` | ✅ read-only, staff-curated |
| `around` | ✅ map pins unioned from vendors + hostels + hotspots |
| `verification` | ✅ document upload / replace / list |
| `account` | ⬜ still served by RTK Query (`src/store/api/profile-api`) |

**Roles are wired end to end.** `rider` now exists in `profiles_role_check`, `handle_new_user`,
`src/modules/auth/types.ts`, the `proxy.ts` `Role` union, `ALL[]`, the protected-prefix table and the
dashboard-base resolver. `resolveHandle` needed no change — riders are not storefronts, so they get a
name-based handle like students.

## 7. What is NOT done

**There is no `/rider` route group.** The gate `{ prefix: '/rider', roles: ['rider'] }` is in place so
the dashboard is protected from its first commit, but the pages do not exist. It needs: the offer
queue (`delivery_offers` where `status = 'offered'`), an accept action (`accept_delivery_offer` RPC),
the active job, and a position reporter writing `rider_profiles.current_geo`.

**Ticket purchase.** `useMyTickets` reads; nothing issues. A ticket is money — it must be created in
the same transaction as its payment with a unique `reference`, so it needs an RPC beside
`checkout_cart`. `tickets` has no client INSERT grant, so a client-side insert correctly fails.

**`public.events` is thin.** id, organizer, name, slug, venue, geo, starts_at — no description, cover
image, price tiers or capacity. The /events screens will want those; add a migration rather than
overloading `tickets.tier`, which is a per-ticket label and not a catalogue.

**The mock chat shapes are still in use.** `src/modules/vendor/types.ts` defines `ChatContact` /
`ChatMessage`; `src/modules/messaging/types.ts` has the real ones. Two deliberate differences when you
migrate the inbox: `timeAgo: string` becomes `createdAt: string` (ISO — a pre-formatted relative time
goes stale and cannot be sorted), and `isVendor` becomes `isMine` (whether a message is "mine" depends
on who is reading the thread, not on which side sent it).

**Verification still writes to `user_metadata`.** This is the live security hole from BLUEPRINT §01: a
user can PATCH their own `user_metadata` with just their access token, so **a vendor can currently
self-mark as verified**. `verification_documents` and `vendor_profiles.verification_status` are both
guarded against client writes — move the onboarding wizard onto them and stop writing status to
metadata.

**Two data layers now coexist.** RTK Query (`src/store/api`) still owns `profiles`; everything in
`keys.ts` is TanStack's. Two caches over the same table will disagree, so keep each table owned by
exactly one layer until `profile-api` is migrated across and `base-api.ts` retires.

**Deferred by choice, with reasons in the migration headers:**

- Native enums (§04) — existing check constraints have live values; converting rewrites tables and
  invalidates `hostel_room_state` / `hostel_availability`. Needs staging.
- The `app_role` JWT hook (§15) — `current_app_role()` reads `profiles` instead for now, which works
  today and swaps to the claim later without touching a single policy.
- `analytics_events` partitioning — trivial to add while the table is empty; premature now.
- pgTAP RLS suite (§15) — needs Docker.
