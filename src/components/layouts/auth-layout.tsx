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

        {/* NO AMBIENT COLOUR BLOBS HERE, and they are not coming back.
            Two blurred brand-coloured glows were tried, to give the glass
            something to refract. They caused both of the problems that came
            back: the green/warm wash across the card WAS those blobs showing
            through - not a CSS gradient - and, being absolutely positioned past
            this pane's edges (-bottom, -right) inside an `overflow-y-auto`
            container, they added scrollable area and made an otherwise
            short form scroll. The doodle behind is what the glass reads. */}
        {/* Ceramic glass.
            A flat tint plus blur alone reads as a slightly different rectangle.
            Three things make a pane look like a thick, glazed object:

            1. An INSET RIM - a bright hairline just inside the top edge and a
               dark one inside the bottom. This is the THICKNESS, and it is the
               single biggest difference from a coloured overlay: it is what
               makes the pane look like something you could pick up.
            2. A LARGE radius. Ceramic has no sharp corners; 2rem reads as a
               moulded object where 1rem reads as a UI card.
            3. Saturated blur, so the blobs above bleed through as COLOUR
               rather than grey.

            The fill is FLAT, deliberately. A gradient was tried and dropped -
            it tips the effect from a clean glaze towards a lit 3D surface, and
            the rim already supplies the light direction.

            One arbitrary shadow because the inset highlight, the inset floor
            and the cast shadow must compose in a single box-shadow; Tailwind's
            shadow utilities cannot express that stack. */}
        <div
          className="border-cream/12 bg-cream/8 w-full max-w-lg rounded-[2rem] border p-6 shadow-[inset_0_1px_0_0_rgba(244,241,232,0.28),inset_0_-1px_0_0_rgba(14,14,18,0.4),0_24px_60px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl backdrop-saturate-200 md:p-8"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
