/**
 * BootSplash - first-load splash. Next's loading.tsx only covers client-side
 * navigations; this covers the cold load (first visit / hard refresh) where
 * the page is streamed straight in.
 *
 * TWO SPLASHES, one component:
 *   - the landing page, AND any launch of the installed PWA, gets
 *     <SyncIntro> - the full welcome animation
 *   - every other route gets <BrandLoader>, which is quick and quiet
 *
 * Landing and app-launch are where a 4.7s brand moment is worth the wait;
 * making a student sit through it on the way to /food would not be. Each keeps the
 * screen up for its own duration, so the intro is never cut off mid-animation.
 *
 * The intro plays IN FULL ON EVERY LOAD of the landing page. For one afternoon
 * (1e71a52) it played in full only once per browser session - but the
 * component still RENDERED it on every later load, with no minimum, so a
 * reload showed the animation start and get chopped the moment the page was
 * ready. A half-played logo reads as a glitch, not as speed. The founder asked
 * for the full intro back. If it ever needs to be skippable, render the quiet
 * <BrandLoader> instead of <SyncIntro> - never start the intro and cut it.
 *
 * Visible on initial render (server + hydration), then fades out once the
 * window finishes loading. On in-app navigations the root layout never
 * remounts, so this only ever runs once per full page load.
 */
'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

import { BrandLoader } from '@/components/ui/brand-loader';
import { SyncIntro, SYNC_INTRO_DURATION } from '@/components/ui/sync-intro';
import { readStandalone, subscribeStandalone } from '@/lib/pwa/use-install';
import { cn } from '@/lib/utils';

/**
 * How long the quiet loader stays up on non-landing routes: not at all past
 * the load itself. This was a 2800ms MINIMUM, so a page that had already
 * arrived sat behind a logo for nearly three seconds on every hard refresh.
 * Most students are on phones and slow data; the page being ready is the
 * moment to show it.
 */
const MIN_VISIBLE_MS = 0;
const FADE_MS = 500;

/** SSR default is `false` here: assume a browser tab, so a normal page render
 *  never ships the 4.7s intro to someone who is not opening the app. */
const notStandaloneOnServer = () => false;

export function BootSplash() {
  const pathname = usePathname();

  // Launching the installed app is a "welcome" moment wherever it lands. The
  // manifest's start_url is /around, not /, so a pathname check alone would
  // never fire the intro for PWA users - which is exactly the case it is for.
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    readStandalone,
    notStandaloneOnServer,
  );

  // Decided on the route the page cold-loaded at.
  const showIntro = pathname === '/' || isStandalone;

  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Hold the intro for its full runtime; anything shorter clips the exit.
    const minVisible = showIntro ? SYNC_INTRO_DURATION * 1000 : MIN_VISIBLE_MS;
    const start = performance.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const finish = () => {
      const wait = Math.max(0, minVisible - (performance.now() - start));
      const t1 = setTimeout(() => {
        setFading(true);
        const t2 = setTimeout(() => setDone(true), FADE_MS);
        timers.push(t2);
      }, wait);
      timers.push(t1);
    };

    if (document.readyState === 'complete') {
      finish();
    } else {
      window.addEventListener('load', finish, { once: true });
    }
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('load', finish);
    };
  }, [showIntro]);

  if (done) return null;

  return (
    <div
      aria-hidden={fading}
      className={cn(
        'fixed inset-0 z-100 transition-opacity duration-500 ease-out',
        fading && 'pointer-events-none opacity-0',
      )}
    >
      {showIntro ? <SyncIntro className="bg-ink h-full w-full" /> : <BrandLoader />}
    </div>
  );
}
