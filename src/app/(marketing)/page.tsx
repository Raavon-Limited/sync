/**
 * ROUTE: /
 * ACCESS: public
 * PURPOSE: The Sync landing page (redesign, Nov 2026). The design reference is
 *          the "Main" canvas in the Sync design project.
 *
 * SECTIONS, IN ORDER
 *   1. Hero         - feature icons flow into the Sync mark, Sync flows out to
 *                     student life (HeroConstellation). Explore-first CTA.
 *   2. Find         - tabs, compact search, five real cards per tab.
 *   3. Around you   - time of day, weather, plans, next event, a hot spot, the
 *                     gist (coming), guides.
 *   4. How it works - students / vendors (#how, the header link).
 *   5. Why Sync     - the old way vs the Sync way, one word per row.
 *   6. Reviews      - approved reviews only, as a carousel. Hidden entirely
 *                     when there are none: no seeded quotes, ever.
 *   7. Reach out    - #contact; the header's gist/careers links preset a topic.
 *                     Also where the FIRST review gets written, since the
 *                     reviews section does not exist until one is approved.
 *   Footer          - MarketingFooter, from the layout.
 *
 * WHAT WAS REMOVED AND WHY
 *   - ActivityTicker: mock activity on the public home page.
 *   - Newsletter band: showed "you're in" with no backend behind it.
 *   - FAQ, trust band, landlord/vendor band: folded into How it works, Why
 *     Sync and the footer, so each claim is made once.
 *   - The old testimonials block, which fell back to SEEDED quotes from
 *     students who do not exist (one praising a Fresher's Night that never
 *     happened). Replaced by the Reviews carousel above.
 *
 * DATA: real, from ./landing-data. Every empty state says what is true.
 */
import { getCurrentUser } from '@/modules/auth/queries';
import { getMyTestimonial, listApprovedTestimonials } from '@/modules/testimonials/queries';
import { CAMPUS_POINT } from '@/lib/constants/areas';
import { HeroConstellation } from '@/components/landing/hero-constellation';
import { FindSection } from '@/components/landing/find-section';
import { AroundSection } from '@/components/landing/around-section';
import { HowSection } from '@/components/landing/how-section';
import { WhySection } from '@/components/landing/why-section';
import { ReachOut } from '@/components/landing/reach-out';
import { ReviewsCarousel } from '@/components/landing/reviews-carousel';
import { getCampusWeather, getLandingRails, getLandingShowcase } from './landing-data';

// The launch campus, short form for buttons ("Explore KWASU").
const CAMPUS_SHORT = 'KWASU';

export default async function LandingPage() {
  // Independent reads, fired together. Each degrades to empty rather than
  // throwing, so the page always renders.
  const [showcase, rails, weather, reviews, user, mine] = await Promise.all([
    getLandingShowcase(),
    getLandingRails(),
    getCampusWeather(CAMPUS_POINT.lat, CAMPUS_POINT.lng),
    listApprovedTestimonials(12),
    getCurrentUser(),
    // Null for a signed-out visitor; the review form handles that.
    getMyTestimonial(),
  ]);

  return (
    <>
      <HeroConstellation highlights={showcase.highlights} areaLabel={CAMPUS_SHORT} />
      <FindSection rails={rails} />
      <AroundSection campus={CAMPUS_SHORT} showcase={showcase} weather={weather} />
      <HowSection />
      <WhySection />
      {reviews.length > 0 && <ReviewsCarousel reviews={reviews} signedIn={Boolean(user)} mine={mine} />}
      <ReachOut signedIn={Boolean(user)} mine={mine} />
    </>
  );
}
