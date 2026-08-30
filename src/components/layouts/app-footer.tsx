/**
 * AppFooter - the slim footer for the signed-in shells (AppShell and
 * DashboardShell).
 *
 * The rich MarketingFooter only renders in the public route group, so before
 * this existed the explainer and legal pages - About, How it works, How
 * verification works, Privacy, Terms, Cookies, Data Protection - simply had no
 * route into them once you signed in. Same pages, same config
 * (`HELP_LINKS`), just a one-row treatment that suits an app chrome instead of
 * a landing page.
 *
 * `dockOffset` adds clearance for the fixed mobile ServicesDock, which would
 * otherwise sit on top of this.
 */
import Link from 'next/link';
import { SyncLogo } from '@/components/brand/sync-logo';
import { HELP_LINKS } from '@/config/footer-nav';
import { SITE } from '@/config/site';
import { cn } from '@/lib/utils';

export function AppFooter({ dockOffset = false }: { dockOffset?: boolean }) {
  return (
    <footer
      className={cn(
        'border-line/10 bg-panel/40 mt-auto border-t',
        dockOffset && 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0',
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
        <nav aria-label="Site information">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            {HELP_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-content-muted hover:text-accent-fg transition-colors"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-line/10 text-content-muted mt-6 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-content w-fit" aria-label={`${SITE.name} home`}>
            <SyncLogo height={16} />
          </Link>
          <p>
            {SITE.name} is operated by {SITE.legalName}. © {new Date().getFullYear()}.
          </p>
        </div>
      </div>
    </footer>
  );
}
