/**
 * Footer navigation - the single source for every "site" link, shared by the
 * marketing footer and the signed-in AppFooter.
 *
 * These lived inline in marketing-footer.tsx, which meant the legal and
 * explainer pages existed only on the public site: once someone signed in and
 * moved into the (app) or dashboard shells there was no footer, so Terms,
 * Privacy, Cookies and Data Protection became unreachable without typing a URL.
 * They are shared from here so both shells stay in step.
 */

export interface FooterLink {
  href: string;
  label: string;
}

export const PRODUCT_LINKS: FooterLink[] = [
  { href: '/hostels', label: 'Hostels' },
  { href: '/food', label: 'Food' },
  { href: '/events', label: 'Events' },
  { href: '/beauty', label: 'Beauty' },
  { href: '/workmanship', label: 'Trades' },
  { href: '/hotspots', label: 'Hot spots' },
];

export const COMPANY_LINKS: FooterLink[] = [
  { href: '/about', label: 'About' },
  { href: '/for-vendors', label: 'For landlords' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/how-verification-works', label: 'How verification works' },
  { href: '/around', label: 'Around you' },
];

export const LEGAL_LINKS: FooterLink[] = [
  { href: '/legal/privacy', label: 'Privacy Policy' },
  { href: '/legal/terms', label: 'Terms of Service' },
  { href: '/legal/cookies', label: 'Cookie Policy' },
  { href: '/legal/data-protection', label: 'Data Protection' },
];

/**
 * The questions people ask before signing up, plus every legal page. Rendered as
 * the marketing footer's full-width band and, in one line, by the AppFooter -
 * so these pages are one tap away whether or not you are signed in.
 */
export const HELP_LINKS: FooterLink[] = [
  { href: '/about', label: 'About Sync' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/how-verification-works', label: 'How verification works' },
  ...LEGAL_LINKS,
];
