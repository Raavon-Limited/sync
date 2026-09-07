/**
 * The mail centre: write once, send to everybody or to a chosen few.
 *
 * WHY IT IS NOT "just use Resend's dashboard"
 *   The audience lives here. "Every landlord", "the four riders waiting on
 *   verification", "these two accounts" are questions about this database, and
 *   exporting a list to paste somewhere else is how a list goes stale, goes
 *   wrong, or goes to a spreadsheet on somebody's laptop.
 *
 * IT CAN ALSO NOT SEND EMAIL AT ALL
 *   An in-app notification is often the right instrument   short, timely,
 *   already where the person is working   and email is the wrong one for
 *   "maintenance at 6pm". Either, or both, and the caller says which.
 *
 * WHAT PROTECTS THE PLATFORM FROM THIS SCREEN
 *   It is the one control that can write to every account at once, so:
 *     * its own access area ('mail'), which nobody holds until it is granted;
 *     * a hard cap per send, so a mistake reaches hundreds and not thousands;
 *     * every message logged with the sender's id, because "who sent that?"
 *       must have an answer.
 *
 * THE BATCH IS NOT TRANSACTIONAL. Resend takes chunks of a hundred and some
 * may fail while others go. The result says how many of each rather than
 * pretending an all-or-nothing outcome that no email provider offers.
 */
'use server';

import { createElement } from 'react';
import { render } from '@react-email/render';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalOrigin } from '@/config/site';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { assertArea } from '@/modules/access/guard';
import { getCurrentUser } from '@/modules/auth/queries';
import { isStaffRole } from '@/modules/admin/guard';
import { getProfile } from '@/modules/auth/queries';
import { logEmail, sendMailBatch } from '@/modules/admin/mail';
import { BroadcastEmail } from '@/emails/broadcast-email';

/** email_log postdates the generated types. REGENERATE after 20260904210000. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

/**
 * The most this screen will send in one go.
 *
 * Not a technical limit   a blast radius. A mis-aimed "all accounts" send
 * cannot be recalled, and the difference between explaining a mistake to two
 * hundred people and to the whole platform is worth one extra click.
 */
const MAX_RECIPIENTS = 500;

export type Audience =
  | { mode: 'all' }
  /** Every account holding one of these roles. */
  | { mode: 'roles'; roles: string[] }
  /** Exactly these accounts. */
  | { mode: 'ids'; ids: string[] };

export interface BroadcastInput {
  subject: string;
  /** Plain text. Blank lines split paragraphs   see the email template. */
  body: string;
  audience: Audience;
  /** Send the email. */
  email: boolean;
  /** Raise the in-app bell as well. */
  notify: boolean;
  /** Optional button in the email and the target of the notification. */
  ctaLabel?: string;
  ctaPath?: string;
}

export interface BroadcastResult {
  ok: boolean;
  /** Emails the provider accepted. */
  sent: number;
  /** Emails it refused, plus anyone with no address. */
  failed: number;
  /** In-app notifications written. */
  notified: number;
  /** How many accounts the audience resolved to. */
  audience: number;
  errors: string[];
}

async function assertMailStaff(): Promise<string> {
  const profile = await getProfile();
  if (!profile || !isStaffRole(profile.role as string)) throw new Error('Staff only');
  await assertArea('mail');
  const user = await getCurrentUser();
  return user!.id;
}

/** Who the audience resolves to, with the addresses attached. */
async function resolveAudience(
  audience: Audience,
): Promise<{ id: string; name: string | null; email: string | null }[]> {
  const admin = createAdminClient();

  let query = admin.from('profiles').select('id, full_name, role').is('archived_at', null);
  if (audience.mode === 'roles') query = query.in('role', audience.roles);
  if (audience.mode === 'ids') query = query.in('id', audience.ids);

  const [{ data: people }, { data: list }] = await Promise.all([
    query,
    // One page covers this platform comfortably; the same call the users
    // console makes. Addresses live in auth.users and nowhere else.
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return ((people ?? []) as Row[]).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string) ?? null,
    email: emailById.get(p.id as string) ?? null,
  }));
}

/** What the audience adds up to, for the count beside the Send button. */
export async function audienceSize(audience: Audience): Promise<number> {
  await assertMailStaff();
  return (await resolveAudience(audience)).length;
}

export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const senderId = await assertMailStaff();

  const subject = input.subject.trim();
  const body = input.body.trim();
  const empty: BroadcastResult = {
    ok: false,
    sent: 0,
    failed: 0,
    notified: 0,
    audience: 0,
    errors: [],
  };

  if (!subject) return { ...empty, errors: ['Give it a subject.'] };
  if (!body) return { ...empty, errors: ['Write something to send.'] };
  if (!input.email && !input.notify) {
    return { ...empty, errors: ['Choose email, an in-app notification, or both.'] };
  }

  const people = await resolveAudience(input.audience);
  if (people.length === 0) return { ...empty, errors: ['That audience is empty.'] };
  if (people.length > MAX_RECIPIENTS) {
    return {
      ...empty,
      audience: people.length,
      errors: [
        `That is ${people.length} accounts and one send is capped at ${MAX_RECIPIENTS}. Narrow the audience.`,
      ],
    };
  }

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+$/, ''))
    .filter(Boolean);

  const errors: string[] = [];
  let sent = 0;
  let failed = 0;
  let notified = 0;

  // Ties this send's rows together, so the history can count one mailshot
  // rather than rows that happen to share a subject line.
  const batchId = crypto.randomUUID();

  if (input.email) {
    const withEmail = people.filter((p) => p.email);
    // Counted as failed rather than skipped silently: "sent to 40 of 47" is a
    // fact somebody needs, and seven accounts with no address is a real thing
    // to go and look at.
    failed += people.length - withEmail.length;

    const messages = withEmail.map((p) => ({
      to: p.email!,
      subject,
      html: '',
      person: p,
    }));

    // Rendered per person because the greeting is per person. The template is
    // small and this is a few hundred at most.
    for (const m of messages) {
      m.html = await render(
        createElement(BroadcastEmail, {
          name: m.person.name?.trim().split(/\s+/)[0] || 'there',
          heading: subject,
          paragraphs,
          ctaLabel: input.ctaLabel?.trim() || null,
          ctaUrl: input.ctaPath?.trim() ? `${canonicalOrigin()}${input.ctaPath.trim()}` : null,
        }),
      );
    }

    const result = await sendMailBatch(
      messages.map((m) => ({ to: m.to, subject: m.subject, html: m.html })),
    );
    sent += result.sent;
    failed += result.failed;
    errors.push(...result.errors);

    // Only what the provider accepted. A log that claims a send Resend refused
    // is worse than no log   it is the thing the Resend button counts.
    if (result.sent > 0 && result.failed === 0) {
      await logEmail(
        withEmail.map((p) => ({
          recipientId: p.id,
          email: p.email!,
          kind: 'broadcast' as const,
          subject,
          sentBy: senderId,
          batchId,
        })),
      );
    }
  }

  if (input.notify) {
    const admin = createAdminClient();
    // The bell is realtime: every recipient's open tab picks these up on the
    // channel it already holds, which is what makes this a pop-up rather than
    // something found later.
    //
    // Inserted directly rather than through private.notify, which skips the
    // actor to stop somebody being told about their own action   here the
    // sender is staff and may legitimately be in the audience.
    const { error } = await loose(admin)
      .from('notifications')
      .insert(
        people.map((p) => ({
          user_id: p.id,
          kind: 'system',
          title: subject,
          // One line in a dropdown. The full text is in the email; a bell that
          // unrolls six paragraphs is a bell nobody opens twice.
          body: paragraphs[0]?.slice(0, 240) ?? subject,
          href: input.ctaPath?.trim() || null,
        })),
      );

    if (error) errors.push(`In-app notifications failed: ${error.message}`);
    else notified = people.length;
  }

  revalidatePath('/admin/mail');

  return {
    ok: errors.length === 0,
    sent,
    failed,
    notified,
    audience: people.length,
    errors,
  };
}
