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
import { Resend } from 'resend';
import { SITE } from '@/config/site';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
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
}

export type NotifyResult = { ok: true } | { ok: false; error: string };

export async function notifyVerification(input: NotifyInput): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `${SITE.name} <no-reply@letsyncyou.com>`;

  if (!apiKey) {
    // Deliberately not an error the reviewer has to act on: a deploy without a
    // key is a configuration fact, not a mistake they made.
    console.error('[verification-mail] RESEND_API_KEY missing   decision saved, nothing sent');
    return {
      ok: false,
      error: 'Email is not configured in this environment, so nothing was sent.',
    };
  }

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

  try {
    const html = await render(
      createElement(VerificationDecisionEmail, {
        name,
        outcome: input.outcome,
        subject: input.subject,
        missing: input.missing ?? [],
        note: input.note ?? null,
        actionUrl: `${SITE.url}${input.path ?? '/me'}`,
      }),
    );

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject:
        input.outcome === 'verified'
          ? `Your ${SITE.name} account is verified`
          : input.outcome === 'rejected'
            ? `About your ${SITE.name} verification`
            : `One more thing for your ${SITE.name} verification`,
      html,
    });

    if (error) {
      // Usually an unverified sender domain or a key without send permission,
      // and Resend names which. Passed through rather than paraphrased   the
      // console is staff-only and the provider's own words are the fix.
      console.error('[verification-mail] Resend refused the send. from=%s error=%o', from, error);
      const detail = [error.name, error.message].filter(Boolean).join(': ');
      return { ok: false, error: `Resend refused it (from ${from})   ${detail}` };
    }
  } catch (e) {
    console.error('[verification-mail] send threw:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true };
}
