-- ============================================================================
-- gist_live_updates   A new post or reaction shows up for everyone at once.
--
-- THE GAP
--   The feed polled every 60 seconds, so a student could wait a minute to see
--   a post their friend made in the same room.
--
-- WHY NOT postgres_changes (what lib/query/use-realtime.ts uses)
--   Realtime only delivers a row change to a subscriber who can SELECT that
--   row, and nobody can SELECT gist_posts or gist_reactions: the rows hold the
--   real author and who reacted (20261124090000, 20261124120000). Granting a
--   SELECT to make realtime work would undo the anonymity.
--
-- WHAT INSTEAD
--   A BROADCAST from the database: on any change to a post or a reaction,
--   realtime.send() pushes an EMPTY "changed" event to the public topic
--   'gist:<campus id>'. It carries no post data at all - the page refetches
--   through gist_feed(), which is where the privacy rules already live. So the
--   channel can be public; there is nothing on it to protect.
--
--   SECURITY DEFINER because the writer may be a signed-in student (gist posts
--   are inserted from the browser) or a signed-out visitor reacting, and
--   neither may call realtime.send() themselves. It sits in `private`: a
--   trigger function is never called through PostgREST, so that is fine.
--
--   A failed broadcast NEVER fails the write. If Realtime is down, the post
--   still saves and the 60-second poll still picks it up.
--
-- ROLLBACK
--   drop trigger gist_posts_broadcast on public.gist_posts;
--   drop trigger gist_reactions_broadcast on public.gist_reactions;
--   drop function private.broadcast_gist_post_change();
--   drop function private.broadcast_gist_reaction_change();
-- ============================================================================

-- One function per table: gist_posts has no post_id column, so a shared body
-- reading NEW.post_id would not resolve there.
create or replace function private.broadcast_gist_post_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_campus uuid := coalesce(new.campus_id, old.campus_id);
begin
  begin
    perform realtime.send(jsonb_build_object('what', 'post'), 'changed', 'gist:' || v_campus::text, false);
  exception when others then
    raise warning 'gist broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function private.broadcast_gist_reaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_campus uuid;
begin
  select p.campus_id into v_campus
    from public.gist_posts p
   where p.id = coalesce(new.post_id, old.post_id);
  if v_campus is not null then
    begin
      perform realtime.send(jsonb_build_object('what', 'reaction'), 'changed', 'gist:' || v_campus::text, false);
    exception when others then
      raise warning 'gist broadcast failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$fn$;

drop trigger if exists gist_posts_broadcast on public.gist_posts;
create trigger gist_posts_broadcast
  after insert or update or delete on public.gist_posts
  for each row execute function private.broadcast_gist_post_change();

drop trigger if exists gist_reactions_broadcast on public.gist_reactions;
create trigger gist_reactions_broadcast
  after insert or update or delete on public.gist_reactions
  for each row execute function private.broadcast_gist_reaction_change();


-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
begin
  -- Broadcast-from-database needs a recent Realtime. Better to fail here than
  -- to ship triggers that warn on every post.
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    raise exception 'realtime.send() is not available on this project; enable Realtime broadcast first';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'gist_posts_broadcast'
                  and tgrelid = 'public.gist_posts'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'gist_reactions_broadcast'
                     and tgrelid = 'public.gist_reactions'::regclass) then
    raise exception 'gist broadcast triggers are missing';
  end if;

  -- The whole design rests on this staying true.
  if has_table_privilege('anon', 'public.gist_posts', 'SELECT')
     or has_table_privilege('anon', 'public.gist_reactions', 'SELECT') then
    raise exception 'anon can read gist rows; the broadcast design assumes it cannot';
  end if;
end;
$$;
