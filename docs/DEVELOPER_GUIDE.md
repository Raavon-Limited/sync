# Sync — Developer Guide

How this was built: the scope it was cut into, how the brand became a design system, the
layers and the contract between them, and the working method for changing any of it.

> For *what* Sync does, see [`PRODUCT.md`](PRODUCT.md). For the rules you must not
> contradict while changing it, see [`WORKFLOW.md`](WORKFLOW.md). For schema and RLS
> detail, see [`BACKEND_BLUEPRINT.md`](BACKEND_BLUEPRINT.md) and
> [`DATA_LAYER.md`](DATA_LAYER.md).

---

## 1. How the scope was cut

Sync is seven marketplaces sharing one account, one wallet and one trust model. Built
vertical-by-vertical it would have produced seven payment implementations and seven
notions of "verified". So it was cut horizontally: **the shared spine first, verticals on
top of it.**

### Phase 1 — Identity and access

Profiles, roles and Row-Level Security before any feature. Every later table inherits the
same question: *which role, whose row*. Nine roles were reserved in the proxy from the
first commit — `student`, `vendor`, `landlord`, `rider`, `event_manager`, `creator`,
`agent`, `admin`, `super_admin` — including ones not yet grantable, so a route prefix is
protected from the day it exists rather than retrofitted once somebody notices it is
open.

### Phase 2 — Money

The double-entry ledger, wallets, escrow and commissions, before anything could take a
payment. This is the decision the rest of the system leans on hardest: because every
balance is derived from ledger entries rather than stored in a column, no screen can
disagree with another about what somebody has.

### Phase 3 — Trust

Verification queues, document review, in-person visit logging, and the public
verification card. Trust had to exist before listings could claim it.

### Phase 4 — The verticals

Hostels first, because it has the largest sums, the longest lifecycle and the most edge
cases; everything after it — food, events, services, laundry, delivery — reuses the same
escrow, the same wallet, the same notification funnel. Hostels being hardest first meant
the shared machinery was proven under load rather than discovered to be inadequate later.

### Phase 5 — The connective tissue

`/around` (the localised feed), messaging, notifications, receipts and documents. These
only became possible once there was something real in every vertical to connect.

**The ordering principle:** anything more than one vertical depends on gets built once,
first, and centrally. Anything one vertical needs stays in that vertical's module.

---

## 2. Brand guide → design system

The brand arrived as a palette, two typefaces and a ratio. Turning that into something a
dozen screens could share meant refusing to let any of it be typed twice.

### The palette is a 60/30/10 ratio, not a list of colours

| Token | Value | Role |
| --- | --- | --- |
| `--color-cream` | `#f4f1e8` | 60% — surface |
| `--color-ink` | `#0e0e12` | 30% — text |
| `--color-lime` | `#c5ff4a` | 10% — accent |
| `--color-lime-deep` | `#4a8500` | accent **text** |
| `--color-coral` | `#ff8b5c` | warning on dark |
| `--color-coral-deep` | `#b4451a` | warning on light |

The pairs are the whole discipline. Bright lime on cream fails contrast, so **lime is for
fills, badges, focus rings and accent surfaces; `lime-deep` is for text**. Coral is
defined for a dark ground and `coral-deep` for a light one. Getting this wrong produces a
screen that looks on-brand and is unreadable, which is why the rule sits in a comment at
the top of `globals.css` rather than in anybody's memory.

### Semantic tokens are what components actually use

Raw brand colours are never referenced by a component. Between them sits a semantic layer
that flips with the theme:

```
--color-surface        page background
--color-surface-deep   hover / sunken panel
--color-panel          card surface
--color-content        primary text
--color-content-muted  meta text
--color-line           borders (used with /opacity)
--color-accent-fg      accent text — lime-deep ↔ lime
--color-warning-fg     warning text — coral-deep ↔ coral
```

A component writes `bg-panel text-content`, never `bg-white text-ink`. That single
indirection is what made dark mode a change to one block of variables instead of a sweep
through every file — and it is why a new screen is theme-correct without its author
thinking about theming at all.

Everything lives in Tailwind v4's `@theme` block, so **adding a token automatically
creates its utility**: `--color-lime` gives `bg-lime`, `text-lime`, `border-lime`. There
is no separate config to keep in sync.

### Typography is three roles, self-hosted

`Bricolage Grotesque` (display), `Inter` (body), `JetBrains Mono` (mono), loaded through
`next/font/google` so Next self-hosts and inlines them at build — no runtime request to a
third party, no layout shift. Exposed as `--font-display | --font-body | --font-mono` and
used by role, never by name.

Mono is not decoration: it marks machine-truth — references, codes, amounts, timestamps —
so a reader can tell at a glance what was generated from what was written.

### Where the design system stops

33 primitives in `src/components/ui/` (button, card, sheet, tabs…) and 33 composed pieces
in `src/components/shared/`. The rule between them: **`ui/` knows nothing about Sync**;
`shared/` knows about Sync but not about any one vertical. A component that knows about
hostels lives in the hostels module.

---

## 3. The layers, and the contract between them

```
src/app/          route groups by audience: (marketing) (auth) (app) (vendor) (admin)
  ↓ composes
src/modules/      27 domains — queries.ts · actions.ts · types.ts · hooks.ts
  ↓ reads/writes
supabase/         149 migrations — tables, RLS policies, RPCs, triggers
```

**Rules that hold this together:**

- **A module never imports another module.** Cross-domain composition happens in a page
  or in `components/shared`. Without this the dependency graph becomes a mesh and nothing
  can be reasoned about alone.
- **Authorization is RLS. Full stop.** `src/proxy.ts` redirects wrong-role users for
  their benefit and as defence in depth; it is never the gate. Any check in a module or
  component is UX, not security — the honest way to state this is that removing every
  line of TypeScript should leave the data equally protected.
- **Every server action re-validates its own input** with a Zod schema from
  `src/lib/validations`, and returns a typed result rather than throwing. The client is
  never trusted, including the client we wrote.
- **No price is ever a parameter.** Totals are recomputed server-side from the listing
  every time. `quote_rent` in the database is the authority; `rentQuote` in TypeScript
  mirrors it so a card can itemise without an RPC per card, and the SQL wins if they ever
  disagree.

Each module carries a `README.md` (14 of 27 so far) stating what it owns and what it may
not touch.

---

## 4. Migrations as the unit of change

Every schema change is a numbered file that is **applied once and never edited**. This is
the single most expensive rule to learn the hard way: an applied migration does not
re-run, so editing it leaves the file describing a database that does not exist while
`migration list` reports everything is fine.

### The house format

Each migration carries four things:

1. **A `WHY` header** — what was broken, in prose. Not "add column X" but the failure
   that made the column necessary. This is what makes a schema readable a year later.
2. **A `ROLLBACK` block** — the exact statements to undo it. 132 of 149 have one.
3. **The change itself.**
4. **A `do $verify$` assertion block** that raises if the invariant it protects is
   missing — which fails the deploy.

### Why the assertions earn their keep

A verify block is not a test of the migration that just ran; it is a **trap for the
rewrite that comes later**. Examples currently in the tree:

- `wallet_transactions` asserts its `auth.uid()` predicate still exists. Without that
  predicate the view exposes every user's ledger to every user — and would still look
  correct in a screenshot.
- `notify_money` asserts it still delivers to the actor. The general notification funnel
  deliberately suppresses self-notifications; money is the one exception, and a
  well-meaning refactor routing it back through the general path would silently restore
  the silence.
- `complete_ended_tenancies` asserts it still honours granted grace. Losing that
  `coalesce` would take a room back from a tenant the landlord explicitly allowed to
  stay.

These have caught real regressions during development, including a default-privilege
grant that made a view readable by `anon` — a genuine finding surfaced by an assertion
that was expected to pass.

---

## 5. Working method: adding a feature end to end

The order matters, because each step constrains the next.

**1. Find the rule, and decide where it lives.** If breaking it costs money or exposes
data, it belongs in Postgres — a constraint, a policy, a trigger, or an RPC. A disabled
button is a courtesy, not a rule. Consent-before-payment is a trigger refusing the move
to `confirmed`; the checkbox merely explains it.

**2. Write the migration.** Header, rollback, change, assertions. Push it. Read the
verify output — it is the first test.

**3. Regenerate types.**

```bash
npx supabase gen types typescript --project-id <id> --schema public > src/types/database.types.ts
```

Skipping this produces type errors that look like your code is wrong when the types are
merely stale.

**4. Verify every new query against the live database before writing UI.** This is the
habit with the highest yield in this project and the easiest to skip:

```js
const r = await fetch(`${URL}/rest/v1/${table}?select=${encodeURIComponent(sel)}&limit=1`, { headers });
console.log(r.status, r.ok ? 'OK' : await r.text());
```

`tsc` cannot see PostgREST. A misnamed column (`42703`), a missing relationship
(`PGRST200`) or an **ambiguous embed** (`PGRST201`) fails the *entire* select, not just
that column — so a screen renders empty rather than erroring. Two foreign keys from one
table to another is enough to trigger it, and the fix is to name the constraint:
`renewal:renewal_requests!renewal_requests_booking_id_fkey(...)`.

**5. Then the module** — `queries.ts`, `actions.ts`, `types.ts`, `hooks.ts`.

**6. Then the screen**, from `ui/` primitives and semantic tokens.

**7. Invalidate both caches after a mutation.** `revalidatePath` busts the *server*
render cache and does nothing to TanStack Query, which is what most interactive screens
actually read. `useActionRefresh()` does both — without it a student pays their rent,
sees a success state, and keeps looking at "awaiting payment" until they reload by hand.

**8. Check it.**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint <changed paths>
npx prettier --write <changed paths>
npx next build
```

---

## 6. What is deliberately not here

Choices worth knowing about, because each looks like an omission until you know the
reason.

- **No ORM.** The schema and its policies are the contract. An ORM would put a second,
  weaker model of authorization in front of RLS.
- **No PDF library.** Receipts are produced by a purpose-written text-PDF writer using
  the standard 14 fonts — no font embedding, no 350KB dependency, and the bytes are ours
  to reason about when a reader does something strange.
- **No stored documents.** Receipts, invoices and agreements are derived from the
  purchase at the moment they are asked for. A stored copy is a second version of the
  truth that can disagree with the money, and the money is the record.
- **No signature capture.** The tenancy agreement records consent *as it happened* —
  timestamped acts already in the ledger — which is checkable in a way a drawn squiggle
  is not.
- **No Vercel cron.** The Hobby plan rejects a more-than-daily expression and fails the
  whole deployment over it, so scheduled work runs hourly from GitHub Actions against
  bearer-authenticated routes.

---

## 7. Standards a change is held to

1. **Nothing mocked in a shipped screen.** A control that looks like it works and does
   nothing is worse than no control — it hands somebody a receipt for something that
   never happened. Real examples caught late: a payment reminder that set a boolean, a
   "saved hostels" list rendering the public catalogue, an activity feed of four
   hardcoded lines identical for every user.
2. **State absence, do not hide it.** "Not visited yet" is rendered as plainly as
   "Visited by an agent". A missing badge reads as an oversight; a stated one is
   information.
3. **Comments explain the failure, not the syntax.** Every non-obvious block says what
   went wrong that made it necessary. `// increments the counter` is noise; *"this fired
   for scrolls inside the panel, so reading a long explanation dismissed it"* is the
   reason the next person does not undo it.
4. **One number, one place.** Where a figure appeared twice in different words, one was
   removed. Two statements of one value are how they start disagreeing.
5. **Update the docs in the same change.** `WORKFLOW.md` carries the traps; if a change
   invalidates something written there, both move together.

---

## 8. Environment and commands

```bash
NODE_ENV=development npm install   # a shell exporting NODE_ENV=production skips devDeps
npm run dev                        # http://localhost:3000
npm run build
npm run lint
npm run format
```

| Task | Command |
| --- | --- |
| Apply migrations | `npx supabase db push` |
| See what is pending | `npx supabase migration list` |
| Regenerate types | `npx supabase gen types typescript --project-id <id> --schema public > src/types/database.types.ts` |

**A service-role probe of `wallet_transactions` returns zero rows no matter what the
ledger holds** — the view requires `auth.uid()`, and service role has none. That reads
exactly like "nothing was ever written" and has sent more than one investigation down the
wrong path.

CI (`.github/workflows/ci.yml`) runs `npm ci → lint → build` on every push. Four hourly
jobs in `escrow-release.yml` drive escrow release, inspection release, hold expiry and
tenancy completion.

---

*If this document and the code disagree, the code is right and this is the bug — fix
both.*
