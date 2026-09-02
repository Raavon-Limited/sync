/**
 * The verification review card   one business, its documents, and the decisions
 * staff actually make.
 *
 * WHY THIS IS A SHARED COMPONENT AND NOT PART OF THE QUEUE
 *   It used to live inside /admin/vendors' VerificationQueue, which made
 *   /admin/vendors the only place in the console where a business could be
 *   reviewed. That queue does list landlords   it filters on nothing   but the
 *   nav calls it "Vendors", and an admin looking at a landlord marked PENDING
 *   on /admin/landlord had no reason to think the review lived under a
 *   different word.
 *
 * THE SCREEN IS FOR COMPARING, SO IT SHOWS THE DOCUMENTS
 *   Every document used to be a button that opened a new browser tab. That is
 *   the wrong shape for the actual task: a reviewer is asking "is the face in
 *   the live photo the face on this NIN slip", and answering that across two
 *   tabs means answering it from memory. The live photo and the government ID
 *   are now rendered side by side at a size you can read, with the rest of the
 *   folder beneath them, and opening one puts it in a modal OVER this page
 *   rather than navigating away from it.
 *
 *   It also fixes what the tab did to the signed URL: a tab left open holds a
 *   live link to somebody's passport for as long as it stays open.
 *
 * THE TWO DECISIONS ARE NOT THE SAME DECISION
 *   Per document: Approve, or Bounce with a reason. Per business: Verify,
 *   Reject, or Reject as fraud. 20260817090000 was explicit that approving the
 *   last document must NOT auto-verify   a human decides a business is real
 *   and the database enforces the other half of it: set_verification_status
 *   refuses 'verified' when nothing has been approved.
 */
/* eslint-disable @next/next/no-img-element -- Every image on this screen is a
   SIGNED, EXPIRING url on a private bucket. next/image would route it through
   the Next image proxy and cache the result, which is precisely what must not
   happen to somebody's passport photo: the cached copy outlives the signature.
   Plain <img> is the correct element here, not a shortcut. */
'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, Circle, Clock, FileText, Loader2 } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  getDocumentUrls,
  reviewDocument,
  setCompanyVerification,
  setPersonalVerification,
  setStudentVerification,
  setRiderVerification,
  setVendorVerification,
  type VendorDecision,
} from '@/modules/admin/actions';
import { DocumentViewer, isImagePath, type ViewerDoc } from './document-viewer';
import { requestVerificationInfo } from '@/modules/admin/actions';
import { requirementsFor, type VerificationRole } from '@/modules/verification/requirements';

export interface AdminDoc {
  id: string;
  docType: string;
  title: string;
  status: string;
  storagePath: string;
  actionMessage: string | null;
  uploadedAt: string;
}

export interface AdminVendor {
  id: string;
  businessName: string;
  slug: string;
  category: string;
  area: string | null;
  verificationStatus: string;
  createdAt: string;
  /**
   * The sign-in address, when the page bothered to look it up. Optional
   * because it is not in the table this shape otherwise mirrors   it lives in
   * auth.users and costs a separate call (modules/admin/emails), which a queue
   * of forty cards should not make forty times.
   */
  email?: string | null;
  docs: AdminDoc[];
  /** Signed link to their live photo, for the queue card. Absent until uploaded. */
  selfieUrl?: string;
}

export const VENDOR_BADGE: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-600',
  pending: 'bg-amber-500/10 text-amber-600',
  rejected: 'bg-rose-500/10 text-rose-600',
  unverified: 'bg-ink/5 text-content-muted',
};

const DOC_ICON: Record<string, typeof CheckCircle2> = {
  approved: CheckCircle2,
  under_review: Clock,
  needs_action: AlertCircle,
  not_uploaded: Circle,
};

const DOC_STATUS_CLASS: Record<string, string> = {
  approved: 'text-emerald-600',
  needs_action: 'text-coral',
};

/**
 * The pair a reviewer holds against each other. Everything else in the folder
 * is read on its own terms; these two only mean anything together, so they get
 * the top of the card and equal width.
 */
const COMPARE_ORDER = ['selfie', 'gov_id'];

function Preview({
  doc,
  url,
  loading,
  onOpen,
  className,
}: {
  doc: AdminDoc;
  url?: string;
  loading: boolean;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${doc.title}`}
      className={cn(
        'border-line/15 bg-ink/30 hover:border-line/40 relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border transition-colors',
        className,
      )}
    >
      {loading ? (
        <Loader2 className="text-content-muted size-5 animate-spin" aria-hidden="true" />
      ) : url && isImagePath(doc.storagePath) ? (
        <img src={url} alt={doc.title} className="size-full object-cover" />
      ) : (
        // A PDF has no thumbnail without rendering it, so the type is stated
        // instead and opening it frames the real thing.
        <span className="text-content-muted flex flex-col items-center gap-1 p-3 text-center">
          <FileText className="size-6" aria-hidden="true" />
          <span className="text-[11px]">{url ? 'PDF   click to open' : 'Not available'}</span>
        </span>
      )}
    </button>
  );
}

/**
 * WHICH TABLE THE THREE HEADER BUTTONS WRITE.
 *
 * The document half of this card is identical for everyone   verification_documents
 * is keyed on owner_id and knows nothing about what kind of account owns it   so
 * only the per-account decision differs. That is one switch, not a second card:
 * a copy of this file for riders would be a copy of the comparison layout, the
 * signed-url handling and the modal, all of which would then drift.
 */
export type ReviewKind = 'vendor' | 'rider' | 'company' | 'student' | 'organiser';

const DECIDE: Record<
  ReviewKind,
  (id: string, decision: VendorDecision, permanent?: boolean) => Promise<unknown>
> = {
  vendor: (id, decision, permanent) =>
    setVendorVerification({ vendorId: id, decision, ...(permanent ? { permanent } : {}) }),
  rider: (id, decision, permanent) =>
    setRiderVerification({ riderId: id, decision, ...(permanent ? { permanent } : {}) }),
  company: (id, decision, permanent) =>
    setCompanyVerification({ companyId: id, decision, ...(permanent ? { permanent } : {}) }),
  // No `permanent`: a fraud block is a vendor_profiles / rider_profiles column
  // and a student has neither. Suspension is the equivalent lever and it lives
  // on the account, not on the verification.
  student: (id, decision) => setStudentVerification({ userId: id, decision }),
  // No `permanent`: a fraud block is a vendor_profiles / rider_profiles column
  // and an organiser has neither. Suspension is the equivalent lever.
  organiser: (id, decision) => setPersonalVerification({ userId: id, decision }),
};

/** What the confirm dialog and the counts call the thing being reviewed. */
const NOUN: Record<ReviewKind, string> = {
  vendor: 'business',
  rider: 'rider',
  company: 'company',
  student: 'student',
  organiser: 'organiser',
};

export function VerificationReview({
  vendor,
  showHeader = true,
  kind = 'vendor',
  blockVerify = null,
  extraMissing = [],
  notifyPath = '/user',
  mailsSent = 0,
}: {
  vendor: AdminVendor;
  showHeader?: boolean;
  /** Which account type this is. Decides which staff RPC the buttons call. */
  kind?: ReviewKind;
  /**
   * Why this account cannot be verified yet, in the words to put on the
   * button. Set when something OUTSIDE the documents is missing   a student
   * with no matric number, whose school ID has nothing to be checked against.
   *
   * The database refuses these too (20260904180000). Saying so on the button
   * is what stops a reviewer meeting the refusal as an error.
   */
  blockVerify?: string | null;
  /** Outstanding things that are not documents, for the email. */
  extraMissing?: string[];
  /** Where the email sends them to fix it. */
  notifyPath?: string;
  /**
   * How many "what is missing" emails this person has already had, from
   * email_log. Turns the button into Resend and puts a number beside it.
   */
  mailsSent?: number;
}) {
  const decide = DECIDE[kind];
  const noun = NOUN[kind];
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(vendor.docs.length > 0);
  const [viewing, setViewing] = useState<number | null>(null);
  // Everything the person still owes, in one list: requirements with nothing
  // uploaded, documents a reviewer already bounced, and whatever the page
  // passed in that is not a document at all (a student's matric number). It
  // seeds the email below   the reviewer edits it before it goes.
  const outstanding = useMemo(() => {
    const out: string[] = [...extraMissing];
    for (const req of requirementsFor(roleForReview(kind, vendor.category))) {
      const doc = vendor.docs.find((d) => d.docType === req.key);
      if (!doc) {
        out.push(`${req.label}   nothing uploaded (${req.accepts})`);
      } else if (doc.status === 'needs_action') {
        out.push(`${req.label}   ${doc.actionMessage ?? 'needs uploading again'}`);
      }
    }
    return out;
  }, [extraMissing, kind, vendor.category, vendor.docs]);

  // WHICH document is mid-decision, not merely THAT one is. `busy` is one flag
  // for the whole card, so on its own it cannot put a spinner on the button
  // that was actually clicked - every Approve on the screen would spin at once.
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);

  // The comparison pair first, then the rest   and within one doc_type, the
  // newest upload first. The modal steps through this same list, so its arrows
  // walk the folder the way the page reads it.
  const ordered = useMemo(() => {
    const rank = (d: AdminDoc) => {
      const i = COMPARE_ORDER.indexOf(d.docType);
      return i === -1 ? COMPARE_ORDER.length : i;
    };
    return [...vendor.docs].sort(
      (a, b) =>
        rank(a) - rank(b) || new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
  }, [vendor.docs]);

  /*
   * WHICH UPLOADS HAVE BEEN SUPERSEDED.
   *
   * Replacing a document does not overwrite anything: `uploadQueuedDocuments`
   * writes a fresh row against a timestamped storage path, and every row a
   * person has ever uploaded reaches this screen. That is the right thing to
   * keep   a reviewer comparing a new ID against the one bounced last week is
   * the reason the history exists   but undifferentiated it reads as one
   * folder with two of everything and no way to tell which is being judged.
   *
   * The newest of each type is the live one. Everything behind it is marked,
   * not hidden: hiding it would lose exactly the comparison it is for.
   */
  const supersededIds = useMemo(() => {
    const newest = new Map<string, string>();
    for (const d of vendor.docs) {
      const held = newest.get(d.docType);
      const heldAt = held
        ? new Date(vendor.docs.find((x) => x.id === held)!.uploadedAt).getTime()
        : -1;
      if (new Date(d.uploadedAt).getTime() > heldAt) newest.set(d.docType, d.id);
    }
    const live = new Set(newest.values());
    return new Set(vendor.docs.filter((d) => !live.has(d.id)).map((d) => d.id));
  }, [vendor.docs]);

  // Joined into a string so the effect below depends on the CONTENTS rather
  // than on a fresh array identity every render.
  const pathKey = useMemo(() => ordered.map((d) => d.storagePath).join('|'), [ordered]);

  useEffect(() => {
    const list = pathKey ? pathKey.split('|') : [];
    // No synchronous setState on this branch: `loadingUrls` was already
    // initialised to `vendor.docs.length > 0`, so an empty folder starts false
    // and setting it again here would only trigger a cascading render.
    if (list.length === 0) return;
    let live = true;
    // Re-entering the loading state when the document list CHANGES (a bounce
    // and a re-upload rewrites it) rather than on first mount, where the
    // initialiser already set it. Synchronous by necessity: the tiles must not
    // show a stale signed url for one paint while the new ones are fetched.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingUrls(true);
    getDocumentUrls(list)
      .then((map) => live && setUrls(map))
      .catch(() => {
        // Signing failing is not the reviewer's problem to debug: tiles fall
        // back to "Not available" and every decision still works.
        if (live) setUrls({});
      })
      .finally(() => {
        if (live) setLoadingUrls(false);
      });
    return () => {
      live = false;
    };
  }, [pathKey]);

  const viewerDocs: ViewerDoc[] = ordered.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    storagePath: d.storagePath,
    url: urls[d.storagePath],
  }));

  function run(fn: () => Promise<unknown>, docId?: string) {
    setError(null);
    setPendingDoc(docId ?? null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
      } finally {
        // Cleared INSIDE the transition so it commits with the revalidated
        // markup. Clearing it after would drop the spinner for the frame
        // between the action resolving and the new status arriving, and the
        // button would flicker back to "Approve" on its way to "Approved".
        setPendingDoc(null);
      }
    });
  }

  const approved = vendor.docs.filter((d) => d.status === 'approved').length;
  const comparePair = ordered.filter((d) => COMPARE_ORDER.includes(d.docType));
  const rest = ordered.filter((d) => !COMPARE_ORDER.includes(d.docType));

  function DocActions({ doc }: { doc: AdminDoc }) {
    // AN APPROVED DOCUMENT IS A FINISHED DECISION, SO IT STOPS OFFERING ONE.
    // The reason box and Bounce used to sit here greyed out afterwards, which
    // reads as "you may still do this, just not yet" - the opposite of what is
    // true. The button keeps its place in the row and states the outcome
    // instead, so the row still scans as the same row.
    if (doc.status === 'approved') {
      return (
        <Button
          variant="outline"
          disabled
          // disabled:opacity-50 from the base variant would fade this to look
          // like a control waiting to become available. It is a result.
          className="border-emerald-500/30 text-emerald-600 disabled:opacity-100"
        >
          <CheckCircle2 aria-hidden="true" />
          Approved
        </Button>
      );
    }

    const approving = busy && pendingDoc === doc.id;

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(() => reviewDocument({ documentId: doc.id, decision: 'approved' }), doc.id)
          }
        >
          {approving && <Loader2 className="animate-spin" aria-hidden="true" />}
          {approving ? 'Approving…' : 'Approve'}
        </Button>
        {/* Bouncing requires a reason: "needs action" with no stated action is
            how a queue stalls.

            Hidden the moment an approval is in flight. The outcome is already
            decided at that point, and a reason box still standing there invites
            a reviewer to type into a control that is about to disappear. */}
        {!approving && (
          <>
            <Input
              value={messages[doc.id] ?? ''}
              onChange={(e) => setMessages((m) => ({ ...m, [doc.id]: e.target.value }))}
              placeholder="What needs fixing?"
              className="min-w-0 flex-1"
            />
            <Button
              variant="outline"
              className="text-coral"
              disabled={busy || !messages[doc.id]?.trim()}
              onClick={() =>
                run(
                  () =>
                    reviewDocument({
                      documentId: doc.id,
                      decision: 'needs_action',
                      message: messages[doc.id],
                    }),
                  doc.id,
                )
              }
            >
              Bounce
            </Button>
          </>
        )}
      </div>
    );
  }

  function DocMeta({ doc }: { doc: AdminDoc }) {
    const Icon = DOC_ICON[doc.status] ?? Circle;
    const superseded = supersededIds.has(doc.id);
    return (
      <div className="min-w-0">
        <p className="text-content flex flex-wrap items-center gap-2 truncate text-sm font-medium">
          {doc.title}
          {/* A replaced copy, kept deliberately. Marked rather than removed so
              the new one can be held against it. */}
          {superseded && (
            <span className="border-line/20 text-content-muted rounded-full border px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
              replaced
            </span>
          )}
        </p>
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            DOC_STATUS_CLASS[doc.status] ?? 'text-content-muted',
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          {doc.status.replace('_', ' ')} · {new Date(doc.uploadedAt).toLocaleDateString('en-NG')}
        </p>
        {doc.actionMessage && <p className="text-coral mt-0.5 text-xs">{doc.actionMessage}</p>}
      </div>
    );
  }

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {showHeader && (
            <>
              <p className="text-content flex items-center gap-2 font-medium">
                {vendor.businessName}
                <Badge
                  className={VENDOR_BADGE[vendor.verificationStatus] ?? VENDOR_BADGE.unverified}
                >
                  {vendor.verificationStatus}
                </Badge>
              </p>
              <p className="text-content-muted text-xs">
                {vendor.category} · {vendor.area ?? 'No area'}
                {vendor.email ? ` · ${vendor.email}` : ''} · joined{' '}
                {new Date(vendor.createdAt).toLocaleDateString('en-NG', {
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </>
          )}
          <p className="text-content-muted text-xs">
            {approved} of {vendor.docs.length} document{vendor.docs.length === 1 ? '' : 's'}{' '}
            approved
            {vendor.docs.length === 0 && '   nothing uploaded yet'}
          </p>
          {/* Said on the page, not only in a tooltip on a disabled button:
              somebody has to go and ask the student for this, and a title
              attribute is invisible until you hover the thing you cannot use. */}
          {blockVerify && <p className="text-coral mt-1 text-xs">{blockVerify}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Disabled with nothing approved because the database refuses it
              anyway (set_verification_status, 20260901200000). Better to say so
              on the button than to let the click fail. */}
          <Button
            variant="outline"
            disabled={
              busy || vendor.verificationStatus === 'verified' || approved === 0 || !!blockVerify
            }
            title={
              blockVerify ?? (approved === 0 ? 'Approve at least one document first' : undefined)
            }
            onClick={() => run(() => decide(vendor.id, 'verified'))}
          >
            Verify
          </Button>

          {/* An ORDINARY rejection. The business fixes what was wrong and
              submits again   a blurry NIN photo is the common case and the cure
              is another photo, not a support ticket. */}
          <Button
            variant="outline"
            className="text-coral"
            disabled={busy || vendor.verificationStatus === 'rejected'}
            onClick={() => run(() => decide(vendor.id, 'rejected'))}
          >
            Reject
          </Button>

          {/* The third option, beside the two that decide. Not offered for a
              company: `vendor.id` is the fleet's id there, and a fleet has no
              inbox   the owner does, and this screen does not know them. */}
          {kind !== 'company' && (
            <AskForMore
              userId={vendor.id}
              subject={noun}
              path={notifyPath}
              suggested={outstanding}
              sent={mailsSent}
            />
          )}
          {/* THE PERMANENT ONE. Confirmed in the browser rather than done on a
              single click: it is the only control here that takes an option
              away from somebody, and a reviewer reaching for Reject must not
              land on it by half a centimetre. */}
          <Button
            variant="outline"
            className="text-coral border-coral/40"
            disabled={busy}
            onClick={() => {
              const ok = window.confirm(
                `Permanently block ${vendor.businessName} from verification?\n\n` +
                  'Use this only for fraud   a forged document or a stolen identity. ' +
                  `They will not be able to submit again. Deciding on this ${noun} ` +
                  'any other way afterwards lifts the block.',
              );
              if (ok) run(() => decide(vendor.id, 'rejected', true));
            }}
          >
            Reject as fraud
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {vendor.docs.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-lg border border-dashed px-3 py-4 text-sm">
          No documents uploaded. There is nothing to review until this business submits.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* THE COMPARISON. Side by side from `sm` up, because that is the
              whole question   one face against the other   and stacked below
              that, where two half-width photos would be too small to judge
              anything from. */}
          {comparePair.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {comparePair.map((doc) => (
                <div
                  key={doc.id}
                  className="border-line/10 bg-surface-deep/30 flex flex-col gap-3 rounded-xl border p-3"
                >
                  <Preview
                    doc={doc}
                    url={urls[doc.storagePath]}
                    loading={loadingUrls}
                    onOpen={() => setViewing(ordered.indexOf(doc))}
                    className="aspect-[4/3]"
                  />
                  <DocMeta doc={doc} />
                  <DocActions doc={doc} />
                </div>
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="flex flex-col gap-3">
              {rest.map((doc) => (
                <div
                  key={doc.id}
                  className="border-line/10 flex flex-wrap items-center gap-3 rounded-xl border p-3"
                >
                  <Preview
                    doc={doc}
                    url={urls[doc.storagePath]}
                    loading={loadingUrls}
                    onOpen={() => setViewing(ordered.indexOf(doc))}
                    className="size-20 shrink-0"
                  />
                  <div className="min-w-[10rem] flex-1">
                    <DocMeta doc={doc} />
                  </div>
                  <DocActions doc={doc} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <DocumentViewer
        docs={viewerDocs}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

/**
 * Which requirement list applies to the account being reviewed.
 *
 * `kind` says which RPC decides it; the ROLE says what was asked of them, and
 * the two do not line up: a landlord and a shop are both kind 'vendor' and are
 * asked for different things, and an organiser's kind is named after the queue
 * rather than after the role in requirements.ts.
 */
function roleForReview(kind: ReviewKind, category: string): VerificationRole {
  if (kind === 'student') return 'student';
  if (kind === 'rider') return 'rider';
  if (kind === 'company') return 'company';
  if (kind === 'organiser') return 'event_manager';
  return category === 'landlord' ? 'landlord' : 'vendor';
}

/**
 * "Tell them what is missing" - the third option a reviewer never had.
 *
 * BETWEEN VERIFY AND REJECT THERE IS A HOLE, and most submissions fall in it.
 * The folder is not fraudulent and it is not complete: a NIN photo with the
 * flash across the number, a student with no matric number on file, a CAC
 * certificate nobody uploaded. Verifying is wrong, rejecting is heavy-handed
 * and says nothing, and bouncing one document writes a note onto a screen the
 * person may not open for a week.
 *
 * SO IT WRITES NOTHING AND SENDS AN EMAIL. The account stays exactly where the
 * reviewer found it, because "we asked for more" is not a verification outcome.
 *
 * THE LIST IS SUGGESTED, NOT DICTATED. What the database can work out - a
 * requirement with nothing uploaded, a document already bounced - is ticked by
 * default, and the reviewer adds the half they can see and it cannot: which
 * photo is unreadable, and why.
 */
function AskForMore({
  userId,
  subject,
  path,
  suggested,
  sent,
}: {
  userId: string;
  subject: string;
  path: string;
  /** Everything outstanding, pre-computed. Ticked to start with. */
  suggested: string[];
  /** How many of these have already gone to this person. */
  sent: number;
}) {
  const [open, setOpen] = useState(false);
  // Kept in state, not read from the prop, so the button becomes "Resend" the
  // moment one is sent rather than at the next reload   which is exactly when
  // a second reviewer would otherwise send a duplicate.
  const [sentCount, setSentCount] = useState(sent);
  const [chosen, setChosen] = useState<string[]>(suggested);
  const [note, setNote] = useState('');
  const [sending, startSending] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function send() {
    setResult(null);
    startSending(async () => {
      const res = await requestVerificationInfo({
        userId,
        subject,
        missing: chosen,
        note,
        path,
      });
      if (res.ok) setSentCount(res.count);
      setResult(
        res.ok
          ? { ok: true, text: 'Sent. Their status has not changed.' }
          : { ok: false, text: res.error },
      );
      if (res.ok) setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        {/* THE WORD CHANGES WITH THE HISTORY. "Ask" and "Resend" are different
            acts, and a reviewer who cannot tell which one they are about to do
            is how somebody gets the same email from three people. */}
        <Button variant="outline" onClick={() => setOpen(true)}>
          {sentCount > 0 ? 'Resend what is missing' : 'Ask for what is missing'}
        </Button>
        {sentCount > 0 && <p className="text-content-muted text-xs">{sentCount} sent so far</p>}
        {result && (
          <p className={cn('text-xs', result.ok ? 'text-emerald-600' : 'text-coral')}>
            {result.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border-line/10 bg-surface-deep flex w-full flex-col gap-3 rounded-xl border p-3">
      <p className="text-content text-sm font-medium">
        Email them what is outstanding
        {sentCount > 0 && (
          <span className="text-content-muted font-normal">
            {'  '}
            {sentCount} already sent
          </span>
        )}
      </p>

      {suggested.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {suggested.map((item) => (
            <label key={item} className="text-content-muted flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-lime-deep mt-0.5"
                checked={chosen.includes(item)}
                onChange={(e) =>
                  setChosen((prev) =>
                    e.target.checked ? [...prev, item] : prev.filter((c) => c !== item),
                  )
                }
              />
              {item}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-content-muted text-xs">
          Nothing is outstanding on paper - everything asked for has been uploaded. Write below what
          actually needs fixing.
        </p>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="What a reviewer can see and the database cannot - which photo is unreadable, what does not match."
        className="border-line/15 bg-panel text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={sending} onClick={send}>
          {sending ? 'Sending…' : 'Send email'}
        </Button>
        <Button variant="outline" disabled={sending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {/* Said plainly, because the button sits beside Verify and Reject and
            those two DO change something. */}
        <span className="text-content-muted text-xs">Nothing is decided by this.</span>
      </div>

      {result && !result.ok && <p className="text-coral text-xs">{result.text}</p>}
    </div>
  );
}
