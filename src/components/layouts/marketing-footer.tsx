/**
 * MarketingFooter - rich dark footer for the public route group. Multi-column
 * link grid, brand tagline, social, a disclaimer block, and an animated
 * morphing ambient glow behind it. Merges seamlessly with the dark CTA above.
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncLogo } from '@/components/brand/sync-logo';
import { SITE } from '@/config/site';
// Shared with the signed-in AppFooter, so the same pages are reachable from
// both shells. See config/footer-nav.
import {
  COMPANY_LINKS,
  HELP_LINKS,
  LEGAL_LINKS,
  PRODUCT_LINKS,
  type FooterLink,
} from '@/config/footer-nav';

const SOCIALS = [
  { href: SITE.socials.x, label: 'X', initials: 'X' },
  { href: SITE.socials.instagram, label: 'Instagram', initials: 'IG' },
];

export function MarketingFooter() {
  return (
    <footer className="bg-ink text-cream relative isolate overflow-hidden">
      {/* Animated morphing ambient glow */}
      <div
        aria-hidden="true"
        className="morph-blob bg-lime/10 pointer-events-none absolute bottom-0 left-1/2 -z-10 h-[34rem] w-[48rem] rounded-full blur-[150px]"
      />

      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        {/* Main grid */}
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div className="flex flex-col gap-6">
            <Link href="/" className="text-cream w-fit" aria-label={`${SITE.name} home`}>
              <SyncLogo height={22} />
            </Link>
            <p className="text-cream/70 max-w-xs text-sm">{SITE.description}</p>

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

          <FooterCol title="Product" items={PRODUCT_LINKS} />
          <FooterCol title="Company" items={COMPANY_LINKS} />
          <FooterCol title="Legal" items={LEGAL_LINKS} />
        </div>

        {/* Before you start - a full-width band, so these read as the footer's own
            row rather than a stack hanging off the Get Sync button. */}
        <div className="border-cream/10 mt-16 border-t pt-8">
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

/**
 * A plain, always-open link column. This used to be a `<details>` accordion on
 * mobile, which meant a phone footer was three chevrons and nothing else - the
 * links were there but nobody opened them. Four links per column is not enough
 * content to be worth hiding, so they are always visible at every width.
 */
function FooterCol({ title, items }: { title: string; items: FooterLink[] }) {
  return (
    <div className="border-cream/10 border-t pt-6 md:border-none md:pt-0">
      <p className="eyebrow text-cream/40">{title}</p>
      <ul className="mt-4 space-y-3 text-sm">
        {items.map(({ href, label }) => (
          <li key={label}>
            <Link href={href} className="text-cream/70 hover:text-lime transition-colors">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
