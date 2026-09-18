# Sync — Product Documentation

**Your campus, in one place.**

A verified marketplace for Nigerian student life — hostels, food, events, beauty, trades,
laundry and the hotspots around campus. Built by **Raavon Limited**, launching first at
**Kwara State University, Malete**.

> This document explains what Sync is and why it works the way it does. To work on it,
> see [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md). For routes see
> [`ROUTE_MAP.md`](../ROUTE_MAP.md); for the rules that must not be broken while changing
> it, see [`WORKFLOW.md`](WORKFLOW.md); for schema and RLS, see
> [`BACKEND_BLUEPRINT.md`](BACKEND_BLUEPRINT.md) and [`DATA_LAYER.md`](DATA_LAYER.md).

---

## 1. Product summary

Sync is a single, verified place for a Nigerian student to find somewhere to live, order
food, buy event tickets, book a hairdresser or an artisan, and pay for all of it without
handing cash to a stranger.

Three things make it more than a directory:

1. **Somebody has physically been there.** Listings are visited by a Sync agent before
   they carry a trust badge. The badge means a person stood in the building, not that a
   form was filled in.
2. **Money is held, not handed over.** Every payment sits in escrow until the thing is
   delivered — a room moved into, an order received, a job done — with a refund window
   and a dispute path.
3. **Every claim can be checked.** Verified vendors and agents carry a scannable card;
   tenancies carry a scannable proof. Both re-check live at the moment of scanning
   rather than showing a picture of a past decision.

---

## 2. The problem

Student life around a Nigerian campus runs on WhatsApp groups, notice boards, word of
mouth and cash. That produces three specific failures.

### Trust is unverifiable

A student sees photographs of a room and a phone number. There is no way to know whether
the room exists, whether the photographs are of that room, or whether the person letting
it owns it. The same is true of the vendor selling food and the artisan quoting for
repairs. The usual outcome is that students only transact with people already known to
someone they know, which shrinks the market for everyone and leaves new arrivals — the
people who need it most — with the worst information.

### Discovery is fragmented

Rooms are in one WhatsApp group, food vendors in another, events on flyers, laundry on a
poster in a corridor. There is no view of *what is near me*, which means good options a
five-minute walk away are invisible while worse ones with better distribution are not.

### Paying first is unsafe, and so is delivering first

Somebody has to go first. A student who pays a full session's rent before seeing a room
has no recourse; a landlord who hands over keys before payment has none either. Cash
hand-offs leave no record, so a dispute is one person's word against another's.

For rent specifically the sums are large — a session at KWASU is commonly ₦200,000 to
₦400,000 — and paid by students, often with money sent by a parent. The consequence of
getting it wrong is not an inconvenience.

---

## 3. The approach

### Verification is a visit, not a checkbox

Vendors and landlords submit identity and business documents, which staff review. For
hostels there is a second step: a **Sync agent physically visits** the property, and the
listing shows "Visited by an agent" only after that. A student paying a viewing fee is
paying for somebody's time to show them round, and the agent's own credential is
checkable — every verified account has a card at `/v/<code>` addressed by 128 unguessable
bits, which anybody can scan at their own front door before letting a stranger in.

The verification page is deliberately uncached: suspending an account at 11:00 makes the
card read "suspended" at 11:00, on cards already printed and in circulation. A cached
"verified" page would keep vouching for somebody who had been removed — worse than no
verification, because it looks like one.

### Escrow, with the timings written down

Money moves through a double-entry ledger. Nothing is a balance column that can drift;
every figure on every screen is derived from ledger entries.

| Flow | Sync's cut | Released |
| --- | --- | --- |
| **Hostel rent** | 2.5% of rent | 7 days after move-in |
| **Viewing fee** (₦5,000) | nothing — it is the agent's | 24h after the visit |
| **Services** (laundry, beauty, trades) | 5%, capped at ₦2,000 | on completion |
| **Delivery** | 5%, capped at ₦2,000 | on delivery |
| **Orders** | per storefront plan | on delivery |

A student who has paid rent can cancel for a **full refund within 72 hours**, unless they
have confirmed they moved in — confirming closes the window early, because they have the
room. After that it is a dispute, handled by staff.

**Who pays the 2.5% is the landlord's choice.** They pick `absorb` (the student pays the
listed price; Sync's fee comes out of the payout) or `pass_on` (it is added at checkout).
Both are shown with the arithmetic worked out on the property form, and the choice is
stated on the receipt and in the tenancy agreement — it is the single most common thing
to argue about afterwards.

### A tenancy is a lifecycle, not a transaction

Renting a room is the one flow that runs for months, so it is modelled as a sequence with
a state at each point rather than a payment with a receipt.

```
requested → awaiting payment → confirmed → moved in → completed
     │            │                │                      │
  landlord     24h hold        72h refund          room returns
  accepts                       window              to market
```

- **A session is 8 months** — two ~3-month semesters plus the break between them. A year
  is 12. Both are settings, not constants in code, because an academic calendar changes
  by decree.
- **End dates are derived**, from move-in plus the landlord's chosen term, wherever the
  move-in date comes from.
- **Landlords can grant grace** — up to 3 months past the end date — recorded separately
  from the lease, because the lease still ended when it ended. That is what was paid for.
- **Either side can start a renewal**, from 60 days out. Whoever did not ask is the one
  who answers. An open request holds the room for 14 days past the lease end; after that
  it lists, because silence must not freeze a landlord's room indefinitely.
- **Completion is swept hourly.** A tenancy that has run out is closed and the room
  returns to the market — without it, a confirmed booking would keep a room off the
  market for ever.

### Documents that prove something

Sync issues three kinds of paper, and they are deliberately different.

| Document | Answers | Shown to |
| --- | --- | --- |
| **Receipt** | "what did I pay, and what did Sync take" | the person who paid |
| **Tenancy agreement** | "what did the two of us agree" | both parties |
| **Proof of tenancy** | "does this person hold this room" | a porter, a parent, the school |

The proof carries a QR to `/t/<code>` that **re-checks live when scanned** — a screenshot
taken after somebody moved out verifies as "not a current tenant". It deliberately shows
no contact details and no rent: a proof that discloses somebody's finances is one they
will decline to show, which defeats it.

The tenancy agreement is **assembled from record, not drafted**. Every clause is a fact
Sync can evidence — the landlord accepted at a timestamp, the student paid at a
timestamp, the term came from the listing, the house rules are the ones shown before
payment. There is no signature block, because Sync collects no signatures; what it
records instead is consent as it happened, which is checkable in a way a squiggle is not.
A landlord may upload their own agreement, and the student's consent is stamped with
*which version* they were shown.

**Consent comes before payment**, enforced in the database: a booking cannot reach
`confirmed` without it. Paying used to be the only act, which meant it silently stood in
for agreement to terms the student may never have opened.

### One wallet, every role

A person on Sync has one wallet across every role they hold. A landlord who is also a
student sees rent they paid and rent they are owed in the same place — so the wallet
distinguishes *money you have paid that is still held* from *money coming to you*, and
never sums them: one is an asset and the other a liability.

Payment alerts are the one class of notification a user **cannot** turn off in-app. A
debit nobody is told about is how a compromised account stays unnoticed.

---

## 4. What came of it

As of this document, the following is built and running against a live Supabase project.

**Seven audiences, each with its own dashboard**

| Role | Dashboard | What they do |
| --- | --- | --- |
| Student | `/user` | find, book, pay, track, review |
| Landlord | `/landlord` | list rooms, accept requests, manage tenants, receipts |
| Vendor | `/vendor` | listings, orders, earnings, promotions, plan |
| Agent | `/agent` | claim and complete property visits, evidence, earnings |
| Rider | `/rider` | delivery offers, navigation, proof of delivery |
| Event manager | `/organiser` | events, ticket tiers, gate scanning |
| Admin | `/admin` | verification, disputes, moderation, analytics |

**Seven student verticals** — hostels, food, events, beauty, trades, laundry, hotspots —
behind a single localised `/around` feed.

**Scale of the build**

- **149 migrations**, each with a stated rollback and an assertion block that fails the
  deploy if the invariant it protects has been lost
- **27 domain modules** under `src/modules/`, each with `queries.ts` / `actions.ts` /
  `types.ts`
- **132 route files** across eight route groups — `(marketing)`, `(auth)`, `(app)`,
  `(vendor)`, `(agent)`, `(rider)`, `(organiser)`, `(admin)`. [`ROUTE_MAP.md`](../ROUTE_MAP.md)
  documents 55 of them and is behind the code: it still lists `/me/*`, which no longer
  exists (it is `/user/*`), and covers none of the agent, rider or organiser areas.
- Row-Level Security as the real authorization layer; the proxy is UX and defence in
  depth, never the gate

**Money infrastructure**

Double-entry ledger, escrow with per-vertical release rules, Paystack top-ups, refunds,
commissions frozen at hold creation, and bank-account verification.

**Money cannot leave the platform yet.** Payouts are the largest unfinished piece and it
matters more than anything else on this page: `payout_requests` rows are written and
nothing consumes them, and nothing in the codebase calls Paystack's transfer endpoint.
Accept, verify and the signed webhook are all built, so money can come *in* and be held
correctly — but every wallet balance is currently a promise the platform cannot keep.
Nobody has yet checked whether the Paystack balance would cover wallet plus escrow
liability, and since transfers draw on that balance, the settlement schedule decides
whether payouts can run at all.

**Trust infrastructure**

Staff verification queues, in-person visit logging, scannable verification cards for
vendors and agents, scannable tenancy proofs, and a dispute path into admin.

---

## 5. Built with

| Layer | Choice | Why |
| --- | --- | --- |
| **Framework** | Next.js 16 (App Router, RSC) + React 19 | Server components keep reads on the server where RLS applies |
| **Language** | TypeScript 5 | Database types are generated from the live schema |
| **Styling** | Tailwind CSS v4 | Design tokens in `globals.css`; brand palette only |
| **Auth & data** | Supabase (Postgres + RLS) | Authorization lives next to the data, not in the app |
| **Server state** | TanStack Query | Realtime messaging, live balances, optimistic updates |
| **Client state** | Redux Toolkit | Cart and multi-step wizards |
| **Validation** | Zod + react-hook-form | Every server action re-validates its own input |
| **Payments** | Paystack | Inline checkout, transfers, webhooks |
| **Email** | Resend + React Email | Templates as components |
| **Maps** | Google Maps via `@vis.gl/react-google-maps` | The `/around` map and delivery tracking |
| **Charts** | Recharts | Dashboards |
| **Rate limiting** | Upstash Redis | OTP and abuse-prone endpoints |

**Deliberately not used:** no PDF library (receipts are generated by a ~200-line writer
using the standard PDF fonts — jsPDF is ~350KB to do one thing), and no ORM (the schema
and its policies are the contract).

**Scheduled work** runs hourly from GitHub Actions rather than Vercel cron, because
Vercel's Hobby plan rejects a more-than-daily cron expression and fails the whole
deployment over it: escrow release, inspection release, hold expiry, tenancy completion.

---

## 6. Principles the codebase is held to

These are enforced by review and, where possible, by assertions in the migrations.

1. **Nothing is mocked in a shipped screen.** A button that looks like it works and does
   nothing is worse than no button — it produces a receipt for something that never
   happened. Several bugs found late were exactly this: a "Send payment reminder" that
   set a boolean, a saved-hostels list that rendered the public catalogue, a recent
   activity feed of four hardcoded lines.
2. **The database enforces the rule; the UI is a courtesy.** A disabled button is not a
   constraint. Consent-before-payment, the 3-month grace cap, one-renewal-per-tenancy and
   commission arithmetic are all refused in Postgres.
3. **Money never trusts the client.** No price is ever a parameter; totals are recomputed
   server-side from the listing.
4. **Every migration asserts what it protects.** A verify block that fails the deploy is
   how a silent regression gets caught — several have.
5. **Absence is stated, not hidden.** "Not visited yet" is rendered as plainly as
   "Visited by an agent". A missing badge reads as an oversight; a stated one is
   information.

---

## 7. Status and known gaps

Active development. Honest list of what is not finished:

- **Payouts do not execute.** The largest gap by some distance — see §4. Money comes in
  and is held correctly; none of it can leave.
- **The vendor's Accept/Decline is still a mock.** `/vendor` renders `PendingRequestList`
  with no handlers, so it falls back to `acceptOrderMock`: a timer that changes nothing
  and rejects at random. The landlord half is wired; there is no vendor endpoint to point
  this at yet. Until there is, treat any screen rendering that list without `onAccept` as
  a demo — the buttons are indistinguishable from working ones.
- Some screens still render from `src/mock/` while their data layer is wired up
- Per-kind **email** notification preferences are stored but no sender reads them yet
- Landlord agreement **upload control** is not on the property form (schema and module
  are in place)
- Orders and service requests have **no verification route**, so their receipts carry no
  QR — deliberately, rather than one encoding a string nothing can check
- Nothing enforces **one active tenancy per student**; the uniqueness index is per room

---

## 8. Developer guide — how this was built

The product above is the *what*. This is the *how*: the method, the order it was built in,
and the handful of practices that account for most of the quality.

### The design system came before the screens

The brand exists as a hi-fi spec — a palette, a type scale, a 60/30/10 ratio — and the
first engineering job was to make that spec the only way to build a screen, rather than a
PDF somebody consults and drifts from.

Every token lives in one `@theme` block in `src/app/globals.css`. Adding a token there
creates its Tailwind utility automatically, so `--color-lime` *is* `bg-lime`,
`text-lime`, `border-lime`. There is no second place a colour can come from, and a hex
code in a component is a review failure.

**The ratio is enforced by what the tokens make easy.** Cream is the surface, ink is the
text, lime is the accent, 60/30/10. The spec's constraints are written into the tokens
themselves rather than left as guidance:

- `lime` is a fill colour — badges, focus rings, accent surfaces — and never text on
  cream, because it fails contrast there. `lime-deep` exists for exactly that case.
- `coral` is defined for a dark ground and is a pastel on cream, so `coral-deep` is its
  text end. The absence of that second token is a real bug this codebase had: there was a
  coral to fill with and nothing to write in, which is how "Cancelled" ended up quieter on
  screen than "Pending".
- Type is not free-form. `--text-hero` carries its own line-height, weight and tracking
  (72px / 700 / -0.04em / 0.96) so a heading cannot be assembled wrongly from parts.

**Dark mode is a token swap, not a second stylesheet.** A semantic layer — `surface`,
`content`, `panel`, `line`, `accent-fg` — flips underneath, while the raw brand colours
stay constant. Lime is always lime. Panels that are deliberately dark in both modes stay
dark. A screen built on semantic tokens gets dark mode without being touched.

**`/dev/design-system` is the proof.** Every token and primitive renders on one page,
excluded from robots and never linked from production navigation. Visual regressions are
caught by looking at one page rather than by hunting through the app.

### Built in layers, not in features

The order was deliberate: tokens, then primitives, then composites, then screens, then the
data layer behind them. Building a screen before its primitives exist is how a codebase
acquires five buttons that look alike and behave differently.

Domain logic sits in `src/modules/<domain>/` — 27 of them — each with the same three
files: `queries.ts` for server-component reads, `actions.ts` for writes, `types.ts` for
shape. A developer opening an unfamiliar module already knows where everything is.

Route groups mirror audiences rather than URLs — `(marketing)`, `(auth)`, `(app)`,
`(vendor)`, `(agent)`, `(rider)`, `(organiser)`, `(admin)` — so a layout, a nav and an
access rule apply to a whole audience at once.

### Authorization lives in the database

The most consequential architectural decision. Row-Level Security is the gate; the proxy
that redirects wrong-role users is UX and defence in depth, never the enforcement. A
policy protects a table no matter what reaches it — the app, a webhook, a scheduled job, a
future mobile client — while a check in a route handler protects only that handler.

Business rules follow the same logic and live in Postgres functions: consent before
payment, the three-month grace cap, one renewal per tenancy, commission arithmetic. They
are refused in the database, so the UI cannot be the thing holding them.

### Migrations are written to be audited

149 of them, and each one is expected to carry two things beyond its change: a stated
rollback, and a verify block that raises an exception if the invariant it just established
is not actually true.

That block is not ceremony. `20260910210000` asserts against `pg_proc.prosrc` because the
exact line it protects had been silently dropped by a rewrite twice before. A migration
that asserts what it protects turns a silent regression into a failed deploy.

The hard-won rules around them are in the working document, but two are worth repeating
because they cost real outages: **never edit an applied migration** — it does not re-run,
so the file quietly stops describing the database — and **name the constraint on an
ambiguous embed**, because two foreign keys to the same table make PostgREST fail the
*whole* query, not one column. That one emptied the dashboard, the bookings list and the
apartment card simultaneously, and it does not look like an error from outside. It looks
like an empty app.

### Probe the database; do not trust the source

The single highest-value habit in the project. Reading a migration tells you what was
*intended*. Querying the live database tells you what is *true*. Four production faults
were found this way that no screen would ever have surfaced:

- `anon` could not read `hostels` at all, so every public listing page was empty for
  signed-out visitors
- `platform_escrow` was never credited for inspection fees and drifted negative while
  every individual transaction still balanced
- `wallets.pending_kobo` was read in six places and written in none
- A missing CSP `media-src` silently blocked every walkthrough video

Types are generated from the live schema rather than hand-written, so a column rename
fails the typecheck instead of failing a user.

### Comments carry the why

This codebase comments unusually heavily, and the comments are load-bearing. The rule is
that a comment explains **why this is the way it is**, and especially **what went wrong
when it was done the obvious way**. A comment above a line that sets a role does not say
"set the role"; it says which bug made this necessary.

When a bug is fixed, the comment records the bug. That is what stops it being
reintroduced, and it is why the working document stays short — most of the knowledge is
next to the code it applies to.

### Nothing mocked ships

[§6](#6-principles-the-codebase-is-held-to) states the principle and lists the faults it
was written after. What it means in practice is that a half-built screen is *labelled*,
never left looking finished — because the failure mode is silent. A landlord dashboard
once ran a demo Accept button while the same rows on another screen ran the real thing,
and nothing about either screen said which was which.

Anything not yet wired is stated as not wired — in the UI, and in §7 of this document.

### What runs on every push, and every hour

CI runs lint, typecheck and build on each push; the build step restores a Next.js cache so
it stays fast enough that nobody is tempted to skip it.

Four sweeps run hourly from GitHub Actions: escrow release, missed inspection release,
lapsed room-hold expiry, and tenancy completion. They are on GitHub Actions rather than
Vercel cron because Vercel's Hobby plan rejects a more-frequent-than-daily cron expression
and fails the entire deployment over it. Scheduled work is not optional here — an unswept
hold keeps a room off the market while the page shows it free.

### Before anything is called done

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint <the files you touched>
```

Typecheck and lint the touched files, and — for anything that changed a query — test it
against the live database. `tsc` cannot see a PostgREST embed failing.

---

*Maintained alongside the code. If this document and the code disagree, the code is right
and this is the bug — fix both.*
