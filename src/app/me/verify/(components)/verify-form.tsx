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
import { uploadQueuedDocuments } from '@/components/verification/upload-documents';
import { submitPersonalVerification } from '@/modules/verification/actions';
import type { VerificationRole } from '@/modules/verification/requirements';

export function VerifyForm({ role, status }: { role: VerificationRole; status: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentState>(() => emptyDocumentState(role));
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (status === 'verified') {
    return (
      <Panel
        icon={<CheckCircle2 className="text-lime-deep size-5 shrink-0" aria-hidden="true" />}
        title="You are verified"
        body="Nothing else to do. Everyone you deal with on Sync can see that a person checked your documents."
      />
    );
  }

  if (status === 'pending') {
    return (
      <Panel
        icon={<Clock className="text-content-muted size-5 shrink-0" aria-hidden="true" />}
        title="With a reviewer now"
        body="Your documents are in the queue. You will hear back here — there is nothing to resend."
      />
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
      const upload = await uploadQueuedDocuments(role, docs, (p) =>
        setProgress(p ? `Uploading ${p.label} (${p.done + 1} of ${p.total})…` : null),
      );
      setProgress(null);

      if (!upload.ok) {
        setError(upload.error);
        return;
      }

      const res = await submitPersonalVerification();
      if (!res.ok) {
        setError(res.error);
        return;
      }

      router.refresh();
    });
  }

  const queued = queueForUpload(role, docs).length;

  return (
    <div className="flex flex-col gap-5">
      <VerificationDocuments
        role={role}
        value={docs}
        onChange={setDocs}
        error={error ?? undefined}
      />

      {progress && <p className="text-content-muted text-sm">{progress}</p>}
      {error && <p className="text-coral text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={busy || queued === 0} onClick={submit}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? 'Submitting…' : 'Submit for review'}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/me">Not now</Link>
        </Button>
      </div>

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
