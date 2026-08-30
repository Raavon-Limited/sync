/**
 * Site-wide constants - name, description, contact, support, social.
 * Imported by marketing pages, metadata, footer.
 */
export const SITE = {
  name: 'Sync',
  legalName: 'Raavon Limited',
  tagline: 'Your campus, in one place',
  /** One-line value summary - used as the hero/landing subtitle and meta description. */
  summary: 'Verified rooms, events, and everything around campus - all in one place.',
  description:
    'Sync is the verified marketplace for Nigerian student life - hostels, food, events, beauty, trades, laundry and more.',
  launchMarket: 'KWASU, Malete',
  url: 'https://www.letsyncyou.com',
  support: {
    email: 'support@sync.ng',
  },
  socials: {
    x: 'https://x.com/syncng',
    instagram: 'https://instagram.com/syncng',
  },
} as const;

/**
 * Where a user lands after signing out.
 *
 * `/around`, NOT `/`. The marketing landing page is a web-only surface: it
 * exists to explain the product to someone who has not signed up. Inside the
 * app - and especially in the installed PWA, which has no address bar and no
 * way back - the home is Around you, which is public and renders perfectly
 * signed-out. Dropping someone onto the sales page after they log out of the
 * PWA reads as being thrown out of the app.
 *
 * Same reasoning as the removal of the dashboard sidebar's "Home" link, which
 * also pointed at `/`. Named rather than inlined because it was four copies of
 * `router.push('/')` across four sign-out handlers, and they must not drift.
 */
export const AFTER_SIGN_OUT = '/around';
