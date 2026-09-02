/**
 * Server Actions for store invitations   delivering them, and redeeming them
 * into an account.
 *
 * WHY REDEMPTION IS A SERVER ACTION AND NOT AN RPC
 *   Accepting an invite is `accept_storefront_invite()`, one RPC, and it stays
 *   that way for somebody who already has an account. The case this file
 *   exists for is the person who has NOT got one: they need a user created,
 *   their email marked confirmed, a session established, and only then the
 *   accept. Three of those four are Auth-admin operations that no database
 *   function can perform.
 *
 * THE TOKEN IS THE PROOF OF MAILBOX CONTROL.
 *   `accept_storefront_invite` insists on a CONFIRMED email matching the
 *   invite, which is right   but a brand new account has no confirmed email
 *   and no way to get one without a second round of email. The invite token
 *   closes that loop: it was mailed to that address and nowhere else, so
 *   presenting it IS the demonstration that the holder reads that mailbox.
 *   That is the only reason `email_confirm: true` below is sound, and it is
 *   why the token is re-validated here (unexpired, unaccepted, unrevoked)
 *   before a user is created rather than trusting the caller.
 *
 * NO PASSWORD IS EVER EMAILED. See emails/invite-email.tsx for why. The
 * recipient sets their own on the way in, so the only person who ever knows it
 * is the person using it.
 */
'use server';

import { createElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { InviteEmail } from '@/emails/invite-email';
import { SITE, canonicalOrigin } from '@/config/site';
import { userMessage } from '@/lib/errors';
import { scopeLabel, type StaffScope } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;

export type InviteActionResult = { ok: true } | { ok: false; error: string };

// The link in the email and the copyable link in the dialog are built from the
// same helper, so the two can never disagree about where the invite points.

/**
 * Email an invitation that has already been created.
 *
 * SPLIT FROM CREATION ON PURPOSE. `create_storefront_invite` returns the token
 * exactly once and is the security boundary; this is delivery. If Resend is
 * down, the invite still exists and the owner can still copy the link by hand
 *   which is why a failure here is reported but does not undo anything.
 */
export async function sendInviteEmail(input: {
  token: string;
  email: string;
  storeName: string;
  scopes: StaffScope[];
}): Promise<InviteActionResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `${SITE.name} <no-reply@letsyncyou.com>`;

  if (!apiKey) {
    console.error('[invite] RESEND_API_KEY missing   invite created but not emailed');
    return { ok: false, error: 'Email is not configured. Copy the link and send it yourself.' };
  }

  // The sender's own business name, so the recipient recognises who is asking.
  // Falls back to the product name rather than leaking an email address.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let invitedBy = SITE.name;
  if (user) {
    const { data } = await supabase
      .from('vendor_profiles')
      .select('business_name')
      .eq('id', user.id)
      .maybeSingle();
    invitedBy = (data as Row)?.business_name || SITE.name;
  }

  const joinUrl = `${canonicalOrigin()}/vendor/join?token=${encodeURIComponent(input.token)}`;

  try {
    const html = await render(
      createElement(InviteEmail, {
        storeName: input.storeName,
        invitedBy,
        sections: input.scopes.map(scopeLabel),
        joinUrl,
        expiresIn: '7 days',
      }),
    );
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: input.email,
      subject: `${invitedBy} invited you to ${input.storeName} on ${SITE.name}`,
      html,
    });
    if (error) {
      // Usually an unverified sender domain in Resend. Log it verbatim   the
      // owner's copy of this message cannot say that usefully.
      console.error('[invite] Resend rejected the send. from=%s error=%o', from, error);
      return { ok: false, error: 'We could not send the email. Copy the link and send it yourself.' };
    }
  } catch (e) {
    console.error('[invite] send threw:', e);
    return { ok: false, error: 'We could not send the email. Copy the link and send it yourself.' };
  }

  return { ok: true };
}

export interface InvitePreview {
  valid: boolean;
  /** Why not, in words a recipient can act on. */
  reason?: string;
  email?: string;
  storeName?: string;
  sections?: string[];
  /** True when this address already has a Sync account   they sign in instead. */
  hasAccount?: boolean;
  expiresAt?: string;
}

/**
 * What is behind this token, for the join screen.
 *
 * Safe to expose to whoever holds the token: they were sent it. It returns the
 * invited email so the screen can show which address they are joining as  
 * people forward these, and accepting as the wrong person is the mistake this
 * prevents.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  if (!token) return { valid: false, reason: 'No invite token in the link.' };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('storefront_invites')
      .select('email, scopes, expires_at, accepted_at, revoked_at, storefront_id')
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    const inv = data as Row | null;

    if (!inv) return { valid: false, reason: 'This invite link is not valid.' };
    if (inv.accepted_at) return { valid: false, reason: 'This invite has already been used.' };
    if (inv.revoked_at) return { valid: false, reason: 'This invite was cancelled by the owner.' };
    if (new Date(inv.expires_at) <= new Date()) {
      return { valid: false, reason: 'This invite has expired. Ask the owner to send a new one.' };
    }

    const { data: store } = await admin
      .from('storefronts')
      .select('name')
      .eq('id', inv.storefront_id)
      .maybeSingle();

    // Whether they already have an account decides which screen they see:
    // "set a password" or "sign in to accept".
    return {
      valid: true,
      email: inv.email,
      storeName: (store as Row)?.name ?? 'a store',
      sections: ((inv.scopes ?? []) as string[]).map(scopeLabel),
      hasAccount: await emailHasAccount(inv.email),
      expiresAt: inv.expires_at,
    };
  } catch (e) {
    console.error('[invite] preview failed:', e);
    return { valid: false, reason: 'We could not check this invite. Try the link again.' };
  }
}

/**
 * Whether an address already has an account.
 *
 * Via an RPC rather than `auth.admin.listUsers()`, which has no lookup-by-email
 * and would mean paging the entire user table on every invite click. The
 * function is granted to the service role ONLY   it is an account-enumeration
 * oracle, which is precisely why it is not reachable from a browser. See
 * 20260901180000.
 *
 * Fails CLOSED: an error answers "yes, there is an account", which sends the
 * recipient down the sign-in path instead of trying to create a duplicate.
 */
async function emailHasAccount(email: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('email_has_account', { p_email: email });
    if (error) throw error;
    return !!data;
  } catch (e) {
    console.error('[invite] account lookup failed:', e);
    return true;
  }
}

export type RedeemResult = { ok: true; redirect: string } | { ok: false; error: string };

/**
 * Create the account behind an invite, set the password the recipient chose,
 * and accept the invitation   in that order, because each step needs the one
 * before it.
 *
 * REVALIDATES THE TOKEN ITSELF rather than trusting the preview. The preview
 * is a screen; this is the boundary, and a client that skipped straight here
 * with an expired token must be refused.
 */
export async function redeemInvite(input: {
  token: string;
  password: string;
}): Promise<RedeemResult> {
  const { token, password } = input;

  if (!token) return { ok: false, error: 'No invite token in the link.' };
  if (!password || password.length < 8) {
    return { ok: false, error: 'Choose a password of at least 8 characters.' };
  }

  const admin = createAdminClient();

  // 1. The invite has to be live. Re-read rather than trusting anything the
  //    client sent alongside the token.
  const { data: inviteRow, error: inviteError } = await admin
    .from('storefront_invites')
    .select('email, expires_at, accepted_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (inviteError) {
    console.error('[invite] redeem lookup failed:', inviteError);
    return { ok: false, error: 'We could not check this invite. Try again.' };
  }

  const invite = inviteRow as Row | null;
  if (!invite) return { ok: false, error: 'This invite link is not valid.' };
  if (invite.accepted_at) return { ok: false, error: 'This invite has already been used.' };
  if (invite.revoked_at) return { ok: false, error: 'This invite was cancelled by the owner.' };
  if (new Date(invite.expires_at) <= new Date()) {
    return { ok: false, error: 'This invite has expired. Ask the owner to send a new one.' };
  }

  const email = String(invite.email).toLowerCase();

  // 2. Create the account, or refuse politely if one already exists. We do NOT
  //    reset an existing user's password from an invite link   that would turn
  //    a forwarded invite into an account takeover of whoever owns that
  //    address.
  if (await emailHasAccount(email)) {
    return {
      ok: false,
      error: `${email} already has a Sync account. Sign in with it, then open this link again.`,
    };
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // Sound because the token was delivered to this address and nowhere else  
    // holding it is the demonstration of control that a confirmation email
    // would otherwise ask for. See the header.
    email_confirm: true,
  });

  if (createError) {
    console.error('[invite] createUser failed:', createError);
    return { ok: false, error: userMessage(createError, 'We could not create your account.') };
  }

  // 3. Sign in, so the accept below runs as them and
  //    `accept_storefront_invite` sees the matching confirmed email.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error('[invite] sign-in after create failed:', signInError);
    return {
      ok: false,
      error: 'Your account was created. Sign in with your new password to finish joining.',
    };
  }

  // 4. Accept. Runs with their session, so every check in the RPC applies.
  const { error: acceptError } = await supabase.rpc('accept_storefront_invite', {
    p_token: token,
  });
  if (acceptError) {
    return {
      ok: false,
      error: userMessage(acceptError, 'Your account is ready, but joining the store failed.'),
    };
  }

  return { ok: true, redirect: '/vendor/orders' };
}
