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

/** How much of the gap the ring closes each frame. Lower = longer trail. */
const EASE = 0.18;
/** Ring scale while the pointer is over something clickable. */
const HOVER_SCALE = 1.6;

export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => setEnabled(fine.matches && !reduce.matches);

    decide();
    fine.addEventListener('change', decide);
    reduce.addEventListener('change', decide);
    return () => {
      fine.removeEventListener('change', decide);
      reduce.removeEventListener('change', decide);
    };
  }, []);

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
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[9999] mix-blend-difference">
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
