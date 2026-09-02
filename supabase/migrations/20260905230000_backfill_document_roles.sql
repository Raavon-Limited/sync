-- ============================================================================
-- backfill_document_roles
--
-- Giving the documents that predate `role` the application they belong to.
--
-- WHY A BACKFILL AT ALL
--   20260905210000 added the column and left every existing row null, which the
--   review screen read as "applies to any role" and showed under every tab.
--   That is safe   nothing was hidden   but it reproduces the exact confusion
--   the column was added to end: a landlord folder full of documents already
--   approved for the student half, so the business looks half-verified when
--   nobody has checked it.
--
-- HOW EACH ROW IS ATTRIBUTED
--   1. If exactly ONE role the owner holds asks for that doc_type, it is that
--      role's. A school ID can only be a student's; a CAC certificate can only
--      belong to the business half.
--   2. If SEVERAL of their roles ask for it   a live photo, a government ID
--      it goes to the account's primary role. Those identify the person rather
--      than the application, so any single home is a guess; putting them in one
--      folder is the guess that does not make a second application look
--      finished.
--   3. If nothing asks for it, or the owner holds no role that does, it is left
--      null and keeps showing everywhere. Better a document in the wrong folder
--      than one a reviewer cannot find.
--
-- THIS IS A GUESS AND IT IS LABELLED AS ONE
--   Nothing recorded which submission these came from. The rule above is the
--   best reading of the evidence, not a recovered fact, and it runs once. New
--   uploads carry a role from the uploader and need none of this.
--
-- ROLLBACK
--   update public.verification_documents set role = null;
--   (which returns every folder to showing everything, as before)
-- ============================================================================

-- The requirement map, in SQL, matching modules/verification/requirements.ts.
-- Spelled out rather than derived: it is the same list the uploader worked
-- through, and a backfill that invented its own would attribute documents to
-- applications nobody was asked to make.
with asked as (
  select * from (values
    ('selfie',        array['student','rider','vendor','landlord','company','creator','event_manager']),
    ('gov_id',        array['student','rider','vendor','landlord','company','creator','event_manager']),
    ('biz_reg',       array['vendor','landlord','company','event_manager']),
    ('proof_address', array['rider','vendor','landlord','company']),
    ('student_id',    array['student'])
  ) as t(doc_type, roles)
),
owner_roles as (
  -- Every role the owner actually holds, including the business one, which
  -- lives on vendor_profiles.category rather than on profiles.role.
  select p.id as owner_id,
         array_remove(
           array(
             select distinct r from unnest(
               coalesce(p.roles, array[]::text[])
               || array[p.role]
               || case when vp.id is null then array[]::text[]
                       when vp.category = 'landlord' then array['landlord']
                       else array['vendor'] end
             ) as r
           ),
           null
         ) as held,
         -- The primary role, normalised the same way.
         case
           when vp.id is not null and vp.category = 'landlord' then 'landlord'
           when vp.id is not null and p.role in ('vendor', 'landlord') then 'vendor'
           else p.role
         end as primary_role
    from public.profiles p
    left join public.vendor_profiles vp on vp.id = p.id and vp.archived_at is null
),
resolved as (
  select d.id,
         case
           -- Exactly one of their roles asks for it.
           when cardinality(array(
                  select r from unnest(o.held) r where r = any (a.roles)
                )) = 1
             then (select r from unnest(o.held) r where r = any (a.roles) limit 1)
           -- Several do   the shared identity documents.
           when cardinality(array(
                  select r from unnest(o.held) r where r = any (a.roles)
                )) > 1
             then o.primary_role
           else null
         end as role
    from public.verification_documents d
    join owner_roles o on o.owner_id = d.owner_id
    join asked a on a.doc_type = d.doc_type
   where d.role is null
)
update public.verification_documents d
   set role = r.role
  from resolved r
 where d.id = r.id
   and r.role is not null
   -- The check constraint accepts these, but say it here too: a backfill that
   -- writes a role nothing recognises is worse than one that skips the row.
   and r.role in ('student','rider','vendor','landlord','company','creator','event_manager');

do $$
declare
  v_left integer;
begin
  select count(*) into v_left from public.verification_documents where role is null;
  raise notice 'document roles backfilled; % row(s) left unattributed', v_left;
end $$;
