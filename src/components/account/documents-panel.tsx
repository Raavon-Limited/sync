/**
 * Verification documents   what the vendor has uploaded and where each stands.
 *
 * REQUIRED TYPES ARE CONFIG; UPLOADS ARE DATA
 *   `verification_documents` holds what has been uploaded. It cannot say what
 *   SHOULD be uploaded   that is a product decision, so the required set lives
 *   here as a constant and each row is matched to it by `doc_type`. A required
 *   type with no row is 'not_uploaded', which is exactly what the status enum
 *   already allows for.
 *
 * THE TIMELINE IS DERIVED, NOT SCRIPTED
 *   The mock listed events like "Bank Verification Pending   28 May 2026" that
 *   nothing produced. Real progress is just the required documents and their
 *   statuses, so the timeline is computed from them. An invented date on a
 *   verification screen is the kind of thing someone plans around.
 *
 * THIS PANEL DOES NOT UPLOAD ANYTHING. IT REPORTS.
 *   It used to offer an Upload button per requirement, and that was a dead
 *   end dressed as an action. Uploading a file here wrote a
 *   `verification_documents` row and stopped   nothing re-submitted the
 *   account for review, so the file sat in a queue entry nobody was told had
 *   changed. Worse, it was reachable while a review was already in flight,
 *   which is how a reviewer ends up looking at a folder that changed under
 *   them mid-decision.
 *
 *   Verification is now collected in one place: the wizard behind "Verify
 *   Now", which asks for the whole set and submits it as one act. This screen
 *   answers the only question it is well placed to answer   where does each
 *   document stand   and hands off to that wizard when something is
 *   outstanding.
 */
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Clock, FileText, AlertCircle } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useMyDocuments } from '@/modules/verification/hooks';
import { useSession } from '@/providers/session-provider';
import { VerifyNowSheet } from '@/components/verification/verify-now-sheet';
import type { DocStatus, DocumentItem } from '@/modules/vendor/types';
import {
  documentAppliesTo,
  requirementsFor,
  type VerificationRole,
} from '@/modules/verification/requirements';

/**
 * What Sync asks THIS kind of account for.
 *
 * PER ROLE, NOT THE WHOLE LIST. This read every requirement that exists, which
 * was harmless while every one of them applied to a business and became wrong
 * the moment one did not: adding a creator-only 'portfolio' requirement made a
 * landlord's panel say "0 of 5 approved" and hold a row open for a document
 * nobody would ever ask them for. `requirementsFor` is the only correct way to
 * read that list, and it always was.
 *
 * Product config, not database state   shared with the public card page, which
 * lists the same checks to whoever scans a vendor's ID.
 */
function requiredFor(role: VerificationRole) {
  return requirementsFor(role).map((r) => ({
    docType: r.key,
    title: r.label,
    description: r.description,
    colour: r.colour,
  }));
}

/**
 * Which role's list to use.
 *
 * A landlord is a vendor_profiles row with category 'landlord' and its own
 * requirement set, so it cannot collapse into 'vendor'. Anything this panel is
 * not built for falls back to 'vendor', which is the widest business set   too
 * many rows is a visible mistake, too few is an invisible one.
 */
function roleFor(role: string | undefined): VerificationRole {
  const known: VerificationRole[] = [
    'student',
    'rider',
    'vendor',
    'landlord',
    'creator',
    'event_manager',
  ];
  return known.includes(role as VerificationRole) ? (role as VerificationRole) : 'vendor';
}

const STATUS_META: Record<DocStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  approved: { label: 'Approved', cls: 'bg-lime/15 text-accent-fg', icon: CheckCircle2 },
  under_review: { label: 'Under review', cls: 'bg-amber-500/10 text-amber-600', icon: Clock },
  needs_action: { label: 'Needs action', cls: 'bg-rose-500/10 text-rose-600', icon: AlertCircle },
  not_uploaded: { label: 'Not uploaded', cls: 'bg-ink/5 text-content-muted', icon: Circle },
};

export function DocumentsPanel({
  /**
   * Whose requirement list to show, when the caller knows better than the
   * session does. A student is the case: their role is right in the session
   * but their STATUS is not (below), and the two are read together often
   * enough that guessing one from the other is how they drift.
   */
  role,
  /**
   * The authoritative verification status, when it does not live on `profiles`.
   *
   * profiles.verification_status is the MIRROR of vendor_profiles. For a
   * student it reports the business decision, so a student who also lets a
   * room saw their landlord verdict on this panel. student_profiles is the
   * authority for them   see 20260903180000   and only the server can read it,
   * so it is passed in rather than fetched here.
   */
  status,
  /**
   * Where an unfinished account is sent to finish. Students verify at
   * /user/verify, which asks for a matric number as well as documents; the
   * vendor wizard behind VerifyNowSheet would ask them for a trade.
   */
  continueHref,
  /**
   * Set when a reviewer rejected this business permanently for fraud. Read on
   * the server from `vendor_profiles.verification_blocked_at`, because the
   * session carries `profiles` and the block lives on the business row.
   *
   * When set there is nothing to offer: submit_verification refuses, and a
   * button that only produces a refusal is worse than no button.
   */
  blockedReason,
}: {
  role?: VerificationRole;
  status?: string;
  continueHref?: string;
  blockedReason?: string | null;
} = {}) {
  const { profile } = useSession();
  const verificationStatus = status ?? profile?.verificationStatus;
  const { data: docs = [], isLoading } = useMyDocuments();

  const shownRole = role ?? roleFor(profile?.role);
  const required = useMemo(() => requiredFor(shownRole), [shownRole]);

  const items = useMemo<DocumentItem[]>(
    () =>
      required.map((req) => {
        // fetchMyDocuments orders uploaded_at descending, so the first match
        // is the NEWEST upload of that type   which is the one that counts
        // after somebody replaces a document.
        // ROLE FIRST, THEN TYPE. Matching on type alone showed a student
        // their landlord application’s government ID as though it satisfied
        // the student one   two separate submissions, only one of them
        // judged. See documentAppliesTo.
        const found = docs.find(
          (d) => documentAppliesTo(d.role, shownRole) && d.docType === req.docType,
        );
        return {
          id: req.docType,
          title: req.title,
          description: req.description,
          status: (found?.status ?? 'not_uploaded') as DocStatus,
          uploadedAt: found?.uploadedAt
            ? new Date(found.uploadedAt).toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : undefined,
          actionMessage: found?.actionMessage ?? undefined,
        };
      }),
    [docs, required, shownRole],
  );

  const approved = items.filter((i) => i.status === 'approved').length;
  const verified = verificationStatus === 'verified';
  const awaitingReview = verificationStatus === 'pending';

  /*
   * WHAT IS ACTUALLY OUTSTANDING.
   *
   * 'not_uploaded' is a gap; 'needs_action' is a reviewer asking for a
   * different file. Both are work. 'under_review' and 'approved' are not   and
   * offering "Continue verification" against a full folder was offering to
   * redo work that is already done, which is how a reviewer ends up with a
   * second copy of everything and no idea which one to judge.
   */
  const outstanding = items.filter(
    (i) => i.status === 'not_uploaded' || i.status === 'needs_action',
  );
  const nothingStarted = items.every((i) => i.status === 'not_uploaded');

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-20 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-content-muted text-sm">
          {/* Counted against the real list, not the literal "three" this used
              to claim while rendering four rows. */}
          {approved} of {required.length} approved.
          {!verified && ` Verification completes when all ${required.length} are.`}
        </p>

        {/* The only action on this screen, and it is a handoff. Absent while a
            reviewer already has the folder   a second submission is the only
            thing it could produce   and absent when the door is closed.

            When nothing is outstanding it is still offered, but as REPLACING a
            document rather than continuing: uploading a better photo of an ID
            that is already under review is a real thing to want, and the old
            copy is kept so a reviewer sees both. It reads as the secondary
            action it is. */}
        {/* A LINK, NOT THE WIZARD, when the caller named a destination.
            /user/verify asks a student for a matric number and a school ID;
            VerifyNowSheet asks for a business name and a trade. Same button,
            same place, and pointing a student at the wrong one is how they
            abandon it. */}
        {!verified && !awaitingReview && !blockedReason && continueHref && (
          <Button
            asChild
            variant={outstanding.length > 0 ? 'outline' : 'ghost'}
            className="shrink-0"
          >
            <Link href={continueHref}>
              {nothingStarted
                ? 'Start verification'
                : outstanding.length > 0
                  ? `Continue verification (${outstanding.length} left)`
                  : 'Replace a document'}
            </Link>
          </Button>
        )}

        {!verified && !awaitingReview && !blockedReason && !continueHref && (
          <VerifyNowSheet
            initial={{
              fullName: profile?.fullName ?? '',
              phone: profile?.phone ?? '',
              // `profiles.business_name` is kept in step with the claimed name
              // by save_onboarding_business. The wizard discards a placeholder
              // on its own, so passing one through is harmless.
              businessName: profile?.businessName ?? undefined,
            }}
          >
            <Button variant={outstanding.length > 0 ? 'outline' : 'ghost'} className="shrink-0">
              {nothingStarted
                ? 'Start verification'
                : outstanding.length > 0
                  ? `Continue verification (${outstanding.length} left)`
                  : 'Replace a document'}
            </Button>
          </VerifyNowSheet>
        )}
      </div>

      {/* Everything is in and none of it is a gap. Said plainly, because the
          button above no longer implies there is work left and somebody should
          not have to infer that from a verb. */}
      {!verified && !awaitingReview && !blockedReason && outstanding.length === 0 && (
        <p className="border-line/15 bg-surface-deep text-content-muted rounded-lg border px-3 py-2 text-sm">
          Everything asked for has been uploaded. Nothing is missing you only need the button above
          if you want to replace one of them.
        </p>
      )}

      {awaitingReview && (
        <p className="border-line/15 bg-surface-deep text-content-muted rounded-lg border px-3 py-2 text-sm">
          Your documents are with a reviewer. Nothing more is needed from you.
        </p>
      )}

      {/* A permanent rejection is the one state with no way forward, so it says
          so plainly instead of leaving somebody pressing a button that refuses. */}
      {blockedReason && (
        <p className="border-coral/40 bg-coral/10 text-coral rounded-lg border px-3 py-2 text-sm">
          {blockedReason}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item, i) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          const req = required[i];
          return (
            <Card key={item.id} className="border-line/10 border">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg',
                    req.colour,
                  )}
                >
                  <FileText className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-content flex items-center gap-2 text-sm font-medium">
                    {item.title}
                    <Badge className={cn('gap-1', meta.cls)}>
                      <Icon className="size-3" />
                      {meta.label}
                    </Badge>
                  </p>
                  <p className="text-content-muted text-xs">{item.description}</p>
                  {item.uploadedAt && (
                    <p className="text-content-muted text-xs">Uploaded {item.uploadedAt}</p>
                  )}
                  {/* Only a reviewer sets this, and it is the one thing the
                      vendor must act on. */}
                  {item.actionMessage && (
                    <p className="text-coral mt-1 text-xs">{item.actionMessage}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Derived from the documents above   no scripted dates. */}
      <div className="border-line/10 flex flex-col gap-2 rounded-xl border p-4">
        <p className="text-content-muted font-mono text-xs tracking-wide">PROGRESS</p>
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            {item.status === 'approved' ? (
              <CheckCircle2 className="size-4 text-accent-fg" />
            ) : item.status === 'under_review' ? (
              <Clock className="size-4 text-amber-600" />
            ) : (
              <Circle className="text-content-muted size-4" />
            )}
            <span className={item.status === 'approved' ? 'text-content-muted' : 'text-content'}>
              {item.title} {STATUS_META[item.status].label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
