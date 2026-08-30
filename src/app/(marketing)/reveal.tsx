/**
 * Scroll motion primitives for the marketing pages.
 *
 *   <Reveal>        one block eases in as it enters the viewport
 *   <Stagger>       a grid whose children arrive in sequence
 *   <StaggerItem>   a child of the above
 *   <Parallax>      drifts with scroll position
 *
 * All of them render a plain div under `prefers-reduced-motion` - no animation,
 * no transform, no scroll listener. Motion here is decoration, and decoration
 * is the first thing to drop when someone has asked for less of it.
 *
 * Why Stagger rather than <Reveal delay={i * 0.08}>: with manual delays every
 * card starts its timer when IT enters the viewport, so a row that scrolls in
 * together still animates raggedly, and a card already on screen at load waits
 * for a delay it never needed. staggerChildren sequences from the container's
 * own entry, which is what "one after another" actually means.
 */
'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, type ReactNode } from 'react';

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

/** Enter margin. Fires slightly before the block is fully on screen. */
const VIEWPORT = { once: true, margin: '-80px' } as const;

interface RevealProps {
  children: ReactNode;
  /** Stagger helper - delay in seconds before this block animates. */
  delay?: number;
  className?: string;
}

export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Sequences its children as the container enters view. Put the grid classes on
 * this - it renders the element the children lay out inside.
 */
export function Stagger({
  children,
  className,
  /** Gap between each child, seconds. */
  step = 0.08,
  /** Wait before the first child. */
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={VIEWPORT}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: step, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A child of <Stagger>. Lifts and settles rather than only fading, so a grid of
 * cards reads as arriving rather than developing.
 */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 28, scale: 0.98 },
        shown: { opacity: 1, y: 0, scale: 1 },
      }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Drifts its children against the scroll. `distance` is how far in px across
 * the whole time the element is on screen - keep it small; parallax that moves
 * further than the eye expects reads as a rendering fault, not depth.
 */
export function Parallax({
  children,
  className,
  distance = 60,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  // Hooks must run unconditionally, so this is computed even when reduced
  // motion means we throw it away below.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}
