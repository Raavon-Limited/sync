-- ============================================================================
-- document_subtype
--
-- RENAMED FROM 20260901210000, which the remote already records as applied  
-- that slot was taken by signup_roles before it was renamed away. A version
-- that has been recorded anywhere is spent: `db push` reads the number, sees it
-- in schema_migrations and skips the file, reporting "up to date" while none of
-- this SQL has run. That is the same trap 20260831140000 documents, and the
-- only way out of it is a new number.
--
-- Record WHICH document satisfied a requirement, not just that one did.
--
-- WHY IT MATTERS BEYOND TIDINESS
--   `doc_type = 'gov_id'` is satisfied by a NIN slip, a passport, a driver's
--   licence or a voter's card, and the row does not say which. That has two
--   consequences we have already hit:
--
--     1. The public ID card cannot name the document. It has to say
--        "Government ID" where a tenant at a door would rather read "NIN"  
--        and writing "NIN verified" over a passport would be a false statement
--        on the one page whose entire job is being true.
--     2. A reviewer cannot check the right thing. Verifying a NIN is a
--        different act from checking a passport's expiry, and the queue gives
--        them no idea which they are looking at until they open the file.
--
--   It is also what an identity provider will need a slot for: Smile ID and
--   Dojah verify a NAMED document against a registry, so whatever we wire in
--   later has to record which one it checked.
--
-- NULLABLE, AND NOTHING BREAKS WITHOUT IT. Every existing row predates the
-- question and honestly does not know the answer   backfilling a guess would
-- put a specific claim on a card on the strength of nothing. Null renders as
-- the category, exactly as today.
--
-- NOT A CHECK CONSTRAINT. The accepted values live in
-- `modules/verification/requirements.ts` next to their labels and the roles
-- that need them. A constraint here would be a second list to keep in step,
-- and adding a document type would become a migration.
--
-- ROLLBACK
--   alter table public.verification_documents drop column if exists doc_subtype;
-- ============================================================================

alter table public.verification_documents
  add column if not exists doc_subtype text;

comment on column public.verification_documents.doc_subtype is
  'Which accepted document satisfied this requirement   nin, passport, drivers_licence, cac_certificate, nepa_bill … Values are defined in modules/verification/requirements.ts. Null means it predates the question.';

-- ── Verify ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'verification_documents'
       and column_name = 'doc_subtype'
  ) then
    raise exception 'verification_documents.doc_subtype missing';
  end if;
end $$;
