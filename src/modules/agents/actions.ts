/**
 * Agents: inviting them, sending them somewhere, and what they file when they
 * get back.
 *
 * WHY EVERY WRITE IS AN RPC AND NOT A TABLE WRITE
 *   Assigning a visit is four decisions at once and two notifications, and it
 *   has to be one transaction: a row that exists while the landlord was never
 *   told is exactly the situation the notification exists to prevent   a
 *   stranger with a camera at somebody's gate. `assign_verification_visit`
 *   does all of it or none of it, and re-checks `is_staff()` in the database
 *   rather than trusting the guard out here.
 *
 * THE INVITE IS THE ONLY WAY IN
 *   There is no "become an agent" button and there must not be one. An agent
 *   is trusted with an address and turns up at a door; the role is handed out
 *   deliberately, by somebody accountable, to an address they control. Same
 *   shape as a console invite, longer expiry   see the migration's header.
 */
'use server';

import { createElement } from 'react';
import { render } from '@react-email/render';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SITE } from '@/config/site';
import { userMessage } from '@/lib/errors';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { assertArea } from '@/modules/access/guard';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { isStaffRole } from '@/modules/admin/guard';
import { logEmail, sendMail } from '@/modules/admin/mail';
import { BroadcastEmail } from '@/emails/broadcast-email';

/** The agent RPCs postdate the checked-in generated types. REGENERATE. */
function rpc(c: unknown) {
  return (c as SupabaseClient).rpc.bind(c as SupabaseClient) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export type AgentResult = { ok: true } | { ok: false; error: string };

async function assertAgentStaff() {
  const profile = await getProfile();
  if (!profile || !isStaffRole(profile.role)) throw new Error('Staff only');
  await assertArea('agents');
}

/**
 * Invite somebody to be an agent, and email them the link.
 *
 * THE LINK IS RETURNED AS WELL AS SENT. Emailing it is the feature; the
 * copyable link is the fallback for when the provider is misconfigured, which
 * is the difference between "email is broken" and "you cannot recruit anybody
 * today". Same reasoning as the console invite.
 */
export async function inviteAgent(input: {
  email: string;
  campusId?: string | null;
}): Promise<
  { ok: true; link: string; emailed: boolean; emailError?: string } | { ok: false; error: string }
> {
  await assertAgentStaff();

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) return { ok: false, error: 'That is not an email address.' };

  const supabase = await createServerClient();
  const { data, error } = await rpc(supabase)('create_agent_invite', {
    p_email: email,
    p_campus: input.campusId ?? null,
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not create that invite.') };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { invite_id: string; invite_token: string }
    | undefined;
  if (!row?.invite_token) return { ok: false, error: 'The invite was not created.' };

  const link = `${SITE.url}/agent-invite?token=${row.invite_token}`;
  const invitedBy = (await getCurrentUser())?.email ?? SITE.name;

  let emailed = false;
  let emailError: string | undefined;
  try {
    // The broadcast shell rather than a seventh bespoke template: this is a
    // heading, two paragraphs and a button, which is exactly what it is for.
    const html = await render(
      createElement(BroadcastEmail, {
        name: 'there',
        heading: `Come and verify listings for ${SITE.name}`,
        paragraphs: [
          `${invitedBy} has invited you to be a ${SITE.name} agent. Agents visit hostels and shops, take photos of what is actually there, and file what they found   it is how a listing earns the verified badge instead of claiming it.`,
          'Opening the link below creates your account and lets you choose your own password. Nobody at Sync can see it, and the link works once.',
          'It expires in 3 days. If it lapses, ask whoever invited you for another.',
        ],
        ctaLabel: 'Accept and set a password',
        ctaUrl: link,
      }),
    );
    const sent = await sendMail({
      to: email,
      subject: `You have been invited to verify listings for ${SITE.name}`,
      html,
    });
    emailed = sent.ok;
    if (!sent.ok) emailError = sent.error;
    if (sent.ok) {
      await logEmail({ recipientId: null, email, kind: 'broadcast', subject: 'Agent invitation' });
    }
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  revalidatePath('/admin/agents');
  return { ok: true, link, emailed, emailError };
}

export async function revokeAgentInvite(id: string): Promise<AgentResult> {
  await assertAgentStaff();
  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('revoke_agent_invite', { p_id: id });
  if (error) return { ok: false, error: userMessage(error, 'We could not cancel that invite.') };
  revalidatePath('/admin/agents');
  return { ok: true };
}

/**
 * Send an agent to look at a place.
 *
 * Exactly one of `hostelId` / `vendorId`, which the database also insists on:
 * a visit to nothing, or to both at once, is not a visit anybody can be sent
 * on. `meetUserId` is the student who asked to view the room, when there is
 * one   the agent and the viewer arriving together is one trip instead of two
 * and safer for both of them.
 */
export async function assignVisit(input: {
  agentId: string;
  hostelId?: string | null;
  vendorId?: string | null;
  scheduledFor?: string | null;
  meetUserId?: string | null;
  brief?: string;
}): Promise<AgentResult> {
  await assertAgentStaff();

  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('assign_verification_visit', {
    p_agent: input.agentId,
    p_hostel: input.hostelId ?? null,
    p_vendor: input.vendorId ?? null,
    p_when: input.scheduledFor || null,
    p_meet: input.meetUserId ?? null,
    p_brief: input.brief ?? null,
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not assign that visit.') };

  revalidatePath('/admin/agents');
  revalidatePath('/admin/verify-visits');
  revalidatePath('/agent');
  return { ok: true };
}

/**
 * What an agent files when they get back.
 *
 * They cannot decide their own visit   that is the separation this whole table
 * exists for. Submitting moves it to Under Review and staff take it from there.
 */
export async function submitVisit(input: {
  visitId: string;
  photos?: string[];
  videoUrl?: string;
  notes?: string;
}): Promise<AgentResult> {
  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('submit_verification_visit', {
    p_visit: input.visitId,
    p_photos: input.photos ?? null,
    p_video: input.videoUrl || null,
    p_notes: input.notes || null,
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not submit that visit.') };
  revalidatePath('/agent');
  return { ok: true };
}
