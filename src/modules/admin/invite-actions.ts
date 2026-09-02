/**
 * Server Actions for console invitations   creating them, delivering them, and
 * redeeming them into an account.
 *
 * THE SHAPE IS DELIBERATELY THE SAME AS modules/storefronts/invite-actions.
 * That flow already answers the hard question this one asks: how does somebody
 * with no account end up signed in, with a confirmed email, holding exactly
 * the access they were offered? Two flows that solve it two different ways
 * would be two sets of edge cases to get right.
 *
 * WHY REDEMPTION IS AN ACTION AND NOT AN RPC
 *   `accept_staff_invite` is the whole story for somebody who already has an
 *   account, and that is all it does. The case this file exists for is the
 *   person who has NOT got one: they need a user created, their email marked
 *   confirmed, and a session established before the accept can run as them.
 *   Those are Auth-admin operations no database function can perform.
 *
 * NO PASSWORD IS EVER EMAILED. The link is single-use, expires, and is bound
 * to one address; the recipient chooses their own password on the way in, so
 * the only person who ever knows it is the person using it.
 */
'use server';

import { createElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { StaffInviteEmail } from '@/emails/staff-invite-email';
import { SITE, canonicalOrigin } from '@/config/site';
import { userMessage } from '@/lib/errors';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { isStaffRole } from '@/modules/admin/guard';
import { ADMIN_AREAS } from '@/modules/access/areas';
import type { Row } from '@/lib/supabase/row';

/**
 * staff_invites postdates the checked-in generated types. REGENERATE once
 * 20260903090000 is applied and this goes   the access-roles tables above it
 * needed the same thing and no longer do.
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/** The link a recipient clicks. Built in one place so the email and the
 *  copyable link in the console can never point somewhere different. */
function joinUrl(token: string): string {
  return `${canonicalOrigin()}/staff-invite?token=${encodeURIComponent(token)}`;
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const supabase = await createServerClient();
  const call = supabase.rpc.bind(supabase) as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  return call(name, args);
}

/** Staff, or nothing happens. The database re-checks   and insists on a super
 *  admin, which this does not restate for the reason given in actions.ts. */
async function assertStaff(): Promise<void> {
  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) throw new Error('Not authorised');
}

export type InviteStaffResult =
  /** They already had an account, so there was nothing to invite them to. */
  | { kind: 'granted'; name: string }
  /** A link now exists. `emailed` says whether we managed to send it. */
  | { kind: 'invited'; email: string; link: string; emailed: boolean; emailError?: string };

/**
 * Bring somebody into the console.
 *
 * TWO PATHS, AND WHICH ONE YOU GET IS NOT A CHOICE THE SENDER MAKES.
 *   An address with an account is granted access directly   there is nothing
 *   to create, and mailing them a "set your password" link for a password they
 *   already have would be a phishing lesson we taught ourselves.
 *
 *   An address without one gets an invitation. This is the case the old screen
 *   refused outright, and refusing it is what made hiring a reviewer a
 *   three-step errand through a signup form.
 *
 * THE ROLE RIDES ALONG EITHER WAY, so nobody is ever briefly an unrestricted
 * admin waiting to be narrowed down.
 */
export async function inviteStaff(input: {
  email: string;
  roleId?: string | null;
}): Promise<InviteStaffResult> {
  await assertStaff();

  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error('Enter an email address');

  const { findAccountByEmail } = await import('@/modules/admin/staff');
  const existing = await findAccountByEmail(email);

  if (existing) {
    const { setAccountRole, setRoleMembership } = await import('@/modules/admin/actions');
    await setAccountRole({ userId: existing.id, role: 'admin' });
    if (input.roleId) {
      await setRoleMembership({ roleId: input.roleId, userId: existing.id, member: true });
    }
    revalidatePath('/admin/staff');
    return { kind: 'granted', name: existing.name };
  }

  // Returns the token exactly once. It is not readable again   see
  // modules/admin/invites for why.
  const { data, error } = await rpc('create_staff_invite', {
    p_email: email,
    p_role: input.roleId ?? null,
  });
  if (error) throw new Error(userMessage(error, 'We could not create that invitation.'));

  // invite_token, not token: the OUT columns are named apart from the table's
  // own or the RETURNING inside the function is ambiguous. See the migration.
  const row = (Array.isArray(data) ? data[0] : data) as Row | null;
  const token = row?.invite_token as string | undefined;
  if (!token) throw new Error('The invitation was not created. Try again.');

  const link = joinUrl(token);
  const sent = await sendStaffInvite({ email, link, roleId: input.roleId ?? null });

  revalidatePath('/admin/staff');
  return {
    kind: 'invited',
    email,
    link,
    emailed: sent.ok,
    emailError: sent.ok ? undefined : sent.error,
  };
}

/**
 * Deliver it. Emailing the link IS the feature   the copyable link in the
 * console is the fallback for when this fails, not the way it is meant to work.
 *
 * SPLIT FROM CREATION, and a failure here does not undo the invite. The
 * invitation still exists and the link is still recoverable, which is the
 * difference between "email is broken" and "you cannot hire anybody today".
 *
 * IT REPORTS WHAT ACTUALLY WENT WRONG, VERBATIM.
 *   The first cut returned the same sentence   "We could not send the email"  
 *   for a missing API key, a rejection from Resend and an exception in
 *   rendering. Three unrelated faults with three different fixes, wearing one
 *   message, and the real reason went only to the server log where the person
 *   looking at the screen cannot see it. Diagnosing a live failure meant
 *   guessing.
 *
 *   This screen is super-admin-only, so the provider's own words are safe to
 *   put on it and are worth more than anything paraphrased. `stage` says which
 *   of the three failed, because that alone narrows the fix.
 */
async function sendStaffInvite(input: {
  email: string;
  link: string;
  roleId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `${SITE.name} <no-reply@letsyncyou.com>`;

  if (!apiKey) {
    console.error('[staff-invite] RESEND_API_KEY missing   invite created but not emailed');
    return {
      ok: false,
      error:
        'RESEND_API_KEY is not set in this environment, so nothing was sent. Copy the link below.',
    };
  }

  // What the role actually opens, in the words the console uses, so the
  // recipient can see the shape of the job before accepting it.
  let roleName: string | null = null;
  let areas: string[] = [];
  if (input.roleId) {
    const admin = createAdminClient();
    const [{ data: role }, { data: grants }] = await Promise.all([
      admin.from('access_roles').select('name').eq('id', input.roleId).maybeSingle(),
      admin.from('access_grants').select('area').eq('role_id', input.roleId),
    ]);
    roleName = ((role as Row | null)?.name as string) ?? null;
    const keys = new Set(((grants ?? []) as Row[]).map((g) => g.area as string));
    areas = ADMIN_AREAS.filter((a) => keys.has(a.key)).map((a) => a.label);
  }

  const invitedBy = (await getCurrentUser())?.email ?? SITE.name;

  // Which step we are on, so a thrown exception can say where it came from.
  // Rendering and sending fail for entirely different reasons and the stack
  // alone does not make that obvious in a server-action log.
  let stage: 'rendering the email' | 'sending the email' = 'rendering the email';

  try {
    const html = await render(
      createElement(StaffInviteEmail, {
        invitedBy,
        roleName,
        areas,
        joinUrl: input.link,
        expiresIn: '10 minutes',
      }),
    );

    stage = 'sending the email';
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: input.email,
      subject: `You have been invited to the ${SITE.name} admin console`,
      html,
    });

    if (error) {
      // The usual causes are an unverified sender domain, a key without send
      // permission, or a `from` that is not on a domain this account owns  
      // and Resend names which. Passing that through is the difference between
      // a fixable report and "it did not work".
      console.error('[staff-invite] Resend rejected the send. from=%s error=%o', from, error);
      const detail = [error.name, error.message].filter(Boolean).join(': ');
      return { ok: false, error: `Resend refused it (from ${from})   ${detail}` };
    }
  } catch (e) {
    console.error('[staff-invite] send threw while %s:', stage, e);
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed while ${stage}: ${detail}` };
  }

  return { ok: true };
}

/** Cancel an invitation that has not been accepted. The token stops working. */
export async function cancelStaffInvite(input: { id: string }): Promise<void> {
  await assertStaff();
  const { error } = await rpc('revoke_staff_invite', { p_id: input.id });
  if (error) throw new Error(userMessage(error, 'We could not cancel that invitation.'));
  revalidatePath('/admin/staff');
}

export interface StaffInvitePreview {
  valid: boolean;
  /** Why not, in words the recipient can act on. */
  reason?: string;
  email?: string;
  roleName?: string | null;
  /** What the role opens   the shape of the job, before accepting it. */
  areas?: string[];
  /** True when this address already has a Sync account: they sign in instead. */
  hasAccount?: boolean;
}

/**
 * What is behind this token, for the accept screen.
 *
 * Safe to show whoever holds it   they were sent it. It returns the invited
 * address so the screen can say which one this is: people forward these, and
 * accepting as the wrong person is the mistake that prevents.
 */
export async function previewStaffInvite(token: string): Promise<StaffInvitePreview> {
  if (!token) return { valid: false, reason: 'No invite token in the link.' };

  try {
    const admin = db();
    const { data, error } = await admin
      .from('staff_invites')
      .select('email, role_id, expires_at, accepted_at, revoked_at')
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    const inv = data as Row | null;

    if (!inv) return { valid: false, reason: 'This invite link is not valid.' };
    if (inv.accepted_at) return { valid: false, reason: 'This invite has already been used.' };
    if (inv.revoked_at) return { valid: false, reason: 'This invite was cancelled.' };
    if (new Date(inv.expires_at as string) <= new Date()) {
      return { valid: false, reason: 'This invite has expired. Ask for a new one.' };
    }

    let roleName: string | null = null;
    let areas: string[] = [];
    if (inv.role_id) {
      const [{ data: role }, { data: grants }] = await Promise.all([
        admin.from('access_roles').select('name').eq('id', inv.role_id).maybeSingle(),
        admin.from('access_grants').select('area').eq('role_id', inv.role_id),
      ]);
      roleName = ((role as Row | null)?.name as string) ?? null;
      const keys = new Set(((grants ?? []) as Row[]).map((g) => g.area as string));
      areas = ADMIN_AREAS.filter((a) => keys.has(a.key)).map((a) => a.label);
    }

    return {
      valid: true,
      email: inv.email as string,
      roleName,
      areas,
      hasAccount: await emailHasAccount(inv.email as string),
    };
  } catch (e) {
    console.error('[staff-invite] preview failed:', e);
    return { valid: false, reason: 'We could not check this invite. Try the link again.' };
  }
}

/**
 * Whether an address already has an account.
 *
 * FAILS CLOSED: an error answers "yes", which sends the recipient down the
 * sign-in path rather than trying to create a duplicate account.
 */
async function emailHasAccount(email: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('email_has_account', { p_email: email });
    if (error) throw error;
    return !!data;
  } catch (e) {
    console.error('[staff-invite] account lookup failed:', e);
    return true;
  }
}

export type RedeemStaffResult = { ok: true; redirect: string } | { ok: false; error: string };

/**
 * Create the account behind an invitation, set the chosen password, and accept
 *   in that order, because each step needs the one before it.
 *
 * THE TOKEN IS REVALIDATED HERE rather than trusted from the preview. The
 * preview is a screen; this is the boundary, and a client that skipped
 * straight here with a cancelled token has to be refused.
 */
export async function redeemStaffInvite(input: {
  token: string;
  password: string;
}): Promise<RedeemStaffResult> {
  const { token, password } = input;

  if (!token) return { ok: false, error: 'No invite token in the link.' };
  if (!password || password.length < 8) {
    return { ok: false, error: 'Choose a password of at least 8 characters.' };
  }

  const admin = db();

  const { data: inviteRow, error: inviteError } = await admin
    .from('staff_invites')
    .select('email, expires_at, accepted_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (inviteError) {
    console.error('[staff-invite] redeem lookup failed:', inviteError);
    return { ok: false, error: 'We could not check this invite. Try again.' };
  }

  const invite = inviteRow as Row | null;
  if (!invite) return { ok: false, error: 'This invite link is not valid.' };
  if (invite.accepted_at) return { ok: false, error: 'This invite has already been used.' };
  if (invite.revoked_at) return { ok: false, error: 'This invite was cancelled.' };
  if (new Date(invite.expires_at as string) <= new Date()) {
    return { ok: false, error: 'This invite has expired. Ask for a new one.' };
  }

  const email = String(invite.email).toLowerCase();

  // We do NOT set an existing user's password from an invite link. That would
  // turn a forwarded invitation into an account takeover of whoever owns the
  // address.
  if (await emailHasAccount(email)) {
    return {
      ok: false,
      error: `${email} already has a Sync account. Sign in with it, then open this link again.`,
    };
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // Sound because the token reached this address and nowhere else: holding
    // it IS the demonstration of control a confirmation email would ask for.
    email_confirm: true,
  });

  if (createError) {
    console.error('[staff-invite] createUser failed:', createError);
    return { ok: false, error: userMessage(createError, 'We could not create your account.') };
  }

  // Sign in, so the accept below runs as them and the RPC's confirmed-email
  // check has a session to look at.
  const supabase = await createServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error('[staff-invite] sign-in after create failed:', signInError);
    return {
      ok: false,
      error: 'Your account was created. Sign in with your new password to finish joining.',
    };
  }

  const { error: acceptError } = await rpc('accept_staff_invite', { p_token: token });
  if (acceptError) {
    return {
      ok: false,
      error: userMessage(acceptError, 'Your account is ready, but joining the console failed.'),
    };
  }

  return { ok: true, redirect: '/admin' };
}

/**
 * Accept as somebody who is ALREADY signed in.
 *
 * The other half of the flow: an address that already has an account gets no
 * password step, because they have one. All that is left is the accept, which
 * the database does entirely   including refusing a session whose confirmed
 * email is not the invited one.
 */
export async function acceptStaffInvite(token: string): Promise<RedeemStaffResult> {
  if (!token) return { ok: false, error: 'No invite token in the link.' };

  const { error } = await rpc('accept_staff_invite', { p_token: token });
  if (error) {
    return { ok: false, error: userMessage(error, 'We could not accept that invitation.') };
  }
  return { ok: true, redirect: '/admin' };
}
