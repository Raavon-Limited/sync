/**
 * AuthLayout - split-pane shell for login / signup / verify.
 *
 * The dark brand panel carries the page's heading (`eyebrow` + `title`), so it
 * is dynamic per route - "Sign up to Sync", "Log in to Sync", etc. On desktop
 * it's the full-height left column; on mobile it collapses to a band on top of
 * the form. Each auth page passes its own copy and renders its form as
 * `children`; the form pane fills its width (inputs are full-width).
 */
import Link from 'next/link';
import { SyncLogo } from '@/components/brand/sync-logo';
import { DoodleBackdrop } from '@/components/shared/doodle-backdrop';
import { SITE } from '@/config/site';

export function AuthLayout({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    // Locked to the viewport height - the page never scrolls. If a form is
    // taller than the viewport, only the form pane scrolls (the brand panel
    // stays put).
    <div className="bg-surface text-content flex h-dvh flex-col overflow-hidden md:grid md:grid-cols-2">
      {/* Brand + dynamic heading: top band on mobile, left column on desktop.
          `relative isolate` is what keeps the backdrop's -z-10 inside this
          panel instead of sliding behind the page. */}
      <aside className="bg-ink text-cream relative isolate flex shrink-0 flex-col gap-6 p-6 md:h-dvh md:justify-between md:gap-8 md:p-10">
        {/* Cream lines on Ink - the drawing reads as an outline here, which is
            the only way it can show at all on a black surface. */}
        <DoodleBackdrop tile={520} className="text-cream/9" />
        <Link href="/" className="text-cream w-fit" aria-label={`${SITE.name} home`}>
          <SyncLogo height={20} />
        </Link>
        <div>
          <p className="eyebrow text-lime">{eyebrow}</p>
          <h1 className="font-display mt-2 text-3xl leading-[1.05] tracking-tight md:text-section">
            {title}
          </h1>
          <p className="text-cream/70 mt-4 hidden max-w-md text-sm md:block">{SITE.description}</p>
        </div>
        <p className="text-cream/50 hidden text-xs md:block">
          © {new Date().getFullYear()} {SITE.legalName}
        </p>
      </aside>

      <main className="bg-surface-deep relative isolate flex flex-1 items-center justify-center overflow-y-auto p-6 md:h-dvh md:p-10">
        {/* Ink lines on the light pane, much fainter: this side has form
            fields on it, and a pattern that competes with an input is a
            legibility problem, not a texture. */}
        <DoodleBackdrop tile={520} className="text-ink/5 dark:text-cream/5" />
        <div className="w-full max-w-lg py-6">{children}</div>
      </main>
    </div>
  );
}
