-- ============================================================================
-- card_requirements_per_role
--
-- The public card was crediting one application with the other one's evidence.
--
-- WHAT WAS WRONG
--   `verify_card` builds its requirement list per role   a student is asked for
--   a school ID, a business for CAC   and then answers "met" with:
--
--     exists (select 1 from verification_documents
--              where owner_id = <the person> and doc_type = <the requirement>
--                and status = 'approved')
--
--   No role. So for an account that is both a student and a landlord, a
--   government ID approved by the student reviewer marks the LANDLORD's
--   government ID requirement as met on a card a stranger is scanning at a
--   gate. Nobody checked that document against that application, and the card
--   said somebody had.
--
--   This is the same defect 20260905210000 fixed in the schema and
--   20260905230000 backfilled: a document belongs to ONE application. The
--   column landed and this function never read it   which is also true of the
--   two review screens, fixed in the same change as this.
--
-- NULL STILL COUNTS FOR EVERYTHING
--   Rows written before the column existed have no role and are shown under
--   every application, because nothing recorded which one they came from. The
--   check below therefore reads `vd.role is null or vd.role = <role>`, matching
--   documentAppliesTo() in modules/verification/requirements exactly. Anything
--   stricter would un-verify accounts that a reviewer has genuinely approved.
--
-- WHICH ROLE A REQUIREMENT BELONGS TO
--   `asked` already knows: it is built by cross-joining the account's roles
--   against the requirement map, so each row carries the role that asked for
--   it. That value simply was not carried through to the check.
--
-- ROLLBACK
--   Re-run the verify_card block of 20260905090000_account_id_cards.sql.
-- ============================================================================

create or replace function public.verify_card(p_code text)
returns table (
  found          boolean,
  state          text,
  card_kind      text,
  business_name  text,
  holder_name    text,
  photo_url      text,
  category       text,
  area           text,
  verified_at    timestamptz,
  member_since   timestamptz,
  store_count    integer,
  rating_avg     numeric,
  rating_count   integer,
  requirements   jsonb,
  credentials    jsonb,
  checked_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    select p.id,
           p.full_name,
           p.role,
           coalesce(p.roles, array[]::text[]) as roles,
           p.archived_at,
           p.suspended_at,
           p.verification_status as personal_status,
           p.created_at
      from public.profiles p
     where p.id = coalesce(
             (select c.user_id from private.account_card_codes c
               where lower(c.code) = lower(trim(coalesce(p_code, '')))),
             (select v.vendor_id from private.vendor_card_codes v
               where lower(v.code) = lower(trim(coalesce(p_code, ''))))
           )
     limit 1
  ),
  biz as (
    select vp.* from public.vendor_profiles vp
     where vp.id = (select id from target)
  ),
  stu as (
    select sp.* from public.student_profiles sp
     where sp.id = (select id from target)
  ),
  rid as (
    select rp.* from public.rider_profiles rp
     where rp.id = (select id from target)
  ),
  staff as (
    select coalesce(
             (select r.name
                from public.access_members m
                join public.access_roles r on r.id = m.role_id
               where m.user_id = t.id and r.scope = 'admin'
               order by r.name
               limit 1),
             initcap(replace(t.role, '_', ' '))
           ) as name
      from target t
     where t.role in ('admin', 'super_admin')
        or exists (
             select 1 from public.access_members m
               join public.access_roles r on r.id = m.role_id
              where m.user_id = t.id and r.scope = 'admin'
           )
  ),
  -- Unchanged, except that `asked_role` is now SELECTED rather than only
  -- tested: the requirement knows which application asked for it, and the
  -- check below needs that to find the right evidence.
  asked as (
    select d.key, d.label, d.ord, ar.asked_role
      from target t
      cross join (values
        ('gov_id',        'Government ID',         1, array['vendor','landlord','rider','student','event_manager','creator']),
        ('biz_reg',       'Business registration', 2, array['vendor','landlord']),
        ('proof_address', 'Proof of address',      3, array['vendor','landlord','rider']),
        ('student_id',    'School ID',             4, array['student'])
      ) as d(key, label, ord, for_roles)
      cross join lateral unnest(d.for_roles) as ar(asked_role)
     where ar.asked_role = t.role or ar.asked_role = any (t.roles)
  ),
  checks as (
    select coalesce(
             jsonb_agg(distinct jsonb_build_object(
               'key',   a.key,
               'label', a.label,
               'met',   exists (
                 select 1 from public.verification_documents vd
                  where vd.owner_id = (select id from target)
                    and vd.doc_type = a.key
                    and vd.status = 'approved'
                    -- THE FIX. Null is "applies to any application" for rows
                    -- that predate the column; anything else has to match the
                    -- application that asked.
                    and (vd.role is null or vd.role = a.asked_role)
               )
             )),
             '[]'::jsonb
           ) as requirements
      from asked a
  ),
  creds as (
    select coalesce(jsonb_agg(c.j order by c.ord), '[]'::jsonb) as credentials
      from (
        select 1 as ord, jsonb_build_object(
                 'kind',  case when b.category = 'landlord' then 'landlord' else 'vendor' end,
                 'label', case when b.category = 'landlord' then 'Landlord' else 'Business' end,
                 'state', b.verification_status) as j
          from biz b
        union all
        select 2, jsonb_build_object('kind', 'student', 'label', 'Student',
                                     'state', s.verification_status)
          from stu s
        union all
        select 3, jsonb_build_object('kind', 'rider', 'label', 'Rider',
                                     'state', r.verification_status)
          from rid r
        union all
        select 4, jsonb_build_object('kind', 'organiser', 'label', 'Event organiser',
                                     'state', t.personal_status)
          from target t
         where t.role = 'event_manager' or 'event_manager' = any (t.roles)
        union all
        select 5, jsonb_build_object('kind', 'creator', 'label', 'Content creator',
                                     'state', t.personal_status)
          from target t
         where t.role = 'creator' or 'creator' = any (t.roles)
        union all
        select 6, jsonb_build_object('kind', 'staff',
                                     'label', coalesce('Sync staff · ' || st.name, 'Sync staff'),
                                     'state', 'verified')
          from staff st
      ) c
  )
  select
    true,
    case
      when t.archived_at is not null or t.suspended_at is not null then 'suspended'
      when exists (select 1 from staff) then 'verified'
      when coalesce(b.verification_status, '') = 'verified'
        or coalesce(s.verification_status, '') = 'verified'
        or coalesce(r.verification_status, '') = 'verified'
        or (t.personal_status = 'verified'
            and (t.role in ('event_manager', 'creator')
                 or t.roles && array['event_manager','creator'])) then 'verified'
      when coalesce(b.verification_status, '') = 'pending'
        or coalesce(s.verification_status, '') = 'pending'
        or coalesce(r.verification_status, '') = 'pending' then 'pending'
      when coalesce(b.verification_status, '') = 'rejected'
        or coalesce(s.verification_status, '') = 'rejected'
        or coalesce(r.verification_status, '') = 'rejected' then 'rejected'
      else 'unverified'
    end,
    case
      when exists (select 1 from staff) then 'staff'
      when b.id is not null then 'business'
      else 'person'
    end,
    b.business_name,
    nullif(trim(t.full_name), ''),
    b.logo_url,
    b.category,
    b.area,
    b.verified_at,
    t.created_at,
    (select count(*)::integer from public.storefronts sf
      where sf.vendor_id = t.id and sf.archived_at is null),
    b.rating_avg,
    b.rating_count,
    (select requirements from checks),
    (select credentials from creds),
    now()
  from target t
  left join biz b on true
  left join stu s on true
  left join rid r on true
  union all
  select false, 'unknown', 'person', null, null, null, null, null, null, null,
         0, null, 0, '[]'::jsonb, '[]'::jsonb, now()
  where not exists (select 1 from target);
$fn$;

revoke all on function public.verify_card(text) from public;
grant execute on function public.verify_card(text) to anon, authenticated, service_role;

comment on function public.verify_card(text) is
  'Public card lookup for ANY account. Requirements are answered per application: a document approved for one role does not mark another role''s requirement met.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'verify_card'
       and p.prosrc like '%vd.role is null or vd.role = a.asked_role%'
  ) then
    raise exception 'verify_card is still answering requirements without a role';
  end if;

  raise notice 'verify_card answers requirements per application.';
end $$;
