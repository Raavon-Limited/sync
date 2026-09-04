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
import { SITE, canonicalOrigin } from '@/config/site';
import { userMessage } from '@/lib/errors';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

  // canonicalOrigin(), NOT SITE.url.
  //
  // SITE.url is the hardcoded production address, so an invite generated on a
  // dev machine or a preview deploy pointed at the LIVE site   the recipient
  // opened it, production knew nothing about that token, and they landed on
  // signup being asked to make an account instead of setting a password.
  //
  // canonicalOrigin() prefers NEXT_PUBLIC_SITE_URL and falls back to SITE.url,
  // which is what the staff invite has always used. The token is encoded for
  // the same reason it is there   it is a credential in a query string.
  const link = `${canonicalOrigin()}/agent-invite?token=${encodeURIComponent(row.invite_token)}`;
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

/**
 * Send the invitation again.
 *
 * A RE-ISSUE, NOT A RE-SEND OF THE SAME LINK
 *   `create_agent_invite` already revokes any open invite for an address before
 *   inserting a new one, so calling it again is the whole implementation: a
 *   fresh token, a fresh three days, and the previous link dead. That is what
 *   you want in both cases where somebody presses this   the mail never
 *   arrived, or it arrived and sat until it expired. Re-mailing a token that
 *   has already lapsed would be a button that reliably does nothing.
 *
 *   It also means a link somebody forwarded to the wrong person stops working
 *   the moment the invitation is sent again, which is the safer default.
 *
 * The address comes from the invite row rather than the caller, so this cannot
 * be used to mail an invitation somewhere it was never addressed.
 */
export async function resendAgentInvite(
  id: string,
): Promise<
  | { ok: true; email: string; link: string; emailed: boolean; emailError?: string }
  | { ok: false; error: string }
> {
  await assertAgentStaff();

  // Service role: `agent_invites` is read here by the same console that lists
  // it, and this action is already gated above.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('agent_invites')
    .select('email, campus_id, accepted_at, revoked_at')
    .eq('id', id)
    .maybeSingle();

  if (error) return { ok: false, error: userMessage(error, 'We could not find that invitation.') };
  if (!data) return { ok: false, error: 'That invitation no longer exists.' };

  // Both are dead ends with different fixes, so they get different sentences.
  if (data.accepted_at) {
    return { ok: false, error: 'They have already accepted   there is nothing to resend.' };
  }
  if (data.revoked_at) {
    return { ok: false, error: 'That invitation was cancelled. Invite the address again instead.' };
  }

  const res = await inviteAgent({
    email: data.email as string,
    campusId: (data.campus_id as string | null) ?? null,
  });

  if (!res.ok) return res;
  return { ...res, email: data.email as string };
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
  revalidatePath('/agent/requests');
  return { ok: true };
}

/**
 * Move an open visit to a different agent, or with no agent stand the current
 * one down.
 *
 * WHY THIS IS NOT assignVisit WITH AN ID
 *   `assign_verification_visit` inserts. Calling it again for the same hostel
 *   makes a SECOND visit and notifies the landlord twice, which is how "the
 *   agent changed" turns into "two different people are coming". This edits the
 *   row that already exists, and the RPC refuses once evidence has been filed
 *   against it   those photos belong to whoever took them.
 */
export async function reassignVisit(input: {
  visitId: string;
  /** null stands the current agent down and returns the visit to the queue. */
  agentId: string | null;
}): Promise<AgentResult> {
  await assertAgentStaff();

  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('reassign_verification_visit', {
    p_visit: input.visitId,
    p_agent: input.agentId,
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not reassign that visit.') };

  revalidatePath('/admin/agents');
  revalidatePath('/admin/verify-visits');
  revalidatePath('/agent/requests');
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
  /** The agent at the property. See 20260909180000 for why it is its own field. */
  selfieUrl?: string;
}): Promise<AgentResult> {
  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('submit_verification_visit', {
    p_visit: input.visitId,
    p_photos: input.photos ?? null,
    p_video: input.videoUrl || null,
    p_notes: input.notes || null,
    p_selfie: input.selfieUrl || null,
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not submit that visit.') };
  revalidatePath('/agent/visits');
  return { ok: true };
}

/**
 * File the report on a student's inspection   the visit the STUDENT paid for,
 * which is a different thing from a verification visit and a different table.
 *
 * FILING IS WHAT STARTS THE AGENT'S OWN PAYMENT CLOCK
 *   The fee sits in escrow with `release_after` null, so nothing can release
 *   it until this call sets that date. Until an agent files, their money is
 *   held on a visit the platform cannot prove happened   which is why the
 *   screen tells them so in those words rather than calling this "submit".
 *
 * The RPC re-checks that the caller is the assigned agent (or staff), because
 * this action is reachable by anyone signed in.
 */
export async function fileInspectionReport(input: {
  inspectionId: string;
  notes?: string;
  photos?: string[];
  videoUrl?: string;
  selfieUrl?: string;
}): Promise<AgentResult> {
  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('file_inspection_report', {
    p_inspection: input.inspectionId,
    p_notes: input.notes || null,
    p_photos: input.photos ?? null,
    p_video: input.videoUrl || null,
    p_selfie: input.selfieUrl || null,
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not file that report.') };
  revalidatePath('/agent/requests');
  return { ok: true };
}

/**
 * Take an inspection off the open board.
 *
 * NO ARGUMENT SAYS WHO IS CLAIMING. The RPC reads `auth.uid()`, so an agent
 * cannot claim on somebody else's behalf by editing a request   which matters
 * more here than usual, because claiming moves `escrow_holds.payee_id` and is
 * therefore a write about money.
 *
 * THE TWO REFUSALS MEAN DIFFERENT THINGS and the RPC words them differently on
 * purpose: "somebody already took this one" is bad luck and the board will have
 * other work on it, while "you have already had this one" is permanent. Both
 * arrive here as the RPC's own sentence, which is why `userMessage` passes them
 * through   see lib/errors.
 */
export async function claimInspection(inspectionId: string): Promise<AgentResult> {
  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('claim_inspection', { p_inspection: inspectionId });

  if (error) return { ok: false, error: userMessage(error, 'We could not take that one.') };
  revalidatePath('/agent/requests');
  return { ok: true };
}

/**
 * Hand one back before the time, rather than not turning up.
 *
 * The agent loses it either way   `release_inspection_claim` forfeits their
 * claim whoever calls it, so this is not an escape from the one-shot rule. It
 * exists because an agent who knows at noon that they cannot make four o'clock
 * saves the student a wasted trip, and the platform would rather have that
 * hour's notice than punish them into silence.
 */
export async function releaseInspection(input: {
  inspectionId: string;
  reason?: string;
}): Promise<AgentResult> {
  const supabase = await createServerClient();
  const { error } = await rpc(supabase)('release_inspection_claim', {
    p_inspection: input.inspectionId,
    p_reason: input.reason?.trim() || 'the agent handed it back',
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not release that one.') };
  revalidatePath('/agent/requests');
  return { ok: true };
}
