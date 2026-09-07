-- ============================================================================
-- trust_content
--
-- Backs /admin/disputes, /admin/editorial, /admin/analytics,
-- /vendor/promotions, and the review prompts in the student dashboard.
--
-- REVIEWS HAVE TWO SUBJECTS, NOT ONE
--   §24 makes this point and it is easy to get wrong: once riders exist, a
--   student rates the FOOD and the DELIVERY separately. One bad rider should
--   not drag down a vendor's rating, and vice versa. So `reviews.subject_type`
--   distinguishes vendor / rider / hostel, and the aggregate trigger updates
--   whichever profile table the subject points at.
--
-- ONE REVIEW PER PERSON PER THING PER TRANSACTION
--   Not "per person per vendor"   a regular customer should be able to review
--   each order. Not "per person per subject" either, or you can never revise.
--   The unique index is on (author, subject, source) where source is the order
--   or booking being reviewed.
--
-- ROLLBACK
--   drop table if exists public.analytics_events, public.banners,
--                        public.articles, public.promotions,
--                        public.dispute_messages, public.disputes,
--                        public.reports, public.reviews cascade;
-- ============================================================================

-- ── 1. Reviews ──────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  subject_type  text not null check (subject_type in ('vendor', 'rider', 'hostel')),
  subject_id    uuid not null,
  -- What earned the right to review. A review with no transaction behind it is
  -- how review spam starts.
  source_type   text not null check (source_type in ('order', 'booking', 'service_request', 'delivery')),
  source_id     uuid not null,
  rating        integer not null check (rating between 1 and 5),
  title         text,
  body          text,
  -- Staff can hide a review without destroying evidence for a dispute.
  hidden_at     timestamptz,
  hidden_reason text,
  vendor_reply  text,
  replied_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists reviews_one_per_source_idx
  on public.reviews (author_id, subject_type, subject_id, source_type, source_id);
create index if not exists reviews_subject_idx
  on public.reviews (subject_type, subject_id, created_at desc) where hidden_at is null;

-- Recompute the cached aggregate on the subject. Cached because every listing
-- card shows a rating, and aggregating reviews per card is a guaranteed N+1.
create or replace function public.sync_review_aggregate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s_type text := coalesce(new.subject_type, old.subject_type);
  s_id   uuid := coalesce(new.subject_id,   old.subject_id);
  avg_r  numeric(3,2);
  cnt    integer;
begin
  select round(avg(rating)::numeric, 2), count(*)
    into avg_r, cnt
    from public.reviews
   where subject_type = s_type and subject_id = s_id and hidden_at is null;

  if s_type = 'vendor' then
    update public.vendor_profiles
       set rating_avg = coalesce(avg_r, 0), rating_count = coalesce(cnt, 0)
     where id = s_id;
  elsif s_type = 'rider' then
    update public.rider_profiles
       set rating_avg = coalesce(avg_r, 0), rating_count = coalesce(cnt, 0)
     where id = s_id;
  end if;
  -- Hostels carry no cached aggregate yet; add one here when the card needs it.
  return null;
end;
$$;

drop trigger if exists reviews_sync_aggregate on public.reviews;
create trigger reviews_sync_aggregate
  after insert or update or delete on public.reviews
  for each row execute function public.sync_review_aggregate();

-- The author owns the rating and body. Everything else is staff or vendor.
create or replace function public.guard_review_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.author_id    := old.author_id;
    new.subject_type := old.subject_type;
    new.subject_id   := old.subject_id;
    new.source_type  := old.source_type;
    new.source_id    := old.source_id;
    -- A vendor replying must not also be able to hide the review.
    if not public.is_staff() then
      new.hidden_at     := old.hidden_at;
      new.hidden_reason := old.hidden_reason;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_guard on public.reviews;
create trigger reviews_guard
  before update on public.reviews
  for each row execute function public.guard_review_cols();

-- ── 2. Disputes ─────────────────────────────────────────────────────────────
create table if not exists public.disputes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  raised_by    uuid not null references public.profiles (id) on delete restrict,
  against_id   uuid references public.profiles (id) on delete set null,
  order_id     uuid references public.orders (id) on delete set null,
  booking_id   uuid references public.bookings (id) on delete set null,
  request_id   uuid references public.service_requests (id) on delete set null,
  category     text not null check (category in
                 ('not_delivered', 'wrong_item', 'quality', 'payment', 'behaviour', 'other')),
  status       text not null default 'open' check (status in
                 ('open', 'investigating', 'awaiting_response', 'resolved', 'rejected')),
  resolution   text check (resolution in ('refund_full', 'refund_partial', 'release_vendor', 'no_action')),
  refund_kobo  bigint check (refund_kobo >= 0),
  summary      text not null,
  -- Never shown to either party. Kept separate so a careless select on the
  -- dispute row cannot leak the caseworker's notes.
  internal_notes text,
  assigned_to  uuid references public.profiles (id) on delete set null,
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists disputes_status_idx  on public.disputes (status, created_at desc);
create index if not exists disputes_raised_idx  on public.disputes (raised_by, created_at desc);

create sequence if not exists public.dispute_code_seq;

create or replace function public.set_dispute_code()
returns trigger language plpgsql as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'DSP-' || lpad(nextval('public.dispute_code_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists disputes_set_code on public.disputes;
create trigger disputes_set_code
  before insert on public.disputes
  for each row execute function public.set_dispute_code();

create table if not exists public.dispute_messages (
  id         uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null,
  -- Staff-only notes live in the same thread but are filtered by policy.
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists dispute_messages_dispute_idx
  on public.dispute_messages (dispute_id, created_at);

-- Only staff decide outcomes.
create or replace function public.guard_dispute_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_staff() then
    new.code           := old.code;
    new.status         := old.status;
    new.resolution     := old.resolution;
    new.refund_kobo    := old.refund_kobo;
    new.internal_notes := old.internal_notes;
    new.assigned_to    := old.assigned_to;
    new.resolved_by    := old.resolved_by;
    new.resolved_at    := old.resolved_at;
  end if;
  return new;
end;
$$;

drop trigger if exists disputes_guard on public.disputes;
create trigger disputes_guard
  before update on public.disputes
  for each row execute function public.guard_dispute_cols();

-- ── 3. Reports (user-generated flags) ───────────────────────────────────────
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  entity_type  text not null check (entity_type in
                 ('vendor', 'listing', 'hostel', 'review', 'message', 'user', 'event')),
  entity_id    uuid not null,
  reason       text not null,
  details      text,
  status       text not null default 'open'
                 check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- ── 4. Promotions ───────────────────────────────────────────────────────────
-- Backs /vendor/promotions.
create table if not exists public.promotions (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references public.vendor_profiles (id) on delete cascade,
  code           text,
  name           text not null,
  description    text,
  discount_type  text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  min_order_kobo bigint  not null default 0 check (min_order_kobo >= 0),
  max_redemptions integer check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A percentage over 100 is a bug, not a discount.
  constraint promotions_percent_sane check (
    discount_type <> 'percent' or discount_value <= 100
  ),
  constraint promotions_window_sane check (ends_at is null or ends_at > starts_at),
  unique (vendor_id, code)
);

create index if not exists promotions_vendor_idx on public.promotions (vendor_id, is_active);
create index if not exists promotions_live_idx   on public.promotions (starts_at, ends_at)
  where is_active;

-- redemption_count is incremented server-side at checkout.
create or replace function public.guard_promotion_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.redemption_count := old.redemption_count;
    new.vendor_id        := old.vendor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists promotions_guard on public.promotions;
create trigger promotions_guard
  before update on public.promotions
  for each row execute function public.guard_promotion_cols();

-- ── 5. Editorial ────────────────────────────────────────────────────────────
-- Backs /admin/editorial and the marketing surfaces.
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text,
  body         text,
  cover_url    text,
  author_id    uuid references public.profiles (id) on delete set null,
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists articles_published_idx
  on public.articles (published_at desc) where status = 'published';

create table if not exists public.banners (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  subtitle   text,
  image_url  text,
  href       text,
  placement  text not null default 'home'
               check (placement in ('home', 'food', 'hostels', 'events', 'beauty')),
  sort_order integer not null default 0,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists banners_placement_idx
  on public.banners (placement, sort_order) where is_active;

-- ── 6. Analytics events ─────────────────────────────────────────────────────
-- Feeds /admin/analytics through rollups, never live aggregation over raw rows.
-- Not partitioned yet: partitioning an empty table is easy, and doing it now
-- would add monthly maintenance before there is any data to justify it. Revisit
-- when this passes a few million rows.
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  session_id  text,
  name        text not null,
  props       jsonb not null default '{}',
  campus_id   uuid references public.campuses (id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists analytics_events_name_idx on public.analytics_events (name, occurred_at desc);
create index if not exists analytics_events_user_idx on public.analytics_events (user_id, occurred_at desc);

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
alter table public.reviews          enable row level security;
alter table public.disputes         enable row level security;
alter table public.dispute_messages enable row level security;
alter table public.reports          enable row level security;
alter table public.promotions       enable row level security;
alter table public.articles         enable row level security;
alter table public.banners          enable row level security;
alter table public.analytics_events enable row level security;

-- Reviews are public   that is the point of them.
drop policy if exists "reviews_select_public" on public.reviews;
create policy "reviews_select_public" on public.reviews
  for select to anon, authenticated using (hidden_at is null);

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert to authenticated with check ((select auth.uid()) = author_id);

drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews
  for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

-- A vendor may reply to a review about them. The column guard stops the same
-- policy being used to hide it.
drop policy if exists "reviews_reply_subject" on public.reviews;
create policy "reviews_reply_subject" on public.reviews
  for update to authenticated
  using (subject_type in ('vendor', 'rider') and subject_id = (select auth.uid()))
  with check (subject_type in ('vendor', 'rider') and subject_id = (select auth.uid()));

drop policy if exists "reviews_staff" on public.reviews;
create policy "reviews_staff" on public.reviews
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Disputes: the two parties see the case, staff see everything.
drop policy if exists "disputes_party" on public.disputes;
create policy "disputes_party" on public.disputes
  for select to authenticated
  using ((select auth.uid()) in (raised_by, against_id));

drop policy if exists "disputes_raise" on public.disputes;
create policy "disputes_raise" on public.disputes
  for insert to authenticated with check ((select auth.uid()) = raised_by);

drop policy if exists "disputes_update_party" on public.disputes;
create policy "disputes_update_party" on public.disputes
  for update to authenticated
  using ((select auth.uid()) in (raised_by, against_id))
  with check ((select auth.uid()) in (raised_by, against_id));

drop policy if exists "disputes_staff" on public.disputes;
create policy "disputes_staff" on public.disputes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Internal notes are filtered here, not in the client. A `select *` by a party
-- must not return the caseworker's thinking.
drop policy if exists "dispute_messages_party" on public.dispute_messages;
create policy "dispute_messages_party" on public.dispute_messages
  for select to authenticated
  using (
    not is_internal
    and exists (select 1 from public.disputes d
                 where d.id = dispute_id
                   and (select auth.uid()) in (d.raised_by, d.against_id))
  );

drop policy if exists "dispute_messages_post" on public.dispute_messages;
create policy "dispute_messages_post" on public.dispute_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and is_internal = false
    and exists (select 1 from public.disputes d
                 where d.id = dispute_id
                   and (select auth.uid()) in (d.raised_by, d.against_id))
  );

drop policy if exists "dispute_messages_staff" on public.dispute_messages;
create policy "dispute_messages_staff" on public.dispute_messages
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Reports: you see your own; staff see all. Deliberately no update for the
-- reporter   a report is a statement of record.
drop policy if exists "reports_own" on public.reports;
create policy "reports_own" on public.reports
  for select to authenticated using ((select auth.uid()) = reporter_id);

drop policy if exists "reports_file" on public.reports;
create policy "reports_file" on public.reports
  for insert to authenticated with check ((select auth.uid()) = reporter_id);

drop policy if exists "reports_staff" on public.reports;
create policy "reports_staff" on public.reports
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Promotions: shoppers see live ones, vendors manage their own.
drop policy if exists "promotions_select_live" on public.promotions;
create policy "promotions_select_live" on public.promotions
  for select to anon, authenticated
  using (is_active and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "promotions_write_own" on public.promotions;
create policy "promotions_write_own" on public.promotions
  for all to authenticated
  using ((select auth.uid()) = vendor_id)
  with check ((select auth.uid()) = vendor_id);

-- Editorial: published content is public; staff manage it.
drop policy if exists "articles_select_published" on public.articles;
create policy "articles_select_published" on public.articles
  for select to anon, authenticated using (status = 'published');

drop policy if exists "articles_staff" on public.articles;
create policy "articles_staff" on public.articles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "banners_select_live" on public.banners;
create policy "banners_select_live" on public.banners
  for select to anon, authenticated
  using (is_active and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "banners_staff" on public.banners;
create policy "banners_staff" on public.banners
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Analytics: write-only from the client, readable only by staff. A user must
-- not be able to read the event stream back out.
drop policy if exists "analytics_events_insert" on public.analytics_events;
create policy "analytics_events_insert" on public.analytics_events
  for insert to anon, authenticated with check (true);

drop policy if exists "analytics_events_staff" on public.analytics_events;
create policy "analytics_events_staff" on public.analytics_events
  for select to authenticated using (public.is_staff());

-- ── 8. Grants ───────────────────────────────────────────────────────────────
revoke all on public.reviews          from anon, authenticated;
revoke all on public.disputes         from anon, authenticated;
revoke all on public.dispute_messages from anon, authenticated;
revoke all on public.reports          from anon, authenticated;
revoke all on public.promotions       from anon, authenticated;
revoke all on public.articles         from anon, authenticated;
revoke all on public.banners          from anon, authenticated;
revoke all on public.analytics_events from anon, authenticated;

grant select                 on public.reviews          to anon, authenticated;
grant insert, update         on public.reviews          to authenticated;
grant select, insert, update on public.disputes         to authenticated;
grant select, insert         on public.dispute_messages to authenticated;
grant select, insert         on public.reports          to authenticated;
grant select                 on public.promotions       to anon, authenticated;
grant insert, update, delete on public.promotions       to authenticated;
grant select                 on public.articles         to anon, authenticated;
grant select                 on public.banners          to anon, authenticated;
grant insert                 on public.analytics_events to anon, authenticated;

-- ── 9. Verify ───────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'analytics_events'
       and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
  ) then
    raise exception 'analytics_events is client-readable; it must be write-only';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'reviews_one_per_source_idx'
  ) then
    raise exception 'the one-review-per-transaction index is missing';
  end if;

  raise notice 'trust + content ready: reviews, disputes, reports, promos, editorial.';
end $$;
