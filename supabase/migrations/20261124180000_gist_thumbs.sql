-- ============================================================================
-- gist_thumbs   👍 / 👎 on a gist, separate from the word reactions.
--
-- WHAT
--   Each person gets ONE thumb per post (up or down) AND, independently, one
--   word (20261124120000). So a post can be thumbed up and laughed at by the
--   same student. Tap your thumb again to take it back; tap the other to switch.
--   No account needed, exactly like the words.
--
-- WHY A SEPARATE TABLE, NOT TWO MORE WORDS
--   gist_reactions' primary key is (post_id, reactor): one row per person, which
--   is the one-word rule. Thumbs in there would make 👍 replace "Lol". A table
--   of its own gives the thumb its own one-per-person rule.
--
-- WHO A PERSON IS: the same as the words - 'u:<account>' signed in, else
--   'd:<sha256 of the device id>'. A device that voted signed out and then
--   signs in is merged on its next vote, so one human never counts twice.
--
-- gist_feed CHANGES ITS COLUMNS AGAIN (ups, downs, my_vote), so it is dropped
-- and recreated (42P13 otherwise). The deployed site ignores columns
-- it does not know, so applying this before the new code is safe.
--
-- ROLLBACK
--   drop function public.vote_gist(uuid, integer, text);
--   drop table public.gist_votes;
--   restore gist_feed from 20261124120000.
-- ============================================================================


-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.gist_votes (
  post_id    uuid not null references public.gist_posts (id) on delete cascade,
  reactor    text not null check (reactor ~ '^(u:[0-9a-f-]{36}|d:[0-9a-f]{64})$'),
  -- Set for account votes so deleting the account takes its votes with it.
  user_id    uuid references auth.users (id) on delete cascade,
  value      smallint not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (post_id, reactor)
);
alter table public.gist_votes enable row level security;
-- Who voted is not public. Counts leave through gist_feed(), votes go in
-- through vote_gist().
revoke all on public.gist_votes from anon, authenticated;


-- ── 2. Vote ──────────────────────────────────────────────────────────────────
create or replace function public.vote_gist(p_post uuid, p_value integer, p_device text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_device  text;
  v_reactor text;
  v_current smallint;
begin
  if p_value is null or p_value not in (1, -1) then
    raise exception 'A thumb is up or down.' using errcode = 'P0001';
  end if;

  if p_device is not null and char_length(p_device) between 8 and 100 then
    v_device := 'd:' || encode(sha256(convert_to('d:' || p_device, 'UTF8')), 'hex');
  end if;

  if v_uid is not null then
    v_reactor := 'u:' || v_uid::text;
  elsif v_device is not null then
    v_reactor := v_device;
  else
    raise exception 'Could not vote from this browser. Try another, or sign in.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.gist_posts p where p.id = p_post and p.hidden_at is null) then
    raise exception 'That post is no longer up.' using errcode = 'P0001';
  end if;

  if v_uid is not null and v_device is not null then
    delete from public.gist_votes where post_id = p_post and reactor = v_device;
  end if;

  select v.value into v_current
    from public.gist_votes v
   where v.post_id = p_post and v.reactor = v_reactor
   for update;

  -- Same thumb again: take it back.
  if v_current = p_value then
    delete from public.gist_votes where post_id = p_post and reactor = v_reactor;
    return null;
  end if;

  insert into public.gist_votes (post_id, reactor, user_id, value)
  values (p_post, v_reactor, v_uid, p_value)
  on conflict (post_id, reactor) do update
    set value = excluded.value, created_at = now();
  return p_value;
end;
$fn$;

revoke all on function public.vote_gist(uuid, integer, text) from public;
grant execute on function public.vote_gist(uuid, integer, text) to anon, authenticated;


-- ── 3. The feed, now with thumbs ─────────────────────────────────────────────
drop function if exists public.gist_feed(uuid, integer, text);

create or replace function public.gist_feed(p_campus uuid, p_limit integer default 20, p_device text default null)
returns table (
  id          uuid,
  author_name text,
  kind        text,
  body        text,
  created_at  timestamptz,
  reactions   jsonb,
  my_reaction text,
  ups         bigint,
  downs       bigint,
  my_vote     integer,
  mine        boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with me as (
    select case
             when auth.uid() is not null then 'u:' || auth.uid()::text
             when p_device is not null and char_length(p_device) between 8 and 100
               then 'd:' || encode(sha256(convert_to('d:' || p_device, 'UTF8')), 'hex')
           end as reactor
  ),
  window_posts as (
    select p.*
      from public.gist_posts p
     where p.campus_id = p_campus
       and p.hidden_at is null
       and p.created_at > now() - interval '24 hours'
     order by p.created_at desc
     limit 50
  )
  select w.id, w.author_name, w.kind, w.body, w.created_at,
         coalesce(
           (select jsonb_object_agg(c.kind, c.n)
              from (select r.kind, count(*) as n
                      from public.gist_reactions r
                     where r.post_id = w.id
                     group by r.kind) c),
           '{}'::jsonb
         ),
         (select r.kind from public.gist_reactions r, me
           where r.post_id = w.id and r.reactor = me.reactor),
         (select count(*) from public.gist_votes v where v.post_id = w.id and v.value = 1),
         (select count(*) from public.gist_votes v where v.post_id = w.id and v.value = -1),
         (select v.value::integer from public.gist_votes v, me
           where v.post_id = w.id and v.reactor = me.reactor),
         coalesce(w.author_id = auth.uid(), false)
    from window_posts w
   order by (w.kind = 'alert' and w.created_at > now() - interval '2 hours') desc, w.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$fn$;

revoke all on function public.gist_feed(uuid, integer, text) from public;
grant execute on function public.gist_feed(uuid, integer, text) to anon, authenticated;


-- ── 4. Live: a thumb tells every open feed to refresh ────────────────────────
-- Reuses the reaction broadcaster from 20261124150000 (it only needs a
-- post_id column). Attached only when that migration is in, so this file never
-- depends on Realtime being enabled.
do $$
begin
  if to_regprocedure('private.broadcast_gist_reaction_change()') is not null then
    execute 'drop trigger if exists gist_votes_broadcast on public.gist_votes';
    execute 'create trigger gist_votes_broadcast
               after insert or update or delete on public.gist_votes
               for each row execute function private.broadcast_gist_reaction_change()';
  else
    raise notice 'live updates (20261124150000) not applied; thumbs will show on the 60s refresh';
  end if;
end;
$$;


-- ── 5. Verify ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'gist_votes' and c.relrowsecurity) then
    raise exception 'RLS is not enabled on public.gist_votes';
  end if;
  if has_table_privilege('anon', 'public.gist_votes', 'SELECT')
     or has_table_privilege('authenticated', 'public.gist_votes', 'SELECT') then
    raise exception 'clients can read who voted';
  end if;
  if not has_function_privilege('anon', 'public.vote_gist(uuid, integer, text)', 'EXECUTE') then
    raise exception 'signed-out visitors cannot vote';
  end if;
  if not has_function_privilege('anon', 'public.gist_feed(uuid, integer, text)', 'EXECUTE') then
    raise exception 'signed-out visitors cannot read the feed';
  end if;
end;
$$;
