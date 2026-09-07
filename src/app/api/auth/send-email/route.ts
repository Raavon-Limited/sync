/**
 * Supabase Send Email Hook → Resend.
 *
 * ⚠ NOT THE LIVE PATH. Auth email is delivered by CUSTOM SMTP (Resend), set in
 * Supabase Dashboard → Project Settings → Authentication → SMTP Settings. This
 * route is written and working but the hook is DISABLED, so nothing calls it.
 *
 * WHY SMTP WON, so nobody "finishes" this by switching it on:
 *   Both routes mail through Resend from hello@letsyncyou.com, so deliverability
 *   is identical - which was the actual problem. Before either existed, auth
 *   email used Supabase's built-in sender: a Supabase-owned address on shared
 *   infrastructure, covered by none of this domain's DKIM/SPF/DMARC, and
 *   rate-limited to single digits per hour. That is why sign-in codes were
 *   landing in spam.
 *
 *   SMTP fixes that with no signing secret, no deploy-time environment and
 *   nothing that can half-work. This hook buys ONE further thing: the template
 *   in src/emails instead of the one in the dashboard.
 *
 * ENABLING THIS IS NOT ADDITIVE - IT IS A SWITCH.
 *   Turning the hook on replaces the email templates outright. If
 *   SEND_EMAIL_HOOK_SECRET and RESEND_API_KEY are not already set in the
 *   DEPLOYED environment, auth email does not fall back to SMTP - it fails, and
 *   nobody can sign in. Set the variables and redeploy FIRST, then enable.
 *
 * Setup, when that day comes (Supabase Dashboard → Authentication → Hooks):
 *   - Hook type HTTPS, not Postgres. This is an HTTPS endpoint.
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
import { MAIL_FROM, SITE } from '@/config/site';

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
  const from = process.env.EMAIL_FROM ?? MAIL_FROM;
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
  // somebody who asked to change their password nothing about how to do it
  // and reads like a phishing attempt, which is the one impression a security
  // email must not give. The action type is the only thing that distinguishes
  // them, so it is what the subject line branches on.
  const isRecovery = email_data.email_action_type === 'recovery';
  const subject = isRecovery
    ? `Reset your Sync password   code ${code}`
    : `Your Sync code is ${code}`;

  try {
    const html = await render(createElement(OtpEmail, { code }));
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: user.email,
      subject,
      html,
      // A code with no reply path is one of the shapes a filter reads as
      // phishing   and somebody who did not request it has nowhere to say so.
      // Every other Sync email carries this; the one that lands in spam most
      // is the one that did not.
      replyTo: SITE.support.help,
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
    return Response.json(
      { error: e instanceof Error ? e.message : 'Send failed' },
      { status: 502 },
    );
  }

  return Response.json({});
}
