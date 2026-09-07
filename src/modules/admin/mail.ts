/**
 * Sending platform email, and remembering that we did.
 *
 * ONE DOOR OUT
 *   Verification decisions, "here is what is missing", and the mail centre all
 *   pass through `sendMail`. Three call sites reaching for Resend directly is
 *   three places to get the sender wrong, three error shapes, and - the one
 *   that actually bit - three places that could forget to write the log, which
 *   is what makes the Resend button on the review screen able to say how many
 *   times somebody has already been asked.
 *
 * A SEND NEVER THROWS
 *   Every function here returns a result. Mail is a courtesy attached to work
 *   that has already happened: a verification decision is written before the
 *   email is attempted, and failing the action would show an error over
 *   something that succeeded - with "click it again" as the obvious response,
 *   which sends twice.
 *
 * LOGGING IS BEST-EFFORT AND SAYS SO
 *   If the log write fails, the email was still sent. Reporting a failure
 *   because we could not record a success is the wrong way round; it is logged
 *   to the server and the send is still reported as the success it was.
 */
import 'server-only';
import { Resend } from 'resend';
import { MAIL_FROM, SITE } from '@/config/site';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';

/**
 * email_log postdates the checked-in generated types. REGENERATE once
 * 20260904210000 is applied and this goes   the same escape hatch
 * student_profiles needed for the same reason.
 */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

export type MailKind = 'verification_decision' | 'verification_request' | 'broadcast';

export type MailResult = { ok: true } | { ok: false; error: string };

export interface LogEntry {
  recipientId: string | null;
  email: string;
  kind: MailKind;
  subject: string;
  sentBy?: string | null;
  batchId?: string | null;
}

/** The configured sender, or null when this environment cannot send at all. */
export function mailSender(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: process.env.EMAIL_FROM ?? MAIL_FROM };
}

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<MailResult> {
  const sender = mailSender();
  if (!sender) {
    // A deploy without a key is a configuration fact, not a mistake the person
    // clicking made. Said plainly so nobody hunts for a bug in the button.
    console.error('[mail] RESEND_API_KEY missing   nothing sent');
    return {
      ok: false,
      error: 'Email is not configured in this environment, so nothing was sent.',
    };
  }

  try {
    const resend = new Resend(sender.apiKey);
    const { error } = await resend.emails.send({
      from: sender.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      // The templates end with "replying to this email reaches our support
      // team", so the reply lands on the SUPPORT alias rather than the general
      // one: a reply to a verification decision is somebody with a problem,
      // and it should arrive looking like one.
      replyTo: SITE.support.help,
    });

    if (error) {
      // Usually an unverified sender domain or a key without send permission,
      // and Resend names which. Passed through rather than paraphrased   the
      // console is staff-only and the provider's own words are the fix.
      console.error('[mail] Resend refused the send. from=%s error=%o', sender.from, error);
      const detail = [error.name, error.message].filter(Boolean).join(': ');
      return { ok: false, error: `Resend refused it (from ${sender.from})   ${detail}` };
    }
  } catch (e) {
    console.error('[mail] send threw:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true };
}

/** Record what went out. Never throws   see the header. */
export async function logEmail(entries: LogEntry | LogEntry[]): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;

  try {
    const admin = createAdminClient();
    const { error } = await loose(admin)
      .from('email_log')
      .insert(
        list.map((e) => ({
          recipient_id: e.recipientId,
          email: e.email,
          kind: e.kind,
          subject: e.subject,
          sent_by: e.sentBy ?? null,
          batch_id: e.batchId ?? null,
        })),
      );
    if (error) console.error('[mail] could not write email_log:', error.message);
  } catch (e) {
    console.error('[mail] email_log insert threw:', e);
  }
}

export interface MailCount {
  count: number;
  lastAt: string | null;
}

/**
 * How many times this person has been written to about this kind of thing.
 *
 * THE REVIEW SCREEN'S QUESTION. A reviewer opening a folder that has sat there
 * a week needs to know whether the last two reviewers already asked - "Ask for
 * what is missing" and "Resend (2nd time)" are different acts, and offering the
 * first when the truth is the second is how somebody gets the same email three
 * times from three people.
 *
 * A missing table answers zero rather than failing: the count decorates a
 * button, and a review screen must not 500 because a migration has not run.
 */
export async function mailCount(recipientId: string, kind: MailKind): Promise<MailCount> {
  try {
    const admin = createAdminClient();
    const { data, error, count } = await loose(admin)
      .from('email_log')
      .select('created_at', { count: 'exact' })
      .eq('recipient_id', recipientId)
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) return { count: 0, lastAt: null };
    return {
      count: count ?? 0,
      lastAt: ((data as Row[] | null)?.[0]?.created_at as string) ?? null,
    };
  } catch {
    return { count: 0, lastAt: null };
  }
}

/**
 * Many emails, one call to the provider.
 *
 * WHY BATCH AND NOT A LOOP
 *   A mailshot to every account, sent one request at a time, is one request per
 *   person against a provider that rate-limits per second: it takes minutes, it
 *   trips the limit halfway, and a server action that runs for minutes is a
 *   server action that gets cut off with half the list written to and no record
 *   of where it stopped. Resend takes 100 messages per call, so the chunking
 *   here IS the rate limiting.
 *
 * PARTIAL SUCCESS IS THE NORMAL CASE and the caller is told which chunks failed
 * rather than being handed a single true/false for four hundred people. Only
 * what was accepted is logged, so the history never claims somebody was
 * written to when the provider refused.
 */
export async function sendMailBatch(
  messages: { to: string; subject: string; html: string }[],
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const sender = mailSender();
  if (!sender) {
    return {
      sent: 0,
      failed: messages.length,
      errors: ['Email is not configured in this environment, so nothing was sent.'],
    };
  }

  const resend = new Resend(sender.apiKey);
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;

  // 100 is Resend's documented ceiling per batch.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const { error } = await resend.batch.send(
        chunk.map((m) => ({
          from: sender.from,
          to: m.to,
          subject: m.subject,
          html: m.html,
          replyTo: SITE.support.help,
        })),
      );
      if (error) {
        failed += chunk.length;
        errors.push([error.name, error.message].filter(Boolean).join(': '));
      } else {
        sent += chunk.length;
      }
    } catch (e) {
      failed += chunk.length;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (errors.length) console.error('[mail] batch send had failures:', errors);
  return { sent, failed, errors };
}
