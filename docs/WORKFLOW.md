# Working on Sync — agent handoff

**For whoever picks this up next, human or agent.** This is the file that keeps two people (and
two Claudes) from building contradictory things. It is the *how* and the *where we are*. The
*what* lives in the other docs, listed below.

Last updated: **6 September 2026**.

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

---

## 5. Where we stopped

**State: clean.** Every local migration through `20260910210000` is applied remotely. Latest
commit `f81c5c5`.

### Just finished

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

**Money — the largest gap.**
- **Paystack Transfers is not implemented anywhere.** Accept, verify and the signed webhook are all
  built, but no money can *leave*. `payout_requests` rows are written and nothing consumes them.
  Every wallet balance is currently a promise the platform cannot keep.
- No reconciliation between Paystack and the ledger.
- Nobody has checked whether the Paystack balance covers wallet + escrow liability. Transfers draw
  on the Paystack balance, so the **settlement schedule** decides whether payouts can run at all.

**Known and unfixed.**
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
