-- ============================================================================
-- documents_belong_to_a_role
--
-- A document is evidence for ONE application, not for a person.
--
-- WHAT WAS WRONG
--   `verification_documents` is keyed on owner_id and doc_type and nothing
--   else. So for an account that is both a student and a landlord, the live
--   photo taken for the student application and the live photo taken for the
--   landlord application are, to the database, two rows of the same thing about
--   the same person - and the newer one reads as having REPLACED the older.
--
--   On the review screen that came out as: a landlord folder showing a live
--   photo somebody submitted as a student, marked "replaced"; counts of "3 of
--   5" and "2 of 6" that nobody could reconcile with a three-document
--   requirement list; and, worst, a reviewer approving one role's evidence
--   while looking at the other role's photograph.
--
--   Two applications from one person are two applications. Sharing an email
--   does not make them one submission, and the platform was treating them as
--   one because the column that says which was never there.
--
-- WHAT `role` MEANS HERE
--   The application this document was uploaded FOR - the same vocabulary
--   requirementsFor() uses, because that is the list the uploader worked
--   through. It is not "who the person is": one human being can hold three of
--   these and each one is asked for its own evidence.
--
-- NULL IS "BEFORE WE TRACKED THIS"
--   Every row written before today has no role and cannot be given one
--   honestly - nothing recorded which application it came from, and guessing
--   from doc_type would put every government ID under whichever role a script
--   preferred. Null therefore means "applies to any role", so existing folders
--   keep rendering exactly as they do now and no reviewer loses evidence they
--   can already see. New uploads always carry one.
--
-- ROLLBACK
--   alter table public.verification_documents drop column if exists role;
-- ============================================================================

alter table public.verification_documents
  add column if not exists role text;

alter table public.verification_documents
  drop constraint if exists verification_documents_role_check;
alter table public.verification_documents
  add constraint verification_documents_role_check
  check (role is null or role in (
    'student', 'rider', 'vendor', 'landlord', 'company', 'creator', 'event_manager'
  ));

comment on column public.verification_documents.role is
  'The application this document was uploaded for, in requirementsFor() vocabulary. NULL for rows written before 20260905210000, which are shown under every role because nothing recorded which one they belonged to.';

-- The review screen's question: this owner, this application, newest first.
create index if not exists verification_documents_owner_role_idx
  on public.verification_documents (owner_id, role, doc_type, uploaded_at desc);

-- ── The uploader stamps it, and a client cannot lie about it later ──────────
-- Same shape as the other column guards: role is set once, on insert, and an
-- UPDATE from a browser cannot move a document from one application to another.
-- Without this, somebody could re-point their landlord CAC certificate at their
-- student application and satisfy a requirement they never met.
create or replace function public.guard_verification_document_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.role := old.role;
    -- The decision columns are staff's, not the uploader's. They were already
    -- unreachable through RLS; this says so where the rule lives.
    new.status         := old.status;
    new.action_message := old.action_message;
    new.reviewed_by    := old.reviewed_by;
    new.reviewed_at    := old.reviewed_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists verification_documents_guard on public.verification_documents;
create trigger verification_documents_guard
  before update on public.verification_documents
  for each row execute function public.guard_verification_document_cols();
