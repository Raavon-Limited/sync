/**
 * Site-wide smooth scroll (Lenis), initialised once at the root layout.
 *
 * WHAT LENIS ACTUALLY DOES, because it decides everything below: it cancels the
 * browser's native wheel scrolling and drives `window.scrollY` itself on a rAF
 * loop. So it does not "enhance" scrolling   it TAKES OVER the page's scroll,
 * and anything that expected the native behaviour has to be told to opt out.
 *
 * `allowNestedScroll` IS THE WHOLE REASON THIS IS SAFE TO SHIP.
 *   This app has ~73 containers that scroll internally: the agent's filing
 *   sheet, every Radix dialog body, the sidebar rail, the notification list,
 *   the chat panes, and every horizontal category strip. Lenis intercepts the
 *   wheel at the root, so by default a wheel inside any of them is swallowed
 *   and scrolls the PAGE BEHIND instead   the container silently becomes
 *   unscrollable by mouse.
 *
 *   The documented fix is a `data-lenis-prevent` attribute on each one. That is
 *   73 edits and a permanent tax: every new scrollable div would have to
 *   remember it, and forgetting produces a bug that only shows up with a mouse.
 *
 *   `allowNestedScroll` does it generically instead   Lenis walks the event
 *   path and hands the gesture back to any ancestor that genuinely scrolls,
 *   computing overflow, scroll capacity and overscroll-behavior (cached ~2s, so
 *   it is not a per-event layout read). One option, no annotations, and new
 *   containers work without anybody knowing this file exists.
 *
 *   The per-element attributes still win where they are set, so
 *   `data-lenis-prevent` remains available for anything this heuristic gets
 *   wrong.
 *
 * THE STYLESHEET IS NOT COSMETIC.
 *   `lenis/dist/lenis.css` sets `html.lenis, html.lenis body { height: auto }`.
 *   The root layout puts `h-full` on <html> and `min-h-full` on <body>, and a
 *   fixed-height html cannot scroll at all. That import is what reconciles the
 *   two; dropping it as "unused CSS" breaks scrolling outright.
 *
 * REDUCED MOTION IS A HARD OFF, NOT A SHORTER DURATION.
 *   Smooth scrolling is exactly the vestibular trigger `prefers-reduced-motion`
 *   exists for, and for somebody who gets motion sick a gentler animation is
 *   still an animation. When it is set, Lenis is not mounted at all and the
 *   browser's own scrolling is left completely alone.
 *
 *   `useMediaQuery` returns false on the server, so the first paint is the
 *   smooth branch and it swaps after hydration. That direction is deliberate:
 *   the alternative is every visitor briefly losing smooth scroll.
 */
'use client';

import 'lenis/dist/lenis.css';
import { ReactLenis } from 'lenis/react';
import { useMediaQuery } from '@/hooks/use-media-query';

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');

  if (reduce) return <>{children}</>;

  return (
    <ReactLenis
      root
      options={{
        // `lerp` and `duration` are alternative easing models and Lenis uses
        // whichever it is given, so only one is set. 0.1 settles in roughly
        // 300ms: present enough to read as smooth, short enough that a link in
        // the footer is not a journey.
        lerp: 0.1,
        smoothWheel: true,
        // See the note above   this is load-bearing, not a tweak.
        allowNestedScroll: true,
        // TOUCH IS LEFT NATIVE. A phone's own scroll physics are better than
        // any JS reimplementation, they cost nothing, and overriding them is
        // what makes a site feel laggy on a mid-range Android   which is most
        // of Malete. This is already the default; it is written down because
        // turning it on looks like an improvement and is not.
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}
