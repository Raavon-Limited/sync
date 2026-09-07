-- ============================================================================
-- document_retention
--
-- Verification files do not live forever. The ROW does; the FILE does not.
--
-- THE DISTINCTION IS THE WHOLE DESIGN
--   `verification_documents` is the audit trail: who uploaded what, which
--   reviewer decided it, when, and what they said. That has to survive - a
--   decision nobody can account for is worse than no decision. What does not
--   have to survive is the image itself, which is the part that is a liability
--   rather than a record.
--
--   So a purge deletes the object from the `verification-docs` bucket and
--   stamps `file_purged_at` on the row. The history stays readable and the
--   government ID stops sitting on a disk forever.
--
-- TWO CLOCKS
--   3 days   everything that is transient proof: business registration, proof
--            of address, school ID, portfolio. Once a reviewer has accepted it,
--            the fact of acceptance is the record; the scan of a NEPA bill is
--            not worth keeping.
--   30 days  the live photo and the government ID. Kept longer because they
--            are the identity anchor - if a decision is challenged, or the same
--            person appears again under another account, this is the pair a
--            human would need to look at. Longer, but still not forever.
--
-- IT KEYS OFF THE DOCUMENT'S OWN DECISION, NOT THE ACCOUNT'S STATUS
--   `status = 'approved'` and `reviewed_at` are per row, which means the rule
--   needs no knowledge of which table holds that account's verification -
--   vendor_profiles, rider_profiles, student_profiles or profiles, all four of
--   which now exist. It is also the safer test: a document still under review,
--   or one that was bounced and may need comparing against a resubmission, is
--   never purged.
--
-- ROLLBACK
--   alter table public.verification_documents drop column if exists file_purged_at;
--   (files already deleted are not recoverable - that is the point of them)
-- ============================================================================

alter table public.verification_documents
  add column if not exists file_purged_at timestamptz;

comment on column public.verification_documents.file_purged_at is
  'When the underlying object was deleted from the verification-docs bucket under the retention policy. The row is the audit trail and stays; storage_path becomes historical once this is set.';

-- The sweep asks for approved documents whose file is still present. Partial,
-- because purged rows are the majority in steady state and never need visiting
-- again.
create index if not exists verification_documents_retention_idx
  on public.verification_documents (reviewed_at)
  where file_purged_at is null and status = 'approved';

-- === Reading the policy from one place ======================================
-- The day counts live here as well as in the sweep, so a query can answer
-- "what is overdue" without the app running. Changing the policy means
-- changing both - which is why the numbers are named rather than inlined.
create or replace function public.document_retention_days(p_doc_type text)
returns integer
language sql
immutable
set search_path = ''
as $fn$
  -- The identity pair is kept longer. Everything else is transient proof.
  select case when p_doc_type in ('selfie', 'gov_id') then 30 else 3 end;
$fn$;

grant execute on function public.document_retention_days(text) to authenticated, service_role;

-- === What is due ============================================================
-- Returned as rows so the sweep does not have to re-implement the rule, and so
-- somebody can eyeball the queue in the SQL editor before it runs.
create or replace function public.documents_due_for_purge()
returns table (id uuid, owner_id uuid, doc_type text, storage_path text, reviewed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select d.id, d.owner_id, d.doc_type, d.storage_path, d.reviewed_at
    from public.verification_documents d
   where d.file_purged_at is null
     and d.status = 'approved'
     and d.reviewed_at is not null
     and d.reviewed_at < now() - (public.document_retention_days(d.doc_type) || ' days')::interval
   order by d.reviewed_at;
$fn$;

revoke all on function public.documents_due_for_purge() from public, anon;
grant execute on function public.documents_due_for_purge() to service_role;

comment on function public.documents_due_for_purge is
  'Approved documents whose retention window has passed and whose file is still in the bucket. The sweep deletes the object and stamps file_purged_at.';

-- === Verify =================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'verification_documents'
       and column_name = 'file_purged_at'
  ) then
    raise exception 'file_purged_at missing';
  end if;

  if public.document_retention_days('selfie') <> 30
     or public.document_retention_days('gov_id') <> 30 then
    raise exception 'identity documents must be kept 30 days';
  end if;

  if public.document_retention_days('biz_reg') <> 3
     or public.document_retention_days('proof_address') <> 3
     or public.document_retention_days('student_id') <> 3 then
    raise exception 'transient documents must be purged after 3 days';
  end if;
end $$;
