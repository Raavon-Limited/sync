# Security review — Sync

**Date:** 2026-09-02
**Scope:** Next.js App Router + Supabase (Postgres/RLS/Storage) + Paystack.
**Threat model:** a registered student with a valid session, devtools open, able to
call any endpoint directly — including PostgREST (`supabase.from(...)`, `supabase.rpc(...)`)
with their own JWT, which bypasses every route handler and server action in this repo.
**Method:** static read of `supabase/migrations/*.sql` (105 files), `src/app/api/*`,
`src/modules/*`, `src/proxy.ts`. Nothing was executed against a database.

**Headline:** the money path is genuinely well built — server-side pricing, a
double-entry ledger, a unique reference for idempotency, a locked balance check
before payout. The failures are all in *identity*: one privilege-escalation
primitive that was found and fixed in August and has since been silently
reintroduced, an admin console that is not gated by middleware, and a rate-limit
module that is complete, documented, and never called.

---

## Fixed since this review was written

**H1 is closed** (2026-09-02, same session). `src/proxy.ts` gates `/admin` again, with a note
saying why the per-page guards stay; `/admin/notifications` is a server component that calls
`requireStaff()` and renders the inbox as a client child
(`(components)/notifications-inbox.tsx`); and the `admin/layout.tsx` comment that asserted a
control which did not exist now names all three layers and what each refuses — a navigation, a
render, a write. All 25 admin pages now carry a guard. Verified by `next build`.

Nothing else below has been touched.

---

## CRITICAL

### C1. `profiles.roles` is writable by its owner — the August privilege-escalation fix has regressed

**What it is.** `profiles_update_own`
(`supabase/migrations/20260814102248_fix_profile_exposure.sql:84`) lets a user
update their own profile row. The column guard that decides which columns they
may *actually* move is `guard_profile_privileged_cols`. Its current definition
(`supabase/migrations/20260905180000_lock_full_name.sql:37-64`) freezes `role`,
`verification_status`, the suspension trio and `full_name` — **and says nothing
about `roles`.**

That is the exact bug `20260830100000_fix_role_guard.sql` was written to fix. Its
header names it: *"1. ANY SIGNED-IN USER COULD GRANT THEMSELVES ADMIN —
`update profiles set roles = '{student,admin}' where id = <self>` succeeded"*, and
its fix added `new.roles := old.roles` unless a transaction-local grant flag is up
(`20260830100000_fix_role_guard.sql:66-71`). Two migrations later,
`20260902110000_admin_roles_in_db.sql:51-71` rewrote the whole function to add the
`role` door — and dropped the `roles` clause on the way. `20260905180000` inherited
that shape. The protection has been absent since 2026-09-02.

**How it is exploited today.** From devtools, one call:

```js
await supabase.from('profiles').update({ roles: ['student','admin','agent','event_manager'] }).eq('id', myId)
```

The check constraint `profiles_active_role_is_held` still holds (`role`='student'
is in the array), so the write succeeds. What that buys right now:

- **Forged credentials on the public verification card.** `verify_card` builds its
  credential list from `t.roles` (`20260905090000_account_id_cards.sql:331,336,358`).
  A student who adds `event_manager` gets "Event organiser" printed on their public
  `/v/<code>` page — the one page whose entire purpose is to be the thing that
  cannot be forged.
- **The agent dashboard's own guard is defeated.** `src/app/(agent)/agent/page.tsx:47`
  authorises on `profile.roles.includes('agent')`. It survives only because
  `src/proxy.ts:76` gates `/agent` on the singular `role`. One guard deep, not two.
- **The login role-chooser offers roles the user does not hold**
  (`src/modules/auth/actions.ts:199`, `src/app/(auth)/login/login-form.tsx:297`),
  which is the entry point to H1 below.

**Why it is CRITICAL rather than HIGH.** Full admin is currently blocked by
*accident*, not by design: `switch_role` (`20260830090000_multi_role_accounts.sql:114`)
authorises purely on `roles` — "you can only wear a hat you hold" — and would hand
over `role='admin'` on request. It fails only because the same guard rewrite also
removed the "role may move within roles" clause, so `switch_role`'s `UPDATE` is
now reverted and the function silently does nothing (regression of bug #2 in that
same August migration). The next person who notices the role switcher is broken
will fix it by raising the grant flag in `switch_role` — and that commit turns C1
into instant self-service super-admin.

**Fix.** Restore the clause in `guard_profile_privileged_cols`:

```sql
if coalesce(current_setting('sync.role_grant', true), '') <> 'on' then
  new.roles := old.roles;
  new.role  := old.role;
end if;
-- and restore the "role may move, but only within roles" allowance
if not (new.role = any (coalesce(new.roles, '{}'))) then new.role := old.role; end if;
```

Add a `pg_proc.prosrc like '%new.roles%'` assertion to the migration's verify block
— `20260830100000` shipped exactly such an assertion for `sync.role_grant`, and it
is why that half survived while this half did not.

---

## HIGH

### H1. The admin console was not gated by middleware, and one page had no guard at all — FIXED

`src/proxy.ts:81` — the `/admin` entry in `PROTECTED_PREFIXES` is **commented out**:

```ts
// { prefix: '/admin', roles: ['admin', 'super_admin'] },
```

`src/app/(admin)/admin/layout.tsx:5` nonetheless states *"Authorization (role=admin)
is enforced by the proxy (middleware)"*. It is not. Every admin page is on its own,
and 24 of 25 do call `requireStaff()`. The exception is
`src/app/(admin)/admin/notifications/page.tsx:23`, a `'use client'` page with no
server guard, which renders the admin console shell to any signed-in user.

**Exploit.** Combined with C1: set `roles`, log in, pick "Admin" in the chooser,
land on `/admin/notifications`. Data exposure is limited (the panel reads the
caller's *own* notifications through RLS) but the admin console renders, and the
one control keeping the other 24 pages shut is a line every future page must
remember to write.

**Fix.** Uncomment the prefix. Keep the per-page `requireStaff()` calls — the
comment in `src/modules/admin/guard.ts:36` is right that a page guard protects a
render and not a request — and add the guard to the notifications page.

### H2. Rate limiting is fully implemented and never called

`src/lib/security/rate-limit.ts` exports `rateLimiter`, `checkRateLimit` and
`getRequestIdentifier` (lines 54, 63, 72) with tuned limiters for `auth`, `otp`,
`passwordReset`, `quote` and `webhook`. **Nothing in `src/` imports the module.**
The only reference is a comment in `src/modules/auth/actions.ts:247` asserting
that a limit exists.

Unlimited today: `signIn` / `signUp` / OTP request (`src/modules/auth/actions.ts`),
`POST /api/wallet/topup`, `GET /api/banks/resolve` (which spends Paystack quota per
call), and `getLoginMethod`.

**H2a — unlimited account enumeration.** `getLoginMethod`
(`src/modules/auth/actions.ts:254`) is an unauthenticated server action that answers
"does this address have an account, and how does it sign in", using the service
role. The header documents the trade deliberately and names the mitigation: *"the
fix is a rate limit on this action"*. That mitigation is the module above. An
attacker can enumerate the entire student body at whatever rate Vercel will serve.

**Fix.** Wire `checkRateLimit('auth' | 'otp', identifier)` into the auth actions and
`getLoginMethod`, and `checkRateLimit('auth', user.id)` into `/api/wallet/topup`.
Note the limiters no-op when `UPSTASH_REDIS_REST_URL` is unset — confirm it is set
in production, or the wiring changes nothing.

### H3. `/api/profile`'s `avatar_url` allowlist is bypassable, and the column reaches an HTML attribute

`src/app/api/profile/route.ts:63-77` rejects any `avatar_url` that is not an
`https` URL on the project's own `public-media` path. Good — but the route is not
the only writer. `profiles_update_own` permits a direct PostgREST PATCH of the same
column, and `guard_profile_privileged_cols` does not freeze it, so the validation is
advisory:

```js
await supabase.from('profiles').update({ avatar_url: 'https://attacker.test/x.png' }).eq('id', myId)
```

The value is then rendered wherever the account's name appears — an off-site image
request made by every viewer of that name — and, more seriously, interpolated into
an SVG attribute inside `dangerouslySetInnerHTML`
(`src/components/account/sync-id-card.tsx:558`, sink at `:387`). The escaper at
`:194` handles `&`, `<` and `>` **but not `"`**, so a stored value of
`x" onload="…` closes the attribute and adds an event handler to an SVG `<image>`.
The same sink is reachable from vendor-controlled `logo_url`, written from an
unvalidated client patch at `src/modules/vendor/queries.ts:191`.

Today both are self-XSS: the card renders only on the holder's own profile page. It
stops being self-XSS the first time a staff review screen renders a vendor's card.

**Fix.** Enforce the URL shape in the database (a `CHECK` on the column, or freeze
`avatar_url` in the guard and route all writes through a definer function), and add
`"` and `'` to `esc()` — it is used exclusively in attribute context.

### H4. An archived account can un-archive itself

`archived_at` is not frozen by the guard. Staff-initiated archiving is reversed by
`restoreAccount` (`src/modules/account/actions.ts:52`), which correctly requires an
admin — but the target can do it themselves with a PATCH. Between 30 and 60 days,
`signIn` (`src/modules/auth/actions.ts:201-217`) refuses the session yet still calls
`signInWithPassword` first, so the attacker holds a valid access token for the
remainder of its TTL and can use it to clear the column.

**Fix.** Add `new.archived_at := old.archived_at; new.archived_reason := old.archived_reason;`
to the guard, and let `archiveAccount` raise the same grant flag the role functions use.

---

## MEDIUM

### M1. `/api/webhooks/verification` accepts unauthenticated POSTs

`src/app/api/webhooks/verification/route.ts:22-27` — signature verification is a
`TODO`; the handler reads the body, logs its length and returns `200`. It writes
nothing, so there is no state to corrupt today, but it is excluded from the
middleware matcher (`src/proxy.ts:181`) and will become a hole the moment somebody
implements the handler above the missing check.

**Fix.** Return `501` until the provider is chosen, or implement the signature check
in the same commit as the first write.

### M2. `public.` functions are not revoked from `PUBLIC` by default

`20260816225649_conventions.sql:56-58` sets `alter default privileges` for the
`private` schema only. Postgres grants `EXECUTE` on every new function to `PUBLIC`,
so any `public.` function without an explicit `revoke` is callable by `anon` and
`authenticated`. Most files do revoke explicitly; `public.expire_stale_holds()`
(`0006_student_core.sql:264`) does not — it is `SECURITY DEFINER`, takes no caller
check, and mass-updates `bookings`. It only touches rows already past
`reserved_until`, so the impact is low, but it is callable by anyone.

Two definer functions also use `set search_path = public` rather than `''`
(`0006_student_core.sql:268`, `20260817090300_money_ledger.sql:403`), against the
rule stated in `20260816225649_conventions.sql:113`.

**Fix.** `alter default privileges in schema public revoke execute on functions from public, anon;`
then grant deliberately, and normalise the two `search_path` values.

### M3. `analytics_events` accepts any insert from anyone

`20260817090500_trust_content.sql:449` — `for insert to anon, authenticated with check (true)`,
with no ownership column asserted. Reads are staff-only (`:453`), so this is
pollution rather than disclosure: an attacker can forge arbitrary analytics rows and
poison the numbers staff make decisions from, or inflate storage.

**Fix.** `with check (user_id is null or user_id = (select auth.uid()))` plus a rate limit.

### M4. Middleware falls back to client-writable `user_metadata` for the trusted role

`src/lib/supabase/middleware.ts:56-57` — `role = profile?.role ?? user.user_metadata?.role`.
`user_metadata` is writable by the user (`supabase.auth.updateUser`). The fallback
only applies when the profile row is missing, which for a registered user it is not,
so this is not exploitable as written — but it is one deleted row away from being a
role oracle, and the same file's comment at `:41` calls `user_metadata` the untrusted
source.

**Fix.** Treat a missing profile row as `undefined` and let the gate refuse.

### M5. Client-side upload validation is not the enforcing check

`uploadVendorImage` (`src/modules/vendor/queries.ts:484-500`) validates MIME and a
5MB ceiling **in the browser**. The real enforcement is the bucket configuration
(`20260819180000_storage_buckets.sql:40-48`), which is server-side and correct. The
residual gap is that Storage validates the *declared* `content-type`, so arbitrary
bytes can be stored in `public-media` under an `image/png` label. They are served
from the Supabase origin with that content type, so this is not XSS against the app
origin — it is unmoderated file hosting on the project's domain.

**Fix.** Accept as a known limitation, or add server-side magic-byte sniffing on a
route handler and revoke direct client writes to the bucket.

---

## LOW

- **L1.** `GET /api/geocode/reverse` (`src/app/api/geocode/reverse/route.ts:75`) is
  unauthenticated. Coordinates are validated and rounded and the upstream host is a
  constant, so there is no SSRF — but it is an open proxy against Nominatim's quota
  under Sync's User-Agent. Add auth or a limiter.
- **L2.** `GET /api/banks` (`src/app/api/banks/route.ts:31`) is unauthenticated and
  spends Paystack quota. Low value, trivially cacheable.
- **L3.** Paystack `metadata.userId` is trusted for *which wallet to credit*
  (`src/app/api/webhooks/paystack/route.ts:76,91`). The amount is re-fetched from
  Paystack so nothing can be inflated, but a user who drives Paystack Inline with the
  publishable key can set metadata themselves and credit **someone else's** wallet
  with their own money. Griefing, not theft. Bind the reference to the user instead:
  the route already mints `WALLET_<userId>_<uuid>` (`/api/wallet/topup:47`) — parse
  and compare it.
- **L4.** `credit_wallet_topup` (`20260825110000:59-65`) checks for a replay with a
  `SELECT` before inserting. Under concurrent webhook retries both could see NULL;
  the double credit is prevented by `ledger_transactions.reference` being `UNIQUE`
  (`20260817090300_money_ledger.sql:59`), so the second transaction aborts rather
  than double-crediting. Correct, but it relies on the constraint rather than the
  code — worth a comment, or `insert … on conflict do nothing returning`.
- **L5.** `src/app/(admin)/admin/layout.tsx:5` documents an authorization control
  that does not exist (see H1). A false comment about a security control is a hazard
  of its own.

---

## PASS — verified working

| Item | Verdict | Evidence |
|---|---|---|
| RLS enabled on every `public` table | **PASS** | 72 of 77 tables; the 5 without it are all in `private`, whose schema is revoked from `anon`/`authenticated` and not in `config.toml:13`'s exposed schemas (`20260816225649_conventions.sql:51-58`, with a verify block at `:274`) |
| Policies using `true` / `uid() IS NOT NULL` on others' data | **PASS** | 5 `true` policies exist, all `for select` on public catalogue data with no PII columns (`events` `0006:429-438`, `feature_flags`, `storefront_listings`, `event_ticket_tiers`). The one write is M3. No policy uses `auth.uid() is not null` |
| `profiles` exposure | **PASS** | select is own-row only; the old `using (archived_at is null)` policy is explicitly dropped (`20260814102248:65-70`) |
| service_role key reachable from the client bundle | **PASS** | `SUPABASE_SERVER_ROLE_KEY` is read only in `src/lib/supabase/admin.ts:16`, which is `import 'server-only'`. Every one of its 30+ importers is a server component or action — none carry `'use client'`. No secret is under a `NEXT_PUBLIC_` name |
| Storage: cross-user overwrite/delete | **PASS** | all three buckets authorise on `(storage.foldername(name))[1] = auth.uid()` for insert/update/delete (`20260819180000:59-166`); `verification-docs` and `message-attachments` are private, asserted by a verify block at `:186` |
| Storage: type/size validated server-side | **PASS** (see M5) | bucket-level `allowed_mime_types` + `file_size_limit` (`20260819180000:40-48`) |
| `SECURITY DEFINER` caller validation | **PASS** (see M2) | 149 definer functions; every one taking a caller-supplied id that I read validates — `switch_role:114`, `claim_role`, `set_account_role:93` (super-admin only), `request_withdrawal:104`, `settle_payout:184`, `credit_wallet_topup` (service-role only, `:103-104`). The unrevoked-grant gap is M2 |
| Every API route verifies the session | **PASS** with exceptions | `/api/profile:83,105`, `/api/wallet/topup:26`, `/api/banks/resolve:34`; cron routes use a bearer `CRON_SECRET`; webhooks use signatures. Deliberate exceptions: `/api/banks` (L2), `/api/geocode/reverse` (L1), `/api/webhooks/verification` (M1) |
| Ownership re-checked, not just login (IDOR) | **PASS** | no API route accepts a resource id from the client — `/api/profile` scopes every query to `user.id`. Server actions take ids from the session (`src/modules/verification/record-actions.ts:38-43`), and `request_withdrawal:132` re-checks `bank_accounts.owner_id = auth.uid()` before paying out |
| Admin routes have a real server-side role check | **PARTIAL** | all 20 exported actions in `src/modules/admin/actions.ts` call a guard; 24 of 25 pages call `requireStaff`. See H1 |
| Agent role separated from admin | **PASS** | separate prefix, separate gate (`src/proxy.ts:76`), separate page guard; agents hold no console area. Weakened only by C1 |
| Middleware matcher coverage | **PARTIAL** | matcher (`src/proxy.ts:180`) covers everything but `_next`, static assets, `dev/design-system` and `/api/webhooks`. `/admin` is inside the matcher but absent from `PROTECTED_PREFIXES` — see H1 |
| Payment amount computed server-side | **PASS** | order totals reprice from `listings.price_kobo` live (`20260817090600_rpc_helpers.sql:80-94`), promotions validated server-side (`:97-118`), tickets from `tier.price_kobo * quantity` (`20260826090000:100`), top-up bounded ₦100–₦2,000,000 and charged via Paystack (`/api/wallet/topup:37-45`) |
| Paystack webhook HMAC verified before trust | **PASS** | raw body read before parse, HMAC-SHA512 with `timingSafeEqual`, 401 on mismatch (`src/app/api/webhooks/paystack/route.ts:33-38,110-114`). The amount is re-fetched from Paystack rather than taken from the payload (`:72,81`) |
| Webhook replay double-credit | **PASS** | `ledger_transactions.reference` is `UNIQUE` (`20260817090300:59`) and `credit_wallet_topup` returns the existing transaction on replay (see L4) |
| Wallet balance derived from a ledger | **PASS** | double-entry `ledger_entries` with a deferred balance-assertion constraint trigger (`20260817090300:97-123`); `wallets.balance_kobo` is a cache recomputed by trigger (`:124-137`) and has **no** insert/update/delete policy — the only policy is `wallets_own … for select` (`:434`), so RLS denies all client writes |
| Wallet can go negative | **PASS** | `request_withdrawal` locks the wallet row `FOR UPDATE` and refuses an amount above `balance_kobo` (`20260830110000:110,126`) |
| Payout without a server-side balance check | **PASS** | the only payout entry point is `request_withdrawal`; `settle_payout` refuses non-staff (`:184`), is terminal-state guarded (`:199`) and reverses failures idempotently (`:208`) |
| Hardcoded secrets | **PASS** | no keys, tokens or connection strings in `src/`; all reads go through `process.env` |
| PII in logs / over-broad responses | **PASS** | logs carry ids and amounts, not addresses or phone numbers (`paystack/route.ts:103`, `send-email/route.ts:112`). `verify_card` deliberately returns no personal photo for individuals (`20260905090000:*`) |
| Schema validation on write paths | **PARTIAL** | zod exists (`src/lib/validations/*`) and is applied server-side in `students/actions.ts`, `hostels/actions.ts`, `events/organiser-actions.ts`. The rest rely on hand-rolled narrowing (`/api/profile:133-171`) or on database `CHECK` constraints. Not a finding on its own — the type narrowing in the route is correct — but coverage is uneven |
| `dangerouslySetInnerHTML` with user content | **FAIL → H3** | two sinks: `src/app/layout.tsx:104` (static theme script, safe) and `src/components/account/sync-id-card.tsx:387` (user-controlled, see H3) |

---

## What I could not verify, and why

1. **Which migrations are actually applied to production.** Everything above is read
   from `supabase/migrations/`. C1 in particular depends on `20260905180000` having
   run; if production is still on the `20260830100000` guard, `roles` is protected
   there and C1 is a staging-only finding. Confirm with
   `select prosrc from pg_proc where proname = 'guard_profile_privileged_cols'`.
2. **Live RLS state.** Policies can be altered outside migrations. Confirm with
   `select tablename, policyname, qual, with_check from pg_policies;` and
   `select relname from pg_class where relrowsecurity = false and relnamespace = 'public'::regnamespace;`
3. **`current_user` inside `SECURITY DEFINER`.** My reading of C1's blast radius
   relies on the repo's own recorded observation
   (`20260830100000_fix_role_guard.sql:24-29`) that `current_user` is `authenticated`
   even inside definer RPCs under the new Supabase API keys. That is unusual for
   Postgres and I could not test it. **If it is no longer true, `switch_role` works,
   and C1 escalates to immediate self-service super-admin.** Test it before
   deciding C1's priority — it is the single highest-value check on this list.
4. **Whether Upstash is provisioned.** H2 is moot in one direction only: if the env
   vars are absent, every limiter is a no-op *by design* (`rate-limit.ts:18-22`), so
   wiring them up without provisioning changes nothing.
5. **Storage bucket state in production** — `public` flags and MIME allowlists can be
   changed in the dashboard, independently of `20260819180000`.
6. **Paystack dashboard configuration** — whether the webhook URL is set, whether
   test keys are live, and whether transaction-initialisation from the browser with
   the publishable key is permitted (bears on L3).
7. **No dynamic testing was performed.** No request was made, no SQL executed. Every
   exploit described is derived from source; none has been demonstrated.
