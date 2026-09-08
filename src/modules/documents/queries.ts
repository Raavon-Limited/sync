/**
 * Receipts and invoices, built from what people BOUGHT.
 *
 * THE FIRST VERSION OF THIS READ THE LEDGER, AND THAT WAS THE WRONG SOURCE.
 *   It listed "Wallet top-up" and "Payment held in escrow" - true statements
 *   about how money moved, and not receipts. A top-up buys nothing; it is a
 *   wallet event, and the wallet page already lists it. Meanwhile the things
 *   people actually want paper for - this room, this ticket, this order - were
 *   flattened into "an amount moved on a date", losing the room, the term, the
 *   landlord and the commission along the way.
 *
 *   So the sources here are PURCHASES: a tenancy, a viewing, a ticket, an
 *   order, a service. Each one knows what it was for, which is the whole
 *   difference between a receipt and a statement line.
 *
 * WALLET MOVEMENTS ARE DELIBERATELY ABSENT. Top-ups, withdrawals, escrow
 * releases and refunds belong to /user/wallet. Putting them here again would
 * recreate the thing this file was rewritten to stop being.
 *
 * NOTHING IS STORED. A document is derived at the moment it is asked for.
 * There is no `documents` table and there should not be one until something
 * needs to be true of a receipt that is not true of the purchase behind it - a
 * stored copy is a second version of the truth that can disagree with the
 * money, and the money is the record.
 *
 * A QR ONLY WHERE IT VERIFIES SOMETHING. A tenancy has /t/<code> and a ticket
 * has the reference the gate scans. Orders and service requests have no
 * verification route yet, so their receipts carry no QR rather than one
 * encoding a string nothing can check.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { Row } from '@/lib/supabase/row';
import { unwrapList } from '@/lib/query/helpers';
import { rentQuote } from '@/modules/hostels/pricing';
import { documentNumber, type DocumentLine, type PaymentDocument } from './types';

type Client = SupabaseClient<Database>;

const dayOf = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

/** Rent, the Sync fee, and which side bears it. Shared by receipt and invoice. */
function rentLines(rentKobo: number, feeMode: 'absorb' | 'pass_on'): DocumentLine[] {
  const quote = rentQuote(rentKobo, feeMode);
  const lines: DocumentLine[] = [{ label: 'Rent', note: '1 session', amountKobo: quote.rentKobo }];
  if (feeMode === 'pass_on') {
    lines.push({ label: 'Sync service fee (2.5%)', amountKobo: quote.feeKobo });
  } else {
    // Shown but not added. Leaving it off means neither side can check what
    // Sync took; adding it would overstate what the student paid.
    lines.push({
      label: 'Sync service fee (2.5%)',
      note: 'Paid by the landlord, not added to your total',
      amountKobo: quote.feeKobo,
      informational: true,
    });
  }
  return lines;
}

const BOOKING_COLS =
  'id, status, paid_at, move_in, end_date, reserved_until, created_at, price_per_session_kobo, ' +
  'room:hostel_rooms(label, price_per_session_kobo), ' +
  'hostel:hostels(name, address, area, fee_mode, price_per_session_kobo)';

/**
 * Every receipt and invoice this person can show for themselves.
 *
 * Five reads in parallel rather than one clever join: they are five unrelated
 * tables with five different shapes, and a failure in any one of them should
 * cost that section rather than the whole page.
 */
export async function fetchMyDocuments(db: Client, me: string): Promise<PaymentDocument[]> {
  const [bookings, inspections, tickets, orders, services] = await Promise.all([
    unwrapList<Row>(
      await db
        .from('bookings')
        .select(BOOKING_COLS)
        .eq('student_id', me)
        .order('created_at', { ascending: false }),
    ),
    unwrapList<Row>(
      await db
        .from('hostel_inspections')
        .select('id, fee_kobo, paid_at, payment_reference, scheduled_for, hostel:hostels(name)')
        .not('paid_at', 'is', null)
        .order('paid_at', { ascending: false }),
    ),
    unwrapList<Row>(
      await db
        .from('tickets')
        .select(
          'id, reference, tier, price_kobo, status, created_at, event:events(name, venue, starts_at)',
        )
        .eq('owner_id', me)
        .order('created_at', { ascending: false }),
    ),
    unwrapList<Row>(
      await db
        .from('orders')
        .select(
          'id, vendor_id, status, subtotal_kobo, delivery_fee_kobo, total_kobo, paid_at, placed_at, ' +
            'order_items(name, qty, price_kobo)',
        )
        .eq('student_id', me)
        .not('paid_at', 'is', null)
        .order('placed_at', { ascending: false }),
    ),
    unwrapList<Row>(
      await db
        .from('service_requests')
        // `service_name` is not a column - the name lives on `services` and is
        // reached through the same embed the services module uses.
        .select(
          'id, code, vertical, status, agreed_kobo, quoted_kobo, created_at, scheduled_for, ' +
            'service:services(name), vendor:vendor_profiles(business_name)',
        )
        .eq('student_id', me)
        .order('created_at', { ascending: false }),
    ),
  ]);

  /*
   * VENDOR NAMES ARE A LOOKUP, NOT AN EMBED.
   *
   * `orders.vendor_id` has no embeddable relationship to a name - the first
   * attempt at `vendor:profiles!orders_vendor_id_fkey(full_name)` failed the
   * whole select with PGRST200. `vendor_profiles.id === profiles.id ===
   * orders.vendor_id` and vendor_profiles is publicly readable, so a second
   * query is both correct and cheap. modules/food/queries.ts does the same,
   * for the same reason.
   */
  const vendorIds = [...new Set(orders.map((o) => o.vendor_id as string).filter(Boolean))];
  const vendorNames = new Map<string, string>();
  if (vendorIds.length > 0) {
    const vendors = unwrapList<Row>(
      await db.from('vendor_profiles').select('id, business_name').in('id', vendorIds),
    );
    for (const v of vendors) vendorNames.set(v.id as string, v.business_name as string);
  }

  const docs: PaymentDocument[] = [];

  // ── 1. Hostel tenancies: receipts when paid, invoices while owed ──────────
  for (const b of bookings) {
    const feeMode = b.hostel?.fee_mode === 'pass_on' ? 'pass_on' : 'absorb';
    // Nothing snapshots a price onto a booking, so the column alone prints ₦0.
    const rent = Number(
      b.price_per_session_kobo ??
        b.room?.price_per_session_kobo ??
        b.hostel?.price_per_session_kobo ??
        0,
    );
    const subject =
      [b.hostel?.name as string, b.room?.label as string].filter(Boolean).join(' · ') || null;
    const lines = rentLines(rent, feeMode);
    const total = lines.filter((l) => !l.informational).reduce((s, l) => s + l.amountKobo, 0);

    if (b.paid_at) {
      docs.push({
        id: `booking-${b.id}`,
        number: documentNumber('RENT', b.id as string),
        type: 'receipt',
        kind: 'rent',
        title: 'Hostel rent',
        subject,
        issuedAt: b.paid_at as string,
        lines,
        totalKobo: total,
        direction: 'out',
        reference: null,
        fromName: 'You',
        toName: (b.hostel?.name as string) ?? 'Your landlord',
        footnote: `Your stay runs ${dayOf(b.move_in) ?? 'from move-in'} to ${
          dayOf(b.end_date) ?? 'the end of the term'
        }. Rent is held in escrow and released to the landlord a week after move-in.`,
        bookingId: b.id as string,
        // The tenancy proof re-checks live when scanned; see /t/[code].
        verify: { kind: 'tenancy', bookingId: b.id as string },
      });
    } else if (b.status === 'awaiting_payment') {
      docs.push({
        id: `booking-${b.id}`,
        number: documentNumber('INV', b.id as string),
        type: 'invoice',
        kind: 'rent',
        title: 'Hostel rent',
        subject,
        issuedAt: b.created_at as string,
        // The hold IS the due date - miss it and the room goes back on the
        // market. It is the only thing on this document with a consequence.
        dueAt: (b.reserved_until as string) ?? null,
        lines,
        totalKobo: total,
        direction: 'out',
        fromName: 'You',
        toName: (b.hostel?.name as string) ?? 'Your landlord',
        footnote: b.reserved_until
          ? `Pay by ${dayOf(b.reserved_until)} or the room goes back on the market.`
          : 'Pay to confirm this room.',
        bookingId: b.id as string,
      });
    }
  }

  // ── 2. Viewings. Paid by card, so they never touch the wallet ─────────────
  for (const r of inspections) {
    const fee = Number(r.fee_kobo ?? 0);
    const reference = (r.payment_reference as string) ?? `INSPECT-${r.id}`;
    docs.push({
      id: `inspection-${r.id}`,
      number: documentNumber('VIS', reference),
      type: 'receipt',
      kind: 'inspection',
      title: 'Property viewing',
      subject: (r.hostel?.name as string) ?? null,
      issuedAt: (r.paid_at as string) ?? (r.scheduled_for as string),
      lines: [
        { label: 'Viewing fee', note: 'Paid to the agent who shows you round', amountKobo: fee },
        {
          label: 'Sync commission',
          note: 'Sync takes nothing on a viewing',
          amountKobo: 0,
          informational: true,
        },
      ],
      totalKobo: fee,
      direction: 'out',
      reference: (r.payment_reference as string) ?? null,
      fromName: 'You',
      toName: 'Your Sync agent',
      footnote:
        'Paid by card, not from your wallet. One reschedule is free; after that a cancellation forfeits the fee.',
    });
  }

  // ── 3. Event tickets ──────────────────────────────────────────────────────
  for (const t of tickets) {
    const price = Number(t.price_kobo ?? 0);
    docs.push({
      id: `ticket-${t.id}`,
      number: documentNumber('TKT', (t.reference as string) ?? (t.id as string)),
      type: 'receipt',
      kind: 'ticket',
      title: 'Event ticket',
      subject: (t.event?.name as string) ?? 'Event',
      issuedAt: t.created_at as string,
      lines: [
        {
          label: (t.tier as string) ?? 'General admission',
          note: [t.event?.venue as string, dayOf(t.event?.starts_at as string)]
            .filter(Boolean)
            .join(' · '),
          amountKobo: price,
        },
      ],
      totalKobo: price,
      direction: 'out',
      reference: (t.reference as string) ?? null,
      fromName: 'You',
      toName: (t.event?.name as string) ?? 'The organiser',
      footnote:
        t.status === 'used'
          ? 'This ticket has been used.'
          : t.status === 'refunded'
            ? 'This ticket was refunded.'
            : 'Show the code at the gate.',
      // The reference IS what the gate scans - see modules/events/queries.
      verify:
        t.status === 'valid' && t.reference
          ? { kind: 'ticket', reference: t.reference as string }
          : null,
    });
  }

  // ── 4. Food and shop orders ───────────────────────────────────────────────
  for (const o of orders) {
    const lines: DocumentLine[] = ((o.order_items as Row[]) ?? []).map((l) => ({
      label: l.name as string,
      note:
        Number(l.qty) > 1 ? `${l.qty} × ${(Number(l.price_kobo) / 100).toLocaleString()}` : null,
      amountKobo: Number(l.price_kobo ?? 0) * Number(l.qty ?? 1),
    }));
    const delivery = Number(o.delivery_fee_kobo ?? 0);
    if (delivery > 0) lines.push({ label: 'Delivery', amountKobo: delivery });

    docs.push({
      id: `order-${o.id}`,
      number: documentNumber('ORD', o.id as string),
      type: 'receipt',
      kind: 'order',
      title: 'Order',
      subject: vendorNames.get(o.vendor_id as string) ?? null,
      issuedAt: (o.paid_at as string) ?? (o.placed_at as string),
      lines,
      // The order's own total, not the sum of the lines: it is what was
      // charged, and any discount lives in the difference.
      totalKobo: Number(o.total_kobo ?? 0),
      direction: 'out',
      reference: null,
      fromName: 'You',
      toName: vendorNames.get(o.vendor_id as string) ?? 'The vendor',
      footnote: o.status === 'cancelled' ? 'This order was cancelled.' : null,
      orderId: o.id as string,
    });
  }

  // ── 5. Laundry, beauty, workmanship ───────────────────────────────────────
  for (const s of services) {
    const agreed = Number(s.agreed_kobo ?? s.quoted_kobo ?? 0);
    // A request nobody has priced yet is not a receipt for anything.
    if (agreed <= 0) continue;

    docs.push({
      id: `service-${s.id}`,
      number: documentNumber('SRV', (s.code as string) ?? (s.id as string)),
      type: 'receipt',
      kind: 'other',
      title: (s.service?.name as string) ?? `${s.vertical} service`,
      subject: (s.vertical as string) ?? null,
      issuedAt: (s.scheduled_for as string) ?? (s.created_at as string),
      lines: [{ label: (s.service?.name as string) ?? 'Service', amountKobo: agreed }],
      totalKobo: agreed,
      direction: 'out',
      reference: (s.code as string) ?? null,
      fromName: 'You',
      toName: (s.vendor?.business_name as string) ?? 'Your vendor',
      footnote: s.agreed_kobo ? null : 'This is the quoted price; it was not final when issued.',
    });
  }

  // Invoices first - they are the only ones with a deadline - then newest.
  return docs.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'invoice' ? -1 : 1;
    return a.issuedAt < b.issuedAt ? 1 : -1;
  });
}

/**
 * The landlord's side: what each tenancy earned them.
 *
 * READ FROM `escrow_holds`, NOT FROM THEIR WALLET. A landlord wants the paper
 * for a tenancy the moment the student pays, and their wallet sees nothing
 * until the hold matures a week after move-in. Reading the ledger would leave a
 * landlord with a confirmed, paid tenant and no receipt for another fortnight.
 * `escrow_holds_party` already scopes this to the payee.
 */
export async function fetchLandlordDocuments(db: Client, me: string): Promise<PaymentDocument[]> {
  const holds = unwrapList<Row>(
    await db
      .from('escrow_holds')
      .select('id, booking_id, amount_kobo, commission_kobo, status, release_after, created_at')
      .eq('payee_id', me)
      .not('booking_id', 'is', null)
      .order('created_at', { ascending: false }),
  );

  if (holds.length === 0) return [];

  const rows = unwrapList<Row>(
    await db
      .from('bookings')
      .select(BOOKING_COLS)
      .in(
        'id',
        holds.map((h) => h.booking_id as string),
      ),
  );
  const byId = new Map(rows.map((r) => [r.id as string, r]));

  return holds.map((h) => {
    const gross = Number(h.amount_kobo ?? 0);
    const commission = Number(h.commission_kobo ?? 0);
    const b = byId.get(h.booking_id as string);
    const feeMode = b?.hostel?.fee_mode === 'pass_on' ? 'pass_on' : 'absorb';
    const released = h.status === 'released';

    return {
      id: `hold-${h.id}`,
      number: documentNumber('RNT', h.id as string),
      type: 'receipt' as const,
      kind: 'rent' as const,
      title: released ? 'Rent paid out' : 'Rent received',
      subject:
        [b?.hostel?.name as string, b?.room?.label as string].filter(Boolean).join(' · ') || null,
      issuedAt: h.created_at as string,
      lines: [
        { label: 'Rent collected from tenant', amountKobo: gross },
        {
          label: 'Sync commission (2.5%)',
          note: feeMode === 'pass_on' ? 'Added to the tenant total' : 'Deducted from your payout',
          // Negative only where the landlord actually bears it. On `pass_on`
          // the student paid it on top, so deducting it here would understate
          // the payout by the exact amount they arranged not to bear.
          amountKobo: feeMode === 'pass_on' ? commission : -commission,
          informational: feeMode === 'pass_on',
        },
      ],
      totalKobo: feeMode === 'pass_on' ? gross : gross - commission,
      direction: 'in' as const,
      reference: null,
      fromName: 'Your tenant',
      toName: 'You',
      footnote: released
        ? 'This has been paid into your Sync wallet.'
        : h.release_after
          ? `Held in escrow until ${dayOf(h.release_after as string)}, then paid into your wallet.`
          : 'Held in escrow until the stay is confirmed.',
      bookingId: h.booking_id as string,
    };
  });
}
