/**
 * The verification review card — one business, its documents, and the decisions
 * staff actually make.
 *
 * WHY THIS IS A SHARED COMPONENT AND NOT PART OF THE QUEUE
 *   It used to live inside /admin/vendors' VerificationQueue, which made
 *   /admin/vendors the only place in the console where a business could be
 *   reviewed. That queue does list landlords — it filters on nothing — but the
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
 *   last document must NOT auto-verify — a human decides a business is real —
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
  setRiderVerification,
  setVendorVerification,
  type VendorDecision,
} from '@/modules/admin/actions';
import { DocumentViewer, isImagePath, type ViewerDoc } from './document-viewer';

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
          <span className="text-[11px]">{url ? 'PDF — click to open' : 'Not available'}</span>
        </span>
      )}
    </button>
  );
}

/**
 * WHICH TABLE THE THREE HEADER BUTTONS WRITE.
 *
 * The document half of this card is identical for everyone — verification_documents
 * is keyed on owner_id and knows nothing about what kind of account owns it — so
 * only the per-account decision differs. That is one switch, not a second card:
 * a copy of this file for riders would be a copy of the comparison layout, the
 * signed-url handling and the modal, all of which would then drift.
 */
export type ReviewKind = 'vendor' | 'rider' | 'company';

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
};

/** What the confirm dialog and the counts call the thing being reviewed. */
const NOUN: Record<ReviewKind, string> = {
  vendor: 'business',
  rider: 'rider',
  company: 'company',
};

export function VerificationReview({
  vendor,
  showHeader = true,
  kind = 'vendor',
}: {
  vendor: AdminVendor;
  showHeader?: boolean;
  /** Which account type this is. Decides which staff RPC the buttons call. */
  kind?: ReviewKind;
}) {
  const decide = DECIDE[kind];
  const noun = NOUN[kind];
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(vendor.docs.length > 0);
  const [viewing, setViewing] = useState<number | null>(null);
  // WHICH document is mid-decision, not merely THAT one is. `busy` is one flag
  // for the whole card, so on its own it cannot put a spinner on the button
  // that was actually clicked - every Approve on the screen would spin at once.
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);

  // The comparison pair first, then the rest in upload order. The modal steps
  // through this same list, so its arrows walk the folder the way the page
  // reads it.
  const ordered = useMemo(() => {
    const rank = (d: AdminDoc) => {
      const i = COMPARE_ORDER.indexOf(d.docType);
      return i === -1 ? COMPARE_ORDER.length : i;
    };
    return [...vendor.docs].sort((a, b) => rank(a) - rank(b));
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
    return (
      <div className="min-w-0">
        <p className="text-content truncate text-sm font-medium">{doc.title}</p>
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
                {vendor.category} · {vendor.area ?? 'No area'} · joined{' '}
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
            {vendor.docs.length === 0 && ' — nothing uploaded yet'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Disabled with nothing approved because the database refuses it
              anyway (set_verification_status, 20260901200000). Better to say so
              on the button than to let the click fail. */}
          <Button
            variant="outline"
            disabled={busy || vendor.verificationStatus === 'verified' || approved === 0}
            title={approved === 0 ? 'Approve at least one document first' : undefined}
            onClick={() => run(() => decide(vendor.id, 'verified'))}
          >
            Verify
          </Button>

          {/* An ORDINARY rejection. The business fixes what was wrong and
              submits again — a blurry NIN photo is the common case and the cure
              is another photo, not a support ticket. */}
          <Button
            variant="outline"
            className="text-coral"
            disabled={busy || vendor.verificationStatus === 'rejected'}
            onClick={() => run(() => decide(vendor.id, 'rejected'))}
          >
            Reject
          </Button>

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
                  'Use this only for fraud — a forged document or a stolen identity. ' +
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
              whole question — one face against the other — and stacked below
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
