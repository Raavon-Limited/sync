/**
 * Freeze the page behind an overlay.
 *
 * WHY THIS EXISTS: the hostel modals are hand-rolled `fixed inset-0` divs, not
 * Radix ones. Radix Dialog brings `react-remove-scroll` with it and locks the
 * page for free, which is why nobody had to think about this before   these
 * modals never had that, so the page has always scrolled underneath them. A
 * student filling in "when are you free?" could wheel the listing away behind
 * the form.
 *
 * TWO THINGS HAVE TO STOP, and missing either one leaves it half-broken:
 *
 *   1. NATIVE SCROLL   `overflow: hidden` on <body>.
 *   2. LENIS   which drives `window.scrollY` itself on a rAF loop and does not
 *      consult `overflow` to decide whether to keep animating. Locking the body
 *      alone leaves smooth scrolling running underneath the overlay, which is
 *      the exact bug this was written for. `lenis.stop()` is the other half.
 *
 * THE SCROLLBAR IS COMPENSATED, because removing it is a layout change. On a
 * desktop browser with a classic scrollbar, hiding overflow reclaims ~15px and
 * the whole page   including the fixed header   jumps sideways as the modal
 * opens. Padding the body by exactly the width that vanished keeps it still.
 * Overlay scrollbars (most laptops, all phones) measure 0 and get no padding.
 *
 * RESTORES WHAT IT FOUND, not a hardcoded default: an inline style that was
 * already there is put back on cleanup rather than blanked, so this composes
 * with anything else that touches body styles instead of trampling it.
 */
'use client';

import { useEffect } from 'react';
import { useLenis } from 'lenis/react';

export function useScrollLock(active: boolean) {
  const lenis = useLenis();

  useEffect(() => {
    if (!active) return;

    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;

    // Measured BEFORE overflow changes, or the gap is always 0.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbar > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
    lenis?.stop();

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
      lenis?.start();
    };
  }, [active, lenis]);
}
