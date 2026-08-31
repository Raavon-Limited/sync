-- ============================================================================
-- TESTIMONIALS - moderated social proof for the marketing pages.
-- ============================================================================
-- Distinct from public.reviews on purpose. `reviews` are TRANSACTIONAL: they
-- require a source order/booking, they publish immediately, staff hide them
-- after the fact, and they feed the cached rating aggregates on vendor and
-- rider profiles. None of that suits a landing-page quote.
--
-- Testimonials are the opposite model:
--   * anyone signed in may submit, with no transaction required
--   * nothing is public until a superadmin approves it
--   * they carry no rating aggregate and affect nobody's score
--
-- Keeping them apart means loosening the "no review without a transaction"
-- rule here cannot weaken it there.
--
-- ROLLBACK
--   drop table if exists public.testimonials cascade;
--   drop function if exists public.is_super_admin();

-- ── Superadmin check ────────────────────────────────────────────────────────
-- is_staff()/is_admin() both resolve to ('admin','super_admin'). Approving
-- public-facing copy is a narrower privilege than general staff work, so it
-- needs a check that actually distinguishes the two.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.current_app_role() = 'super_admin' $$;
grant execute on function public.is_super_admin() to authenticated, service_role;
comment on function public.is_super_admin() is
  'True only for the super_admin role. is_admin()/is_staff() also match plain admins.';
-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.testimonials (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references public.profiles (id) on delete cascade,

  body            text not null check (length(btrim(body)) between 20 and 600),
  rating          integer not null check (rating between 1 and 5),
  -- Shown under the quote, e.g. "300L · KWASU". Free text: the author decides
  -- how much of themselves to attach to a public quote.
  detail          text check (detail is null or length(btrim(detail)) <= 60),
  -- Lets someone publish under a display name rather than their profile name.
  -- Falls back to the profile's full_name at read time when null.
  display_name    text check (display_name is null or length(btrim(display_name)) <= 60),

  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  -- Why it was rejected. Shown back to the author so a resubmission can fix it.
  review_note     text,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- The landing page reads approved rows newest-first; the admin queue reads
-- pending oldest-first. One partial index per access path.
create index if not exists testimonials_approved_idx
  on public.testimonials (created_at desc) where status = 'approved';
create index if not exists testimonials_pending_idx
  on public.testimonials (created_at asc) where status = 'pending';
create index if not exists testimonials_author_idx
  on public.testimonials (author_id, created_at desc);
-- One pending submission per person. Without this, a single account can flood
-- the moderation queue; an author may submit again once the last is decided.
create unique index if not exists testimonials_one_pending_per_author_idx
  on public.testimonials (author_id) where status = 'pending';
-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.testimonials enable row level security;
-- Public reads see approved rows ONLY. This is the whole point of the feature:
-- nothing reaches the marketing pages without a decision.
drop policy if exists "testimonials_select_approved" on public.testimonials;
create policy "testimonials_select_approved" on public.testimonials
  for select to anon, authenticated using (status = 'approved');
-- Authors can see their own submission whatever its state, so the UI can say
-- "waiting on review" or show why it was rejected.
drop policy if exists "testimonials_select_own" on public.testimonials;
create policy "testimonials_select_own" on public.testimonials
  for select to authenticated using ((select auth.uid()) = author_id);
-- Submit as yourself, and only ever as pending. The status check in WITH CHECK
-- is what stops a crafted insert publishing itself.
drop policy if exists "testimonials_insert_own" on public.testimonials;
create policy "testimonials_insert_own" on public.testimonials
  for insert to authenticated
  with check ((select auth.uid()) = author_id and status = 'pending');
-- An author may edit their own text only while it is still pending. Once a
-- decision is made the row is evidence of what was approved.
drop policy if exists "testimonials_update_own_pending" on public.testimonials;
create policy "testimonials_update_own_pending" on public.testimonials
  for update to authenticated
  using ((select auth.uid()) = author_id and status = 'pending')
  with check ((select auth.uid()) = author_id and status = 'pending');
drop policy if exists "testimonials_delete_own_pending" on public.testimonials;
create policy "testimonials_delete_own_pending" on public.testimonials
  for delete to authenticated
  using ((select auth.uid()) = author_id and status = 'pending');
-- Staff can READ the queue - moderation needs to be reviewable by more than one
-- person - but only a superadmin can change a status, per the brief.
drop policy if exists "testimonials_select_staff" on public.testimonials;
create policy "testimonials_select_staff" on public.testimonials
  for select to authenticated using (public.is_staff());
drop policy if exists "testimonials_moderate_super_admin" on public.testimonials;
create policy "testimonials_moderate_super_admin" on public.testimonials
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "testimonials_delete_super_admin" on public.testimonials;
create policy "testimonials_delete_super_admin" on public.testimonials
  for delete to authenticated using (public.is_super_admin());
-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function public.touch_testimonials_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists testimonials_touch_updated_at on public.testimonials;
create trigger testimonials_touch_updated_at
  before update on public.testimonials
  for each row execute function public.touch_testimonials_updated_at();
comment on table public.testimonials is
  'Moderated marketing quotes. Nothing is public until status = approved. Separate from public.reviews, which are transactional and publish immediately.';
