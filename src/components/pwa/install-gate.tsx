/**
 * InstallGate - in a browser tab, a SIGNED-OUT visitor browsing the app's own
 * routes is asked to install Sync to their home screen first.
 *
 * It never appears for:
 *   - the installed app (`display-mode: standalone`)
 *   - the public web pages and auth, listed in WEB_ROUTES
 *   - anyone who is signed in, anywhere - decided on the SERVER and passed in,
 *     never read from client session state (see the note by `signedIn` below)
 *
 * That last one is the difference between a gate and a wall. The web's job is
 * marketing plus your account: someone with an account is not a visitor to
 * convert, and their dashboard has to open in a browser.
 *
 * WEB_ROUTES plus the signed-in check are the whole policy.
 *
 * Two things to know about how this behaves:
 *
 *   - It is a CLIENT-side gate, not a security boundary. The HTML for a gated
 *     route is still sent; this hides it after hydration. That is deliberate
 *     (it keeps pages crawlable for SEO), but it means the gate must never be
 *     the only thing protecting private data - `proxy.ts` role gates and
 *     Supabase RLS are what actually enforce access.
 *   - On iOS it can only show INSTRUCTIONS. Safari has no install API, so the
 *     "Install" button below appears on Chromium only; iPhone users have to use
 *     Share -> Add to Home Screen themselves.
 */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Share, MoreVertical, Plus, Smartphone } from 'lucide-react';

import { useInstall } from '@/lib/pwa/use-install';
import { Button } from '@/components/ui/button';
import { SITE } from '@/config/site';

/**
 * Routes that stay open in a normal browser tab.
 *
 * Matched as prefixes, except '/' which must match exactly or it would open
 * everything.
 *
 * AUTH IS HERE NOW, and the reason it was not is worth recording. The gate used
 * to exclude /login and /signup on purpose: every student module is gated in
 * proxy.ts, so a signed-out visitor clicking a hostel is redirected
 * SERVER-SIDE to /login, and allowlisting /login meant that redirect landed on
 * a permitted page where the install prompt never appeared.
 *
 * That reasoning held right up until it made the product unusable: with auth
 * gated there is NO WAY to sign in on the web at all, so nobody can reach their
 * dashboard there - and the dashboard is meant to be the web's whole job. A
 * gate that blocks the front door does not convert visitors, it turns them
 * away.
 *
 * The gate still does its work on the case that matters: a signed-out visitor
 * BROWSING app routes (hostels, food, events) is still asked to install. What
 * it no longer does is stand between someone and their own account.
 */
const WEB_ROUTES = [
  '/', // landing
  '/about',
  '/for-vendors',
  '/how-it-works',
  '/how-verification-works',
  '/legal',
  // Auth. Without these the web has no front door.
  '/login',
  '/signup',
  '/verify',
  // THE WAY BACK IN. These were missed when auth was allowlisted, and the two
  // of them fail differently:
  //
  //   /forgot-password  is reached by clicking "Forgot password?" ON /login  
  //                     an allowed page handing you straight to a blocked one.
  //                     Someone who cannot remember their password is exactly
  //                     the person who cannot get past a wall that says "sign
  //                     in or install".
  //   /reset-password   is where the emailed link LANDS. Whatever device opens
  //                     that email decides, and it is routinely one with no app
  //                     installed and no session. Gating it turns a working
  //                     reset link into a dead end, and the link expires while
  //                     they are stuck behind it.
  //
  // Neither is a route worth converting anybody on: password recovery is not
  // browsing, it is someone locked out of an account they already have.
  '/forgot-password',
  '/reset-password',
  // ID CARD CHECKS. `/v/<code>` is where a QR on a vendor's or agent's card
  // resolves, and the person scanning it is a stranger   a tenant at their own
  // front door deciding whether the caller is who the platform says they are.
  //
  // Gating this is worse than pointless. They have no Sync account and no
  // reason to want one; they have a phone camera and a decision to make in the
  // next ten seconds. An install prompt in that moment does not convert
  // anybody, it just withholds the answer   and the likely outcome is that
  // they let the person in anyway, unverified, which is the exact failure the
  // card exists to prevent.
  '/v',
];

function isWebRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return WEB_ROUTES.some((r) => r !== '/' && (pathname === r || pathname.startsWith(`${r}/`)));
}

export function InstallGate({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  const { isStandalone, platform, canPrompt, promptInstall } = useInstall();

  // Installed app, or a page we deliberately serve on the web: get out of the way.
  if (isStandalone || isWebRoute(pathname)) return null;

  // SIGNED-IN USERS ARE NEVER GATED.
  //
  // The gate's job is turning visitors into installs. Someone who already has
  // an account is not a visitor, and putting an install wall between them and
  // their own dashboard is friction with nothing on the other side of it. This
  // is also what makes handle-rooted dashboards work: those live at /<name>,
  // which is dynamic and could never have been enumerated in WEB_ROUTES above.
  //
  // `signedIn` COMES FROM THE SERVER, and it has to.
  //
  // The first version read useSession() instead, and gated a freshly logged-in
  // user until they reloaded. `signIn` is a server action: it calls
  // signInWithPassword with the SERVER client, which writes the cookies
  // server-side. The browser's Supabase client never performed a sign-in, so
  // onAuthStateChange never fires and SessionProvider.user stays null until
  // something re-runs getUser() - which only a full reload does. The gate saw
  // "not signed in" and covered the dashboard it had just navigated to.
  //
  // The root layout already knows the answer on the server, before any of this
  // renders. Passing it down removes the race rather than trying to win it.
  if (signedIn) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-gate-title"
      className="bg-surface fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-6"
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {/* The real mark from the logo kit, not a rebuild of it. The kit's
            rules forbid redrawing or recolouring it, and the tile already
            carries its own Ink ground and corner radius. */}
        <Image
          src="/logo-kit/svg/sync-mark-01-monogram-tile.svg"
          alt=""
          width={64}
          height={64}
          className="mb-6 h-16 w-16 rounded-2xl"
          priority
        />

        <h1
          id="install-gate-title"
          className="font-display text-foreground text-[28px] leading-tight font-bold tracking-[-0.03em]"
        >
          Get the {SITE.name} app
        </h1>
        <p className="text-content-muted mt-3 text-sm">
          {SITE.name} lives on your home screen. Add it once and everything - hostels, food, events
          - opens straight from your phone.
        </p>

        {/* Chromium: a real install dialog. */}
        {canPrompt && (
          <Button size="md" className="mt-6 w-full" onClick={() => void promptInstall()}>
            <Plus className="h-4 w-4" />
            Install {SITE.name}
          </Button>
        )}

        {/* iOS has no install API at all - instructions are the only route in. */}
        {!canPrompt && platform === 'ios' && (
          <ol className="border-line/10 bg-panel mt-6 w-full space-y-3 rounded-2xl border p-4 text-left text-sm">
            <li className="text-content flex items-center gap-3">
              <Share className="text-accent-fg h-4 w-4 shrink-0" aria-hidden="true" />
              Tap the <strong>Share</strong> button in Safari
            </li>
            <li className="text-content flex items-center gap-3">
              <Plus className="text-accent-fg h-4 w-4 shrink-0" aria-hidden="true" />
              Choose <strong>Add to Home Screen</strong>
            </li>
            <li className="text-content flex items-center gap-3">
              <Smartphone className="text-accent-fg h-4 w-4 shrink-0" aria-hidden="true" />
              Open {SITE.name} from your home screen
            </li>
          </ol>
        )}

        {!canPrompt && platform === 'android' && (
          <ol className="border-line/10 bg-panel mt-6 w-full space-y-3 rounded-2xl border p-4 text-left text-sm">
            <li className="text-content flex items-center gap-3">
              <MoreVertical className="text-accent-fg h-4 w-4 shrink-0" aria-hidden="true" />
              Open the browser menu
            </li>
            <li className="text-content flex items-center gap-3">
              <Plus className="text-accent-fg h-4 w-4 shrink-0" aria-hidden="true" />
              Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>
            </li>
          </ol>
        )}

        {/* Desktop with no install support: sending them to a phone is the only
            honest instruction - there is nothing to tap here. */}
        {!canPrompt && platform === 'desktop' && (
          <p className="border-line/10 bg-panel text-content-muted mt-6 w-full rounded-2xl border p-4 text-sm">
            Open <strong className="text-foreground">{SITE.url.replace('https://', '')}</strong> on
            your phone to install {SITE.name}.
          </p>
        )}

        <Link
          href="/"
          className="text-content-muted hover:text-foreground mt-6 text-xs underline underline-offset-4 transition-colors"
        >
          Back to the {SITE.name} home page
        </Link>
      </div>
    </div>
  );
}
