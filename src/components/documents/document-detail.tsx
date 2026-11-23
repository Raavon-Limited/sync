'use client';

/**
 * One document, with the two things you can do to it.
 *
 * LOOKED UP CLIENT-SIDE FROM THE SAME LIST THE INDEX USES. Documents are
 * derived rather than stored, so there is no row to fetch by id - and building
 * a second server path that reconstructs a single one would be a second
 * definition of what a receipt is. React Query has usually already cached the
 * list from the page the reader arrived from, so this is normally instant.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui';
import { DocumentSheet, PrintButton } from './document-sheet';
import { emailDocument } from '@/modules/documents/actions';
import { downloadDocumentPdf } from '@/modules/documents/pdf';
import { useLandlordDocuments, useMyDocuments } from '@/modules/documents/hooks';

export function DocumentDetail({
  documentId,
  scope = 'mine',
  basePath,
}: {
  documentId: string;
  scope?: 'mine' | 'landlord';
  basePath: string;
}) {
  const mine = useMyDocuments();
  const landlord = useLandlordDocuments();
  const source = scope === 'landlord' ? landlord : mine;

  const [busy, start] = useTransition();
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doc = source.data?.find((d) => d.id === documentId);

  if (source.isLoading) {
    return <div className="bg-ink/5 mx-auto h-96 w-full max-w-2xl animate-pulse rounded-2xl" />;
  }

  if (!doc) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-content-muted text-sm">
          We could not find that document. It may belong to another account.
        </p>
        <Button asChild variant="outline">
          <Link href={basePath}>
            <ArrowLeft className="size-4" /> Back to all documents
          </Link>
        </Button>
      </div>
    );
  }

  function mail() {
    setError(null);
    setSent(null);
    start(async () => {
      const res = await emailDocument({ documentId, scope });
      if (res.ok) setSent(res.to);
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="outline" className="no-print self-start border-none">
        <Link href={basePath} className="text-content-muted">
          <ArrowLeft className="size-4" /> All documents
        </Link>
      </Button>

      <DocumentSheet
        doc={doc}
        actions={
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              {/* A real file, not a print dialog. Printing still works and is
                  offered beside it, but it cannot produce a file on its own -
                  it depends on somebody choosing "Save as PDF", and on a phone
                  it frequently cannot save at all. */}
              <Button onClick={() => downloadDocumentPdf(doc)}>
                <Download className="size-4" aria-hidden="true" />
                Download PDF
              </Button>
              <PrintButton label="Print" />
              <Button variant="outline" disabled={busy} onClick={mail}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" aria-hidden="true" />
                )}
                {busy ? 'Sending…' : 'Email it to me'}
              </Button>
            </div>

            {/* WHERE it went, not just that it went. "Sent" on its own invites
                a second press when nothing arrives at the address they assumed
                we had. */}
            {sent && <p className="text-accent-fg text-xs">Sent to {sent}.</p>}
            {error && <p className="text-coral text-xs">{error}</p>}

            <p className="text-content-muted text-[11px] leading-relaxed">
              The PDF is a real file with selectable text, generated here in your browser. Printing
              is the same document through your browser&rsquo;s dialog. The email carries it as the
              body of the message; it has no attachment, because Sync never sends one.
            </p>
          </div>
        }
      />
    </div>
  );
}
