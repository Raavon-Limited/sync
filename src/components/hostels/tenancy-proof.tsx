'use client';

/**
 * Proof that this room is theirs, to show somebody standing in front of them.
 *
 * WHY IT IS NOT THE RECEIPT. The receipt (/user/receipts) is a financial
 * document: it itemises rent and Sync's commission, and it is for the person
 * who paid. This is a credential: it answers "does this person hold this room",
 * and it is shown to a porter, a parent, a security guard or the school. So it
 * carries the names, the room, the dates and the landlord's acceptance - and
 * deliberately NOT what anybody paid. A proof that discloses somebody's
 * finances is one they will refuse to show, which defeats it.
 *
 * THE QR IS THE POINT, and it is not decorative. It resolves to /t/<code>,
 * which re-checks the tenancy live at the moment it is scanned - so a screenshot
 * of this panel taken after somebody moved out verifies as "not a current
 * tenant". A static image of a document proves nothing; a link that says "no"
 * when the answer is no is what makes this worth showing.
 *
 * THE CODE IS FETCHED, NOT DERIVED. It is 128 unguessable bits living in
 * `private.tenancy_codes`, reachable only through `my_tenancy_code`, which is
 * scoped to the student's own booking. Possession of it opens the page, so it
 * must never be something a booking id could be turned into.
 *
 * ONLY FOR A CONFIRMED TENANCY. There is nothing to prove about a room nobody
 * has paid for, and the code is not issued until the booking confirms.
 */

import { useEffect, useMemo, useState } from 'react';
import { QrCode, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { renderQr } from '@/lib/qr';
import { canonicalOrigin } from '@/config/site';
import { PrintButton } from '@/components/documents/document-sheet';

const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

export interface TenancyProofProps {
  bookingId: string;
  studentName: string;
  hostelName: string;
  roomLabel?: string | null;
  address?: string | null;
  /** Naira, formatted. Shown to the TENANT only - it never reaches /t/<code>. */
  amount?: string | null;
  moveIn?: string | null;
  endDate?: string | null;
  graceUntil?: string | null;
  /** When the landlord accepted. This is the consent being attested. */
  acceptedAt?: string | null;
}

export function TenancyProof(props: TenancyProofProps) {
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .rpc('my_tenancy_code', { p_booking: props.bookingId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setFailed(true);
        else setCode(data as string);
      });
    return () => {
      cancelled = true;
    };
  }, [props.bookingId]);

  const verifyUrl = code ? `${canonicalOrigin()}/t/${code}` : null;

  const qr = useMemo(() => {
    if (!verifyUrl) return null;
    // A true white background, not the card colour: decoders threshold on
    // contrast and a dark-on-dark QR is a QR nobody can read. See lib/qr.
    return renderQr(verifyUrl, {
      size: 132,
      dark: '#0e0e12',
      light: '#ffffff',
      margin: 2,
      radius: 0.34,
    });
  }, [verifyUrl]);

  const ends = props.graceUntil ?? props.endDate;

  return (
    <div className="print-sheet border-line/15 bg-panel flex flex-col gap-4 rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
            Proof of tenancy
          </p>
          <p className="font-display text-content text-lg font-semibold">{props.studentName}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-600">
          <ShieldCheck className="size-3" aria-hidden="true" />
          Confirmed
        </span>
      </div>

      <div className="border-line/10 flex flex-col gap-3 border-t pt-4">
        <Field
          label="Room"
          value={[props.hostelName, props.roomLabel].filter(Boolean).join(' · ')}
        />
        {props.address && <Field label="Address" value={props.address} />}
        <Field
          label="Dates"
          value={`${longDate(props.moveIn) ?? 'Not set'} — ${longDate(ends) ?? 'Not set'}`}
        />
        {/* Only when the landlord actually extended it, and named as an
            extension so it cannot be read as the lease itself. */}
        {props.graceUntil && (
          <Field label="Extended to" value={`${longDate(props.graceUntil)} by your landlord`} />
        )}
        {props.acceptedAt && (
          <Field label="Landlord accepted" value={longDate(props.acceptedAt) ?? ''} />
        )}
        {/* THE TENANT'S OWN COPY MAY SHOW THE RENT. The scanned page may not -
            see the header, and the assertion in 20260914090000. */}
        {props.amount && <Field label="Rent paid" value={props.amount} />}
      </div>

      <div className="border-line/10 flex items-center gap-4 border-t pt-4">
        <div className="shrink-0 rounded-xl bg-white p-2">
          {qr ? (
            // The helper returns a complete <svg>; injecting it is simpler and
            // less lossy than rebuilding the element around its innards.
            <div
              className="size-28"
              role="img"
              aria-label="Scan to verify this tenancy"
              dangerouslySetInnerHTML={{ __html: qr.svg }}
            />
          ) : (
            // Never a placeholder QR. One that resolves to nothing is worse
            // than an obviously blank square.
            <span className="text-content-muted flex size-28 items-center justify-center">
              <QrCode className="size-8 opacity-30" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-content text-sm font-medium">Scan to verify</p>
          <p className="text-content-muted mt-0.5 text-xs leading-relaxed">
            {failed
              ? 'We could not load the verification code for this tenancy.'
              : 'Checks live against Sync, so it stays honest after you move out. It shows no contact details and no payment.'}
          </p>
        </div>
      </div>

      <div className="no-print">
        <PrintButton label="Print this proof" />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">{label}</p>
      <p className="text-content text-sm">{value}</p>
    </div>
  );
}
