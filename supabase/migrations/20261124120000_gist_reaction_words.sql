-- ============================================================================
-- gist_reaction_words   Six word reactions, one per person, no account needed.
--
-- WHAT CHANGES
--   A gist had one reaction, "Same here", and only a signed-in account could
--   give it. The founder asked for a few words instead, and for anyone to be
--   able to react:
--       same_here  "Same here"     co_ask  "I co ask"   facts  "Facts"
--       lol        "Lol"           wahala  "Wahala"     thanks "Thanks"
--   ONE WORD PER PERSON PER POST: picking another word switches yours, picking
--   the same one again takes it back. Like a chat app's reactions.
--
-- WHO "A PERSON" IS
--   reactor = 'u:<account id>' when signed in, else 'd:<sha256 of the device
--   id>' the page keeps in localStorage (the same `sync:device` key polls
--   use). Hashed in here, so the table never holds the raw id.
--
--   Why not the polls' httpOnly-cookie route: it buys nothing for reactions.
--   A script that wants to inflate a count drops the cookie and gets a new one
--   per request just as easily as it invents a device id, and the feed has to
--   show which word YOU picked - which the browser can only ask about with an
--   id it can read. So this is one SECURITY DEFINER function anyone may call,
--   and the honest limit is the same as polls': a new browser is a new person.
--
--   A device that reacted signed out and then signs in is MERGED: its device
--   row for that post is dropped when the account reacts, so one human does
--   not count twice across a sign-in.
--
-- EXISTING DATA
--   Every existing reaction was a signed-in "same here". They become
--   kind 'same_here', reactor 'u:<user_id>'. No count changes.
--
-- COMPATIBILITY WINDOW
--   gist_feed changes its return columns, so it is dropped and recreated
--   (42P13 otherwise). The site deployed before this migration reads the old
--   columns and shows no counts until the new code is live - nothing errors.
--   toggle_gist_reaction(uuid) is rewritten onto the new table for that same
--   window and can be dropped once the new site is out.
--
-- ROLLBACK
--   drop function public.react_to_gist(uuid, text, text);
--   restore gist_feed and toggle_gist_reaction from 20261124090000; then
--   delete from gist_reactions where user_id is null; drop columns kind,
--   reactor; restore primary key (post_id, user_id).
-- ============================================================================


-- ── 1. The table: a word, and who picked it ─────────────────────────────────
alter table public.gist_reactions add column if not exists kind text not null default 'same_here';
alter table public.gist_reactions add column if not exists reactor text;

update public.gist_reactions set reactor = 'u:' || user_id::text where reactor is null;

alter table public.gist_reactions alter column reactor set not null;
-- An anonymous reaction has no account. user_id stays for the account case,
-- so deleting an account still cascades its reactions away.
alter table public.gist_reactions alter column user_id drop not null;

alter table public.gist_reactions drop constraint if exists gist_reactions_pkey;
alter table public.gist_reactions add constraint gist_reactions_pkey primary key (post_id, reactor);

alter table public.gist_reactions drop constraint if exists gist_reactions_kind_check;
alter table public.gist_reactions add constraint gist_reactions_kind_check
  check (kind in ('same_here', 'co_ask', 'facts', 'lol', 'wahala', 'thanks'));

alter table public.gist_reactions drop constraint if exists gist_reactions_reactor_check;
alter table public.gist_reactions add constraint gist_reactions_reactor_check
  check (reactor ~ '^(u:[0-9a-f-]{36}|d:[0-9a-f]{64})$');

-- Still no client grants: who reacted is not public. Counts leave through
-- gist_feed(), changes go in through react_to_gist().
revoke all on public.gist_reactions from anon, authenticated;


-- ── 2. React ─────────────────────────────────────────────────────────────────
create or replace function public.react_to_gist(p_post uuid, p_kind text, p_device text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_device  text;
  v_reactor text;
  v_current text;
begin
  if p_kind is not null
     and p_kind not in ('same_here', 'co_ask', 'facts', 'lol', 'wahala', 'thanks') then
    raise exception 'That reaction is not one of ours.' using errcode = 'P0001';
  end if;

  if p_device is not null and char_length(p_device) between 8 and 100 then
    v_device := 'd:' || encode(sha256(convert_to('d:' || p_device, 'UTF8')), 'hex');
  end if;

  if v_uid is not null then
    v_reactor := 'u:' || v_uid::text;
  elsif v_device is not null then
    v_reactor := v_device;
  else
    -- Signed out with storage blocked: there is nothing to count you by.
    raise exception 'Could not react from this browser. Try another, or sign in.' using errcode = 'P0001';
  end if;

  -- Only what the feed shows can be reacted to.
  if not exists (select 1 from public.gist_posts p where p.id = p_post and p.hidden_at is null) then
    raise exception 'That post is no longer up.' using errcode = 'P0001';
  end if;

  -- Signed in now, reacted signed out earlier on this device: one person.
  if v_uid is not null and v_device is not null then
    delete from public.gist_reactions where post_id = p_post and reactor = v_device;
  end if;

  select r.kind into v_current
    from public.gist_reactions r
   where r.post_id = p_post and r.reactor = v_reactor
   for update;

  -- No word, or the word you already picked: take it back.
  if p_kind is null or v_current = p_kind then
    delete from public.gist_reactions where post_id = p_post and reactor = v_reactor;
    return null;
  end if;

  insert into public.gist_reactions (post_id, reactor, user_id, kind)
  values (p_post, v_reactor, v_uid, p_kind)
  on conflict (post_id, reactor) do update
    set kind = excluded.kind, created_at = now();
  return p_kind;
end;
$fn$;

revoke all on function public.react_to_gist(uuid, text, text) from public;
grant execute on function public.react_to_gist(uuid, text, text) to anon, authenticated;


-- ── 3. The old one-word toggle, for the deploy window only ──────────────────
create or replace function public.toggle_gist_reaction(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  return public.react_to_gist(p_post, 'same_here') is not null;
end;
$fn$;


-- ── 4. The feed, with a count per word and the caller's own word ────────────
drop function if exists public.gist_feed(uuid, integer);

create or replace function public.gist_feed(p_campus uuid, p_limit integer default 20, p_device text default null)
returns table (
  id          uuid,
  author_name text,
  kind        text,
  body        text,
  created_at  timestamptz,
  reactions   jsonb,
  my_reaction text,
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
         coalesce(w.author_id = auth.uid(), false)
    from window_posts w
   order by (w.kind = 'alert' and w.created_at > now() - interval '2 hours') desc, w.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$fn$;

revoke all on function public.gist_feed(uuid, integer, text) from public;
grant execute on function public.gist_feed(uuid, integer, text) to anon, authenticated;


-- ── 5. Verify ────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.gist_reactions where reactor is null) then
    raise exception 'a reaction has no reactor';
  end if;

  if not has_function_privilege('anon', 'public.react_to_gist(uuid, text, text)', 'EXECUTE') then
    raise exception 'signed-out visitors cannot react, which is the point of this migration';
  end if;
  if not has_function_privilege('anon', 'public.gist_feed(uuid, integer, text)', 'EXECUTE') then
    raise exception 'signed-out visitors cannot read the feed';
  end if;

  -- Who reacted stays private.
  if has_table_privilege('anon', 'public.gist_reactions', 'SELECT')
     or has_table_privilege('authenticated', 'public.gist_reactions', 'SELECT') then
    raise exception 'clients can read gist_reactions directly';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'gist_feed'
                and pg_get_function_identity_arguments(p.oid) = 'p_campus uuid, p_limit integer') then
    raise exception 'the old two-argument gist_feed survived; calls would be ambiguous';
  end if;
end;
$$;
