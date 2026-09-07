/**
 * StudentsBrowser - the student list.
 *
 * IT RENDERS THROUGH THE SAME BROWSER AS EVERY OTHER ACCOUNT TAB
 *   Cards with the live photo, a grid/list toggle remembered per screen, status
 *   chips that count, and a click that opens the person on their own page. This
 *   file decides only what a student ROW SAYS.
 *
 *   It used to render the Users console instead - a different shape, with its
 *   own search, its own filters and four stat tiles carrying hardcoded "+12%"
 *   deltas that were computed from nothing. One tab in the strip looked and
 *   behaved unlike the six beside it, which is the thing this component exists
 *   to stop.
 *
 * A STUDENT'S ROW IS THEIR CAMPUS AND THEIR PAPERWORK
 *   There is no business name, no fleet and no property count. What a reviewer
 *   needs to tell one from another is where they study and whether anything has
 *   been uploaded - the same judgement the vendor queue makes, with the fields
 *   a student actually has.
 */
'use client';

import { GraduationCap, FileText } from 'lucide-react';
import { AccountBrowser } from '@/components/admin/account-browser';

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  campus: string | null;
  /** From student_profiles - what a reviewer checks the school ID against. */
  matricNumber: string | null;
  department: string | null;
  verificationStatus: string;
  /** Uploaded, and how many a reviewer has approved. */
  docs: number;
  approvedDocs: number;
  suspended: boolean;
  /** Signed link to their live photo, when one has been uploaded. */
  selfieUrl?: string;
}

export function StudentsBrowser({ rows }: { rows: StudentRow[] }) {
  return (
    <AccountBrowser
      storageKey="sync.admin.students.view"
      searchPlaceholder="Search students…"
      emptyLabel="No students have signed up yet."
      rows={rows.map((row) => ({
        id: row.id,
        href: `/admin/students/${row.id}`,
        name: row.name,
        verificationStatus: row.verificationStatus,
        faceUrl: row.selfieUrl,
        suspended: row.suspended,
        // The email is searched but not shown on the card: it is how staff look
        // somebody up and it is the least distinguishing thing on screen.
        searchText: `${row.name} ${row.email} ${row.campus ?? ''} ${row.matricNumber ?? ''} ${row.department ?? ''}`,
        meta: (
          <p className="text-content-muted flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <GraduationCap className="size-3" />
              {row.department ?? row.campus ?? 'No campus set'}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="size-3" />
              {/* The one number that says whether opening this is worth it. */}
              {row.docs === 0 ? 'nothing uploaded' : `${row.approvedDocs}/${row.docs} approved`}
            </span>
          </p>
        ),
      }))}
    />
  );
}
