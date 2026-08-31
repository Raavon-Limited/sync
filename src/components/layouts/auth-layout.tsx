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
          <h1 className="font-display md:text-section mt-2 text-3xl leading-[1.05] tracking-tight">
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

        {/* NO AMBIENT COLOUR BLOBS HERE, and they are not coming back.
            Two blurred brand-coloured glows were tried, to give the glass
            something to refract. They caused both of the problems that came
            back: the green/warm wash across the card WAS those blobs showing
            through - not a CSS gradient - and, being absolutely positioned past
            this pane's edges (-bottom, -right) inside an `overflow-y-auto`
            container, they added scrollable area and made an otherwise
            short form scroll. */}

        {/* A SOLID PANEL. The frosted-glass version of this card is gone, and
            the reason is worth keeping so it does not get rebuilt.

            It was `bg-cream/8` + `backdrop-blur-2xl backdrop-saturate-200` over
            an inset rim, and it produced a LIME BAND that flashed down the
            right-hand side of the form. It was never a gradient - grep the CSS
            and there is no lime gradient anywhere in the build - which is
            exactly why it was so hard to find.

            It is a backdrop-filter compositing artifact. A 40px blur over a
            full-height element is rasterised in TILES, and the tile seam shows
            as a hard vertical edge; `saturate(200%)` then doubles the chroma of
            whatever tiny hue difference lands either side of it, turning an
            invisible seam into a visible green one. It flashes rather than
            sits still because the tiles are re-rasterised on scroll, on focus,
            on keyboard open - which is also why it never showed up in a static
            review of the CSS.

            Blur radius, saturation and translucency all feed it, so the fix is
            to stop compositing a backdrop at all rather than to tune the
            numbers. An opaque panel cannot sample what is behind it.

            The doodle backdrop is untouched and still reads AROUND the card;
            what changed is that it no longer reads THROUGH it.

            The cast shadow stays: it is a plain drop shadow, it is what keeps
            the panel from floating ambiguously on the ink, and it is not part
            of the effect that was removed. */}
        <div className="border-cream/10 bg-panel w-full max-w-lg rounded-[2rem] border p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
