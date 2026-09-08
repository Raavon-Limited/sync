'use client';

/**
 * One receipt or invoice, as it appears on screen and on paper.
 *
 * THE SCREEN IS THE DOCUMENT. There is no separate print template: "download"
 * here means print-to-PDF, so a second layout for the printed version would be
 * a second thing to keep correct, and the first time they drifted somebody
 * would be holding a PDF that disagrees with the page it came from. The print
 * rules in globals.css strip the shell and keep the palette; everything below
 * is what comes out.
 *
 * WHICH IS WHY IT PRINTS IN THE THEME IT WAS READ IN. A dark receipt saves as
 * a dark PDF. Browsers drop backgrounds when printing, so `print-color-adjust`
 * is doing real work - without it a dark document prints as white-on-white,
 * which is not a subtle failure.
 *
 * INFORMATIONAL LINES ARE PART OF THE ARITHMETIC EVEN THOUGH THEY DO NOT ADD.
 * Sync's commission on an `absorb` listing is not in the student's total and
 * must still be visible: leaving it off means neither side can check what Sync
 * took, and the landlord's payout appears to be missing money. It is rendered
 * greyed with no amount column position of its own so it cannot be mistaken
 * for a charge.
 */

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';
import { documentNaira, type PaymentDocument } from '@/modules/documents/types';
import { DocumentQr } from './document-qr';

const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

export function DocumentSheet({
  doc,
  actions,
}: {
  doc: PaymentDocument;
  /** Print / email controls. Marked `no-print` by the caller. */
  actions?: React.ReactNode;
}) {
  const isInvoice = doc.type === 'invoice';

  return (
    <div className="flex flex-col gap-4">
      <article className="print-sheet border-line/15 bg-panel text-content mx-auto w-full max-w-2xl rounded-2xl border p-6 sm:p-10">
        {/* Masthead */}
        <header className="border-line/15 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <p className="font-display text-lime-deep text-2xl font-bold tracking-tight">Sync</p>
            <p className="text-content-muted mt-0.5 text-xs">KWASU · Malete, Kwara State</p>
          </div>
          <div className="text-right">
            <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
              {isInvoice ? 'Invoice' : 'Receipt'}
            </p>
            <p className="text-content font-mono text-sm font-semibold">{doc.number}</p>
          </div>
        </header>

        {/* Who, what, when */}
        <section className="grid gap-4 py-6 sm:grid-cols-2">
          <Field label={isInvoice ? 'Billed to' : 'Paid by'} value={doc.fromName} />
          <Field label={isInvoice ? 'Payable to' : 'Paid to'} value={doc.toName} />
          <Field label={isInvoice ? 'Issued' : 'Date paid'} value={longDate(doc.issuedAt) ?? '—'} />
          {/* The hold deadline. Not decorative - miss it and the room is gone. */}
          {isInvoice && doc.dueAt && <Field label="Due by" value={longDate(doc.dueAt) ?? '—'} />}
          {doc.subject && <Field label="For" value={doc.subject} />}
          {doc.reference && <Field label="Reference" value={doc.reference} mono />}
        </section>

        {/* Line items */}
        <section className="border-line/15 border-t pt-4">
          <p className="text-content-muted mb-3 font-mono text-[10px] tracking-widest uppercase">
            {doc.title}
          </p>

          <dl className="flex flex-col gap-3">
            {doc.lines.map((line, i) => (
              <div key={i} className="print-keep flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <dt
                    className={
                      line.informational ? 'text-content-muted text-sm' : 'text-content text-sm'
                    }
                  >
                    {line.label}
                  </dt>
                  {line.note && (
                    <p className="text-content-muted mt-0.5 text-xs leading-relaxed">{line.note}</p>
                  )}
                </div>
                <dd
                  className={
                    line.informational
                      ? 'text-content-muted shrink-0 font-mono text-sm'
                      : 'text-content shrink-0 font-mono text-sm'
                  }
                >
                  {/* Bracketed rather than signed with a minus: on a payout
                      statement "(₦7,500)" reads as a deduction to anybody, and
                      "-₦7,500" has been read as a negative balance. */}
                  {line.amountKobo < 0
                    ? `(${documentNaira(line.amountKobo)})`
                    : documentNaira(line.amountKobo)}
                </dd>
              </div>
            ))}
          </dl>

          <div className="border-line/15 mt-4 flex items-center justify-between border-t pt-4">
            <p className="text-content font-semibold">
              {isInvoice ? 'Amount due' : doc.direction === 'in' ? 'Total received' : 'Total paid'}
            </p>
            <p className="text-content font-mono text-xl font-bold">
              {documentNaira(doc.totalKobo)}
            </p>
          </div>
        </section>

        {/* Renders nothing unless there is something a scanner can check. */}
        <DocumentQr verify={doc.verify} />

        {doc.footnote && (
          <p className="text-content-muted border-line/15 mt-6 border-t pt-4 text-xs leading-relaxed">
            {doc.footnote}
          </p>
        )}

        <footer className="text-content-muted mt-6 text-[10px] leading-relaxed">
          {/* An unpaid invoice must not be mistakable for proof of payment.
              This line is the difference between the two documents once one is
              printed and the header is out of view. */}
          {isInvoice
            ? 'This is a request for payment, not a receipt. It is not proof that anything has been paid.'
            : 'Computer generated. Valid without a signature.'}{' '}
          Questions about this document? Reply to any Sync email and quote {doc.number}.
        </footer>
      </article>

      {actions && <div className="no-print mx-auto w-full max-w-2xl">{actions}</div>}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">{label}</p>
      <p
        className={
          mono
            ? 'text-content mt-0.5 font-mono text-xs break-all'
            : 'text-content mt-0.5 text-sm break-words'
        }
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Print, which is how a document is downloaded here.
 *
 * `window.print()` and the browser's own dialog: that is where "Save as PDF"
 * lives on every desktop platform, it needs no dependency, and it produces a
 * file that matches the page exactly because it IS the page.
 *
 * THE BODY CLASS IS WHAT MAKES IT PRINT THE DOCUMENT AND NOT THE SCREEN.
 * A receipt lives in a side sheet portalled to <body>, so it sits beside the
 * page rather than inside it and there is no ancestor that means "everything
 * except this". `printing-document` flips the print stylesheet into
 * hide-everything-then-reveal-.print-sheet mode; see globals.css.
 *
 * Removed on `afterprint` rather than straight after `print()`: in some
 * browsers print() returns before the dialog closes, and stripping the class
 * early produces a blank sheet. The listener is one-shot, and there is a
 * timeout behind it because Safari has historically not fired afterprint at
 * all - a class left on the body would break every later print on the page.
 */
export function PrintButton({ label = 'Download / print' }: { label?: string }) {
  function print() {
    const body = document.body;
    body.classList.add('printing-document');

    const cleanup = () => {
      body.classList.remove('printing-document');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(cleanup, 60_000);

    window.print();
  }

  return (
    <Button variant="outline" onClick={print}>
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
