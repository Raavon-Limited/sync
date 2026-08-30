/**
 * Domain types for the 'around' module.
 * Cross-module shared types belong in @/types.
 */
export {};

// -- Campus pulse -------------------------------------------------------------

/**
 * What is happening in one area. Every field is an aggregate — there is no
 * user, order or amount anywhere in this shape, by construction rather than by
 * omission (see `campus_pulse` in 20260829110000).
 */
export interface AreaPulse {
  area: string;
  stores: { total: number; open: number; onCooldown: number; closed: number };
  /** A bucket, never a count: an exact number is a vendor's takings. */
  busyness: 'quiet' | 'steady' | 'busy';
  newStores: { name: string; slug: string }[];
  trending: { name: string }[];
  /**
   * True when the area HAS orders but too few distinct students to publish a
   * trend without pointing at them. Lets the UI say "not enough activity yet"
   * instead of rendering an empty list that reads as "nobody buys anything".
   */
  trendingSuppressed: boolean;
}
