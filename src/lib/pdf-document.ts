/**
 * A receipt as a real PDF, with real text.
 *
 * WHY NOT canvasToPdf, WHICH ALREADY EXISTS
 *   That one wraps a single IMAGE, which is right for the ID card - a designed
 *   card with a photograph and a QR on it. A receipt is lines of text, and a
 *   receipt made of pixels cannot be searched, cannot be copied, and cannot be
 *   read by anything that processes documents. Somebody sending this to a
 *   bursary or a parent wants text.
 *
 * WHY NOT A LIBRARY
 *   Same reasoning lib/pdf.ts sets out: jsPDF is ~350KB to do one thing, and a
 *   text-only PDF needs no font embedding at all. The 14 standard fonts -
 *   Helvetica among them - are guaranteed present in every conforming reader,
 *   so this emits `/BaseFont /Helvetica` and ships no font data.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   No wrapping across pages, no images, no unicode beyond WinAnsi. This draws
 *   a one-page financial document and nothing else. The naira sign is the one
 *   character worth caring about and it is NOT in WinAnsiEncoding, so it is
 *   written as "NGN" - a currency symbol that renders as a box on somebody's
 *   bank statement is worse than three honest letters.
 */

/** PDF wants big-endian byte offsets padded to 10 digits in the xref table. */
function pad10(n: number) {
  return n.toString().padStart(10, '0');
}

/**
 * Escape a string for a PDF literal, and drop what Helvetica cannot draw.
 *
 * Backslash and both parens end a literal string early and corrupt the file.
 * Everything above U+00FF is replaced rather than emitted: WinAnsiEncoding has
 * no glyph for it, and a reader given a byte it cannot map draws a box.
 */
function esc(s: string): string {
  return s
    .replace(/₦/g, 'NGN ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '-')
    .replace(/[^\x20-\xFF]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export type PdfLine =
  | { kind: 'text'; text: string; size?: number; bold?: boolean; grey?: boolean; gap?: number }
  | { kind: 'row'; left: string; right: string; size?: number; bold?: boolean; grey?: boolean }
  | { kind: 'rule'; gap?: number }
  | { kind: 'space'; height: number };

export interface PdfDocumentInput {
  title: string;
  lines: PdfLine[];
  /** Small print at the foot of the page. */
  footer?: string[];
}

const PAGE_W = 595.28; // A4 at 72dpi
const PAGE_H = 841.89;
const MARGIN = 56;

/**
 * Build the one-page document.
 *
 * Coordinates are PDF user space: origin bottom-left, y increasing upward,
 * which is why the cursor starts near the top of the page and decreases.
 */
export function buildDocumentPdf(input: PdfDocumentInput): Blob {
  const ops: string[] = [];
  let y = PAGE_H - MARGIN;

  const write = (text: string, x: number, size: number, bold: boolean, grey: boolean) => {
    ops.push('BT');
    ops.push(`/${bold ? 'F2' : 'F1'} ${size} Tf`);
    ops.push(grey ? '0.42 0.42 0.45 rg' : '0.05 0.05 0.07 rg');
    ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
    ops.push(`(${esc(text)}) Tj`);
    ops.push('ET');
  };

  // Helvetica's average advance is close enough to 0.5em to right-align the
  // short numeric strings this draws. Proper metrics would mean shipping the
  // AFM tables for a document with no justified text in it.
  const widthOf = (text: string, size: number) => esc(text).length * size * 0.5;

  write('Sync', MARGIN, 20, true, false);
  y -= 14;
  write('KWASU - Malete, Kwara State', MARGIN, 9, false, true);
  y -= 26;
  write(input.title, MARGIN, 14, true, false);
  y -= 20;

  for (const line of input.lines) {
    // One page, deliberately. See the header.
    if (y < MARGIN + 90) break;

    switch (line.kind) {
      case 'space':
        y -= line.height;
        break;

      case 'rule':
        ops.push('0.85 0.85 0.87 RG', '0.7 w');
        ops.push(`${MARGIN} ${y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`);
        y -= line.gap ?? 14;
        break;

      case 'text': {
        const size = line.size ?? 10;
        write(line.text, MARGIN, size, !!line.bold, !!line.grey);
        y -= line.gap ?? size + 6;
        break;
      }

      case 'row': {
        const size = line.size ?? 10;
        write(line.left, MARGIN, size, !!line.bold, !!line.grey);
        // Right-aligned against the margin: an amount column that does not line
        // up reads as a typo in the amount.
        const rx = PAGE_W - MARGIN - widthOf(line.right, size);
        ops.push('BT');
        ops.push(`/${line.bold ? 'F2' : 'F1'} ${size} Tf`);
        ops.push(line.grey ? '0.42 0.42 0.45 rg' : '0.05 0.05 0.07 rg');
        ops.push(`1 0 0 1 ${rx.toFixed(2)} ${y.toFixed(2)} Tm`);
        ops.push(`(${esc(line.right)}) Tj`);
        ops.push('ET');
        y -= size + 8;
        break;
      }
    }
  }

  // Footer, pinned to the bottom rather than following the content.
  let fy = MARGIN + 24;
  for (const text of input.footer ?? []) {
    ops.push('BT', '/F1 7.5 Tf', '0.42 0.42 0.45 rg');
    ops.push(`1 0 0 1 ${MARGIN} ${fy.toFixed(2)} Tm`);
    ops.push(`(${esc(text)}) Tj`, 'ET');
    fy -= 11;
  }

  const content = ops.join('\n') + '\n';

  // ── Assemble. Objects: catalogue, pages, page, content, two fonts. ────────
  const chunks: Uint8Array[] = [];
  const enc = new TextEncoder();
  let length = 0;
  const offsets: number[] = [];
  const push = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    length += b.length;
  };
  const startObject = (n: number) => {
    offsets[n] = length;
  };

  push('%PDF-1.4\n');

  startObject(1);
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject(3);
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
  );

  startObject(4);
  // Byte length, not character length. `esc` has already removed everything
  // above U+00FF so the two agree here, but the encoder is what decides.
  const contentBytes = enc.encode(content).length;
  push(`4 0 obj\n<< /Length ${contentBytes} >>\nstream\n${content}endstream\nendobj\n`);

  // The standard 14. No font data is embedded and none is needed.
  startObject(5);
  push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
  );
  startObject(6);
  push(
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
  );

  const xrefAt = length;
  let xref = 'xref\n0 7\n0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) xref += `${pad10(offsets[i])} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  // Concatenated by hand rather than `new Blob(chunks)` so the offsets above,
  // which were counted in bytes, describe the file that actually results.
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}

/** Hand the file to the browser. */
export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in some browsers before they have read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
