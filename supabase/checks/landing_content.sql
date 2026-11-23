-- ============================================================================
-- landing_content   what the public landing page can show, and what is missing.
--
-- NOT A MIGRATION. This is data, not schema: run it in the Supabase SQL editor
-- (or psql) whenever the landing looks thin. Part 1 only reads. Part 2 is a set
-- of fixes, each commented out: fill in the values and run them one at a time.
--
-- The landing reads these rules (src/app/(marketing)/landing-data.ts), so a row
-- that breaks one is simply not shown:
--   Hostels    verified, not archived. Photo = first hostel_images row.
--   Events     starts_at in the future. Photo = cover_url.
--   Hot spots  is_active. Photo = image_url. Featured = is_featured.
--   Food, Beauty, Laundry, Artisans
--              storefront not archived and accepting orders, brand
--              (vendor_profiles) verified and not archived. Photo = logo_url.
--   Reviews    testimonials.status = 'approved'. The section is hidden at 0.
-- ============================================================================


-- ── PART 1: report (read-only) ──────────────────────────────────────────────

-- 1a. One line per landing tab: how many cards it can show, and how many of
--     those have no photo (they render the "Photo coming" tile).
select 'hostels' as tab,
       count(*)                                                  as showable,
       count(*) filter (where not exists (
         select 1 from public.hostel_images i where i.hostel_id = h.id)) as no_photo
  from public.hostels h
 where h.verified and h.archived_at is null
union all
select 'events', count(*), count(*) filter (where cover_url is null or cover_url = '')
  from public.events
 where starts_at > now()
union all
select 'hotspots', count(*), count(*) filter (where image_url is null or image_url = '')
  from public.hotspots
 where is_active
union all
select case v.category when 'tradesman' then 'workmanship' else v.category end,
       count(*),
       count(*) filter (where v.logo_url is null or v.logo_url = '')
  from public.storefronts s
  join public.vendor_profiles v on v.id = s.vendor_id
 where s.archived_at is null
   and s.is_accepting_orders
   and v.verification_status = 'verified'
   and v.archived_at is null
   and v.category in ('food', 'beauty', 'laundry', 'tradesman')
 group by v.category
union all
select 'reviews (approved)', count(*), null
  from public.testimonials
 where status = 'approved'
order by 1;

-- 1b. The exact hot spots with no photo, featured first (the ones on the page).
select slug, name, area, category, is_featured
  from public.hotspots
 where is_active and (image_url is null or image_url = '')
 order by is_featured desc, sort_order;

-- 1c. Rows that exist but are hidden from the landing, and why. These are the
--     usual "I added it but it is not showing" cases.
select 'hostel not verified' as reason, slug as ref, name
  from public.hostels where not verified and archived_at is null
union all
select 'event already started', slug, name
  from public.events where starts_at <= now() and starts_at > now() - interval '30 days'
union all
select 'hotspot inactive', slug, name
  from public.hotspots where not is_active
union all
select 'store not accepting orders', s.slug, s.name
  from public.storefronts s where s.archived_at is null and not s.is_accepting_orders
union all
select 'brand not verified (' || coalesce(v.verification_status, 'null') || ')', s.slug, v.business_name
  from public.storefronts s
  join public.vendor_profiles v on v.id = s.vendor_id
 where s.archived_at is null and v.archived_at is null
   and v.verification_status is distinct from 'verified'
order by 1, 2;

-- 1d. Reviews waiting for a decision at /admin/reviews.
select status, count(*) from public.testimonials group by status order by 1;


-- ── PART 2: fixes (uncomment, fill in, run one at a time) ───────────────────

-- 2a. Give a hot spot its photo.
--     Upload the image to the `public-media` bucket first (Storage in the
--     dashboard), copy its public URL, then:
--
-- update public.hotspots
--    set image_url = 'https://<project>.supabase.co/storage/v1/object/public/public-media/hotspots/<file>.webp',
--        updated_at = now()
--  where slug = '<hotspot-slug>';

-- 2b. Choose which hot spots carry the Featured badge (shown first in the tab).
--     Featured is an editorial pick, not a paid placement: nothing on the page
--     says "Sponsored".
--
-- update public.hotspots set is_featured = (slug in ('<slug-1>', '<slug-2>')), updated_at = now()
--  where is_active;

-- 2c. Put hot spots in a deliberate order (lower comes first after featured).
--
-- update public.hotspots set sort_order = 10, updated_at = now() where slug = '<slug>';

-- 2d. Retire a hot spot without deleting it.
--
-- update public.hotspots set is_active = false, updated_at = now() where slug = '<slug>';

-- 2e. Hostel ribbons drive the Featured badge on hostel cards. Set or clear:
--
-- update public.hostels set ribbon = 'Students pick' where slug = '<hostel-slug>';
-- update public.hostels set ribbon = null           where slug = '<hostel-slug>';

-- NOT HERE, ON PURPOSE
--   Verifying a hostel or a vendor. That has one path - the visit decision in
--   the admin console (decide_verification_visit / set_verification_status) -
--   so the audit trail and the owner's notification happen. Do not flip
--   hostels.verified or verification_status by hand.
--   Approving reviews. Use /admin/reviews so the review note is recorded.
