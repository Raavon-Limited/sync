/**
 * Telling somebody what happened to their verification.
 *
 * WHY THIS EXISTS
 *   Every decision on the console wrote a status and stopped. The person who
 *   uploaded a passport and a school ID found out by opening the dashboard and
 *   noticing   which means the ones who did not open it never found out at
 *   all, and the ones who were bounced never learned what to fix. A queue that
 *   cannot answer is a queue people ask support about instead.
 *
 * A SEND MUST NEVER TAKE DOWN A DECISION
 *   `notifyVerification` returns a result and throws nothing. A reviewer's
 *   click has already changed the database by the time this runs; failing the
 *   action because Resend was down would show them an error over work that
 *   actually succeeded, and the obvious response   click it again   would send
 *   the mail twice. The reason is logged and the caller may report it, but the
 *   decision stands either way.
 *
 * THE ADDRESS IS IN auth.users
 *   Not on `profiles`   see modules/admin/emails. That is also why this is
 *   server-only and service-role: it reads an address the caller may not
 *   otherwise be allowed to see.
 */
import 'server-only';
import { createElement } from 'react';
import { render } from '@react-email/render';
import { SITE, canonicalOrigin } from '@/config/site';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { logEmail, sendMail, type MailResult } from '@/modules/admin/mail';
import {
  VerificationDecisionEmail,
  type VerificationOutcome,
} from '@/emails/verification-decision-email';

export type { VerificationOutcome };

export interface NotifyInput {
  userId: string;
  outcome: VerificationOutcome;
  /** What they are being verified AS   'student', 'business', 'rider'. */
  subject: string;
  /** Outstanding documents and details, in the words the person will see. */
  missing?: string[];
  /** The reviewer's own note. */
  note?: string | null;
  /** Path on the site to send them to. Defaults to their dashboard. */
  path?: string;
  /** The staff member who caused it, for the log. Absent when automatic. */
  sentBy?: string | null;
}

export type NotifyResult = MailResult;

export async function notifyVerification(input: NotifyInput): Promise<NotifyResult> {
  const admin = createAdminClient();

  const [{ data: auth }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(input.userId),
    admin.from('profiles').select('full_name').eq('id', input.userId).maybeSingle(),
  ]);

  const to = auth?.user?.email;
  if (!to) return { ok: false, error: 'That account has no email address on file.' };

  // First name only. "Hi Muiz Owolabi" reads like a letter from a bank.
  const fullName = ((profile as Row | null)?.full_name as string | null) ?? null;
  const name = fullName?.trim().split(/\s+/)[0] || 'there';

  const subject =
    input.outcome === 'verified'
      ? `Your ${SITE.name} account is verified`
      : input.outcome === 'rejected'
        ? `About your ${SITE.name} verification`
        : `One more thing for your ${SITE.name} verification`;

  let html: string;
  try {
    html = await render(
      createElement(VerificationDecisionEmail, {
        name,
        outcome: input.outcome,
        subject: input.subject,
        missing: input.missing ?? [],
        note: input.note ?? null,
        actionUrl: `${canonicalOrigin()}${input.path ?? '/user'}`,
      }),
    );
  } catch (e) {
    console.error('[verification-mail] render threw:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const result = await sendMail({ to, subject, html });
  if (!result.ok) return result;

  // Only a SENT email is logged. A row for something Resend refused would make
  // the Resend button claim somebody had been written to when they had not,
  // which is worse than no count at all.
  await logEmail({
    recipientId: input.userId,
    email: to,
    kind: input.outcome === 'needs_info' ? 'verification_request' : 'verification_decision',
    subject,
    sentBy: input.sentBy ?? null,
  });

  return { ok: true };
}
