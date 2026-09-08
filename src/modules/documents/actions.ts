/**
 * "Email me this receipt."
 *
 * THE DOCUMENT IS REBUILT ON THE SERVER, NOT POSTED FROM THE BROWSER. The
 * client sends an id and nothing else. Accepting a rendered document from the
 * page and mailing it would let anybody mail themselves - or worse, have Sync
 * mail out - a receipt for any amount they liked, on Sync letterhead, from a
 * Sync address. A financial document that a client can author is not a
 * document.
 *
 * WHICH ALSO MAKES OWNERSHIP AUTOMATIC. The rebuild runs through the caller's
 * own session, so `wallet_transactions` (auth.uid() in the view) and the RLS
 * on bookings, inspections and escrow holds do the scoping. An id belonging to
 * somebody else simply is not in the list, and the answer is "not found"
 * rather than a permission check somebody has to remember to write.
 *
 * IT GOES TO THE ACCOUNT'S OWN ADDRESS, never to one supplied in the request.
 * "Send this receipt to..." with a free-text field is an open relay with Sync's
 * branding on it. If forwarding to an accountant is ever wanted, that is a
 * verified second address on the profile, not a parameter here.
 */
'use server';

import { render } from '@react-email/render';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/modules/auth/queries';
import { emailFor } from '@/modules/admin/emails';
import { sendMail } from '@/modules/admin/mail';
import { canonicalOrigin } from '@/config/site';
import { DocumentEmail } from '@/emails/document-email';
import { fetchLandlordDocuments, fetchMyDocuments } from './queries';
import { documentNaira } from './types';

export type MailDocumentResult = { ok: true; to: string } | { ok: false; error: string };

export async function emailDocument(input: {
  documentId: string;
  /** Which list to look in. A landlord's rent receipts are not in their own. */
  scope?: 'mine' | 'landlord';
}): Promise<MailDocumentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Sign in to email a receipt.' };

  const supabase = await createClient();
  const docs =
    input.scope === 'landlord'
      ? await fetchLandlordDocuments(supabase, user.id)
      : await fetchMyDocuments(supabase, user.id);

  const doc = docs.find((d) => d.id === input.documentId);
  // Not in the caller's own list means either it does not exist or it is not
  // theirs, and those are deliberately the same answer.
  if (!doc) return { ok: false, error: 'We could not find that document.' };

  const to = await emailFor(user.id);
  if (!to) {
    return { ok: false, error: 'There is no email address on your account to send this to.' };
  }

  const name =
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
    (user.user_metadata?.name as string | undefined)?.split(' ')[0] ??
    'there';

  const base = input.scope === 'landlord' ? '/landlord/receipts' : '/user/receipts';
  const html = await render(
    DocumentEmail({
      doc,
      name,
      documentUrl: `${canonicalOrigin()}${base}/${encodeURIComponent(doc.id)}`,
    }),
  );

  const sent = await sendMail({
    to,
    subject: `${doc.type === 'invoice' ? 'Invoice' : 'Receipt'} ${doc.number} · ${documentNaira(
      doc.totalKobo,
    )}`,
    html,
  });

  if (!sent.ok) {
    // The provider's own words where there are any: "Email is not configured in
    // this environment" is a far more useful thing to read than "failed".
    return { ok: false, error: sent.error };
  }

  // The address is returned so the UI can say WHERE it went. "Sent" alone
  // invites a second press when it does not arrive at the address they assumed.
  return { ok: true, to };
}
