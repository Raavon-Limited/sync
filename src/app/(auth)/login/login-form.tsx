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
import { readAppSurface } from '@/lib/pwa/use-install';
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
 *   desktop -> your dashboard. Signing in at a desk is an administrative act;
 *              you came to do something with your account.
 *   phone   -> /around. Home on a phone is the feed, the same place the bottom
 *              bar's Home tab and signing out both go. Opening the app and
 *              landing on a settings surface reads as the wrong screen.
 *
 * THE TEST IS THE SURFACE, NOT WHETHER THE APP IS INSTALLED. This asked
 * `readStandalone()`, which is true only when launched from the home screen
 * so signing in from Safari on a phone counted as desktop and got the
 * dashboard. Installing is a step most people never take, and the ones who have
 * not are still holding a phone. See readAppSurface.
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
    event_manager: '/organiser',
  };
  const dashboard = handle ? `/${handle}` : (roots[role ?? ''] ?? '/me');

  return readAppSurface() ? '/around' : dashboard;
}

/** What each hat is called, and where it lives. Mirrors RoleSwitcher. */
const ROLE_HOME: Record<string, { label: string; blurb: string; href: string }> = {
  student: { label: 'Student', blurb: 'Book rooms, order food, browse campus', href: '/me' },
  vendor: { label: 'Business', blurb: 'Your listings, orders and earnings', href: '/vendor' },
  landlord: { label: 'Landlord', blurb: 'Your properties, tenants and rent', href: '/landlord' },
  rider: { label: 'Rider', blurb: 'Your delivery queue and earnings', href: '/rider' },
  event_manager: {
    label: 'Organiser',
    blurb: 'Your events, tickets and door',
    href: '/organiser',
  },
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

type Step = 'email' | 'password' | 'otp';

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
  /* What the full-screen loader says, or null when it is not up. A string
     rather than a boolean because this form now sends people two places: into
     their dashboard, and out to signup. 'Signing you in…' over a redirect to a
     signup form would be the wrong sentence at the worst moment. */
  const [redirecting, setRedirecting] = useState<string | null>(null);
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

  /**
   * Where an address with no account goes.
   *
   * Same as `signupHref` plus `noaccount`, which is what makes the signup page
   * say WHY somebody arrived there. Without it the redirect is silent and the
   * person is left on a form they did not ask for, working out for themselves
   * that their email was not recognised   which is the confusion this whole
   * path exists to remove.
   *
   * The address is passed explicitly rather than read from state: this is
   * called from inside the submit handler, and `email` there is the value that
   * was validated a few lines above.
   */
  function noAccountHref(value: string): string {
    const q = new URLSearchParams();
    if (next) q.set('next', next);
    q.set('email', value);
    q.set('noaccount', '1');
    return `/signup?${q.toString()}`;
  }

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
        /*
         * Straight to signup, not a panel on this screen offering to go there.
         *
         * The interstitial version told them the account did not exist and
         * then asked them to click a button to act on it   which is a screen
         * whose only purpose is to be left. There is exactly one useful thing
         * to do with "no account for this address", so do it.
         *
         * `redirecting` stays set through the push: the loader covers the
         * navigation rather than letting the email form flash back to idle,
         * which reads as "nothing happened". Nothing sets it false, because
         * this page is being replaced.
         */
        setRedirecting('Taking you to sign up…');
        router.push(noAccountHref(value));
        return;
      }
      if (method === 'otp') {
        // Show the OTP boxes regardless; still attempt to send the code.
        setStep('otp');
        const res = await sendLoginOtp(value);
        if (res.ok) setCooldown(RESEND_COOLDOWN);
        toast(res.ok ? 'Sign-in code sent   check your email.' : res.error);
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
    setRedirecting('Signing you in…');
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
    toast('Sign-in code sent   check your email.');
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
    setRedirecting('Signing you in…');
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
    setRedirecting('Signing you in…');
    try {
      await switchRole(role);
    } catch (e) {
      setRedirecting(null);
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
          <BrandLoader label={redirecting} />
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
                box   offering the escape hatch a screen earlier is offering it
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

        <p className="text-content-muted text-center text-sm">
          Don&rsquo;t have an account?{' '}
          <Link href={signupHref} className="text-lime-deep font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </>
  );
}
