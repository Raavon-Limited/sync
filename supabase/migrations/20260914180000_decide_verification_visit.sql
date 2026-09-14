-- ============================================================================
-- decide_verification_visit   one decision path for every kind of visit.
--
-- WHAT THERE WAS
--   Three subjects and three different stories about deciding them:
--
--   hostel  `decideHostelVisit`, a server action on the service role. It wrote
--           the visit row, then `hostels.verified`, as two separate statements.
--           A failure between them left a Verified visit on an unverified
--           hostel, which the next reviewer reads as a bug rather than as a
--           half-applied write. It told the landlord nothing either way.
--   store   `decide_store_visit` (20260912120000), one transaction.
--   vendor  nothing. The buttons were disabled, so a visit against a whole
--           business could be assigned, attended and filed, and then sat at
--           'Under Review' forever with no way to close it.
--
-- ONE FUNCTION, BRANCHING ON THE SUBJECT
--   The rules that make a decision safe   staff only, evidence first, never
--   twice   are the same for all three, and they had already been written out
--   twice, once in TypeScript and once in PL/pgSQL. Those copies drift the
--   first time one changes. What differs is only what else moves, and that is
--   the branch below.
--
-- WHAT A VENDOR-WIDE DECISION DOES, AND WHY IT IS SO LITTLE
--   It closes the visit and records the outcome. It does NOT touch
--   `vendor_profiles.verification_status`.
--
--   That status is decided from DOCUMENTS by `set_verification_status`, which
--   refuses to verify a business with no approved document. A photograph of a
--   shopfront is evidence about a place, not an identity check, and letting it
--   move the status would open a second road to 'verified' that skips the
--   documents rail entirely   the exact bypass 20260901260000 closed.
--
--   So the finding is recorded on the visit, where the reviewer deciding the
--   documents can weigh it. Rejecting one is how a reviewer says "the agent
--   found nobody at that address", and that is worth saying even though it
--   changes no flag.
--
-- ROLLBACK
--   drop function if exists public.decide_verification_visit(uuid, text, text);
--   restore public.decide_store_visit from 20260912120000.
-- ============================================================================

create or replace function public.decide_verification_visit(
  p_visit    uuid,
  p_decision text,
  p_notes    text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_row   public.verification_visits%rowtype;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_owner uuid;
  v_place text;
  v_href  text;
  v_role  text;
begin
  if not public.is_staff() then
    raise exception 'Only Sync staff can decide a verification visit' using errcode = '42501';
  end if;

  if p_decision not in ('Verified', 'Rejected') then
    raise exception 'A visit is Verified or Rejected. Fraud goes through flag_visit_fraud.'
      using errcode = '22023';
  end if;

  select * into v_row from public.verification_visits where id = p_visit for update;
  if not found then
    raise exception 'That visit no longer exists' using errcode = 'P0002';
  end if;

  if v_row.status in ('Verified', 'Rejected', 'Fraud') then
    raise exception 'That visit has already been decided' using errcode = 'P0001';
  end if;

  -- EVIDENCE BEFORE A DECISION. 'Under Review' is only reachable through
  -- submit_verification_visit, which refuses a filing with no photograph, so
  -- the status check is the rule. REJECTION IS GATED TOO: rejecting a place
  -- nobody visited tells its owner they failed a check that never happened.
  if v_row.status <> 'Under Review' then
    raise exception 'The agent has not filed their report yet, so there is nothing to decide on'
      using errcode = 'P0001';
  end if;

  -- Belt and braces, carried over from decideHostelVisit: only reachable if a
  -- row got to 'Under Review' some other way, most likely a hand-run UPDATE.
  if coalesce(array_length(v_row.photos, 1), 0) = 0 and v_row.video_url is null then
    raise exception 'That visit has no photo or video on it. It cannot be decided.'
      using errcode = 'P0001';
  end if;

  update public.verification_visits
     set status     = p_decision,
         decided_by = v_uid,
         decided_at = now(),
         notes      = coalesce(v_notes, notes),
         updated_at = now()
   where id = p_visit;

  if v_row.hostel_id is not null then
    -- Set false on a rejection, not just left alone: a hostel verified by an
    -- earlier visit and rejected on a re-check has to lose the badge.
    update public.hostels
       set verified   = (p_decision = 'Verified'),
           updated_at = now()
     where id = v_row.hostel_id
    returning landlord_id, name into v_owner, v_place;
    v_href := 'properties';
    v_role := 'landlord';

  elsif v_row.storefront_id is not null then
    update public.storefronts
       set verified_at = case when p_decision = 'Verified' then now() else null end,
           verified_by = case when p_decision = 'Verified' then v_uid else null end,
           updated_at  = now()
     where id = v_row.storefront_id
    returning vendor_id, name into v_owner, v_place;
    v_href := 'stores';
    v_role := 'vendor';

  else
    -- Vendor-wide. Deliberately no flag moves; see the header.
    v_owner := null;
  end if;

  -- THE OWNER HEARS THE OUTCOME. The hostel path never told the landlord, so
  -- a verified badge appeared, or failed to, with no word from us about why.
  -- Not sent for a vendor-wide visit: its outcome is an input to the documents
  -- review, and announcing "verified" there would contradict a status the
  -- business can still see as 'pending'.
  if v_owner is not null then
    perform private.notify(
      v_owner,
      'verification',
      case when p_decision = 'Verified'
           then coalesce(v_place, 'Your listing') || ' is verified'
           else 'We could not verify ' || coalesce(v_place, 'your listing') end,
      case when p_decision = 'Verified'
           then 'A Sync agent confirmed it is really there.'
           else coalesce(v_notes,
                         'The agent could not confirm it. Check the details and contact support.')
      end,
      v_href,
      null,
      p_visit,
      'verification_visit',
      v_role
    );
  end if;

  insert into private.audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (v_uid, 'staff', 'visit.decided', 'verification_visit', p_visit::text,
          jsonb_build_object('status', v_row.status),
          jsonb_build_object('status', p_decision,
                             'hostel', v_row.hostel_id,
                             'storefront', v_row.storefront_id,
                             'vendor', v_row.vendor_id));

  return p_decision;
end;
$fn$;

revoke all on function public.decide_verification_visit(uuid, text, text) from public, anon;
grant execute on function public.decide_verification_visit(uuid, text, text) to authenticated, service_role;

comment on function public.decide_verification_visit(uuid, text, text) is
  'The ONLY way to decide a verification visit, for any subject. Staff only, audited, refuses a visit with no filed evidence. Moves hostels.verified or storefronts.verified_at in the same transaction; a vendor-wide visit records its outcome and moves no status.';

-- Superseded two days after it was written. Dropped rather than kept as a
-- wrapper: two functions that decide a store is one more than the queue needs,
-- and the only caller changes in the same commit.
drop function if exists public.decide_store_visit(uuid, text, text);

-- ── Verify ──────────────────────────────────────────────────────────────────
do $fn$
declare
  v_src text;
begin
  if to_regprocedure('public.decide_verification_visit(uuid, text, text)') is null then
    raise exception 'decide_verification_visit is missing';
  end if;

  if to_regprocedure('public.decide_store_visit(uuid, text, text)') is not null then
    raise exception 'decide_store_visit still exists   there are two ways to decide a store';
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'decide_verification_visit';

  -- The evidence gate is the whole point of the function.
  if position('Under Review' in v_src) = 0 then
    raise exception 'decide_verification_visit does not require a filed report';
  end if;

  -- The vendor branch must never reach the documents rail. If a later rewrite
  -- adds it, a photograph becomes a road to 'verified' that skips documents.
  if position('verification_status' in v_src) > 0 then
    raise exception 'decide_verification_visit writes verification_status   that bypasses the documents review';
  end if;

  if has_function_privilege('anon', 'public.decide_verification_visit(uuid, text, text)', 'execute') then
    raise exception 'anon can execute decide_verification_visit';
  end if;
end;
$fn$;
