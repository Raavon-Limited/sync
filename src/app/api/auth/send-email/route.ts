/**
 * Supabase Send Email Hook → Resend.
 *
 * Supabase calls this endpoint (signed, Standard Webhooks) whenever it needs to
 * send an auth email. We render our own template (src/emails) and deliver it via
 * Resend, so the email is fully owned by the codebase. Returning 200 tells
 * Supabase the email was handled; a non-2xx makes it surface an error.
 *
 * Setup (Supabase Dashboard → Authentication → Hooks → Send Email Hook):
 *   - Enable, URL = https://<your-deploy>/api/auth/send-email
 *   - Copy the signing secret into SEND_EMAIL_HOOK_SECRET (v1,whsec_…)
 *   - Set RESEND_API_KEY and EMAIL_FROM (a Resend-verified sender)
 *
 * THE HOOK URL IS ONE GLOBAL SETTING, which surprises people: Supabase calls
 * whatever URL is configured in the dashboard no matter where the sign-in was
 * started. So a code request typed into localhost:3000 is still delivered by
 * the DEPLOYED endpoint, using the DEPLOYED environment. Setting
 * RESEND_API_KEY in .env.local changes nothing about it, and this route not
 * being reachable on localhost is why - Supabase cannot call your machine
 * without a tunnel (e.g. ngrok).
 *
 * When "Error sending magic link email" appears in the app, that is Supabase
 * reporting a non-2xx from HERE. The reason is in this function's logs, never
 * in the browser.
 */
import { createElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { Webhook } from 'standardwebhooks';
import { OtpEmail } from '@/emails/otp-email';

export const runtime = 'nodejs';

type HookPayload = {
  user: { email: string };
  email_data: {
    token: string;
    token_hash: string;
    email_action_type: string;
    redirect_to: string;
    site_url: string;
  };
};

export async function POST(req: Request) {
  const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  // EMAIL_FROM is the real setting; this fallback only covers a misconfigured
  // deploy. It was `no-reply@sync.ng` - a domain we no longer use, which Resend
  // would reject as an unverified sender, so a missing EMAIL_FROM failed with a
  // sender error rather than anything that names the actual problem.
  // NOTE: letsyncyou.com must be a verified domain in Resend for this to send.
  const from = process.env.EMAIL_FROM ?? 'Sync <no-reply@letsyncyou.com>';
  // Every failure below is LOGGED as well as returned. Supabase collapses any
  // non-2xx from this endpoint into one message to the user - "Error sending
  // magic link email" - which names neither the cause nor this route, so
  // without a server-side log there is nothing to debug from. These lines are
  // what turn that into an answer; read them in the Vercel function logs.
  if (!hookSecret || !apiKey) {
    console.error(
      '[send-email] not configured. Missing:',
      [!apiKey && 'RESEND_API_KEY', !hookSecret && 'SEND_EMAIL_HOOK_SECRET']
        .filter(Boolean)
        .join(', '),
    );
    return Response.json({ error: 'Email hook not configured' }, { status: 500 });
  }

  const body = await req.text();
  const headers = Object.fromEntries(req.headers);

  let payload: HookPayload;
  try {
    const wh = new Webhook(hookSecret.replace('v1,whsec_', ''));
    payload = wh.verify(body, headers) as HookPayload;
  } catch (e) {
    // Almost always a SEND_EMAIL_HOOK_SECRET that does not match the one in
    // Supabase → Authentication → Hooks, or a stale one after rotating it.
    console.error('[send-email] signature verification failed:', e);
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { user, email_data } = payload;
  const code = email_data.token;

  // The hook fires for EVERY auth email Supabase sends, and they are not the
  // same message. A password reset arriving as "Your Sync code is 481920" tells
  // somebody who asked to change their password nothing about how to do it —
  // and reads like a phishing attempt, which is the one impression a security
  // email must not give. The action type is the only thing that distinguishes
  // them, so it is what the subject line branches on.
  const isRecovery = email_data.email_action_type === 'recovery';
  const subject = isRecovery
    ? `Reset your Sync password — code ${code}`
    : `Your Sync code is ${code}`;

  try {
    const html = await render(createElement(OtpEmail, { code }));
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: user.email,
      subject,
      html,
    });
    if (error) {
      // The usual one is an unverified sender: `from` must be on a domain
      // verified in Resend, and Resend's free tier will only deliver to your
      // own account address until a domain is verified. The message from
      // Resend says which, so log it verbatim.
      console.error('[send-email] Resend rejected the send. from=%s error=%o', from, error);
      return Response.json({ error: error.message }, { status: 502 });
    }
  } catch (e) {
    console.error('[send-email] send threw. from=%s error=%o', from, e);
    return Response.json({ error: e instanceof Error ? e.message : 'Send failed' }, { status: 502 });
  }

  return Response.json({});
}
