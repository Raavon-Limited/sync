# modules/verification

Vendor identity + business verification orchestration - auto ID check → business proof upload → in-person visit sign-off.

## Files
- `actions.ts` - Server Actions (mutations). Always re-validate input with the zod schema from `@/lib/validations`.
- `queries.ts` - Server-side data fetching. Imported by RSC pages.
- `types.ts` - Domain types specific to this module. Cross-module types belong in `@/types`.
- `components/` - Components owned by this module (composed of primitives from `@/components/ui`).

## Where the status lives

There are three columns spelled `verification_status`. Only one of them is a
source of truth, and writing the wrong one is the bug this module has already
had once (`20260901100000`).

| column | what it is |
| --- | --- |
| `vendor_profiles.verification_status` | **The authority for a business.** What staff write (`setVendorVerification`), what the review queue lists, what `guard_storefront_insert` consults. Frozen for clients by `guard_vendor_profile_cols`. |
| `profiles.verification_status` | **A mirror**, maintained by the `vendor_profiles_mirror_verification` trigger. Never write it by hand. This is the one the UI reads   `getDashboardProfile()` for the dashboard gate, `/api/profile` for `useSession()`. |
| `auth.users.raw_user_meta_data->>'verification_status'` | **Not a source of truth.** Read exactly once, by `handle_new_user`, at signup. Writing it later reaches nothing. |

Consequences worth stating, because both failed silently before:

- **Approving a vendor must write `vendor_profiles`.** It used to be the only
  write, and the mirror did not exist   so an approved vendor signed in to a
  dashboard that was still locked, asking them to verify an account a human had
  already approved.
- **Submitting for review goes through `submit_verification()`**, not through
  `auth.updateUser`. The metadata write records what they typed; the RPC is
  what moves the status. It can only go to `pending`   nothing here lets an
  account verify itself.
- **`ensure_vendor_profile()` exists because nothing else creates the row.**
  `vendor_profiles` came from a one-off backfill and `set_vendor_category`
  moves the role without creating one, so a business that signed up afterwards
  had no row to review, mirror or gate on.
- **Riders are deliberately not mirrored.** `rider_profiles.verification_status`
  is the same shape, but since multi-role accounts one person can hold a
  business role *and* `rider`   two independent verifications, one
  `profiles.verification_status` to mirror into, and whichever wrote last would
  silently win. A rider gate has to read `rider_profiles` directly.

## Conventions
- This module never imports from other `modules/*` directly - cross-module composition happens in pages or in `components/shared`.
- Authorization belongs in Supabase RLS; this module's checks are UX, not security.
