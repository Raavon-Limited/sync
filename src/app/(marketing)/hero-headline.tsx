/**
 * HeroHeadline - the landing headline with a single restrained flourish: the
 * whole block fades up on load, then the slanted lime band wipes across "Sync"
 * left-to-right. Minimalist - one motion, slow and clean.
 * Honours prefers-reduced-motion (renders static, band already drawn).
 *
 * The copy and its treatment live in <SyncTagline> so the landing hero, the
 * about hero and the about CTA cannot drift apart. Only the wipe is here,
 * because only this instance animates.
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { SyncTagline } from '@/components/shared/sync-tagline';

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export function HeroHeadline() {
  const reduce = useReducedMotion();

  return (
    <motion.h1
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="font-display text-foreground mt-4 text-[44px] font-bold leading-[0.98] tracking-[-0.035em] md:text-[60px] md:leading-[0.96] md:tracking-[-0.04em] lg:text-[68px]"
    >
      {/* Only the band animates - the words are visible from the first frame.
          The wipe is CSS inside SyncTagline (see the band-wipe keyframe), not
          framer, so the blob clip and its reveal stay in one file. */}
      <SyncTagline animateBand={!reduce} />
    </motion.h1>
  );
}
