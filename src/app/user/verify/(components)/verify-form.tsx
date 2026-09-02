/**
 * Uploading whatever this role is asked for, and putting it in the queue.
 *
 * ROLE-DRIVEN, NOT STUDENT-SHAPED
 *   Every list on screen comes from `requirementsFor(role)` — two documents for
 *   a student, three for a creator, four for an event manager. Nothing here
 *   names a role or counts documents, so opening a new role is an entry in
 *   modules/verification/requirements and nothing else. That file already
 *   carries `creator` and `event_manager`, which cannot sign up yet.
 *
 * THE UPLOAD AND THE SUBMIT ARE SEPARATE, IN THAT ORDER
 *   Files go to storage first and `verification_documents` rows are written as
 *   they land; only then does the status move. The reverse order would put
 *   somebody in the review queue whose documents had not finished uploading,
 *   which a reviewer can only read as an empty folder to bounce.
 *
 *   It also means a failure halfway is not a loss: what uploaded stayed
 *   uploaded, and the RPC refuses an empty submission rather than pretending.
 *
 * THE STATUS DECIDES WHAT IS ON SCREEN. Somebody already waiting on a reviewer
 * is not shown an upload form — there is nothing useful for them to do with it,
 * and a second submission is how a queue gets two folders for one person.
 */
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  VerificationDocuments,
  emptyDocumentState,
  documentsProblem,
  queueForUpload,
  type DocumentState,
} from '@/components/verification/document-upload';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/forms';
import { uploadQueuedDocuments } from '@/components/verification/upload-documents';
import { recordVerificationDocuments } from '@/modules/verification/record-actions';
import { submitPersonalVerification } from '@/modules/verification/actions';
import { saveStudentIdentity, submitStudentVerification } from '@/modules/students/actions';
import type { VerificationRole } from '@/modules/verification/requirements';

export interface StudentIdentityFields {
  matricNumber: string | null;
  department: string | null;
  level: string | null;
}

export function VerifyForm({
  role,
  status,
  identity,
  inSheet = false,
}: {
  role: VerificationRole;
  status: string;
  /** Present only for a student; the fields nobody else is asked for. */
  identity?: StudentIdentityFields | null;
  /**
   * Rendered inside VerifySheet rather than on its own page.
   *
   * The only difference is the escape hatch: on the page "Not now" goes back to
   * the dashboard, and in a sheet there is already an X and an Escape key, so a
   * second way out is clutter that pushes the submit button further down a
   * panel somebody is scrolling.
   */
  inSheet?: boolean;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentState>(() => emptyDocumentState(role));
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  /*
   * A STUDENT IS NOT ONLY DOCUMENTS.
   *
   * A school ID card proves somebody holds a card. The matriculation number and
   * department are what a reviewer checks it AGAINST, and the database refuses
   * a submission without them - so they are collected here rather than left as
   * something to chase afterwards.
   */
  const isStudent = role === 'student';
  const [matricNumber, setMatric] = useState(identity?.matricNumber ?? '');
  const [department, setDepartment] = useState(identity?.department ?? '');
  const [level, setLevel] = useState(identity?.level ?? '');

  /*
   * VERIFIED AND PENDING BOTH END THE DOCUMENT FLOW, AND NEITHER ENDS THE
   * DETAILS.
   *
   * This used to be a bare panel, which left a verified student whose matric
   * number was never captured with nowhere to type it: the page said "nothing
   * else to do" while the reviewer's screen said "Not given". Saving these
   * re-submits nothing - see StudentIdentityCard.
   */
  if (status === 'verified') {
    return (
      <div className="flex flex-col gap-5">
        <Panel
          icon={<CheckCircle2 className="text-lime-deep size-5 shrink-0" aria-hidden="true" />}
          title="You are verified"
          body="Nothing else to do. Everyone you deal with on Sync can see that a person checked your documents."
        />
        {isStudent && <StudentIdentityCard initial={identity} />}
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-5">
        <Panel
          icon={<Clock className="text-content-muted size-5 shrink-0" aria-hidden="true" />}
          title="With a reviewer now"
          body="Your documents are in the queue. You will hear back here — there is nothing to resend."
        />
        {/* Still editable while it sits in the queue: a reviewer who cannot find
            a matric number is about to ask for one, and the answer arriving
            before the question is strictly better. */}
        {isStudent && <StudentIdentityCard initial={identity} />}
      </div>
    );
  }

  function submit() {
    setError(null);

    // Checked here as well as in the database. This one can name the specific
    // document that is missing; the RPC only knows that nothing arrived.
    const problem = documentsProblem(role, docs);
    if (problem) {
      setError(problem);
      return;
    }

    startTransition(async () => {
      // Identity first: it is cheap, it is what the submit checks, and saving
      // it before a long upload means a failed upload does not lose the typing.
      if (isStudent) {
        const saved = await saveStudentIdentity({ matricNumber, department, level });
        if (!saved.ok) {
          setError(saved.error);
          return;
        }
      }

      const upload = await uploadQueuedDocuments(role, docs, (p) =>
        setProgress(p ? `Uploading ${p.label} (${p.done + 1} of ${p.total})…` : null),
      );
      setProgress(null);

      if (!upload.ok) {
        setError(upload.error);
        return;
      }

      // THE STEP THAT WAS MISSING. Uploading puts files in the bucket; this
      // writes the rows the reviewer and the submit RPC both count. Without it
      // the submission was refused for having no documents by somebody who had
      // just uploaded four.
      // Stamped with the role this form is collecting for   a student's live
      // photo is not a landlord's, even when it is the same face.
      const recorded = await recordVerificationDocuments(upload.uploaded, role);
      if (!recorded.ok) {
        setError(recorded.error);
        return;
      }

      // Students write student_profiles; creators and event managers still
      // write profiles, because neither can hold a business row today. See
      // 20260903180000.
      const res = isStudent
        ? await submitStudentVerification()
        : await submitPersonalVerification();
      if (!res.ok) {
        setError(res.error);
        return;
      }

      router.refresh();
    });
  }

  const queued = queueForUpload(role, docs).length;
  const identityMissing = isStudent && (!matricNumber.trim() || !department.trim());

  return (
    <div className="flex flex-col gap-5">
      {isStudent && (
        <div className="border-line/15 bg-panel flex flex-col gap-4 rounded-xl border p-4">
          <div>
            <h3 className="text-content text-base font-semibold">Your studentship</h3>
            <p className="text-content-muted text-sm">
              What a reviewer checks your school ID against. Both are required: a card with nothing
              to check it against proves only that a card exists.
            </p>
          </div>

          <FormField label="Matriculation number" htmlFor="matric" required>
            <Input
              id="matric"
              value={matricNumber}
              onChange={(e) => setMatric(e.target.value)}
              placeholder="e.g. 19/52HA011"
            />
          </FormField>

          <FormField label="Department" htmlFor="department" required>
            <Input
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Computer Science"
            />
          </FormField>

          <FormField label="Level (optional)" htmlFor="level">
            <Input
              id="level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="e.g. 300"
            />
          </FormField>
        </div>
      )}

      <VerificationDocuments
        role={role}
        value={docs}
        onChange={setDocs}
        error={error ?? undefined}
      />

      {progress && <p className="text-content-muted text-sm">{progress}</p>}
      {error && <p className="text-coral text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={busy || queued === 0 || identityMissing} onClick={submit}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? 'Submitting…' : 'Submit for review'}
        </Button>
        {!inSheet && (
          <Button asChild variant="outline" size="lg">
            <Link href="/user">Not now</Link>
          </Button>
        )}
      </div>

      {/* WHY THE BUTTON IS DEAD, BESIDE THE BUTTON. It is disabled for two
          different reasons and used to explain only one of them   somebody who
          had typed their details but attached nothing was left looking at a
          greyed-out Submit with no text under it at all. */}
      {identityMissing ? (
        <p className="text-content-muted text-xs">
          Add your matriculation number and department to submit.
        </p>
      ) : queued === 0 ? (
        <p className="text-content-muted text-xs">Attach the documents marked * to submit.</p>
      ) : null}

      <p className="text-content-muted text-xs">
        Your documents are stored privately and are only ever opened by a reviewer. Nobody browsing
        Sync can see them.
      </p>
    </div>
  );
}

function Panel({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="border-line/15 bg-panel flex items-start gap-3 rounded-xl border p-4">
      {icon}
      <div className="min-w-0">
        <p className="text-content text-sm font-medium">{title}</p>
        <p className="text-content-muted mt-1 text-sm">{body}</p>
      </div>
    </div>
  );
}

/**
 * The student details, editable on their own.
 *
 * WHY IT EXISTS SEPARATELY FROM THE FORM ABOVE
 *   The submission flow collects these alongside the documents and sends both
 *   at once. But a verified or pending account never reaches that flow - the
 *   page answers "you are verified, nothing else to do" and stops - so a
 *   student whose matric number was never captured had no way in at all. They
 *   were verified, told there was nothing to do, and their profile still read
 *   "Not given" on the reviewer's screen.
 *
 *   These details also change on their own: level moves every session, and a
 *   department can be corrected. Neither is a re-verification, so neither
 *   belongs behind one.
 *
 * SAVING DOES NOT RE-SUBMIT ANYTHING. It writes student_profiles through
 * save_student_identity, which cannot touch verification_status - the column
 * guard in 20260903180000 is what makes offering this to a verified account
 * safe.
 */
function StudentIdentityCard({ initial }: { initial?: StudentIdentityFields | null }) {
  const router = useRouter();
  const [matricNumber, setMatric] = useState(initial?.matricNumber ?? '');
  const [department, setDepartment] = useState(initial?.department ?? '');
  const [level, setLevel] = useState(initial?.level ?? '');
  const [saving, startSaving] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const incomplete = !matricNumber.trim() || !department.trim();

  function save() {
    setNote(null);
    startSaving(async () => {
      const res = await saveStudentIdentity({ matricNumber, department, level });
      setNote(res.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="border-line/15 bg-panel flex flex-col gap-4 rounded-xl border p-4">
      <div>
        <h3 className="text-content text-base font-semibold">Your studentship</h3>
        <p className="text-content-muted text-sm">
          {incomplete
            ? 'A reviewer has nothing to check your school ID against until these are filled in.'
            : 'What a reviewer checks your school ID against. Correct them whenever they change.'}
        </p>
      </div>

      <FormField label="Matriculation number" htmlFor="matric-standalone" required>
        <Input
          id="matric-standalone"
          value={matricNumber}
          onChange={(e) => setMatric(e.target.value)}
          placeholder="e.g. 19/52HA011"
        />
      </FormField>

      <FormField label="Department" htmlFor="department-standalone" required>
        <Input
          id="department-standalone"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="e.g. Computer Science"
        />
      </FormField>

      <FormField label="Level (optional)" htmlFor="level-standalone">
        <Input
          id="level-standalone"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          placeholder="e.g. 300"
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
        {note && (
          <span className={note.ok ? 'text-sm text-emerald-600' : 'text-coral text-sm'}>
            {note.text}
          </span>
        )}
      </div>
    </div>
  );
}
