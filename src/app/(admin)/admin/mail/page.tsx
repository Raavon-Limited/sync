/**
 * ROUTE: /admin/mail
 * ACCESS: staff granted the `mail` area   which nobody holds until a super
 *         admin grants it. This is the one screen that can write to every
 *         account on the platform at once.
 * PURPOSE: Write once, send to everybody or to a chosen few, by email and in
 *          the app.
 *
 * THE AUDIENCE IS LOADED HERE, NOT SEARCHED FOR LATER
 *   Every account, with its role and address, in one read. The list is small
 *   enough for that to be the honest thing to do, and it means picking people
 *   is instant and offline rather than a search box that queries per keystroke.
 *   When this platform is big enough for that to be wrong, the shape to change
 *   is this page, not the action behind it.
 *
 * THE HISTORY IS PART OF THE SCREEN
 *   What has already gone out, to whom, from whom. Without it the only record
 *   of a mailshot is in Resend, and "did anyone already tell them?" is exactly
 *   the question somebody asks before sending the second one.
 */
import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { MailComposer, type Recipient } from './(components)/mail-composer';

export const metadata: Metadata = { title: 'Mail centre   Admin' };

// Who has been written to is stale the moment somebody sends one.
export const dynamic = 'force-dynamic';

/** email_log postdates the generated types. REGENERATE after 20260904210000. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

export interface SentRow {
  id: string;
  email: string;
  kind: string;
  subject: string;
  sentBy: string | null;
  createdAt: string;
}

export default async function Page() {
  await requireStaffArea('mail');

  const admin = createAdminClient();

  const [{ data: people }, { data: list }, { data: log }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, role')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    loose(admin)
      .from('email_log')
      .select('id, email, kind, subject, sent_by, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const nameById = new Map(
    ((people ?? []) as Row[]).map((p) => [p.id as string, (p.full_name as string) ?? null]),
  );

  const recipients: Recipient[] = ((people ?? []) as Row[]).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string) ?? 'No name set',
    role: (p.role as string) ?? 'student',
    email: emailById.get(p.id as string) ?? null,
  }));

  const sent: SentRow[] = ((log ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    kind: r.kind as string,
    subject: r.subject as string,
    // The staff member's name, not a uuid: "who sent that?" is a question
    // about a person.
    sentBy: r.sent_by ? (nameById.get(r.sent_by as string) ?? 'A staff account') : null,
    createdAt: r.created_at as string,
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / MAIL</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Mail <span className="text-lime-deep">centre.</span>
        </h2>
        <p className="text-content-muted mt-2 text-sm">
          One message, by email and in the app. Everything sent from here is logged against the
          account that sent it.
        </p>
      </div>

      <MailComposer recipients={recipients} sent={sent} />
    </section>
  );
}
