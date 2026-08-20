/**
 * Location-aware copy for the /around hero.
 *
 * The page used to say "near you" / "your radius" unconditionally - a claim we
 * cannot make until the user shares a position. It also defaulted the area
 * picker to the first entry in the list, then labelled the whole page with it,
 * so a user who had chosen nothing was told they were in KWASU Gate.
 *
 * These render the honest phrase for the current state:
 *   all       - no filter chosen yet (the default)
 *   area      - the user picked one
 *   near-me   - real fix, inside coverage
 *   outside   - real fix, outside coverage (named via reverse geocoding)
 *
 * Client components because location lives in LocationContext; the surrounding
 * page stays an RSC.
 */
'use client';

import { useOptionalLocation } from '@/providers/location-provider';

/** The market itself - what "everything" means when nothing is filtered. */
const MARKET = 'Malete';

/**
 * Trailing scope for a count, e.g. "12 verified spots {…}".
 *   near-me → "near you"
 *   area    → "in Safari"
 *   all     → "in Malete"
 */
export function ScopeSuffix() {
  const loc = useOptionalLocation();

  if (loc?.outsideServiceArea) return <>in {MARKET}</>;
  if (loc?.coords) return <>near you</>;
  if (loc?.area) return <>in {loc.area}</>;
  return <>in {MARKET}</>;
}

/** The highlighted phrase in the headline. */
export function ScopeHeadline() {
  const loc = useOptionalLocation();

  if (loc?.outsideServiceArea) return <>{MARKET}</>;
  if (loc?.coords) return <>your radius</>;
  return <>{loc?.area ?? MARKET}</>;
}

/**
 * Hero sub-line. The proximity version names distances ("the plumber minutes
 * away"), which we can't know without a position inside coverage.
 */
export function ScopeBlurb() {
  const loc = useOptionalLocation();

  // Outside coverage: name where they are, then say what we actually serve.
  //
  // Built as one string rather than JSX text interleaved with {expressions}.
  // In JSX a line break beside an expression has its whitespace stripped, so
  // `{MARKET} for now` renders as "Maletefor now" the moment a formatter wraps
  // that line - and it wraps on word count, so the bug appears when someone
  // edits unrelated copy. A template literal can't be broken this way.
  if (loc?.outsideServiceArea) {
    const where = loc.placeName ? `You're in ${loc.placeName}. ` : '';
    return (
      <>{`${where}Sync serves KWASU, ${MARKET} for now - browse by area to see what's there.`}</>
    );
  }

  if (loc?.coords) {
    return (
      <>
        Tonight&rsquo;s events, food near your hostel, who&rsquo;s free for braids, the plumber
        minutes away. Everything Sync, in one place.
      </>
    );
  }

  // Same single-string treatment for the two interpolated variants.
  if (loc?.area) {
    return (
      <>{`Tonight's events, food, braids and verified artisans across ${loc.area}. Share your location to see what's closest.`}</>
    );
  }

  // Default: nothing chosen. Don't imply we know where they are.
  return (
    <>{`Tonight's events, food, braids and verified artisans across ${MARKET}. Share your location to sort by what's closest.`}</>
  );
}
