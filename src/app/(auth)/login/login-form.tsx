/**
 * LoginForm - email-first, adaptive sign-in.
 *
 * Step 1: enter email. We detect the account type (getLoginMethod):
 *   - no account at all → say so and offer signup, with the address carried
 *   - students / vendors  → reveal a PASSWORD field (signIn)
 *   - admins / super_admins (passwordless) → email a code + show OTP boxes
 *
 * Detection falls back to "password" whenever the backend cannot answer, so a
 * bad moment never tells a real account holder to go and sign up, and there's
 * still a manual "use an email code" fallback. Both paths route by the trusted
 * role. `next` resumes the requested page.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { readStandalone } from '@/lib/pwa/use-install';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { OtpInput } from '@/components/ui/otp-input';
import { FormField } from '@/components/forms';
import { EmailInput } from '@/components/forms/email-input';
import { toast } from '@/components/ui/toast';
import { BrandLoader } from '@/components/ui/brand-loader';
import { FullScreenOverlay } from '@/components/ui/full-screen-overlay';
import {
  getLoginMethod,
  sendLoginOtp,
  signIn,
  switchRole,
  verifyLoginOtp,
} from '@/modules/auth/actions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Matches Supabase's default OTP resend window, so resends never hit its limit.
const RESEND_COOLDOWN = 60;

/**
 * Where signing in lands you.
 *
 * Everyone has a dashboard and it is reachable everywhere - the header's user
 * menu on desktop, the hamburger drawer inside the dashboard itself, and the
 * bottom bar's "You" tab on mobile. What differs is only the DEFAULT landing
 * spot, and it differs by surface rather than by role:
 *
 *   web     -> your dashboard. Signing in on a website is an administrative
 *              act; you came to do something with your account.
 *   PWA     -> /around. Home in the installed app is the feed, the same place
 *              the bottom bar's Home tab and signing out both go. Opening an
 *              app from the home screen and landing on a settings surface
 *              reads as the wrong screen.
 *
 * Students used to land on /around on BOTH, which meant the web had no route
 * into the dashboard except hunting for the user menu.
 *
 * Admins are exempt: /admin is their only surface, so there is no second
 * destination to choose between.
 */
function destFor(role: string | undefined, handle?: string, next?: string) {
  // An explicit ?next= always wins - it is the page they actually asked for.
  if (next) return next;
  if (role === 'admin' || role === 'super_admin') return '/admin';

  // The personalised handle root (/<name>). The proxy rewrites it to the right
  // per-type dashboard - /me, /vendor, /landlord - so we never hardcode the
  // wrong one.
  //
  // The fallback, for an account with no handle yet, has to name the role's own
  // root EXPLICITLY. The proxy gates each dashboard prefix by role
  // (`/me` -> student, `/vendor` -> vendor, `/landlord` -> landlord), so a
  // catch-all of '/me' would bounce a landlord straight back out of the page we
  // had just sent them to.
  const roots: Record<string, string> = {
    vendor: '/vendor',
    landlord: '/landlord',
    rider: '/rider',
  };
  const dashboard = handle ? `/${handle}` : (roots[role ?? ''] ?? '/me');

  return readStandalone() ? '/around' : dashboard;
}

/** What each hat is called, and where it lives. Mirrors RoleSwitcher. */
const ROLE_HOME: Record<string, { label: string; blurb: string; href: string }> = {
  student: { label: 'Student', blurb: 'Book rooms, order food, browse campus', href: '/me' },
  vendor: { label: 'Business', blurb: 'Your listings, orders and earnings', href: '/vendor' },
  landlord: { label: 'Landlord', blurb: 'Your properties, tenants and rent', href: '/landlord' },
  rider: { label: 'Rider', blurb: 'Your delivery queue and earnings', href: '/rider' },
};

/**
 * Should we ask which account they want?
 *
 * Only when the account genuinely holds more than one hat we can land on.
 * Signing in wearing whichever role happened to be worn last is a coin flip for
 * a multi-role account, and lands half of them on the wrong dashboard - which
 * is what happened here: a landlord signed in and got the vendor handle.
 *
 * One role means no question to ask, so it never appears for the overwhelming
 * majority of accounts. Staff are excluded: /admin is their only surface.
 */
function offerRoleChoice(roles?: string[]): boolean {
  return (roles ?? []).filter((r) => ROLE_HOME[r]).length > 1;
}

type Step = 'email' | 'password' | 'otp' | 'unknown';

export function LoginForm({ next, email: initialEmail }: { next?: string; email?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Stays true from a successful auth until this page is replaced - keeps the
  // full-screen "Signing you in…" loader up through router.push + refresh, so
  // it never flashes back to an idle form (which reads as "nothing happened").
  const [redirecting, setRedirecting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  /**
   * The hats to choose between, when the account holds more than one.
   *
   * The session is ALREADY established by this point - authentication has
   * succeeded and only the destination is open. So this is a routing question,
   * not a second auth step, and picking simply decides which dashboard to open.
   */
  const [choices, setChoices] = useState<string[] | null>(null);

  /**
   * /signup, carrying whatever we already know. The email is the point: this
   * link is offered right after someone typed an address we have no account
   * for, and making them retype it there is the whole complaint in miniature.
   */
  const signupHref = (() => {
    const q = new URLSearchParams();
    if (next) q.set('next', next);
    const value = email.trim();
    if (value) q.set('email', value);
    const qs = q.toString();
    return qs ? `/signup?${qs}` : '/signup';
  })();

  // Tick the resend cooldown down to 0.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function continueFromEmail(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      toast('Enter a valid email.');
      return;
    }
    setBusy(true);
    try {
      const { method } = await getLoginMethod(value);
      if (method === 'none') {
        setStep('unknown');
      } else if (method === 'otp') {
        // Show the OTP boxes regardless; still attempt to send the code.
        setStep('otp');
        const res = await sendLoginOtp(value);
        if (res.ok) setCooldown(RESEND_COOLDOWN);
        toast(res.ok ? 'Sign-in code sent — check your email.' : res.error);
      } else {
        setStep('password');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      toast('Enter your password.');
      return;
    }
    setBusy(true);
    const res = await signIn({ email: email.trim(), password });
    if (!res.ok) {
      setBusy(false);
      toast(res.error);
      return;
    }
    if (offerRoleChoice(res.roles)) {
      setBusy(false);
      setChoices(res.roles as string[]);
      return;
    }
    setRedirecting(true);
    router.push(destFor(res.role, res.handle, next));
    router.refresh();
  }

  async function sendCode() {
    if (cooldown > 0) return;
    setBusy(true);
    const res = await sendLoginOtp(email.trim());
    setBusy(false);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    setStep('otp');
    setCooldown(RESEND_COOLDOWN);
    toast('Sign-in code sent — check your email.');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) {
      toast('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    const res = await verifyLoginOtp({ email: email.trim(), code });
    if (!res.ok) {
      setBusy(false);
      toast(res.error);
      return;
    }
    if (offerRoleChoice(res.roles)) {
      setBusy(false);
      setChoices(res.roles as string[]);
      return;
    }
    setRedirecting(true);
    router.push(destFor(res.role, res.handle, next));
    router.refresh();
  }

  /**
   * They picked which account to open.
   *
   * switch_role makes it the WORN role, not just the destination, so the proxy
   * gate, RLS and every server render agree with where we are sending them. A
   * push without the switch would land a landlord on /landlord while
   * profiles.role still said vendor, and the gate would bounce them to /403.
   */
  async function chooseRole(role: string) {
    setChoices(null);
    setRedirecting(true);
    try {
      await switchRole(role);
    } catch (e) {
      setRedirecting(false);
      toast(e instanceof Error ? e.message : 'Could not open that account');
      return;
    }
    // The role root, not the handle: the handle is derived and the switch has
    // only just changed the role it derives from.
    router.replace(next ?? ROLE_HOME[role].href);
  }

  function changeEmail() {
    setStep('email');
    setPassword('');
    setCode('');
  }

  // The entered email, shown above the password/OTP step with a "Change" link.
  const emailRow = (
    <div className="border-line/10 flex items-center justify-between rounded-lg border px-3 py-2.5">
      <span className="text-content truncate text-sm">{email.trim()}</span>
      <button
        type="button"
        onClick={changeEmail}
        className="text-lime-deep ml-2 shrink-0 text-sm font-medium hover:underline"
      >
        Change
      </button>
    </div>
  );

  return (
    <>
      {/* Portalled, and it stays that way. This form renders inside the auth
          card, which used to carry a backdrop-blur - and a filtered element is
          a containing block for fixed positioning, so a plain `fixed inset-0`
          here covered the CARD rather than the screen.

          The blur is gone now (see auth-layout: it was flashing a lime seam),
          so `fixed` would happen to work again. The portal stays regardless:
          it does not depend on an ancestor's filter, transform or perspective,
          any of which would silently reintroduce the bug. */}
      {redirecting && (
        <FullScreenOverlay>
          <BrandLoader label="Signing you in…" />
        </FullScreenOverlay>
      )}
      <div className="flex flex-col gap-6">
        {/* Which account? Replaces the form entirely rather than sitting beside
            it: authentication is already done at this point, so there is
            nothing left to fill in and a form underneath would just be noise. */}
        {choices && (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-content text-sm font-medium">Which account?</p>
              <p className="text-content-muted mt-1 text-xs">
                This login holds more than one. You can switch at any time from the menu under your
                avatar.
              </p>
            </div>
            {choices
              .filter((r) => ROLE_HOME[r])
              .map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => void chooseRole(r)}
                  className="border-line/15 hover:border-accent-fg/50 hover:bg-ink/5 flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors"
                >
                  <span className="min-w-0">
                    <span className="text-content block text-sm font-medium">
                      {ROLE_HOME[r].label}
                    </span>
                    <span className="text-content-muted block text-xs">{ROLE_HOME[r].blurb}</span>
                  </span>
                  <ArrowRight className="text-content-muted h-4 w-4 shrink-0" />
                </button>
              ))}
          </div>
        )}

        {/* No account for this address.
            `getLoginMethod` used to answer 'password' for an email it had
            never seen, so this screen was a password box for an account that
            does not exist — you typed a password, got "invalid email or
            password", and were left to guess which half was wrong. The answer
            is the same either way, so say it plainly and offer the thing that
            actually helps. The address rides along to /signup so it is not
            typed twice. */}
        {!choices && step === 'unknown' && (
          <div className="flex flex-col gap-4">
            {emailRow}
            <div className="border-line/15 bg-panel rounded-xl border p-4">
              <p className="text-content text-sm font-medium">No account for this email</p>
              <p className="text-content-muted mt-1 text-xs">
                We couldn&rsquo;t find a Sync account for that address. Create one, or try the email
                you signed up with.
              </p>
            </div>
            <Button asChild size="lg" className="w-full">
              <Link href={signupHref}>Create an account</Link>
            </Button>
            <button
              type="button"
              onClick={changeEmail}
              className="text-content-muted hover:text-content text-center text-sm"
            >
              Use a different email
            </button>
          </div>
        )}

        {!choices && step === 'email' && (
          <form onSubmit={continueFromEmail} className="flex flex-col gap-4" noValidate>
            <FormField label="Email" htmlFor="email">
              {/* Neutral placeholder: login is shared by students, vendors,
                  landlords and admins, so a "@student.edu.ng" example is wrong
                  for most of the people who see it. */}
              <EmailInput
                id="email"
                autoFocus
                placeholder="you@gmail.com"
                value={email}
                onChange={setEmail}
              />
            </FormField>
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'Checking…' : 'Continue'}
            </Button>
          </form>
        )}

        {!choices && step === 'password' && (
          <form onSubmit={submitPassword} className="flex flex-col gap-4" noValidate>
            {emailRow}
            <FormField label="Password" htmlFor="password">
              <PasswordInput
                id="password"
                autoComplete="current-password"
                autoFocus
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
              />
            </FormField>
            {/* Here, not on the email step. Somebody only discovers they have
                forgotten their password once they are looking at the password
                box — offering the escape hatch a screen earlier is offering it
                before anyone needs it. The address is carried across so they
                do not type it twice. */}
            <Link
              href={`/forgot-password?email=${encodeURIComponent(email)}`}
              className="text-content-muted hover:text-content -mt-2 self-end text-sm"
            >
              Forgot password?
            </Link>
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'Logging in…' : 'Log in'}
            </Button>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="text-content-muted hover:text-content text-center text-sm disabled:opacity-50"
            >
              Sign in with an email code instead
            </button>
          </form>
        )}

        {!choices && step === 'otp' && (
          <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
            {emailRow}
            <FormField label="Sign-in code" htmlFor="otp">
              <OtpInput value={code} onChange={setCode} autoFocus disabled={busy} />
            </FormField>
            <Button type="submit" size="lg" disabled={busy || code.length < 6} className="w-full">
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </Button>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy || cooldown > 0}
              className="text-lime-deep text-center text-sm font-medium hover:underline disabled:no-underline disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </form>
        )}

        {/* Not on the 'unknown' step: that screen is already a "create an
            account" button and this line under it would be the same offer
            twice, in weaker words. */}
        {step !== 'unknown' && (
          <p className="text-content-muted text-center text-sm">
            Don&rsquo;t have an account?{' '}
            <Link href={signupHref} className="text-lime-deep font-medium hover:underline">
              Sign up
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
