'use client';

/**
 * Every receipt and invoice a person can show for themselves.
 *
 * INVOICES SIT ABOVE RECEIPTS, ALWAYS. A receipt is a record and can wait; an
 * invoice is a thing that is owed, and one of them - a held room - stops being
 * payable when its 24 hours run out. Sorting the whole list by date would bury
 * the only document on the screen that has a deadline underneath a month of
 * paperwork.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Receipt } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { EmptyState } from '@/components/shared';
import { documentNaira, type PaymentDocument } from '@/modules/documents/types';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

export function DocumentsPanel({
  documents,
  isLoading,
  basePath,
  emptyHint,
}: {
  documents: PaymentDocument[];
  isLoading: boolean;
  basePath: string;
  emptyHint: string;
}) {
  const [tab, setTab] = useState<'all' | 'receipt' | 'invoice'>('all');

  const shown = useMemo(() => {
    const filtered = tab === 'all' ? documents : documents.filter((d) => d.type === tab);
    // Unpaid first, then newest. See the note above.
    return [...filtered].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'invoice' ? -1 : 1;
      return a.issuedAt < b.issuedAt ? 1 : -1;
    });
  }, [documents, tab]);

  const invoices = documents.filter((d) => d.type === 'invoice').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-line/10 flex gap-2 border-b pb-px">
        {(['all', 'invoice', 'receipt'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-body relative pb-3 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'text-content' : 'text-content-muted hover:text-content'
            }`}
          >
            {t === 'all' ? 'All' : `${t}s`}
            {/* The count rides on the tab that has something owed on it, and
                only when there is - a "0" badge is a control that draws the eye
                to say nothing. */}
            {t === 'invoice' && invoices > 0 && (
              <span className="bg-lime/15 text-lime-deep ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]">
                {invoices}
              </span>
            )}
            {tab === t && <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-20 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && shown.length === 0 && (
        <EmptyState title="Nothing here yet" description={emptyHint} />
      )}

      <div className="flex flex-col gap-3">
        {shown.map((doc) => (
          <Link key={doc.id} href={`${basePath}/${encodeURIComponent(doc.id)}`}>
            <Card className="border-line/10 hover:border-line/25 flex items-center gap-4 border p-4 transition-colors">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                  doc.type === 'invoice' ? 'bg-lime/15 text-lime-deep' : 'bg-ink/5 text-content'
                }`}
              >
                {doc.type === 'invoice' ? (
                  <FileText className="size-4" />
                ) : (
                  <Receipt className="size-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-content truncate text-sm font-medium">{doc.title}</p>
                  {doc.type === 'invoice' && <Badge variant="warning">Unpaid</Badge>}
                </div>
                <p className="text-content-muted truncate text-xs">
                  {doc.subject ? `${doc.subject} · ` : ''}
                  {day(doc.issuedAt)}
                </p>
                <p className="text-content-muted font-mono text-[10px] tracking-wide">
                  {doc.number}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-content font-mono text-sm font-semibold">
                  {documentNaira(doc.totalKobo)}
                </p>
                <p className="text-content-muted text-[10px]">
                  {doc.direction === 'in' ? 'received' : 'paid'}
                </p>
              </div>

              <ChevronRight className="text-content-muted size-4 shrink-0" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
