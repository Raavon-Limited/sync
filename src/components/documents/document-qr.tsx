'use client';

/**
 * The scannable square on a receipt, where there is something to scan for.
 *
 * A QR IS ONLY WORTH PRINTING WHEN SOMETHING ANSWERS. Two kinds do:
 *
 *   tenancy  /t/<code> re-checks the tenancy live, so a receipt scanned after
 *            somebody moved out reads "not a current tenant". A static image
 *            of a document proves nothing; a link that says no when the answer
 *            is no is what makes it worth showing.
 *   ticket   the reference IS what the gate scans - see modules/events.
 *
 * An order or a service request has neither, so `verify` is null for those and
 * this renders nothing. A QR encoding a string nobody can check is decoration
 * that looks like proof, which is worse than a blank space.
 *
 * THE CODE IS FETCHED, NOT DERIVED. A tenancy code is 128 unguessable bits in
 * `private.tenancy_codes`, reachable only through `my_tenancy_code` and scoped
 * to the caller's own booking - it is a capability, so it must never be
 * something a booking id can be turned into.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { renderQr } from '@/lib/qr';
import { canonicalOrigin } from '@/config/site';
import type { PaymentDocument } from '@/modules/documents/types';

export function DocumentQr({ verify }: { verify: PaymentDocument['verify'] }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (verify?.kind !== 'tenancy') return;
    let cancelled = false;
    createClient()
      .rpc('my_tenancy_code', { p_booking: verify.bookingId })
      .then(({ data }) => {
        if (!cancelled && data) setCode(data as string);
      });
    return () => {
      cancelled = true;
    };
  }, [verify]);

  const payload = useMemo(() => {
    if (!verify) return null;
    if (verify.kind === 'ticket') return verify.reference;
    return code ? `${canonicalOrigin()}/t/${code}` : null;
  }, [verify, code]);

  const qr = useMemo(() => {
    if (!payload) return null;
    // True white behind it, not the card colour: decoders threshold on
    // contrast, and a dark-on-dark QR is a QR nobody can read. See lib/qr.
    return renderQr(payload, {
      size: 116,
      dark: '#0e0e12',
      light: '#ffffff',
      margin: 2,
      radius: 0.34,
    });
  }, [payload]);

  // Nothing to verify, or the code has not arrived. Never a placeholder square.
  if (!verify || !qr) return null;

  return (
    <div className="border-line/15 print-keep flex items-center gap-4 border-t pt-4">
      <div className="shrink-0 rounded-xl bg-white p-2">
        <div
          className="size-24"
          role="img"
          aria-label="Scan to verify this receipt"
          dangerouslySetInnerHTML={{ __html: qr.svg }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-content text-sm font-medium">
          {verify.kind === 'ticket' ? 'Show at the gate' : 'Scan to verify'}
        </p>
        <p className="text-content-muted mt-0.5 text-xs leading-relaxed">
          {verify.kind === 'ticket'
            ? 'This is the code the gate scans. One entry per ticket.'
            : 'Checks live against Sync, so it stays honest after you move out. It shows no contact details and no payment.'}
        </p>
      </div>
    </div>
  );
}
