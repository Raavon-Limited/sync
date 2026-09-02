/**
 * Site-wide constants - name, description, contact, support, social.
 * Imported by marketing pages, metadata, footer.
 */
/**
 * The origin to put INSIDE something that outlives the page that made it.
 *
 * WHY NOT `window.location.origin`
 *   That is right for a link you click now and wrong for anything durable. A
 *   QR code baked into a downloaded ID card, or an invite link copied and sent
 *   to somebody else, is read later, elsewhere, on another person's device  
 *   and one generated from a dev machine would carry `http://localhost:3000`
 *   forever. The card would print, look perfect, and scan to nothing.
 *
 *   So durable artifacts use the CONFIGURED origin, which is per-environment
 *   and always an address a stranger can reach. Navigation inside the app
 *   still uses relative paths and needs none of this.
 *
 * `NEXT_PUBLIC_` so it is inlined for the browser too   the ID card builds its
 * QR client-side.
 */
export function canonicalOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  return configured || SITE.url;
}

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
    /**
     * The one public address. Was support@sync.ng, on a domain the product no
     * longer uses - it appeared on all four legal pages, so anyone exercising
     * a data-protection right was writing to a mailbox at the wrong company.
     *
     * There is deliberately no second address here. sales@ was hardcoded in
     * the vendor plan card and pointed at the same dead domain; one inbox that
     * is read beats two that are not.
     */
    email: 'hello@letsyncyou.com',
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
