# Working on Sync — agent handoff

**For whoever picks this up next, human or agent.** This is the file that keeps two people (and
two Claudes) from building contradictory things. It is the *how* and the *where we are*. The
*what* lives in the other docs, listed below.

Last updated: **18 September 2026**.

> Keep this file current. If you change an invariant in [§4](#4-invariants--do-not-contradict-these),
> change it here in the same commit. A stale handoff is worse than none, because it is trusted.

---

## 1. Read order

Do not read all of these. Read the two that cover what you are touching.

| File | What it answers | Lines |
| --- | --- | --- |
| `AGENTS.md` | **Next.js 16 is not the Next.js you know.** Read `node_modules/next/dist/docs/` before writing framework code. | 5 |
| `docs/BACKEND_BLUEPRINT.md` | Every table, every RLS policy, the money ledger. The design. | 1489 |
| `docs/DATA_LAYER.md` | How the front end talks to it. The wiring. | 184 |
| `docs/ADMIN_ACCESS.md` | Scoped staff roles — areas, grants, levels. | 187 |
| `docs/SECURITY-REVIEW.md` | Audit as of 2026-09-02, with findings. | 341 |
| `ROUTE_MAP.md` | Every route and who may open it. | 93 |
| `BACKEND_CONNECTION.md` | Screen-by-screen wiring plan. | 429 |
| **this file** | House rules, traps, current state, open threads. | — |

---

## 2. The product, in one page

Sync is a student-services platform for **KWASU / Malete, Nigeria**: hostels, food delivery,
events, and a field-agent network that physically verifies listings.

**The roles.** `student`, `landlord`, `vendor`, `rider`, `event_manager`, `agent`, `creator`,
`admin`, `super_admin`.

**Two things happen at a property, and they are not the same thing.** Getting this wrong has
already cost a rebuild:

- **Verification visit** — the agent goes **alone** to prove a listing is real. Nobody else was
  there, so *photographs are the entire evidence base*: photos of the place, a walkthrough video,
  and a photo of the agent at the building. All three are required.
- **Student inspection** — the agent and the student walk through **together**. The student is the
  witness and confirms it themselves, so the agent files an **outcome only**
  (`viewed` / `student_no_show`), never photos. Asking for photos here is friction with nothing on
  the other side of it.

**Inspections are claimed, not assigned.** Paid viewings go on an open board; the fastest agent to
offer a time wins it. The student then confirms that time or it returns to the board. An agent who
lets one lapse **cannot claim that same inspection again** — enforced by
`unique (inspection_id, agent_id)` on `inspection_claims`.

**Money.** Commission is frozen at escrow creation and deducted at release:

| Flow | Commission |
| --- | --- |
| Goods, delivery | 5%, capped ₦2,000 |
| Rent | 2.5%, **uncapped** |
| Inspections | **0%** — the agent keeps the fee in full |

Landlords choose `hostels.fee_mode`: **`absorb`** (commission comes out of their rent) or
**`pass_on`** (added to what the student pays). The inspection fee is **₦5,000 at KWASU**, paid by
the student, and it is **only** charged if they book an inspection — it is not a mandatory fee on
every booking. One free reschedule; after that a cancellation forfeits to Sync.

All payouts land in **user wallets** — agents, landlords, vendors — and student refunds go to their
wallet too. Source of truth for the numbers is `20260902090000` and `20260909090000`, not this
table. Verify before you rely on it.

**Paying is what makes an inspection live.** `confirm_inspection_payment` sets the inspection to
`scheduled`, and `open_inspection_board` lists only `scheduled` inspections with no agent yet — so
payment is what puts the job in front of agents. An unpaid request is invisible to every one of
them. Any copy saying a student pays *after* an agent confirms is wrong; that exact wording was live
on the hostel page and left students waiting for a confirmation their own payment triggers.

### Room holds

A landlord accepting a request starts a **24h hold** (`hold_interval()`), and a student may hold
**3 hostels at once** (`max_holds_per_student()`). Both predate this doc — check the functions, not
this paragraph. `20260911090000` added three rules on top:

- **Activity extends a hold, up to a ceiling.** A non-system message in the booking's thread pushes
  the deadline 24h from that message, but never past `max_hold_interval()` (72h) from the lock.
  Without the ceiling one "hi" a day parks a room forever — `sync_booking_hold`'s verify block
  asserts the ceiling survives, because a rewrite that drops it reintroduces that silently.
- **Lapses are counted; a second round is a flag.** At `lapse_flag_threshold()` (6, i.e. two full
  rounds) the student is flagged, staff are notified, and they are deprioritised for 7 days. They
  are **never blocked** — a blocked student just makes another account.
- **A deprioritised student's hold is *soft*.** `bookings.soft_hold` is excluded from
  `bookings_one_hold_per_room_idx` and from `hostel_room_state`, so their request does not take the
  room off the market. The cost of gaming the board is losing races, not losing access.

The flag is **deliberately invisible to the student**. That is why `booking_conduct` is its own
table rather than columns on `profiles` (which its owner can read), why it has a staff-only policy,
and why `anon` has no grant on it at all. Do not add a student-facing policy or grant.

`expire_stale_holds()` is what releases lapsed holds and counts the lapses. It had existed since
`0006` with **nothing ever calling it** — now driven hourly from `.github/workflows/escrow-release.yml`
via `/api/cron/expire-holds`. Read paths are self-healing (`reserved_until > now()`), but the
per-room unique index cannot test a timestamp, so an unswept hold blocks the room while the page
shows it free.

---

## 3. House rules

These are the conventions the codebase already follows. Match them or you will produce something
that reads as foreign.

### Comment the *why*, never the *what*

This codebase carries unusually heavy prose comments, and they are load-bearing. The rule: a
comment explains **why this is the way it is**, and especially **what went wrong when it was the
obvious way**. Look at the top of `src/proxy.ts` or `src/components/layouts/user-menu.tsx` for the
register. Do not write `// set the role` above a line that sets the role.

When you fix a bug, the comment records the bug. That is how the next person avoids re-introducing
it — and it is how this file stays short.

### Probe the live database; do not trust the source

**This is the single highest-value habit in this project.** Reading migrations tells you what was
*intended*. Querying the live database tells you what is *true*. Four production bugs were found
this way that no screen would ever have shown:

- `anon` could not read `hostels` **at all** — every public listing page was empty for
  signed-out visitors.
- `platform_escrow` was never credited for inspection fees, so it drifted negative while every
  individual transaction still balanced.
- `wallets.pending_kobo` was read in six places and written in none.
- A missing CSP `media-src` silently blocked every walkthrough video.

Probe with the service-role key from `.env.local` against `/rest/v1/`. Keep throwaway scripts in
the scratchpad, never in the repo.

### Migrations

- **Verify blocks.** End a migration with `do $$ ... raise exception ... $$;` that asserts the thing
  you just did is actually true. `20260910210000_freeze_roles.sql` asserts on `pg_proc.prosrc`
  because that exact line had been silently dropped by a rewrite **twice** before.
- **No role switching inside a migration.** `SET LOCAL ROLE anon` without a clean restore breaks the
  CLI's own bookkeeping INSERT (`permission denied for schema supabase_migrations`). Assert on
  `pg_policies.qual` and function privileges instead.
- **Changing a function's return type needs an explicit `drop function if exists` first**, or you
  get `42P13`.
- **Filenames are a sequence, not a calendar.** They run ahead of the real date. Do not read them
  as when something happened.
- **Two FKs to the same table make a PostgREST embed ambiguous, and it fails the WHOLE query.**
  `renewal_requests` references `bookings` twice (`booking_id`, `booking_created`), so
  `renewal:renewal_requests(...)` returns **PGRST201** and the entire select errors — not just that
  column. Because it was in the shared `BOOKING_SELECT`, every bookings read broke at once and the
  hostel vanished from the dashboard, the bookings list and the apartment card simultaneously. That
  is what an unhandled query error looks like from the outside: not an error, an empty app. Name the
  constraint — `renewal_requests!renewal_requests_booking_id_fkey(...)` — and never simplify it back.
  **Test a changed select against the live database before trusting it**; `tsc` cannot see this.
- **Two branches can claim the same migration version, and the second one silently never runs.**
  `20260912120000` was `notification_claims.sql` on main and `store_verification_visits.sql` (987
  lines) on `verification-visits`. Both were pushed to the SAME remote. Only one version row can
  exist, so whichever landed first won and the other was skipped as "already applied" - with
  `migration list` reporting everything fine. That is why `claim_notification` did not exist after a
  successful push, and why `20260912210000` had to be written to create it. The orphan was deleted
  at the merge; its content was already reproduced idempotently by the later file.
  **Before starting a migration, `git fetch` and check no branch has taken your timestamp.**
- **Never edit an applied migration. Ever.** It does not re-run, so the file quietly stops
  describing the database and every later `db push` is a no-op against a remote that disagrees
  with the repo. The fix is always a NEW migration.
- **A new view in `public` is granted to `anon` whether you ask or not.** Supabase's default
  privileges on that schema do it, so `grant select ... to authenticated` alone leaves anon holding
  select too - true of `wallet_transactions` since 20260823090000. No rows leaked, because that
  view's own `auth.uid()` predicate returns empty for anon, but the grant was wrong and one edit to
  that where clause away from a public ledger. `revoke all ... from anon` explicitly after every
  create, and assert it.
- **Functions in `private` are unreachable from the app.** PostgREST exposes `public` and
  `graphql_public` only (PGRST106). Put the function in `public` and lock it with
  `revoke`/`grant execute ... to service_role`, the way `credit_wallet_topup` does; keep the TABLE
  in `private`.

### Types

```powershell
npx supabase gen types typescript --linked --schema public | Out-File -Encoding utf8 src/types/database.types.ts
```

The `| Out-File -Encoding utf8` is **not optional**. A plain PowerShell `>` writes UTF-16LE, CI
reports the file as binary, and lint goes red for reasons that look nothing like the cause.

### Before you say you are done

```powershell
npx tsc --noEmit -p tsconfig.json
npx eslint <the files you touched>
```

`eslint.config.mjs` ignores `.next-*/**`. If you build to a scratch dist dir
(`NEXT_DIST_DIR=.next-verify npm run build`), run `git checkout tsconfig.json` afterwards — Next
rewrites `include` to point at whatever dist dir it last used, and committing that breaks
typechecking for everyone else.

### Scripted edits

If you patch files with a Node script, `String.replace()` treats `$` in the **replacement** as an
escape. A SQL `$$` body silently collapses. Use a replacer function — `s.replace(needle, () => text)`
— and `$fn$` tags rather than bare `$$`.

---

## 4. Invariants — do not contradict these

**This section is the point of the file.** Each of these is load-bearing and at least one has been
broken by accident already.

1. **A policy expression runs as the CALLER.** Any function or table an RLS policy touches must be
   reachable by *every* role the policy applies to, or reached through a `SECURITY DEFINER` wrapper.
   `is_assigned_agent()` exists solely because the `hostels` policy needed to ask about
   `verification_visits`, which `anon` has no grant on.

2. **`profiles.role` is the hat you are WEARING. `profiles.roles[]` is what you HOLD.**
   `switch_role` moves the first to a member of the second.

3. **`roles` is frozen against client writes** by `guard_profile_privileged_cols`
   (`20260910210000`). Removing that one line re-opens a complete self-service path to super admin:
   PATCH your own `roles`, then `switch_role` — which is `SECURITY DEFINER`, so the guard never
   fires on its write. This has been fixed and silently lost in a rewrite **twice**. Do not touch
   it without reading that migration's header.

4. **The proxy admits a dashboard on a role you HOLD — except `/admin`.** Every other dashboard is
   scoped by ownership in RLS (`landlord_id = auth.uid()`), so a landlord who is also staff sees
   exactly their own rows whichever hat is on. But `requireStaff()` and `is_staff()` both read the
   **worn** role, so admitting a held-but-unworn admin would let the proxy wave through a page that
   then redirects to `/403` itself. That is the `activeOnly` flag in `src/proxy.ts`.

5. **A hat is a view, not a grant.** Wearing one must never revoke a dashboard another one earned.

6. **An area must not advertise a route that does not exist.** `AreaSpec.href` is optional
   precisely so `payouts` and `promotions` — real grants with no screen built yet — can omit it.
   The console root redirects to the first *held area with an href*; an area pointing at a 404 would
   send a scoped admin straight into it.

7. **The console root cannot require one particular area.** `/admin` hard-required `overview`, so a
   reviewer granted only Finance hit `/403` on sign-in and on every Dashboard click.

8. **Anywhere a hat can be put on, it must be possible to take it off.** The role switcher belongs
   in *every* account menu. It was missing from the marketing header, which made "Student" a one-way
   door for a multi-role account — see [§5](#5-where-we-stopped).

9. **Escrow subjects are mutually exclusive.** `escrow_holds` carries exactly one of `order_id`,
   `booking_id`, `request_id`, `delivery_id`, `inspection_id`.

10. **The ledger balances per transaction.** `assert_ledger_balanced` is a deferred constraint
    trigger requiring sum = 0. Every inbound leg needs its counterpart, or you get the
    `platform_escrow` drift described above.

11. **Verification and inspection evidence are different shapes.** See [§2](#2-the-product-in-one-page).
    Do not add photo columns to inspection reports.

12. **Scrolling is driven by Lenis, not the browser.** `SmoothScroll` wraps the root layout and
    takes over `window` scroll. It runs with `allowNestedScroll: true`, which hands the gesture back
    to any container that genuinely scrolls — so the app's ~73 internal scroll areas keep working
    without annotation, and new ones work automatically. If a container ever does need forcing, put
    `data-lenis-prevent` on it; per-element attributes still win. Do not remove the
    `lenis/dist/lenis.css` import — it sets `html.lenis { height: auto }`, without which the root
    layout's `h-full` makes the page unscrollable. Lenis is not mounted at all under
    `prefers-reduced-motion`.

13. **A guard that freezes a column on UPDATE must also reset it on INSERT.** Every `guard_*`
    trigger was `BEFORE UPDATE` while the 0006 owner policies also allowed INSERT, so a hostel, a
    vendor, a rider, a document or a bank account could simply be *created* verified, and a
    booking created `confirmed` — which minted a tenancy code. `20261113090000` closed all of
    them; its verify block fails if any of those triggers stops firing on INSERT. A new privileged
    column needs a line in both branches, or the table's INSERT revoked.

14. **A client moves a status only along a transition a person may make, and a refused move
    raises.** `guard_booking_privileged_cols` and `guard_order_privileged_cols` hold the whole
    client-side state machine (`20261113090000`). Anything past `awaiting_payment`, any
    cancellation that refunds, and every delivery step belong to SECURITY DEFINER functions. Do
    not go back to reverting silently — that is how a screen reported success for a change that
    never happened.

15. **An escrow hold is `held` only once its money has arrived.** `checkout_cart` creates order and
    delivery holds before payment; they start `unfunded` and become `held` when
    `pay_order_from_wallet` stamps `paid_at` (`20261113120000`). This works because every money
    mover — `release_order_escrow`, `release_delivery_escrow`, `release_matured_escrow`,
    `cancel_order`, `resolve_dispute`, `sync_wallet_pending` — acts only on `status = 'held'`.
    Loosening that test in any of them makes unpaid orders payable again; the migration's verify
    block asserts each one.

---

## 5. Where we stopped

**State: clean.** All 151 migrations through `20260914210000` are applied remotely and present
locally. Branch `verification-visits`, not yet merged or pushed.

> **Migrations keep being applied to the remote with no file committed.** Five turned up on 7 Sep
> (`20260911120000` … `20260912090000`) and eleven more on 14 Sep (`20260912150000` …
> `20260914150000`, the tenancy and notification-preference work). All sixteen are recovered and
> committed. `db push` refuses to work past a remote version with no local file, so **whoever
> applies a migration straight to the remote must commit its file in the same sitting.** If
> `migration list` shows a remote with a blank local, **recover the statements; never run the
> `repair --status reverted` the CLI suggests**, which marks applied work as un-applied.
>
> Fastest recovery, with Docker running:
>
> ```powershell
> npx supabase db dump --data-only --schema supabase_migrations -f mig_dump.sql
> ```
>
> then split the `statements` array back into one file per version. Without Docker, run this in the
> SQL editor and export:
>
> ```sql
> select version, name, statements from supabase_migrations.schema_migrations
>  where version >= '<first missing>' order by version;
> ```
>
> A CSV export mangles box-drawing characters in comments; the dump does not.

### Just finished

**Redesign: green palette, new header, new landing (branch `redesign/green-landing`, Nov 2026).**
Three commits. (1) The whole app moved to the green palette (stone, paper, sage, leaf, moss, forest,
sunflower accent) with a dark-green dark mode; the old token NAMES (`lime`, `ink`, `cream`) are
kept and remapped, see the header of `globals.css`. (2) The public header now carries the full nav
from `config/marketing-nav.ts` (one list for desktop and mobile), a campus picker and Become a
vendor. Campus choice lives in `hooks/use-campus-choice.ts`, separate from the area scope in
`LocationProvider`: anyone may pick any campus, **detection never overwrites a pick**, and a
non-serviced campus shows "we are not here yet". (3) The landing page is rebuilt from the design
canvas: constellation hero, Find tabs with five real cards each (`getLandingRails`), Around you
(real weather via Open-Meteo, server-side), How it works (#how), Why Sync, Reach out (#contact).
The mock ActivityTicker, the newsletter band (fake success) and the FAQ/trust/CTA bands are gone.
**Focus outlines and rings are removed app-wide** at the founder's request; `--shadow-focus` is
still defined if that is revisited.
**The landing is light in every theme** (the design is light): its sections use palette colours
(`bg-stone`, `bg-paper`, `text-forest`), not the semantic tokens, and carry no `dark:` classes.
Header and footer still follow the toggle. **`dark:` follows the toggle** (custom variant at the
top of `globals.css`); before, it followed the OS alone, so OS-dark plus toggle-light painted pale
text on light pages. **Reviews** show as a carousel only when approved rows exist (no seeded
fallback); the first review is written from Reach out. `supabase/checks/landing_content.sql`
reports what each landing tab can show and what lacks a photo.
**Sunflower is for important actions only.** `lime` resolves to SAGE; the primary Button and
deliberate CTAs use `sunflower` by name. Never sunflower on the logo, loaders or icon accents.
**`lime-400`, `lime-500` … are NOT `lime`.** They are Tailwind's built-in palette, and the palette
move left ~80 of them plus a dozen hard-coded `#90d505`s painting the old electric lime (the hostel
price card, vendor screens, every admin chart). All converted on 23 Nov; `globals.css` now also
overrides `--color-lime-50` … `950` onto the green ramp as a backstop. In new code pick by role:
`sunflower` for the main action, `lime` for accent fills, `accent-fg` for accent text,
`accent-fg` + `text-surface` for a solid selected state. Tailwind's other default palettes
(`emerald`, `green`, `amber`, `red`, `blue` …) are still used across the app and are not remapped.
**Browsing is public, doing needs an account.** The module routes (/hostels, /events, /food,
/beauty, /workmanship, /laundry, /hotspots, /search) left PROTECTED_PREFIXES; checkout, orders,
favourites, wallet, /ai, ticket purchase (`/events/<slug>/tickets`) and every dashboard stay
gated. Writes on public pages are gated by the global MutationCache in `lib/query/query-client.ts`:
no session, the mutation throws `SignInRequired` and the page goes to `/login?next=<here>`. A
mutation that must work signed out opts out with `meta: { public: true }` (none exist). **A gated
prefix must also be in RESERVED_HANDLES** (`lib/handle.ts`) or the gate never fires; `ai` was
missing and is now added.
**Money: Sync does not hold student funds.** Where escrow applies, a licensed third-party escrow
partner holds the payment and pays out the vendor and Sync's fee on completion. Paystack is not
named as the escrow (it has no escrow product). Public copy (footer, terms, privacy, how it works,
how verification works, About) says this; keep new copy consistent. **Safety on Sync**
(`/legal/safety`) carries the founder's meet-up and reporting notice, linked from the footer
disclaimer, terms and the Policies menu.
**Around you bento** (`components/around/around-bento.tsx`) is shared by the landing and the top
of /around (the map stays below it). Backed by **`20261124090000_gist_and_polls_v2`** on top of
`20261123120000_around_gist_and_polls` (the first version, applied, then wrongly rewritten in place;
restored to what was applied, and v2 drops and recreates its objects behind a guard that refuses
if any gist post or poll vote exists). **Never edit an applied migration; add a new one.** Parsed
with Postgres's parser (pglast), never executed; verify blocks at the end:
- **Gist** shows the poster's `profiles.display_name` (set via `set_display_name()`, unique, or
  "Anonymous"). **Clients have NO select on `gist_posts`** (it holds `author_id`); read through
  `gist_feed()`, write by insert (trigger sets author, cleans text: masks words from
  `gist_masked_words`, removes phone numbers, 5/hour). Public = last 24h and newest 50 per
  campus; alerts pinned 2h; kept 72 days for staff, then `purge_gist()`. 3 reports hide.
- **Reveal**: `reveal_gist_author()` is super admin only, needs a written reason, logs to
  `gist_identity_reveals`. Policy: only for law enforcement. Called as the user, never service role.
- **Daily stats**: `compute_gist_daily_stats()` + purge run from `/api/cron/gist-daily`
  (vercel.json, 23:10 UTC). Counts only, no AI. Shown at `/admin/gist` (area `gist`).
- **Polls**: any signed-in user via `create_poll()` (3/day); single, multi (up to N), ranked
  (top N, points); scope open (votes tagged near/far) or local (near only). **Voting needs no
  account**: only `/api/polls/vote` calls `cast_poll_vote()` (service role), one ballot per
  httpOnly cookie, per localStorage device key and per account; vicinity = within 5km of one of
  the campus's `areas`. Creator kept in `poll_creators`, unreadable by clients.
- **Emergency alerts: super admins only at launch** (decided, not built yet). GIFs: later.

**Client writes locked, unpaid escrow made inert (13 Nov, `20261113090000` + `20261113120000`,
NOT YET APPLIED).** Fixes the first five findings of the 8 Nov review: INSERT guards on every
privileged table, no client INSERT on `orders` / `order_items`, the viewing fee read from the
hostel (and `hostels.inspection_fee_kobo` frozen against landlords), booking and order
transitions enforced, the rider's direct delivery update dropped, and `unfunded` holds for unpaid
orders. Invariants 13–15. Written and syntax-checked with Postgres's own parser, **never
executed** — there is no Docker on the machine that wrote them. Both migrations carry verify
blocks and run in one transaction, so a failed assertion rolls the whole file back. Both print
`AUDIT:` notices for damage the old holes may already have done (forged scheduled inspections;
holds released or refunded for unpaid orders) — read the push output, then decide what to do
about any rows they count. Expect, after applying: a vendor gets "This order has not been paid
for yet" for unpaid orders (the button is now hidden), and any client code that relied on a
silently-reverted status change will now see an error.

**One decision path for every visit (`20260914180000`)** — `decide_verification_visit` replaces
`decide_store_visit` and the old two-statement `decideHostelVisit`. Staff only, a filed report
first, and the subject's flag moved in the same transaction: `hostels.verified`,
`storefronts.verified_at`, or nothing. It now tells the landlord the outcome, which the hostel path
never did. **A vendor-wide visit records its finding and moves no status**: `verification_status` is
decided from documents by `set_verification_status`, and a photograph must not become a second road
to it. The verify block asserts the function never mentions `verification_status`.

**The bell filters by dashboard (`20260914210000`)** — the read side of `20260911150000`. The list,
`get_unread_counts(p_role)` and `mark_notifications_read(p_ids, p_role)` all take the same role,
from `NOTIFICATION_ROLE` in `config/dashboard-nav.ts`. **Keyed on the dashboard being rendered, not
the worn role**, because of invariant 4. Unstamped rows show everywhere; staff is one hat
(`admin` + `super_admin`).

**`current_user` inside SECURITY DEFINER is NOT `authenticated`.** `20260830100000`'s header says
otherwise, and so does the comment on `setVendorVerification`. Both are wrong, which the live data
shows: `decideHostelVisit` set `hostels.verified = true` on 4 and 6 Sep with a service-role write,
through `guard_hostel_privileged_cols`, which reverts that column whenever `current_user` is
`authenticated`. `20260910210000` has it right. Guards keyed on `current_user` stop clients and let
definer functions through.

**Store verification visits (`20260912120000`)** — creating a storefront now queues its own visit.
The flow *sign up → onboarding → create store → an agent goes and looks* had its first three steps
built and nothing joining them to the fourth: `assign_verification_visit` could take a vendor, but
only if a staff member noticed a store had appeared, and no vendor address had ever been checked.

- `verification_visits.storefront_id` — the subject is now exactly one of **three**. `vendor_id` is
  the *brand*, so it says who to visit and not where; a business with two branches had two
  addresses and one row for both.
- An `AFTER INSERT` trigger on `storefronts` writes an unassigned `Not Visited` row and alerts
  staff. **The row is the request.** Deliberately asymmetric with hostels, where "no row" means
  unvisited and the queue derives the list by subtraction — nobody reads `storefronts` looking for
  work, and a queue you have to compute is one that silently empties.
- `storefronts.verified_at` + `decide_store_visit`, which moves the visit and the store together in
  one transaction and refuses a visit with no filed evidence. `guard_storefront_privileged_cols`
  freezes both columns against *every* client-side caller including the owner — a shop cannot
  certify that it exists.
- `/admin/verify-visits` renders store visits. Its `AdminVisit` was hostel-shaped, so the
  vendor-wide case reachable since `20260905120000` had always rendered as "Unknown hostel".

**Two bugs fixed on the way, neither part of the store work:**

- `flag_visit_fraud` branched *hostel, else vendor*. A store visit is neither, so it read a null
  `vendor_id`, blocked nobody and returned success.
- **Standing an agent down never told the agent.** `20260907090000`'s own header says they must be
  told "otherwise they turn up at a stranger's gate believing they are expected", and only the
  *swap* branch did it. The Stand down button notified the owner and left the agent still expecting
  to go.

**The booking chain was broken at the landlord's Accept button (UNCOMMITTED).** A student's request
sat at `requested` forever, so no hold started and their Pay button — which only renders at
`awaiting_payment` — had nothing to render on. The cause was one missing prop:
`src/components/dashboard/role-dashboard.tsx` rendered `PendingRequestList` with no `onAccept`, and
that component **defaults to `acceptOrderMock`** — a 500ms timer that changes nothing and rejects 8%
of the time at random. So `/landlord` ran a demo while `/landlord/requests` ran the real
`acceptBookingRequest` on the same rows. Fixed via a `pendingList` slot and
`PendingBookingRequests`. Related, in the same pass:

- `acceptBookingRequest` now accepts from `interested` as well as `requested`. Both screens list
  enquiries as needing a decision, and Accept on one answered "no longer waiting on you".
- The decline reasons were a food vendor's only — a landlord chose between *Out of stock* and
  *Kitchen too busy*. `BOOKING_DECLINE_REASONS` is theirs; the popover takes a `reasons` prop.
- `PendingRow` now shows the thrown message instead of swallowing it into "try again".

**Booking a viewing was a `setTimeout` and an `alert()` (UNCOMMITTED).** `/hostels` collected a
name, a phone and a time, waited a second, and said an agent would call. Nothing was inserted and
nothing was charged — and the webhook that finishes this (`purpose: 'inspection_fee'` →
`confirm_inspection_payment`) has always existed, with **nothing anywhere starting such a charge**.
Now: `POST /api/inspections/pay` (amount read server-side from the row's snapshotted `fee_kobo`,
never from the client) plus `components/hostels/book-viewing-dialog.tsx`, used by both `/hostels`
and `/user/bookings`. The viewing button is also offered while a booking is still `requested` — an
inspection needs no landlord and no hold, and telling students to wait was the reason none of them
saw a building.

**The dashboard's featured booking was five hardcoded props (UNCOMMITTED).** `/user` rendered
`BookingBillboard propertyName="Tanke Crescent Lodge" room="Room 4B"` above the student's real
bookings, with all three buttons unwired. It reads `useMyBookings` now, features whichever booking
needs something, and renders nothing when none does.

**Notifications: none of them were about money, and `private.notify` will not tell you about
your own actions (UNCOMMITTED, migrations APPLIED).** Two separate causes for "I see no
notifications". First, `private.notify` returns early when the recipient is `auth.uid()` — sound in
general, and it means a landlord testing on one account sees nothing on either side. Second, and
worse: **not one money event notified anybody**. Every producer in `20260823100000` is about a
*status*; `credit_wallet_topup`, `confirm_inspection_payment`, every `release_*_escrow` and every
refund had zero calls between them.

`20260912150000` puts one trigger on `private.ledger_entries` rather than editing eight money
functions across four migrations — everything ends in `post_transaction`, so this covers the paths
that do not exist yet. `private.notify_money` is the deliberate exception to the self-suppression
rule: a payment confirmation is a record, not news.

**`notifications.kind` is a CHECK constraint, and `notify` swallows its own exceptions.** Those two
together make a wrong kind fail *invisibly, forever* — the insert raises, the handler downgrades it
to a warning, and the alert is silently dropped with only a Postgres log line. That shipped:
`notify_inspection_paid` passed `'inspection'`, which is not one of the nine permitted values, so
every paid-viewing alert vanished. `20260913090000` fixes it to `'payment'` and makes
`notify_money` validate the kind up front. **A tenth kind means four edits: the constraint, the TS
union, the icon map, and `PREFERENCE_CATALOGUE`.**

**Notification preferences exist now** (`20260913090000`). `/user/notifications` had a Preferences
tab holding four toggles in local state — *Hostel Allocations*, *Laundry Metrics*, *Event Ticket
Channels*, *System Diagnostics* — none of which named a kind anything actually sends, so they would
have muted nothing even once persisted. **Absence means ON**: rows are stored only to say no.
`payment` and `system` ignore the in-app preference on purpose — a debit alert is how somebody
notices a payment they did not make, and a silenceable account is the first thing an attacker
silences. Email is stored and **no sender reads it yet**; the screen says so.

**Generated types were regenerated** against the remote (`supabase gen types typescript
--project-id inehfobzuworypywaowy --schema public`), which cleared the hand-written `rpc()` casts
in `apply-charge.ts`. `inspection-actions.ts` still has one.

**Nothing ever credited a wallet except the webhook (UNCOMMITTED).** `/api/webhooks/paystack`
was the only path by which money landed, and Paystack can only post to a public URL — so on a dev
machine a top-up succeeded on Paystack and the wallet stayed at zero **forever**, under a toast
reading "your wallet will update shortly". Confirmed, not inferred: two ₦500,000 charges sat
`success` on Paystack against a zero balance. Now there are two doors into one room —
`modules/payments/apply-charge.ts` holds the dispatch, and both the webhook and the new
`POST /api/payments/verify` (the payer's own browser, on return from checkout) call it. Both
re-verify with Paystack; every effect is idempotent by reference, so whichever lands second is a
no-op. The webhook is still the backstop for anyone who closes the tab. The same fix carries the
inspection fee, which had exactly the same single point of failure.

Those two charges were credited by hand through `credit_wallet_topup`, at the user's explicit
request. Balance and ledger both reconcile.

**A trap when probing this: `public.wallet_transactions` is a view with
`w.owner_id = (select auth.uid())` in it.** A service-role probe returns `[]` no matter what the
ledger holds, which reads exactly like "nothing was ever written". Check `wallets.balance_kobo`,
or query as the user. The real ledger is `private.ledger_entries`, and `private` is **not exposed
over PostgREST** (PGRST106) — so a REST probe cannot see it at all.

**Wallet top-up receipt email (UNCOMMITTED, needs a migration applied).** There was no email on a
top-up at all — never built, not broken. `src/emails/wallet-topup-email.tsx` plus a send from the
credit path. **It will not send until `20260912120000_notification_claims.sql` is pushed**: two
paths now apply each charge, and the money RPCs absorb repeats silently while an email cannot, so
the send is gated on `public.claim_notification(reference, 'email')` returning true exactly once.
Without the function the claim errors and the code deliberately sends **nothing** rather than risk
a duplicate receipt about money. (First draft put that function in `private` — it typechecked and
would have failed at runtime, because PostgREST only exposes `public`. Table private, function
public, locked by grant, same shape as `credit_wallet_topup`.)

**Paystack's modal hung on a blocked fetch (UNCOMMITTED).** `PAYSTACK_ORIGINS` was one constant
reused for four CSP directives, and it named `js.paystack.co` and `checkout.paystack.com` only. The
script and the iframe were allowed, so the popup **opened** — then `inline.js` called
`https://api.paystack.co` from our page, `connect-src` blocked it, and a blocked fetch renders as
the same spinner a slow network does, forever. Now split per directive in
`src/lib/security/headers.ts`. *Confirm against the browser console before treating this as
closed — it was diagnosed from the policy, not from a violation report.*

**Message landlord had nowhere to go.** Every one of those buttons fired `openChat(id)`, and the
only listener — `ChatWidget` — was deleted. `/user/messages` now reads `?c=<id>`.

**Multi-role access (committed, `f81c5c5`)** — a landlord invited onto staff was locked out of both
dashboards. Four separate bugs, all fixed: the console root requiring `overview`; the proxy gating
on the worn role only; two areas advertising pages that were never built; and `roles` being
client-writable (invariants 3, 4, 6, 7).

**The `admin@letsyncyou.com` demotion** — the account showed `role: student`. Not an attack. It
holds `["student", "super_admin"]`, the switcher lists both, and one tap on **Student** writes
`profiles.role` persistently. It then landed on the public site, whose menu had no switcher, and
`/admin` refused it because `requireStaff` reads the worn role. A one-way door. The switcher is now
in the marketing menu too. **The live account may still need switching back** — `/user` → avatar →
Switch account → Admin, or:

```sql
update public.profiles set role = 'super_admin'
 where id = '47d3f883-4d52-4f6b-946f-fe1347348cc4';
```

**Agent filing on bad network (UNCOMMITTED — 4 files)** — the field team could not file from the
property. Changes: the whole visit card now opens the filing sheet on tap; photo, video and selfie
are all required; and `src/modules/hostels/compress.ts` shrinks photos on the phone before upload
(1600px long edge, q0.72), with 3 retries on transport failure. Compression runs **before** the
size check, which also fixes a live bug — a 6MB phone photo used to be rejected outright by the 5MB
cap.

---

## 6. Open threads

Roughly in priority order. Nothing here is started.

**Landing gaps the redesign left honest rather than faked.**
- No paid placement exists, so Find cards are badged **Featured** (from `hotspots.is_featured` or a
  hostel `ribbon`), never "Sponsored". Build a sponsorship product before using that word.
- Reach out opens the visitor's email app (`mailto:`); there is no contact table or endpoint.
- The gist feed, communities, creators, careers pages, Sync Internet and Dispatch are "soon" in the
  nav with no href. Give each an href in `config/marketing-nav.ts` when it ships.
- Module pages ignore `?q=` from the Find bar except `/search` (hostels).

**`authenticated` cannot reach schema `private`, and three call sites forget it.**
`20260816225649` revokes that schema from clients and grants usage to `service_role` alone. Several
migrations then `grant execute` on a `private.*` function to `authenticated` — which does nothing,
because EXECUTE on a function in a schema you have no USAGE on is not a permission. Anything
evaluated **as the caller** that reaches into `private` therefore fails with a raw 42501, which the
UI renders as "You do not have permission to do that."
- Fixed 18 Sep: both plan-limit triggers, via `public.effective_plan` (`20260918090000`). This is
  why `storefronts` never held a row — **nobody could create a store, ever**, and so nobody could
  create a listing.
- Fixed 12 Oct, because hiding unverified vendors makes them reachable (`20261012120000`):
  `listings_write_own`, `storefront_listings_write_manager` and `promotions_write_own`, via
  `public.i_have_storefront_scope` / `i_manage_storefront` / `i_have_business_scope`. They were
  safe only while the permissive select policy beside them was always true; once a select policy
  can be false for a row they are evaluated, and a student's query would have errored instead of
  filtering. **That is the general lesson: tightening a select policy can expose an unreachable
  `private.*` call in a sibling `for all` policy. Check the siblings first, and test as a signed-in
  stranger — the self-test in that migration is the pattern.**
- **Still open:** `storefronts_update_staff`, `orders_select_own`, `orders_update_vendor`,
  `storefront_staff_read`, `tiers_write_own` and the messaging policies still consult `private.*`
  and are OR-ed behind a disjunct that is true for an owner, so Postgres short-circuits and never
  evaluates them. **A MANAGER updating a branch or reading an order will hit it.** Same fix: a
  `public` SECURITY DEFINER wrapper, not `grant usage on schema private`.
- The rule to apply when writing either: invoker-rights code — a trigger that tests `current_user`,
  or any RLS policy — may only touch `public`.

**Unverified vendors are hidden from students (12 Oct), but can still be ordered from by a crafted request.**
`20261012120000` hides them everywhere a student reads — `vendor_profiles`, `storefronts`, `listings`,
`storefront_listings`, `services`, `promotions`, `nearby_storefronts`, `campus_pulse` — mirroring
`hostel_is_visible`. Landlords (`category = 'landlord'`) are deliberately exempt; `hostels` has its own rule.
- **Anything public that reads through `createAdminClient()` bypasses all of it** and must apply
  `verification_status = 'verified'` itself — see `landing-data.ts` and `around-data.ts`.
- **Open:** `checkout_cart` is owner-rights and calls `store_accepting_orders` as its owner, so a hidden
  vendor is still orderable by id. Needs a verified check inside `store_accepting_orders`.
- Reviews are not hidden. A manager of ANY branch of a vendor can read all of its branches.

**Money — the largest gap.**
- **Paystack Transfers is not implemented anywhere.** Accept, verify and the signed webhook are all
  built, but no money can *leave*. `payout_requests` rows are written and nothing consumes them.
  Every wallet balance is currently a promise the platform cannot keep.
- No reconciliation between Paystack and the ledger.
- Nobody has checked whether the Paystack balance covers wallet + escrow liability. Transfers draw
  on the Paystack balance, so the **settlement schedule** decides whether payouts can run at all.

**Left undone by the verification-visit work.** Named here rather than rediscovered.
- **The store flow has never been run end to end.** Every migration's verify block passed, which
  proves the catalogue: the trigger exists, the guard freezes `verified_at`, one decision function,
  one overload of each notification RPC. It does not prove behaviour, and `storefronts` is still
  empty live. **`supabase/checks/store_verification_flow.sql`** is the test: it signs up a staff,
  vendor and agent, creates a store, and asserts the visit is queued, the owner cannot verify, the
  agent is told, a decision sets `verified_at`, and the bell counts differ by dashboard. One
  rolled-back transaction, **local database only**; the run command is in its header. It has
  **never run**: `supabase start` filled the C: drive pulling images and Docker went read-only. Free
  roughly 10 GB first. Expect to fix a column or two in its `auth.users` insert on the first run.
- **"View all notifications" 404s on most dashboards.** It links to `<base>/notifications`, and only
  `/admin/notifications` and `/user/notifications` exist. A vendor's lands on
  `/vendor/notifications`.
- **The documents review screen does not show visit findings.** A vendor-wide visit's outcome is
  recorded on the visit so the documents reviewer can weigh it, but `/admin/vendors` does not
  surface it yet.

**Known and unfixed.**
- **The vendor's Accept/Decline is still `acceptOrderMock`.** `/vendor` renders
  `PendingRequestList` with no handlers, exactly as `/landlord` did, so a vendor accepting an
  order changes nothing and fails at random. The landlord half is wired; there is no vendor
  endpoint to wire this to yet. Until there is, treat every screen rendering that list without
  `onAccept` as a demo — the buttons are indistinguishable from working ones.
- **A viewing can only be paid for by card.** `/api/inspections/pay` goes to Paystack; there is no
  wallet path, because `confirm_inspection_payment` is driven by the webhook and takes a payment
  reference. Paying a ₦5,000 fee from a funded wallet needs an RPC that does not exist.
- **An unpaid inspection has no second chance to pay.** The row survives a cancelled checkout as
  `pending_payment` on purpose, and `ViewingConfirm` does not list or offer to pay for one — so
  the student's only route back is to book another. A "pay for this viewing" button on that state
  is the missing piece.
- `switch_role` writes **no audit row** (`20260830090000`, line ~114). The most
  privilege-relevant self-service write in the system leaves no trail — which is exactly why the
  demotion above could not be traced to a time or a device.
- The **mobile** marketing menu (`mobile-menu.tsx`) still has no role switcher. It is a sheet, not a
  dropdown, so `RoleSwitcher`'s menu items do not drop straight in. Not a trapdoor — you can still
  switch from `/user` — but the same gap.
- **Resumable uploads (TUS)** for walkthrough video. Compression cannot help video; a drop at 80%
  still restarts. This is the real fix for the field team and needs a dependency plus bucket config.
- **Email deliverability** — diagnosed and being fixed. Sign-in codes were landing in spam because
  auth email used Supabase's **built-in sender**: a Supabase-owned address on shared
  infrastructure, covered by none of this domain's DKIM/SPF/DMARC, rate-limited to single digits
  per hour. It is on by default and needs no configuration, which is exactly why nobody noticed.
  The fix is **custom SMTP through Resend** (Dashboard → Project Settings → Authentication → SMTP
  Settings; username is the literal string `resend`, password is the Resend API key).
  `src/app/api/auth/send-email/route.ts` is a working Send Email Hook that does the same delivery
  with our own template — it is deliberately **disabled**, and enabling it replaces the email
  templates outright rather than layering on SMTP. Read that file's header before switching it on.
  The DMARC aggregate reports arriving for `letsyncyou.com` are normal and currently all-pass;
  they are requested by `rua=` in the domain's own DMARC record.
- Several columns and RPCs are still hand-typed or `loose()`-cast. Regenerate types (see
  [§3](#3-house-rules)).

---

## 7. Handing off

Leave the next agent what you would want:

1. **Commit with the *why* in the message**, not just the file list.
2. **Update [§5](#5-where-we-stopped) and [§6](#6-open-threads)** in the same commit.
3. **Say what you did not do.** Scope you dropped is the thing most likely to be silently lost
   between two agents. If you left something blocked or half-built, name it in §6 rather than
   letting the next person rediscover it.
4. **If you broke an invariant on purpose, edit [§4](#4-invariants--do-not-contradict-these).**
   An invariant nobody updated is how the same bug gets fixed three times.
