-- ============================================================================
-- assign_inspection_agent
--
-- `confirm_inspection_payment` opens a hold whose `payee_id` is whoever was
-- assigned AT THE TIME OF PAYMENT   which, for a student who books before an
-- agent is allocated, is nobody. Nothing then ever fills it in, so
-- `settle_inspection` refuses with "That inspection has no agent to pay" and
-- the money sits held until somebody notices.
--
-- THIS IS THE SAME SHAPE AS claim_delivery, ON PURPOSE
--   An unclaimed delivery is a hold with money and no payee, filled in by the
--   transaction that wins the claim. An unassigned inspection is exactly that,
--   and the fix is the same one: whoever writes `ambassador_id` writes
--   `escrow_holds.payee_id` in the SAME transaction. Two statements in two
--   places is how they drift.
--
-- WHY REASSIGNMENT IS ALLOWED AND WHY IT STOPS
--   Agents fall ill and rosters change, so an inspection has to be movable.
--   But once the hold is no longer `held` the money has been paid, forfeited or
--   refunded, and moving the payee then would rewrite who was paid for work
--   already settled. So reassignment is permitted while the hold is open and
--   refused after   the same line `settle_inspection` draws.
--
-- UNASSIGN IS NOT DELETE
--   Clearing the agent returns the inspection to the queue with its money
--   intact. It is `p_agent => null`, not a separate function, because the two
--   would otherwise need identical guards and one of them would eventually
--   miss one.
--
-- ROLLBACK
--   drop function if exists public.assign_inspection_agent(uuid, uuid);
-- ============================================================================

create or replace function public.assign_inspection_agent(
  p_inspection uuid,
  -- null unassigns: back to the queue, money untouched.
  p_agent      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i    public.hostel_inspections%rowtype;
  v_hold public.escrow_holds%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Only staff can assign an inspection' using errcode = '42501';
  end if;

  select * into v_i from public.hostel_inspections where id = p_inspection for update;
  if not found then
    raise exception 'no such inspection' using errcode = 'P0002';
  end if;

  if v_i.status not in ('pending_payment', 'scheduled') then
    raise exception 'That inspection is already finished' using errcode = 'P0001';
  end if;

  -- Same check assign_verification_visit makes. An account that is not an agent
  -- cannot be sent to a student's door, and cannot be made the payee of an
  -- agent's fee.
  if p_agent is not null and not exists (
    select 1 from public.profiles
     where id = p_agent
       and ('agent' = any (coalesce(roles, array[]::text[])) or role = 'agent')
  ) then
    raise exception 'That account is not an agent' using errcode = '22023';
  end if;

  -- An agent must not inspect on behalf of a student who is themselves   the
  -- fee would be paid from and to the same person, and the report would be
  -- self-attested.
  if p_agent is not null and p_agent = v_i.student_id then
    raise exception 'An agent cannot inspect for themselves' using errcode = '22023';
  end if;

  select * into v_hold from public.escrow_holds
   where inspection_id = p_inspection for update;

  -- Settled money is not reassignable. Before the hold exists (an inspection
  -- still awaiting payment) there is nothing to guard   assignment is free.
  if found and v_hold.status <> 'held' then
    raise exception 'That inspection has already been settled' using errcode = 'P0001';
  end if;

  update public.hostel_inspections
     set ambassador_id = p_agent, updated_at = now()
   where id = p_inspection;

  -- The same transaction, so the row that says who is going and the row that
  -- says who gets paid can never disagree.
  if found then
    update public.escrow_holds
       set payee_id = p_agent, updated_at = now()
     where id = v_hold.id;
  end if;

  return p_inspection;
end;
$fn$;

revoke all on function public.assign_inspection_agent(uuid, uuid) from public, anon;
grant execute on function public.assign_inspection_agent(uuid, uuid) to authenticated, service_role;

comment on function public.assign_inspection_agent is
  'Assigns, reassigns (or with a null agent, unassigns) an inspection, moving escrow_holds.payee_id in the same transaction. Staff only. Refused once the hold is settled.';

-- A hold whose inspection is assigned must never disagree with the inspection
-- row. Nothing else writes ambassador_id today, but "nothing else does" is a
-- fact about this week   the constraint is about every week after it.
comment on column public.hostel_inspections.ambassador_id is
  'The agent going. Write it through assign_inspection_agent, never directly: escrow_holds.payee_id has to move with it or the fee cannot be released.';
