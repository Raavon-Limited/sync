-- ============================================================================
-- around_gist_and_polls   The public gist feed and campus polls on Around you.
--
-- Founder decisions this file encodes (Nov 2026):
--
-- THE GIST
--   - Public, short posts about what is happening on campus, in four kinds:
--       gist   news and chatter
--       alert  an urgent heads-up from students (light is back, road blocked,
--              water off). Pinned to the top for 2 hours. NOT the official
--              emergency channel, which is a separate, super-admin feature.
--       deal   a discount or offer
--       event  something happening at a set time and place
--   - Shown under the poster's DISPLAY NAME (profiles.display_name, chosen by
--     them), or "Anonymous" if they have not set one. The real account is
--     stored but never readable by clients: there is no client SELECT on
--     gist_posts at all, the feed is the gist_feed() function, which does not
--     return author_id. A SUPER ADMIN can reveal the account behind a post
--     with reveal_gist_author(), which demands a written reason and logs
--     every reveal. The policy is that this happens for law enforcement.
--   - Public for 24 hours, and only the newest 50 per campus. Older posts
--     leave the public feed but stay for staff review for 72 days, then
--     purge_gist() deletes them (daily cron).
--   - Moderated on the way in: swear words masked ("f***"), long digit runs
--     (phone numbers) removed, 5 posts an hour per account. Reports: 3 hide a
--     post until staff look.
--   - Daily stats per campus (gist_daily_stats): volume by kind, top words,
--     most "same here", busiest hour, reports. Counts only, no AI.
--
-- POLLS
--   - Any signed-in account can create one (3 a day): single choice, multiple
--     choice (up to N picks), or ranked (rank your top N, scored by points).
--   - Scope: 'open' (anyone votes; each vote is tagged near or far from the
--     campus) or 'local' (only voters whose location is near the campus).
--   - VOTING NEEDS NO ACCOUNT. Votes go through the server route
--     /api/polls/vote, which is the only caller of cast_poll_vote(). One
--     ballot per poll per browser cookie, per device key kept in
--     localStorage, and per account when signed in. No website can make
--     double voting impossible (a second browser is a second device); this
--     makes it deliberate rather than casual.
--   - Reported like gist: 3 reports hide a poll.
--
-- WHY is_staff() IS NOT IN ANY anon POLICY
--   anon cannot execute it (20260817090000); a policy calling it would fail
--   every signed-out read. The verify block checks.
--
-- ROLLBACK
--   drop table if exists public.poll_creators, public.poll_reports, public.poll_choices,
--     public.poll_ballots, public.poll_options, public.polls,
--     public.gist_daily_stats, public.gist_identity_reveals,
--     public.gist_masked_words, public.gist_reports, public.gist_reactions,
--     public.gist_posts cascade;
--   drop function if exists public.mask_words(text), public.clean_post(text),
--     public.set_display_name(text), public.gist_posts_guard(),
--     public.gist_reports_apply(), public.gist_feed(uuid, integer),
--     public.toggle_gist_reaction(uuid), public.delete_my_gist(uuid),
--     public.reveal_gist_author(uuid, text), public.purge_gist(),
--     public.compute_gist_daily_stats(date), public.create_poll(uuid, text,
--     text, smallint, text, integer, text[]), public.cast_poll_vote(uuid,
--     text, text, uuid, boolean, text, uuid[]), public.poll_results(uuid),
--     public.poll_reports_apply();
--   alter table public.profiles drop column if exists display_name;
-- ============================================================================


-- ── 0. Display names ─────────────────────────────────────────────────────────
alter table public.profiles add column if not exists display_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_format') then
    alter table public.profiles add constraint profiles_display_name_format check (
      display_name is null
      or (display_name ~ '^[A-Za-z0-9_. ]{2,24}$'
          and lower(btrim(display_name)) not in
              ('sync', 'sync team', 'admin', 'anonymous', 'support', 'moderator', 'staff'))
    );
  end if;
end;
$$;

-- One person per name, case-insensitively, so nobody posts as someone else.
create unique index if not exists profiles_display_name_unique
  on public.profiles (lower(btrim(display_name)))
  where display_name is not null;

-- Through a function, not a column update: it validates with a readable
-- message and does not depend on which profile columns clients may write.
create or replace function public.set_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if v_name is not null and v_name !~ '^[A-Za-z0-9_. ]{2,24}$' then
    raise exception 'Use 2 to 24 letters, numbers, spaces, dots or underscores' using errcode = 'P0001';
  end if;
  begin
    update public.profiles set display_name = v_name where id = v_uid;
  exception
    when unique_violation then
      raise exception 'That name is taken' using errcode = 'P0001';
    when check_violation then
      raise exception 'That name is not allowed' using errcode = 'P0001';
  end;
  return v_name;
end;
$$;

revoke all on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;


-- ── 1. Word masking and cleaning ─────────────────────────────────────────────
-- Swear words are masked ON THE WAY IN, so the stored text already reads
-- "f***". Each entry is a stem matched at the start of a word ('fuck' also
-- catches "fucking"); the first letter stays so the sentence still reads.
-- Kept short on purpose: a long list masks innocent words (no 'dick': it
-- would mask Dickson). Staff add words with an insert; no client access.
create table if not exists public.gist_masked_words (
  word text primary key check (word = lower(btrim(word)) and char_length(word) >= 3)
);
alter table public.gist_masked_words enable row level security;
revoke all on public.gist_masked_words from anon, authenticated;

insert into public.gist_masked_words (word) values
  ('fuck'), ('shit'), ('bitch'), ('bastard'), ('asshole'), ('pussy'),
  ('cunt'), ('motherfucker'), ('nigga'), ('nigger'), ('whore'), ('slut'),
  ('mumu'), ('olodo'), ('ashawo'), ('werey'), ('oloshi')
on conflict (word) do nothing;

create or replace function public.mask_words(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out  text := p_text;
  v_word text;
begin
  -- Longest first, so 'motherfucker' is masked whole before 'fuck' bites it.
  for v_word in select word from public.gist_masked_words order by char_length(word) desc loop
    v_out := regexp_replace(
      v_out,
      '\m(' || left(v_word, 1) || ')' || substr(v_word, 2) || '\w*',
      '\1' || repeat('*', greatest(char_length(v_word) - 1, 3)),
      'gi'
    );
  end loop;
  return v_out;
end;
$$;

-- Masking plus: phone numbers out (9+ digits, spaces and dashes allowed
-- between), whitespace collapsed. A public campus feed is the wrong place
-- for anyone's number.
create or replace function public.clean_post(p_text text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.mask_words(
    regexp_replace(
      regexp_replace(btrim(coalesce(p_text, '')), '\+?\d[\d \-]{7,}\d', '[number removed]', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

revoke all on function public.mask_words(text) from public, anon, authenticated;
revoke all on function public.clean_post(text) from public, anon, authenticated;


-- ── 2. Gist posts ────────────────────────────────────────────────────────────
create table if not exists public.gist_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references auth.users (id) on delete cascade,
  author_name  text not null default 'Anonymous',
  campus_id    uuid references public.campuses (id) on delete set null,
  kind         text not null check (kind in ('gist', 'alert', 'event', 'deal')),
  body         text not null check (char_length(body) between 1 and 400),
  created_at   timestamptz not null default now(),
  hidden_at    timestamptz,
  report_count integer not null default 0 check (report_count >= 0)
);

create index if not exists gist_posts_feed_idx
  on public.gist_posts (campus_id, created_at desc)
  where hidden_at is null;
create index if not exists gist_posts_author_idx
  on public.gist_posts (author_id, created_at desc);

alter table public.gist_posts enable row level security;

-- NO client SELECT, on purpose: the row holds author_id. Reads go through
-- gist_feed(); staff read through the service role on the admin page.
revoke all on public.gist_posts from anon;
revoke select, update, delete, truncate on public.gist_posts from authenticated;
grant insert on public.gist_posts to authenticated;

drop policy if exists "gist_posts_insert_own" on public.gist_posts;
create policy "gist_posts_insert_own" on public.gist_posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));

-- Everything the client could lie about is overwritten here.
create or replace function public.gist_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_recent integer;
  v_body   text;
begin
  if v_uid is null then
    raise exception 'Sign in to post' using errcode = '28000';
  end if;

  select count(*) into v_recent
    from public.gist_posts
   where author_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'You are posting too fast. Try again in a bit.' using errcode = 'P0001';
  end if;

  v_body := public.clean_post(new.body);
  if char_length(v_body) < 2 then
    raise exception 'Say a little more' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 280 then
    raise exception 'Keep it under 280 characters' using errcode = 'P0001';
  end if;

  new.author_id    := v_uid;
  new.author_name  := coalesce((select display_name from public.profiles where id = v_uid), 'Anonymous');
  new.body         := v_body;
  new.created_at   := now();
  new.hidden_at    := null;
  new.report_count := 0;
  return new;
end;
$$;

drop trigger if exists gist_posts_guard on public.gist_posts;
create trigger gist_posts_guard
  before insert on public.gist_posts
  for each row execute function public.gist_posts_guard();


-- ── 3. "Same here" ───────────────────────────────────────────────────────────
-- Who reacted is not public either; counts come out of gist_feed().
create table if not exists public.gist_reactions (
  post_id    uuid not null references public.gist_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.gist_reactions enable row level security;
revoke all on public.gist_reactions from anon, authenticated;

create or replace function public.toggle_gist_reaction(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  delete from public.gist_reactions where post_id = p_post and user_id = v_uid;
  if found then
    return false;
  end if;
  insert into public.gist_reactions (post_id, user_id) values (p_post, v_uid);
  return true;
end;
$$;

revoke all on function public.toggle_gist_reaction(uuid) from public, anon;
grant execute on function public.toggle_gist_reaction(uuid) to authenticated;

create or replace function public.delete_my_gist(p_post uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.gist_posts where id = p_post and author_id = auth.uid();
$$;

revoke all on function public.delete_my_gist(uuid) from public, anon;
grant execute on function public.delete_my_gist(uuid) to authenticated;


-- ── 4. Reports ───────────────────────────────────────────────────────────────
create table if not exists public.gist_reports (
  post_id     uuid not null references public.gist_posts (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text check (reason is null or char_length(reason) <= 280),
  created_at  timestamptz not null default now(),
  primary key (post_id, reporter_id)
);
alter table public.gist_reports enable row level security;
revoke all on public.gist_reports from anon;
revoke select, update, delete on public.gist_reports from authenticated;
grant insert on public.gist_reports to authenticated;

drop policy if exists "gist_reports_insert_own" on public.gist_reports;
create policy "gist_reports_insert_own" on public.gist_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

create or replace function public.gist_reports_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gist_posts
     set report_count = report_count + 1,
         hidden_at = case when report_count + 1 >= 3 and hidden_at is null then now() else hidden_at end
   where id = new.post_id;
  return new;
end;
$$;

drop trigger if exists gist_reports_apply on public.gist_reports;
create trigger gist_reports_apply
  after insert on public.gist_reports
  for each row execute function public.gist_reports_apply();


-- ── 5. The public feed ───────────────────────────────────────────────────────
-- Last 24 hours, newest 50 per campus, not hidden. Alerts younger than 2
-- hours float to the top. No author_id leaves this function.
create or replace function public.gist_feed(p_campus uuid, p_limit integer default 20)
returns table (
  id          uuid,
  author_name text,
  kind        text,
  body        text,
  created_at  timestamptz,
  same_here   bigint,
  reacted     boolean,
  mine        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with window_posts as (
    select p.*
      from public.gist_posts p
     where p.campus_id = p_campus
       and p.hidden_at is null
       and p.created_at > now() - interval '24 hours'
     order by p.created_at desc
     limit 50
  )
  select w.id, w.author_name, w.kind, w.body, w.created_at,
         (select count(*) from public.gist_reactions r where r.post_id = w.id),
         exists (select 1 from public.gist_reactions r where r.post_id = w.id and r.user_id = auth.uid()),
         coalesce(w.author_id = auth.uid(), false)
    from window_posts w
   order by (w.kind = 'alert' and w.created_at > now() - interval '2 hours') desc, w.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.gist_feed(uuid, integer) from public;
grant execute on function public.gist_feed(uuid, integer) to anon, authenticated;


-- ── 6. Identity reveal (super admin, logged) ──────────────────────────────────
create table if not exists public.gist_identity_reveals (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null,
  author_id   uuid not null,
  revealed_by uuid not null references auth.users (id),
  reason      text not null check (char_length(btrim(reason)) >= 10),
  created_at  timestamptz not null default now()
);
alter table public.gist_identity_reveals enable row level security;
revoke all on public.gist_identity_reveals from anon, authenticated;

create or replace function public.reveal_gist_author(p_post uuid, p_reason text)
returns table (author_id uuid, full_name text, email text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if public.current_app_role() <> 'super_admin' then
    raise exception 'Only a super admin can do this' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Give the reason (for example the police request reference)' using errcode = 'P0001';
  end if;
  select g.author_id into v_author from public.gist_posts g where g.id = p_post;
  if v_author is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  insert into public.gist_identity_reveals (post_id, author_id, revealed_by, reason)
  values (p_post, v_author, auth.uid(), btrim(p_reason));
  return query
    select v_author, p.full_name, u.email::text, p.display_name
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = v_author;
end;
$$;

revoke all on function public.reveal_gist_author(uuid, text) from public, anon;
grant execute on function public.reveal_gist_author(uuid, text) to authenticated;


-- ── 7. Retention and daily stats ─────────────────────────────────────────────
create or replace function public.purge_gist()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.gist_posts where created_at < now() - interval '72 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.purge_gist() from public, anon, authenticated;

create table if not exists public.gist_daily_stats (
  day          date not null,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  posts        integer not null default 0,
  by_kind      jsonb not null default '{}'::jsonb,
  top_words    jsonb not null default '[]'::jsonb,
  top_posts    jsonb not null default '[]'::jsonb,
  busiest_hour smallint,
  reports      integer not null default 0,
  computed_at  timestamptz not null default now(),
  primary key (day, campus_id)
);
alter table public.gist_daily_stats enable row level security;
revoke all on public.gist_daily_stats from anon, authenticated;

-- One Lagos calendar day. Top words skip short and common words.
create or replace function public.compute_gist_daily_stats(p_day date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  insert into public.gist_daily_stats
    (day, campus_id, posts, by_kind, top_words, top_posts, busiest_hour, reports, computed_at)
  select p_day,
         d.campus_id,
         count(*)::integer,
         (select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb)
            from (select x.kind, count(*) n from public.gist_posts x
                   where x.campus_id = d.campus_id
                     and (x.created_at at time zone 'Africa/Lagos')::date = p_day
                   group by x.kind) k),
         (select coalesce(jsonb_agg(jsonb_build_object('word', w.word, 'n', w.n) order by w.n desc), '[]'::jsonb)
            from (select word, count(*) n
                    from public.gist_posts x,
                         regexp_split_to_table(lower(x.body), '[^a-z0-9]+') as word
                   where x.campus_id = d.campus_id
                     and (x.created_at at time zone 'Africa/Lagos')::date = p_day
                     and char_length(word) >= 4
                     and word not in ('that', 'this', 'with', 'from', 'have', 'they', 'what', 'just',
                                      'your', 'about', 'there', 'their', 'will', 'been', 'were', 'when',
                                      'where', 'which', 'some', 'like', 'make', 'abeg', 'oooo')
                   group by word
                   order by count(*) desc
                   limit 15) w),
         (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'body', t.body, 'same_here', t.n)
                                    order by t.n desc), '[]'::jsonb)
            from (select x.id, x.kind, x.body,
                         (select count(*) from public.gist_reactions r where r.post_id = x.id) n
                    from public.gist_posts x
                   where x.campus_id = d.campus_id
                     and (x.created_at at time zone 'Africa/Lagos')::date = p_day
                   order by 4 desc
                   limit 5) t),
         (select extract(hour from (x.created_at at time zone 'Africa/Lagos'))::smallint
            from public.gist_posts x
           where x.campus_id = d.campus_id
             and (x.created_at at time zone 'Africa/Lagos')::date = p_day
           group by 1 order by count(*) desc limit 1),
         (select count(*)::integer from public.gist_reports r
            join public.gist_posts x on x.id = r.post_id
           where x.campus_id = d.campus_id
             and (r.created_at at time zone 'Africa/Lagos')::date = p_day),
         now()
    from public.gist_posts d
   where d.campus_id is not null
     and (d.created_at at time zone 'Africa/Lagos')::date = p_day
   group by d.campus_id
  on conflict (day, campus_id) do update
     set posts = excluded.posts, by_kind = excluded.by_kind, top_words = excluded.top_words,
         top_posts = excluded.top_posts, busiest_hour = excluded.busiest_hour,
         reports = excluded.reports, computed_at = excluded.computed_at;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.compute_gist_daily_stats(date) from public, anon, authenticated;


-- ── 8. Polls ─────────────────────────────────────────────────────────────────
create table if not exists public.polls (
  id           uuid primary key default gen_random_uuid(),
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  author_name  text not null default 'Anonymous',
  question     text not null check (char_length(question) between 5 and 160),
  kind         text not null default 'single' check (kind in ('single', 'multi', 'ranked')),
  -- multi: most options a voter may tick. ranked: how many they rank (2-5).
  max_choices  smallint not null default 1 check (max_choices between 1 and 10),
  scope        text not null default 'open' check (scope in ('open', 'local')),
  is_featured  boolean not null default false,
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz not null default now() + interval '3 days',
  hidden_at    timestamptz,
  report_count integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint polls_window check (ends_at > starts_at and ends_at <= starts_at + interval '30 days'),
  constraint polls_choices_sane check (
    (kind = 'single' and max_choices = 1)
    or (kind = 'multi' and max_choices >= 2)
    or (kind = 'ranked' and max_choices between 2 and 5)
  )
);

-- Who created a poll, kept apart so no client grant on polls can ever expose
-- it (column grants were the alternative, and policy subqueries trip on them).
create table if not exists public.poll_creators (
  poll_id    uuid primary key references public.polls (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists poll_creators_user_idx on public.poll_creators (user_id, created_at desc);

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls (id) on delete cascade,
  label    text not null check (char_length(label) between 1 and 80),
  position smallint not null default 0,
  unique (poll_id, id)
);

-- One ballot per poll per cookie, per device key, per account.
create table if not exists public.poll_ballots (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.polls (id) on delete cascade,
  voter_key   text not null,
  device_key  text,
  user_id     uuid references auth.users (id) on delete set null,
  in_vicinity boolean not null default false,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  unique (poll_id, voter_key)
);
create unique index if not exists poll_ballots_device_unique
  on public.poll_ballots (poll_id, device_key) where device_key is not null;
create unique index if not exists poll_ballots_user_unique
  on public.poll_ballots (poll_id, user_id) where user_id is not null;

create table if not exists public.poll_choices (
  ballot_id uuid not null references public.poll_ballots (id) on delete cascade,
  poll_id   uuid not null,
  option_id uuid not null,
  rank      smallint check (rank is null or rank between 1 and 5),
  primary key (ballot_id, option_id),
  foreign key (poll_id, option_id) references public.poll_options (poll_id, id) on delete cascade
);

create table if not exists public.poll_reports (
  poll_id     uuid not null references public.polls (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (poll_id, reporter_id)
);

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_ballots enable row level security;
alter table public.poll_choices enable row level security;
alter table public.poll_reports enable row level security;
alter table public.poll_creators enable row level security;
revoke all on public.poll_creators from anon, authenticated;

-- Live polls and their options are public. The creator is in poll_creators.
revoke all on public.polls from anon, authenticated;
grant select on public.polls to anon, authenticated;

drop policy if exists "polls_select_live" on public.polls;
create policy "polls_select_live" on public.polls
  for select to anon, authenticated
  using (hidden_at is null and starts_at <= now() and ends_at > now());

revoke all on public.poll_options from anon, authenticated;
grant select on public.poll_options to anon, authenticated;

drop policy if exists "poll_options_select_live" on public.poll_options;
create policy "poll_options_select_live" on public.poll_options
  for select to anon, authenticated
  using (exists (select 1 from public.polls p
                  where p.id = poll_id and p.hidden_at is null
                    and p.starts_at <= now() and p.ends_at > now()));

-- Ballots are written only by cast_poll_vote() via the server route.
revoke all on public.poll_ballots, public.poll_choices from anon, authenticated;

revoke all on public.poll_reports from anon;
revoke select, update, delete on public.poll_reports from authenticated;
grant insert on public.poll_reports to authenticated;
drop policy if exists "poll_reports_insert_own" on public.poll_reports;
create policy "poll_reports_insert_own" on public.poll_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

create or replace function public.poll_reports_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.polls
     set report_count = report_count + 1,
         hidden_at = case when report_count + 1 >= 3 and hidden_at is null then now() else hidden_at end
   where id = new.poll_id;
  return new;
end;
$$;

drop trigger if exists poll_reports_apply on public.poll_reports;
create trigger poll_reports_apply
  after insert on public.poll_reports
  for each row execute function public.poll_reports_apply();

-- Any signed-in account; 3 a day; text cleaned like gist.
create or replace function public.create_poll(
  p_campus    uuid,
  p_question  text,
  p_kind      text,
  p_max       smallint,
  p_scope     text,
  p_days      integer,
  p_options   text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_poll  uuid;
  v_opts  text[];
  v_i     integer;
  v_max   smallint;
begin
  if v_uid is null then
    raise exception 'Sign in to create a poll' using errcode = '28000';
  end if;
  if (select count(*) from public.poll_creators where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You can create 3 polls a day' using errcode = 'P0001';
  end if;

  select array_agg(public.clean_post(o) order by ord)
    into v_opts
    from unnest(p_options) with ordinality as t(o, ord)
   where btrim(coalesce(o, '')) <> '';
  if coalesce(array_length(v_opts, 1), 0) not between 2 and 10 then
    raise exception 'Give between 2 and 10 options' using errcode = 'P0001';
  end if;

  v_max := case p_kind
             when 'single' then 1
             when 'multi'  then greatest(2, least(coalesce(p_max, 2), array_length(v_opts, 1)))
             when 'ranked' then greatest(2, least(coalesce(p_max, 3), 5, array_length(v_opts, 1)))
           end;
  if v_max is null then
    raise exception 'Unknown poll type' using errcode = 'P0001';
  end if;

  insert into public.polls (campus_id, author_name, question, kind, max_choices, scope, ends_at)
  values (
    p_campus,
    coalesce((select display_name from public.profiles where id = v_uid), 'Anonymous'),
    public.clean_post(p_question), p_kind, v_max,
    case when p_scope = 'local' then 'local' else 'open' end,
    now() + make_interval(days => greatest(1, least(coalesce(p_days, 3), 30)))
  )
  returning id into v_poll;

  insert into public.poll_creators (poll_id, user_id) values (v_poll, v_uid);

  for v_i in 1 .. array_length(v_opts, 1) loop
    insert into public.poll_options (poll_id, label, position) values (v_poll, left(v_opts[v_i], 80), v_i - 1);
  end loop;
  return v_poll;
end;
$$;

revoke all on function public.create_poll(uuid, text, text, smallint, text, integer, text[]) from public, anon;
grant execute on function public.create_poll(uuid, text, text, smallint, text, integer, text[]) to authenticated;

-- Called ONLY by /api/polls/vote with the service role, which supplies the
-- voter keys and the vicinity result. Not executable by clients.
create or replace function public.cast_poll_vote(
  p_poll        uuid,
  p_voter_key   text,
  p_device_key  text,
  p_user        uuid,
  p_in_vicinity boolean,
  p_ip_hash     text,
  p_options     uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll   public.polls%rowtype;
  v_ballot uuid;
  v_n      integer := coalesce(array_length(p_options, 1), 0);
  v_i      integer;
begin
  select * into v_poll from public.polls
   where id = p_poll and hidden_at is null and starts_at <= now() and ends_at > now();
  if not found then
    raise exception 'This poll has closed' using errcode = 'P0001';
  end if;
  if v_poll.scope = 'local' and not coalesce(p_in_vicinity, false) then
    raise exception 'Only people near campus can vote on this one' using errcode = 'P0001';
  end if;
  if v_n = 0 or v_n <> (select count(distinct x) from unnest(p_options) x) then
    raise exception 'Pick your answer' using errcode = 'P0001';
  end if;
  if v_poll.kind = 'single' and v_n <> 1 then
    raise exception 'Pick one answer' using errcode = 'P0001';
  end if;
  if v_n > v_poll.max_choices then
    raise exception 'Pick up to %', v_poll.max_choices using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_options) x
              where not exists (select 1 from public.poll_options o where o.poll_id = p_poll and o.id = x)) then
    raise exception 'That option is not in this poll' using errcode = 'P0001';
  end if;

  begin
    insert into public.poll_ballots (poll_id, voter_key, device_key, user_id, in_vicinity, ip_hash)
    values (p_poll, p_voter_key, p_device_key, p_user, coalesce(p_in_vicinity, false), p_ip_hash)
    returning id into v_ballot;
  exception when unique_violation then
    raise exception 'You have already voted on this poll' using errcode = 'P0001';
  end;

  for v_i in 1 .. v_n loop
    insert into public.poll_choices (ballot_id, poll_id, option_id, rank)
    values (v_ballot, p_poll, p_options[v_i], case when v_poll.kind = 'ranked' then v_i end);
  end loop;
end;
$$;

revoke all on function public.cast_poll_vote(uuid, text, text, uuid, boolean, text, uuid[]) from public, anon, authenticated;

-- Totals, never identities. Ranked: first choice of N scores N points,
-- second N-1, and so on. near/far split shows the vicinity tag.
create or replace function public.poll_results(p_poll uuid)
returns table (option_id uuid, score bigint, votes_near bigint, votes_far bigint, ballots bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
         coalesce(sum(case when p.kind = 'ranked' then p.max_choices - c.rank + 1 else 1 end)
                  filter (where c.ballot_id is not null), 0)::bigint,
         count(c.ballot_id) filter (where b.in_vicinity),
         count(c.ballot_id) filter (where not b.in_vicinity),
         (select count(*) from public.poll_ballots bb where bb.poll_id = p_poll)
    from public.poll_options o
    join public.polls p on p.id = o.poll_id and p.hidden_at is null
    left join public.poll_choices c on c.option_id = o.id and c.poll_id = o.poll_id
    left join public.poll_ballots b on b.id = c.ballot_id
   where o.poll_id = p_poll
   group by o.id;
$$;

revoke all on function public.poll_results(uuid) from public;
grant execute on function public.poll_results(uuid) to anon, authenticated;

-- The first poll, from the design, featured at the launch campus.
do $$
declare
  v_campus uuid;
  v_poll   uuid;
begin
  select id into v_campus from public.campuses where code = 'KWASU' limit 1;
  if v_campus is null or exists (select 1 from public.polls where campus_id = v_campus) then
    return;
  end if;
  insert into public.polls (campus_id, author_name, question, is_featured, ends_at)
  values (v_campus, 'Sync', 'Best place to read before exams around KWASU?', true, now() + interval '14 days')
  returning id into v_poll;
  insert into public.poll_options (poll_id, label, position) values
    (v_poll, 'Main library', 0),
    (v_poll, 'Faculty reading room', 1),
    (v_poll, 'Hostel common room', 2),
    (v_poll, 'Quiet cafe with Wi-Fi', 3);
end;
$$;


-- ── 9. Verify ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['gist_posts', 'gist_reactions', 'gist_reports', 'gist_masked_words',
                           'gist_identity_reveals', 'gist_daily_stats', 'polls', 'poll_options',
                           'poll_ballots', 'poll_choices', 'poll_reports', 'poll_creators'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = t and c.relrowsecurity) then
      raise exception 'RLS is not enabled on public.%', t;
    end if;
  end loop;

  -- The whole point: no client can read who wrote a post.
  if has_table_privilege('anon', 'public.gist_posts', 'SELECT')
     or has_table_privilege('authenticated', 'public.gist_posts', 'SELECT') then
    raise exception 'clients can read gist_posts directly, which exposes author_id';
  end if;
  if has_table_privilege('anon', 'public.poll_creators', 'SELECT')
     or has_table_privilege('authenticated', 'public.poll_creators', 'SELECT') then
    raise exception 'clients can read who created a poll';
  end if;
  if has_function_privilege('authenticated', 'public.cast_poll_vote(uuid, text, text, uuid, boolean, text, uuid[])', 'EXECUTE') then
    raise exception 'clients can cast votes without the server route';
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and 'anon' = any (roles)
                and coalesce(qual, '') ilike '%is_staff%') then
    raise exception 'an anon policy calls is_staff(), which anon cannot execute';
  end if;

  if public.mask_words('what the Fucking hell') <> 'what the F*** hell' then
    raise exception 'mask_words did not mask as expected: %', public.mask_words('what the Fucking hell');
  end if;
  if public.mask_words('Dickson wrote the code') <> 'Dickson wrote the code' then
    raise exception 'mask_words masked innocent words';
  end if;
  if public.clean_post('call me 0803 123 4567 now') <> 'call me [number removed] now' then
    raise exception 'clean_post did not remove a phone number: %', public.clean_post('call me 0803 123 4567 now');
  end if;
end;
$$;
