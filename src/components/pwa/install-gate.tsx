/**
 * InstallGate - in a browser tab, only the public pages are reachable; anything
 * else asks the visitor to install Sync to their home screen first.
 *
 * Once installed, `display-mode: standalone` is true and this renders nothing,
 * so the installed app behaves normally everywhere.
 *
 * WEB_ROUTES is the whole policy - edit that list to open or close routes.
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
 * everything. Auth is included on purpose: without it nobody could sign up or
 * reset a password on a laptop, which would strand anyone whose phone install
 * failed. Remove those two lines if you want the funnel to be install-first.
 */
const WEB_ROUTES = [
  '/', // landing
  '/about',
  '/for-vendors',
  '/how-it-works',
  '/login',
  '/signup',
  '/verify',
  '/403',
];

function isWebRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return WEB_ROUTES.some((r) => r !== '/' && (pathname === r || pathname.startsWith(`${r}/`)));
}

export function InstallGate() {
  const pathname = usePathname();
  const { isStandalone, platform, canPrompt, promptInstall } = useInstall();

  // Installed app, or a page we deliberately serve on the web: get out of the way.
  if (isStandalone || isWebRoute(pathname)) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-gate-title"
      className="bg-surface fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-6"
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <span className="bg-ink mb-6 flex h-16 w-16 items-center justify-center rounded-2xl">
          <span className="flex items-center gap-1">
            <span className="bg-cream block h-2.5 w-2.5 rounded-full" />
            <span className="bg-lime block h-2 w-2 rounded-full" />
          </span>
        </span>

        <h1
          id="install-gate-title"
          className="font-display text-foreground text-[28px] leading-tight font-bold tracking-[-0.03em]"
        >
          Get the {SITE.name} app
        </h1>
        <p className="text-content-muted mt-3 text-sm">
          {SITE.name} lives on your home screen. Add it once and everything -
          hostels, food, events - opens straight from your phone.
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
