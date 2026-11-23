-- ============================================================================
-- around_gist_and_polls   The public gist feed and campus polls on Around you.
--
-- WHAT IT IS
--   The landing page and /around carry "The gist near you" (short public posts:
--   gist, alert, event, deal) and "Students are saying" (a campus poll). Until
--   now neither had a table behind it, so the cards could only say "coming".
--
-- THE GIST IS PUBLIC, SO IT IS MODERATED FROM THE FIRST ROW
--   - Anyone can READ live posts, signed out included (the landing is public).
--   - Only a signed-in account can post. author_id and author_name are set by
--     the trigger, never by the client, so nobody can post as someone else.
--     The name is "First L." - never a phone number, never a full surname.
--   - At most 5 posts per author per hour (gist_posts_guard).
--   - Posts expire after 3 days: this is "what is happening now", not an
--     archive. Expired posts stay in the table for moderation history.
--   - Swear words are masked on insert ("f***"), see 1b.
--   - Reports: one per person per post. A post with 3 reports hides itself
--     (gist_reports_apply) until staff look at it. Staff can hide or unhide.
--   - "Same here" is gist_reactions, one per person per post.
--   - NOT the emergency channel. kind 'alert' here is a student saying "light
--     is back on our street", not an official alert. Official alerts are a
--     separate, permissioned feature.
--
-- POLLS
--   Staff create them (no client write policy). Anyone can read an active poll
--   and its options; only a signed-in account can vote, once per poll. Counts
--   come from poll_results(), which is SECURITY DEFINER so a voter sees totals
--   without being able to read who voted for what.
--
-- WHY is_staff() IS NOT IN THE anon POLICIES
--   is_staff() is not executable by anon (20260817090000). A policy that calls
--   it would fail every signed-out read with "permission denied for function".
--   So each read policy is split: one for anon (public rows only), one for
--   authenticated (public rows, plus own, plus staff).
--
-- ROLLBACK
--   drop table if exists public.poll_votes, public.poll_options, public.polls,
--     public.gist_masked_words, public.gist_reports, public.gist_reactions, public.gist_posts cascade;
--   drop function if exists public.mask_words(text), public.gist_posts_guard(), public.gist_reports_apply(),
--     public.poll_results(uuid);
-- ============================================================================


-- ── 1. Gist posts ────────────────────────────────────────────────────────────
create table if not exists public.gist_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references auth.users (id) on delete cascade,
  author_name  text not null default 'Sync student',
  campus_id    uuid references public.campuses (id) on delete set null,
  kind         text not null check (kind in ('gist', 'alert', 'event', 'deal')),
  body         text not null check (char_length(btrim(body)) between 3 and 280),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '3 days',
  hidden_at    timestamptz,
  report_count integer not null default 0 check (report_count >= 0)
);

create index if not exists gist_posts_feed_idx
  on public.gist_posts (campus_id, created_at desc)
  where hidden_at is null;

alter table public.gist_posts enable row level security;

drop policy if exists "gist_posts_select_anon" on public.gist_posts;
create policy "gist_posts_select_anon" on public.gist_posts
  for select to anon
  using (hidden_at is null and expires_at > now());

drop policy if exists "gist_posts_select_auth" on public.gist_posts;
create policy "gist_posts_select_auth" on public.gist_posts
  for select to authenticated
  using (
    (hidden_at is null and expires_at > now())
    or author_id = (select auth.uid())
    or public.is_staff()
  );

drop policy if exists "gist_posts_insert_own" on public.gist_posts;
create policy "gist_posts_insert_own" on public.gist_posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "gist_posts_delete_own" on public.gist_posts;
create policy "gist_posts_delete_own" on public.gist_posts
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_staff());

-- Hide / unhide is staff-only. Authors delete; they do not edit.
drop policy if exists "gist_posts_update_staff" on public.gist_posts;
create policy "gist_posts_update_staff" on public.gist_posts
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

revoke insert, update, delete, truncate on public.gist_posts from anon;

-- ── 1b. Word masking ─────────────────────────────────────────────────────────
-- Swear words are masked ON THE WAY IN, so the stored post already reads
-- "f***" and no client, cache or screenshot of the API ever has the raw word.
-- Each entry is a STEM matched at the start of a word, so 'fuck' also catches
-- "fucking"; the first letter stays so the sentence still reads. Staff add
-- words with a plain insert (service role / SQL editor); there is no client
-- write policy. Kept short and obvious on purpose: a long list starts masking
-- innocent words (no 'dick': it would mask Dickson), and the report button
-- covers what a list cannot.
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

revoke all on function public.mask_words(text) from public, anon, authenticated;

-- Everything the client could lie about is overwritten here.
create or replace function public.gist_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'sign in to post' using errcode = '28000';
  end if;

  select count(*) into v_recent
    from public.gist_posts
   where author_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'You are posting too fast. Try again in a bit.' using errcode = 'P0001';
  end if;

  -- "Aisha O." from "Aisha Ogunleye"; one word stays as is.
  select case
           when coalesce(btrim(p.full_name), '') = '' then 'Sync student'
           when position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
           else split_part(btrim(p.full_name), ' ', 1) || ' '
                || upper(left(split_part(btrim(p.full_name), ' ', 2), 1)) || '.'
         end
    into v_name
    from public.profiles p
   where p.id = v_uid;

  new.author_id    := v_uid;
  new.author_name  := coalesce(v_name, 'Sync student');
  new.body         := public.mask_words(btrim(new.body));
  new.created_at   := now();
  new.expires_at   := now() + interval '3 days';
  new.hidden_at    := null;
  new.report_count := 0;
  return new;
end;
$$;

drop trigger if exists gist_posts_guard on public.gist_posts;
create trigger gist_posts_guard
  before insert on public.gist_posts
  for each row execute function public.gist_posts_guard();


-- ── 2. "Same here" ───────────────────────────────────────────────────────────
create table if not exists public.gist_reactions (
  post_id    uuid not null references public.gist_posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.gist_reactions enable row level security;

drop policy if exists "gist_reactions_select" on public.gist_reactions;
create policy "gist_reactions_select" on public.gist_reactions
  for select to anon, authenticated using (true);

drop policy if exists "gist_reactions_insert_own" on public.gist_reactions;
create policy "gist_reactions_insert_own" on public.gist_reactions
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "gist_reactions_delete_own" on public.gist_reactions;
create policy "gist_reactions_delete_own" on public.gist_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.gist_reactions from anon;


-- ── 3. Reports ───────────────────────────────────────────────────────────────
create table if not exists public.gist_reports (
  post_id     uuid not null references public.gist_posts (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text check (reason is null or char_length(reason) <= 280),
  created_at  timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

alter table public.gist_reports enable row level security;

-- Reporters never read reports back; staff review them.
drop policy if exists "gist_reports_select_staff" on public.gist_reports;
create policy "gist_reports_select_staff" on public.gist_reports
  for select to authenticated using (public.is_staff());

drop policy if exists "gist_reports_insert_own" on public.gist_reports;
create policy "gist_reports_insert_own" on public.gist_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

revoke all on public.gist_reports from anon;

-- Three reports hide the post. SECURITY DEFINER because a reporter may not
-- update gist_posts; the count is not theirs to set any other way.
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


-- ── 4. Polls ─────────────────────────────────────────────────────────────────
create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  campus_id  uuid references public.campuses (id) on delete cascade,
  question   text not null check (char_length(btrim(question)) between 5 and 160),
  is_active  boolean not null default true,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls (id) on delete cascade,
  label    text not null check (char_length(btrim(label)) between 1 and 80),
  position smallint not null default 0,
  unique (poll_id, id)
);

create table if not exists public.poll_votes (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  option_id  uuid not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  -- The option must belong to THIS poll; a composite key, not a trigger.
  foreign key (poll_id, option_id) references public.poll_options (poll_id, id) on delete cascade
);

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;

drop policy if exists "polls_select_live" on public.polls;
create policy "polls_select_live" on public.polls
  for select to anon, authenticated
  using (is_active and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "poll_options_select_live" on public.poll_options;
create policy "poll_options_select_live" on public.poll_options
  for select to anon, authenticated
  using (exists (select 1 from public.polls p
                  where p.id = poll_id and p.is_active and p.starts_at <= now()
                    and (p.ends_at is null or p.ends_at > now())));

-- You can see your own vote (to show which one you picked), nobody else's.
drop policy if exists "poll_votes_select_own" on public.poll_votes;
create policy "poll_votes_select_own" on public.poll_votes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "poll_votes_insert_own" on public.poll_votes;
create policy "poll_votes_insert_own" on public.poll_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.polls p
                 where p.id = poll_id and p.is_active and p.starts_at <= now()
                   and (p.ends_at is null or p.ends_at > now()))
  );

revoke insert, update, delete, truncate on public.polls, public.poll_options from anon, authenticated;
revoke all on public.poll_votes from anon;

-- Totals without voter identities.
create or replace function public.poll_results(p_poll uuid)
returns table (option_id uuid, votes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, count(v.user_id)
    from public.poll_options o
    join public.polls p on p.id = o.poll_id and p.is_active
    left join public.poll_votes v on v.option_id = o.id and v.poll_id = o.poll_id
   where o.poll_id = p_poll
   group by o.id;
$$;

revoke all on function public.poll_results(uuid) from public;
grant execute on function public.poll_results(uuid) to anon, authenticated;

-- The first poll, from the design, at the launch campus. Skipped quietly if the
-- campus row is missing or a poll already exists there.
do $$
declare
  v_campus uuid;
  v_poll   uuid;
begin
  select id into v_campus from public.campuses where code = 'KWASU' limit 1;
  if v_campus is null or exists (select 1 from public.polls where campus_id = v_campus) then
    return;
  end if;
  insert into public.polls (campus_id, question)
  values (v_campus, 'Best place to read before exams around KWASU?')
  returning id into v_poll;
  insert into public.poll_options (poll_id, label, position) values
    (v_poll, 'Main library', 0),
    (v_poll, 'Faculty reading room', 1),
    (v_poll, 'Hostel common room', 2),
    (v_poll, 'Quiet cafe with Wi-Fi', 3);
end;
$$;


-- ── 5. Verify ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['gist_posts', 'gist_reactions', 'gist_reports', 'polls', 'poll_options', 'poll_votes'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = t and c.relrowsecurity) then
      raise exception 'RLS is not enabled on public.%', t;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger where tgname = 'gist_posts_guard'
                    and tgrelid = 'public.gist_posts'::regclass) then
    raise exception 'gist_posts_guard trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gist_reports_apply'
                    and tgrelid = 'public.gist_reports'::regclass) then
    raise exception 'gist_reports_apply trigger is missing';
  end if;

  -- The anon read policies must not call is_staff(): anon cannot execute it.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and 'anon' = any (roles)
                and tablename in ('gist_posts', 'gist_reactions', 'polls', 'poll_options')
                and coalesce(qual, '') ilike '%is_staff%') then
    raise exception 'an anon policy calls is_staff(), which anon cannot execute';
  end if;

  if public.mask_words('what the Fucking hell') <> 'what the F*** hell' then
    raise exception 'mask_words did not mask as expected: %', public.mask_words('what the Fucking hell');
  end if;
  if public.mask_words('the code works') <> 'the code works' then
    raise exception 'mask_words masked an innocent word: %', public.mask_words('the code works');
  end if;

  if has_table_privilege('anon', 'public.gist_posts', 'INSERT') then
    raise exception 'anon can insert gist posts';
  end if;
  if has_table_privilege('authenticated', 'public.polls', 'INSERT') then
    raise exception 'clients can create polls';
  end if;
end;
$$;
