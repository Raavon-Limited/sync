-- ============================================================================
-- store_verification_flow   the store verification flow, end to end.
--
-- NOT A pgTAP FILE, which is why it lives in supabase/checks and not
-- supabase/tests: `supabase test db` would run it through pg_prove and report a
-- failure. It is a plain psql script that raises on the first broken step.
--
-- RUN IT AGAINST A LOCAL DATABASE ONLY. It inserts auth users and a store. It
-- is wrapped in one transaction that rolls back, but production is not where
-- that should be trusted.
--
--   npx supabase start
--   docker exec -i supabase_db_sync psql -U postgres -d postgres < supabase/checks/store_verification_flow.sql
--
-- Expect PASS 1 through PASS 7 as notices. Any FAIL aborts with the reason.
--
-- WHY IT EXISTS
--   Every migration in this flow has a verify block, and those prove the
--   catalogue: the trigger exists, the guard names verified_at, one decision
--   function. None of them prove behaviour. This does: that creating a store
--   actually queues a visit, that the owner's PATCH is reverted, that a
--   SECURITY DEFINER decision gets past a current_user guard (the docs
--   disagreed; see WORKFLOW section 5), and that the bell's count, list and
--   mark-all agree per dashboard.
-- ============================================================================
\set ON_ERROR_STOP on
begin;

-- ── People ───────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local',  now(), '{"full_name":"Test Staff"}',  '{}', now(), now()),
  ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendor@test.local', now(), '{"full_name":"Test Vendor","business_name":"Mama Put"}', '{}', now(), now()),
  ('c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'agent@test.local',  now(), '{"full_name":"Test Agent"}',  '{}', now(), now());

-- Roles set as postgres, which the profile guard does not police.
update public.profiles set role = 'admin',  roles = array['student','admin']  where id = 'a0000000-0000-0000-0000-00000000000a';
update public.profiles set role = 'vendor', roles = array['student','vendor'] where id = 'b0000000-0000-0000-0000-00000000000b';
update public.profiles set role = 'agent',  roles = array['student','agent']  where id = 'c0000000-0000-0000-0000-00000000000c';

-- ── 1. Vendor onboards and creates a store ──────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select public.ensure_vendor_profile();
insert into public.storefronts (vendor_id, name, slug, address, area)
values ('b0000000-0000-0000-0000-00000000000b', 'Tanke branch', 'zz-test-tanke', '12 Probe Road, Malete', 'KWASU Gate');
reset role;

do $t$
declare v public.verification_visits%rowtype; n int;
begin
  select * into v from public.verification_visits
   where storefront_id = (select id from public.storefronts where slug = 'zz-test-tanke');
  if not found then raise exception 'FAIL 1: creating a store queued no visit'; end if;
  if v.status <> 'Not Visited' or v.ambassador_id is not null then
    raise exception 'FAIL 1: visit is % with agent %', v.status, v.ambassador_id; end if;
  if v.brief not like '%12 Probe Road%' then raise exception 'FAIL 1: brief lacks the address: %', v.brief; end if;
  select count(*) into n from public.notifications
   where user_id = 'a0000000-0000-0000-0000-00000000000a' and entity_id = v.id and role = 'admin';
  if n <> 1 then raise exception 'FAIL 1: staff got % role-stamped alerts, expected 1', n; end if;
  raise notice 'PASS 1  store creation queued visit (%), brief has address, staff alerted as admin', v.status;
end $t$;

-- ── 2. The owner cannot verify their own store ──────────────────────────────
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
update public.storefronts set verified_at = now(), verified_by = 'b0000000-0000-0000-0000-00000000000b' where slug = 'zz-test-tanke';
reset role;
do $t$ begin
  if (select verified_at from public.storefronts where slug = 'zz-test-tanke') is not null then
    raise exception 'FAIL 2: the owner verified their own store'; end if;
  raise notice 'PASS 2  owner PATCH of verified_at was reverted by the guard';
end $t$;

-- ── 3. Staff assign an agent to the queued row ──────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.reassign_verification_visit(
  (select id from public.verification_visits where storefront_id = (select id from public.storefronts where slug = 'zz-test-tanke')),
  'c0000000-0000-0000-0000-00000000000c');
-- Deciding before the agent has filed must be refused.
do $t$ begin
  perform public.decide_verification_visit(
    (select id from public.verification_visits where storefront_id = (select id from public.storefronts where slug = 'zz-test-tanke')),
    'Verified', null);
  raise exception 'FAIL 3: a visit with no filed report was decided';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS 3a decide before filing refused: %', sqlerrm;
end $t$;
reset role;
do $t$
declare v public.verification_visits%rowtype; n_agent int; n_vendor int;
begin
  select * into v from public.verification_visits where storefront_id = (select id from public.storefronts where slug = 'zz-test-tanke');
  if v.ambassador_id is distinct from 'c0000000-0000-0000-0000-00000000000c' then raise exception 'FAIL 3: agent not assigned'; end if;
  select count(*) into n_agent  from public.notifications where user_id = 'c0000000-0000-0000-0000-00000000000c' and entity_id = v.id and role = 'agent' and title like '%Mama Put - Tanke branch%';
  if n_agent <> 1 then raise exception 'FAIL 3: agent alert missing, unstamped, or unnamed (%)', n_agent; end if;
  raise notice 'PASS 3b agent assigned; alert names "Mama Put - Tanke branch" and is stamped agent';
end $t$;

-- ── 4. The agent files evidence ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
select public.submit_verification_visit(
  (select id from public.verification_visits where storefront_id = (select id from public.storefronts where slug = 'zz-test-tanke')),
  array['photos/front.jpg'], 'videos/walk.mp4', 'Shop is open and trading', 'selfies/agent.jpg');
reset role;

-- ── 5. Staff decide; the store becomes verified ─────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.decide_verification_visit(
  (select id from public.verification_visits where storefront_id = (select id from public.storefronts where slug = 'zz-test-tanke')),
  'Verified', 'Looks right');
reset role;
do $t$
declare s public.storefronts%rowtype; v public.verification_visits%rowtype; n int;
begin
  select * into s from public.storefronts where slug = 'zz-test-tanke';
  select * into v from public.verification_visits where storefront_id = s.id;
  if v.status <> 'Verified' then raise exception 'FAIL 5: visit is %', v.status; end if;
  -- The question the docs disagreed on: can a SECURITY DEFINER write get past
  -- a current_user guard? If verified_at is null, it cannot.
  if s.verified_at is null then raise exception 'FAIL 5: decide ran but the guard reverted storefronts.verified_at'; end if;
  if s.verified_by is distinct from 'a0000000-0000-0000-0000-00000000000a' then raise exception 'FAIL 5: verified_by is %', s.verified_by; end if;
  select count(*) into n from public.notifications where user_id = s.vendor_id and entity_id = v.id and role = 'vendor' and title like '%is verified%';
  if n <> 1 then raise exception 'FAIL 5: vendor got % "is verified" alerts stamped vendor', n; end if;
  raise notice 'PASS 5  decided: store verified_at set through the definer function, vendor told as vendor';
end $t$;

-- ── 6. The bell filter ──────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare as_vendor int; as_admin int; unfiltered int; cleared int;
begin
  select notifications into as_vendor  from public.get_unread_counts('vendor');
  select notifications into as_admin   from public.get_unread_counts('admin');
  select notifications into unfiltered from public.get_unread_counts();
  if as_vendor < 2 then raise exception 'FAIL 6: vendor dashboard count is %, expected >= 2', as_vendor; end if;
  if as_admin >= as_vendor then raise exception 'FAIL 6: vendor alerts leaked into the admin count (% vs %)', as_admin, as_vendor; end if;
  if unfiltered < as_vendor then raise exception 'FAIL 6: unfiltered % < filtered %', unfiltered, as_vendor; end if;
  -- "Mark all read" on the admin dashboard must not clear vendor alerts.
  select public.mark_notifications_read(null, 'admin') into cleared;
  if (select notifications from public.get_unread_counts('vendor')) <> as_vendor then
    raise exception 'FAIL 6: marking the admin bell read cleared vendor alerts'; end if;
  raise notice 'PASS 6  counts vendor=% admin=% all=%; admin mark-all left vendor badge intact', as_vendor, as_admin, unfiltered;
end $t$;
reset role;

-- super_admin sees staff alerts
do $t$ begin
  if private.notification_hats('super_admin') <> array['admin','super_admin'] then raise exception 'FAIL 7'; end if;
  raise notice 'PASS 7  super_admin shares the staff hat';
end $t$;

rollback;
