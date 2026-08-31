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
 *   different word. Clicking the landlord opened a page with their hostels and
 *   no documents, no Verify, no Reject: the badge stated a decision was owed
 *   and offered no way to make it.
 *
 *   So the review moved here and both surfaces render it. The queue is still
 *   the place to work through a backlog; the landlord page is where you land
 *   when you are looking at one landlord, and now it can finish the job.
 *
 * THE TWO DECISIONS ARE NOT THE SAME DECISION
 *   Per document: Approve, or Bounce with a reason. Per business: Verify or
 *   Reject. 20260817090000 was explicit that approving the last document must
 *   NOT auto-verify — a human decides a business is real — and the database
 *   enforces the other half of it: set_verification_status refuses 'verified'
 *   when nothing has been approved.
 */
'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Clock, AlertCircle, Circle, FileText, ExternalLink } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { reviewDocument, setVendorVerification, getDocumentUrl } from '@/modules/admin/actions';

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

/**
 * The documents and the decisions for ONE business.
 *
 * `showHeader` is off when the surrounding page already names the business —
 * the landlord page has it as an <h1> — so the card does not say it twice.
 */
export function VerificationReview({
  vendor,
  showHeader = true,
}: {
  vendor: AdminVendor;
  showHeader?: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
      }
    });
  }

  async function openDoc(path: string) {
    try {
      const url = await getDocumentUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not open that document.');
    }
  }

  const approved = vendor.docs.filter((d) => d.status === 'approved').length;

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
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
            onClick={() =>
              run(() => setVendorVerification({ vendorId: vendor.id, decision: 'verified' }))
            }
          >
            Verify
          </Button>
          <Button
            variant="outline"
            className="text-coral"
            disabled={busy || vendor.verificationStatus === 'rejected'}
            onClick={() =>
              run(() => setVendorVerification({ vendorId: vendor.id, decision: 'rejected' }))
            }
          >
            Reject
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
        <div className="divide-line/5 border-line/10 divide-y rounded-lg border">
          {vendor.docs.map((d) => {
            const Icon = DOC_ICON[d.status] ?? Circle;
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Icon className="text-content-muted size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm">{d.title}</p>
                  <p className="text-content-muted text-xs">
                    {d.status.replace('_', ' ')} · uploaded{' '}
                    {new Date(d.uploadedAt).toLocaleDateString('en-NG')}
                  </p>
                  {d.actionMessage && <p className="text-coral text-xs">{d.actionMessage}</p>}
                </div>

                <Button variant="outline" className="gap-1" onClick={() => openDoc(d.storagePath)}>
                  <FileText className="size-3.5" />
                  <ExternalLink className="size-3" />
                </Button>

                <Button
                  variant="outline"
                  disabled={busy || d.status === 'approved'}
                  onClick={() =>
                    run(() => reviewDocument({ documentId: d.id, decision: 'approved' }))
                  }
                >
                  Approve
                </Button>

                {/* Bouncing requires a reason: "needs action" with no stated
                    action is how a queue stalls. */}
                <Input
                  value={messages[d.id] ?? ''}
                  onChange={(e) => setMessages((m) => ({ ...m, [d.id]: e.target.value }))}
                  placeholder="What needs fixing?"
                  className="max-w-48"
                />
                <Button
                  variant="outline"
                  className="text-coral"
                  disabled={busy || !messages[d.id]?.trim()}
                  onClick={() =>
                    run(() =>
                      reviewDocument({
                        documentId: d.id,
                        decision: 'needs_action',
                        message: messages[d.id],
                      }),
                    )
                  }
                >
                  Bounce
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
