/**
 * MarketingFooter - dark footer for the public route group. A brand row, one
 * full-width "Before you start" link band, a disclaimer block, and an animated
 * morphing ambient glow behind it. Merges seamlessly with the dark CTA above.
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
  return (
    <footer className="bg-ink text-cream relative isolate overflow-hidden">
      {/* The townscape, in cream outline on the Ink surface. Sits UNDER the
          glow below (both are -z-10, this one first in source order), so the
          lime bloom reads as light falling across the drawing. */}
      <DoodleBackdrop tile={560} className="text-cream/6" />

      {/* Animated morphing ambient glow */}
      <div
        aria-hidden="true"
        className="morph-blob bg-lime/10 pointer-events-none absolute bottom-0 left-1/2 -z-10 h-[34rem] w-[48rem] rounded-full blur-[150px]"
      />

      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
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
              <Button asChild size="lg" className="mt-3">
                <Link href="/signup">
                  Get Sync <ArrowUpRight />
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
            row rather than a stack hanging off the Get Sync button. */}
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
            <p>
              {SITE.name} is a marketplace operated by {SITE.legalName}. We verify every vendor -
              ID check, business proof, and an in-person visit - but listings, prices, and
              availability are provided by the vendors themselves. Always confirm details and
              inspect a property before paying.
            </p>
            <p>
              Payments are processed and held in escrow by Paystack, a CBN-licensed payment
              provider. {SITE.name} does not hold or custody student funds. Our 5% verified-listing
              fee is disclosed at checkout. By using {SITE.name} you agree to our Terms of Service
              and acknowledge that reliance on any information here is at your own risk.
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
      </div>
    </footer>
  );
}
