/**
 * Cursor - a small dot that tracks the pointer exactly, and a larger ring that
 * trails behind it.
 *
 * Both are painted with `mix-blend-mode: difference` over white, which inverts
 * whatever is underneath: black on cream, cream on ink, and the complement of
 * any photo it crosses. That is what keeps it visible everywhere without ever
 * picking a colour - and it means the cursor never disappears against the
 * background video on the landing hero.
 *
 * Deliberately NOT rendered when:
 *   - the route is not a reading page. See CURSOR_ROUTES below - this is the
 *     one that keeps it off /hostels, /around and every dashboard.
 *   - the device has no fine pointer (touch). Hiding the system cursor on a
 *     phone buys nothing and the trailing ring would chase taps around.
 *   - the user prefers reduced motion. The ring's easing is the whole effect;
 *     without it this is just a worse mouse pointer, so the native one is left
 *     alone entirely.
 *
 * Positions are written straight to the DOM inside a rAF loop rather than held
 * in state - a React re-render per mousemove would be dozens of renders a
 * second for something no other component needs to know about.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * WHERE THE CUSTOM CURSOR BELONGS: pages people READ.
 *
 * It was mounted globally, so it followed users into the product - and a
 * trailing ring with `cursor: none` under it is actively worse for work. On
 * /hostels, /around and every dashboard a person is aiming: at a room in a
 * dropdown, at Accept, at a pin on a map. A dot that leads the ring and a
 * system pointer that is not there removes the two cues aiming depends on -
 * the exact hotspot, and the hand that says "this is clickable".
 *
 * So it is scoped to the marketing and policy pages, where the pointer is
 * decoration on something being read rather than an instrument.
 *
 * Not the list of "pages that open without the app" (the old InstallGate's
 * WEB_ROUTES, removed Nov 2026), though it looked alike. That one included
 * /login, /signup and the password-reset flow - forms, i.e. exactly the aiming
 * case this excludes. Do not grow this list into a list of public pages; it
 * would silently put the ring back over every auth form.
 */
const CURSOR_ROUTES = [
  '/about',
  '/for-vendors',
  '/how-it-works',
  '/how-verification-works',
  '/legal',
];

function isReadingPage(pathname: string): boolean {
  // '/' exactly - a prefix test would match the entire site.
  return (
    pathname === '/' || CURSOR_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))
  );
}

/** How much of the gap the ring closes each frame. Lower = longer trail. */
const EASE = 0.18;
/** Ring scale while the pointer is over something clickable. */
const HOVER_SCALE = 1.6;

export function Cursor() {
  const [pointerOk, setPointerOk] = useState(false);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  const pathname = usePathname();
  const allowedHere = isReadingPage(pathname);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => setPointerOk(fine.matches && !reduce.matches);

    decide();
    fine.addEventListener('change', decide);
    reduce.addEventListener('change', decide);
    return () => {
      fine.removeEventListener('change', decide);
      reduce.removeEventListener('change', decide);
    };
  }, []);

  // Derived, not stored: the route is already a render input, so folding it
  // into state would mean an effect writing state the render could compute.
  const enabled = allowedHere && pointerOk;

  useEffect(() => {
    if (!enabled) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    // Start off-screen so neither element flashes at 0,0 before the first move.
    let mx = -100;
    let my = -100;
    let rx = mx;
    let ry = my;
    let scale = 1;
    let targetScale = 1;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      // Grow over anything the user can actually act on.
      const el = e.target as Element | null;
      targetScale = el?.closest('a,button,[role="button"],input,select,textarea,label')
        ? HOVER_SCALE
        : 1;
    };
    const onLeave = () => {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    };
    const onEnter = () => {
      dot.style.opacity = '1';
      ring.style.opacity = '1';
    };

    const tick = () => {
      rx += (mx - rx) * EASE;
      ry += (my - ry) * EASE;
      scale += (targetScale - scale) * EASE;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('pointerenter', onEnter);
    // Only hide the system cursor once ours is definitely running, so a thrown
    // error can never leave the page with no pointer at all.
    document.documentElement.classList.add('has-custom-cursor');

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerenter', onEnter);
      document.documentElement.classList.remove('has-custom-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] mix-blend-difference"
    >
      <div
        ref={ringRef}
        className="absolute top-0 left-0 h-9 w-9 rounded-full border-2 border-white opacity-0 will-change-transform"
      />
      <div
        ref={dotRef}
        className="absolute top-0 left-0 h-1.5 w-1.5 rounded-full bg-white opacity-0 will-change-transform"
      />
    </div>
  );
}
