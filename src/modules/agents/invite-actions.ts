/**
 * Redeeming an agent invitation.
 *
 * THE SAME SHAPE AS THE CONSOLE ONE, AND FOR THE SAME REASONS
 *   The token is the credential: it reached one mailbox and nowhere else, so
 *   holding it IS the demonstration of control that a confirmation email would
 *   otherwise ask for. Every check that matters runs inside
 *   `accept_agent_invite`, in the database, against `auth.uid()` - never
 *   against anything the browser sends alongside the token.
 *
 * AN EXISTING ACCOUNT IS NEVER GIVEN A NEW PASSWORD
 *   That would turn a forwarded invitation into an account takeover of whoever
 *   owns the address. Somebody who already has a Sync account signs in first
 *   and accepts as themselves, which is the second path below.
 */
'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { userMessage } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';

/** agent_invites postdates the checked-in generated types. REGENERATE. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

export interface AgentInvitePreview {
  valid: boolean;
  reason?: string;
  email?: string;
  /** They already have an account, so they sign in rather than set a password. */
  hasAccount?: boolean;
}

/**
 * What the landing page can say before anybody types anything.
 *
 * Read with the service role, which a browser cannot and must not do: the
 * invites table is staff-readable and the token column is never selected by
 * the app except here and at creation.
 */
export async function previewAgentInvite(token: string): Promise<AgentInvitePreview> {
  if (!token) return { valid: false, reason: 'No invite token in the link.' };

  try {
    const admin = createAdminClient();
    const { data } = await loose(admin)
      .from('agent_invites')
      .select('email, expires_at, accepted_at, revoked_at')
      .eq('token', token)
      .maybeSingle();

    const inv = data as Row | null;
    if (!inv) return { valid: false, reason: 'This invite link is not valid.' };
    if (inv.accepted_at) return { valid: false, reason: 'This invite has already been used.' };
    if (inv.revoked_at) return { valid: false, reason: 'This invite was cancelled.' };
    if (new Date(inv.expires_at as string) <= new Date()) {
      return { valid: false, reason: 'This invite has expired. Ask for a new one.' };
    }

    const email = inv.email as string;
    let hasAccount = true;
    try {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      hasAccount = (list?.users ?? []).some((u) => u.email?.toLowerCase() === email.toLowerCase());
    } catch {
      // FAILS CLOSED: an error answers "yes", which sends them down the sign-in
      // path rather than trying to create a duplicate account.
      hasAccount = true;
    }

    return { valid: true, email, hasAccount };
  } catch (e) {
    console.error('[agent-invite] preview failed:', e);
    return { valid: false, reason: 'We could not check this invite. Try the link again.' };
  }
}

export type AcceptResult = { ok: true; redirect: string } | { ok: false; error: string };

/** Create the account, sign in, take the role. */
export async function acceptAgentInvite(token: string, password: string): Promise<AcceptResult> {
  if (password.length < 8) {
    return { ok: false, error: 'Use at least 8 characters.' };
  }

  const preview = await previewAgentInvite(token);
  if (!preview.valid || !preview.email) {
    return { ok: false, error: preview.reason ?? 'This invite link is not valid.' };
  }
  if (preview.hasAccount) {
    return {
      ok: false,
      error: `${preview.email} already has a Sync account. Sign in with it, then open this link again.`,
    };
  }

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email: preview.email,
    password,
    // Sound because the token reached this address and nowhere else.
    email_confirm: true,
  });

  if (createError) {
    console.error('[agent-invite] createUser failed:', createError);
    return { ok: false, error: userMessage(createError, 'We could not create your account.') };
  }

  // Signed in first, so the accept below runs AS them: the RPC reads auth.uid()
  // and compares the confirmed address to the one invited.
  const supabase = await createServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: preview.email,
    password,
  });
  if (signInError) {
    return {
      ok: false,
      error: 'Your account was created. Sign in with your new password to finish joining.',
    };
  }

  return finishAcceptance(token);
}

/** Accept as somebody who is ALREADY signed in with the invited address. */
export async function acceptAgentInviteSignedIn(token: string): Promise<AcceptResult> {
  return finishAcceptance(token);
}

async function finishAcceptance(token: string): Promise<AcceptResult> {
  const supabase = await createServerClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc('accept_agent_invite', { p_token: token });
  if (error) {
    return { ok: false, error: userMessage(error, 'We could not finish joining.') };
  }
  return { ok: true, redirect: '/agent' };
}
