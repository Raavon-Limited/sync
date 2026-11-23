-- ============================================================================
-- lock_client_writes   A row a client creates starts where a client may start,
--                      and a status a client changes moves the way a person may
--                      move it.
--
-- THE SYMPTOM
--   Nothing on any screen. Every one of these is one PostgREST call away:
--     POST /hostels                {"verified": true}              a "verified" listing, no visit
--     POST /vendor_profiles        {"verification_status":"verified"}
--     POST /rider_profiles         {"verification_status":"verified"}  -> claim_delivery admits them
--     POST /verification_documents {"status":"approved"}
--     POST /bank_accounts          {"is_verified": true}
--     POST /storefronts            {"verified_at": "now"}
--     POST /bookings               {"status":"confirmed"}          -> issue_tenancy_code mints a tenancy
--     POST /orders                 {"total_kobo": 100, "paid_at": "now"}
--     POST /hostel_inspections     {"fee_kobo": 100}               -> a N5,000 viewing for N1
--     PATCH /bookings              {"locked_at": "2030-01-01"}     -> the 72h ceiling, gone
--     PATCH /deliveries            {"status":"delivered"}          -> the rider certifies themself
--     PATCH /orders                {"status":"pending"}            after delivery, or 'cancelled' and still paid
--
-- THE CAUSE   ONE PATTERN, REPEATED
--   Every guard_* trigger here is BEFORE UPDATE. The owner-only policies from
--   0006 also allow INSERT, so a privileged column is frozen against an edit and
--   wide open on the row's first write. And the booking guard was a column
--   blocklist with a status allowlist that ignored where the status came FROM:
--   'cancelled' was reachable from 'confirmed', which strands paid rent because
--   refund_booking only refunds a confirmed booking.
--
-- WHAT THIS DOES
--   1. INSERT guards. Each table whose UPDATE guard froze a column now also
--      forces that column to its starting value on a client INSERT. Separate
--      BEFORE INSERT triggers where the update guard is untouched, so no
--      existing body has to be restated to learn about a null OLD.
--   2. orders / order_items: client INSERT revoked. checkout_cart is the only
--      way an order exists - it is the only path that reprices, applies promos
--      and checks the store is open. It is SECURITY DEFINER, so the revoke does
--      not touch it.
--   3. hostel_inspections: the fee is the HOSTEL's, read here, never the
--      client's. Clients can no longer update an inspection at all (no screen
--      did; every change is an RPC), and 'scheduled' now requires payment in
--      the table itself.
--   4. bookings and orders: a status moves only along a transition a person
--      may make, and a refused move RAISES instead of being silently reverted -
--      a silent revert is how a screen reports success for a change that never
--      happened. deliveries lose their direct update policy; advance_delivery
--      was already the only writer.
--
-- WHO THIS DOES NOT TOUCH
--   Every guard tests `current_user in ('authenticated','anon')`. Inside a
--   SECURITY DEFINER function current_user is the owner, and the service role is
--   service_role - so RPCs, the webhook, crons and staff tools pass straight
--   through, exactly as the existing guards already behave (see 20260910210000
--   and WORKFLOW.md §5 on current_user).
--
-- APP COMPATIBILITY, CHECKED CALL SITE BY CALL SITE
--   createBooking inserts 'requested'                       allowed
--   cancelBooking (student, from requested/interested)      allowed
--   landlord setStatus requested|interested -> awaiting_payment|cancelled  allowed
--   updateOrderStatus pending->preparing, preparing->delivered  allowed (paid only)
--   scheduleInspection sends fee_kobo                       accepted, then overwritten
--   rider onboarding upserts rider_profiles                 privileged cols reset
--   bank, document, storefront, hostel inserts              privileged cols reset
--   Nothing in src inserts orders or updates inspections or deliveries directly.
--
-- NOT DONE HERE (named so it is not assumed)
--   - Unpaid orders still create escrow holds. 20261113120000 handles that.
--   - accept_booking with a price snapshot, delivery PIN, disputes: separate work.
--   - hostels.inspection_fee_kobo is now staff-set. A per-campus fee belongs in
--     campus settings, not in a landlord's form.
--
-- ROLLBACK
--   Restore guard_booking_privileged_cols from 20260823110000,
--   guard_order_privileged_cols from 20260819160000, guard_hostel_privileged_cols
--   and guard_inspection_privileged_cols from 0006, the triggers as BEFORE
--   UPDATE, the dropped policies from 0006 / 20260817090200, `grant insert on
--   public.orders, public.order_items to authenticated`, and drop the *_guard_insert
--   triggers and functions and hostel_inspections_scheduled_is_paid.
-- ============================================================================


-- ── 1. INSERT guards for the tables whose update guard is left alone ────────

create or replace function public.guard_vendor_profile_insert()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    -- A business is verified by documents (set_verification_status), never by
    -- the row that announces it. Without this the 12 Oct hide-unverified rule
    -- was undone by anyone who simply arrived verified.
    new.verification_status         := 'unverified';
    new.verified_at                 := null;
    new.verification_blocked_at     := null;
    new.verification_blocked_reason := null;
    new.rating_avg                  := 0;
    new.rating_count                := 0;
  end if;
  return new;
end;
$fn$;

drop trigger if exists vendor_profiles_guard_insert on public.vendor_profiles;
create trigger vendor_profiles_guard_insert
  before insert on public.vendor_profiles
  for each row execute function public.guard_vendor_profile_insert();


create or replace function public.guard_rider_profile_insert()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    -- claim_delivery admits any rider whose status reads 'verified', and a
    -- claimed job shows the student's drop-off. Rider onboarding upserts this
    -- row from the browser, so the insert half of that upsert has to land here.
    new.verification_status         := 'unverified';
    new.verification_blocked_at     := null;
    new.verification_blocked_reason := null;
    new.rating_avg                  := 0;
    new.rating_count                := 0;
    new.deliveries_count            := 0;
    -- set_rider_company is the only door, for the same reason as the update guard.
    new.company_id                  := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists rider_profiles_guard_insert on public.rider_profiles;
create trigger rider_profiles_guard_insert
  before insert on public.rider_profiles
  for each row execute function public.guard_rider_profile_insert();


create or replace function public.guard_verification_document_insert()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    -- `role` stays: the uploader says which application a document belongs to,
    -- and the wizards set it on purpose (see 20260905210000). The DECISION is
    -- staff's, and a document that arrives 'approved' feeds
    -- set_verification_status as if somebody had looked at it.
    new.status         := 'under_review';
    new.action_message := null;
    new.reviewed_by    := null;
    new.reviewed_at    := null;
    new.file_purged_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists verification_documents_guard_insert on public.verification_documents;
create trigger verification_documents_guard_insert
  before insert on public.verification_documents
  for each row execute function public.guard_verification_document_insert();


create or replace function public.guard_bank_account_insert()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    -- request_withdrawal pays out only to a verified account. Verification is a
    -- server-side Paystack resolve, not a checkbox the owner ticks.
    new.is_verified    := false;
    new.recipient_code := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists bank_accounts_guard_insert on public.bank_accounts;
create trigger bank_accounts_guard_insert
  before insert on public.bank_accounts
  for each row execute function public.guard_bank_account_insert();


create or replace function public.guard_storefront_verified_insert()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    -- "A shop cannot certify that it exists" (20260912120000) held for an edit
    -- and not for the row's first write.
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists storefronts_guard_verified_insert on public.storefronts;
create trigger storefronts_guard_verified_insert
  before insert on public.storefronts
  for each row execute function public.guard_storefront_verified_insert();


-- ── 2. hostels: verified and the viewing fee are not the landlord's ─────────
-- One function for both operations, because the update guard here was four
-- lines and restating it is cheaper than a second trigger.

create or replace function public.guard_hostel_privileged_cols()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified := false;
      -- The KWASU fee and the column default. Staff set a different one with
      -- the service role. The landlord form never showed this field; it only
      -- ever sent the default back, which is why freezing it breaks nothing.
      new.inspection_fee_kobo := 500000;
    else
      new.verified            := old.verified;
      -- scheduleInspection snapshots THIS column into the student's fee. Left
      -- writable, a landlord could set N0 or N50,000 for their own viewings.
      new.inspection_fee_kobo := old.inspection_fee_kobo;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists hostels_guard_privileged on public.hostels;
create trigger hostels_guard_privileged
  before insert or update on public.hostels
  for each row execute function public.guard_hostel_privileged_cols();


-- ── 3. orders: checkout_cart is the only way in ─────────────────────────────

drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "order_items_insert" on public.order_items;
revoke insert on public.orders      from authenticated;
revoke insert on public.order_items from authenticated;

create or replace function public.guard_order_privileged_cols()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  v_ok boolean;
begin
  if current_user in ('authenticated', 'anon') then
    -- Unchanged from 20260819160000.
    new.paid_at           := old.paid_at;
    new.payment_reference := old.payment_reference;
    new.total_kobo        := old.total_kobo;
    new.subtotal_kobo     := old.subtotal_kobo;
    new.customer_name     := old.customer_name;
    new.customer_phone    := old.customer_phone;

    -- NEW: the rest of what checkout_cart decided. A vendor updating the
    -- status must not be able to re-home the order or reprice its fees.
    new.student_id         := old.student_id;
    new.vendor_id          := old.vendor_id;
    new.storefront_id      := old.storefront_id;
    new.delivery_fee_kobo  := old.delivery_fee_kobo;
    new.packaging_fee_kobo := old.packaging_fee_kobo;
    new.sync_fee_kobo      := old.sync_fee_kobo;
    new.delivery_address   := old.delivery_address;
    new.placed_at          := old.placed_at;
    new.created_at         := old.created_at;
    new.delivered_at       := old.delivered_at;

    if new.status is distinct from old.status then
      -- FORWARD ONLY, and never into 'cancelled': cancelling refunds, which is
      -- cancel_order's job in one transaction (20260829100000). 'picked_up'
      -- and 'on_the_way' are kept reachable for the vendor because a pickup
      -- order has no rider to set them.
      v_ok := case old.status
                when 'pending'    then new.status = 'preparing'
                when 'preparing'  then new.status in ('picked_up', 'on_the_way', 'delivered')
                when 'picked_up'  then new.status in ('on_the_way', 'delivered')
                when 'on_the_way' then new.status = 'delivered'
                else false
              end;
      if not coalesce(v_ok, false) then
        raise exception 'An order cannot go from % to % here.', old.status, new.status
          using errcode = '42501',
                hint    = 'Cancelling goes through the Cancel button, which also refunds the student.';
      end if;

      -- Cooking an order nobody paid for is the vendor's loss and, before
      -- 20261113120000, the platform's too.
      if old.paid_at is null then
        raise exception 'This order has not been paid for yet.'
          using errcode = 'P0001';
      end if;

      if new.status = 'delivered' then
        new.delivered_at := now();
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
-- orders_guard_privileged stays BEFORE UPDATE: there is no client insert left
-- for it to guard.


-- ── 4. hostel_inspections: the fee is read here, not sent ───────────────────

drop policy if exists "inspections_update_own" on public.hostel_inspections;

create or replace function public.guard_inspection_privileged_cols()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  v_fee bigint;
begin
  if current_user not in ('authenticated', 'anon') then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Runs as the student, so this read goes through hostels RLS: a hostel the
    -- student cannot see is one they cannot book a viewing at.
    select h.inspection_fee_kobo into v_fee
      from public.hostels h
     where h.id = new.hostel_id and h.archived_at is null;
    if not found then
      raise exception 'That hostel is not open for viewings.' using errcode = 'P0002';
    end if;

    -- The snapshot is still a snapshot - a later price change cannot reprice a
    -- booked visit - but it is OUR snapshot. confirm_inspection_payment checks
    -- the charge against this number, so a client-chosen fee was a
    -- client-chosen price.
    new.fee_kobo := v_fee;

    -- Payment is what puts a viewing on the board (WORKFLOW §2). Every one of
    -- these is written later by an RPC, and arriving with any of them set
    -- skips the step that sets it.
    new.status               := 'pending_payment';
    new.paid_at              := null;
    new.payment_reference    := null;
    new.ambassador_id        := null;
    new.outcome              := null;
    new.reschedule_count     := 0;
    new.report_filed_at      := null;
    new.report_notes         := null;
    new.disputed_at          := null;
    new.dispute_reason       := null;
    new.meeting_point        := null;
    new.proposed_for         := null;
    new.student_confirmed_at := null;

    -- inspections_sync_hold extends the hold of the linked booking, so a
    -- viewing may only name the student's own booking at the same hostel.
    if new.booking_id is not null and not exists (
      select 1 from public.bookings b
       where b.id = new.booking_id
         and b.student_id = new.student_id
         and b.hostel_id = new.hostel_id
    ) then
      new.booking_id := null;
    end if;

    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE. No client policy allows one any more; this is the second wall, and
  -- it leaves the contact details as the only thing a direct edit could touch.
  new.id                   := old.id;
  new.student_id           := old.student_id;
  new.hostel_id            := old.hostel_id;
  new.booking_id           := old.booking_id;
  new.scheduled_for        := old.scheduled_for;
  new.status               := old.status;
  new.fee_kobo             := old.fee_kobo;
  new.paid_at              := old.paid_at;
  new.payment_reference    := old.payment_reference;
  new.ambassador_id        := old.ambassador_id;
  new.outcome              := old.outcome;
  new.reschedule_count     := old.reschedule_count;
  new.report_filed_at      := old.report_filed_at;
  new.report_notes         := old.report_notes;
  new.disputed_at          := old.disputed_at;
  new.dispute_reason       := old.dispute_reason;
  new.meeting_point        := old.meeting_point;
  new.proposed_for         := old.proposed_for;
  new.student_confirmed_at := old.student_confirmed_at;
  new.created_at           := old.created_at;
  new.updated_at           := now();
  return new;
end;
$fn$;

drop trigger if exists inspections_guard_privileged on public.hostel_inspections;
create trigger inspections_guard_privileged
  before insert or update on public.hostel_inspections
  for each row execute function public.guard_inspection_privileged_cols();

-- The table itself now says it: no agent sees a viewing nobody paid for.
-- confirm_inspection_payment sets both in one statement and is the only writer
-- of 'scheduled'. NOT VALID so a forged row already in production cannot fail
-- this migration; it is counted below and validated once cleaned up.
alter table public.hostel_inspections
  drop constraint if exists hostel_inspections_scheduled_is_paid;
alter table public.hostel_inspections
  add constraint hostel_inspections_scheduled_is_paid
  check (status <> 'scheduled' or paid_at is not null) not valid;


-- ── 5. bookings: where a status may go, and from where ──────────────────────

create or replace function public.guard_booking_privileged_cols()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  v_uid      uuid := (select auth.uid());
  v_student  boolean;
  v_landlord boolean;
  v_ok       boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A booking starts as an enquiry or a request. 'confirmed' at birth fired
    -- issue_tenancy_code (AFTER INSERT) and handed out a scannable tenancy for
    -- rent nobody paid, while blocking the room for whoever really books it.
    if new.status is null or new.status not in ('interested', 'requested') then
      new.status := 'requested';
    end if;
    new.requested_at := case when new.status = 'requested' then now() end;

    -- Everything below is written by a trigger or an RPC later. Supplying any
    -- of them up front is how a hold, a payment or a consent gets skipped.
    -- soft_hold is not here: set_soft_hold computes it on insert regardless.
    new.paid_at                := null;
    new.payment_reference      := null;
    new.locked_at              := null;
    new.reserved_until         := null;
    new.last_activity_at       := null;
    new.grace_until            := null;
    new.grace_granted_at       := null;
    new.grace_granted_by       := null;
    new.move_in_confirmed_at   := null;
    new.moved_in_at            := null;
    new.agreement_accepted_at  := null;
    new.agreement_version      := null;
    new.price_per_session_kobo := null;
    new.created_at             := now();
    new.updated_at             := now();
    return new;
  end if;

  v_student  := v_uid is not null and v_uid = old.student_id;
  v_landlord := v_uid is not null and exists (
    select 1 from public.hostels h
     where h.id = old.hostel_id and h.landlord_id = v_uid
  );

  -- NEVER CLIENT-WRITTEN, by either party. The ones that bit:
  --   locked_at        sync_booking_hold keeps a non-null value, so a future one
  --                    moved the 72h ceiling (and the lapse counter) with it.
  --   grace_until      the 3-month cap PRODUCT says is "refused in Postgres".
  --   move_in_confirmed_at  closes the student's 72h refund window.
  --   agreement_accepted_at  is the STUDENT's consent; require_terms_before_confirm
  --                    trusts it, and the landlord could set it for them.
  --   price_per_session_kobo  the snapshot commission is computed from.
  new.id                     := old.id;
  new.student_id             := old.student_id;
  new.hostel_id              := old.hostel_id;
  new.created_at             := old.created_at;
  new.requested_at           := old.requested_at;
  new.paid_at                := old.paid_at;
  new.payment_reference      := old.payment_reference;
  new.locked_at              := old.locked_at;
  new.last_activity_at       := old.last_activity_at;
  new.grace_until            := old.grace_until;
  new.grace_granted_at       := old.grace_granted_at;
  new.grace_granted_by       := old.grace_granted_by;
  new.move_in_confirmed_at   := old.move_in_confirmed_at;
  new.moved_in_at            := old.moved_in_at;
  new.agreement_accepted_at  := old.agreement_accepted_at;
  new.agreement_version      := old.agreement_version;
  new.price_per_session_kobo := old.price_per_session_kobo;

  -- The student's own choices, while nothing has been agreed on them yet.
  if not (v_student and old.status in ('interested', 'requested')) then
    new.room_id  := old.room_id;
    new.move_in  := old.move_in;
    new.end_date := old.end_date;
  end if;

  if new.status is distinct from old.status then
    -- The whole client-side state machine. Everything past awaiting_payment -
    -- confirmed, expired, completed, and cancelling a PAID booking - belongs to
    -- pay_booking_from_wallet, expire_stale_holds, complete_ended_tenancies and
    -- refund_booking, which run as their owner and never reach this branch.
    v_ok := (v_student and (
               (old.status = 'interested' and new.status = 'requested')
            or (old.status in ('interested', 'requested', 'awaiting_payment')
                and new.status = 'cancelled')))
         or (v_landlord
             and old.status in ('interested', 'requested')
             and new.status in ('awaiting_payment', 'cancelled'));

    if not coalesce(v_ok, false) then
      -- Raised, not reverted. The old guard put the status back silently, so
      -- the request "succeeded" and the screen said so.
      raise exception 'A booking cannot go from % to % here.', old.status, new.status
        using errcode = '42501';
    end if;

    if new.status = 'requested' then
      new.requested_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

-- Same name, so it still fires after bookings_a_soft_hold and before
-- bookings_sync_hold / bookings_set_end_date / bookings_z_max_holds - the hold
-- has to be computed from the values this guard leaves, not the client's.
drop trigger if exists bookings_guard_privileged on public.bookings;
create trigger bookings_guard_privileged
  before insert or update on public.bookings
  for each row execute function public.guard_booking_privileged_cols();


-- ── 6. deliveries: advance_delivery is the only writer ──────────────────────
-- Its transition table (assigned -> picked_up -> delivering -> delivered) is
-- what this policy let a rider skip. Nothing in src updates deliveries.
drop policy if exists "deliveries_update_rider" on public.deliveries;


-- ── 7. Verify ───────────────────────────────────────────────────────────────
do $$
declare
  v_missing text;
  v_forged  integer;
begin
  -- Every guard that must see a client INSERT is a BEFORE trigger that does.
  -- In pg_trigger.tgtype, 2 = BEFORE and 4 = INSERT.
  select string_agg(want.tbl || '.' || want.trg, ', ') into v_missing
    from (values
      ('hostels',                'hostels_guard_privileged'),
      ('bookings',               'bookings_guard_privileged'),
      ('hostel_inspections',     'inspections_guard_privileged'),
      ('vendor_profiles',        'vendor_profiles_guard_insert'),
      ('rider_profiles',         'rider_profiles_guard_insert'),
      ('verification_documents', 'verification_documents_guard_insert'),
      ('bank_accounts',          'bank_accounts_guard_insert'),
      ('storefronts',            'storefronts_guard_verified_insert')
    ) as want(tbl, trg)
   where not exists (
     select 1 from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = want.tbl
        and t.tgname = want.trg and not t.tgisinternal
        and (t.tgtype & 2) <> 0 and (t.tgtype & 4) <> 0
   );
  if v_missing is not null then
    raise exception 'insert guard missing or not BEFORE INSERT: %', v_missing;
  end if;

  -- ANY column, not the table: a column-level grant survives a table-level
  -- revoke and would still let a row in.
  if has_any_column_privilege('authenticated', 'public.orders', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.order_items', 'INSERT') then
    raise exception 'authenticated can still insert orders directly';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and (tablename, policyname) in (
         ('orders', 'orders_insert_own'),
         ('order_items', 'order_items_insert'),
         ('hostel_inspections', 'inspections_update_own'),
         ('deliveries', 'deliveries_update_rider'))
  ) then
    raise exception 'a client write policy this migration drops is still present';
  end if;

  -- The lines most likely to be lost in a rewrite, asserted on the source the
  -- way 20260910210000 asserts on roles.
  if (select prosrc from pg_proc where oid = 'public.guard_booking_privileged_cols()'::regprocedure)
       !~ 'new\.locked_at\s+:=\s+old\.locked_at'
     or (select prosrc from pg_proc where oid = 'public.guard_booking_privileged_cols()'::regprocedure)
       !~ 'raise exception ''A booking cannot go from' then
    raise exception 'guard_booking_privileged_cols lost its lock or its transition check';
  end if;
  if (select prosrc from pg_proc where oid = 'public.guard_inspection_privileged_cols()'::regprocedure)
       not like '%new.fee_kobo := v_fee%' then
    raise exception 'guard_inspection_privileged_cols no longer sets the fee from the hostel';
  end if;
  if (select prosrc from pg_proc where oid = 'public.guard_order_privileged_cols()'::regprocedure)
       not like '%has not been paid for yet%' then
    raise exception 'guard_order_privileged_cols no longer refuses unpaid orders';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'hostel_inspections_scheduled_is_paid'
       and conrelid = 'public.hostel_inspections'::regclass
  ) then
    raise exception 'hostel_inspections_scheduled_is_paid is missing';
  end if;

  -- Reported, not fixed: rows the old holes may already have produced. The
  -- constraint above is NOT VALID until these are looked at.
  select count(*) into v_forged
    from public.hostel_inspections where status = 'scheduled' and paid_at is null;
  if v_forged > 0 then
    raise notice 'AUDIT: % scheduled inspection(s) with no payment', v_forged;
  end if;
end;
$$;
