/**
 * Receipts and invoices, as one shape.
 *
 * AN INVOICE AND A RECEIPT ARE THE SAME DOCUMENT AT TWO MOMENTS. One says
 * "this is what you owe and why", the other says "this was paid, here is the
 * proof". They carry identical line items and differ in tense and in whether
 * there is a payment reference. Modelling them separately would have meant two
 * renderers that drift, and a rent invoice that itemises differently from the
 * rent receipt it turns into.
 *
 * NOTHING IS STORED. A document is DERIVED from the ledger and its subject at
 * the moment it is asked for. There is no `documents` table and there should
 * not be one until something needs to be true of a receipt that is not true of
 * the payment behind it - a stored copy is a second version of the truth that
 * can disagree with the money, and the money is the record.
 *
 * WHICH MEANS THE NUMBER IS DERIVED TOO. `number` is built from the payment's
 * own reference, so it is stable for the life of that payment and cannot
 * collide - rather than a counter, which needs a table and a lock and is the
 * usual reason invoice numbering goes wrong.
 */

/** What the document is for. Drives the heading and nothing else. */
export type DocumentKind =
  | 'rent'
  | 'inspection'
  | 'order'
  | 'ticket'
  | 'topup'
  | 'withdrawal'
  | 'refund'
  | 'payout'
  | 'other';

export interface DocumentLine {
  label: string;
  /** Free text under the label - "1 session", "2 × Regular". */
  note?: string | null;
  amountKobo: number;
  /**
   * A line that explains the total without adding to it: a commission the
   * landlord bears, or a fee already inside the price. Rendered greyed with no
   * arithmetic effect, because omitting it entirely leaves a student wondering
   * what Sync took and a landlord unable to check the deduction.
   */
  informational?: boolean;
}

export interface PaymentDocument {
  /** URL segment. The payment reference, or the ledger entry id. */
  id: string;
  /** Human-facing document number, derived from the payment. */
  number: string;
  /** `receipt` once money has moved; `invoice` while it is still owed. */
  type: 'receipt' | 'invoice';
  kind: DocumentKind;
  /** Heading, e.g. "Hostel rent" or "Wallet top-up". */
  title: string;
  /** What it was for, in a phrase: "Crescent villa 2 - Room 4". */
  subject: string | null;
  /** ISO. Paid at, for a receipt; issued at, for an invoice. */
  issuedAt: string;
  /** ISO. Only invoices have one. */
  dueAt?: string | null;
  lines: DocumentLine[];
  /** The sum of the non-informational lines. */
  totalKobo: number;
  /** Signed as the ledger has it: negative means it left this wallet. */
  direction: 'in' | 'out';
  /** The payment reference, when there is one. Absent on an invoice. */
  reference?: string | null;
  /** Who paid and who was paid, in words. Either can be Sync itself. */
  fromName: string;
  toName: string;
  /** A sentence under the total: escrow terms, refund window, release date. */
  footnote?: string | null;
  /** The subject's own id, for linking back into the app. */
  bookingId?: string | null;
  orderId?: string | null;
  /**
   * What a scanner can check, where anything can.
   *
   * A QR is only worth printing when something on the other end says yes or
   * no. A tenancy has /t/<code>, which re-checks live - a receipt scanned
   * after somebody moved out reads "not a current tenant". A ticket has the
   * reference the gate scans. An order has neither, so its receipt carries no
   * QR rather than one encoding a string nothing can verify.
   */
  verify?: { kind: 'tenancy'; bookingId: string } | { kind: 'ticket'; reference: string } | null;
}

/** 30000000 -> "₦300,000". Whole naira, as everywhere else in Sync. */
export function documentNaira(kobo: number): string {
  return `₦${Math.round(Math.abs(kobo) / 100).toLocaleString('en-NG')}`;
}

/**
 * A stable, readable document number from a payment reference.
 *
 * References are long and machine-shaped ("WALLET_d1da2593-...-b2cd0187").
 * The tail is the part that is actually unique, so the number is a prefix for
 * the type plus the last eight characters, upper-cased. Same input always
 * gives the same number, which is what makes a derived document citable at
 * all - a student reading one out to support must get the same string tomorrow.
 */
export function documentNumber(prefix: string, reference: string): string {
  const tail = reference
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(-8)
    .toUpperCase();
  return `${prefix}-${tail || '00000000'}`;
}
