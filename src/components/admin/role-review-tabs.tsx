/**
 * One account, one tab per role, one decision each.
 *
 * THE PROBLEM THIS SOLVES
 *   `verification_documents` is keyed on the PERSON, not on the role. Somebody
 *   who is both a student and a landlord therefore has one pile of documents,
 *   and every review screen was showing all of it: a business logo beside a
 *   school ID beside a live photo, under a heading reading "3 of 7 documents
 *   approved". Seven of what? A reviewer deciding the student half was being
 *   shown four documents that have nothing to do with that decision, and the
 *   count made the folder look incomplete when the student half was finished.
 *
 * SO THE PILE IS SPLIT BY WHAT EACH ROLE WAS ASKED FOR
 *   `requirementsFor(role)` already defines that, and it is the same list the
 *   uploader and the public card read. A document only appears under a role
 *   that was asked for it.
 *
 * AND BY WHICH APPLICATION IT WAS UPLOADED FOR
 *   Two applications from one person are two applications. A live photo taken
 *   for the student application is not the landlord's, even though it is the
 *   same face   and before verification_documents carried a role, the newer of
 *   the two read as having REPLACED the older, so each folder showed the
 *   other's evidence. Sharing an email does not make two submissions one. See
 *   20260905210000; rows written before it have no role and are shown under
 *   every tab, because nothing recorded which application they came from.
 *
 * EACH TAB DECIDES ONLY ITS OWN ROLE
 *   The student tab writes student_profiles; the business tab writes
 *   vendor_profiles. That separation is the entire reason those are different
 *   columns, and putting them behind one Verify button is what this screen
 *   exists to stop.
 */
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { requirementsFor, type VerificationRole } from '@/modules/verification/requirements';
import { STATUS_BADGE } from './account-queue';
import { VerificationReview, type AdminVendor, type ReviewKind } from './verification-review';

export interface RoleReviewTab {
  /** Stable key, and the tab's identity. */
  key: string;
  /** What the tab is called   the role, in the reviewer's words. */
  label: string;
  /** Which requirement list this role was asked for. */
  role: VerificationRole;
  /** Which staff RPC the buttons call. */
  kind: ReviewKind;
  /** The subject, carrying the FULL document set   filtered here, not by the caller. */
  subject: AdminVendor;
  blockVerify?: string | null;
  extraMissing?: string[];
  notifyPath?: string;
  mailsSent?: number;
}

export function RoleReviewTabs({ tabs }: { tabs: RoleReviewTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? '');

  // One role is not a tab bar. A student who only studies gets the review
  // screen unchanged rather than a single tab pretending to be a choice.
  if (tabs.length <= 1) {
    const only = tabs[0];
    return only ? <VerificationReview {...forRole(only, true)} /> : null;
  }

  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="Roles on this account"
        className="border-line/10 no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px"
      >
        {tabs.map((t, i) => {
          // REQUIREMENTS MET, NOT ROWS APPROVED.
          //
          // Counting rows produced "3 of 5" against a three-document list,
          // because somebody who re-took a blurry photo has two rows for one
          // requirement. A reviewer reads this as "how much is left", so it
          // counts the things asked for.
          const docs = docsFor(t, i === 0);
          const asked = requirementsFor(t.role);
          const met = asked.filter((r) =>
            docs.some((d) => d.docType === r.key && d.status === 'approved'),
          ).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              aria-current={t.key === current.key ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
                t.key === current.key
                  ? 'border-lime text-content font-medium'
                  : 'text-content-muted hover:text-content border-transparent',
              )}
            >
              {t.label}
              {/* The state of THAT role, on the tab, so a reviewer can see
                  which half still needs them without opening it. */}
              <Badge
                className={STATUS_BADGE[t.subject.verificationStatus] ?? STATUS_BADGE.unverified}
              >
                {t.subject.verificationStatus}
              </Badge>
              <span className="text-content-muted text-xs">
                {met}/{asked.length}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Remounted per tab: the review panel holds per-document draft messages,
          and carrying a note typed against a school ID over to a CAC
          certificate is worse than losing it. */}
      <VerificationReview key={current.key} {...forRole(current, tabs.indexOf(current) === 0)} />
    </div>
  );
}

/**
 * The documents belonging to THIS application.
 *
 * Two filters, and both matter. The role is the real one: a live photo taken
 * for a student application is not the landlord's, even though it is the same
 * face and the same person   before the column existed the newer of the two
 * read as having REPLACED the older, and each role's folder showed the other's
 * evidence. A null role predates the column and is shown everywhere, because
 * nothing recorded which application it came from and guessing would put
 * somebody's CAC certificate in their student folder.
 *
 * The requirement filter then drops anything this role was never asked for.
 */
function docsFor(tab: RoleReviewTab, isFirst: boolean): AdminVendor['docs'] {
  const asked = new Set(requirementsFor(tab.role).map((r) => r.key));
  return tab.subject.docs.filter(
    (d) =>
      asked.has(d.docType) &&
      // Its own application, or   for anything the backfill could not
      // attribute   the FIRST tab only. Showing an unattributed row under
      // every tab is what made a landlord folder look half-approved on the
      // strength of the student's documents. One home, never several.
      (d.role === tab.role || (d.role == null && isFirst)),
  );
}

function forRole(tab: RoleReviewTab, isFirst: boolean) {
  return {
    vendor: { ...tab.subject, docs: docsFor(tab, isFirst) },
    kind: tab.kind,
    blockVerify: tab.blockVerify ?? null,
    extraMissing: tab.extraMissing ?? [],
    notifyPath: tab.notifyPath ?? '/user',
    mailsSent: tab.mailsSent ?? 0,
    showHeader: true,
  };
}
