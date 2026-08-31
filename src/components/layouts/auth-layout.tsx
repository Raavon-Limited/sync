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
    // `dark` is forced, not inherited. Both halves are Ink now, so the form
    // side must use dark tokens even for a visitor whose theme is light -
    // otherwise its labels and inputs render ink-on-ink and vanish. `.dark` is
    // a plain class selector in globals.css, so applying it here re-scopes
    // every token inside this subtree and nothing else on the site moves.
    <div className="dark bg-ink text-cream flex h-dvh flex-col overflow-hidden md:grid md:grid-cols-2">
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

      {/* p-4 on mobile, not p-6: the card below adds its own p-6, and two
          24px insets on a 375px screen left the inputs in a 279px column. */}
      <main className="bg-ink relative isolate flex flex-1 items-center justify-center overflow-y-auto p-4 md:h-dvh md:p-10">
        {/* Cream lines, same as the brand panel - both sides are Ink now. */}
        <DoodleBackdrop tile={520} className="text-cream/8" />

        {/* Glass card.
            The first attempt used `bg-panel/60`, which on this surface is
            #17171c over #0e0e12 - a near-identical dark on dark. There was
            nothing to see THROUGH and 60% was close to opaque, so it read as a
            slightly different rectangle rather than glass.
            Real glass on a dark ground is a LIGHT film: a few percent of cream
            lifts the pane off the surface and lets the townscape carry the
            transparency, while the blur keeps it soft enough to read labels
            over. The two-tone border does the rest - brighter on top where a
            pane would catch light, dimmer below - which is what the eye reads
            as an edge rather than a drawn outline. */}
        <div
          className="border-cream/12 border-t-cream/25 bg-cream/6 w-full max-w-lg rounded-3xl border p-6 shadow-[0_16px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150 md:p-8"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
