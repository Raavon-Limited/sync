/**
 * A PaymentDocument as a downloadable PDF.
 *
 * WHY THIS IS A REAL FILE AND NOT PRINT-TO-PDF
 *   Printing was the first answer and it still works - it needs no dependency
 *   and what comes out matches the screen exactly. What it cannot do is produce
 *   a file: it opens a dialog, it depends on the person choosing "Save as PDF",
 *   and on a phone it frequently cannot save at all. A receipt somebody has to
 *   negotiate with a print dialog to keep is a receipt most people will not
 *   keep.
 *
 * THE LAYOUT IS DECLARED, NOT DRAWN. `buildDocumentPdf` takes lines and rows;
 * this file decides which lines a receipt has. Keeping the two apart means an
 * invoice, a statement or a payout advice can reuse the writer without either
 * knowing about the other.
 */
'use client';

import { buildDocumentPdf, downloadPdf, type PdfLine } from '@/lib/pdf-document';
import { documentNaira, type PaymentDocument } from './types';

const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '-';

export function documentToPdf(doc: PaymentDocument): Blob {
  const isInvoice = doc.type === 'invoice';
  const lines: PdfLine[] = [];

  lines.push({
    kind: 'row',
    left: isInvoice ? 'Invoice' : 'Receipt',
    right: doc.number,
    grey: true,
    size: 9,
  });
  lines.push({ kind: 'rule', gap: 16 });

  lines.push({
    kind: 'row',
    left: isInvoice ? 'Billed to' : 'Paid by',
    right: doc.fromName,
    size: 10,
  });
  lines.push({
    kind: 'row',
    left: isInvoice ? 'Payable to' : 'Paid to',
    right: doc.toName,
    size: 10,
  });
  lines.push({
    kind: 'row',
    left: isInvoice ? 'Issued' : 'Date paid',
    right: longDate(doc.issuedAt),
    size: 10,
  });
  if (isInvoice && doc.dueAt) {
    lines.push({ kind: 'row', left: 'Due by', right: longDate(doc.dueAt), size: 10, bold: true });
  }
  if (doc.subject) {
    lines.push({ kind: 'row', left: 'For', right: doc.subject, size: 10 });
  }

  lines.push({ kind: 'space', height: 10 });
  lines.push({ kind: 'rule', gap: 16 });
  lines.push({ kind: 'text', text: doc.title.toUpperCase(), size: 8, grey: true, gap: 16 });

  for (const line of doc.lines) {
    lines.push({
      kind: 'row',
      left: line.label,
      // Bracketed rather than signed: on a payout statement "(NGN 7,500)" reads
      // as a deduction to anybody, and a leading minus has been read as a
      // negative balance.
      right:
        line.amountKobo < 0
          ? `(${documentNaira(line.amountKobo)})`
          : documentNaira(line.amountKobo),
      size: 10,
      grey: line.informational,
    });
    if (line.note) {
      lines.push({ kind: 'text', text: `   ${line.note}`, size: 8, grey: true, gap: 12 });
    }
  }

  lines.push({ kind: 'space', height: 6 });
  lines.push({ kind: 'rule', gap: 16 });
  lines.push({
    kind: 'row',
    left: isInvoice ? 'Amount due' : doc.direction === 'in' ? 'Total received' : 'Total paid',
    right: documentNaira(doc.totalKobo),
    size: 13,
    bold: true,
  });

  if (doc.reference) {
    lines.push({ kind: 'space', height: 14 });
    lines.push({ kind: 'text', text: 'PAYMENT REFERENCE', size: 8, grey: true, gap: 12 });
    lines.push({ kind: 'text', text: doc.reference, size: 9, gap: 14 });
  }

  if (doc.footnote) {
    lines.push({ kind: 'space', height: 6 });
    lines.push({ kind: 'text', text: doc.footnote, size: 8, grey: true, gap: 12 });
  }

  return buildDocumentPdf({
    title: doc.title,
    lines,
    footer: [
      isInvoice
        ? 'This is a request for payment, not a receipt. It is not proof that anything has been paid.'
        : 'Computer generated. Valid without a signature.',
      `Questions about this document? Reply to any Sync email and quote ${doc.number}.`,
    ],
  });
}

/** Build it and hand it to the browser. */
export function downloadDocumentPdf(doc: PaymentDocument) {
  downloadPdf(documentToPdf(doc), `${doc.number}.pdf`);
}
