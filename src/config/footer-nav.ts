/**
 * Footer navigation - the single source for the site + legal links, shared by
 * the marketing footer and the signed-in AppFooter.
 *
 * These lived inline in marketing-footer.tsx, which meant the legal and
 * explainer pages existed only on the public site: once someone signed in and
 * moved into the (app) or dashboard shells there was no footer, so Terms,
 * Privacy, Cookies and Data Protection became unreachable without typing a URL.
 * They are shared from here so both shells stay in step.
 *
 * There are deliberately no Product / Company columns any more. Those repeated
 * the header and the services dock, and on a phone they were collapsed
 * accordions nobody opened. One list, shown in full, everywhere.
 */

export interface FooterLink {
  href: string;
  label: string;
}

export const LEGAL_LINKS: FooterLink[] = [
  { href: '/legal/privacy', label: 'Privacy Policy' },
  { href: '/legal/terms', label: 'Terms of Service' },
  { href: '/legal/cookies', label: 'Cookie Policy' },
  { href: '/legal/data-protection', label: 'Data Protection' },
];

/**
 * The questions people ask before signing up, plus every legal page. Rendered as
 * the marketing footer's full-width band and as the AppFooter's one row - so
 * these pages are one tap away whether or not you are signed in.
 */
export const HELP_LINKS: FooterLink[] = [
  { href: '/about', label: 'About Sync' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/how-verification-works', label: 'How verification works' },
  ...LEGAL_LINKS,
  // Not a page: the Reach out section on the landing (#contact). There is no
  // /contact route, and a footer link to one would 404.
  { href: '/#contact', label: 'Contact us' },
];
