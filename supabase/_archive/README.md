# Archived migrations — superseded, safe to delete

**This folder is obsolete as of 16 August 2026.** It can be deleted wholesale; nothing reads it.

## What changed

The earlier plan was: archive the hand-pasted `0001`–`0004`, then let `supabase db pull` generate a
fresh baseline from the live database. That never happened — `db pull` requires Docker, which is not
installed.

What happened instead is better. The remote **does** have a populated migration history table, and
`supabase migration fetch --linked` pulled all of it down into
[`../migrations/`](../migrations/):

| Version | File | Note |
| --- | --- | --- |
| `0001` | `0001_profiles.sql` | Same SQL as the copy that was archived here |
| `0002` | `0002_login_method.sql` | Same |
| `0003` | `0003_admins.sql` | Same |
| `0004` | `0004_seed_admin_roles.sql` | Same |
| `0005` | `0005_landlord_role.sql` | **Was never in this repo** — promotes `landlord` to a first-class role |
| `0006` | `0006_student_core.sql` | **Was never in this repo** — hostels, rooms, bookings, inspections, listings, orders, events, tickets, PostGIS |
| `0007` | `0007_areas.sql` | **Was never in this repo** — the `areas` table + FK from `hostels` |
| `20260814102248` | `20260814102248_fix_profile_exposure.sql` | Applied 16 Aug 2026 |

So `supabase/migrations/` is now a faithful mirror of what the database has actually run, and
`supabase migration list --linked` reports every row matched. That is the source of truth.

The four `.sql` files that used to sit here were byte-identical to the fetched copies apart from
nine blank lines. They are pure duplication and were left only because an automated delete was
blocked — remove them by hand.

## The one thing worth carrying forward

`0003_admins.sql` writes `auth.users` / `auth.identities` directly, which already broke once. It is
part of applied history now so it stays on disk, but **do not use it as a pattern**. Admin creation
belongs in `scripts/seed-admins.ts`.

## Caveat on the blueprint

[`docs/BACKEND_BLUEPRINT.md`](../../docs/BACKEND_BLUEPRINT.md) → *Start here* was written on
13 August 2026, before `0005`–`0007` were discovered. Its claims that the project has "no migrations
recorded" and "1 real table" are **out of date**. The rest of the document is still a useful design
reference; the audit section is not.
