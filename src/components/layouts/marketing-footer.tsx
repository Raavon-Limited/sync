/**
 * MarketingFooter - dark footer for the public route group. A brand row, one
 * full-width "Before you start" link band, a disclaimer block, and the big
 * Sync wordmark bleeding off the bottom edge (redesign, Nov 2026).
 *
 * The wordmark is in the kit's colours (paper mark with a sage counter, sage
 * type fading out). Not sunflower: the logo never takes the accent colour.
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncLogo } from '@/components/brand/sync-logo';
import { DoodleBackdrop } from '@/components/shared/doodle-backdrop';
import { SITE } from '@/config/site';
// Shared with the signed-in AppFooter, so the same pages are reachable from
// both shells. See config/footer-nav.
import { HELP_LINKS } from '@/config/footer-nav';

const SOCIALS = [
  { href: SITE.socials.x, label: 'X', initials: 'X' },
  { href: SITE.socials.instagram, label: 'Instagram', initials: 'IG' },
];

export function MarketingFooter() {
  // Near-black, as the footer was before the green palette: the founder's
  // call. A literal, not `ink`, which means forest now.
  return (
    <footer className="bg-[#0e0e12] text-cream relative isolate overflow-hidden">
      {/* The townscape, in cream outline on the Ink surface. Sits UNDER the
          glow below (both are -z-10, this one first in source order), so the
          lime bloom reads as light falling across the drawing. */}
      <DoodleBackdrop tile={560} className="text-cream/6" />

      {/* Animated morphing ambient glow */}
      <div
        aria-hidden="true"
        className="morph-blob bg-lime/10 pointer-events-none absolute bottom-0 left-1/2 -z-10 h-[34rem] w-[48rem] rounded-full blur-[150px]"
      />

      <div className="mx-auto max-w-7xl px-6 pt-16 md:pt-20">
        {/* Brand row. The Product / Company / Legal columns that used to sit
            beside it are gone: they repeated the header and the services dock,
            and on a phone they were three collapsed accordions. "Before you
            start" below is the footer's one link set. */}
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-6">
            <Link href="/" className="text-cream w-fit" aria-label={`${SITE.name} home`}>
              <SyncLogo height={22} />
            </Link>
            <p className="text-cream/70 max-w-sm text-sm">{SITE.description}</p>
          </div>

          <div className="flex flex-col gap-8 sm:flex-row sm:gap-12 md:shrink-0">
            <div>
              <p className="eyebrow text-cream/40">Get started</p>
              {/* Explore first, sign up later: /around is public. No shadow on
                  the sunflower button, per the redesign. */}
              <Button asChild size="lg" className="mt-3 rounded-full shadow-none">
                <Link href="/around">
                  Explore Sync <ArrowUpRight />
                </Link>
              </Button>
            </div>

            <div>
              <p className="eyebrow text-cream/40 mb-3">Stay in touch</p>
              <div className="flex items-center gap-2">
                {SOCIALS.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noreferrer"
                    className="border-cream/15 text-cream/80 hover:border-lime hover:text-lime flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-xs font-medium transition-colors"
                  >
                    {s.initials}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Before you start - a full-width band, so these read as the footer's own
            row rather than a stack hanging off the Explore button. */}
        <div className="border-cream/10 mt-14 border-t pt-8">
          <p className="eyebrow text-cream/40">Before you start</p>
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {HELP_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-cream/70 hover:text-lime group flex items-center justify-between gap-4 text-sm transition-colors"
                >
                  {l.label}
                  <ArrowUpRight className="text-cream/25 group-hover:text-lime h-4 w-4 shrink-0 transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Disclaimer */}
        <div className="border-cream/10 mt-12 border-t pt-10">
          <p className="eyebrow text-cream/40">Disclaimer</p>
          <div className="text-cream/50 mt-4 flex flex-col gap-4 text-xs leading-relaxed md:max-w-4xl">
            {/* Founder-approved wording (Nov 2026). Keep it verbatim; change it
                only with sign-off, it is the public statement of what Sync is. */}
            <p>
              {SITE.name} is a discovery platform operated by {SITE.legalName}. A Verified badge
              means {SITE.name} has checked that vendor; listings without the badge have not been
              checked yet. Listings, prices and availability are provided by vendors themselves, so
              always confirm details and inspect a property before paying anyone.
            </p>
            <p>
              {SITE.name} does not hold student funds. Where payment options are offered, they are
              handled by a licensed payment provider and any {SITE.name} fee is shown before you
              pay. By using {SITE.name} you agree to our Terms of Service and acknowledge that
              reliance on any information here is at your own risk.
            </p>
            <p>
              Stay safe when buying or selling: only trade with verified vendors, meet in a public
              place, and never follow anyone to a place you did not agree to in the app. We can only
              see what is agreed in the app, not what is said in person or on a call. If anything
              goes wrong, report it immediately and keep evidence; we will follow up and report to
              the nearest help.{' '}
              <Link href="/legal/safety" className="text-cream/80 underline underline-offset-2">
                Safety on Sync
              </Link>
            </p>
          </div>
        </div>

        {/* Bottom row */}
        <div className="border-cream/10 text-cream/40 mt-12 flex flex-col gap-2 border-t pt-8 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            {SITE.name} - the verified marketplace for Nigerian student life. {SITE.url.replace('https://', '')}
          </p>
          <a href="https://www.raavon.com" target="_blank" rel="noreferrer" className="hover:text-cream transition-colors">
            www.raavon.com
          </a>
        </div>

        {/* Brand + operator + copyright (footer end) - centered on mobile */}
        <div className="border-cream/10 mt-12 flex flex-col items-center gap-4 border-t pt-8 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <SyncLogo height={18} className="text-cream" />
            <span className="text-cream/50 text-sm">
              Operated by <span className="text-cream/80">{SITE.legalName}</span>
            </span>
          </div>
          <p className="text-cream/50 text-xs">
            © {new Date().getFullYear()} {SITE.legalName}. Built for everyone.
          </p>
        </div>

        {/* The big wordmark. Decorative (the logo above is the real link), and
            it bleeds off the bottom: the negative margin cuts the descent so
            the type sits on the footer edge like the design. */}
        <div
          aria-hidden="true"
          className="pointer-events-none -mx-6 mt-10 -mb-[6vw] flex items-center justify-center gap-[2.5vw] select-none md:-mb-[4.2vw]"
        >
          <svg viewBox="0 0 100 100" className="size-[19vw] max-h-[300px] max-w-[300px] shrink-0">
            <circle cx="50" cy="50" r="46" fill="#F2F1EA" />
            <path d="M50 4 A46 46 0 0 1 50 96 A23 23 0 0 1 50 50 A23 23 0 0 0 50 4 Z" fill="#A3B18A" />
          </svg>
          <span className="font-display bg-gradient-to-b from-[#A3B18A] to-[#A3B18A]/25 bg-clip-text text-[min(30vw,470px)] leading-[0.82] font-bold tracking-[-0.06em] text-transparent">
            sync
          </span>
        </div>
      </div>
    </footer>
  );
}
